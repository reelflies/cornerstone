// The listing's card photos (ticket 31; SEO-14, O23; story 70), on category, search and brand
// pages: the cards in the stock grid (.productGrid), which components/reelflies/card-image.html
// renders.
//
// - Every card's photo has a real srcset (no lazysizes stand-in), sizes, a width and a height,
//   and never loads through lazysizes (no lazyload class, no data-srcset or data-sizes).
// - The first three load eagerly (no loading attribute), and every later one is loading="lazy".
// - One image on the page has fetchpriority="high": the banner's when the page has one (ticket
//   32), else the first card's. No later card has it.
//
// A page with no grid passes (an empty search, a brand with no products).

import {
    elementsHtml, findTags, markupOnly, outerHtml,
} from '../html.mjs';

const EAGER = 3;
const isCard = attrs => /(^|\s)card(\s|$)/.test(attrs.class || '');

export function cardImageProblems(html) {
    const grid = outerHtml(html, 'ul', attrs => /(^|\s)productGrid(\s|$)/.test(attrs.class || ''));
    if (!grid) return [];
    const problems = [];
    const photos = elementsHtml(grid, 'article', isCard).map(card => findTags(card, 'img')[0]);
    photos.forEach((img, index) => {
        const name = `card ${index + 1}'s photo`;
        if (!img) {
            problems.push(`card ${index + 1} has no photo`);
            return;
        }
        const { attrs } = img;
        if (/(^|\s)lazyload(\s|$)/.test(attrs.class || '') || 'data-srcset' in attrs || 'data-sizes' in attrs) problems.push(`${name} loads through lazysizes: give it a real srcset and sizes`);
        if (!attrs.srcset || attrs.srcset.startsWith('data:')) problems.push(`${name} has no real srcset`);
        ['sizes', 'width', 'height'].filter(key => !attrs[key]).forEach(key => problems.push(`${name} has no ${key}`));
        if (index < EAGER && attrs.loading === 'lazy') problems.push(`${name} is lazy: the first three load eagerly`);
        if (index >= EAGER && attrs.loading !== 'lazy') problems.push(`${name} isn't lazy: only the first three load eagerly`);
        if (index > 0 && attrs.fetchpriority === 'high') problems.push(`${name} has fetchpriority="high": only the first card's may`);
    });
    const high = findTags(markupOnly(html), 'img').filter(tag => tag.attrs.fetchpriority === 'high');
    if (photos.length && high.length === 0) problems.push('no image on the page has fetchpriority="high": with no banner, the first card\'s photo takes it');
    if (high.length > 1) problems.push(`${high.length} images have fetchpriority="high": one at most, the banner's or else the first card's`);
    return problems;
}

export default {
    id: 'card-images',
    ticket: 31,
    description: 'the listing\'s card photos: real srcset and sizes, the first three eager and the rest lazy, one fetchpriority="high" on the page',
    pages: ['category', 'search', 'brand'],
    check(page) {
        return cardImageProblems(page.html);
    },
};
