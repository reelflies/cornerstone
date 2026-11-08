// The listing's card photos (ticket 31; SEO-14, O23; story 70; redesign step 3), on category,
// search and brand pages: the specimen cards in the listing's grid (ul[data-rf-grid] in
// #product-listing-container), which components/reelflies/fly-listing.html renders.
//
// - Every product in the grid (li.rf-fly) is a card (article.rf-fly__card) with a photo.
// - Every card's photo has a real srcset (no lazysizes stand-in), sizes, a width and a height,
//   and never loads through lazysizes (no lazyload class, no data-srcset or data-sizes).
// - The first three load eagerly (no loading attribute), and every later one is loading="lazy".
//   Under the Species hub's tiles (data-rf-hub-tiles) every card photo is lazy.
// - One image on the page has fetchpriority="high": the banner's (the stone's
//   .rf-list-head__photo, ticket 32) when the page has one, the first tile's on the hub, else the
//   first card's. No other image has it.
//
// A category pin must list products. A search or brand page with no grid passes (an empty
// search, a brand with no products).

import {
    elementsHtml, findTags, markupOnly, outerHtml,
} from '../html.mjs';

export const EAGER = 3;
const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const isCard = hasClass('rf-fly__card');
const isItem = hasClass('rf-fly');
const LISTING = attrs => attrs.id === 'product-listing-container';
const isGrid = attrs => 'data-rf-grid' in attrs;

// The image that leads the page, which holds its one fetchpriority="high": the stone's banner, or
// the hub's first tile photo. Null when the first card should.
function leadImage(markup) {
    const banner = findTags(outerHtml(markup, 'div', hasClass('rf-list-head__photo')) || '', 'img')[0];
    if (banner) return { img: banner, what: 'the banner (.rf-list-head__photo)' };
    const tile = findTags(outerHtml(markup, 'ul', attrs => 'data-rf-hub-tiles' in attrs) || '', 'img')[0];
    if (tile) return { img: tile, what: 'the hub\'s first tile photo' };
    return null;
}

export function cardImageProblems(html, kind) {
    const markup = markupOnly(html);
    const listing = findTags(markup).find(tag => LISTING(tag.attrs));
    const scope = listing ? outerHtml(markup, listing.name, LISTING) : markup;
    const grid = outerHtml(scope, 'ul', isGrid);
    if (!grid) return kind === 'category' ? ['the category page has no product grid (ul[data-rf-grid]): a pinned category lists products'] : [];
    const problems = [];
    const hub = markup.includes('data-rf-hub-tiles');
    const eager = hub ? 0 : EAGER;
    const items = elementsHtml(grid, 'li', isItem);
    const photos = elementsHtml(grid, 'article', isCard).map(card => findTags(card, 'img')[0]);
    if (items.length !== photos.length) problems.push(`the grid has ${items.length} products but ${photos.length} cards (article.rf-fly__card)`);
    photos.forEach((img, index) => {
        const name = `card ${index + 1}'s photo`;
        if (!img) {
            problems.push(`card ${index + 1} has no photo`);
            return;
        }
        const { attrs } = img;
        if (hasClass('lazyload')(attrs) || 'data-srcset' in attrs || 'data-sizes' in attrs) problems.push(`${name} loads through lazysizes: give it a real srcset and sizes`);
        if (!attrs.srcset || attrs.srcset.startsWith('data:')) problems.push(`${name} has no real srcset`);
        ['sizes', 'width', 'height'].filter(key => !attrs[key]).forEach(key => problems.push(`${name} has no ${key}`));
        if (index < eager && attrs.loading === 'lazy') problems.push(`${name} is lazy: the first three load eagerly`);
        if (index >= eager && attrs.loading !== 'lazy') problems.push(hub ? `${name} isn't lazy: under the Species hub's tiles every card photo is` : `${name} isn't lazy: only the first three load eagerly`);
        if (index > 0 && attrs.fetchpriority === 'high') problems.push(`${name} has fetchpriority="high": only the first card's may`);
    });
    const high = findTags(markup, 'img').filter(tag => tag.attrs.fetchpriority === 'high');
    const lead = leadImage(markup);
    if (photos.length && high.length === 0) problems.push('no image on the page has fetchpriority="high": with no banner, the first card\'s photo takes it');
    if (high.length > 1) problems.push(`${high.length} images have fetchpriority="high": one at most, the banner's or else the first card's`);
    if (lead && high.length === 1 && high[0].raw !== lead.img.raw) problems.push(`the page has ${lead.what}, so it holds the one fetchpriority="high", not the first card (ticket 32's rf_banner was lost?)`);
    else if (!lead && high.length === 1 && photos[0] && high[0].raw !== photos[0].raw) problems.push(`the page's fetchpriority="high" is on ${high[0].attrs.src || 'an image'}, not the banner or the first card's photo`);
    return problems;
}

export default {
    id: 'card-images',
    ticket: 31,
    description: 'the listing\'s card photos: real srcset and sizes, the first three eager and the rest lazy, one fetchpriority="high" on the page',
    pages: ['category', 'search', 'brand'],
    check(page) {
        return cardImageProblems(page.html, page.kind);
    },
};
