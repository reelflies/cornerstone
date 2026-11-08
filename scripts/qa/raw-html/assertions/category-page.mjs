// The category page in the server HTML (ticket 32; spec module 8; O10, UX-5; stories 21, 22 and
// 72; redesign step 3): components/reelflies/category-page.html, on every category pin.
//
// - One head (listing-head.html's .rf-list-head, or the Species hub's moss head, .rf-hub, when
//   a hub page is pinned as a category), holding the page's one H1.
// - Its banner, where it has one (the stone's .rf-list-head__photo): eager (no loading
//   attribute), fetchpriority="high", a srcset of two or more candidates, sizes, a width and a
//   height, and alt="" (the H1 on it names it).
// - The chips, where the category has subcategories: every chip a link with an href, in the
//   HTML whether the list shows it or not, and the "more" chip hidden until the script needs it.
//   The chips sit in the head by design; the listing never does.
// - The description after its <!--more--> marker (data-rf-description) follows the product grid
//   (ul[data-rf-grid]), and the marker itself is never printed. A marker inside an element
//   other than a bare <p> splits that element, and the head then swallows the listing: that
//   fails.
//
// card-images checks that the banner holds the page's only fetchpriority; max-one-h1 and
// one-canonical check the H1 and the canonical on every page. Ticket 36's brand-page assertion
// shares the head's checks (listingHeadProblems).

import { findTags, outerHtml } from '../html.mjs';

export const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
export const listingHead = html => outerHtml(html, 'div', hasClass('rf-list-head'));
export const hubHead = html => outerHtml(html, 'div', hasClass('rf-hub'));
// The banner: the photograph under the stone's scrim. The hub's tile photos aren't one.
export const headBanner = head => findTags(outerHtml(head, 'div', hasClass('rf-list-head__photo')) || '', 'img')[0];

// A listing head's own checks (listing-head.html): the page's H1 in it, once, and its banner,
// where it has one, eager and high priority with a srcset, sizes, dimensions and alt="".
export function listingHeadProblems(head) {
    const problems = [];
    const h1s = findTags(head, 'h1');
    if (h1s.length !== 1) problems.push(`the listing head has ${h1s.length} <h1>, not one`);
    const banner = headBanner(head);
    if (banner) {
        const { attrs } = banner;
        const name = `the banner ${attrs.src || '(no src)'}`;
        if ('loading' in attrs) problems.push(`${name} has loading="${attrs.loading}": the banner loads eagerly`);
        if (attrs.fetchpriority !== 'high') problems.push(`${name} has no fetchpriority="high"`);
        if ((attrs.srcset || '').split(',').filter(candidate => candidate.trim()).length < 2) problems.push(`${name} has no srcset of two or more candidates`);
        if (!(attrs.sizes || '').trim()) problems.push(`${name} has no sizes`);
        if (!/^\d+$/.test(attrs.width || '') || !/^\d+$/.test(attrs.height || '')) problems.push(`${name} has no width and height`);
        if (attrs.alt !== '') problems.push(`${name} has alt "${attrs.alt ?? '(none)'}", not "": the H1 on it names the page`);
    }
    return problems;
}

export function categoryPageProblems(html) {
    const head = listingHead(html) || hubHead(html);
    if (!head) return ['no listing head (.rf-list-head, or the hub\'s .rf-hub): the page isn\'t components/reelflies/category-page.html'];
    const problems = [];
    if (/data-rf-grid|data-rf-list-count|product-listing-container/.test(head)) problems.push('the listing head holds the listing: a <!--more--> marker inside an element split it (the marker goes only between top-level blocks)');
    problems.push(...listingHeadProblems(head));
    const chips = outerHtml(html, 'ul', attrs => 'data-rf-chips' in attrs);
    if (chips) {
        const items = findTags(chips, 'li');
        const more = items.filter(item => 'data-rf-chips-more' in item.attrs);
        const links = findTags(chips, 'a');
        if (!links.length) problems.push('the chip list has no chips');
        links.filter(link => !(link.attrs.href || '').trim()).forEach(() => problems.push('a chip has no href'));
        if (links.length !== items.length - more.length) problems.push(`the chip list has ${items.length - more.length} chips but ${links.length} links: each chip is one link`);
        if (more.length !== 1) problems.push(`the chip list has ${more.length} "more" chips, not one`);
        else if (!('hidden' in more[0].attrs)) problems.push('the "more" chip isn\'t hidden in the HTML: the script shows it when chips don\'t fit');
    }
    const rest = html.indexOf('data-rf-description');
    const grid = html.indexOf('data-rf-grid');
    if (rest >= 0 && grid >= 0 && rest < grid) problems.push('the description\'s second part comes before the product grid');
    if (html.includes('<!--more-->')) problems.push('the description\'s <!--more--> marker is in the page');
    return problems;
}

export default {
    id: 'category-page',
    ticket: 32,
    description: 'the category page: one head with the H1, an eager high-priority banner, every chip a link, the description\'s rest after the grid',
    pages: ['category'],
    check(page) {
        return categoryPageProblems(page.html);
    },
};
