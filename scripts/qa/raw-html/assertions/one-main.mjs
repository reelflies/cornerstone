// Exactly one main landmark in the server HTML (ticket 25; O24; spec Testing Decisions, seam 2).
//
// Stock home, product and cart pages have none, and many stock templates carry their own <main>
// (brands.html, compare.html, the account pages ...). The Streamside Stone redesign moved the
// category, brand, search, Web Page, contact, blog, 404 and hook chart pages into the hero block
// with no <main> of their own, so body.html's rf_main_templates wraps each of those in <main>
// too, and every other template keeps the stock <div> (build pipeline 6.1; render/partials/
// body.test.mjs holds the list). This checks the result on every pinned page: axe's
// landmark-one-main and landmark-no-duplicate-main, before any JavaScript runs. A <main>, or any
// element with role="main", counts once.

import { findTags } from '../html.mjs';

export default {
    id: 'one-main',
    ticket: 25,
    description: 'exactly one main landmark',
    check(page) {
        const mains = findTags(page.html).filter(tag => tag.name === 'main' || (tag.attrs.role || '').trim().toLowerCase() === 'main');
        if (mains.length === 1) return [];
        return [`${mains.length} main landmarks${mains.length ? `: ${mains.map(tag => tag.raw.slice(0, 80)).join(', ')}` : ''}`];
    },
};
