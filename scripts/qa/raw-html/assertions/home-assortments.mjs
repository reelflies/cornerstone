// The home page's Assortments band as served (ticket 49; spec module 7, R5, HOME-4, SEO-6;
// stories 18 and 68): widgets/assortments-band, a <section data-rf-band="assortments">, wherever
// the page has it. A page without it passes, as the widget goes up inactive and an R12 unpublish
// takes it away.
//
// - The band is named by its one <h2> (aria-labelledby), so its heading is the page outline's.
// - Its copy says the fly boxes in the photos are not included (story 18: they are shown for
//   scale), and types no price or number: prices and counts come from the storefront query
//   (HOME-4).
// - Its link (a.rf-assortments__link) goes to a page, never to a hidden size category (SEO-6),
//   and its label carries no number.
// - No card shows a unit: an Assortment is priced per set, never "/ fly".
// - It sits after the Signature band and the Species section and before the About block, as
//   their placements' sort_order puts them (30, 40, 50 and 70), where the page has them.
//
// Each card's own rules (one <a href> with nothing interactive inside, the lazy photo's
// attributes, no "+ Add") are ticket 48's home-product-bands', which checks every
// section[data-rf-band]. Like it, this judges the page and never reads the repo's record of the
// store; whether each card's price is its product page's is ticket 49's live check, after probe 13
// and the apply.

import {
    decodeHtml, elementsHtml, findTags, textOf,
} from '../html.mjs';

export const BAND = 'assortments';
const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const NOT_INCLUDED = /fly box(es)?\b[^.]*\bnot included/i;
const PRICE = /\$\s?\d[\d,]*(\.\d{2})?/;
const NUMBER = /\d[\d,.]*/;
const SIZE_LINK = /\/fly-sizes\//;
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();
const isPage = url => url !== '' && !url.startsWith('#') && !/^javascript:/i.test(url);
const NEIGHBOURS = [
    {
        name: 'the Signature band', test: attrs => attrs['data-rf-band'] === 'signature', after: true, order: 30,
    },
    {
        name: 'the Species section', test: hasClass('rf-species'), after: true, order: 40,
    },
    {
        name: 'the About block', test: hasClass('rf-about'), after: false, order: 70,
    },
];

function headingProblems(band) {
    const h2s = findTags(band, 'h2');
    if (h2s.length !== 1) return [`the Assortments band has ${h2s.length} <h2> elements: it has exactly one`];
    const label = findTags(band, 'section')[0]?.attrs['aria-labelledby'];
    if (!label || label !== h2s[0].attrs.id) return [`the Assortments band is labelled by "${label ?? ''}", not by its <h2>`];
    return [];
}

// The band without its cards, and without its link: the heading and the text.
function copyOf(band) {
    let copy = band;
    for (const part of [...elementsHtml(band, 'ul', hasClass('rf-product-cards')), ...elementsHtml(band, 'a', hasClass('rf-assortments__link'))]) copy = copy.replace(part, ' ');
    return textOf(copy);
}

function copyProblems(band) {
    const copy = copyOf(band);
    const problems = [];
    if (!NOT_INCLUDED.test(copy)) problems.push('the Assortments band\'s copy doesn\'t say the fly boxes are not included: its photos show them for scale (story 18)');
    const typed = copy.match(PRICE) || copy.match(NUMBER);
    if (typed) problems.push(`the Assortments band's copy types "${typed[0]}": prices and counts come from the query, never the copy (HOME-4)`);
    return problems;
}

function linkProblems(band) {
    const [link] = elementsHtml(band, 'a', hasClass('rf-assortments__link'));
    if (!link) return ['the Assortments band has no link to the Fly Selections & Assortments page (a.rf-assortments__link)'];
    const [open] = findTags(link, 'a');
    const url = href(open);
    const label = textOf(link);
    const problems = [];
    if (!isPage(url)) problems.push(`the Assortments band's link goes to "${url}", not a page`);
    else if (SIZE_LINK.test(url)) problems.push(`the Assortments band's link goes to ${url}, a hidden size category (SEO-6)`);
    if (/\d/.test(label)) problems.push(`the Assortments band's link says "${label}": a label carries no number (HOME-4)`);
    return problems;
}

function unitProblems(band) {
    return elementsHtml(band, 'a', hasClass('rf-product-card')).flatMap((card, index) => {
        const name = textOf(elementsHtml(card, 'h3')[0] || '');
        const unit = elementsHtml(card, 'span', hasClass('rf-product-card__unit')).map(textOf).find(Boolean)
            || textOf(card).match(/\/\s*fly\b/i)?.[0];
        return unit ? [`Assortments card ${index + 1}${name ? ` (${name})` : ''} shows the unit "${unit}": an Assortment is priced per set, with no unit (story 18)`] : [];
    });
}

// Where the page has the band's neighbours, the band sits between them in placement order.
function orderProblems(html, band) {
    const at = html.indexOf(band);
    return NEIGHBOURS.flatMap(({
        name, test, after, order,
    }) => {
        const [other] = elementsHtml(html, 'section', test);
        if (!other) return [];
        const otherAt = html.indexOf(other);
        if (after && at < otherAt) return [`the Assortments band comes before ${name}: it follows it (sort_order 50 after ${order})`];
        if (!after && at > otherAt) return [`the Assortments band comes after ${name}: it goes before it (sort_order 50 before ${order})`];
        return [];
    });
}

export function assortmentsProblems(html) {
    return elementsHtml(html, 'section', attrs => attrs['data-rf-band'] === BAND).flatMap(band => [
        ...headingProblems(band),
        ...copyProblems(band),
        ...linkProblems(band),
        ...unitProblems(band),
        ...orderProblems(html, band),
    ]);
}

export default {
    id: 'home-assortments',
    ticket: 49,
    description: 'the Assortments band, where the page has it: one <h2> that names it; copy that says the fly boxes are not included and types no price or number; its link to a page, not a size category, with no number; no unit on any card; and after the Signature band and the Species section, before About',
    pages: ['home'],
    check(page) {
        return assortmentsProblems(page.html);
    },
};
