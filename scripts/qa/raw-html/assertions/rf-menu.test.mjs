// Tests ticket 28's raw-HTML assertion rf-menu (spec seam 2) on pages built round the header as
// components/common/header.html renders it: the grouped menu on tree 4, which it passes, the
// stock fallback, which it passes too, and broken copies of the grouped menu, which it fails.
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
    settings: { store_logo: { image: null, title: 'ReelFlies.ca' }, phone_number: '1 866 250 4071', blog_enabled: true },
    pages: [],
    page_type: 'default',
};
const STRIP = '<div data-widget-id="w"><div class="rf-strip" data-rf-strip><p>Free standard shipping on fly orders over $60</p></div></div>';
const frame = header => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body>${header}<main id="main-content"><h1>Dry Flies</h1></main></body></html>`;
const page = (html, kind = 'category') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3501/', status: 200, html,
});

let grouped;
let stock;
before(async () => {
    const options = { regions: { 'header_bottom--global': STRIP } };
    grouped = frame(await renderPartial('components/common/header', { ...STORE, ...TREE_4 }, options));
    stock = frame(await renderPartial('components/common/header', {
        ...STORE, categories: TREE_4.categories, theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' },
    }, options));
});
const swap = (from, to) => {
    const html = grouped.replace(from, to);
    assert.notEqual(html, grouped, `the fixture holds ${from}`);
    return html;
};

describe('rf-menu', () => {
    it('is registered, for every page kind', async () => {
        const assertion = (await loadAssertions()).find(entry => entry.id === 'rf-menu');
        assert.ok(assertion);
        assert.equal(assertion.ticket, 28);
        assert.equal(assertion.pages, undefined);
    });

    it('passes the grouped menu the header renders, and every other registered assertion passes that page too', async () => {
        assert.deepEqual(menuProblems(grouped), []);
        const assertions = (await loadAssertions()).filter(({ ticket }) => [27, 28].includes(ticket));
        const failed = checkPage(page(grouped), assertions).filter(({ status }) => status !== 'pass');
        assert.deepEqual(failed.map(({ id, problems }) => `${id}: ${problems}`), []);
    });

    it('passes the stock navigation, the fallback with both ids empty', () => {
        assert.match(stock, /class="navPages"/);
        assert.deepEqual(menuProblems(stock), []);
    });

    it('fails an "All {category}" line', () => {
        const html = swap('<ul class="rf-menu-kids">', '<ul class="rf-menu-kids"><li><a href="/dry-flies/" data-rf-category="501">All Dry Flies</a></li>');
        assert.deepEqual(menuProblems(html), ['the menu has an "All Dry Flies" link: each pane\'s heading is the link (O06)']);
    });

    it('fails a category link without data-rf-category, or without an href', () => {
        assert.deepEqual(menuProblems(swap('<a href="/nymphs/euro-nymphs/" data-rf-category', '<a href="/nymphs/euro-nymphs/" data-rf-other')), ['the category link "Euro Nymphs" has no data-rf-category']);
        assert.deepEqual(menuProblems(swap('rf-menu-name--plain" href="/clearance/"', 'rf-menu-name--plain"')), ['the menu link "Clearance" has no href']);
    });

    it('fails a pane with no heading link, one shown in the server HTML, and a button that opens nothing', () => {
        assert.match(menuProblems(swap(/<h2 class="rf-menu-heading"><a href="\/dry-flies\/"[^>]*>/, '<h2 class="rf-menu-heading"><span>').replace('</a></h2>', '</span></h2>')).join('\n'), /rf-menu-pane-501's heading holds 0 links, not 1/);
        assert.deepEqual(menuProblems(swap('id="rf-menu-pane-502" data-rf-menu-pane hidden', 'id="rf-menu-pane-502" data-rf-menu-pane')), ['rf-menu-pane-502 isn\'t hidden in the server HTML']);
        assert.deepEqual(menuProblems(swap('aria-controls="rf-menu-pane-503"', 'aria-controls="rf-menu-pane-999"')), [
            'rf-menu-pane-503 is opened by 0 buttons, not 1',
            'a menu button controls "rf-menu-pane-999", which isn\'t a pane in the menu',
        ]);
        assert.deepEqual(
            menuProblems(swap('aria-controls="rf-menu-pane-504" data-rf-menu-toggle', 'aria-controls="rf-menu-pane-504" data-rf-menu-toggle data-x').replace('aria-expanded="false" aria-controls="rf-menu-pane-504"', 'aria-expanded="true" aria-controls="rf-menu-pane-504"')),
            ['the menu button for rf-menu-pane-504 has aria-expanded "true", not "false"'],
        );
    });

    it('fails data-menu on the grouped menu\'s container, the stock navigation beside it, and a second menu', () => {
        assert.deepEqual(menuProblems(swap('id="menu">', 'id="menu" data-menu>')), ['#menu carries data-menu with the grouped menu in it: stock menu.js would bind to it']);
        assert.deepEqual(menuProblems(swap('<nav class="rf-menu"', '<nav class="navPages"></nav><nav class="rf-menu"')), ['the stock navigation (.navPages) renders beside the grouped menu']);
        assert.deepEqual(menuProblems(grouped.replace('</main>', '<nav data-rf-menu aria-label="x"></nav></main>')), ['2 grouped menus (<nav data-rf-menu>), not 1']);
    });

    it('fails a grouped menu outside the header, or with no name', () => {
        const moved = grouped.replace(/<nav class="rf-menu"[\s\S]*?<\/nav>\s*<\/div>/, '</div>').replace('</main>', '<nav class="rf-menu" aria-label="Shop flies" data-rf-menu></nav></main>');
        assert.deepEqual(menuProblems(moved), ['the grouped menu isn\'t inside the ReelFlies <header>']);
        assert.deepEqual(menuProblems(swap('<nav class="rf-menu" aria-label="Shop flies"', '<nav class="rf-menu"')), ['the grouped menu\'s <nav> has no aria-label']);
    });
});
