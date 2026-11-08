// The utility strip's landmark (ticket 27; spec module 2, O04; redrawn for Streamside Stone,
// DESIGN.md "Navigation"), on every page: components/reelflies/strip.html, the riverbed shale
// above the header, is one labelled region landmark (<div class="rf-strip" role="region"
// aria-label>), so its words (the shipping promise, the family line, the phone number and the
// other storefront) aren't content outside any landmark (axe region). It sits before the
// <header>, never inside it, and every link in it has an href.
//
// Retired with the redesign: the header_bottom--global region and the shipping-strip widget it
// held (the strip is a theme partial now), the wrapper it sat in (data-rf-strip-region), and the
// "no link in the strip" rule: the strip carries the phone number and the way to the other
// storefront by design.
//
// Like every assertion it judges the page, never the store's record of a widget.

import { findTags, markupOnly, outerHtml } from '../html.mjs';

const isStrip = attrs => /(^|\s)rf-strip(\s|$)/.test(attrs.class || '');

// The strip's markup (<div class="rf-strip">), or null.
export const stripSource = html => outerHtml(html, 'div', isStrip);

export function stripRegionProblems(html) {
    const strips = findTags(html, 'div').filter(tag => isStrip(tag.attrs));
    if (strips.length !== 1) return [`${strips.length} utility strips (.rf-strip), not 1`];
    const problems = [];
    const [strip] = strips;
    if (strip.attrs.role !== 'region') problems.push(`the strip has role "${strip.attrs.role || ''}", not "region"`);
    if (!(strip.attrs['aria-label'] || '').trim()) problems.push('the strip\'s landmark has no accessible name (aria-label)');
    const header = outerHtml(html, 'header', attrs => 'data-rf-head' in attrs);
    if (header) {
        if (findTags(header, 'div').some(tag => isStrip(tag.attrs))) {
            problems.push('the strip is inside the <header>: it belongs above it, its own landmark');
        } else {
            const markup = markupOnly(html);
            if (markup.indexOf(strip.raw) > markup.indexOf(header)) problems.push('the strip comes after the <header>: it belongs above it');
        }
    }
    const dead = findTags(stripSource(html), 'a').filter(tag => !(tag.attrs.href || '').trim());
    if (dead.length) problems.push(`${dead.length} link(s) in the strip with no href`);
    return problems;
}

export default {
    id: 'strip-region',
    ticket: 27,
    description: 'the utility strip above the header is one labelled region landmark (role="region" with an aria-label), outside the <header>, and its links have hrefs',
    check(page) {
        return stripRegionProblems(page.html);
    },
};
