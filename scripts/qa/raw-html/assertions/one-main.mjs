// Exactly one main landmark in the server HTML (ticket 25; O24; spec Testing Decisions, seam 2).
//
// Stock home, product and cart pages have none, and many other stock templates carry their own
// <main> (category.html, brand.html, search.html, page.html, errors/404.html ...). So body.html
// wraps the page in <main> on home, product and cart only (build pipeline 6.1). This checks the
// result on every pinned page: axe's landmark-one-main and landmark-no-duplicate-main, before
// any JavaScript runs. A <main>, or any element with role="main", counts once.

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
