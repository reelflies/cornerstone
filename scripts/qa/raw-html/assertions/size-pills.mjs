// The size pills in a product page's server HTML (ticket 37; spec modules 15 and 16; O14, O15,
// R9; stories 15, 37, 68 and 70):
//
// - The options render visible: the options container (data-product-option-change) has no
//   display:none, so nothing moves when stock's script would have shown it.
// - Each pill group (data-rf-pills) is a radiogroup labelled by an element on the page, with an
//   id of its own (never stock's fixed rectangle-group-label).
// - A size group (one with "Hook size guide") with more than one size has no radio checked: no
//   size is chosen for the shopper. Its "Hook size guide" links to /fly-hook-size-chart/.

import {
    decodeHtml, elementsHtml, findTags, markupOnly,
} from '../html.mjs';

export const CHART_PATH = '/fly-hook-size-chart/';

export function sizePillsProblems(html) {
    const markup = markupOnly(html);
    const problems = [];
    const options = findTags(markup, 'div').filter(tag => 'data-product-option-change' in tag.attrs);
    if (options.some(tag => /display\s*:\s*none/i.test(decodeHtml(tag.attrs.style || '')))) problems.push('the options container is hidden (display:none) until a script shows it');
    const ids = findTags(markup).map(tag => tag.attrs.id).filter(Boolean);
    for (const group of elementsHtml(markup, 'div', attrs => 'data-rf-pills' in attrs)) {
        const [tag] = findTags(group, 'div');
        const label = tag.attrs['aria-labelledby'] || '';
        if (tag.attrs.role !== 'radiogroup') problems.push('a pill group isn\'t a radiogroup');
        if (!label || label === 'rectangle-group-label') problems.push(`a pill group is labelled by "${label}", not an id of its own`);
        else if (ids.filter(id => id === label).length !== 1) problems.push(`a pill group's label id "${label}" is on ${ids.filter(id => id === label).length} elements, not one`);
        const guide = findTags(group, 'a').filter(link => link.attrs.href === CHART_PATH);
        const radios = findTags(group, 'input').filter(input => input.attrs.type === 'radio' && input.attrs.value);
        if (guide.length && radios.length > 1 && radios.some(input => 'checked' in input.attrs)) problems.push(`a size group with ${radios.length} sizes has one checked before the shopper chose`);
    }
    return problems;
}

export default {
    id: 'size-pills',
    ticket: 37,
    description: 'the options visible in the server HTML, each pill group a labelled radiogroup with its own id, and no size checked on a multi-size product',
    pages: ['product'],
    check(page) {
        return sizePillsProblems(page.html);
    },
};
