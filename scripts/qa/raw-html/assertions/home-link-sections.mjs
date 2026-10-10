// The home page's link sections as served (ticket 49; spec module 7, R5, CD-4, CD-9, SEO-6, SEO-8;
// stories 13, 65, 68): the Species section ("Shop by fish", widgets/shop-by-fish, section.rf-species)
// and the About block (widgets/about, section.rf-about), wherever the page has them. A page
// without them passes, as the widgets go up inactive and an R12 unpublish takes one away.
//
// - Each section is named by its one <h2> (aria-labelledby), so its heading is the page outline's.
// - Every photo in them is a server-rendered <img> with a srcset of two or more candidates, sizes,
//   a width and a height, loading="lazy" and no fetchpriority (the hero's is the page's only
//   one), and no element in them sets a photo as a CSS background (SEO-8).
// - Each Species group's photo is one link to a page, holding its <img>, its name (<h3>) and a
//   visible call to action (a <span>), with nothing interactive inside; each pill is a link to a
//   page. No link in either section goes to a hidden size category (SEO-6, UX-16).
// - The page's one allowed repeat (an <img> or <source> marked data-rf-photo-repeat: the cold-water
//   group's crop of the Dry banner) sits a section or more away from the photo it repeats: at
//   least one widget between their widgets (CD-4). home-photo-once is what leaves the mark out of
//   its count.
// - The About block carries no product card or price (CD-9), its photo has alt text (it says
//   where the shop is), and its phone link dials +1 and ten digits, as the footer's does.

import {
    decodeHtml, elementsHtml, findTags, textOf,
} from '../html.mjs';
import { photosOn } from './home-photo-once.mjs';

const hasClass = name => attrs => (attrs.class || '').split(/\s+/).includes(name);
const INTERACTIVE = /^(a|button|input|select|textarea|details|iframe)$/;
const SIZE_LINK = /\/fly-sizes\//;
const PRICE = /\$\s?\d[\d,]*\.\d{2}/;
const TEL = /^tel:\+1\d{10}$/;
const href = tag => decodeHtml(tag.attrs.href ?? '').trim();
const isPage = url => url !== '' && !url.startsWith('#') && !/^javascript:/i.test(url);

// The section's one <h2>, and the label it is named by.
function headingProblems(section, name) {
    const h2s = findTags(section, 'h2');
    if (h2s.length !== 1) return [`${name} has ${h2s.length} <h2> elements: each section has exactly one`];
    const [open] = findTags(section, 'section');
    const label = open?.attrs['aria-labelledby'];
    if (!label || label !== h2s[0].attrs.id) return [`${name} is labelled by "${label ?? ''}", not by its <h2>`];
    return [];
}

// SEO-8: every photo a lazy <img> with its srcset, sizes and box; no CSS background photo.
function photoProblems(section, name) {
    const problems = [];
    const imgs = findTags(section, 'img');
    imgs.forEach((img, index) => {
        const which = imgs.length > 1 ? `${name}'s <img> ${index + 1}` : `${name}'s <img>`;
        const srcset = (img.attrs.srcset || '').split(',').map(item => item.trim()).filter(Boolean);
        ['srcset', 'sizes', 'width', 'height'].forEach(attr => {
            if (!(img.attrs[attr] || '').trim()) problems.push(`${which} has no ${attr}`);
        });
        if (img.attrs.srcset && srcset.length < 2) problems.push(`${which}'s srcset has ${srcset.length} candidate: it needs two or more`);
        if (img.attrs.loading !== 'lazy') problems.push(`${which} isn't loading="lazy"`);
        if ('fetchpriority' in img.attrs) problems.push(`${which} has fetchpriority="${img.attrs.fetchpriority}": the hero's photo is the page's only one`);
    });
    for (const tag of findTags(section)) {
        if (/background(-image)?\s*:[^;]*url\(/i.test(tag.attrs.style || '')) problems.push(`${name} sets a photo as a CSS background: style="${tag.attrs.style}"`);
    }
    for (const link of findTags(section, 'a')) {
        if (SIZE_LINK.test(href(link))) problems.push(`${name} links to ${href(link)}, a hidden size category (SEO-6)`);
    }
    return problems;
}

function speciesProblems(section) {
    const title = textOf(elementsHtml(section, 'h2')[0] || '');
    const name = `the Species section${title ? ` (${title})` : ''}`;
    const problems = [...headingProblems(section, name), ...photoProblems(section, name)];
    elementsHtml(section, 'a', hasClass('rf-species-group__link')).forEach((link, index) => {
        const group = `group ${index + 1}${elementsHtml(link, 'h3')[0] ? ` (${textOf(elementsHtml(link, 'h3')[0])})` : ''}`;
        const [open, ...inside] = findTags(link);
        if (!isPage(href(open))) problems.push(`${group} links to "${href(open)}", not a page`);
        if (findTags(link, 'img').length !== 1) problems.push(`${group} has ${findTags(link, 'img').length} photos in its link: it has one`);
        if (!textOf(elementsHtml(link, 'h3')[0] || '')) problems.push(`${group} has no name (<h3>) in its link`);
        const cta = elementsHtml(link, 'span', hasClass('rf-species-group__cta'));
        if (!cta.length || !textOf(cta[0])) problems.push(`${group} has no call to action (.rf-species-group__cta, a <span>) in its link`);
        for (const tag of inside.filter(item => INTERACTIVE.test(item.name) || 'tabindex' in item.attrs)) {
            problems.push(`${group} has <${tag.name}> inside its link: nothing interactive goes inside a link`);
        }
    });
    elementsHtml(section, 'a', hasClass('rf-species-pill')).forEach(pill => {
        const [open] = findTags(pill, 'a');
        if (!isPage(href(open))) problems.push(`the Species section's pill "${textOf(pill)}" links to "${href(open)}", not a page`);
    });
    return problems;
}

function aboutProblems(section) {
    const name = 'the About block';
    const problems = [...headingProblems(section, name), ...photoProblems(section, name)];
    for (const img of findTags(section, 'img')) {
        if (!(img.attrs.alt || '').trim()) problems.push(`${name}'s photo has no alt text: it says where the shop is`);
    }
    for (const tag of findTags(section)) {
        if ((tag.attrs.class || '').split(/\s+/).some(token => /(^|[-_])(card|price)([-_]|$)/i.test(token))) {
            problems.push(`${name} holds a price or product card (class="${tag.attrs.class}"): it carries none`);
        }
        if ('data-product-id' in tag.attrs) problems.push(`${name} holds a price or product card (data-product-id="${tag.attrs['data-product-id']}"): it carries none`);
    }
    const price = textOf(section).match(PRICE);
    if (price) problems.push(`${name} shows a price, ${price[0]}: it carries none`);
    for (const link of findTags(section, 'a').filter(tag => href(tag).toLowerCase().startsWith('tel:'))) {
        if (!TEL.test(href(link))) problems.push(`${name}'s phone link "${href(link)}" isn't tel:+1 and ten digits`);
    }
    return problems;
}

// CD-4: each marked repeat at least one widget away from every widget that shows its photo unmarked.
function repeatProblems(html) {
    const widgets = elementsHtml(html, 'div', attrs => 'data-widget-id' in attrs).map(widget => photosOn(widget));
    const problems = [];
    widgets.forEach((photos, at) => {
        for (const photo of photos.filter(({ repeat }) => repeat)) {
            for (const key of photo.keys) {
                const shown = widgets.flatMap((others, index) => (others.some(other => !other.repeat && other.keys.includes(key)) ? [index] : []));
                const near = shown.filter(index => Math.abs(index - at) < 2);
                if (near.length) {
                    const where = near.includes(at) ? 'in the same widget as one that shows it' : `in the widget right ${near[0] < at ? 'after' : 'before'} the one that shows it`;
                    problems.push(`the photo ${key}, marked data-rf-photo-repeat, is ${where}: put a section or more between them (CD-4)`);
                }
            }
        }
    });
    return [...new Set(problems)];
}

export function linkSectionProblems(html) {
    return [
        ...elementsHtml(html, 'section', hasClass('rf-species')).flatMap(speciesProblems),
        ...elementsHtml(html, 'section', hasClass('rf-about')).flatMap(aboutProblems),
        ...repeatProblems(html),
    ];
}

export default {
    id: 'home-link-sections',
    ticket: 49,
    description: 'the Species section and the About block, where the page has them: one <h2> each, lazy photos with srcset, sizes, width and height and no CSS background, each group\'s photo one clean link, no link to a hidden size category, the marked repeat a section or more from the photo it repeats, and no product card or price in About',
    pages: ['home'],
    check(page) {
        return linkSectionProblems(page.html);
    },
};
