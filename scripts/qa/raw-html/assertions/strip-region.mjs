// The shipping strip's place (ticket 27; spec module 2, O04), on every page: the
// header_bottom--global region, where the strip widget sits on 1895766, is after the header and
// inside a labelled region landmark (<div data-rf-strip-region role="region" aria-label>), so
// it isn't content outside any landmark (axe region) and, on phones, scrolls away under the
// sticky bar. When the strip itself is on the page (data-rf-strip, widgets/shipping-strip), it
// holds no link: the way to ReelFlies.com is ticket 52's prompt and ticket 50's footer.
//
// Like every assertion it judges the page, never the store's record of the widget, so writing
// the strip on 1895766 never fails an open branch's gate (build pipeline, section 6.6).

import { findTags } from '../html.mjs';
import { elementSource } from './rf-header.mjs';

export const REGION = 'header_bottom--global';

export function stripRegionProblems(html) {
    const regions = findTags(html, 'div').filter(tag => tag.attrs['data-content-region'] === REGION);
    if (regions.length !== 1) return [`${regions.length} ${REGION} regions, not 1`];
    const wrapper = elementSource(html, 'div', attrs => 'data-rf-strip-region' in attrs);
    if (!wrapper || !wrapper.includes(`data-content-region="${REGION}"`)) {
        return [`${REGION} isn't inside the strip's landmark, <div data-rf-strip-region role="region" aria-label="…">`];
    }
    const problems = [];
    const [landmark] = findTags(wrapper, 'div');
    if (landmark.attrs.role !== 'region') problems.push(`the strip's landmark has role "${landmark.attrs.role || ''}", not "region"`);
    if (!(landmark.attrs['aria-label'] || '').trim()) problems.push('the strip\'s landmark has no accessible name (aria-label)');
    const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);
    if (header && header.includes('data-rf-strip-region')) problems.push('the strip\'s landmark is inside the <header>: it belongs after it, so it scrolls away under the sticky phone bar');
    else if (header && html.indexOf('data-rf-strip-region') < html.indexOf(header)) problems.push('the strip\'s landmark comes before the <header>: it belongs after it, under the bar');
    const strip = elementSource(html, 'div', attrs => 'data-rf-strip' in attrs);
    if (strip) {
        const links = findTags(strip, 'a').map(tag => tag.attrs.href || '(no href)');
        if (links.length) problems.push(`the shipping strip holds ${links.length === 1 ? 'a link' : `${links.length} links`} (${links.join(', ')}): it carries the shipping promise and nothing else`);
    }
    return problems;
}

export default {
    id: 'strip-region',
    ticket: 27,
    description: `${REGION} after the header, inside a labelled region landmark, and the shipping strip in it with no link`,
    check(page) {
        return stripRegionProblems(page.html);
    },
};
