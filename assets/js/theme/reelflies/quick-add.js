// Quick add (DESIGN.md "Size picker"; the owner's goal, 2026-11-07: many sizes of many patterns,
// fast, from the listing): "+ Add" on a specimen card (components/reelflies/fly.html, card-html.js)
// picks the card up into the raking light and opens its size picker under it (size-picker.js):
// each size's quantity, biggest hook first, which goes straight into the box (quantity.js). On
// phones the picker rises as a sheet from the foot of the screen over a shale scrim, holding
// focus while it is open. Done, the close button, Escape, the scrim or a click elsewhere puts the
// card down and gives focus back to "+ Add". A card whose product has one size, or no options,
// says "Add 1" and adds one straight away.
//
// - Sizes come from storefront.js: the server's seed for the home page's best sellers, else one
//   GraphQL read, made as the pointer reaches "+ Add" or it takes focus, so the picker is usually
//   ready on click. A product the picker can't offer (more than one option) or a failed read
//   opens on a link to the fly's page instead.
// - Every card on the page keeps its reserved line in step with the box: the size range, or once
//   flies are in the box, which sizes (the longest form that fits), with the copper-lit ring.
//   rf_cart_state off leaves the line and ring out.
// - Every change is said in the polite live region, with the box's new count, and a refusal with
//   the store's words.
//
// Started with the page's context: start(context).

import * as box from './box';
import { boxWords as wordsFor } from './box-words';
import { flyBrandList } from './cart-count';
import { CARDS_EVENT, VIEW_EVENT, escapeHtml } from './card-html';
import { bump, fly } from './flight';
import { compareHookSizes, hookRank } from './hook-order';
import { announce } from './live-region';
import { bindQuantities, followBox, syncQuantities } from './quantity';
import { footWords, metaAttributes, rowsHtml } from './size-picker';
import { productById, seed } from './storefront';
import { word } from './words';

let settings = { cartState: true, flyBrands: [] };
let scrim = null;
let sheet = null; // { panel, card, home, next } while a picker is a sheet on <body>

const cardOf = el => el.closest('.rf-fly[data-rf-product]');
const linesFor = productId => box.lines().filter(line => line.productId === String(productId));
const isSheet = () => window.matchMedia('(max-width: 639px)').matches;
const icon = name => `<svg class="rf-icon" aria-hidden="true" focusable="false"><use href="#rf-i-${name}"></use></svg>`;

function pickerHtml(product) {
    const name = escapeHtml(product.name);
    const sized = product.sizes.length && product.sizes.every(size => hookRank(size.label) !== null);
    return `<div class="rf-pick rf-pick--panel" ${metaAttributes(product)}>
<div class="rf-pick__head"><p class="rf-pick__title" id="rf-pick-${product.id}">${name}</p><button class="rf-pick__close" type="button" data-rf-done aria-label="${escapeHtml(word('close'))}">${icon('close')}</button></div>
<p class="rf-pick__hint" id="rf-hint-${product.id}">${word(sized ? 'pick_hint' : 'pick_hint_choice')}</p>
<ul class="rf-pick__rows" aria-labelledby="rf-pick-${product.id}" aria-describedby="rf-hint-${product.id}">${rowsHtml(product)}</ul>
<div class="rf-sizes__foot"><span>${escapeHtml(footWords(product.sizes))}${sized ? ` ${escapeHtml(word('sizes_gloss'))}` : ''}${sized && settings.hookChart ? ` <a class="rf-more" href="${escapeHtml(settings.hookChart)}">${escapeHtml(word('sizes_help'))}</a>` : ''}</span><button class="rf-sizes__done" type="button" data-rf-done>${word('done')}</button></div>
</div>`;
}

function elsewhereHtml(product, url) {
    return `<p class="rf-sizes__hint">${word(product ? 'choose_on_page' : 'load_failed')}</p>
<div class="rf-sizes__foot"><a class="rf-more" href="${escapeHtml(url)}">${word('page_link')}</a><button class="rf-sizes__done" type="button" data-rf-done>${word('done')}</button></div>`;
}

function syncCard(card) {
    const productId = card.dataset.rfProduct;
    const lines = linesFor(productId).sort((a, b) => compareHookSizes(a.size, b.size));
    const n = lines.reduce((sum, line) => sum + line.quantity, 0);
    const tag = card.querySelector('[data-rf-inbox]');
    const lineEl = card.querySelector('.rf-fly__line');
    const show = settings.cartState && n > 0;
    card.classList.toggle('is-in', show);
    if (!tag || !lineEl) return;
    if (show) {
        const sized = lines.filter(line => line.size);
        const full = sized.map(line => `${line.quantity} × ${line.size}`).join(', ');
        const forms = sized.length
            ? [word('in_box_full', { list: full }), word('in_box_short', { list: sized.map(line => (line.quantity > 1 ? `${line.size} ×${line.quantity}` : line.size)).join(', ') }), word('in_box_count', { n })]
            : [word('in_box_count', { n })];
        tag.hidden = false;
        forms.some(text => {
            tag.textContent = text;
            return lineEl.scrollWidth <= lineEl.clientWidth + 1;
        });
        tag.title = sized.length ? word('in_box_full', { list: full }) : '';
    } else {
        tag.hidden = true;
        tag.textContent = '';
        tag.removeAttribute('title');
    }
}

export function syncCards(root = document) {
    root.querySelectorAll('.rf-fly[data-rf-product]').forEach(syncCard);
}

function closePicker(card, refocus) {
    if (sheet && sheet.card === card) {
        sheet.panel.classList.remove('rf-fly__sizes-panel--sheet');
        sheet.home.insertBefore(sheet.panel, sheet.next);
        sheet = null;
    }
    const panel = card.querySelector('[data-rf-sizes]');
    const button = card.querySelector('[data-rf-add]');
    if (panel) {
        panel.hidden = true;
        panel.removeAttribute('role');
        panel.removeAttribute('aria-modal');
        panel.removeAttribute('aria-labelledby');
        delete panel.dataset.rfReady;
    }
    card.classList.remove('is-open');
    if (scrim) scrim.hidden = true;
    document.documentElement.classList.remove('rf-sheet-open');
    if (button) {
        button.setAttribute('aria-expanded', 'false');
        if (refocus) button.focus();
    }
}

function closeAll(refocus) {
    document.querySelectorAll('.rf-fly.is-open').forEach(card => closePicker(card, refocus));
}

function showSheet() {
    if (!scrim) {
        scrim = document.createElement('div');
        scrim.className = 'rf-pick-scrim';
        scrim.addEventListener('click', () => closeAll(true));
        document.body.appendChild(scrim);
    }
    scrim.hidden = false;
    document.documentElement.classList.add('rf-sheet-open');
}

async function openPicker(card) {
    const panel = card.querySelector('[data-rf-sizes]');
    const button = card.querySelector('[data-rf-add]');
    const url = card.querySelector('.rf-fly__name a').getAttribute('href');
    document.querySelectorAll('.rf-fly.is-open').forEach(other => { if (other !== card) closePicker(other, false); });
    card.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-busy', 'true');
    let product = null;
    try {
        product = await productById(card.dataset.rfProduct);
    } catch (error) {
        product = null;
    }
    button.removeAttribute('aria-busy');
    if (!card.classList.contains('is-open')) return;
    const offered = product && !product.complex && product.sizes.length;
    panel.innerHTML = offered ? pickerHtml(product) : elsewhereHtml(product, url);
    panel.dataset.rfReady = '1';
    panel.hidden = false;
    syncQuantities(panel);
    if (isSheet()) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        if (offered) panel.setAttribute('aria-labelledby', `rf-pick-${product.id}`);
        sheet = {
            panel, card, home: panel.parentNode, next: panel.nextSibling,
        };
        panel.classList.add('rf-fly__sizes-panel--sheet');
        document.body.appendChild(panel);
        showSheet();
    } else {
        panel.classList.remove('is-flip');
        if (panel.getBoundingClientRect().right > document.documentElement.clientWidth - 8) panel.classList.add('is-flip');
        // the whole picker in view, clear of the order line (the page's scroll-padding)
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
    }
    const first = panel.querySelector('[data-rf-qty-step="1"]') || panel.querySelector('a, button');
    if (first) first.focus({ preventScroll: true });
}

function addOne(card, product) {
    const size = product.sizes[0] || null;
    const variantId = size ? size.variantId : product.single.variantId;
    const what = size ? word(hookRank(size.label) === null ? 'what_choice' : 'what_size', { size: size.label, choice: size.label, name: product.name }) : product.name;
    const meta = {
        name: product.name, size: size ? size.label : '', imageUrl: product.img.small || product.img.card, price: product.price, brand: product.brand, url: product.url,
    };
    box.change({
        productId: product.id, variantId, delta: 1, meta,
    }).then(() => {
        announce(word('added', { what, count: wordsFor(settings.flyBrands) }));
    }, error => {
        announce(`${word('add_failed', { what })} ${error.storeWords ? error.message : word('try_again')}`);
    });
    bump();
    fly(card, product.id);
}

async function onClick(event) {
    const addButton = event.target.closest('[data-rf-add]');
    const inSheet = sheet && sheet.panel.contains(event.target) ? sheet.card : null;
    const card = inSheet || (addButton ? cardOf(addButton) : cardOf(event.target));
    if (!card) {
        if (!(scrim && event.target === scrim)) closeAll(false);
        return;
    }
    if (addButton) {
        if (card.classList.contains('is-open')) {
            closePicker(card, true);
            return;
        }
        if (addButton.dataset.rfAdd !== 'one') {
            openPicker(card);
            return;
        }
        let product = null;
        try {
            product = await productById(card.dataset.rfProduct);
        } catch (error) {
            product = null;
        }
        if (product && product.single && !product.complex && product.sizes.length <= 1) {
            if (!product.single.inStock) {
                announce(word('sold_out', { name: product.name }));
                return;
            }
            addOne(card, product);
            return;
        }
        openPicker(card);
        return;
    }
    if (event.target.closest('[data-rf-done]')) closePicker(card, true);
}

// The sheet holds focus while it is open (phones).
function trapFocus(event) {
    if (event.key !== 'Tab' || !isSheet()) return;
    const panel = sheet && sheet.panel;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll('a[href], button:not([disabled]), input:not([disabled])'));
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function prefetch(event) {
    const button = event.target.closest && event.target.closest('[data-rf-add]');
    const card = button && cardOf(button);
    if (card) productById(card.dataset.rfProduct).catch(() => {});
}

export function start(context = {}) {
    // hookChart: the hook size chart's URL (theme setting rf_hook_chart_url), for the picker's foot
    settings = { cartState: context.rfCartState !== false, flyBrands: flyBrandList(context.rfFlyBrands), hookChart: typeof context.rfHookChart === 'string' ? context.rfHookChart.trim() : '' };
    const seedEl = document.querySelector('[data-rf-sizes-seed]');
    if (seedEl) {
        try {
            const best = JSON.parse(seedEl.textContent);
            seed(best && best.edges);
        } catch (error) {
            // no seed: the picker reads its sizes when it opens
        }
    }
    bindQuantities(document, { flyBrands: settings.flyBrands });
    followBox(document);
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', event => { if (event.pointerType === 'mouse') prefetch(event); });
    document.addEventListener('focusin', prefetch);
    document.addEventListener('keydown', event => {
        trapFocus(event);
        if (event.key !== 'Escape') return;
        const card = document.querySelector('.rf-fly.is-open');
        if (card && (card.contains(event.target) || sheet)) closePicker(card, true);
    });
    box.subscribe(() => syncCards());
    document.addEventListener(CARDS_EVENT, event => syncCards(event.target));
    // a line measured while Quick order hid the grid had no width, so it kept its longest form;
    // measure again when Photos returns
    document.addEventListener(VIEW_EVENT, event => { if (event.detail && event.detail.view === 'grid') syncCards(event.target); });
    syncCards();
}
