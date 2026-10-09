// The Species hub in the server HTML (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70
// and 72): pages/custom/category/species-hub.html, on every species-hub pin (channel 1's stand-in
// until wave R1 pins /species/ on 1895766).
//
// - The H1 "Fly Fishing Flies by Species" (lang/en.json, reelflies.hub.heading) and the tiles
//   inside the page's <main> (one-main counts it; max-one-h1 the H1s).
// - One tile per Species page (data-rf-hub-tiles): its name an <h2> holding a link with an href;
//   its photo a second link to the same page, out of the tab order and hidden from screen
//   readers, holding an <img> with a real srcset (never lazysizes), sizes, a width and a height.
//   That each Species page has its tile is species-hub.spec.mjs's, against the store's data.
// - The first EAGER tile photos load eagerly and every later one lazily, and the first tile's
//   photo is the page's one fetchpriority="high" image (O23; story 70).
// - Each Fly Type list under a tile holds links, each with an href and a name.
// - No "no products" message (stock's alert, or ticket 33's listing-empty paragraph), no
//   <!--more--> marker, no robots noindex (refactor 11: the hub is indexed), and the canonical,
//   when the page has one (one-canonical counts them), on the page's own path.
// - The grid, when there is one (data-rf-hub-products): after the tiles, at most a page of cards
//   (config.json's categorypage_products_per_page), every card photo lazy with no fetchpriority,
//   and a numbered pager when its count runs past the cards listed.

import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../html.mjs';

const THEME = new URL('../../../../', import.meta.url);
const HEADING = JSON.parse(fs.readFileSync(fileURLToPath(new URL('lang/en.json', THEME)), 'utf8')).reelflies.hub.heading;
const PER_PAGE = Number(JSON.parse(fs.readFileSync(fileURLToPath(new URL('config.json', THEME)), 'utf8')).settings.categorypage_products_per_page);

// The tile photos that load eagerly: the phones' first row, and the first two of the desktop's
// three (components/reelflies/category-tile.html).
export const EAGER = 2;

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const isLazysizes = attrs => hasClass('lazyload')(attrs) || 'data-srcset' in attrs || 'data-sizes' in attrs;
const pathOf = href => new URL(decodeHtml(href), 'http://species-hub.invalid').pathname;

function tileProblems(tile, index) {
    const problems = [];
    const name = outerHtml(tile, 'h2');
    const nameLink = name ? findTags(name, 'a')[0] : null;
    const label = `tile ${index + 1}${name ? ` (${textOf(name)})` : ''}`;
    if (!nameLink || !(nameLink.attrs.href || '').trim()) problems.push(`${label} has no name link with an href in an <h2>`);
    const media = findTags(tile, 'a').find(link => hasClass('rf-hub-tile__media')(link.attrs));
    if (!media) problems.push(`${label} has no photo link (.rf-hub-tile__media)`);
    else {
        if (media.attrs.tabindex !== '-1' || media.attrs['aria-hidden'] !== 'true') problems.push(`${label}: its photo's link isn't out of the tab order and hidden from screen readers (tabindex="-1" aria-hidden="true"): the name is the link`);
        if (nameLink && media.attrs.href !== nameLink.attrs.href) problems.push(`${label}: its photo links to ${media.attrs.href}, not its name's page`);
    }
    const img = findTags(tile, 'img')[0];
    if (!img) return [...problems, `${label} has no photo`];
    const { attrs } = img;
    const photo = `${label}'s photo`;
    if (isLazysizes(attrs)) problems.push(`${photo} loads through lazysizes: give it a real srcset and sizes`);
    if (!attrs.srcset || attrs.srcset.startsWith('data:')) problems.push(`${photo} has no srcset`);
    ['sizes', 'width', 'height'].filter(key => !attrs[key]).forEach(key => problems.push(`${photo} has no ${key}`));
    if (index < EAGER && attrs.loading === 'lazy') problems.push(`${photo} is lazy: the first ${EAGER} load eagerly`);
    if (index >= EAGER && attrs.loading !== 'lazy') problems.push(`${photo} isn't lazy: only the first ${EAGER} load eagerly`);
    if (index === 0 && attrs.fetchpriority !== 'high') problems.push(`${photo} has no fetchpriority="high": the first tile's photo is the page's high-priority image`);
    for (const list of elementsHtml(tile, 'ul', hasClass('rf-hub-tile__types'))) {
        const links = elementsHtml(list, 'a', () => true);
        if (!links.length) problems.push(`${label} has a Fly Type list with no links`);
        for (const link of links) {
            if (!(findTags(link, 'a')[0].attrs.href || '').trim()) problems.push(`${label}: a Fly Type link has no href`);
            if (!textOf(link)) problems.push(`${label}: a Fly Type link has no name`);
        }
    }
    return problems;
}

function gridProblems(grid) {
    const problems = [];
    const cards = elementsHtml(grid, 'article', hasClass('card'));
    if (cards.length > PER_PAGE) problems.push(`the grid has ${cards.length} cards: ${PER_PAGE} a page`);
    cards.forEach((card, index) => {
        const img = findTags(card, 'img')[0];
        if (!img) return;
        if (img.attrs.loading !== 'lazy') problems.push(`card ${index + 1}'s photo isn't lazy: the tiles fill the first screen above the grid`);
        if (img.attrs.fetchpriority) problems.push(`card ${index + 1}'s photo has fetchpriority="${img.attrs.fetchpriority}": the first tile's photo holds the page's one`);
    });
    const total = Number((textOf(outerHtml(grid, 'p', attrs => 'data-rf-hub-count' in attrs) || '').match(/\d[\d,]*/) || ['0'])[0].replace(/,/g, ''));
    const pager = outerHtml(grid, 'nav', hasClass('pagination'));
    const numbered = pager ? findTags(pager, 'a').filter(link => /[?&]page=\d+/.test(decodeHtml(link.attrs.href || ''))).length : 0;
    if (total > cards.length && numbered < 2) problems.push(`the grid lists ${cards.length} of ${total} patterns with no numbered pager`);
    return problems;
}

export function speciesHubProblems(html, pagePath) {
    const problems = [];
    const tiles = outerHtml(html, 'ul', attrs => 'data-rf-hub-tiles' in attrs);
    if (!tiles) return ['no Species tiles ([data-rf-hub-tiles]): the page isn\'t pages/custom/category/species-hub.html, or the root has no Species pages'];
    const main = outerHtml(html, 'main') || '';
    const h1 = outerHtml(html, 'h1');
    if (!h1 || textOf(h1) !== HEADING) problems.push(`the H1 reads "${h1 ? textOf(h1) : '(none)'}", not "${HEADING}"`);
    if (!main.includes('data-rf-hub-tiles') || !findTags(main, 'h1').length) problems.push('the H1 and the tiles aren\'t inside <main>');
    elementsHtml(tiles, 'li', hasClass('rf-hub-tile')).forEach((tile, index) => problems.push(...tileProblems(tile, index)));
    const firstPhoto = findTags(tiles, 'img')[0];
    const high = findTags(markupOnly(html), 'img').filter(img => img.attrs.fetchpriority === 'high');
    if (high.length > 1) problems.push(`${high.length} images have fetchpriority="high": only the first tile's photo`);
    else if (high.length === 1 && firstPhoto && high[0].raw !== firstPhoto.raw) problems.push(`the page's fetchpriority="high" is on ${high[0].attrs.src || 'an image'}, not the first tile's photo`);
    const tags = findTags(html);
    if (tags.some(tag => 'data-no-products-notification' in tag.attrs || hasClass('rf-listing-empty')(tag.attrs))) problems.push('a "no products" message: the hub never shows one (R8)');
    if (html.includes('<!--more-->')) problems.push('the description\'s <!--more--> marker is in the page');
    if (findTags(html, 'meta').some(meta => (meta.attrs.name || '').toLowerCase() === 'robots' && /noindex/i.test(meta.attrs.content || ''))) problems.push('a robots meta says noindex: the hub is indexed (refactor 11)');
    const canonicals = findTags(html, 'link').filter(link => (link.attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical'));
    if (canonicals.length === 1 && pagePath && pathOf(canonicals[0].attrs.href || '') !== pathOf(pagePath)) problems.push(`the canonical points at ${pathOf(canonicals[0].attrs.href || '')}, not the page's own path ${pathOf(pagePath)}`);
    const grid = outerHtml(html, 'section', attrs => 'data-rf-hub-products' in attrs);
    if (grid) {
        if (html.indexOf('data-rf-hub-products') < html.indexOf('data-rf-hub-tiles')) problems.push('the grid comes before the tiles');
        problems.push(...gridProblems(grid));
    }
    return problems;
}

export default {
    id: 'species-hub',
    ticket: 34,
    description: 'the Species hub: its H1, a tile per Species with a photo (the first two eager, the first the page\'s one high priority) and its Fly Type links, the grid after them with a pager, no "no products" message, indexed with a self canonical',
    pages: ['species-hub'],
    check(page) {
        return speciesHubProblems(page.html, page.path);
    },
};
