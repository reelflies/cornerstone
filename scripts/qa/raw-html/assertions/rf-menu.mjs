// The mega menus and the phone drawer in the server HTML (ticket 28; spec module 3 and seam 2;
// stories 4, 6, 9 and 72; O06, O08, SEO-3; redrawn for Streamside Stone, DESIGN.md "Mega menu"
// and "Phone drawer"), on every page: components/reelflies/header.html's nav row and
// drawer.html, every link rendered on the server from the categories data by the ids in the
// Menu settings. With the ids empty there is no Flies or Species item, and the nav lists the
// top-level categories as plain links; the drawer stays.
//
// - The header's <nav class="rf-nav">: every link has an href. Each mega item (data-rf-mega)
//   has one <button type="button"> with aria-expanded="false" and aria-controls naming its one
//   panel (data-rf-mega-panel), which is hidden in the server HTML; every panel on the page is
//   in such an item.
// - The Flies panel: the rail (ul.rf-mega__rail) lists the Fly Types, each a link with an href,
//   data-rf-pane-for (its pane) and data-rf-cat (its name, which quick-search.js reads); the
//   panes (data-rf-pane) come in the rail's order, the first shown and the rest hidden, and the
//   rail's first link is the one marked is-active. Each pane's heading (p.rf-mega__head) holds
//   one link, to the Fly Type its rail link goes to, and its subcategories (ul.rf-mega__kids)
//   are links with hrefs and data-rf-cat. The Species panel's lists (ul.rf-mega__splist) are
//   links with hrefs and data-rf-cat.
// - The drawer (data-rf-drawer): one, with an id, hidden, outside the <header>; its panel is a
//   role="dialog" with aria-modal="true", named by aria-labelledby from an element with words;
//   its close control (data-rf-drawer-close) is a labelled <button type="button">; one named
//   <nav>; every <details> has a <summary>; every link has an href. And it lists every category
//   the mega menus do (the links with data-rf-cat), so a phone shopper reaches each one.
//
// Retired with the redesign: the grouped <nav data-rf-menu> in #menu, data-rf-category (now
// data-rf-cat), the per-row pane buttons, the "no All … link" rule (the drawer ends each Fly
// Type with an "All …" link and the pane's plate is named "All …" by design), and the stock
// navigation fallback, which the redesign doesn't have.
//
// Which categories the menus must hold depends on the store's tree and the menu ids, which the
// raw HTML alone doesn't show: the render tests (menu.test.mjs) hold the templates to the ids.

import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../html.mjs';
import { headerSource } from './rf-header.mjs';

const hasClass = (name, attrs) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

// The header's nav row (<nav class="rf-nav">), or null.
export const menuSource = html => outerHtml(html, 'nav', attrs => hasClass('rf-nav', attrs));
// The drawer (<div data-rf-drawer>), or null.
export const drawerSource = html => outerHtml(html, 'div', attrs => 'data-rf-drawer' in attrs);
// A mega panel by its id (<div id="rf-mega-flies" data-rf-mega-panel>), or null.
export const panelSource = (html, id) => outerHtml(html, 'div', attrs => attrs.id === id && 'data-rf-mega-panel' in attrs);

// The links in `html`, each with its attributes and its text, in page order.
export function links(html) {
    if (!html) return [];
    const markup = markupOnly(html);
    return [...markup.matchAll(/<a(?=[\s>])[^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({
        attrs: findTags(match[0], 'a')[0].attrs,
        text: textOf(match[1]),
    }));
}

// The Flies rail as the server HTML gives it: each Fly Type's id (data-rf-pane-for), name
// (data-rf-cat), href and whether it is the one shown (is-active), in order.
export function railFromHtml(html) {
    const rail = outerHtml(html, 'ul', attrs => hasClass('rf-mega__rail', attrs));
    return links(rail).map(({ attrs }) => ({
        id: attrs['data-rf-pane-for'],
        name: decodeHtml(attrs['data-rf-cat'] ?? ''),
        href: attrs.href,
        active: hasClass('is-active', attrs),
    }));
}

// The Flies panes (data-rf-pane), in order: each one's id, whether it is hidden, its heading's
// link, its subcategory links and its plate's link (null without an image).
export function panesFromHtml(html) {
    return elementsHtml(html, 'div', attrs => 'data-rf-pane' in attrs).map(pane => {
        const [tag] = findTags(pane, 'div');
        const head = outerHtml(pane, 'p', attrs => hasClass('rf-mega__head', attrs));
        const kids = outerHtml(pane, 'ul', attrs => hasClass('rf-mega__kids', attrs));
        const plate = outerHtml(pane, 'a', attrs => hasClass('rf-mega__plate', attrs));
        return {
            id: tag.attrs['data-rf-pane'],
            hidden: 'hidden' in tag.attrs,
            head: head ? links(head)[0] ?? null : null,
            kids: links(kids),
            plate: plate ? links(plate)[0] ?? null : null,
            source: pane,
        };
    });
}

function megaProblems(nav) {
    const problems = [];
    links(nav).forEach(({ attrs, text }) => {
        if (!attrs.href) problems.push(`the nav link "${text}" has no href`);
    });
    const items = elementsHtml(nav, 'li', attrs => 'data-rf-mega' in attrs);
    let panelsInItems = 0;
    items.forEach((item, index) => {
        const buttons = findTags(item, 'button');
        const name = (buttons.length ? textOf(outerHtml(item, 'button')) : '') || `mega item ${index + 1}`;
        const panels = findTags(item, 'div').filter(tag => 'data-rf-mega-panel' in tag.attrs);
        panelsInItems += panels.length;
        if (buttons.length !== 1) {
            problems.push(`${name} has ${buttons.length} buttons, not 1`);
            return;
        }
        const [button] = buttons;
        if (button.attrs.type !== 'button') problems.push(`the ${name} button isn't type="button"`);
        if (button.attrs['aria-expanded'] !== 'false') problems.push(`the ${name} button has aria-expanded "${button.attrs['aria-expanded'] ?? ''}", not "false"`);
        if (panels.length !== 1) {
            problems.push(`${name} holds ${panels.length} mega panels (data-rf-mega-panel), not 1`);
            return;
        }
        const [panel] = panels;
        if (!panel.attrs.id) problems.push(`the ${name} panel has no id`);
        if (button.attrs['aria-controls'] !== panel.attrs.id) problems.push(`the ${name} button controls "${button.attrs['aria-controls'] ?? ''}", not its panel "${panel.attrs.id ?? ''}"`);
        if (!('hidden' in panel.attrs)) problems.push(`the ${name} panel isn't hidden in the server HTML`);
    });
    const panels = findTags(nav, 'div').filter(tag => 'data-rf-mega-panel' in tag.attrs).length;
    if (panels > panelsInItems) problems.push(`${panels - panelsInItems} mega panel(s) outside a mega item (li[data-rf-mega])`);

    const rail = railFromHtml(nav);
    if (rail.length) {
        rail.forEach(({ id, name, href }) => {
            if (!id) problems.push(`the rail link "${name || href}" has no data-rf-pane-for`);
            if (!name) problems.push(`the rail link to ${href} has no data-rf-cat`);
        });
        const active = rail.filter(({ active: shown }) => shown);
        if (active.length !== 1 || !rail[0].active) problems.push(`${active.length} rail links are is-active (${active.map(({ name }) => name).join(', ')}): the first is, alone`);
        const panes = panesFromHtml(nav);
        const ids = list => list.map(({ id }) => id).join(', ');
        if (ids(panes) !== ids(rail)) {
            problems.push(`the panes (${ids(panes)}) don't match the rail (${ids(rail)}), in order`);
        } else {
            panes.forEach((pane, index) => {
                const type = rail[index];
                if (pane.hidden === (index === 0)) problems.push(`pane ${pane.id} is ${pane.hidden ? 'hidden' : 'shown'} in the server HTML: the first is shown and the rest are hidden`);
                if (!pane.head) problems.push(`pane ${pane.id} has no heading link (p.rf-mega__head a)`);
                else if (pane.head.attrs.href !== type.href) problems.push(`pane ${pane.id}'s heading links to ${pane.head.attrs.href}, not its rail link's ${type.href}`);
                pane.kids.forEach(({ attrs, text }) => {
                    if (!attrs.href) problems.push(`the subcategory "${text}" in pane ${pane.id} has no href`);
                    if (!(attrs['data-rf-cat'] || '').trim()) problems.push(`the subcategory "${text}" in pane ${pane.id} has no data-rf-cat`);
                });
            });
        }
    }
    elementsHtml(nav, 'ul', attrs => hasClass('rf-mega__splist', attrs)).forEach(list => {
        links(list).forEach(({ attrs, text }) => {
            if (!attrs.href) problems.push(`the species "${text}" has no href`);
            if (!(attrs['data-rf-cat'] || '').trim()) problems.push(`the species "${text}" has no data-rf-cat`);
        });
    });
    return problems;
}

function drawerProblems(html, header, nav) {
    const drawers = findTags(html, 'div').filter(tag => 'data-rf-drawer' in tag.attrs);
    if (drawers.length !== 1) return [`${drawers.length} drawers (data-rf-drawer), not 1`];
    const problems = [];
    const [tag] = drawers;
    if (!tag.attrs.id) problems.push('the drawer has no id for the Menu button\'s aria-controls');
    if (!('hidden' in tag.attrs)) problems.push('the drawer isn\'t hidden in the server HTML');
    if (header && findTags(header, 'div').some(entry => 'data-rf-drawer' in entry.attrs)) problems.push('the drawer is inside the <header>: it belongs after it');
    const drawer = drawerSource(html);

    const dialogs = findTags(drawer).filter(entry => entry.attrs.role === 'dialog');
    if (dialogs.length !== 1) {
        problems.push(`${dialogs.length} dialogs (role="dialog") in the drawer, not 1`);
    } else {
        const [dialog] = dialogs;
        if (dialog.attrs['aria-modal'] !== 'true') problems.push('the drawer\'s dialog has no aria-modal="true"');
        const labelledBy = dialog.attrs['aria-labelledby'];
        if (!labelledBy) {
            problems.push('the drawer\'s dialog has no aria-labelledby');
        } else {
            const title = outerHtml(drawer, '[a-z][a-z0-9-]*', attrs => attrs.id === labelledBy);
            if (!title) problems.push(`the drawer's dialog is labelled by "${labelledBy}", which isn't in the drawer`);
            else if (!textOf(title)) problems.push(`the drawer's title (#${labelledBy}) has no words`);
        }
    }
    const closers = findTags(drawer).filter(entry => 'data-rf-drawer-close' in entry.attrs && entry.name !== 'a');
    if (!closers.length) {
        problems.push('the drawer has no close control (button[data-rf-drawer-close])');
    } else {
        closers.forEach((closer, index) => {
            if (closer.name !== 'button' || closer.attrs.type !== 'button') problems.push(`the drawer's close control ${index + 1} isn't a <button type="button">`);
        });
        if (!textOf(outerHtml(drawer, closers[0].name, attrs => 'data-rf-drawer-close' in attrs))) problems.push('the drawer\'s close button has no label');
    }
    const navs = findTags(drawer, 'nav');
    if (navs.length !== 1) problems.push(`${navs.length} <nav> in the drawer, not 1`);
    else if (!(navs[0].attrs['aria-label'] || '').trim()) problems.push('the drawer\'s <nav> has no aria-label');
    // A disclosure's <summary> is its first child; a nested disclosure's doesn't count for it.
    elementsHtml(drawer, 'details').forEach(details => {
        if (!/^<details[^>]*>\s*<summary[\s>]/i.test(details)) problems.push(`a <details> in the drawer has no <summary> first: ${textOf(details).slice(0, 40)}`);
    });
    const drawerLinks = links(drawer);
    drawerLinks.forEach(({ attrs, text }) => {
        if (!attrs.href) problems.push(`the drawer link "${text}" has no href`);
    });
    if (nav) {
        const hrefs = new Set(drawerLinks.map(({ attrs }) => attrs.href));
        const missing = links(nav).filter(({ attrs }) => 'data-rf-cat' in attrs && attrs.href && !hrefs.has(attrs.href)).map(({ attrs }) => attrs.href);
        if (missing.length) problems.push(`the drawer doesn't list ${missing.length} of the mega menus' categories: ${[...new Set(missing)].slice(0, 6).join(', ')}`);
    }
    return problems;
}

export function menuProblems(html) {
    const header = headerSource(html);
    if (!header) return ['no ReelFlies header (data-rf-head), so no menu: components/common/header.html includes components/reelflies/header'];
    const nav = menuSource(header);
    const problems = nav ? megaProblems(nav) : ['the header has no nav row (nav.rf-nav)'];
    return [...problems, ...drawerProblems(html, header, nav)];
}

export default {
    id: 'rf-menu',
    ticket: 28,
    description: 'the header\'s mega menus and the drawer: each mega item one button with aria-expanded and aria-controls to its hidden panel, the Flies rail and panes matched in order with the first shown, every category a real <a href> with data-rf-cat, and one hidden drawer outside the header, a labelled modal dialog with a close button and a named nav that lists every category the mega menus do',
    check(page) {
        return menuProblems(page.html);
    },
};
