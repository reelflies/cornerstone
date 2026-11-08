// The home page's product bands in the server HTML (redesign step 2, DESIGN.md "Cards"; the rules
// of ticket 48's bands carried to the specimen card, components/reelflies/fly.html; SEO-8, HOME-4;
// stories 17, 18, 68 and 70; spec seam 2): the best sellers laid on the stone (ul[data-rf-lay]),
// each hatch row's flies (li.rf-hatch__row .rf-hatch__flies), the Signature band
// (section.rf-signature) and the Selections (section.rf-selections).
//
// - The bands come in home.html's order: the stone, the Fly Types, the hatch chart, the Species,
//   the Signature, the Selections, the shop. A band whose data is missing is left out.
// - The Signature band and the Selections are each labelled by their one <h2> (the stone's lay by
//   its <h2> label, home-hero's). Each band's "All …" link (a.rf-more) goes to a page and its
//   label carries no number (HOME-4): the count the Signature band types is the categories data's.
// - Each card (li.rf-fly[data-rf-product], a product id) has a photo link (a.rf-fly__photo to the
//   product page, tabindex="-1" aria-hidden="true": the name is the link that reads) holding one
//   <img> with src, srcset, sizes, width, height and alt="", its name (h3.rf-fly__name) a link to
//   the same page, a price (.rf-fly__price) and the reserved line (.rf-fly__line) with the in-box
//   tag quick-add.js fills ([data-rf-inbox], hidden on the server). Nothing interactive sits
//   inside a link, and no form control is on the server.
// - Each card buys one way: with rf_quick_add on, "+ Add" (button.rf-add[data-rf-add="sizes"|"one"],
//   type="button", aria-expanded="false") and the hidden size panel it opens ([data-rf-sizes]);
//   off, or sold out, a link (a.rf-add--link) to the product page.
// - The cards on the stone are in the first screen, so they load eagerly, with no fetchpriority
//   (the stone's photograph is the page's only one); every other band is below it, so its cards
//   are loading="lazy" (SEO-8).
// - A Selection is priced per set, never "/ fly" (story 18).
// - Every card on the page is in one of these bands.

import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();
const isPage = url => /^(\/|https?:\/\/)/.test(url);
const INTERACTIVE = ['a', 'button', 'input', 'select', 'textarea', 'details', 'iframe'];
const CONTROLS = ['input', 'select', 'textarea', 'form'];

// home.html's bands, top to bottom, by class.
export const BAND_ORDER = ['rf-stone', 'rf-types', 'rf-hatch', 'rf-species', 'rf-signature', 'rf-selections', 'rf-shop'];

// The home's sections on the page, in page order, each { name, html }.
export const homeSections = html => elementsHtml(html, 'section', attrs => BAND_ORDER.some(name => hasClass(name)(attrs)))
    .map(section => ({ name: BAND_ORDER.find(name => hasClass(name)(findTags(section, 'section')[0].attrs)), html: section }));

// Every card: each li[data-rf-product]'s whole markup.
export const cards = html => elementsHtml(html, 'li', attrs => 'data-rf-product' in attrs);

// The product bands on the page, in page order: { name, html, eager, labelled, unit }.
export function productBands(html) {
    const bands = [];
    const stone = outerHtml(html, 'section', hasClass('rf-stone'));
    const lay = stone && outerHtml(stone, 'ul', attrs => 'data-rf-lay' in attrs);
    if (lay) bands.push({ name: 'the stone\'s lay', html: lay, eager: true });
    const hatch = outerHtml(html, 'section', hasClass('rf-hatch'));
    for (const row of hatch ? elementsHtml(hatch, 'li', hasClass('rf-hatch__row')) : []) {
        const flies = outerHtml(row, 'div', hasClass('rf-hatch__flies'));
        const title = textOf(elementsHtml(row, 'span', hasClass('rf-hatch__title'))[0] || '');
        if (flies) bands.push({ name: `the ${title || 'hatch'} row`, html: flies, eager: false });
    }
    for (const [cls, name, unit] of [['rf-signature', 'the Signature band', null], ['rf-selections', 'the Selections', 'set']]) {
        const section = outerHtml(html, 'section', hasClass(cls));
        if (section) {
            bands.push({
                name, html: section, eager: false, labelled: true, unit,
            });
        }
    }
    return bands;
}

function photoProblems(link, what, { eager }) {
    const problems = [];
    const images = findTags(link, 'img');
    if (images.length !== 1) return [`${what} has ${images.length} <img> elements in its photo link, not 1`];
    const { attrs } = images[0];
    if (attrs.alt !== '') problems.push(`${what}'s <img> needs alt="": the card's name says what it is`);
    for (const name of ['src', 'srcset', 'sizes', 'width', 'height']) if (!(attrs[name] || '').trim()) problems.push(`${what}'s <img> has no ${name}`);
    if ('fetchpriority' in attrs) problems.push(`${what}'s <img> has fetchpriority="${attrs.fetchpriority}": the stone's photograph is the page's only one`);
    if (eager && attrs.loading === 'lazy') problems.push(`${what}'s <img> is lazy: the cards on the stone are in the first screen and load eagerly`);
    if (!eager && attrs.loading !== 'lazy') problems.push(`${what}'s <img> isn't loading="lazy": its band sits below the first screen (SEO-8)`);
    return problems;
}

function buyProblems(card, what) {
    const problems = [];
    const buttons = findTags(card, 'button').filter(tag => 'data-rf-add' in tag.attrs);
    const links = elementsHtml(card, 'a', hasClass('rf-add--link'));
    const panels = findTags(card).filter(tag => 'data-rf-sizes' in tag.attrs);
    if (buttons.length + links.length !== 1) problems.push(`${what} has ${buttons.length} "+ Add" button(s) and ${links.length} buy link(s): each card buys one way`);
    for (const button of buttons) {
        if (!['sizes', 'one'].includes(button.attrs['data-rf-add'])) problems.push(`${what}'s "+ Add" is data-rf-add="${button.attrs['data-rf-add']}", not "sizes" or "one"`);
        if (button.attrs.type !== 'button') problems.push(`${what}'s "+ Add" isn't type="button"`);
        if (button.attrs['aria-expanded'] !== 'false') problems.push(`${what}'s "+ Add" isn't aria-expanded="false" on the server: its size panel opens in the browser`);
    }
    if (buttons.length && panels.length !== 1) problems.push(`${what} has ${panels.length} size panel(s) ([data-rf-sizes]), not 1: "+ Add" opens one`);
    if (!buttons.length && panels.length) problems.push(`${what} has a size panel with no "+ Add" to open it`);
    if (panels.some(panel => !('hidden' in panel.attrs))) problems.push(`${what}'s size panel isn't hidden on the server`);
    for (const link of links) {
        const [open] = findTags(link, 'a');
        if (!isPage(href(open))) problems.push(`${what}'s buy link goes to "${href(open)}", not the product page`);
    }
    const controls = findTags(card).filter(tag => CONTROLS.includes(tag.name));
    if (controls.length) problems.push(`${what} has ${controls.map(tag => `<${tag.name}>`).join(', ')}: a card holds no form control on the server`);
    return problems;
}

export function cardProblems(card, what, band = { eager: false }) {
    const problems = [];
    const [open] = findTags(card, 'li');
    if (!/^\d+$/.test(open.attrs['data-rf-product'] || '')) problems.push(`${what}'s data-rf-product is "${open.attrs['data-rf-product'] ?? ''}", not a product id`);
    const [nameLink] = elementsHtml(elementsHtml(card, 'h3', hasClass('rf-fly__name'))[0] || '', 'a');
    const nameHref = nameLink ? href(findTags(nameLink, 'a')[0]) : null;
    if (!nameLink) problems.push(`${what} has no name link (h3.rf-fly__name > a)`);
    else {
        if (!isPage(nameHref)) problems.push(`${what}'s name links to "${nameHref}", not a page`);
        if (!textOf(nameLink)) problems.push(`${what}'s name is empty`);
    }
    const [photoLink] = elementsHtml(card, 'a', hasClass('rf-fly__photo'));
    if (!photoLink) problems.push(`${what} has no photo link (a.rf-fly__photo)`);
    else {
        const [tag] = findTags(photoLink, 'a');
        if (!isPage(href(tag))) problems.push(`${what}'s photo links to "${href(tag)}", not a page`);
        else if (nameHref && href(tag) !== nameHref) problems.push(`${what}'s photo links to ${href(tag)} and its name to ${nameHref}: both go to the product page`);
        if (tag.attrs.tabindex !== '-1' || tag.attrs['aria-hidden'] !== 'true') problems.push(`${what}'s photo link isn't tabindex="-1" aria-hidden="true": the name is the link that reads, so the photo's doesn't repeat it`);
        problems.push(...photoProblems(photoLink, what, band));
    }
    for (const link of elementsHtml(card, 'a')) {
        const nested = findTags(link).slice(1).filter(tag => INTERACTIVE.includes(tag.name));
        if (nested.length) problems.push(`${what} has ${nested.map(tag => `<${tag.name}>`).join(', ')} inside a link: nothing interactive goes inside a link`);
    }
    if (!textOf(elementsHtml(card, 'p', hasClass('rf-fly__price'))[0] || '')) problems.push(`${what} has no price (.rf-fly__price)`);
    const [line] = elementsHtml(card, 'p', hasClass('rf-fly__line'));
    if (!line) problems.push(`${what} has no reserved line (.rf-fly__line)`);
    else {
        const tag = findTags(line).find(item => 'data-rf-inbox' in item.attrs);
        if (!tag) problems.push(`${what}'s line has no in-box tag ([data-rf-inbox]) for quick-add.js to fill`);
        else if (!('hidden' in tag.attrs)) problems.push(`${what}'s in-box tag isn't hidden on the server: a cached page never shows another shopper's box`);
    }
    problems.push(...buyProblems(card, what));
    return problems;
}

function bandProblems(band) {
    const problems = [];
    if (band.labelled) {
        const h2s = findTags(band.html, 'h2');
        const [open] = findTags(band.html, 'section');
        if (h2s.length !== 1) problems.push(`${band.name} has ${h2s.length} <h2> elements: it has exactly one`);
        else if (!h2s[0].attrs.id || open.attrs['aria-labelledby'] !== h2s[0].attrs.id) problems.push(`${band.name} is labelled by "${open.attrs['aria-labelledby'] ?? ''}", not by its <h2>`);
        for (const more of elementsHtml(band.html, 'a', hasClass('rf-more'))) {
            const [link] = findTags(more, 'a');
            const label = textOf(more);
            if (!isPage(href(link))) problems.push(`${band.name}'s link "${label}" goes to "${href(link)}", not a page`);
            if (/\d/.test(label)) problems.push(`${band.name}'s link says "${label}": a label carries no number (HOME-4)`);
        }
    }
    const list = cards(band.html);
    if (!list.length) problems.push(`${band.name} has no card (li[data-rf-product])`);
    list.forEach((card, index) => {
        const name = textOf(elementsHtml(card, 'h3')[0] || '');
        const what = `${band.name}'s card ${index + 1}${name ? ` (${name})` : ''}`;
        problems.push(...cardProblems(card, what, band));
        if (band.unit === 'set') {
            const unit = textOf(elementsHtml(card, 'span', hasClass('rf-fly__unit'))[0] || '');
            if (/\bfly\b/i.test(unit)) problems.push(`${what} shows the unit "${unit}": a Selection is priced per set (story 18)`);
        }
    });
    return problems;
}

export function productBandsProblems(html) {
    const problems = [];
    const sections = homeSections(html);
    const order = sections.map(({ name }) => BAND_ORDER.indexOf(name));
    if (order.some((at, index) => index && at < order[index - 1])) problems.push(`the home page's bands are out of order (${sections.map(({ name }) => name).join(', ')}): home.html lays them ${BAND_ORDER.join(', ')}`);
    const bands = productBands(html);
    for (const band of bands) problems.push(...bandProblems(band));
    const outside = cards(html).length - bands.reduce((sum, band) => sum + cards(band.html).length, 0);
    if (outside) problems.push(`${outside} card(s) sit outside the product bands: a fly is laid on the stone, in a hatch row, in the Signature band or among the Selections`);
    return problems;
}

export default {
    id: 'home-product-bands',
    ticket: 48,
    description: 'the bands in home.html\'s order; the stone\'s lay, each hatch row\'s flies, the Signature band and the Selections: an <h2> label and page links with no number; each card one product with a hidden-from-readers photo link holding one <img> (src, srcset, sizes, width, height, alt=""), a name link to the same page, a price, the reserved line with its hidden in-box tag, and one buy control ("+ Add" with its hidden size panel, or a link); the stone\'s cards eager, every other band\'s lazy, none with fetchpriority; no "/ fly" on a Selection',
    pages: ['home'],
    check(page) {
        return productBandsProblems(page.html);
    },
};
