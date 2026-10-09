// The noindex category template in the server HTML (ticket 32; spec module 11; R13, SEO-10;
// story 76): a category on pages/custom/category/rf-noindex.html (the category@noindex pin, which
// scripts/qa/custom-layouts.json maps to it) has exactly one robots meta, "noindex, follow"; a
// category on the stock template has none that says noindex.

import { findTags, markupOnly } from '../html.mjs';

export const NOINDEX_PIN = 'category@noindex';

const robots = html => findTags(markupOnly(html), 'meta').filter(tag => (tag.attrs.name || '').toLowerCase() === 'robots');

export function categoryRobotsProblems(html, key) {
    const metas = robots(html).map(tag => (tag.attrs.content || '').trim());
    if (key === NOINDEX_PIN) {
        if (metas.length !== 1 || metas[0].toLowerCase() !== 'noindex, follow') return [`the noindex template's page has ${metas.length ? metas.map(content => `robots "${content}"`).join(', ') : 'no robots meta'}, not exactly one "noindex, follow"`];
        return [];
    }
    return metas.filter(content => /noindex/i.test(content)).map(content => `a stock-template category page has robots "${content}"`);
}

export default {
    id: 'category-robots',
    ticket: 32,
    description: 'one robots "noindex, follow" on the noindex template\'s page, and no noindex on the stock template\'s',
    pages: ['category'],
    check(page) {
        return categoryRobotsProblems(page.html, page.key ?? page.kind);
    },
};
