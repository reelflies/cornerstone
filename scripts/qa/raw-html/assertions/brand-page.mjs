// The ReelFlies brand listing in the server HTML (ticket 36; spec module 12; O10; stories 17, 70
// and 72): components/reelflies/brand-page.html, on brand pins.
//
// - One listing header (listing-header.html), holding the page's one H1, and none of stock's
//   heading: its 100px image (.brand-image-container) and its own <h1>.
// - Its banner, where the brand has an image: eager, fetchpriority="high", a srcset of two or more
//   candidates, sizes, a width and a height, and alt="", as a category's (category-page.mjs).
// - The brand_below_header region right after the header, so the intro widget sits under the H1.
// - Indexable (spec module 12): no robots meta that says noindex.
//
// The canonical is the store's (its head meta tags), not the theme's: one-canonical checks there is
// exactly one. On 2026-10-09 it was /reelflies-2/, brand 411's own URL, on both channels, though
// 1895766's breadcrumb names the /brands/ReelFlies.html alias the pin asks for, so the theme can't
// tell the brand's own URL from the page. card-images checks the cards' photos and the page's one fetchpriority; size-filter the pills'
// help link and the empty states; facet-links the facets' anchors.

import { findTags, markupOnly } from '../html.mjs';
import { hasClass, listingHeader, listingHeaderProblems } from './category-page.mjs';

const REGION = 'brand_below_header';

export function brandPageProblems(html) {
    const markup = markupOnly(html);
    const header = listingHeader(markup);
    if (!header) return ['no listing header (.rf-listing-header): the page isn\'t components/reelflies/brand-page.html'];
    const problems = listingHeaderProblems(header);
    const h1s = findTags(markup, 'h1').length;
    if (h1s !== 1) problems.push(`${h1s} <h1> on the page: the listing header's is the only one`);
    if (findTags(markup, 'div').some(tag => hasClass('brand-image-container')(tag.attrs))) problems.push('stock\'s brand image (.brand-image-container) is on the page: the banner replaces it');
    const [next] = findTags(markup.slice(markup.indexOf(header) + header.length));
    if (!next || next.attrs['data-content-region'] !== REGION) problems.push(`no ${REGION} region right after the listing header, where the brand's intro goes`);
    findTags(markup, 'meta')
        .filter(tag => (tag.attrs.name || '').toLowerCase() === 'robots' && /noindex/i.test(tag.attrs.content || ''))
        .forEach(tag => problems.push(`robots "${tag.attrs.content}": the brand listing is indexable`));
    return problems;
}

export default {
    id: 'brand-page',
    ticket: 36,
    description: 'the brand listing: one header with the page\'s one H1, an eager high-priority banner, the intro\'s region under it, and no noindex',
    pages: ['brand'],
    check(page) {
        return brandPageProblems(page.html);
    },
};
