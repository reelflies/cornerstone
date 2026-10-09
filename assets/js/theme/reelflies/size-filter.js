// The Fly size filter's behaviour (ticket 33; R2, SEO-6; stories 23, 25 and 68), loaded on the
// listing templates through page-modules.js.
//
// Stock faceted-search.js does the filtering: a facet link's click loads the listing and the
// sidebar again through the storefront API, and category.js's callback replaces both. This adds:
//
// - Hook order: the Fly Sizes pills (facet-order.js) on load, after every refresh, and in the
//   "Show more" modal each time it fills.
// - After each refresh, focus goes back to the control the shopper used: the same facet value
//   (in the sidebar, for one picked in "Show more" too), or the sort box, or else the count.
//   Focus still on the page is left where it is. Then the listing's count (listing-top.html) is
//   announced through the shared live region, unless focus went to the count, which says it.
// - A refresh is a batch that removes children the listing already had, as stock's replacement
//   does; an element added there (tickets 42 and 43 work in the listing), even one added and
//   removed again in the same task, is not one.
// - A size picked in "Show more" refreshes while the modal is still closing, and its focus trap
//   would pull focus back in. Focus waits until Foundation's reveal has hidden the modal
//   (display: none, set just before its closed event, so it is seen after stock's handlers have
//   released the trap and sent focus to "Show more", which the refresh has replaced).
// - Filter, on phones (listing-top.html): it clicks stock's facet toggle, which _facets.scss hides
//   there, so stock keeps its own record of what is open across refreshes. It opens the Fly Sizes
//   facet if stock closed it, and moves focus to the first pill.
// - It never reads, builds or edits a facet href (SEO-6).

import { announce } from './live-region';
import orderFacets, { facetLabel } from './facet-order';

export const LISTING = '#product-listing-container';
export const COUNT = '[data-rf-list-count]';
export const FILTER_BUTTON = '[data-rf-filter-button]';
const FACET_LINK = '[data-faceted-search-facet]';
const SORT = '[data-sort-by] select';
const STOCK_TOGGLE = '#facetedSearch .facetedSearch-toggle';
const PANEL = 'facetedSearch-navList';
const SIZES_TOGGLE = '.rf-size-facet .accordion-navigation';
const FIRST_PILL = '.rf-size-pill';
const MODAL = 'modal';
const FACET_LISTS = '#facetedSearch [data-facet]';

// What the shopper last used to refresh the listing, so focus can go back to it.
export function controlUsed(target) {
    const link = target.closest(FACET_LINK);
    if (link) {
        const list = link.closest(`${FACET_LISTS}, #${MODAL} [data-facet]`);
        return list ? { facet: list.getAttribute('data-facet'), label: facetLabel(link) } : { other: true };
    }
    return target.closest(SORT) ? { sort: true } : null;
}

function findFacetLink(doc, { facet, label }) {
    const list = Array.from(doc.querySelectorAll(FACET_LISTS))
        .find(element => element.getAttribute('data-facet') === facet);
    const item = list && Array.from(list.children).find(child => facetLabel(child) === label);
    return item ? item.querySelector(FACET_LINK) : null;
}

// Returns what it focused, or null when focus stayed where it was.
export function restoreFocus(doc, used) {
    const active = doc.activeElement;
    if (active && active !== doc.body && active.isConnected && !active.closest(`#${MODAL}`)) return null;
    let target = null;
    if (used && used.facet) target = findFacetLink(doc, used);
    if (used && used.sort) target = doc.querySelector(SORT);
    target = target || doc.querySelector(COUNT);
    if (target) target.focus({ preventScroll: true });
    return target;
}

export function syncFilterButton(doc) {
    const panel = doc.getElementById(PANEL);
    const open = Boolean(panel && panel.classList.contains('is-open'));
    doc.querySelectorAll(FILTER_BUTTON).forEach(button => button.setAttribute('aria-expanded', String(open)));
    return open;
}

export function toggleFilters(doc) {
    const toggle = doc.querySelector(STOCK_TOGGLE);
    if (!toggle) return;
    toggle.click();
    if (!syncFilterButton(doc)) return;
    // Stock closes every facet when the panel starts hidden, as it does on phones
    // (faceted-search.js:80-86), so the panel would open onto a closed Fly Sizes heading.
    const panel = doc.getElementById(PANEL);
    const sizes = panel.querySelector(SIZES_TOGGLE);
    if (sizes && !sizes.classList.contains('is-open')) sizes.click();
    const first = panel.querySelector(FIRST_PILL) || panel.querySelector('a[href], button');
    if (first) first.focus();
}

// After stock has replaced the listing and the sidebar.
export function afterRefresh(doc, used) {
    orderFacets(doc);
    syncFilterButton(doc);
    const count = doc.querySelector(COUNT);
    const settle = () => {
        const focused = restoreFocus(doc, used);
        if (count && focused !== count) announce(count.textContent, doc);
    };
    const modal = doc.getElementById(MODAL);
    const closed = () => modal.style.display === 'none';
    if (!modal || !modal.contains(doc.activeElement) || closed()) {
        settle();
        return;
    }
    const watcher = new doc.defaultView.MutationObserver(() => {
        if (!closed()) return;
        watcher.disconnect();
        settle();
    });
    watcher.observe(modal, { attributes: true, attributeFilter: ['style'] });
}

export default {
    load(_context, doc = document) {
        const listing = doc.querySelector(LISTING);
        if (!listing) return;
        const view = doc.defaultView;
        // The sidebar and the listing share .page, which stays while stock replaces both.
        const page = listing.closest('.page') || doc;
        let used = null;

        orderFacets(doc);
        syncFilterButton(doc);

        const remember = event => {
            used = controlUsed(event.target) || used;
        };
        page.addEventListener('click', event => {
            remember(event);
            if (event.target.closest(FILTER_BUTTON)) toggleFilters(doc);
        }, true);
        page.addEventListener('change', remember, true);

        // Stock replaces the listing's children on each refresh, then the sidebar's, in one task,
        // so this runs once both are in.
        new view.MutationObserver(records => {
            const added = new Set();
            records.forEach(record => record.addedNodes.forEach(node => added.add(node)));
            const replaced = records.some(record => Array.from(record.removedNodes).some(node => !added.has(node)));
            if (!replaced) return;
            afterRefresh(doc, used);
            used = null;
        }).observe(listing, { childList: true });

        // The "Show more" modal, outside .page: a size picked there is remembered as the
        // sidebar's are. show-more-facets.html's list carries the facet's name, as the sidebar's
        // does; reordering it changes nothing the second time.
        const modal = doc.getElementById(MODAL);
        if (!modal) return;
        modal.addEventListener('click', remember, true);
        new view.MutationObserver(() => orderFacets(modal)).observe(modal, { childList: true, subtree: true });
    },
};
