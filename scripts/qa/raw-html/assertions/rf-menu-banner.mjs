// The grouped menu's banner strip in the server HTML (ticket 29; spec seam 2; O09, SEO-3,
// story 7): components/reelflies/menu-banner.html, one per desktop pane whose category has an
// image. Every image in the grouped <nav> must be one of these, so nothing in the menu can
// download on a phone or for a closed pane:
//
// - It carries data-rf-menu-banner, and sits in a pane (data-rf-menu-pane), before the pane's
//   <h2>, one at most per pane. The rail itself has no image.
// - loading="lazy", so the browser fetches it only once its pane shows: a hidden pane, the
//   closed panel and the phone drawer (where CSS hides it) download nothing (rail.spec.mjs
//   checks the network). Never fetchpriority, which would ask for it ahead of the page.
// - A srcset of at least two candidates, sizes, and a width and a height, so the browser picks
//   the file for the pane's width and reserves its box.
// - alt="": the heading under it names the category, so the image is decorative.
//
// With both menu ids empty there is no grouped menu, and the page passes.

import { findTags, outerHtml } from '../html.mjs';
import { menuSource } from './rf-menu.mjs';

const BANNER = 'data-rf-menu-banner';

export function bannerProblems(html) {
    const nav = menuSource(html);
    if (!nav) return [];
    const problems = [];
    const imgs = findTags(nav, 'img');
    let inPanes = 0;
    findTags(nav, 'div').filter(tag => 'data-rf-menu-pane' in tag.attrs).forEach(tag => {
        const pane = outerHtml(nav, 'div', attrs => attrs.id === tag.attrs.id && 'data-rf-menu-pane' in attrs) || '';
        const count = findTags(pane, 'img').length;
        inPanes += count;
        if (count > 1) problems.push(`${tag.attrs.id} has ${count} images, not one banner at most`);
        if (count && pane.indexOf('<h2') >= 0 && pane.indexOf('<img') > pane.indexOf('<h2')) problems.push(`${tag.attrs.id}'s banner comes after its heading, not at the top of the pane`);
    });
    if (inPanes < imgs.length) problems.push(`${imgs.length - inPanes} image(s) in the menu outside a pane: only a pane's banner may be an image`);
    imgs.forEach(({ attrs }) => {
        const name = `the menu image ${attrs.src || '(no src)'}`;
        if (!(BANNER in attrs)) problems.push(`${name} has no ${BANNER}`);
        if (attrs.loading !== 'lazy') problems.push(`${name} has loading="${attrs.loading ?? ''}", not "lazy": phones and closed panes would download it`);
        if ('fetchpriority' in attrs) problems.push(`${name} has fetchpriority="${attrs.fetchpriority}"`);
        if ((attrs.srcset || '').split(',').filter(candidate => candidate.trim()).length < 2) problems.push(`${name} has no srcset of two or more candidates`);
        if (!(attrs.sizes || '').trim()) problems.push(`${name} has no sizes`);
        if (!/^\d+$/.test(attrs.width || '') || !/^\d+$/.test(attrs.height || '')) problems.push(`${name} has no width and height`);
        if (attrs.alt !== '') problems.push(`${name} has alt "${attrs.alt ?? '(none)'}", not "": the heading under it names the category`);
    });
    return problems;
}

export default {
    id: 'rf-menu-banner',
    ticket: 29,
    description: 'the grouped menu\'s images are only the panes\' banners, one at most at the top of a pane: lazy, decorative (alt=""), with a srcset, sizes, a width and a height, and no fetchpriority',
    check(page) {
        return bannerProblems(page.html);
    },
};
