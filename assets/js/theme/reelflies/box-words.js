// What the box holds, in words: "15 flies, 6 patterns", "3 items" or "Your box is empty", by
// the brand rule (cart-count.js: flies and patterns only when every line is a fly brand's).

import * as box from './box';
import { escapeHtml, money } from './card-html';
import { countCart } from './cart-count';
import { counted, word } from './words';

export function boxWords(flyBrands) {
    const lines = box.lines().map(line => ({ productId: line.productId, quantity: line.quantity, brand: line.brand }));
    const count = countCart(lines, flyBrands);
    if (!count.units) return word('box_empty');
    if (count.flies) return `${counted(count.units, 'fly', 'flies')}, ${counted(count.products, 'pattern', 'patterns')}`;
    return counted(count.units, 'item', 'items');
}

// The free-shipping line the order line, its sheet and the cart page show, from the threshold in
// dollars (rf_ship_free_threshold) and the box's totals: the rule while the box is empty, the
// distance to it, or that this fly order ships free.
export function shippingHtml(free, token, totals) {
    if (!free) return '';
    if (!totals.units) return `${escapeHtml(word('ship_rule'))} <span class="rf-num">${money(free, token).replace(/\.00$/, '')}</span>.`;
    if (totals.flyAmount >= free) return `<strong>${escapeHtml(word('ship_free'))}</strong> ${escapeHtml(word('ship_free_after'))}`;
    return `<strong class="rf-num">${money(free - totals.flyAmount, token)}</strong> ${escapeHtml(word('ship_more'))}`;
}

export function meterHtml(free, totals) {
    return free ? `<div class="rf-box__meter" aria-hidden="true"><span style="width:${Math.min(100, (totals.flyAmount / free) * 100)}%"></span></div>` : '';
}
