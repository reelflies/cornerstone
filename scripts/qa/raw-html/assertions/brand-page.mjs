// The ReelFlies brand listing in the server HTML (ticket 36; spec module 12; O10; stories 17, 70
// and 72; redesign step 3): components/reelflies/brand-page.html, on brand pins.
//
// - One listing head (listing-head.html, .rf-list-head), holding the page's one H1, and none of
//   stock's heading: its 100px image (.brand-image-container) and its own <h1>. Every brand gets
//   the plain head (DESIGN.md); should one ever carry a banner, it is checked as a category's
//   (category-page.mjs).
// - The brand_below_header region right after the head, so the intro widget sits under the H1.
// - Indexable (spec module 12): no robots meta that says noindex.
// - Facet links to check: a page that lists the brand's products (ul[data-rf-grid]) under the
//   facet nav (#facetedSearch-navList, which renders while a facet is visible) has at least one
//   facet link (facet-links.mjs's facetAnchors). BigCommerce sends a client it takes for a bot its
//   facets with no items: on channel 1 on 2026-10-09, curl's User-Agent and HeadlessChrome's (in
//   the User-Agent or the Sec-CH-UA hint) got the nav and no cells, while the gates' raw-HTML
//   fetch (raw-html.mjs's ReelFliesQA User-Agent) and Node's default got the brand's ten. Should
//   the store start taking the gates' fetch for a bot, this fails, where facet-links and
//   size-filter would pass with nothing to check (criterion 2's anchors).
//
// The canonical is the store's (its head meta tags), not the theme's: one-canonical checks there is
// exactly one. On 2026-10-09 it was /reelflies-2/, brand 411's own URL, on both channels, though
// 1895766's breadcrumb names the /brands/ReelFlies.html alias the pin asks for, so the theme can't
// tell the brand's own URL from the page.
//
// The other assertions check the rest of the page: card-images the cards' photos and the page's
// one fetchpriority, size-filter the cells' help link and the empty states, and facet-links the
// facets' anchors.

import { findTags, markupOnly } from '../html.mjs';
import { hasClass, listingHead, listingHeadProblems } from './category-page.mjs';
import { facetAnchors } from './facet-links.mjs';

const REGION = 'brand_below_header';

export function brandPageProblems(html, url = 'http://localhost/') {
    const markup = markupOnly(html);
    const head = listingHead(markup);
    if (!head) return ['no listing head (.rf-list-head): the page isn\'t components/reelflies/brand-page.html'];
    const problems = listingHeadProblems(head);
    const h1s = findTags(markup, 'h1').length;
    if (h1s !== 1) problems.push(`${h1s} <h1> on the page: the listing head's is the only one`);
    if (findTags(markup, 'div').some(tag => hasClass('brand-image-container')(tag.attrs))) problems.push('stock\'s brand image (.brand-image-container) is on the page: the head replaces it');
    if (findTags(markup, 'h1').some(tag => hasClass('page-heading')(tag.attrs))) problems.push('stock\'s page heading (h1.page-heading) is on the page: the head replaces it');
    const [next] = findTags(markup.slice(markup.indexOf(head) + head.length));
    if (!next || next.attrs['data-content-region'] !== REGION) problems.push(`no ${REGION} region right after the listing head, where the brand's intro goes`);
    findTags(markup, 'meta')
        .filter(tag => (tag.attrs.name || '').toLowerCase() === 'robots' && /noindex/i.test(tag.attrs.content || ''))
        .forEach(tag => problems.push(`robots "${tag.attrs.content}": the brand listing is indexable`));
    const navList = findTags(markup, 'div').some(tag => tag.attrs.id === 'facetedSearch-navList');
    const listsProducts = findTags(markup, 'ul').some(tag => 'data-rf-grid' in tag.attrs);
    if (navList && listsProducts && !facetAnchors(markup, url).length) {
        problems.push('the facet nav has no facet link over the brand\'s products, so facet-links and size-filter had nothing to check: BigCommerce sends its facets with no items to a client it takes for a bot (ticket 36)');
    }
    return problems;
}

export default {
    id: 'brand-page',
    ticket: 36,
    description: 'the brand listing: one head with the page\'s one H1, the intro\'s region under it, no noindex, and facet links to check wherever it lists products under the facets',
    pages: ['brand'],
    check(page) {
        return brandPageProblems(page.html, page.url);
    },
};
