// The product page's add flow (ticket 38; spec module 15; O14, UX-10, BUILD-1, GEO-3; stories 34,
// 37, 39, 41, 42, 43, 67 and 68), loaded on the product templates through page-modules.js.
//
// Stock product-details.js still adds through utils.api.cart.itemAdd, so its analytics events
// keep firing. This adds, around it:
//
// - The button's label: "Choose a size" until a size is chosen on a product with several, then
//   "Add 3 to cart", following the stepper (add-words.js). The sticky phone bar says the same.
// - Before the add (capture listeners, so no hook): with no size chosen, "Choose a fly size
//   first." in the status line and the live region, and focus on the first in-stock pill; with a
//   sold-out size chosen, "Size 14 is sold out. Choose another size.", and no cart request either
//   way. It checks on the button's click, which comes before the browser's own check of the
//   required options (that check would stop the submit unseen), and again on submit.
// - The confirmation names every chosen option: the size, then the rest in the page's order, a
//   swatch by its title, a select by its option's text.
// - addFinished, which stock's add callback calls first (its hook in product-details.js): the
//   button usable again and the overlay gone; a failure (an error, or an answer that isn't the
//   cart's) shown in the status line and the live region; a success confirmed in place, "Added
//   3 × size 14. 15 flies in your cart." with View cart, and no modal. The count reads the cart
//   (the Storefront Cart API) by cart-count.js's brand rule, and the header's count hears the
//   stock cart-quantity-update event. Quick view keeps stock's modal (ticket 43 replaces it).
// - The sticky bar (sticky-add.html) below 801px, once the main button has scrolled out of view:
//   the choice and the same button. Adding from it confirms in the bar for about 4 seconds, with
//   focus kept in the bar. While it shows, --sticky-h on the root is its height, which ticket 52's
//   card sits above and the page's scroll padding matches.
//
// Every message goes to ticket 25's live region after the visible line renders; the line has no
// role, and focus stays on the button that was used.

import { announce } from './live-region';
import { buttonLabel, confirmation, stickyText } from './add-words';
import { countCart, flyBrandList } from './cart-count';
import { guardedCallback } from './guarded-api';
import { setAddHandlers } from './add-bridge';

export const ADD = '[data-rf-add]';
const SIZE_GROUP = '[data-rf-pills="size"]'; // ticket 37's marker on the size option's pills
const OPTION_FIELDS = '[data-product-option-change] .form-field';
const BUTTON = '#form-action-addToCart';
const STICKY = '[data-rf-sticky-add]';
const PHONE = 'not all and (min-width: 801px)'; // Cornerstone's medium breakpoint, as _add-flow.scss
const BAR_MS = 4000;

const DEFAULT_NOTIFY = units => {
    if (window.jQuery) window.jQuery('body').trigger('cart-quantity-update', units);
};

// The words the template puts on [data-rf-add], each with # or {name} where a value goes.
export function wordsOf(element) {
    const read = name => element.getAttribute(`data-rf-${name}`) || '';
    return {
        choose: read('choose'),
        add: read('add-label'),
        chooseFirst: read('choose-first'),
        soldOut: read('sold-out'),
        added: read('added'),
        size: read('size'),
        cartFly: read('cart-fly'),
        cartFlies: read('cart-flies'),
        cartItem: read('cart-item'),
        cartItems: read('cart-items'),
        viewCart: read('view-cart'),
        error: read('error'),
        noSize: read('no-size'),
        sizeAnd: read('size-and'),
        one: read('one-fly'),
        many: read('many-flies'),
        quantity: read('quantity'),
    };
}

// A chosen radio's words: a pill's value, or a swatch's title, its label having no text.
function valueOf(radio) {
    const label = radio.labels && radio.labels[0];
    if (!label) return '';
    const variant = label.querySelector('.form-option-variant');
    const text = variant ? variant.textContent.trim() || variant.getAttribute('title') || '' : '';
    return (text || label.textContent).trim();
}

// What the form holds now: whether it needs a size, the size chosen, whether that size is sold
// out, the other choices, and the quantity.
export function choiceOf(form) {
    const sizeGroup = form.querySelector(SIZE_GROUP);
    const radios = sizeGroup ? Array.from(sizeGroup.querySelectorAll('input[type="radio"]')).filter(radio => radio.value) : [];
    const checked = radios.find(radio => radio.checked);
    // Every other option's chosen value, in the page's order: pills, swatches or a select.
    const others = Array.from(form.querySelectorAll(OPTION_FIELDS))
        .filter(field => !field.matches(SIZE_GROUP) && !field.querySelector(SIZE_GROUP))
        .map(field => {
            const radio = Array.from(field.querySelectorAll('input[type="radio"]')).find(input => input.checked && input.value);
            if (radio) return valueOf(radio);
            const select = field.querySelector('select');
            return select && select.value ? select.options[select.selectedIndex].text.trim() : '';
        })
        .filter(Boolean);
    const qty = Math.max(1, parseInt((form.querySelector('[name="qty[]"]') || {}).value, 10) || 1);
    return {
        needsSize: radios.length > 1,
        chosen: checked ? valueOf(checked) : '',
        soldOut: Boolean(checked && checked.getAttribute('aria-disabled') === 'true'),
        firstInStock: radios.find(radio => radio.getAttribute('aria-disabled') !== 'true') || radios[0] || null,
        others,
        qty,
    };
}

function showStatus(root, text, { error = false, link = null } = {}) {
    const status = root.querySelector('[data-rf-add-status]');
    if (!status) return;
    status.textContent = text;
    if (link) {
        const anchor = status.ownerDocument.createElement('a');
        anchor.href = link.href;
        anchor.textContent = link.text;
        status.append(' ', anchor);
    }
    status.classList.toggle('rf-add-status--error', error);
    status.hidden = false;
}

// The add's answer is the cart's when it names the item it added; anything else failed.
export function addAnswer(err, response) {
    if (err) return { ok: false, message: '' };
    const data = response && typeof response === 'object' && response.data && typeof response.data === 'object' ? response.data : null;
    if (!data) return { ok: false, message: '' };
    if (data.error) {
        const holder = document.createElement('div');
        holder.innerHTML = data.error;
        return { ok: false, message: holder.textContent.trim() };
    }
    return data.cart_item ? { ok: true } : { ok: false, message: '' };
}

// The cart's lines, from the Storefront Cart API, as cart-count.js counts them.
export async function readCartCount(flyBrands, doFetch = window.fetch) {
    const response = await doFetch('/api/storefront/carts?include=lineItems.physicalItems.options', { credentials: 'same-origin' });
    if (!response.ok) return null;
    const [cart] = await response.json();
    if (!cart) return null;
    const { physicalItems = [], digitalItems = [], giftCertificates = [] } = cart.lineItems || {};
    const items = [...physicalItems, ...digitalItems].map(line => ({ productId: line.productId, quantity: line.quantity, brand: line.brand }))
        .concat(giftCertificates.map(() => ({ productId: undefined, quantity: 1, brand: null })));
    return countCart(items, flyBrandList(flyBrands));
}

export function createAddFlow(root, context = {}, {
    doc = document, notify = DEFAULT_NOTIFY, doFetch = (...args) => window.fetch(...args),
} = {}) {
    const form = root.closest('form') || root.querySelector('form');
    const words = wordsOf(root);
    const button = root.querySelector(BUTTON);
    const sticky = doc.querySelector(STICKY);
    const cartUrl = (context.urls && context.urls.cart) || '/cart.php';
    let fromSticky = false;
    let barTimer = null;
    let placeSticky = () => {};

    const sync = () => {
        const choice = choiceOf(form);
        const label = buttonLabel(choice, words);
        if (button && button.value !== label && !button.disabled) button.value = label;
        if (sticky) {
            const text = sticky.querySelector('[data-rf-sticky-text]');
            const stickyButton = sticky.querySelector('[data-rf-sticky-button]');
            if (text && !sticky.hasAttribute('data-rf-added')) text.textContent = stickyText(choice, words);
            if (stickyButton) stickyButton.textContent = label;
        }
    };

    // Nothing is added without a size, or with a sold-out one: says why, and with no size puts
    // focus on the first size it can sell. Returns whether it stopped the add.
    const stopped = () => {
        const choice = choiceOf(form);
        let message = '';
        if (choice.needsSize && !choice.chosen) message = words.chooseFirst;
        else if (choice.soldOut) message = words.soldOut.replace('{size}', choice.chosen);
        if (!message) return false;
        showStatus(root, message, { error: true });
        announce(message, doc);
        if (choice.needsSize && !choice.chosen && choice.firstInStock) {
            if (choice.firstInStock.scrollIntoView) choice.firstInStock.scrollIntoView({ block: 'center' });
            choice.firstInStock.focus({ preventScroll: true });
        }
        return true;
    };
    const stop = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
    };
    // The button's click (Enter in a field clicks it too), before the browser checks the required
    // options; and submit, before stock's handler, for a submit that comes another way.
    const onClick = event => {
        if (event.target.closest(BUTTON) && stopped()) stop(event);
    };
    const onSubmit = event => {
        if (event.target === form && stopped()) stop(event);
    };

    const showBarAdded = text => {
        if (!sticky) return;
        const textBox = sticky.querySelector('[data-rf-sticky-text]');
        const stickyButton = sticky.querySelector('[data-rf-sticky-button]');
        const view = sticky.querySelector('[data-rf-sticky-view]');
        sticky.setAttribute('data-rf-added', '');
        if (textBox) textBox.textContent = text;
        if (view) {
            view.hidden = false;
            view.focus({ preventScroll: true });
        }
        if (stickyButton) stickyButton.hidden = true;
        clearTimeout(barTimer);
        // data-rf-bar-ms holds the look longer for the screenshot state (states.mjs).
        barTimer = setTimeout(() => {
            const hadFocus = view && doc.activeElement === view;
            sticky.removeAttribute('data-rf-added');
            placeSticky();
            if (view) view.hidden = true;
            if (stickyButton) {
                stickyButton.hidden = false;
                if (hadFocus) stickyButton.focus({ preventScroll: true });
            }
            sync();
        }, Number(sticky.getAttribute('data-rf-bar-ms')) || BAR_MS);
    };

    // Stock's add callback calls this first (through add-bridge.js). `form` is the form that
    // added: the page's, or Quick view's, whose own status line takes its failure.
    const finished = async (err, response, {
        label, overlay, quickView = false, form: from = form,
    } = {}) => {
        const answer = addAnswer(err, response);
        if (answer.ok && quickView) return false;
        const fromButton = from.querySelector(BUTTON);
        const wasSticky = fromSticky;
        fromSticky = false;
        if (fromButton) {
            fromButton.disabled = false;
            if (label) fromButton.value = label;
            // Stock disables the button while it adds, which drops focus to the page: give it back.
            const active = doc.activeElement;
            if (!wasSticky && (!active || active === doc.body)) fromButton.focus({ preventScroll: true });
        }
        if (overlay && overlay.hide) overlay.hide();
        if (!answer.ok) {
            const message = answer.message || words.error;
            showStatus(from.querySelector(ADD) || root, message, { error: true });
            announce(message, doc);
            sync();
            return true;
        }
        const choice = choiceOf(form);
        const choiceText = [choice.chosen ? words.size.replace('{size}', choice.chosen) : '', ...choice.others].filter(Boolean).join(', ')
            || (context.productTitle || '');
        let count = null;
        try {
            count = await readCartCount(context.rfFlyBrands, doFetch);
        } catch (error) {
            count = null;
        }
        if (count) notify(count.units);
        const message = confirmation({ qty: choice.qty, choice: choiceText, count }, words);
        showStatus(root, message, { link: { href: cartUrl, text: words.viewCart } });
        announce(message, doc);
        if (wasSticky) showBarAdded(words.added.replace('{qty}', choice.qty).replace('{choice}', choiceText).replace(/\.$/, ''));
        sync();
        return true;
    };

    // The bar shows below 801px once the main button has scrolled out above the screen, and sets
    // --sticky-h on the root to its height while it shows, 0 when it doesn't. It reads the button's
    // place on each scroll (once a frame) rather than through an IntersectionObserver, which says
    // nothing when a jump takes the button from above the screen to below it without crossing it:
    // a restored scroll position, or a link to the reviews.
    const watchSticky = () => {
        const view = doc.defaultView;
        if (!sticky || !button || !view || !view.matchMedia) return;
        const phone = view.matchMedia(PHONE);
        const frame = view.requestAnimationFrame ? view.requestAnimationFrame.bind(view) : run => view.setTimeout(run, 16);
        let queued = false;
        placeSticky = () => {
            queued = false;
            const past = button.getBoundingClientRect().bottom < 0;
            const shown = phone.matches && (past || sticky.hasAttribute('data-rf-added'));
            sticky.hidden = !shown;
            doc.documentElement.style.setProperty('--sticky-h', shown ? `${sticky.offsetHeight}px` : '0px');
        };
        const queue = () => {
            if (queued) return;
            queued = true;
            frame(placeSticky);
        };
        view.addEventListener('scroll', queue, { passive: true });
        view.addEventListener('resize', queue);
        if (phone.addEventListener) phone.addEventListener('change', queue);
        placeSticky();
    };

    form.addEventListener('change', sync);
    form.addEventListener('click', onClick, true);
    form.addEventListener('click', () => setTimeout(sync, 0));
    doc.addEventListener('submit', onSubmit, true);
    watchSticky();

    if (sticky) {
        sticky.querySelector('[data-rf-sticky-button]')?.addEventListener('click', () => {
            // requestSubmit checks the required options first, so the bar says why first.
            if (stopped()) return;
            fromSticky = true;
            if (typeof form.requestSubmit === 'function') form.requestSubmit(button || undefined);
            else button.click();
        });
    }
    // An option change that failed: said so, and the pills stay usable.
    const optionFailed = (err, response) => {
        let failed = false;
        guardedCallback(() => {}, message => {
            failed = true;
            const text = message || words.error;
            showStatus(root, text, { error: true });
            announce(text, doc);
        }, { fallback: words.error })(err, response);
        return failed;
    };

    sync();
    return { sync, finished, optionFailed };
}

export default {
    // deps: notify and doFetch, for tests (createAddFlow's defaults otherwise).
    load(context, doc = document, deps = {}) {
        const root = doc.querySelector(`.productView:not(.productView--quickView) ${ADD}`) || doc.querySelector(ADD);
        if (!root) return;
        const flow = createAddFlow(root, context, { doc, ...deps });
        setAddHandlers({
            // Stock's add callback is synchronous: say at once whether the flow takes the answer.
            add(err, response, options = {}) {
                const quickView = Boolean(options.form && options.form.closest('.quickView'));
                if (addAnswer(err, response).ok && quickView) return false;
                flow.finished(err, response, { ...options, quickView });
                return true;
            },
            option: flow.optionFailed,
        });
    },
};
