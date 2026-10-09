// Each pattern's sizes in hook order (ticket 41; spec module 18; O17, UX-13; story 50).
//
// The server groups the cart's lines by pattern, in the order each was first added
// (components/reelflies/cart-lines.html), and lists each group's rows in the order the store
// gives, the order they were added. This puts the rows in hook order (hook-order.js, shared with
// ticket 33's facets): sizes 14, 12 and 16 added in that order read 12, 14, 16; 2/0 comes before
// 1/0, then 1, 2 and up; a row with no size keeps its place after the sizes.
//
// - rowOrder(sizes) is the pure part: the rows' sizes in page order, returning their indexes in
//   hook order.
// - sortCartRows(root) reorders every group's rows to match and marks each group sorted. Until
//   then a group with more than one row keeps its rows out of view at their full height
//   (_cart.scss), so sorting them moves nothing on the page. cart-page.js runs it on load and
//   after each re-render of the cart's content.

import { sortByHookOrder } from './hook-order';

export const GROUP = '[data-rf-cart-group]';
export const ROW = '[data-rf-cart-row]';
export const SORTED = 'data-rf-cart-sorted';

export function rowOrder(sizes) {
    return sortByHookOrder(sizes.map((_size, index) => index), index => sizes[index]);
}

export function sortCartRows(root = document) {
    root.querySelectorAll(GROUP).forEach(group => {
        const rows = [...group.querySelectorAll(ROW)];
        const order = rowOrder(rows.map(row => row.getAttribute('data-rf-size') || ''));
        if (order.some((index, position) => index !== position)) {
            // Moving a row takes focus off whatever in it had focus, so give it back.
            const focused = group.ownerDocument.activeElement;
            const hadFocus = focused !== group && group.contains(focused);
            order.forEach(index => rows[index].parentNode.appendChild(rows[index]));
            if (hadFocus && group.ownerDocument.activeElement !== focused) focused.focus();
        }
        group.setAttribute(SORTED, '');
    });
}
