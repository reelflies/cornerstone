// Every JSON-LD block in the server HTML parses (spec Testing Decisions, seam 2).
// What the blocks must contain is ticket 40's (Offer, brand, reviews) and 54's.

import { scriptsOfType } from '../html.mjs';

export default {
    id: 'json-ld-parses',
    ticket: 16,
    description: 'every JSON-LD block parses',
    check(page) {
        const blocks = scriptsOfType(page.html, 'application/ld+json');
        return blocks.flatMap((block, index) => {
            try {
                JSON.parse(block);
                return [];
            } catch (error) {
                return [`JSON-LD block ${index + 1} of ${blocks.length} doesn't parse: ${error.message}`];
            }
        });
    },
};
