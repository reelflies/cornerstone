// Quick order (DESIGN.md "Quick order"; the owner's goal, 2026-11-07: buying many sizes of many
// patterns, fast, from the listing), loaded on the listings with quick add through
// page-modules.js: start(context).
//
// The row above the grid (components/reelflies/listing-top.html) holds a two-way switch, Photos or
// Quick order. Quick order lays the page's patterns out as an order sheet: one row each, its
// photograph small, its name and price, then every size's quantity field in hook order. A field
// shows what the box holds of that size, and typing a number (or ArrowUp / ArrowDown) changes the
// box at once (quantity.js), so a shopper who knows the flies tabs down the sheet typing
// quantities, and the order line keeps the tally.
//
// - The rows are drawn from the server's cards (name, link, the price with its "/ fly") and the
//   Storefront API read the cards' size lines already made (storefront.js). The cards stay in the
//   page, hidden, so crawlers and Photos see them unchanged.
// - A sold-out size says so and has no field. A product with no options has one field; one the
//   sheet can't offer (more than one option) links to its own page.
// - The choice is remembered in this browser (localStorage; a private window simply starts on
//   Photos), and the sheet is drawn again after every filter, sort or page (CARDS_EVENT).

import { CARDS_EVENT, VIEW_EVENT, escapeHtml } from './card-html';
import { flyBrandList } from './cart-count';
import { sortByHookOrder } from './hook-order';
import { bindQuantities, followBox, syncQuantities } from './quantity';
import { metaAttributes, whatOf } from './size-picker';
import { productById, productsById } from './storefront';
import { word } from './words';

const KEY = 'rf-listing-view';
const GRID = '[data-rf-grid]';
const SWITCH = '[data-rf-view]';

let view = 'grid';

function remembered() {
    try {
        return window.localStorage.getItem(KEY) === 'list' ? 'list' : 'grid';
    } catch (error) {
        return 'grid';
    }
}

function remember(value) {
    try {
        window.localStorage.setItem(KEY, value);
    } catch (error) {
        // a private window: the choice lasts the page
    }
}

const icon = name => `<svg class="rf-icon" aria-hidden="true" focusable="false"><use href="#rf-i-${name}"></use></svg>`;

function fieldHtml(product, size) {
    const label = escapeHtml(size.label);
    if (!size.inStock) {
        return `<li class="rf-olist__cell is-sold"><span class="rf-olist__size">${label}</span><span class="rf-olist__none"><span aria-hidden="true">–</span><span class="is-srOnly">${escapeHtml(word('sold_short'))}</span></span></li>`;
    }
    const what = whatOf(size.label);
    return `<li class="rf-olist__cell" data-rf-qty-group><span class="rf-olist__size" aria-hidden="true">${label}</span>`
        + `<input class="rf-qty__input rf-olist__input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="" data-rf-blank aria-label="${escapeHtml(word('qty_label_of', { what, name: product.name }))}" data-rf-qty data-rf-product="${escapeHtml(product.id)}" data-rf-variant="${size.variantId}" data-rf-label="${label}" data-rf-what="${escapeHtml(what)}"></li>`;
}

function oneHtml(product) {
    const { single } = product;
    if (!single.inStock) return `<li class="rf-olist__cell is-sold"><span class="rf-olist__size">${escapeHtml(word('qty_short'))}</span><span class="rf-olist__none"><span aria-hidden="true">–</span><span class="is-srOnly">${escapeHtml(word('sold_short'))}</span></span></li>`;
    return `<li class="rf-olist__cell" data-rf-qty-group><span class="rf-olist__size" aria-hidden="true">${escapeHtml(word('qty_short'))}</span>`
        + `<input class="rf-qty__input rf-olist__input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="" data-rf-blank aria-label="${escapeHtml(word('qty_label_of', { what: word('qty_short'), name: product.name }))}" data-rf-qty data-rf-product="${escapeHtml(product.id)}" data-rf-variant="${single.variantId}" data-rf-label="" data-rf-what=""></li>`;
}

export function rowHtml(card, product) {
    const link = card.querySelector('.rf-fly__name a');
    const url = link ? link.getAttribute('href') : '#';
    const name = link ? link.textContent.trim() : '';
    const price = card.querySelector('.rf-fly__price');
    const photo = card.querySelector('.rf-fly__photo img');
    const src = (product && product.img.small) || (photo && photo.getAttribute('src')) || '';
    const thumb = src ? `<img src="${escapeHtml(src)}" alt="" width="72" height="48" loading="lazy" decoding="async">` : '';
    let sizes;
    if (product && !product.complex && product.sizes.length) {
        sizes = `<ul class="rf-olist__sizes" aria-label="${escapeHtml(word('sizes_of', { name }))}">${sortByHookOrder(product.sizes, size => size.label).map(size => fieldHtml(product, size)).join('')}</ul>`;
    } else if (product && !product.complex && product.single) {
        sizes = `<ul class="rf-olist__sizes" aria-label="${escapeHtml(name)}">${oneHtml(product)}</ul>`;
    } else {
        sizes = `<p class="rf-olist__elsewhere"><a class="rf-more" href="${escapeHtml(url)}">${escapeHtml(word('choose_on_page_short'))}${icon('arrow')}</a></p>`;
    }
    return `<li class="rf-olist__row"${product ? ` ${metaAttributes(product)}` : ''}>`
        + `<a class="rf-olist__thumb" href="${escapeHtml(url)}" tabindex="-1" aria-hidden="true">${thumb}</a>`
        + `<div class="rf-olist__what"><a class="rf-olist__name" href="${escapeHtml(url)}">${escapeHtml(name)}</a><p class="rf-olist__price">${price ? price.innerHTML : ''}</p></div>`
        + `${sizes}</li>`;
}

async function build(grid) {
    const cards = Array.from(grid.querySelectorAll('.rf-fly[data-rf-product]'));
    productsById(cards.map(card => card.dataset.rfProduct)).catch(() => {});
    const products = await Promise.all(cards.map(card => productById(card.dataset.rfProduct).catch(() => null)));
    let sheet = grid.parentNode.querySelector('[data-rf-olist]');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.className = 'rf-olist-wrap';
        sheet.setAttribute('data-rf-olist', '');
        grid.after(sheet);
    }
    sheet.innerHTML = `<p class="rf-olist__hint">${escapeHtml(word('olist_hint'))}</p><ul class="rf-olist">${cards.map((card, i) => rowHtml(card, products[i])).join('')}</ul>`;
    syncQuantities(sheet);
    return sheet;
}

function showSwitch() {
    document.querySelectorAll(SWITCH).forEach(group => {
        group.removeAttribute('hidden');
        group.removeAttribute('data-rf-view-pending'); // drawn invisible, in place, until now
        group.querySelectorAll('[data-rf-view-set]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.rfViewSet === view));
        });
    });
}

export async function setView(next) {
    view = next === 'list' ? 'list' : 'grid';
    showSwitch();
    const grid = document.querySelector(GRID);
    if (!grid) return;
    const listing = grid.closest('.rf-list') || document.body;
    listing.setAttribute('data-rf-view-now', view);
    if (view === 'list') {
        const sheet = await build(grid);
        if (view !== 'list') return;
        grid.hidden = true;
        sheet.hidden = false;
    } else {
        grid.hidden = false;
        const sheet = grid.parentNode.querySelector('[data-rf-olist]');
        if (sheet) sheet.hidden = true;
        grid.dispatchEvent(new CustomEvent(VIEW_EVENT, { bubbles: true, detail: { view } }));
    }
}

export function start(context = {}) {
    if (!document.querySelector(GRID)) return;
    bindQuantities(document, { flyBrands: flyBrandList(context.rfFlyBrands) });
    followBox(document);
    document.addEventListener('click', event => {
        const button = event.target.closest('[data-rf-view-set]');
        if (!button) return;
        remember(button.dataset.rfViewSet);
        setView(button.dataset.rfViewSet);
    });
    // a refresh draws a new grid and a new switch: show the switch and the sheet again
    document.addEventListener(CARDS_EVENT, event => {
        if (event.target.matches && event.target.matches(GRID)) setView(view);
    });
    setView(remembered());
}
