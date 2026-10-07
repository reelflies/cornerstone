// The shared live region (ticket 25; O24; spec Testing Decisions, seam 2): every page's server
// HTML has exactly one, with role="status", and it is empty, so a screen reader reads nothing at
// load and announces each message that assets/js/theme/reelflies/live-region.js writes later.
// It is rendered by templates/components/reelflies/body-start.html.

import { findTags, markupOnly } from '../html.mjs';

export const MARKER = 'data-rf-live-region';

export default {
    id: 'rf-live-region',
    ticket: 25,
    description: `one empty role="status" live region (${MARKER})`,
    check(page) {
        const regions = findTags(page.html).filter(tag => MARKER in tag.attrs);
        if (regions.length === 0) return [`no live region (no element with ${MARKER})`];
        if (regions.length > 1) return [`${regions.length} live regions (elements with ${MARKER})`];

        const [region] = regions;
        const problems = [];
        if ((region.attrs.role || '').trim().toLowerCase() !== 'status') problems.push(`the live region has no role="status": ${region.raw}`);
        const markup = markupOnly(page.html);
        const after = markup.slice(markup.indexOf(region.raw) + region.raw.length);
        if (!new RegExp(`^\\s*</${region.name}\\s*>`, 'i').test(after)) problems.push(`the live region isn't empty in the server HTML: ${after.trim().slice(0, 80)}`);
        return problems;
    },
};
