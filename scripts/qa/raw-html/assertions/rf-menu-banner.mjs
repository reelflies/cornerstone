// The mega menus' images in the server HTML (ticket 29; spec seam 2; O09, SEO-3, story 7; redrawn
// for Streamside Stone, DESIGN.md "Mega menu"): the only image in the header's menus is a Flies
// pane's plate, cat-view.html's <a class="rf-mega__plate"> with the category's own 16:7 photograph,
// so nothing in the menus can download on a phone or for a closed panel:
//
// - Every <img> in the header's <nav> is in a pane (data-rf-pane), inside its plate, one plate at
//   most per pane and one image per plate. The rail, the Species panel and the "Also" row have none.
// - The plate link repeats the pane's heading link, so it is aria-hidden="true" with tabindex="-1":
//   one stop for the keyboard and the screen reader, not two.
// - loading="lazy", so the browser fetches it only once its pane shows: a hidden pane, the closed
//   panel and the drawer download nothing. Never fetchpriority, which would ask for it ahead of
//   the page.
// - A srcset of at least two candidates, sizes, and a width and a height, so the browser picks the
//   file for the plate's width and reserves its box.
// - alt="": the heading beside it names the category, so the image is decorative.
// - The drawer holds no image at all: CSS can't stop a download.
//
// Retired with the redesign: the banner strip at the top of a pane (data-rf-menu-banner, before
// the pane's <h2>); the plate sits beside the subcategories.

import { elementsHtml, findTags, outerHtml } from '../html.mjs';
import { headerSource } from './rf-header.mjs';
import { drawerSource, menuSource } from './rf-menu.mjs';

const hasClass = (name, attrs) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

export function bannerProblems(html) {
    const header = headerSource(html);
    if (!header) return [];
    const problems = [];
    const nav = menuSource(header);
    if (nav) {
        const imgs = findTags(nav, 'img');
        let inPlates = 0;
        elementsHtml(nav, 'div', attrs => 'data-rf-pane' in attrs).forEach(pane => {
            const id = findTags(pane, 'div')[0].attrs['data-rf-pane'];
            const plates = elementsHtml(pane, 'a', attrs => hasClass('rf-mega__plate', attrs));
            if (plates.length > 1) problems.push(`pane ${id} has ${plates.length} plates, not one at most`);
            let inPanePlates = 0;
            plates.forEach(plate => {
                const [link] = findTags(plate, 'a');
                const count = findTags(plate, 'img').length;
                inPanePlates += count;
                if (count !== 1) problems.push(`pane ${id}'s plate holds ${count} images, not 1`);
                if (link.attrs['aria-hidden'] !== 'true' || link.attrs.tabindex !== '-1') problems.push(`pane ${id}'s plate link isn't aria-hidden="true" with tabindex="-1": it repeats the pane's heading link`);
                const head = outerHtml(pane, 'p', attrs => hasClass('rf-mega__head', attrs));
                const headLink = head && findTags(head, 'a')[0];
                if (headLink && link.attrs.href !== headLink.attrs.href) problems.push(`pane ${id}'s plate links to ${link.attrs.href || '(no href)'}, not its heading's ${headLink.attrs.href}`);
            });
            const inPane = findTags(pane, 'img').length;
            if (inPane > inPanePlates) problems.push(`pane ${id} has ${inPane - inPanePlates} image(s) outside its plate`);
            inPlates += inPanePlates;
        });
        if (inPlates < imgs.length) problems.push(`${imgs.length - inPlates} image(s) in the header's menus outside a pane's plate: only a pane's plate may be an image`);
        imgs.forEach(({ attrs }) => {
            const name = `the menu image ${attrs.src || '(no src)'}`;
            if (attrs.loading !== 'lazy') problems.push(`${name} has loading="${attrs.loading ?? ''}", not "lazy": phones and closed panels would download it`);
            if ('fetchpriority' in attrs) problems.push(`${name} has fetchpriority="${attrs.fetchpriority}"`);
            if ((attrs.srcset || '').split(',').filter(candidate => candidate.trim()).length < 2) problems.push(`${name} has no srcset of two or more candidates`);
            if (!(attrs.sizes || '').trim()) problems.push(`${name} has no sizes`);
            if (!/^\d+$/.test(attrs.width || '') || !/^\d+$/.test(attrs.height || '')) problems.push(`${name} has no width and height`);
            if (attrs.alt !== '') problems.push(`${name} has alt "${attrs.alt ?? '(none)'}", not "": the heading beside it names the category`);
        });
    }
    const drawer = drawerSource(html);
    if (drawer) {
        const count = findTags(drawer, 'img').length;
        if (count) problems.push(`${count} image(s) in the drawer: a phone would download them with the page`);
    }
    return problems;
}

export default {
    id: 'rf-menu-banner',
    ticket: 29,
    description: 'the header\'s menus hold no image but a Flies pane\'s plate, one at most, its link aria-hidden with tabindex -1 and the same href as the heading: lazy, decorative (alt=""), with a srcset, sizes, a width and a height, and no fetchpriority; and no image in the drawer',
    check(page) {
        return bannerProblems(page.html);
    },
};
