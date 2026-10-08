// The home page's three big Fly Type cards and six tiles in the server HTML (ticket 47; stories
// 11, 68 and 70; SEO-8; spec seam 2):
//
// - Each card (.rf-type-card) and tile (.rf-link-tile) is exactly one <a href> to a page, with no
//   link, button or form control inside it, and its call to action, if any, is text.
// - Each holds one real <img>, with alt="", a srcset, sizes, width and height (a lazy-loading
//   library's data-src doesn't count: the server HTML carries the image).
// - The cards' photos load eagerly with no fetchpriority (the hero's photo is the page's only
//   fetchpriority="high", which home-hero checks), and the tiles' are loading="lazy".
//
// The cards are part of the hero's widget (widgets/home-lead) and the tiles a widget of their own
// (widgets/link-tiles), placed on the store by scripts/widgets-sync.mjs. So, as home-hero does, it
// checks whatever the page has and passes a page without them: it never reads the repo's record
// of the store, which would fail every open branch from each apply until the channel file's PR
// merged (build pipeline, section 6.6). Whether the store holds what the repo records is
// widgets-sync.mjs --verify's check.

import { findTags, markupOnly } from '../html.mjs';

export const CARD_CLASS = 'rf-type-card';
export const TILE_CLASS = 'rf-link-tile';
const INTERACTIVE = ['a', 'button', 'input', 'select', 'textarea', 'details', 'iframe'];

const hasClass = (attrs, name) => (attrs.class || '').split(/\s+/).includes(name);

// Each <a> with the class, as { attrs, inner }: its markup up to its first </a>. A link can't
// hold another, so an <a> start tag before that </a> is a nested link.
export function linksWithClass(source, name) {
    const html = markupOnly(source);
    const links = [];
    const start = /<a\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
    for (let match = start.exec(html); match; match = start.exec(html)) {
        const [tag] = findTags(match[0], 'a');
        if (tag && hasClass(tag.attrs, name)) {
            const from = start.lastIndex;
            const end = html.slice(from).search(/<\/a\s*>/i);
            links.push({ attrs: tag.attrs, inner: end === -1 ? html.slice(from) : html.slice(from, from + end) });
        }
    }
    return links;
}

function linkProblems(link, what, { lazy }) {
    const problems = [];
    if (!/^(\/|https?:\/\/)/.test(link.attrs.href || '')) problems.push(`${what} links to "${link.attrs.href ?? ''}", not a page`);
    const nested = findTags(link.inner).filter(tag => INTERACTIVE.includes(tag.name));
    if (nested.length) problems.push(`${what} has ${nested.map(tag => `<${tag.name}>`).join(', ')} inside its link: nothing interactive goes inside a link`);
    const images = findTags(link.inner, 'img');
    if (images.length !== 1) {
        problems.push(`${what} has ${images.length} <img> elements, not 1`);
        return problems;
    }
    const { attrs } = images[0];
    if (attrs.alt !== '') problems.push(`${what}'s <img> needs alt="": the link's text names it`);
    for (const name of ['src', 'srcset', 'sizes', 'width', 'height']) if (!attrs[name]) problems.push(`${what}'s <img> has no ${name}`);
    if ('fetchpriority' in attrs) problems.push(`${what}'s <img> has fetchpriority="${attrs.fetchpriority}": the hero's photo is the only one`);
    if (lazy && attrs.loading !== 'lazy') problems.push(`${what}'s <img> isn't loading="lazy"`);
    if (!lazy && attrs.loading === 'lazy') problems.push(`${what}'s <img> is lazy; the cards load eagerly`);
    return problems;
}

const label = (link, index, kind) => {
    const name = link.inner.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? link.inner.match(/__name"[^>]*>([\s\S]*?)<\//)?.[1] ?? '';
    return `${kind} ${index + 1}${name ? ` (${name.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()})` : ''}`;
};

export function cardsTilesProblems(html) {
    const cards = linksWithClass(html, CARD_CLASS);
    const tiles = linksWithClass(html, TILE_CLASS);
    return [
        ...cards.flatMap((link, index) => linkProblems(link, label(link, index, 'card'), { lazy: false })),
        ...tiles.flatMap((link, index) => linkProblems(link, label(link, index, 'tile'), { lazy: true })),
    ];
}

export default {
    id: 'home-cards-tiles',
    ticket: 47,
    description: 'the Fly Type cards and tiles, when the page has them: each one <a href> with nothing interactive inside, one <img> with alt="", srcset, sizes, width and height; cards eager with no fetchpriority, tiles lazy',
    pages: ['home'],
    check(page) {
        return cardsTilesProblems(page.html);
    },
};
