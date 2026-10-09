// The category page in the server HTML (ticket 32; spec module 8; O10, UX-5; stories 21, 22 and
// 72): components/reelflies/category-page.html, on every category pin.
//
// - One listing header (listing-header.html), holding the page's one H1.
// - Its banner, where it has one: eager (no loading attribute), fetchpriority="high", a srcset of
//   two or more candidates, sizes, a width and a height, and alt="" (the H1 on it names it).
// - The chips, where the category has subcategories: every chip a link with an href, in the
//   HTML whether the list shows it or not, and the "more" chip hidden until the script needs it.
// - The description after its <!--more--> marker (data-rf-description) follows the product grid,
//   and the marker itself is never printed.
//
// card-images checks that the banner holds the page's only fetchpriority; max-one-h1 and
// one-canonical check the H1 and the canonical on every page.

import { findTags, outerHtml } from '../html.mjs';

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

export function categoryPageProblems(html) {
    const problems = [];
    const header = outerHtml(html, 'div', hasClass('rf-listing-header'));
    if (!header) return ['no listing header (.rf-listing-header): the page isn\'t components/reelflies/category-page.html'];
    const h1s = findTags(header, 'h1');
    if (h1s.length !== 1) problems.push(`the listing header has ${h1s.length} <h1>, not one`);
    const banner = findTags(header, 'img')[0];
    if (banner) {
        const { attrs } = banner;
        const name = `the banner ${attrs.src || '(no src)'}`;
        if ('loading' in attrs) problems.push(`${name} has loading="${attrs.loading}": the banner loads eagerly`);
        if (attrs.fetchpriority !== 'high') problems.push(`${name} has no fetchpriority="high"`);
        if ((attrs.srcset || '').split(',').filter(candidate => candidate.trim()).length < 2) problems.push(`${name} has no srcset of two or more candidates`);
        if (!(attrs.sizes || '').trim()) problems.push(`${name} has no sizes`);
        if (!/^\d+$/.test(attrs.width || '') || !/^\d+$/.test(attrs.height || '')) problems.push(`${name} has no width and height`);
        if (attrs.alt !== '') problems.push(`${name} has alt "${attrs.alt ?? '(none)'}", not "": the H1 on it names the category`);
    }
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
    const grid = html.indexOf('productGrid');
    if (rest >= 0 && grid >= 0 && rest < grid) problems.push('the description\'s second part comes before the product grid');
    if (html.includes('<!--more-->')) problems.push('the description\'s <!--more--> marker is in the page');
    return problems;
}

export default {
    id: 'category-page',
    ticket: 32,
    description: 'the category page: one header with the H1, an eager high-priority banner, every chip a link, the description\'s rest after the grid',
    pages: ['category'],
    check(page) {
        return categoryPageProblems(page.html);
    },
};
