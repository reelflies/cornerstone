// The banner strip at the top of each desktop pane (ticket 29; O09, SEO-3, story 7):
// components/reelflies/menu-banner.html, which menu-item.html includes in a pane whose category
// has an image in the categories data (ticket 07's probe 1: on tree 1, all 61 menu categories
// have one). It renders from fixture store data the way stencil start renders it (W0-9), on tree 4
// and on tree 1 with the channel-1 variation's ids. The browser checks (its size at 1280, the child
// links within 200px of the panel's top, nothing downloaded at 375 or for a closed pane) are
// rail.spec.mjs's; the raw HTML on the storefront is the rf-menu-banner assertion's.
//
//   node --test scripts/qa/render/partials/menu-banner.test.mjs

import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { elementSource } from '../../raw-html/assertions/rf-header.mjs';
import { menuProblems, menuSource } from '../../raw-html/assertions/rf-menu.mjs';
import { bannerProblems } from '../../raw-html/assertions/rf-menu-banner.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { readFixture, renderPartial } from '../render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TREE_4 = readFixture(path.join(HERE, 'menu/tree-4.json'));
const TREE_1 = readFixture(path.join(HERE, 'menu/tree-1.json'));
const STORE = {
    urls: {
        home: 'https://reelflies.ca/', search: '/search.php', cart: '/cart.php', account: { index: '/account.php' }, auth: { login: '/login.php' },
    },
    settings: { store_logo: { image: null, title: 'ReelFlies.ca' }, phone_number: '1 866 250 4071', blog_enabled: true },
    pages: [],
    page_type: 'default',
};
// A category image as the categories data gives it: a CDN URL with the {:size} placeholder.
const imageOf = id => ({ data: `https://cdn11.bigcommerce.com/s-test/images/stencil/{:size}/c/category-${id}__1.original.jpg`, alt: '' });

// The tree with an image on each category whose id is in `ids`, at any depth.
function withImages(fixture, ids) {
    const add = categories => categories.map(category => ({
        ...category,
        ...(ids.includes(String(category.id)) ? { image: imageOf(category.id) } : {}),
        children: add(category.children || []),
    }));
    return { ...fixture, categories: add(fixture.categories) };
}

const render = (fixture, options) => renderPartial('components/common/header', { ...STORE, ...fixture }, options);
const paneSource = (html, id) => elementSource(menuSource(html), 'div', attrs => attrs.id === `rf-menu-pane-${id}`);
const banners = html => findTags(menuSource(html), 'img');

describe('the banner strip on tree 4', () => {
    it('puts the category\'s own image at the top of its pane: lazy, decorative, with srcset, sizes and its 16:7 dimensions', async () => {
        const html = await render(withImages(TREE_4, ['501']));
        const pane = paneSource(html, '501');
        const imgs = findTags(pane, 'img');
        assert.equal(imgs.length, 1);
        const { attrs } = imgs[0];
        const url = size => imageOf('501').data.replace('{:size}', size);
        assert.ok('data-rf-menu-banner' in attrs);
        assert.match(attrs.class, /(^|\s)rf-menu-banner(\s|$)/);
        assert.equal(attrs.alt, '', 'decorative: the heading beside it names the category');
        assert.equal(attrs.loading, 'lazy', 'a closed pane, and a phone, download nothing');
        assert.equal(attrs.decoding, 'async');
        assert.equal(attrs.src, url('320w'));
        const candidates = ['160w', '320w', '480w', '640w'].map(size => `${url(size)} ${size}`);
        assert.deepEqual(attrs.srcset.split(',').map(candidate => candidate.trim()), candidates);
        assert.match(attrs.sizes, /^\(min-width: 1240px\) 268px, calc\(\(100vw - 420px\) \/ 3\)$/);
        assert.equal(Number(attrs.width) * 7, Number(attrs.height) * 16, 'the store\'s category images are 1600x700');
        assert.ok(!('fetchpriority' in attrs), 'never high priority: the panel opens after the page has loaded');
        assert.ok(pane.indexOf('<img') < pane.indexOf('<h2'), 'at the top of the pane, before its heading');
    });

    it('leaves a pane whose category has no image without one, and puts no image in the rail', async () => {
        const html = await render(withImages(TREE_4, ['501']));
        assert.equal(findTags(paneSource(html, '502'), 'img').length, 0);
        assert.equal(banners(html).length, 1);
        assert.equal(banners(await render(TREE_4)).length, 0, 'no image anywhere in the menu without one in the data');
    });

    it('gives the Species and More panes theirs too, but never a plain link in the rail', async () => {
        // 520 is Flies by Species, 550 Fly Gear (More); 560 Clearance has no children, so it is a
        // plain link with no pane.
        const html = await render(withImages(TREE_4, ['520', '550', '560']));
        assert.equal(findTags(paneSource(html, '520'), 'img').length, 1);
        assert.equal(findTags(paneSource(html, '550'), 'img').length, 1);
        assert.equal(banners(html).length, 2);
    });

    it('still passes the rf-menu assertion, and passes the rf-menu-banner one, with balanced tags', async () => {
        const html = await render(withImages(TREE_4, ['501', '502', '503', '504', '505', '506', '520', '540', '550']));
        assert.deepEqual(menuProblems(html), []);
        assert.deepEqual(bannerProblems(html), []);
        assert.deepEqual(unbalancedTags(html), []);
    });
});

describe('the banner strip on tree 1 (channel 1, "ReelFlies CA channel 1")', () => {
    it('gives each Fly Type pane its category\'s image, and none to Flies, which is a plain link there', async () => {
        const ids = ['298', '251', '255', '272', '438', '398'];
        const html = await render(withImages(TREE_1, ids), { variation: 'ReelFlies CA channel 1' });
        ['298', '251', '255', '272', '438'].forEach(id => {
            const imgs = findTags(paneSource(html, id), 'img');
            assert.equal(imgs.length, 1, `pane ${id}`);
            assert.equal(imgs[0].attrs.src, imageOf(id).data.replace('{:size}', '320w'));
        });
        assert.equal(banners(html).length, 5, 'Flies (398) has no pane on channel 1: its children are the Fly Types');
        assert.deepEqual(bannerProblems(html), []);
    });
});
