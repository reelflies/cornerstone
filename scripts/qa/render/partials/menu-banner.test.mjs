// The plate in a Flies pane (ticket 29; O09, SEO-3, story 7; redrawn for Streamside Stone,
// DESIGN.md "Mega menu"): cat-view.html's pane view puts the category's own photograph beside its
// subcategories, in <a class="rf-mega__plate">, when the categories data gives the category an
// image (ticket 07's probe 1: on tree 1, all 61 menu categories have one). It renders from fixture
// store data the way stencil start renders it (W0-9), after head.html, on tree 4 and on tree 1
// with the channel-1 variation's ids. The raw HTML on the storefront is the rf-menu-banner
// assertion's.
//
// Retired with the redesign: the banner strip at the top of the pane (menu-banner.html,
// data-rf-menu-banner, before the pane's <h2>) and its 827px sizes; the plate is a 400px graded
// stone plate named "All …" in mist, hidden from the keyboard and screen readers because the
// pane's heading is the same link.
//
//   node --test scripts/qa/render/partials/menu-banner.test.mjs

import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, outerHtml, textOf } from '../../raw-html/html.mjs';
import { headerSource } from '../../raw-html/assertions/rf-header.mjs';
import {
    drawerSource, menuProblems, menuSource, panelSource, panesFromHtml,
} from '../../raw-html/assertions/rf-menu.mjs';
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
    settings: {
        store_logo: { image: null, title: 'ReelFlies.ca' }, store_name: 'ReelFlies', phone_number: '1 866 250 4071', blog_enabled: true,
    },
    pages: [],
    page_type: 'default',
};
const PAGE = 'rf-test/menu-banner-page';
const WITH_HEAD = { [PAGE]: '{{> components/reelflies/head}}{{> components/common/header}}' };
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

const render = (fixture, context = {}, options = {}) => renderPartial(PAGE, {
    ...STORE, ...fixture, ...context, theme_settings: { ...fixture.theme_settings, ...context.theme_settings },
}, { overrides: WITH_HEAD, ...options });
const hasClass = (name, attrs) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const pane = (html, id) => panesFromHtml(panelSource(html, 'rf-mega-flies')).find(entry => entry.id === id);
const plateOf = (html, id) => outerHtml(pane(html, id).source, 'a', attrs => hasClass('rf-mega__plate', attrs));
const images = html => findTags(menuSource(headerSource(html)), 'img');

describe('the plate on tree 4', () => {
    it('puts the category\'s own photograph in its pane\'s plate: lazy, decorative, with srcset, sizes and its 16:7 box, linking where the heading does, out of the tab order and hidden from screen readers', async () => {
        const html = await render(withImages(TREE_4, ['501']));
        const dry = pane(html, '501');
        assert.ok(!hasClass('rf-mega__pane--bare', findTags(dry.source, 'div')[0].attrs), 'a pane with a plate isn\'t bare');
        const plate = plateOf(html, '501');
        const [link] = findTags(plate, 'a');
        assert.equal(link.attrs.href, '/dry-flies/', 'the heading\'s link');
        assert.equal(link.attrs.tabindex, '-1');
        assert.equal(link.attrs['aria-hidden'], 'true');
        assert.equal(textOf(plate), 'All Dry Flies', 'named in mist on the stone');
        const imgs = findTags(plate, 'img');
        assert.equal(imgs.length, 1);
        const { attrs } = imgs[0];
        const url = size => imageOf('501').data.replace('{:size}', size);
        assert.equal(attrs.alt, '', 'decorative: the heading beside it names the category');
        assert.equal(attrs.loading, 'lazy', 'a closed panel, a hidden pane and a phone download nothing');
        assert.equal(attrs.decoding, 'async');
        // The template asks getImage for 800x800; stencil-paper (stencil start's and the store's)
        // answers the original for a size that isn't a theme preset, and the srcset chooses the
        // file anyway. The src is the category's own image, whatever the size segment.
        assert.match(attrs.src, /^https:\/\/cdn11\.bigcommerce\.com\/s-test\/images\/stencil\/[^/]+\/c\/category-501__1\.original\.jpg$/);
        const candidates = ['80w', '160w', '320w', '640w', '960w', '1280w', '1920w', '2560w'].map(size => `${url(size)} ${size}`);
        assert.deepEqual(attrs.srcset.split(',').map(candidate => candidate.trim()), candidates, 'the stock default sizes, so a 2x screen takes the 960w file');
        assert.equal(attrs.sizes, '400px');
        assert.equal(Number(attrs.width) * 7, Number(attrs.height) * 16, 'the store\'s category images are 16:7');
        assert.ok(!('fetchpriority' in attrs), 'never high priority: the panel opens after the page has loaded');
        assert.ok(dry.source.indexOf('rf-mega__kids') < dry.source.indexOf('rf-mega__plate'), 'beside the subcategories, after them in the source');
        assert.deepEqual(unbalancedTags(plate), []);
    });

    it('leaves a pane whose category has no image bare, with no plate, and puts no image in the rail, the Species panel or the drawer', async () => {
        const html = await render(withImages(TREE_4, ['501']));
        const nymphs = pane(html, '502');
        assert.ok(hasClass('rf-mega__pane--bare', findTags(nymphs.source, 'div')[0].attrs));
        assert.equal(nymphs.plate, null);
        assert.equal(findTags(nymphs.source, 'img').length, 0);
        assert.equal(images(html).length, 1);
        assert.equal(findTags(panelSource(html, 'rf-mega-species'), 'img').length, 0);
        assert.equal(findTags(drawerSource(html), 'img').length, 0, 'a phone would download it with the page');
        const plain = await render(TREE_4);
        assert.equal(findTags(headerSource(plain), 'img').length + findTags(drawerSource(plain), 'img').length, 0, 'no image anywhere without one in the data');
    });

    it('gives a plate to a Fly Type pane only: an image on the Species root, a plain link or a subcategory draws none', async () => {
        const html = await render(withImages(TREE_4, ['520', '550', '642']));
        assert.equal(images(html).length, 0);
        const asType = await render(withImages(TREE_4, ['642']), { theme_settings: { rf_menu_type_ids: '642' } });
        assert.equal(images(asType).length, 1);
        assert.equal(findTags(plateOf(asType, '642'), 'a')[0].attrs.href, '/dry-flies/mayfly-dry-flies/');
    });

    it('still passes the rf-menu assertion, and passes the rf-menu-banner one, with balanced tags', async () => {
        const html = await render(withImages(TREE_4, ['501', '502', '503', '504', '505', '506', '520', '540', '550']));
        assert.equal(images(html).length, 6);
        assert.deepEqual(menuProblems(html), []);
        assert.deepEqual(bannerProblems(html), []);
        assert.deepEqual(unbalancedTags(html), []);
    });
});

describe('the plate on tree 1 (channel 1, "ReelFlies CA channel 1")', () => {
    it('gives each Fly Type pane its category\'s image, and none to Flies, which holds the Fly Types and sits in no menu', async () => {
        const ids = ['298', '251', '255', '272', '438', '398'];
        const html = await render(withImages(TREE_1, ids), {}, { variation: 'ReelFlies CA channel 1' });
        ['298', '251', '255', '272', '438'].forEach(id => {
            const imgs = findTags(plateOf(html, id), 'img');
            assert.equal(imgs.length, 1, `pane ${id}`);
            assert.match(imgs[0].attrs.src, new RegExp(`/c/category-${id}__1\\.original\\.jpg$`));
        });
        assert.equal(images(html).length, 5);
        assert.deepEqual(bannerProblems(html), []);
    });
});
