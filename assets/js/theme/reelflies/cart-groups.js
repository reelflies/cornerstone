// The cart's lines grouped by pattern (ticket 41; spec module 18; O17, UX-13; story 50).
//
// The store lists cart lines in the order they were added. The cart's markup
// (components/reelflies/cart-lines.html) renders one line per item, each with its own pattern
// heading, so the page reads right with no script. This module then groups them: one group per
// product, the patterns in the order each was first added, and each pattern's sizes in hook order
// (hook-order.js, shared with ticket 33's facets).
//
// - groupCartLines(lines) is the pure part: lines as { productId, size, unitPrice } in the
//   page's order, returning groups as { productId, lines: [indexes], pricesVary }.
// - applyCartGroups(root) reorders the rendered lines to match, marks each group's first and last
//   line (CSS shows the pattern heading on the first only), marks a group whose sizes are priced
//   differently (each size row then shows its own unit price), and sets data-rf-grouped on the
//   list. Until then the list is hidden (_cart.scss), so regrouping never moves the page after it
//   paints. cart.js calls it again after each re-render of the cart's content.

import { sortByHookOrder } from './hook-order';

export function groupCartLines(lines) {
    const byProduct = new Map();
    lines.forEach((line, index) => {
        if (!byProduct.has(line.productId)) byProduct.set(line.productId, []);
        byProduct.get(line.productId).push(index);
    });
    return [...byProduct.entries()].map(([productId, indexes]) => ({
        productId,
        lines: sortByHookOrder(indexes, index => lines[index].size),
        pricesVary: new Set(indexes.map(index => lines[index].unitPrice)).size > 1,
    }));
}

export function applyCartGroups(root = document) {
    const list = root.querySelector('[data-rf-cart-lines]');
    if (!list) return;
    const elements = [...list.querySelectorAll(':scope > [data-rf-cart-line]')];
    const lines = elements.map(element => ({
        productId: element.dataset.rfProductId,
        size: element.dataset.rfSize,
        unitPrice: element.dataset.rfUnitPrice,
    }));
    groupCartLines(lines).forEach(group => {
        group.lines.forEach((index, position) => {
            const element = elements[index];
            element.toggleAttribute('data-rf-group-first', position === 0);
            element.toggleAttribute('data-rf-group-last', position === group.lines.length - 1);
            element.toggleAttribute('data-rf-prices-vary', group.pricesVary);
            list.appendChild(element);
        });
    });
    list.setAttribute('data-rf-grouped', '');
}
