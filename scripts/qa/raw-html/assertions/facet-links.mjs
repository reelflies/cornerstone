// Every facet link a crawler gets carries _bc_fsnf=1 and rel="nofollow" (ticket 33; SEO-12,
// SEO-6; spec Testing Decisions, seam 2; story 72).
//
// BigCommerce's facet links put _bc_fsnf=1 in their URLs, which robots.txt blocks
// ("Disallow: /*?_bc_fsnf=1*"), and stock facets/multi.html adds rel="nofollow". That keeps
// every size x filter x page combination of about 77 categories out of the crawl through the
// Flip. A URL built by theme code lacks the marker, and a pill turned into a button filters
// only with JavaScript. So:
//
// - A facet link is an element with data-faceted-search-facet, the marker stock faceted-search.js
//   uses to send a click through its own refresh. Each must be a link (<a>) with a URL to follow.
// - It is checked when its URL carries a filter: any query parameter besides the marker,
//   paging, sorting and the search query (NOT_FILTERS). Stock also marks the "Clear" and
//   "Clear all" links, which go back to the listing itself, and those carry no filter. A "Clear"
//   that leaves another facet's filter in place does carry one, and stock gives it no
//   rel="nofollow", so a pinned page with two facets applied would report it: that is the rule.
// - Stock's pager links carry the marker too (paginator.html, class pagination-link). They page
//   rather than filter, so they aren't facet links. On a filtered page they keep the filter and
//   its marker in their URLs, without rel="nofollow".
// - Each facet link with a filter must have _bc_fsnf=1 in its URL and nofollow in its rel.
//
// Through stencil start, BigCommerce sends no facets (category.facets is empty on channel 1,
// 2026-10-06), so only the prelaunch host's pages have facet links to check (ticket 33's
// criterion 3, once 1895766 pins a category page).

import { findTags } from '../html.mjs';

export const MARKER = 'data-faceted-search-facet';

// Query parameters that page, sort or search a listing rather than filter it.
const NOT_FILTERS = new Set(['_bc_fsnf', 'page', 'sort', 'limit', 'mode', 'search_query', 'section']);

const NAMED = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'',
};

// An attribute's text as a browser reads it: Handlebars writes = as &#x3D; and & as &amp;.
export function decodeHtml(text) {
    return text.replace(/&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-z]+));/g, (reference, decimal, hex, name) => {
        if (!decimal && !hex) return NAMED[name] ?? reference;
        const code = parseInt(decimal || hex, decimal ? 10 : 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : reference;
    });
}

const isPager = tag => (tag.attrs.class || '').split(/\s+/).includes('pagination-link');
const hasFilter = url => [...url.searchParams.keys()].some(key => !NOT_FILTERS.has(key));
const short = raw => raw.replace(/\s+/g, ' ').slice(0, 160);

// What one marked element is: 'control' (not a link), 'pager', 'no-url' (no href, '#…' or
// 'javascript:'), 'bad-url', 'no-filter' (a clear link), or 'facet' (a link with a filter).
function classify(tag, base) {
    const href = decodeHtml(tag.attrs.href || '').trim();
    const entry = { href, raw: tag.raw };
    if (tag.name !== 'a') return { ...entry, kind: 'control' };
    if (isPager(tag)) return { ...entry, kind: 'pager' };
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return { ...entry, kind: 'no-url' };
    let url;
    try {
        url = new URL(href, base);
    } catch {
        return { ...entry, kind: 'bad-url' };
    }
    const rel = (tag.attrs.rel || '').toLowerCase().split(/\s+/);
    return {
        ...entry, url, rel, kind: hasFilter(url) ? 'facet' : 'no-filter',
    };
}

const marked = (html, base) => findTags(html).filter(({ attrs }) => MARKER in attrs).map(tag => classify(tag, base));

// The marked links whose URLs carry a filter, as { href, url, rel, raw }, in page order.
// `base` resolves relative hrefs: the page's own URL.
export function facetAnchors(html, base) {
    return marked(html, base).filter(({ kind }) => kind === 'facet');
}

function problem({
    kind, href, url, rel, raw,
}) {
    if (kind === 'control') return `facet control that isn't a link, so it filters only with JavaScript: ${short(raw)}`;
    if (kind === 'no-url') return `facet link with no URL to follow, so it filters only with JavaScript: ${short(raw)}`;
    if (kind === 'bad-url') return `facet link whose href isn't a URL: ${short(raw)}`;
    if (kind !== 'facet') return null;
    const missing = [
        !url.searchParams.getAll('_bc_fsnf').includes('1') && 'without _bc_fsnf=1, so robots.txt doesn\'t block it',
        !rel.includes('nofollow') && 'without rel="nofollow"',
    ].filter(Boolean);
    return missing.length ? `facet link ${missing.join(', and ')}: ${href}` : null;
}

export default {
    id: 'facet-links',
    ticket: 33,
    description: 'every facet link is a link, with _bc_fsnf=1 in its URL and rel="nofollow"',
    check(page) {
        return marked(page.html, page.url || 'http://localhost/').map(problem).filter(Boolean);
    },
};
