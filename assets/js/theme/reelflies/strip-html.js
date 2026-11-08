// The size strip's cells (DESIGN.md "Size Strip"), drawn the same under a card (quick-add.js) and
// open on the product page (product-strip.js; components/reelflies/product-strip.html draws them
// first on the server, with the same markup).
//
// - A cell is the choice in condensed numerals over a step bar whose height steps with the hook's
//   place in hook order, 6/0 tallest; a choice that isn't a hook size (a colour, a weight) has no
//   bar and its own words ("Add one: Olive").
// - Once its choice is in the box it takes a copper count and a "−1" beneath. Every cell keeps
//   that row, so the strip never changes shape as flies go in.
// - A sold-out choice can't be chosen; the foot names the sold-out sizes.

import { escapeHtml } from './card-html';
import { hookRank } from './hook-order';
import { word } from './words';

export const RESERVED = '<span class="rf-sz__minus rf-sz__minus--none" aria-hidden="true"></span>';

// The step bar's share of its 20px, from 1 at 6/0 down to 0.18 at 24; 0 for a choice that isn't a
// hook size.
export function stepFor(label) {
    const rank = hookRank(label);
    if (rank === null) return 0;
    return Number(Math.max(0.14, Math.min(1, 1 - ((rank + 6) / 30) * 0.82)).toFixed(2));
}

const isSize = label => hookRank(label) !== null;

function wordsFor(label, n) {
    if (isSize(label)) {
        return {
            add: n ? word('size_label_in', { size: label, n }) : word('size_label', { size: label }),
            sold: word('size_sold', { size: label }),
            minus: word('minus_label', { size: label }),
        };
    }
    return {
        add: n ? word('choice_label_in', { choice: label, n }) : word('choice_label', { choice: label }),
        sold: word('choice_sold', { choice: label }),
        minus: word('choice_minus', { choice: label }),
    };
}

// A cell's contents (the <li>'s inside), with n of its choice in the box.
export function cellInner(size, n = 0) {
    const label = escapeHtml(size.label);
    const k = stepFor(size.label);
    const step = k ? `<span class="rf-sz__step" style="--rf-k:${k}"></span>` : '<span class="rf-sz__step rf-sz__step--none"></span>';
    const words = wordsFor(size.label, n);
    if (!size.inStock) {
        return `<button class="rf-sz__btn" type="button" disabled aria-label="${escapeHtml(words.sold)}">${step}<span>${label}</span></button>${RESERVED}`;
    }
    const count = n ? `<span class="rf-sz__count">${n}</span>` : '';
    const minus = n
        ? `<button class="rf-sz__minus" type="button" data-rf-minus="${label}" data-rf-variant="${size.variantId}" aria-label="${escapeHtml(words.minus)}">${word('minus')}</button>`
        : RESERVED;
    return `<button class="rf-sz__btn${n ? ' has-count' : ''}" type="button" data-rf-size="${label}" data-rf-variant="${size.variantId}" aria-label="${escapeHtml(words.add)}">${step}<span>${label}</span>${count}</button>${minus}`;
}

export function cellHtml(size, n = 0) {
    return `<li class="rf-sz">${cellInner(size, n)}</li>`;
}

// The strip's foot: which choices are sold out, or the reading order.
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
