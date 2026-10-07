// The ReelFlies icon sheet (ticket 25; O22; spec Testing Decisions, seam 2): exactly once per
// page, as the first element in <body>, and hidden from screen readers. Icons drawn from it
// (templates/components/reelflies/icon.html) sit beside a visible label or inside a control
// with an accessible name, which axe checks. It is rendered by
// templates/components/reelflies/body-start.html.

import { findTags } from '../html.mjs';

export const MARKER = 'data-rf-icons';

export default {
    id: 'rf-icon-sheet',
    ticket: 25,
    description: `the icon sheet once, first in <body>, hidden from screen readers (${MARKER})`,
    check(page) {
        const tags = findTags(page.html);
        const sheets = tags.filter(tag => MARKER in tag.attrs);
        if (sheets.length === 0) return [`no ReelFlies icon sheet (no element with ${MARKER})`];
        if (sheets.length > 1) return [`${sheets.length} ReelFlies icon sheets (elements with ${MARKER})`];

        const [sheet] = sheets;
        const problems = [];
        const body = tags.findIndex(tag => tag.name === 'body');
        if (body < 0 || tags[body + 1] !== sheet) problems.push(`the icon sheet isn't the first element in <body>${body >= 0 && tags[body + 1] ? `: ${tags[body + 1].raw.slice(0, 80)} comes first` : ''}`);
        if (sheet.attrs['aria-hidden'] !== 'true') problems.push(`the icon sheet has no aria-hidden="true": ${sheet.raw.slice(0, 120)}`);
        return problems;
    },
};
