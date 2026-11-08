// The ReelFlies icon sheet (ticket 25; O22; spec Testing Decisions, seam 2), as the Streamside
// Stone redesign draws it: templates/components/reelflies/icons.html, one <svg class="rf-icon-sheet">
// of <symbol id="rf-i-…"> elements, rendered at the top of the header (header.html), after the skip
// link. On every page:
//
// - exactly one sheet, inside <body>, before the first icon drawn from it, so no icon waits on
//   markup further down the page
// - hidden from screen readers and from the keyboard (aria-hidden="true", focusable="false"):
//   icons drawn from it (templates/components/reelflies/icon.html, and the scripts' own copies of
//   it) sit beside a visible label or inside a control with a name of its own, which axe checks
// - every icon the page draws (<use href="#rf-i-…">) names a symbol the sheet holds, so a
//   template asking for an icon that was renamed fails here, not as a blank
//
// Master's sheet (body-start.html, data-rf-icons, first in <body>) is gone with the redesign.

import { findTags, outerHtml } from '../html.mjs';

export const SHEET_CLASS = 'rf-icon-sheet';
export const SYMBOL_PREFIX = 'rf-i-';

const classes = attrs => (attrs.class || '').split(/\s+/);
const isSheet = tag => tag.name === 'svg' && classes(tag.attrs).includes(SHEET_CLASS);
const usedId = tag => (tag.attrs.href || tag.attrs['xlink:href'] || '').trim().replace(/^#/, '');

export default {
    id: 'rf-icon-sheet',
    ticket: 25,
    description: `the icon sheet once (svg.${SHEET_CLASS}), in <body> before the first icon drawn from it, hidden from screen readers, holding every icon the page draws`,
    check(page) {
        const tags = findTags(page.html);
        const sheets = tags.filter(isSheet);
        if (sheets.length === 0) return [`no ReelFlies icon sheet (no <svg class="${SHEET_CLASS}">)`];
        if (sheets.length > 1) return [`${sheets.length} ReelFlies icon sheets (svg.${SHEET_CLASS})`];

        const [sheet] = sheets;
        const problems = [];
        const body = tags.findIndex(tag => tag.name === 'body');
        const at = tags.indexOf(sheet);
        if (body < 0 || at < body) problems.push('the icon sheet isn\'t in <body>');
        const uses = tags.filter(tag => tag.name === 'use' && usedId(tag).startsWith(SYMBOL_PREFIX));
        const first = uses.length ? tags.indexOf(uses[0]) : -1;
        if (first >= 0 && first < at) problems.push(`an icon (${uses[0].raw}) is drawn before the sheet that holds it`);
        if (sheet.attrs['aria-hidden'] !== 'true') problems.push(`the icon sheet has no aria-hidden="true": ${sheet.raw.slice(0, 120)}`);
        if (sheet.attrs.focusable !== 'false') problems.push(`the icon sheet has no focusable="false": ${sheet.raw.slice(0, 120)}`);

        const markup = outerHtml(page.html, 'svg', attrs => classes(attrs).includes(SHEET_CLASS));
        const symbols = new Set(findTags(markup, 'symbol').map(tag => tag.attrs.id));
        if (!symbols.size) problems.push('the icon sheet holds no <symbol>');
        const missing = [...new Set(uses.map(usedId).filter(id => !symbols.has(id)))];
        if (missing.length) problems.push(`the page draws icons the sheet doesn't hold: ${missing.join(', ')}`);
        return problems;
    },
};
