// The home page's stone in the server HTML (redesign step 2, DESIGN.md "Region mapping"; the rules
// of ticket 46's hero, carried over; spec seam 2): section.rf-stone, the first band of
// components/reelflies/home.html.
//
// - Its photograph is a <picture>: a <source> with a media query and a srcset for the portrait
//   crop on phones, and one <img> with src, width and height, alt="" (the H1 says what the page
//   is), fetchpriority="high" and no loading="lazy". It is the page's only fetchpriority="high"
//   element: the cards on the stone load eagerly without it, and every other image is lazy.
// - The stone is labelled by its one <h1>, which has text (home-one-h1 holds the page-wide rule).
// - The ways in (.rf-ways__group): each group has an <h2> title and at least one a.rf-way, every
//   way a link to a page, so a crawler follows them with no JavaScript; a category's way carries
//   data-rf-way and data-rf-way-name, which home.js reads to re-lay the stone with its flies.
//   Nothing in the stone is a <button> but a card's "+ Add" (UX-3).
// - The lay (ul[data-rf-lay]), when the store sent best sellers: its label an <h2> marked
//   data-rf-lay-title and an "All" link marked data-rf-lay-all, both home.js rewrites, and its
//   cards' photos eager, with no fetchpriority (home-product-bands checks the cards themselves).
//
// A page without the stone fails: the redesign's home always opens with it.

import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

export const STONE_CLASS = 'rf-stone';
const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const isPage = url => /^(\/|https?:\/\/)/.test(url);
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();

// The stone's whole markup, or null. The class is read as a browser reads it (findTags), never
// from a script or a comment.
export const stoneHtml = html => outerHtml(html, 'section', hasClass(STONE_CLASS));

function photoProblems(stone) {
    const [picture] = elementsHtml(stone, 'picture', hasClass('rf-stone__photo'));
    if (!picture) return ['the stone has no photograph (picture.rf-stone__photo)'];
    const problems = [];
    const images = findTags(picture, 'img');
    if (images.length !== 1) problems.push(`the stone's <picture> has ${images.length} <img> elements, not 1`);
    const [img] = images;
    if (img) {
        for (const name of ['src', 'width', 'height']) if (!img.attrs[name]) problems.push(`the stone's <img> has no ${name}`);
        if (img.attrs.alt !== '') problems.push('the stone\'s <img> needs alt="": it is the ground, and the H1 says what the page is');
        if ((img.attrs.fetchpriority || '').toLowerCase() !== 'high') problems.push('the stone\'s <img> isn\'t fetchpriority="high": it is the page\'s largest paint');
        if (img.attrs.loading === 'lazy') problems.push('the stone\'s <img> is lazy; it must load eagerly');
    }
    const sources = findTags(picture, 'source');
    if (!sources.length) problems.push('the stone\'s <picture> has no <source>: the portrait crop for phones');
    for (const source of sources) {
        if (!(source.attrs.srcset || '').trim()) problems.push('a <source> of the stone\'s <picture> has no srcset');
        if (!(source.attrs.media || '').trim()) problems.push('a <source> of the stone\'s <picture> has no media query: the portrait crop is for phones only');
    }
    return problems;
}

function waysProblems(stone) {
    const groups = elementsHtml(stone, 'div', hasClass('rf-ways__group'));
    if (!groups.length) return ['the stone has no ways in (.rf-ways__group): the Fly Types (rf_menu_type_ids) and the Species (rf_menu_species_root_id)'];
    const problems = [];
    groups.forEach((group, index) => {
        const title = textOf(elementsHtml(group, 'h2')[0] || '');
        const name = `way group ${index + 1}${title ? ` (${title})` : ''}`;
        if (!title) problems.push(`${name} has no <h2> title`);
        const ways = elementsHtml(group, 'a', hasClass('rf-way'));
        if (!ways.length) problems.push(`${name} has no way (a.rf-way)`);
        for (const markup of ways) {
            const [way] = findTags(markup, 'a');
            const label = textOf(markup) || href(way);
            if (!isPage(href(way))) problems.push(`${name}'s way "${label}" links to "${href(way)}", not a page: the ways in are crawled`);
            if (!hasClass('rf-way--all')(way.attrs) && !(/^\d+$/.test(way.attrs['data-rf-way'] || '') && (way.attrs['data-rf-way-name'] || '').trim())) {
                problems.push(`${name}'s way "${label}" has no data-rf-way (its category id) or data-rf-way-name: home.js re-lays the stone from them`);
            }
        }
    });
    return problems;
}

function layProblems(stone) {
    const lay = outerHtml(stone, 'ul', attrs => 'data-rf-lay' in attrs);
    if (!lay) return [];
    const problems = [];
    if (!findTags(stone, 'h2').some(tag => 'data-rf-lay-title' in tag.attrs)) problems.push('the lay\'s label (data-rf-lay-title) isn\'t an <h2>: home.js rewrites it for a way\'s flies');
    if (!findTags(stone, 'a').some(tag => 'data-rf-lay-all' in tag.attrs)) problems.push('the lay has no "All" link (a[data-rf-lay-all]) for home.js to fill');
    for (const img of findTags(lay, 'img')) {
        if (img.attrs.loading === 'lazy') problems.push(`a card on the stone is lazy (${(img.attrs.src || '').slice(0, 80)}): the best sellers are in the first screen, so they load eagerly`);
        if ('fetchpriority' in img.attrs) problems.push(`a card on the stone has fetchpriority="${img.attrs.fetchpriority}": the stone's photograph is the page's only one`);
    }
    return problems;
}

// What's wrong with the stone, or nothing.
export function stoneProblems(html) {
    const stone = stoneHtml(html);
    if (!stone) return ['the home page has no stone (section.rf-stone): components/reelflies/home.html opens with it'];
    const problems = photoProblems(stone);
    const high = findTags(html).filter(tag => (tag.attrs.fetchpriority || '').toLowerCase() === 'high');
    if (high.length !== 1) problems.push(`the page has ${high.length} fetchpriority="high" elements, not 1 (the stone's photograph)`);
    const headings = elementsHtml(stone, 'h1');
    if (headings.length !== 1 || !textOf(headings[0])) problems.push(`the stone has ${headings.length} <h1> with text, not 1`);
    const [open] = findTags(stone, 'section');
    const h1Id = findTags(stone, 'h1')[0]?.attrs.id;
    if (!h1Id || open.attrs['aria-labelledby'] !== h1Id) problems.push(`the stone is labelled by "${open.attrs['aria-labelledby'] ?? ''}", not by its <h1>`);
    problems.push(...waysProblems(stone));
    const buttons = findTags(stone, 'button').filter(tag => !('data-rf-add' in tag.attrs));
    if (buttons.length) problems.push(`the stone has ${buttons.length} <button> that isn't a card's "+ Add": the ways in are links (UX-3)`);
    problems.push(...layProblems(stone));
    return problems;
}

export default {
    id: 'home-hero',
    ticket: 46,
    description: 'the stone (section.rf-stone): a <picture> with a portrait <source> and one <img> with width, height, alt="" and the page\'s only fetchpriority="high"; labelled by its one <h1>; every way in a link to a page with its data-rf-way hooks; no <button> but "+ Add"; the lay\'s <h2> and "All" link for home.js, and its cards eager',
    pages: ['home'],
    check(page) {
        return stoneProblems(page.html);
    },
};
