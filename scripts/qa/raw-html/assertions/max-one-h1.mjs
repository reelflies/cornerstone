// At most one <h1> on every page (ticket 27; story 68). The logo was the stock home page's <h1>
// (header.html:19-22), and ticket 27 makes it a <div> on every page type, so each page's own
// heading is its only one. Ticket 46's home-one-h1 adds "exactly one on home, the hero's" once
// the hero is placed.

import { findTags } from '../html.mjs';

export default {
    id: 'max-one-h1',
    ticket: 27,
    description: 'at most one <h1> on every page',
    check(page) {
        const count = findTags(page.html, 'h1').length;
        return count <= 1 ? [] : [`${count} <h1> elements, not at most 1`];
    },
};
