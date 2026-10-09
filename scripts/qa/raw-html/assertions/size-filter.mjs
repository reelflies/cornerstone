// The Fly size filter in a category page's server HTML (ticket 33; spec modules 9 and 24; O11,
// O20; stories 24 and 25):
//
// - A page with the Fly Sizes facet (its list, data-facet="Fly Sizes") has "What do sizes
//   mean?" beside it: one link to /fly-hook-size-chart/ in the facet's block.
// - No page has stock's no-products alert, which category.js focused on load
//   (data-no-products-notification): the empty states take no focus.
//
// Through stencil start BigCommerce sends no facets (category.facets is empty on channel 1), so
// the first check bites on the prelaunch host's category pins, once Product Filtering is set
// (ticket 21). The facet links themselves are facet-links.mjs's.

import { elementsHtml, findTags, markupOnly } from '../html.mjs';

export const CHART_PATH = '/fly-hook-size-chart/';

export function sizeFilterProblems(html) {
    const markup = markupOnly(html);
    const problems = [];
    const blocks = elementsHtml(markup, 'div', attrs => /(^|\s)rf-size-facet(\s|$)/.test(attrs.class || ''));
    for (const block of blocks) {
        const help = findTags(block, 'a').filter(tag => tag.attrs.href === CHART_PATH);
        if (help.length !== 1) problems.push(`the Fly Sizes facet has ${help.length} links to ${CHART_PATH}, not one ("What do sizes mean?")`);
    }
    const lists = findTags(markup, 'ul').filter(tag => tag.attrs['data-facet'] === 'Fly Sizes');
    if (lists.length > blocks.length) problems.push('a Fly Sizes list is stock\'s, not the pills (facet-sizes.html)');
    if (findTags(markup, 'p').some(tag => 'data-no-products-notification' in tag.attrs)) problems.push('stock\'s no-products alert is in the page, which category.js focuses on load');
    return problems;
}

export default {
    id: 'size-filter',
    ticket: 33,
    description: '"What do sizes mean?" beside the Fly Sizes pills, and no focus-grabbing no-products alert',
    pages: ['category'],
    check(page) {
        return sizeFilterProblems(page.html);
    },
};
