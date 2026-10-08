// The home page's hero in the server HTML (ticket 46; stories 11 and 70; spec seam 2): the photo
// is a real <img> with a srcset, sizes, width and height, the page's only fetchpriority="high"
// image; the H1 is the hero's heading; and both buttons are <a href> links.
//
// The hero is a widget (widgets/home-lead), placed on the store by scripts/widgets-sync.mjs, so
// the page has it only while its placement is active on the channel. The check runs whenever the
// page has the hero, and passes a page without it. It never reads the repo's record of the store
// (widgets/home-lead/channels/<channel>.json): a gate that did would fail on master and every
// open branch from each apply until the channel file's PR merged, the trap section 6.6 of the
// build pipeline removes. Whether the store holds what the repo records is the sync's check,
// run after each apply: node scripts/widgets-sync.mjs --channel <id> --verify (docs/widgets.md).

import { findTags, outerHtml } from '../html.mjs';

export const HERO_CLASS = 'rf-hero';
const WIDTHS = [320, 480, 640, 960, 1280, 1600];

const classes = tag => (tag.attrs.class || '').split(/\s+/);

// The outer HTML of the first <div> with the class, counting nested divs, or null. Comments
// and the text of scripts and styles don't count, as for findTags. The class is read as a
// browser reads it: in any quotes or none, in any case of DIV, and never from another attribute.
export const heroHtml = source => outerHtml(source, 'div', attrs => classes({ attrs }).includes(HERO_CLASS));

const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// What's wrong with the hero on the page, or nothing when the page doesn't have it.
export function heroProblems(html) {
    const hero = heroHtml(html);
    if (!hero) return [];

    const problems = [];
    const images = findTags(hero, 'img');
    if (images.length !== 1) problems.push(`the hero has ${images.length} <img> elements, not 1`);
    const [img] = images;
    if (img) {
        const { attrs } = img;
        const listed = (attrs.srcset || '').split(',').map(item => item.trim().split(/\s+/)[1]).filter(Boolean);
        const missing = WIDTHS.filter(width => !listed.includes(`${width}w`));
        if (missing.length) problems.push(`the hero <img> srcset has no ${missing.map(width => `${width}w`).join(', ')}`);
        for (const name of ['sizes', 'width', 'height']) if (!attrs[name]) problems.push(`the hero <img> has no ${name}`);
        if (attrs.fetchpriority !== 'high') problems.push('the hero <img> isn\'t fetchpriority="high"');
        if (attrs.loading === 'lazy') problems.push('the hero <img> is lazy; it must load eagerly');
    }
    const high = findTags(html).filter(tag => (tag.attrs.fetchpriority || '').toLowerCase() === 'high');
    if (high.length !== 1) problems.push(`the page has ${high.length} fetchpriority="high" elements, not 1 (the hero's photo)`);
    const headings = [...hero.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/gi)].map(([, body]) => text(body));
    if (headings.length !== 1 || !headings[0]) problems.push(`the hero has ${headings.length} <h1> with text, not 1`);
    const links = findTags(hero, 'a').filter(tag => classes(tag).some(name => name.startsWith('rf-hero__button')));
    const real = links.filter(tag => /^(\/|https?:\/\/)/.test(tag.attrs.href || ''));
    if (real.length !== 2) problems.push(`the hero has ${real.length} button links with a real href, not 2`);
    if (findTags(hero, 'button').length) problems.push('the hero has a <button>: its calls to action are links (UX-3)');
    return problems;
}

export default {
    id: 'home-hero',
    ticket: 46,
    description: 'the hero, when the page has it: a real <img> with srcset, sizes, width and height, the only fetchpriority="high"; the H1; two <a href> buttons',
    pages: ['home'],
    check(page) {
        return heroProblems(page.html);
    },
};
