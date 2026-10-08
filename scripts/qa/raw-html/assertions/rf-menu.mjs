// The grouped menu in the server HTML (ticket 28; spec module 3 and seam 2; stories 4, 6, 9 and
// 72; O06, O08, SEO-3), on every page: components/reelflies/menu.html, which the ReelFlies header
// renders in #menu when rf_menu_type_ids or rf_menu_species_root_id is set. With both empty the
// stock navigation renders instead (the fallback), and this assertion passes the page.
//
// - One <nav data-rf-menu> with a name, inside the ReelFlies <header>, and no stock navigation
//   (.navPages) beside it. Its container carries no data-menu, so stock menu.js binds nothing
//   to it (stock menu.js stops every click inside it from reaching the page).
// - Every link has an href, and every category link (all but the drawer footer's) carries
//   data-rf-category, which quick search reads (build pipeline 6.9).
// - No "All {category}" or "Shop all" link: each pane's heading is the link (O06).
// - Each pane (data-rf-menu-pane) is hidden in the server HTML, has an id, and opens with one
//   <button type="button"> whose aria-controls names it and whose aria-expanded is "false";
//   its heading holds one link, to the category its row names.
// - No stock quick-search form in the menu: ticket 30's search binds to search-form.html.
//
// Which URLs it must hold depends on the store's tree and the menu ids, which the raw HTML
// alone doesn't show: menu.spec.mjs's curl test reads them from ?debug=context and checks every
// one against the nav (scripts/qa/menu-urls.mjs).

import { findTags, markupOnly } from '../html.mjs';
import { elementSource } from './rf-header.mjs';

export const menuSource = html => elementSource(html, 'nav', attrs => 'data-rf-menu' in attrs);
const footSource = html => elementSource(html, 'div', attrs => 'data-rf-menu-foot' in attrs);
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const ALL_LINE = /^(all\s|shop all\b)/i;

// The links in `html`, each with its attributes and its text, in page order.
export function links(html) {
    const markup = markupOnly(html);
    return [...markup.matchAll(/<a(?=[\s>])[^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
        attrs: findTags(match[0], 'a')[0].attrs,
        text: text(match[1]),
    }));
}

const decode = value => String(value).replace(/&amp;/g, '&').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&#x3D;/g, '=');

// The rail as the server HTML gives it, group by group: its label (null for the Species group,
// which has a divider instead), whether it opens with the divider, and its rows' names, in order.
export function railFromHtml(html) {
    const nav = menuSource(html);
    if (!nav) return [];
    const foot = nav.indexOf('data-rf-menu-foot');
    const end = foot < 0 ? nav.length : foot;
    const starts = [...nav.matchAll(/<div class="rf-menu-group[\s"]/g)].map(match => match.index).filter(index => index < end);
    return starts.map((start, index) => nav.slice(start, starts[index + 1] ?? end)).map(group => ({
        label: (group.match(/<p class="rf-menu-label"[^>]*>([^<]*)<\/p>/) || [])[1] || null,
        divider: /class="rf-menu-sep"/.test(group),
        rows: [...group.matchAll(/<li class="rf-menu-item[^"]*"[^>]*>\s*(?:<div class="rf-menu-row">\s*)?<a [^>]*>([^<]*)<\/a>/g)].map(([, name]) => decode(name.trim())),
    }));
}

// Each pane, with its id and its heading's links.
function panes(nav) {
    return findTags(nav, 'div').filter(tag => 'data-rf-menu-pane' in tag.attrs).map(tag => {
        const source = elementSource(nav, 'div', attrs => attrs.id === tag.attrs.id && 'data-rf-menu-pane' in attrs);
        const heading = source && elementSource(source, 'h2');
        return { tag, heading: heading ? links(heading) : null };
    });
}

export function menuProblems(html) {
    const navs = findTags(html, 'nav').filter(tag => 'data-rf-menu' in tag.attrs);
    if (!navs.length) return [];
    if (navs.length > 1) return [`${navs.length} grouped menus (<nav data-rf-menu>), not 1`];
    const problems = [];
    const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);
    const nav = menuSource(html);
    if (!header || !menuSource(header)) problems.push('the grouped menu isn\'t inside the ReelFlies <header>');
    if (!navs[0].attrs['aria-label']) problems.push('the grouped menu\'s <nav> has no aria-label');

    const container = header && elementSource(header, 'div', attrs => attrs.id === 'menu');
    if (container) {
        const [open] = findTags(container, 'div');
        if ('data-menu' in open.attrs) problems.push('#menu carries data-menu with the grouped menu in it: stock menu.js would bind to it');
        if (findTags(container).some(tag => /(^|\s)navPages(\s|$)/.test(tag.attrs.class || ''))) problems.push('the stock navigation (.navPages) renders beside the grouped menu');
        if (findTags(container).some(tag => 'data-quick-search-form' in tag.attrs || 'data-search-quick' in tag.attrs)) problems.push('a stock quick-search form is in the menu');
    }

    links(nav).forEach(({ attrs, text: name }) => {
        if (!attrs.href) problems.push(`the menu link "${name}" has no href`);
        if (ALL_LINE.test(name)) problems.push(`the menu has an "${name}" link: each pane's heading is the link (O06)`);
    });
    const foot = footSource(nav);
    links(foot ? markupOnly(nav).replace(foot, '') : nav).forEach(({ attrs, text: name }) => {
        if (!('data-rf-category' in attrs)) problems.push(`the category link "${name}" has no data-rf-category`);
    });

    const toggles = findTags(nav, 'button').filter(tag => 'data-rf-menu-toggle' in tag.attrs);
    const found = panes(nav);
    const ids = found.map(({ tag }) => tag.attrs.id);
    found.forEach(({ tag, heading }, index) => {
        const name = tag.attrs.id || `pane ${index + 1}`;
        if (!tag.attrs.id) problems.push(`${name} has no id`);
        if (!('hidden' in tag.attrs)) problems.push(`${name} isn't hidden in the server HTML`);
        const opening = toggles.filter(toggle => toggle.attrs['aria-controls'] === tag.attrs.id);
        if (opening.length !== 1) problems.push(`${name} is opened by ${opening.length} buttons, not 1`);
        if (!heading) problems.push(`${name} has no <h2> heading`);
        else if (heading.length !== 1) problems.push(`${name}'s heading holds ${heading.length} links, not 1`);
        else if (!('data-rf-category' in heading[0].attrs)) problems.push(`${name}'s heading link has no data-rf-category`);
    });
    toggles.forEach(toggle => {
        const target = toggle.attrs['aria-controls'];
        if (toggle.attrs.type !== 'button') problems.push(`the menu button for ${target || 'nothing'} isn't type="button"`);
        if (toggle.attrs['aria-expanded'] !== 'false') problems.push(`the menu button for ${target || 'nothing'} has aria-expanded "${toggle.attrs['aria-expanded']}", not "false"`);
        if (!ids.includes(target)) problems.push(`a menu button controls "${target}", which isn't a pane in the menu`);
    });
    return problems;
}

export default {
    id: 'rf-menu',
    ticket: 28,
    description: 'the grouped menu, when its ids are set: one named <nav> in the header with no stock navigation or data-menu beside it, every category link a real <a href> with data-rf-category, no "All …" line, and each pane hidden, opened by one button and headed by its link',
    check(page) {
        return menuProblems(page.html);
    },
};
