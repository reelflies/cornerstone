// Exactly one <h1> on the home page (ticket 46; story 68). Ticket 27 makes the logo a <div> on
// every page and asserts no page has more than one <h1>; on the home page the one <h1> is the
// hero's heading (widgets/home-lead). Until ticket 27 lands, the stock logo is the home page's
// <h1>, so the hero's placement stays inactive until then (widgets/home-lead/channels/1895766.json).

import { findTags } from '../html.mjs';

export default {
    id: 'home-one-h1',
    ticket: 46,
    description: 'exactly one <h1> on the home page',
    pages: ['home'],
    check(page) {
        const count = findTags(page.html, 'h1').length;
        return count === 1 ? [] : [`the home page has ${count} <h1> elements, not 1`];
    },
};
