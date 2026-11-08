// The size picker (DESIGN.md "Size picker"; the owner's choice, 2026-11-07, in place of the
// tap-to-add strip): every choice of a product's one option as a row, biggest hook first, with a
// quantity stepper showing how many of it the box holds (quantity.js). Drawn under a card from
// "+ Add" (quick-add.js) and open on the product page (product-buy.js), whose rows the server draws
// first with the same markup (components/reelflies/product-picker-row.html; keep the two together).
//
// - A row: the hook number in condensed numerals beside its step bar, whose height steps with the
//   hook's place in hook order (6/0 tallest); a choice that isn't a hook size (a colour, a weight)
//   in words, with no bar. Then − / the quantity / +.
// - A sold-out row says so and has no stepper.
// - A product with no options is one row, "How many".

import { escapeHtml } from './card-html';
import { hookRank, sortByHookOrder } from './hook-order';
import { word } from './words';

// The step bar's share of its 20px, from 1 at 6/0 down to 0.18 at 24; 0 for a choice that isn't a
// hook size.
export function stepFor(label) {
    const rank = hookRank(label);
    if (rank === null) return 0;
    return Number(Math.max(0.14, Math.min(1, 1 - ((rank + 6) / 30) * 0.82)).toFixed(2));
}

export const isSize = label => hookRank(label) !== null;

// "size 12", or the choice's own words.
export const whatOf = label => (isSize(label) ? word('size_n', { size: label }) : label);

const icon = name => `<svg class="rf-icon" aria-hidden="true" focusable="false"><use href="#rf-i-${name}"></use></svg>`;

export function stepperHtml({
    productId, variantId, label, what,
}) {
    const name = escapeHtml(what);
    return '<span class="rf-qty" data-rf-qty-group>'
        + `<button class="rf-qty__btn" type="button" data-rf-qty-step="-1" aria-label="${escapeHtml(word(what ? 'qty_minus' : 'qty_minus_one', { what }))}" disabled>${icon('minus')}</button>`
        + `<input class="rf-qty__input" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" value="0" aria-label="${escapeHtml(word(what ? 'qty_label' : 'qty_label_one', { what }))}" data-rf-qty data-rf-product="${escapeHtml(productId)}" data-rf-variant="${escapeHtml(variantId)}" data-rf-label="${escapeHtml(label)}" data-rf-what="${name}">`
        + `<button class="rf-qty__btn" type="button" data-rf-qty-step="1" aria-label="${escapeHtml(word(what ? 'qty_plus' : 'qty_plus_one', { what }))}">${icon('plus')}</button>`
        + '</span>';
}

export function rowHtml(productId, size) {
    const label = escapeHtml(size.label);
    const k = stepFor(size.label);
    const bar = k ? `<span class="rf-sz__step" style="--rf-k:${k}"></span>` : '';
    const head = `<span class="rf-pick__size${k ? '' : ' rf-pick__size--word'}">${bar}<span class="rf-pick__label">${label}</span></span>`;
    if (!size.inStock) {
        return `<li class="rf-pick__row is-sold" data-rf-row data-rf-label="${label}">${head}<span class="rf-pick__sold">${escapeHtml(word('sold_out_row'))}</span></li>`;
    }
    return `<li class="rf-pick__row" data-rf-row data-rf-label="${label}">${head}${stepperHtml({
        productId, variantId: size.variantId, label: size.label, what: whatOf(size.label),
    })}</li>`;
}

// A product with no options: one row, "How many".
export function oneRowHtml(productId, variantId) {
    const label = word('quantity');
    return '<li class="rf-pick__row rf-pick__row--one" data-rf-row>'
        + `<span class="rf-pick__size rf-pick__size--word"><span class="rf-pick__label">${escapeHtml(label)}</span></span>`
        + `${stepperHtml({
            productId, variantId, label: '', what: '',
        })}</li>`;
}

export function rowsHtml(product) {
    if (product.one && !product.one.inStock) {
        return `<li class="rf-pick__row is-sold" data-rf-row><span class="rf-pick__size rf-pick__size--word"><span class="rf-pick__label">${escapeHtml(word('quantity'))}</span></span><span class="rf-pick__sold">${escapeHtml(word('sold_out_row'))}</span></li>`;
    }
    if (product.one) return oneRowHtml(product.id, product.one.variantId);
    return sortByHookOrder(product.sizes, size => size.label).map(size => rowHtml(product.id, size)).join('');
}

// The picker's foot: which sizes are sold out, or the reading order.
export function footWords(sizes) {
    const sold = sizes.filter(size => !size.inStock).map(size => size.label);
    if (sold.length && sold.length === sizes.length) return word('sold_all');
    if (!sizes.every(size => isSize(size.label))) {
        return sold.length ? word('choices_sold', { choices: sold.join(', ') }) : '';
    }
    if (sold.length === 1) return word('sold_one', { size: sold[0] });
    if (sold.length) return word('sold_many', { sizes: sold.join(', ') });
    return word('largest_first');
}

// The product's meta for the box's line, as data attributes on the picker or row (quantity.js).
export function metaAttributes(product) {
    return `data-rf-meta data-rf-name="${escapeHtml(product.name)}" data-rf-url="${escapeHtml(product.url)}" data-rf-price="${escapeHtml(product.price)}" data-rf-brand="${escapeHtml(product.brand)}" data-rf-img="${escapeHtml(product.img.small || product.img.card || '')}"`;
}
