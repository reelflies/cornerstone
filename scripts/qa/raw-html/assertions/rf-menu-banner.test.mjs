// Tests ticket 29's raw-HTML assertion rf-menu-banner (spec seam 2), redrawn for Streamside Stone,
// on the header as components/common/header.html renders it after head.html: the Flies panel on
// tree 4 with a pane's plate, which it passes, with none, and with the menu ids empty, which it
// passes too, and broken copies, which it fails.
//
//   node --test scripts/qa/raw-html/assertions/rf-menu-banner.test.mjs

import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { readFixture, renderPartial } from '../../render/render.mjs';
import { bannerProblems } from './rf-menu-banner.mjs';

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
const PAGE = 'rf-test/rf-menu-banner-page';
const WITH_HEAD = { [PAGE]: '{{> components/reelflies/head}}{{> components/common/header}}' };
const IMAGE = { data: 'https://cdn11.bigcommerce.com/s-test/images/stencil/{:size}/d/dry-flies__1.original.jpg', alt: '' };
const withDryImage = categories => categories.map(category => (category.id === '501' ? { ...category, image: IMAGE } : category));
const page = html => ({
    kind: 'category', key: 'category', path: '/', url: 'http://localhost:3501/', status: 200, html,
});

let plate;
let plain;
let bare;
before(async () => {
    const render = context => renderPartial(PAGE, { ...STORE, ...context }, { overrides: WITH_HEAD });
    plate = await render({ ...TREE_4, categories: withDryImage(TREE_4.categories) });
    plain = await render(TREE_4);
    bare = await render({ categories: withDryImage(TREE_4.categories), theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } });
});
const img = () => plate.match(/<img src="https:\/\/cdn11\.bigcommerce\.com\/s-test[^>]*>/)[0];
const link = () => plate.match(/<a class="rf-mega__plate"[^>]*>/)[0];
const swap = (from, to) => {
    const html = plate.replace(from, to);
    assert.notEqual(html, plate, `the fixture holds ${from}`);
    return html;
};

describe('rf-menu-banner', () => {
    it('passes the Flies panel with a plate, without one, and the header with the menu ids empty', () => {
        assert.match(plate, /class="rf-mega__plate"/);
        assert.deepEqual(bannerProblems(plate), []);
        assert.doesNotMatch(plain, /<img/);
        assert.deepEqual(bannerProblems(plain), []);
        assert.doesNotMatch(bare, /data-rf-mega-panel/);
        assert.deepEqual(bannerProblems(bare), []);
    });

    it('is registered, and runs on every page', async () => {
        const assertions = await loadAssertions();
        const found = assertions.find(assertion => assertion.id === 'rf-menu-banner');
        assert.ok(found);
        assert.equal(found.ticket, 29);
        assert.equal(found.pages, undefined);
        const result = html => checkPage(page(html), assertions).find(entry => entry.id === 'rf-menu-banner');
        assert.equal(result(plate).status, 'pass');
        assert.equal(result(swap('loading="lazy"', 'loading="eager"')).status, 'fail');
    });

    it('fails a plate image that would download on a phone or for a closed panel', () => {
        assert.match(bannerProblems(swap(' loading="lazy"', '')).join('\n'), /has loading="", not "lazy"/);
        assert.match(bannerProblems(swap('loading="lazy"', 'loading="eager"')).join('\n'), /has loading="eager", not "lazy"/);
        assert.match(bannerProblems(swap('loading="lazy"', 'loading="lazy" fetchpriority="high"')).join('\n'), /has fetchpriority="high"/);
    });

    it('fails a plate image without a srcset, sizes or dimensions, or with alt text', () => {
        const without = attribute => swap(img(), img().replace(attribute, ''));
        assert.match(bannerProblems(without(/ srcset="[^"]*"/)).join('\n'), /no srcset of two or more candidates/);
        assert.match(bannerProblems(swap(img(), img().replace(/ srcset="[^"]*"/, ' srcset="https://x/a.jpg 80w"'))).join('\n'), /no srcset of two or more candidates/);
        assert.match(bannerProblems(without(/ sizes="[^"]*"/)).join('\n'), /no sizes/);
        assert.match(bannerProblems(without(/ width="\d+"/)).join('\n'), /no width and height/);
        assert.match(bannerProblems(swap(img(), img().replace('alt=""', 'alt="Dry Flies"'))).join('\n'), /alt "Dry Flies", not ""/);
    });

    it('fails a plate link in the tab order or read by screen readers, or linking elsewhere than the heading', () => {
        assert.match(bannerProblems(swap(link(), link().replace(' tabindex="-1"', ''))).join('\n'), /pane 501's plate link isn't aria-hidden="true" with tabindex="-1"/);
        assert.match(bannerProblems(swap(link(), link().replace(' aria-hidden="true"', ''))).join('\n'), /pane 501's plate link isn't aria-hidden="true" with tabindex="-1"/);
        assert.match(bannerProblems(swap(link(), link().replace('href="/dry-flies/"', 'href="/nymphs/"'))).join('\n'), /pane 501's plate links to \/nymphs\/, not its heading's \/dry-flies\//);
    });

    it('fails an image in the rail, a second plate in a pane, a second image in a plate, an image loose in a pane, and an image in the drawer', () => {
        const rail = '<ul class="rf-mega__rail">';
        assert.match(bannerProblems(swap(rail, `${rail}<li>${img()}</li>`)).join('\n'), /1 image\(s\) in the header's menus outside a pane's plate/);
        const whole = plate.slice(plate.indexOf(link()), plate.indexOf('</a>', plate.indexOf(link())) + 4);
        assert.match(bannerProblems(swap(whole, whole + whole)).join('\n'), /pane 501 has 2 plates, not one at most/);
        assert.match(bannerProblems(swap(img(), img() + img())).join('\n'), /pane 501's plate holds 2 images, not 1/);
        assert.match(bannerProblems(swap('<ul class="rf-mega__kids">', `${img()}<ul class="rf-mega__kids">`)).join('\n'), /pane 501 has 1 image\(s\) outside its plate/);
        assert.match(bannerProblems(swap('<p class="rf-drawer__title"', `${img()}<p class="rf-drawer__title"`)).join('\n'), /1 image\(s\) in the drawer: a phone would download them with the page/);
    });
});
