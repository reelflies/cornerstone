// The home page's link sections as served (redesign step 2, DESIGN.md "Region mapping"; the rules
// of ticket 49's Species section and About block carried over; spec module 7, R5, CD-4, CD-9,
// SEO-6, SEO-8; stories 13, 65 and 68): the Fly Type plates (section.rf-types), the Species band
// (section.rf-species) and the shop (section.rf-shop), wherever the page has them. The plates and
// the Species band are left out while their menu ids are empty, so a page without them passes.
//
// - Each section is named by its one <h2> (aria-labelledby), so its heading is the page outline's.
// - The plates: each plate (li.rf-plate) a photo link (a.rf-plate__photo) to a page with its name
//   (.rf-plate__name), and each row plate (li.rf-row-plate) a link (a.rf-row-plate__link) with its
//   name; at most three plates, the rest row plates. Every photo in the section is a lazy <img>
//   with a srcset of two or more candidates, sizes, width, height, alt="" and no fetchpriority
//   (SEO-8), nothing interactive sits inside a link, every link goes to a page, so a crawler
//   follows the Fly Types and their subcategories with no JavaScript, and none goes to a hidden
//   size category (/fly-sizes/, SEO-6).
// - The Species band carries data-rf-species, lists each species as a link to its page (a.rf-sp)
//   with data-rf-sp and data-rf-sp-name, which home.js reads to lay its flies, and holds the lay's
//   region ([data-rf-sp-region], hidden on the server, with its title, its "All" link and its
//   empty list): a species' flies are laid in the browser, from 1040px.
// - The shop carries no product card or price (CD-9), its photo has alt text (it says where the
//   shop is) and is lazy, and its phone link dials +1 and ten digits (RFC 3966's separators
//   allowed), as the footer's does.

import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../html.mjs';

const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const INTERACTIVE = /^(a|button|input|select|textarea|details|iframe)$/;
const SIZE_LINK = /\/fly-sizes\//;
const PRICE = /\$\s?\d[\d,]*\.\d{2}/;
// A tel: link a phone can dial: +1 and ten digits, with RFC 3966's visual separators allowed, as
// the footer's rule (rf-footer) reads the same store phone (rf_store_phone).
const dialable = link => /^tel:\+1[\d().-]*$/.test(link) && link.replace(/\D/g, '').length === 11;
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();
const isPage = url => /^(\/|https?:\/\/)/.test(url);

// The section's one <h2>, and the label it is named by.
function headingProblems(section, name) {
    const h2s = findTags(section, 'h2');
    if (h2s.length !== 1) return [`${name} has ${h2s.length} <h2> elements: each section has exactly one`];
    const [open] = findTags(section, 'section');
    const label = open?.attrs['aria-labelledby'];
    if (!label || label !== h2s[0].attrs.id) return [`${name} is labelled by "${label ?? ''}", not by its <h2>`];
    return [];
}

// SEO-8: a lazy <img> with its srcset, sizes and box, and no fetchpriority.
function lazyPhotoProblems(img, which, { srcset = true, alt = '' } = {}) {
    const problems = [];
    for (const attr of [...(srcset ? ['srcset', 'sizes'] : []), 'width', 'height']) {
        if (!(img.attrs[attr] || '').trim()) problems.push(`${which} has no ${attr}`);
    }
    const candidates = (img.attrs.srcset || '').split(',').map(item => item.trim()).filter(Boolean);
    if (srcset && img.attrs.srcset && candidates.length < 2) problems.push(`${which}'s srcset has ${candidates.length} candidate: it needs two or more`);
    if (alt === '' && img.attrs.alt !== '') problems.push(`${which} needs alt="": the link's text names it`);
    if (alt === 'text' && !(img.attrs.alt || '').trim()) problems.push(`${which} has no alt text: it says where the shop is`);
    if (img.attrs.loading !== 'lazy') problems.push(`${which} isn't loading="lazy"`);
    if ('fetchpriority' in img.attrs) problems.push(`${which} has fetchpriority="${img.attrs.fetchpriority}": the stone's photograph is the page's only one`);
    return problems;
}

// A link to a page with nothing interactive inside it.
function linkProblems(link, what) {
    const [open, ...inside] = findTags(link);
    const problems = [];
    if (!isPage(href(open))) problems.push(`${what} links to "${href(open)}", not a page`);
    for (const tag of inside.filter(item => INTERACTIVE.test(item.name) || 'tabindex' in item.attrs)) {
        problems.push(`${what} has <${tag.name}> inside its link: nothing interactive goes inside a link`);
    }
    return problems;
}

// Every link in the section goes to a page, and none to a hidden size category.
function everyLinkProblems(section, name, exempt = () => false) {
    const problems = [];
    for (const link of findTags(section, 'a').filter(tag => !exempt(tag))) {
        if (!isPage(href(link))) problems.push(`${name} has a link to "${href(link)}", not a page`);
        else if (SIZE_LINK.test(href(link))) problems.push(`${name} links to ${href(link)}, a hidden size category (SEO-6)`);
    }
    return problems;
}

function platesProblems(section) {
    const name = 'the Fly Type plates';
    const problems = headingProblems(section, name);
    const plates = elementsHtml(section, 'li', hasClass('rf-plate'));
    const rows = elementsHtml(section, 'li', hasClass('rf-row-plate'));
    if (!plates.length) problems.push(`${name} has no plate (li.rf-plate)`);
    if (plates.length > 3) problems.push(`${name} has ${plates.length} plates: the first three Fly Types are plates, the rest row plates`);
    plates.forEach((plate, index) => {
        const title = textOf(elementsHtml(plate, 'span', hasClass('rf-plate__name'))[0] || '');
        const what = `plate ${index + 1}${title ? ` (${title})` : ''}`;
        if (!title) problems.push(`${what} has no name (.rf-plate__name)`);
        const [link] = elementsHtml(plate, 'a', hasClass('rf-plate__photo'));
        if (!link) problems.push(`${what} has no photo link (a.rf-plate__photo)`);
        else problems.push(...linkProblems(link, `${what}'s photo`));
        if (elementsHtml(plate, 'ul', hasClass('rf-plate__kids')).length && !elementsHtml(plate, 'a', hasClass('rf-plate__all')).length) {
            problems.push(`${what} lists its subcategories with no "All" link (a.rf-plate__all)`);
        }
    });
    rows.forEach((row, index) => {
        const title = textOf(elementsHtml(row, 'span', hasClass('rf-row-plate__name'))[0] || '');
        const what = `row plate ${index + 1}${title ? ` (${title})` : ''}`;
        if (!title) problems.push(`${what} has no name (.rf-row-plate__name)`);
        const [link] = elementsHtml(row, 'a', hasClass('rf-row-plate__link'));
        if (!link) problems.push(`${what} has no link (a.rf-row-plate__link)`);
        else problems.push(...linkProblems(link, what));
    });
    const imgs = findTags(section, 'img');
    imgs.forEach((img, index) => problems.push(...lazyPhotoProblems(img, imgs.length > 1 ? `${name}' <img> ${index + 1}` : `${name}' <img>`)));
    problems.push(...everyLinkProblems(section, name));
    return problems;
}

function speciesProblems(section) {
    const name = 'the Species band';
    const problems = headingProblems(section, name);
    const [open] = findTags(section, 'section');
    if (!('data-rf-species' in open.attrs)) problems.push(`${name} has no data-rf-species: home.js finds it by that`);
    const species = elementsHtml(section, 'a', hasClass('rf-sp'));
    if (!species.length) problems.push(`${name} lists no species (a.rf-sp)`);
    for (const markup of species) {
        const [tag] = findTags(markup, 'a');
        const label = textOf(elementsHtml(markup, 'span', hasClass('rf-sp__name'))[0] || markup) || href(tag);
        problems.push(...linkProblems(markup, `${name}'s species "${label}"`));
        if (!/^\d+$/.test(tag.attrs['data-rf-sp'] || '') || !(tag.attrs['data-rf-sp-name'] || '').trim()) {
            problems.push(`${name}'s species "${label}" has no data-rf-sp (its category id) or data-rf-sp-name: home.js lays its flies from them`);
        }
    }
    const region = outerHtml(section, 'div', attrs => 'data-rf-sp-region' in attrs);
    if (!region) problems.push(`${name} has no lay region ([data-rf-sp-region]) for home.js to fill`);
    else {
        const [regionOpen] = findTags(region, 'div');
        if (!('hidden' in regionOpen.attrs)) problems.push(`${name}'s lay region isn't hidden on the server: home.js shows it with a species' flies from 1040px`);
        for (const [attr, what] of [['data-rf-sp-title', 'its title'], ['data-rf-sp-all', 'its "All" link'], ['data-rf-sp-lay', 'its list']]) {
            if (!findTags(region).some(tag => attr in tag.attrs)) problems.push(`${name}'s lay region has no ${what} ([${attr}])`);
        }
        const lay = outerHtml(region, 'ul', attrs => 'data-rf-sp-lay' in attrs);
        if (lay && findTags(lay, 'li').length) problems.push(`${name}'s lay holds cards on the server: home.js lays a species' flies in the browser`);
    }
    const imgs = findTags(section, 'img');
    imgs.forEach((img, index) => problems.push(...lazyPhotoProblems(img, imgs.length > 1 ? `${name}'s <img> ${index + 1}` : `${name}'s <img>`)));
    problems.push(...everyLinkProblems(section, name, tag => 'data-rf-sp-all' in tag.attrs));
    return problems;
}

function shopProblems(section) {
    const name = 'the shop';
    const problems = headingProblems(section, name);
    const imgs = findTags(section, 'img');
    if (!imgs.length) problems.push(`${name} has no photograph`);
    imgs.forEach((img, index) => problems.push(...lazyPhotoProblems(img, imgs.length > 1 ? `${name}'s <img> ${index + 1}` : `${name}'s <img>`, { srcset: false, alt: 'text' })));
    for (const tag of findTags(section)) {
        if ('data-rf-product' in tag.attrs) problems.push(`${name} holds a product card (data-rf-product="${tag.attrs['data-rf-product']}"): it carries none (CD-9)`);
    }
    const price = textOf(section).match(PRICE);
    if (price) problems.push(`${name} shows a price, ${price[0]}: it carries none (CD-9)`);
    for (const link of findTags(section, 'a')) {
        const url = href(link);
        if (url.toLowerCase().startsWith('tel:')) {
            if (!dialable(url)) problems.push(`${name}'s phone link "${url}" isn't tel:+1 and ten digits`);
        } else if (!isPage(url)) problems.push(`${name} has a link to "${url}", not a page`);
    }
    return problems;
}

export function linkSectionProblems(html) {
    return [
        ...elementsHtml(html, 'section', hasClass('rf-types')).flatMap(platesProblems),
        ...elementsHtml(html, 'section', hasClass('rf-species')).flatMap(speciesProblems),
        ...elementsHtml(html, 'section', hasClass('rf-shop')).flatMap(shopProblems),
    ];
}

export default {
    id: 'home-link-sections',
    ticket: 49,
    description: 'the Fly Type plates, the Species band and the shop, where the page has them: one <h2> each; every plate and row plate a link to a page with its name, every photo a lazy <img> with srcset, sizes, width, height and alt="", nothing interactive inside a link, no link to a hidden size category; each species a link with its data-rf-sp hooks and the lay region hidden and empty for home.js; the shop\'s photo with alt text, a tel:+1 phone link, and no card or price',
    pages: ['home'],
    check(page) {
        return linkSectionProblems(page.html);
    },
};
