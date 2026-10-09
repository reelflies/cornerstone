// The Fly size filter in a category page's server HTML (ticket 33; spec modules 9 and 24; O11,
// O20; stories 24 and 25):
//
// - A page with the Fly Sizes facet (its list, data-facet="Fly Sizes") has "What do sizes
//   mean?" beside it: one link to /fly-hook-size-chart/ in the facet's block.
// - No page has stock's no-products alert, which category.js focused on load
//   (data-no-products-notification): the empty states take no focus.
// - A fly listing's pin (FLY_PINS) that lists any facet lists Fly Sizes: ticket 21 shows it
//   first, so a pin without it means the option was renamed and the templates' name
//   (size-facet-name.html) no longer matches, which would leave stock's list on the page.
//
// Through stencil start BigCommerce sends no facets (category.facets is empty on channel 1), so
// the first and third checks bite on the prelaunch host's category pins, once Product Filtering
// is set (ticket 21). The facet links themselves are facet-links.mjs's.

import { elementsHtml, findTags, markupOnly } from '../html.mjs';

export const CHART_PATH = '/fly-hook-size-chart/';

// The facet's name, as templates/components/reelflies/size-facet-name.html has it
// (render/partials/size-filter.test.mjs holds the two together).
export const SIZE_FACET = 'Fly Sizes';

// The pins that are fly listings (pages.mjs): channel 1's category pins but category@more, the
// gear's, and the Fly Type and Species kinds the prelaunch host pins (wave R2).
export const FLY_PINS = ['category', 'category@noindex', 'fly-type', 'species'];

export function sizeFilterProblems(html, key) {
    const markup = markupOnly(html);
    const problems = [];
    const blocks = elementsHtml(markup, 'div', attrs => /(^|\s)rf-size-facet(\s|$)/.test(attrs.class || ''));
    for (const block of blocks) {
        const help = findTags(block, 'a').filter(tag => tag.attrs.href === CHART_PATH);
        if (help.length !== 1) problems.push(`the Fly Sizes facet has ${help.length} links to ${CHART_PATH}, not one ("What do sizes mean?")`);
    }
    const facetLists = findTags(markup, 'ul').filter(tag => 'data-facet' in tag.attrs);
    const lists = facetLists.filter(tag => tag.attrs['data-facet'] === SIZE_FACET);
    if (lists.length > blocks.length) problems.push('a Fly Sizes list is stock\'s, not the pills (facet-sizes.html)');
    if (FLY_PINS.includes(key) && facetLists.length && !lists.length) problems.push(`a fly category lists facets but not "${SIZE_FACET}": the option may be renamed (size-facet-name.html)`);
    if (findTags(markup, 'p').some(tag => 'data-no-products-notification' in tag.attrs)) problems.push('stock\'s no-products alert is in the page, which category.js focuses on load');
    return problems;
}

export default {
    id: 'size-filter',
    ticket: 33,
    description: '"What do sizes mean?" beside the Fly Sizes pills, Fly Sizes on the fly pins that list facets, and no focus-grabbing no-products alert',
    pages: ['category', 'fly-type', 'species'],
    check(page) {
        return sizeFilterProblems(page.html, page.key ?? page.kind);
    },
};
