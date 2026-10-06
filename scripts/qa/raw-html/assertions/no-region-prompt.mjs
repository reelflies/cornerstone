// No outside-Canada prompt in the server HTML (spec Testing Decisions, seam 2; GEO-2).
//
// The prompt is built in the browser after the visitor's first interaction, so a
// crawler must never get it. Its marker is the attribute data-rf-region-prompt:
// ticket 52 puts it on the prompt's root element, and owns this assertion from
// then on (it adds the check for the prompt's copy). A string in a script, such
// as the code that builds the card, isn't markup and doesn't count.

import { findTags } from '../html.mjs';

export const MARKER = 'data-rf-region-prompt';

export default {
    id: 'no-region-prompt',
    ticket: 16,
    description: `no outside-Canada prompt (no element with ${MARKER})`,
    check(page) {
        return findTags(page.html)
            .filter(tag => MARKER in tag.attrs)
            .map(tag => `server HTML has the prompt marker ${MARKER}: ${tag.raw.slice(0, 120)}`);
    },
};
