// The size pills in a product page's server HTML (ticket 37; spec modules 15 and 16; O14, O15,
// R9; stories 15, 37, 68 and 70):
//
// - The options render visible: the options container (data-product-option-change) has no
//   display:none, so nothing moves when stock's script would have shown it.
// - Each pill group (data-rf-pills) is a radiogroup labelled by an element on the page, with an
//   id of its own (never stock's fixed rectangle-group-label), and no rectangle option renders
//   stock's markup, as it would if the hook were lost in an upgrade.
// - The size group (data-rf-pills="size") has one "Hook size guide" link, to
//   /fly-hook-size-chart/ (R9), and with more than one size, no radio checked: no size is chosen
//   for the shopper.
//
// Channel 1's product@sizes pin (Fat Albert, several sizes) is where the last check bites; the
// product pin has one size, which is checked.

import {
    decodeHtml, elementsHtml, findTags, markupOnly,
} from '../html.mjs';
import { CHART_PATH } from './size-filter.mjs';

export function sizePillsProblems(html) {
    const markup = markupOnly(html);
    const problems = [];
    const options = findTags(markup, 'div').filter(tag => 'data-product-option-change' in tag.attrs);
    if (options.some(tag => /display\s*:\s*none/i.test(decodeHtml(tag.attrs.style || '')))) problems.push('the options container is hidden (display:none) until a script shows it');
    const ids = findTags(markup).map(tag => tag.attrs.id).filter(Boolean);
    if (ids.includes('rectangle-group-label') || findTags(markup, 'div').some(tag => tag.attrs['data-product-attribute'] === 'set-rectangle' && !('data-rf-pills' in tag.attrs))) {
        problems.push('a rectangle option renders stock\'s markup, not the pills (size-pills.html\'s hook in set-rectangle.html)');
    }
    for (const group of elementsHtml(markup, 'div', attrs => 'data-rf-pills' in attrs)) {
        const [tag] = findTags(group, 'div');
        const label = tag.attrs['aria-labelledby'] || '';
        if (tag.attrs.role !== 'radiogroup') problems.push('a pill group isn\'t a radiogroup');
        if (!label || label === 'rectangle-group-label') problems.push(`a pill group is labelled by "${label}", not an id of its own`);
        else if (ids.filter(id => id === label).length !== 1) problems.push(`a pill group's label id "${label}" is on ${ids.filter(id => id === label).length} elements, not one`);
        if (tag.attrs['data-rf-pills'] !== 'size') continue; // eslint-disable-line no-continue
        const guide = findTags(group, 'a').filter(link => link.attrs.href === CHART_PATH);
        if (guide.length !== 1) problems.push(`the size group has ${guide.length} links to ${CHART_PATH}, not one ("Hook size guide")`);
        const radios = findTags(group, 'input').filter(input => input.attrs.type === 'radio' && input.attrs.value);
        if (radios.length > 1 && radios.some(input => 'checked' in input.attrs)) problems.push(`a size group with ${radios.length} sizes has one checked before the shopper chose`);
    }
    return problems;
}

export default {
    id: 'size-pills',
    ticket: 37,
    description: 'the options visible in the server HTML, no stock rectangle markup, each pill group a labelled radiogroup with its own id, and the size group with its guide link and no size checked on a multi-size product',
    pages: ['product'],
    check(page) {
        return sizePillsProblems(page.html);
    },
};
