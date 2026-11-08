// Tests ticket 28's raw-HTML assertion rf-menu (spec seam 2), redrawn for Streamside Stone, on
// pages built round the header as components/common/header.html renders it after head.html: the
// mega menus and the drawer on tree 4, which it passes, the header with the menu ids empty, which
// it passes too, and broken copies, which it fails.
//
//   node --test scripts/qa/raw-html/assertions/rf-menu.test.mjs

import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { readFixture, renderPartial } from '../../render/render.mjs';
import { menuProblems } from './rf-menu.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TREE_4 = readFixture(path.join(HERE, '../../render/partials/menu/tree-4.json'));
const STORE = {
    urls: {
        home: 'https://reelflies.ca/', search: '/search.php', cart: '/cart.php', account: { index: '/account.php' }, auth: { login: '/login.php' },
    },
    settings: {
        store_logo: { image: null, title: 'ReelFlies.ca' }, store_name: 'ReelFlies', phone_number: '1 866 250 4071', blog_enabled: true,
    },
    pages: [],
    page_type: 'default',
};
const PAGE = 'rf-test/rf-menu-page';
const WITH_HEAD = { [PAGE]: '{{> components/reelflies/head}}{{> components/common/header}}' };
const frame = header => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body>${header}<main id="main-content"><h1>Dry Flies</h1></main></body></html>`;
const page = (html, kind = 'category') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3501/', status: 200, html,
});

let menus;
let bare;
before(async () => {
    const render = context => renderPartial(PAGE, { ...STORE, ...context }, { overrides: WITH_HEAD });
    menus = frame(await render({ ...TREE_4, theme_settings: { ...TREE_4.theme_settings, rf_species_salt_ids: '630,633,636,639' } }));
    bare = frame(await render({ categories: TREE_4.categories, theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } }));
});
const swap = (from, to, html = menus) => {
    const changed = html.replace(from, to);
    assert.notEqual(changed, html, `the fixture holds ${from}`);
    return changed;
};
const FLIES_BUTTON = '<button class="rf-nav__btn" type="button" aria-expanded="false" aria-controls="rf-mega-flies">';
const FLIES_PANEL = '<div class="rf-mega" id="rf-mega-flies" data-rf-mega-panel hidden>';
const DRY_RAIL = '<a class="rf-mega__type is-active" href="/dry-flies/" data-rf-pane-for="501" data-rf-cat="Dry Flies">';
const NYMPHS_RAIL = '<a class="rf-mega__type" href="/nymphs/" data-rf-pane-for="502" data-rf-cat="Nymphs">';
const NYMPHS_PANE = '<div class="rf-mega__pane rf-mega__pane--bare" data-rf-pane="502" hidden>';
const DRAWER = '<div class="rf-drawer" id="rf-drawer" hidden data-rf-drawer>';
const DIALOG = '<div class="rf-drawer__panel" role="dialog" aria-modal="true" aria-labelledby="rf-drawer-title">';
const CLOSE = '<button class="rf-drawer__close" type="button" data-rf-drawer-close>';

describe('rf-menu', () => {
    it('is registered, for every page kind', async () => {
        const assertion = (await loadAssertions()).find(entry => entry.id === 'rf-menu');
        assert.ok(assertion);
        assert.equal(assertion.ticket, 28);
        assert.equal(assertion.pages, undefined);
    });

    it('passes the mega menus and the drawer the header renders, and every ticket 27, 28 and 29 assertion passes that page too', async () => {
        assert.match(menus, /id="rf-mega-flies"/);
        assert.match(menus, /id="rf-mega-species"/);
        assert.deepEqual(menuProblems(menus), []);
        const assertions = (await loadAssertions()).filter(({ ticket }) => [27, 28, 29].includes(ticket));
        const failed = checkPage(page(menus), assertions).filter(({ status }) => status !== 'pass');
        assert.deepEqual(failed.map(({ id, problems }) => `${id}: ${problems}`), []);
    });

    it('passes the header with the menu ids empty: no Flies or Species item, the drawer still there', () => {
        assert.doesNotMatch(bare, /data-rf-mega-panel/);
        assert.match(bare, /data-rf-drawer/);
        assert.deepEqual(menuProblems(bare), []);
    });

    it('fails a mega button that isn\'t type="button", one without aria-expanded="false", one controlling the wrong id, and a panel shown in the server HTML', () => {
        assert.deepEqual(menuProblems(swap(FLIES_BUTTON, FLIES_BUTTON.replace(' type="button"', ''))), ['the Flies button isn\'t type="button"']);
        assert.deepEqual(menuProblems(swap(FLIES_BUTTON, FLIES_BUTTON.replace('aria-expanded="false"', 'aria-expanded="true"'))), ['the Flies button has aria-expanded "true", not "false"']);
        assert.deepEqual(menuProblems(swap(FLIES_BUTTON, FLIES_BUTTON.replace('aria-controls="rf-mega-flies"', 'aria-controls="rf-mega-nope"'))), ['the Flies button controls "rf-mega-nope", not its panel "rf-mega-flies"']);
        assert.deepEqual(menuProblems(swap(FLIES_PANEL, FLIES_PANEL.replace(' hidden', ''))), ['the Flies panel isn\'t hidden in the server HTML']);
        assert.deepEqual(menuProblems(swap(FLIES_PANEL, FLIES_PANEL.replace(' id="rf-mega-flies"', ''))), ['the Flies panel has no id', 'the Flies button controls "rf-mega-flies", not its panel ""']);
    });

    it('fails a panel outside a mega item, and an item with two buttons', () => {
        assert.deepEqual(menuProblems(swap('<li class="rf-nav__item"><a class="rf-nav__btn" href="#hatch"', '<li><div data-rf-mega-panel hidden></div></li><li class="rf-nav__item"><a class="rf-nav__btn" href="#hatch"')), ['1 mega panel(s) outside a mega item (li[data-rf-mega])']);
        assert.deepEqual(menuProblems(swap(FLIES_BUTTON, `<button type="button"></button>${FLIES_BUTTON}`)), ['mega item 1 has 2 buttons, not 1']);
    });

    it('fails a rail out of step with its panes: a pane missing, the first hidden or a second shown, the first rail link not active, a rail link with no pane or no name', () => {
        const nymphsPane = menus.slice(menus.indexOf(NYMPHS_PANE), menus.indexOf('<div class="rf-mega__pane rf-mega__pane--bare" data-rf-pane="503"'));
        assert.deepEqual(menuProblems(swap(nymphsPane, '')), ['the panes (501, 503, 504, 505, 506) don\'t match the rail (501, 502, 503, 504, 505, 506), in order']);
        assert.deepEqual(menuProblems(swap('<div class="rf-mega__pane rf-mega__pane--bare" data-rf-pane="501">', '<div class="rf-mega__pane rf-mega__pane--bare" data-rf-pane="501" hidden>')), ['pane 501 is hidden in the server HTML: the first is shown and the rest are hidden']);
        assert.deepEqual(menuProblems(swap(NYMPHS_PANE, NYMPHS_PANE.replace(' hidden', ''))), ['pane 502 is shown in the server HTML: the first is shown and the rest are hidden']);
        assert.deepEqual(menuProblems(swap(DRY_RAIL, DRY_RAIL.replace(' is-active', ''))), ['0 rail links are is-active (): the first is, alone']);
        assert.deepEqual(menuProblems(swap(NYMPHS_RAIL, NYMPHS_RAIL.replace('rf-mega__type"', 'rf-mega__type is-active"'))), ['2 rail links are is-active (Dry Flies, Nymphs): the first is, alone']);
        assert.match(menuProblems(swap(NYMPHS_RAIL, NYMPHS_RAIL.replace(' data-rf-pane-for="502"', ''))).join('\n'), /the rail link "Nymphs" has no data-rf-pane-for/);
        assert.deepEqual(menuProblems(swap(NYMPHS_RAIL, NYMPHS_RAIL.replace(' data-rf-cat="Nymphs"', ''))), ['the rail link to /nymphs/ has no data-rf-cat']);
    });

    it('fails a pane whose heading links elsewhere or is missing, and a subcategory with no href or no data-rf-cat', () => {
        assert.deepEqual(menuProblems(swap('<p class="rf-mega__head"><a href="/nymphs/">Nymphs</a>', '<p class="rf-mega__head"><a href="/streamers/">Nymphs</a>')), ['pane 502\'s heading links to /streamers/, not its rail link\'s /nymphs/']);
        assert.deepEqual(menuProblems(swap('<p class="rf-mega__head"><a href="/nymphs/">Nymphs</a>', '<p class="rf-mega__head"><span>Nymphs</span>')), ['pane 502 has no heading link (p.rf-mega__head a)']);
        assert.deepEqual(menuProblems(swap('<a href="/nymphs/euro-nymphs/" data-rf-cat="Euro Nymphs">', '<a data-rf-cat="Euro Nymphs">')), ['the nav link "Euro Nymphs" has no href', 'the subcategory "Euro Nymphs" in pane 502 has no href']);
        assert.deepEqual(menuProblems(swap('<a href="/nymphs/euro-nymphs/" data-rf-cat="Euro Nymphs">', '<a href="/nymphs/euro-nymphs/">')), ['the subcategory "Euro Nymphs" in pane 502 has no data-rf-cat']);
    });

    it('fails a species link with no href or no data-rf-cat', () => {
        assert.deepEqual(menuProblems(swap('<a href="/species/carp-flies/" data-rf-cat="Carp Flies">', '<a href="/species/carp-flies/">')), ['the species "Carp Flies" has no data-rf-cat']);
        assert.deepEqual(menuProblems(swap('<a href="/species/carp-flies/" data-rf-cat="Carp Flies">', '<a data-rf-cat="Carp Flies">')), ['the nav link "Carp Flies" has no href', 'the species "Carp Flies" has no href']);
    });

    it('fails a drawer shown in the server HTML, with no id, inside the header, twice or missing', () => {
        assert.deepEqual(menuProblems(swap(DRAWER, DRAWER.replace(' hidden', ''))), ['the drawer isn\'t hidden in the server HTML']);
        assert.deepEqual(menuProblems(swap(DRAWER, DRAWER.replace(' id="rf-drawer"', ''))), ['the drawer has no id for the Menu button\'s aria-controls']);
        const drawer = menus.slice(menus.indexOf(DRAWER), menus.indexOf('<div class="is-srOnly" role="status"'));
        assert.deepEqual(menuProblems(swap(drawer, '').replace('</header>', `${drawer}</header>`)), ['the drawer is inside the <header>: it belongs after it']);
        assert.deepEqual(menuProblems(swap(drawer, drawer + drawer)), ['2 drawers (data-rf-drawer), not 1']);
        assert.deepEqual(menuProblems(swap(drawer, '')), ['0 drawers (data-rf-drawer), not 1']);
    });

    it('fails a drawer that isn\'t a labelled modal dialog, has no close button, a disclosure with no summary, or a link with no href', () => {
        assert.deepEqual(menuProblems(swap(DIALOG, DIALOG.replace(' role="dialog"', ''))), ['0 dialogs (role="dialog") in the drawer, not 1']);
        assert.deepEqual(menuProblems(swap(DIALOG, DIALOG.replace(' aria-modal="true"', ''))), ['the drawer\'s dialog has no aria-modal="true"']);
        assert.deepEqual(menuProblems(swap(DIALOG, DIALOG.replace(' aria-labelledby="rf-drawer-title"', ''))), ['the drawer\'s dialog has no aria-labelledby']);
        assert.deepEqual(menuProblems(swap(DIALOG, DIALOG.replace('rf-drawer-title"', 'rf-drawer-nope"'))), ['the drawer\'s dialog is labelled by "rf-drawer-nope", which isn\'t in the drawer']);
        assert.deepEqual(menuProblems(swap('<p class="rf-drawer__title" id="rf-drawer-title">Menu</p>', '<p class="rf-drawer__title" id="rf-drawer-title"></p>')), ['the drawer\'s title (#rf-drawer-title) has no words']);
        assert.deepEqual(menuProblems(swap(CLOSE, CLOSE.replace(' data-rf-drawer-close', ''))), ['the drawer has no close control (button[data-rf-drawer-close])']);
        assert.deepEqual(menuProblems(swap(CLOSE, CLOSE.replace('<button', '<div')).replace('Close menu</span></button>', 'Close menu</span></div>')), ['the drawer\'s close control 1 isn\'t a <button type="button">']);
        assert.deepEqual(menuProblems(swap('<span class="is-srOnly">Close menu</span>', '')), ['the drawer\'s close button has no label']);
        assert.deepEqual(menuProblems(swap('<nav aria-label="Menu">', '<nav>')), ['the drawer\'s <nav> has no aria-label']);
        const group = menus.slice(menus.indexOf('<details class="rf-drawer__group" open>'), menus.indexOf('<ul class="rf-drawer__list">'));
        assert.match(menuProblems(swap(group, group.replace('<summary>', '<p>').replace('</summary>', '</p>'))).join('\n'), /a <details> in the drawer has no <summary> first: Flies/, 'the nested disclosures\' summaries don\'t count for the group');
        assert.deepEqual(menuProblems(swap('<li><a href="/dry-flies/mayfly-dry-flies/">Mayfly Dry Flies</a></li>', '<li><a>Mayfly Dry Flies</a></li>')), ['the drawer link "Mayfly Dry Flies" has no href', 'the drawer doesn\'t list 1 of the mega menus\' categories: /dry-flies/mayfly-dry-flies/']);
    });

    it('fails a drawer that drops a category the mega menus list', () => {
        assert.deepEqual(menuProblems(swap('<li><a href="/species/carp-flies/"><span>Carp Flies</span></a></li>', '')), ['the drawer doesn\'t list 1 of the mega menus\' categories: /species/carp-flies/']);
        const dryAll = '<li><a class="rf-drawer__all" href="/dry-flies/">All Dry Flies</a></li>';
        assert.deepEqual(menuProblems(swap(dryAll, '')), ['the drawer doesn\'t list 1 of the mega menus\' categories: /dry-flies/'], 'the rail link\'s page is the drawer\'s "All …" link');
    });

    it('fails a header with no nav row, and a page with no header', () => {
        assert.deepEqual(menuProblems(swap('<nav class="rf-nav" aria-label="Main">', '<div aria-label="Main">').replace('</nav>\n        <form', '</div>\n        <form')), ['the header has no nav row (nav.rf-nav)']);
        assert.deepEqual(menuProblems(frame('')), ['no ReelFlies header (data-rf-head), so no menu: components/common/header.html includes components/reelflies/header']);
    });
});
