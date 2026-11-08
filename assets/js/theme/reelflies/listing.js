// A listing's cards (components/reelflies/fly-listing.html, in every listing's grid), loaded on
// the listing templates through page-modules.js: start(context).
//
// - Each card's reserved line gets its size range ("Sizes 8–20") from one Storefront API read
//   for the whole grid (storefront.js), which also readies quick add's strips. The line holds
//   its place from the server, so nothing moves when the words arrive.
// - A card that links to its page to choose (quick add off) says "Choose one" where the choice
//   isn't a hook size (a leader's weight, an indicator's colour), not "Choose a size".
// - A product whose every size the read reports sold out (or whose one variant is) is marked as
//   the server marks a stock_level 0 card: "Sold out" on the line, and "View", a link to its
//   page, in place of "+ Add" (the owner's choice, 2026-11-07: nothing over the photo).
// - Again for the new cards after each filter, sort or page (size-filter.js sends CARDS_EVENT
//   from the refreshed grid).
// - The category's chips, at most two rows (category-chips.js).
// A failed read leaves the lines as the server sent them.

import { start as layChips } from './category-chips';
import { CARDS_EVENT, escapeHtml, sizeRange } from './card-html';
import { hookRank } from './hook-order';
import { productById, productsById } from './storefront';
import { word } from './words';

const GRID = '[data-rf-grid]';
const CARD = '.rf-fly[data-rf-product]';
const FILLED = 'data-rf-filled';

export function isSoldOut(product) {
    if (product.complex) return false;
    if (product.sizes.length) return product.sizes.every(size => !size.inStock);
    return Boolean(product.single) && !product.single.inStock;
}

export function markSold(card) {
    card.classList.add('is-sold');
    const line = card.querySelector('.rf-fly__sizes');
    if (line) line.textContent = word('sold_out_line');
    const add = card.querySelector('[data-rf-add]');
    if (!add) return;
    const link = card.ownerDocument.createElement('a');
    const name = card.querySelector('.rf-fly__name a');
    link.className = 'rf-add rf-add--link';
    link.href = name ? name.getAttribute('href') : '#';
    link.innerHTML = `${escapeHtml(word('view'))}<span class="is-srOnly">: ${escapeHtml(name ? name.textContent : '')}</span>`;
    const hadFocus = card.ownerDocument.activeElement === add;
    add.replaceWith(link);
    if (hadFocus) link.focus();
    const panel = card.querySelector('[data-rf-sizes]');
    if (panel) panel.remove();
}

export function fillCard(card, product) {
    if (card.classList.contains('is-sold')) return;
    if (isSoldOut(product)) {
        markSold(card);
        return;
    }
    const line = card.querySelector('.rf-fly__sizes');
    if (line && !line.textContent.trim()) line.textContent = sizeRange(product);
    const choose = card.querySelector('a.rf-add--link');
    if (choose && product.sizes.length && !product.sizes.every(size => hookRank(size.label) !== null)) {
        const label = choose.firstChild;
        if (label && label.nodeType === 3) label.textContent = word('choose_one');
    }
}

export function fill(root = document) {
    const cards = Array.from(root.querySelectorAll(`${GRID} ${CARD}:not([${FILLED}])`))
        .concat(root.matches && root.matches(GRID) ? Array.from(root.querySelectorAll(`${CARD}:not([${FILLED}])`)) : []);
    const unique = Array.from(new Set(cards));
    if (!unique.length) return Promise.resolve();
    unique.forEach(card => card.setAttribute(FILLED, ''));
    // one read for the whole grid; each card then takes its own product from the cache
    productsById(unique.map(card => card.dataset.rfProduct)).catch(() => {});
    return Promise.all(unique.map(card => productById(card.dataset.rfProduct)
        .then(product => fillCard(card, product), () => {})));
}

export function start(context = {}, doc = document) {
    layChips(context, doc);
    fill(doc);
    doc.addEventListener(CARDS_EVENT, event => fill(event.target));
}
