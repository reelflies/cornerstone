// Puts the Fly size facet's values in hook order (ticket 33; R2, SEO-12).
//
// BigCommerce returns facet values in whatever order its API gives, and stock
// faceted-search.js replaces the facet HTML on every refresh, so the page module runs this on
// first render and again after each refresh and each "Show more" list.
//
// - It only moves each <li> as a whole. It never reads, builds or edits a facet href, so every
//   anchor keeps the facet context's URL, with _bc_fsnf=1 and rel="nofollow" (SEO-6, SEO-12).
// - Values it doesn't recognise keep their API order, after the known sizes (hook-order.js).
// - A list already in hook order is left untouched, so running it again changes nothing.

import { sortByHookOrder } from './hook-order';

// The sidebar's Fly Sizes list: stock multi.html puts the facet's name in data-facet.
export const FLY_SIZES_LISTS = '[data-facet="Fly Sizes"]';

// "(12)": the product count stock shows after each value.
const COUNT = /\(\s*[\d,]+\s*\)/g;

// The value a facet <li> stands for: its facet anchor's text, without the product count.
export function facetLabel(item) {
    const anchor = item.querySelector('[data-faceted-search-facet]') || item;
    return anchor.textContent.replace(COUNT, '').trim();
}

// Reorders the <li> children of `list` into hook order. Returns whether anything moved.
export function orderFacetList(list) {
    const items = Array.from(list.children).filter(child => child.tagName === 'LI');
    const sorted = sortByHookOrder(items, facetLabel);
    if (sorted.every((item, index) => item === items[index])) return false;

    // Moving a node takes focus off it, so give it back to the pill the shopper was on.
    const focused = list.ownerDocument.activeElement;
    const hadFocus = focused !== list && list.contains(focused);
    sorted.forEach(item => list.appendChild(item));
    if (hadFocus && list.ownerDocument.activeElement !== focused) focused.focus();
    return true;
}

// Orders every list under `root` that `selector` matches. Returns how many it reordered.
export default function orderFacets(root = document, selector = FLY_SIZES_LISTS) {
    return Array.from(root.querySelectorAll(selector)).filter(orderFacetList).length;
}
