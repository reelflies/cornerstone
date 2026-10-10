// Quick add on the cards (ticket 43; spec module 14; O13, UX-8, UX-21, BUILD-1, GEO-3, SCOPE-3;
// stories 29, 30, 32, 34, 67 and 68): what a tap on "+ Add" does. quick-add.js starts it on the
// listing pages with stencil-utils and jQuery; it takes them as `deps`, so a fixture page or a
// test can run it with stand-ins.
//
// - "+ Add" (quick-add-button.html) is a link to the product page. Started, it is a button
//   (role, aria-expanded, Space): one listener on the document, so cards a facet change or the
//   pager brings in work too. A click with a modifier key still opens the link.
// - A tap loads the product (deps.loadProduct: getById with quick-add-product.html), holding the
//   button busy, then asks stock for the stock left in each size (deps.optionChange), and
//   quick-add-route.js says where it goes:
//   - several Fly Sizes: the panel, built from the product's own markup: ticket 37's pills, the
//     sold-out ones marked as stock marks them (`unavailable`), which size-pills.js's watchPills
//     follows (aria-disabled, "(sold out)", the line naming them);
//   - one Fly Size: one fly added straight away (deps.addItem), confirmed under the button and in
//     ticket 25's live region, "Added 1 × size 14. 15 flies in your cart." with View cart; the
//     header told through stock's cart-quantity-update, then rf:cart-changed { source:
//     'quick-add', productId } (build pipeline 6.9). A failed add is said there too, and the
//     button is usable again;
//   - anything else: the product page (deps.navigate).
//   The panel opens once the product has loaded, so it never changes size as it loads; a
//   product that fails to load opens it with a link to the product page instead. Only the
//   latest tap answers: one overtaken by a tap on another "+ Add" does nothing when its answer
//   comes, so a slow product never replaces the panel opened since, or leaves the listing. A
//   tap on an "+ Add" still loading closes any panel and makes its pending tap the latest again.
// - The panel is a <dialog> under the button, inside the card (never a child of the listing,
//   which ticket 33's size-filter.js watches): below 801px a modal bottom sheet (showModal: the
//   page behind is inert, Tab stays inside, Escape closes, focus back on "+ Add"); from 801px a
//   popover by the button with no backdrop (Escape or a click outside closes it, focus back on
//   "+ Add"; focus moving out of it closes it and stays where it went, so a Tab lands on the
//   next card's control, and so does a Shift+Tab on past "+ Add"). It is named "Choose sizes of
//   {name}" (reelflies.quick_add.dialog). While it is open <html data-rf-open> holds `quick-add`
//   (open-state.js), which ticket 52's prompt reads. Its form is read, never submitted.
// - Its footer reads the cart (the Storefront Cart API) and counts it by the brand rule
//   (cart-count.js): "15 flies in your cart." with View cart.
//
// It imports no module that rf-add-flow's chunk has to itself: a module in two chunks is one
// webpack can't concatenate into either, and add-flow's chunk is at its budget (ticket 38). So
// the add's answer and the cart's read (add-flow.js's), the brand rule (cart-count.js's) and the
// confirmation (add-words.js's) are this module's own copies; quick-add.spec.js holds the last two
// to their originals. Its pills' script, size-pills.js, comes as its own chunk (deps.loadPills).

import quickAddRoute from './quick-add-route';
import { markClosed, markOpen } from './open-state';
import { announce } from './live-region';
import { CHANGED_EVENT } from './cart-events';

export const QUICK_ADD = '[data-rf-quick-add]';
export const TOKEN = 'quick-add';
// The class on the card's grid cell while its panel is open (_quick-add.scss).
export const HOST = 'rf-qa-host';
// Cornerstone's medium breakpoint, as _quick-add.scss.
const PHONE = 'not all and (min-width: 801px)';
const COUNT_MS = 4000; // how long the confirmation waits for the cart's count before it is said
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The words quick-add-product.html puts on its content, each with # or {name} where a value goes.
export function wordsOf(content) {
    const read = name => content.getAttribute(`data-rf-${name}`) || '';
    return {
        added: read('added'),
        size: read('size'),
        cartFly: read('cart-fly'),
        cartFlies: read('cart-flies'),
        cartItem: read('cart-item'),
        cartItems: read('cart-items'),
        cartEmpty: read('cart-empty'),
        viewCart: read('view-cart'),
        error: read('error'),
    };
}

// The product's options from the content's JSON (product.options), or null when it isn't there.
export function optionsOf(content) {
    try {
        const options = JSON.parse(content.getAttribute('data-rf-qa-options'));
        return Array.isArray(options) ? options : null;
    } catch {
        return null;
    }
}

// The add's answer is the cart's when it names the item it added; anything else failed. The
// store's own error is HTML, read as text in an inert document. (add-flow.js's rule; its chunk
// can't be shared, ticket 38.)
export function addAnswer(err, response, doc = document) {
    if (err) return { ok: false, message: '' };
    const data = response && typeof response === 'object' && response.data && typeof response.data === 'object' ? response.data : null;
    if (!data) return { ok: false, message: '' };
    if (data.error) {
        const parsed = new doc.defaultView.DOMParser().parseFromString(String(data.error), 'text/html');
        return { ok: false, message: parsed.body.textContent.trim() };
    }
    return data.cart_item ? { ok: true } : { ok: false, message: '' };
}

// cart-count.js's brand rule (Shaun, review-02): a cart counts in flies only when every line's
// brand is one of the channel's fly brands (rf_fly_brands), else in items.
export function flyBrandList(setting) {
    return String(setting ?? '').split(',').map(name => name.trim()).filter(Boolean);
}

export function countCart(items, flyBrands) {
    const units = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const products = new Set(items.map((line, index) => line.productId ?? `line-${index}`)).size;
    const flies = items.length > 0 && flyBrands.length > 0 && items.every(line => flyBrands.includes(String(line.brand ?? '').trim()));
    return { units, products, flies };
}

// add-words.js's confirmation: "Added 1 × size 14. 15 flies in your cart."
export function confirmation({ qty, choice, count }, words) {
    const added = words.added.replace('{qty}', qty).replace('{choice}', choice);
    if (!count) return added;
    const one = count.units === 1;
    const flies = one ? words.cartFly : words.cartFlies;
    const items = one ? words.cartItem : words.cartItems;
    return `${added} ${(count.flies ? flies : items).replace('#', count.units)}`;
}

// The cart's lines, from the Storefront Cart API, counted by the brand rule: null when the read
// fails, and nothing in it when there's no cart.
export async function readCartCount(flyBrands, doFetch) {
    const response = await doFetch('/api/storefront/carts?include=lineItems.physicalItems.options', { credentials: 'same-origin' });
    if (!response.ok) return null;
    const carts = await response.json();
    if (!Array.isArray(carts)) return null;
    const [cart] = carts;
    if (!cart) return { units: 0, products: 0, flies: false };
    const { physicalItems = [], digitalItems = [], giftCertificates = [] } = cart.lineItems || {};
    const items = [...physicalItems, ...digitalItems].map(line => ({ productId: line.productId, quantity: line.quantity, brand: line.brand }))
        .concat(giftCertificates.map(() => ({ productId: undefined, quantity: 1, brand: null })));
    return countCart(items, flyBrandList(flyBrands));
}

// "15 flies in your cart.", "Your cart is empty.", or nothing when the count isn't known.
export function cartLine(count, words) {
    if (!count) return '';
    if (!count.units) return words.cartEmpty;
    const one = count.units === 1;
    const flies = one ? words.cartFly : words.cartFlies;
    const items = one ? words.cartItem : words.cartItems;
    return (count.flies ? flies : items).replace('#', count.units);
}

// The panel's sizes as quick-add-route.js gives them: each sold-out one marked as stock's own
// scripts mark it, `unavailable` on the pill's label, so size-pills.js shows it struck and names
// it; a size a product rule hides (left out of `sizes`) hidden, as the product page hides it.
export function markSizes(content, sizes) {
    const group = content.querySelector('[data-rf-pills="size"]');
    if (!group) return;
    const byId = new Map(sizes.map(size => [String(size.id), size]));
    group.querySelectorAll('[data-product-attribute-value]').forEach(label => {
        const size = byId.get(label.getAttribute('data-product-attribute-value'));
        const wrapper = label.closest('.form-option-wrapper') || label;
        wrapper.hidden = !size;
        label.classList.toggle('unavailable', Boolean(size && size.soldOut));
    });
}

const within = (promise, ms) => new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(value => resolve(value), () => resolve(null)).finally(() => clearTimeout(timer));
});

const usable = element => element && element.isConnected;

// An icon from ticket 25's icon sheet, as components/reelflies/icon.html draws one.
function iconIn(doc, name) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    [['class', 'rf-icon'], ['width', '20'], ['height', '20'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.6'],
        ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true'], ['focusable', 'false']]
        .forEach(([attribute, value]) => svg.setAttribute(attribute, value));
    const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#rf-icon-${name}`);
    svg.appendChild(use);
    return svg;
}

// deps:
//   loadProduct(productId)      resolves to the HTML of quick-add-product.html, rejects on failure
//   optionChange(productId, query) resolves to stock's option-change answer ({ data }), or rejects
//   addItem(formData)           resolves to the add's answer, or rejects
//   loadPills()                 resolves to size-pills.js (its own chunk, rf-size-pills, as the
//                               product page loads it), for watchPills; the panel opens without
//                               it if it fails
//   readQuantity()              resolves to stock's cart summary count, or null
//   notify(units)               stock's cart-quantity-update, which the header's count hears
//   navigate(url)               goes to the product page
//   doFetch(url, init)          window.fetch, for the cart's read
export function startQuickAdd(doc, context = {}, deps = {}) {
    const view = doc.defaultView;
    const {
        loadProduct, optionChange, addItem,
        loadPills = () => Promise.resolve(null),
        readQuantity = () => Promise.resolve(null),
        notify = () => {},
        navigate = url => view.location.assign(url),
        doFetch = (...args) => view.fetch(...args),
    } = deps;
    const busy = new Set();
    // The latest tap's number: a tap whose answer comes after a newer one does nothing (tap).
    // Each "+ Add" keeps its newest tap's number, so a tap on it while it is still busy makes
    // that tap the latest again (onClick).
    let latest = 0;
    const taps = new WeakMap();
    const icon = name => iconIn(doc, name);
    const shell = {
        close: context.rfQuickAddClose || '',
        failed: context.rfQuickAddFailed || '',
        page: context.rfQuickAddPage || '',
    };
    let open = null; // { button, dialog, stopPills, modal }

    const upgrade = root => {
        const buttons = root.matches && root.matches(QUICK_ADD) ? [root] : Array.from(root.querySelectorAll ? root.querySelectorAll(QUICK_ADD) : []);
        buttons.forEach(button => {
            if (button.hasAttribute('role')) return;
            button.setAttribute('role', 'button');
            button.setAttribute('aria-haspopup', 'dialog');
            button.setAttribute('aria-expanded', 'false');
        });
    };

    const setBusy = (button, on) => {
        if (on) {
            busy.add(button);
            button.setAttribute('aria-disabled', 'true');
            button.classList.add('is-busy');
        } else {
            busy.delete(button);
            button.removeAttribute('aria-disabled');
            button.classList.remove('is-busy');
        }
    };

    const wrapOf = button => button.closest('[data-rf-qa-wrap]') || button.parentElement;

    // The line under the button: the add's confirmation with View cart, or its error.
    const showStatus = (button, text, { error = false, link = null } = {}) => {
        const wrap = wrapOf(button);
        let status = wrap.querySelector('[data-rf-qa-status]');
        if (!status) {
            status = doc.createElement('p');
            status.className = 'rf-qa-status';
            status.setAttribute('data-rf-qa-status', '');
            wrap.appendChild(status);
        }
        status.textContent = text;
        if (link) {
            const anchor = doc.createElement('a');
            anchor.href = link.href;
            anchor.textContent = link.text;
            status.append(' ', anchor);
        }
        status.classList.toggle('rf-qa-status--error', error);
    };

    const onKey = event => {
        if (!open) return;
        if (event.key === 'Escape' && !open.modal) {
            event.preventDefault();
            close({ focusBack: true }); // eslint-disable-line no-use-before-define
            return;
        }
        // The sheet is modal: Tab goes round its controls and never leaves it.
        if (event.key === 'Tab' && open.modal && open.dialog.contains(event.target)) {
            const controls = Array.from(open.dialog.querySelectorAll(FOCUSABLE)).filter(control => !control.closest('[hidden]'));
            if (!controls.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && event.target === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && event.target === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };

    // From 801px: a press outside the popover closes it. On a control, focus goes where the
    // press sends it; anywhere else it goes back to "+ Add".
    const onPointerDown = event => {
        if (!open || open.modal) return;
        const { button, dialog } = open;
        if (dialog.contains(event.target) || button.contains(event.target)) return;
        close({ focusBack: !event.target.closest(FOCUSABLE) }); // eslint-disable-line no-use-before-define
    };

    function close({ focusBack = false } = {}) {
        if (!open) return;
        const {
            button, dialog, host, stopPills, onFocusOut, onDialogClick, onCancel,
        } = open;
        open = null;
        if (stopPills) stopPills();
        dialog.removeEventListener('focusout', onFocusOut);
        button.removeEventListener('focusout', onFocusOut);
        dialog.removeEventListener('click', onDialogClick);
        dialog.removeEventListener('close', onCancel);
        doc.removeEventListener('pointerdown', onPointerDown, true);
        if (dialog.open) dialog.close();
        dialog.remove();
        if (host) host.classList.remove(HOST);
        markClosed(TOKEN, doc.documentElement);
        button.setAttribute('aria-expanded', 'false');
        if (focusBack && usable(button)) button.focus();
    }

    function openPanel(button, content, { sizes = [], pills: sizePills = null } = {}) {
        close();
        const dialog = doc.createElement('dialog');
        dialog.className = 'rf-qa-panel';
        dialog.setAttribute('data-rf-qa-panel', '');
        // Named "Choose sizes of Royal Coachman Streamer", as the reference names it; a product
        // that failed to load, by its heading.
        const name = content.getAttribute('data-rf-dialog-name');
        const title = content.querySelector('.rf-qa-title');
        if (name) dialog.setAttribute('aria-label', name);
        else if (title && title.id) dialog.setAttribute('aria-labelledby', title.id);
        dialog.appendChild(content);
        wrapOf(button).appendChild(dialog);
        // The grid's cell clips its card (stock's .productGrid .product): while the popover is
        // open the cell lets it out, over the cards after it.
        const host = button.closest('.product') || button.closest('article');
        if (host) host.classList.add(HOST);

        // The form is only read, never sent: a submit (an implicit one, or a button with no type,
        // as ticket 44's would be) would GET cart.php and leave the listing.
        const form = content.querySelector('[data-rf-qa-form]');
        if (form) form.addEventListener('submit', event => event.preventDefault());

        markSizes(content, sizes);
        const pills = content.querySelector('[data-rf-pills="size"]');
        const stopPills = pills && sizePills ? sizePills.watchPills(pills) : null;

        const modal = Boolean(view.matchMedia && view.matchMedia(PHONE).matches);
        // From 801px the popover opens to the button's right edge when it would run off the page.
        if (!modal) {
            const room = doc.documentElement.clientWidth - wrapOf(button).getBoundingClientRect().left;
            dialog.classList.toggle('rf-qa-panel--end', room < 336);
        }
        // Focus leaving the popover, or its "+ Add" once Shift+Tab has taken it back there, for
        // anything but the two of them closes it, and focus stays where it went.
        const onFocusOut = event => {
            if (!open || open.modal) return;
            const to = event.relatedTarget;
            if (to && !dialog.contains(to) && to !== button) close();
        };
        // A click on the sheet's backdrop lands on the dialog itself.
        const onDialogClick = event => {
            if (open && open.modal && event.target === dialog) close({ focusBack: true });
        };
        // Escape on the modal sheet: the browser closes it.
        const onCancel = () => close({ focusBack: true });
        dialog.addEventListener('focusout', onFocusOut);
        button.addEventListener('focusout', onFocusOut);
        dialog.addEventListener('click', onDialogClick);
        dialog.addEventListener('close', onCancel);

        open = {
            button, dialog, host, stopPills, modal, onFocusOut, onDialogClick, onCancel,
        };
        if (modal) dialog.showModal();
        else dialog.show();
        doc.addEventListener('pointerdown', onPointerDown, true);
        markOpen(TOKEN, doc.documentElement);
        button.setAttribute('aria-expanded', 'true');
        const closeButton = dialog.querySelector('[data-rf-qa-close]');
        if (closeButton) closeButton.focus();
        return dialog;
    }

    // A product that didn't load: the panel with the name, the reason, and the product page.
    function openFailed(button) {
        const card = button.closest('[data-name]');
        const content = doc.createElement('div');
        content.className = 'rf-qa-content';
        const head = doc.createElement('div');
        head.className = 'rf-qa-head';
        const title = doc.createElement('p');
        title.className = 'rf-qa-title';
        title.id = `rf-qa-title-${button.getAttribute('data-rf-quick-add')}`;
        title.textContent = card ? card.getAttribute('data-name') : '';
        const closeButton = doc.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'rf-qa-close';
        closeButton.setAttribute('data-rf-qa-close', '');
        const label = doc.createElement('span');
        label.className = 'is-srOnly';
        label.textContent = shell.close;
        closeButton.append(icon('close'), label);
        head.append(title, closeButton);
        const message = doc.createElement('p');
        message.className = 'rf-qa-failed';
        message.textContent = shell.failed;
        const link = doc.createElement('a');
        link.href = button.href;
        link.textContent = shell.page;
        message.append(' ', link);
        content.append(head, message);
        openPanel(button, content);
        announce(shell.failed, doc);
    }

    async function addOne(button, content, route) {
        const words = wordsOf(content);
        const productId = Number(button.getAttribute('data-rf-quick-add'));
        const form = new view.FormData();
        form.append('action', 'add');
        form.append('product_id', String(productId));
        form.append(`attribute[${route.optionId}]`, String(route.size.id));
        form.append('qty[]', '1');
        let answer;
        try {
            answer = addAnswer(null, await addItem(form), doc);
        } catch {
            answer = { ok: false, message: '' };
        }
        setBusy(button, false);
        if (!answer.ok) {
            const message = answer.message || words.error;
            showStatus(button, message, { error: true });
            announce(message, doc);
            return;
        }
        const choice = words.size.replace('{size}', route.size.label);
        const count = await within(readCartCount(context.rfFlyBrands, doFetch), COUNT_MS);
        const message = confirmation({ qty: 1, choice, count }, words);
        showStatus(button, message, { link: { href: (context.urls && context.urls.cart) || '/cart.php', text: words.viewCart } });
        announce(message, doc);
        // The header's count, by stock's event: from the cart's read, or, when that failed or was
        // late, from stock's cart summary. Then build pipeline 6.9's event, after stock's.
        const units = count ? count.units : await within(readQuantity(), COUNT_MS);
        if (typeof units === 'number' && units > 0) notify(units);
        doc.dispatchEvent(new view.CustomEvent(CHANGED_EVENT, { detail: { source: 'quick-add', productId } }));
    }

    // A tap answers only while it is the latest: one whose answer comes after a tap on another
    // "+ Add" opens nothing, adds nothing and goes nowhere, and its "+ Add" is usable again, so a
    // slow product never replaces the panel opened since, or leaves the listing under it. It is
    // checked after each wait before the tap acts; an add already sent still finishes. An
    // overtaken tap clears its "+ Add"'s busy state only while it is that button's newest tap,
    // never a newer tap's on the same button.
    async function tap(button) {
        latest += 1;
        const mine = latest;
        taps.set(button, mine);
        const overtaken = () => {
            if (mine === latest) return false;
            if (taps.get(button) === mine) setBusy(button, false);
            return true;
        };
        const productId = Number(button.getAttribute('data-rf-quick-add'));
        setBusy(button, true);
        // size-pills.js's chunk loads beside the product, for a panel's pills.
        const pillsModule = Promise.resolve().then(loadPills).catch(() => null);
        const status = wrapOf(button).querySelector('[data-rf-qa-status]');
        if (status) status.remove();
        let content = null;
        try {
            const holder = doc.createElement('div');
            holder.innerHTML = await loadProduct(productId);
            content = holder.querySelector('[data-rf-qa-content]');
        } catch {
            content = null;
        }
        if (overtaken()) return;
        const options = content && optionsOf(content);
        if (!options) {
            setBusy(button, false);
            if (usable(button)) openFailed(button);
            return;
        }
        // Stock's answer for the product with nothing chosen: the sizes in stock. Without it no
        // size reads as sold out, and an add that can't be made says so.
        const form = content.querySelector('[data-rf-qa-form]');
        const query = form ? new view.URLSearchParams(new view.FormData(form)).toString() : `product_id=${productId}`;
        let stock = null;
        try {
            const answer = await optionChange(productId, query);
            stock = answer && answer.data ? answer.data : null;
        } catch {
            stock = null;
        }
        if (overtaken() || !usable(button)) return;
        const route = quickAddRoute(options, stock);
        if (route.route === 'add') {
            await addOne(button, content, route);
            return;
        }
        setBusy(button, false);
        if (route.route === 'product-page') {
            navigate(button.href);
            return;
        }
        const pills = await pillsModule;
        if (overtaken() || !usable(button)) return;
        const dialog = openPanel(button, content, { sizes: route.sizes, pills });
        const count = await within(readCartCount(context.rfFlyBrands, doFetch), COUNT_MS);
        const line = dialog.querySelector('[data-rf-qa-count]');
        if (line && dialog.isConnected) line.textContent = cartLine(count, wordsOf(content));
    }

    const onClick = event => {
        if (open && open.dialog.contains(event.target) && event.target.closest('[data-rf-qa-close]')) {
            close({ focusBack: true });
            return;
        }
        const button = event.target.closest(QUICK_ADD);
        if (!button || event.defaultPrevented) return;
        // A new tab or window, as the link asks.
        if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        upgrade(button);
        if (open && open.button === button) {
            close({ focusBack: true });
            return;
        }
        close();
        // A tap on an "+ Add" still busy with its own tap starts nothing new: that tap is the
        // shopper's latest again, so it answers when its product does.
        if (busy.has(button)) {
            latest = taps.get(button);
            return;
        }
        tap(button);
    };

    // A link answers Enter by itself; a button answers Space too.
    const onButtonKey = event => {
        if (event.key !== ' ') return;
        const button = event.target.closest && event.target.closest(QUICK_ADD);
        if (!button) return;
        event.preventDefault();
        button.click();
    };

    upgrade(doc);
    const watcher = new view.MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
        if (node.nodeType === 1) upgrade(node);
    })));
    watcher.observe(doc.body, { childList: true, subtree: true });
    doc.addEventListener('click', onClick);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('keydown', onButtonKey);
    // The sheet and the popover each fit one width: crossing 801px closes the panel.
    const phone = view.matchMedia ? view.matchMedia(PHONE) : null;
    const onWidth = () => close();
    if (phone && phone.addEventListener) phone.addEventListener('change', onWidth);

    return {
        close,
        isOpen: () => Boolean(open),
        stop() {
            close();
            watcher.disconnect();
            doc.removeEventListener('click', onClick);
            doc.removeEventListener('keydown', onKey);
            doc.removeEventListener('keydown', onButtonKey);
            if (phone && phone.removeEventListener) phone.removeEventListener('change', onWidth);
        },
    };
}
