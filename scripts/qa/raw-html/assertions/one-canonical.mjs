// Exactly one canonical link in the server HTML (spec Testing Decisions, seam 2).
// The cart, the 404 page and the sign-in and create-account pages (ticket 25's pins) carry none
// in stock Cornerstone, and need none: the store keeps them out of search.
// Ticket 54 tightens this to "pointing at the page itself on the host".

import { findTags } from '../html.mjs';

export default {
    id: 'one-canonical',
    ticket: 16,
    description: 'exactly one canonical link',
    notOn: ['cart', '404', 'login', 'create-account'],
    check(page) {
        const canonicals = findTags(page.html, 'link')
            .filter(tag => (tag.attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
        if (canonicals.length === 1) return [];
        return [`${canonicals.length} canonical links${canonicals.length ? `: ${canonicals.map(tag => tag.attrs.href).join(', ')}` : ''}`];
    },
};
