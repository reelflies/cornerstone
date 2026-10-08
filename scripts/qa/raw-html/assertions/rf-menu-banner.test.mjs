// Tests ticket 29's raw-HTML assertion rf-menu-banner (spec seam 2) on the header as
// components/common/header.html renders it: the grouped menu on tree 4 with banners, which it
// passes, with none, and the stock fallback, which it passes too, and broken copies, which it
// fails.
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
    settings: { store_logo: { image: null, title: 'ReelFlies.ca' }, phone_number: '1 866 250 4071', blog_enabled: true },
    pages: [],
    page_type: 'default',
};
const IMAGE = { data: 'https://cdn11.bigcommerce.com/s-test/images/stencil/{:size}/d/dry-flies__1.original.jpg', alt: '' };
const withDryImage = categories => categories.map(category => (category.id === '501' ? { ...category, image: IMAGE } : category));
const page = html => ({
    kind: 'category', key: 'category', path: '/', url: 'http://localhost:3501/', status: 200, html,
});

let banner;
let plain;
let stock;
before(async () => {
    banner = await renderPartial('components/common/header', { ...STORE, ...TREE_4, categories: withDryImage(TREE_4.categories) });
    plain = await renderPartial('components/common/header', { ...STORE, ...TREE_4 });
    stock = await renderPartial('components/common/header', {
        ...STORE, categories: withDryImage(TREE_4.categories), theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' },
    });
});
const img = () => banner.match(/<img class="rf-menu-banner"[^>]*>/)[0];
const swap = (from, to) => banner.replace(from, to);

describe('rf-menu-banner', () => {
    it('passes the grouped menu with a banner, without one, and the stock fallback', () => {
        assert.match(banner, /data-rf-menu-banner/);
        assert.deepEqual(bannerProblems(banner), []);
        assert.deepEqual(bannerProblems(plain), []);
        assert.deepEqual(bannerProblems(stock), []);
    });

    it('is registered, and runs on every page', async () => {
        const assertions = await loadAssertions();
        const found = assertions.find(assertion => assertion.id === 'rf-menu-banner');
        assert.ok(found);
        assert.equal(found.ticket, 29);
        const result = id => checkPage(page(id), assertions).find(entry => entry.id === 'rf-menu-banner');
        assert.equal(result(banner).status, 'pass');
        assert.equal(result(swap('loading="lazy"', 'loading="eager"')).status, 'fail');
    });

    it('fails a banner that would download on a phone or for a closed pane', () => {
        assert.match(bannerProblems(swap(' loading="lazy"', '')).join('\n'), /not "lazy"/);
        assert.match(bannerProblems(swap('loading="lazy"', 'loading="eager"')).join('\n'), /not "lazy"/);
        assert.match(bannerProblems(swap('loading="lazy"', 'loading="lazy" fetchpriority="high"')).join('\n'), /fetchpriority/);
    });

    it('fails a banner without a srcset, sizes or dimensions, or with alt text', () => {
        const without = attribute => swap(img(), img().replace(attribute, ''));
        assert.match(bannerProblems(without(/ srcset="[^"]*"/)).join('\n'), /no srcset/);
        assert.match(bannerProblems(without(/ sizes="[^"]*"/)).join('\n'), /no sizes/);
        assert.match(bannerProblems(without(/ width="\d+"/)).join('\n'), /no width and height/);
        assert.match(bannerProblems(swap(img(), img().replace('alt=""', 'alt="Dry Flies"'))).join('\n'), /alt "Dry Flies"/);
    });

    it('fails an image in the rail, a second image in a pane, or a banner under the heading', () => {
        const toggle = '<button class="rf-menu-toggle"';
        assert.match(bannerProblems(banner.replace(toggle, `${img()}${toggle}`)).join('\n'), /outside a pane/);
        assert.match(bannerProblems(swap(img(), `${img()}${img()}`)).join('\n'), /2 images/);
        const heading = banner.match(/<h2 class="rf-menu-heading">[\s\S]*?<\/h2>/)[0];
        assert.match(bannerProblems(swap(img(), '').replace(heading, `${heading}${img()}`)).join('\n'), /after its heading/);
        assert.match(bannerProblems(swap(' data-rf-menu-banner', '')).join('\n'), /no data-rf-menu-banner/);
    });
});
