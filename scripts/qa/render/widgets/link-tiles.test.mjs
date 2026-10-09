// Fixture renders of the home page's row of six tiles (ticket 47; spec module 7, R5, CD-11,
// UX-14): what the store renders from widgets/link-tiles/template.html with a channel's
// widget_configuration. The element shots at 375 and 1280 are widget-screens.spec.mjs's, and
// the row's place on the page (the 1,600px check, the phone grid) home-widgets-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/link-tiles.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';

const DIR = path.join(WIDGETS_DIR, 'link-tiles');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const render = (configuration = {}) => renderWidget('link-tiles', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const WIDTHS = [160, 320, 480, 640];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The reference's picks (plan/design/src/reference.src.html, MORE6), in its order, with the
// approved tree's paths (store-data.json, menu, until refactor 06's new-tree.json) and each
// product's default photo.
const TILES = [
    { name: 'Eggs & Worms', href: '/eggs-worms/', photo: 'products/5101/5675/Glo-Bug-Pink__15852.1683224794.jpg' },
    { name: 'Warmwater Flies', href: '/warmwater-flies/', photo: 'products/5300/7715/monster-streamer-trout2__75966.1732217781.jpg' },
    { name: 'Saltwater Flies', href: '/saltwater-flies/', photo: 'products/3857/7541/crazy-charly-pink-copy__16533.1700837768.jpg' },
    { name: 'Flies by Species', href: '/species/', photo: 'products/5490/7717/green-machine-silver__87528.1732217881.jpg' },
    { name: 'Fly Selections & Assortments', href: '/fly-selections-assortments/', photo: 'products/5445/5173/30-nymph-assortment__43187.1540056038.jpg' },
    { name: 'Fly Gear', href: '/fly-gear/', photo: 'products/4398/7875/large-box-with-logo__49912.1766759364.jpg' },
];
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const tilesOf = html => html.split('<li class="rf-link-tiles__item">').slice(1).map(part => part.slice(0, part.indexOf('</li>')));
const unescape = value => value.replace(/&amp;/g, '&');

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
});

test('it is placed first in home_below_top_products on ReelFlies_CA, active since the checkpoint-02 release carried its styles, with the uuids its first write made', () => {
    // The status isn't pinned: an R12 unpublish (ticket 57) sets it inactive in a PR that must
    // pass CI; --verify compares it with the store.
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 10 });
    assert.ok(['active', 'inactive'].includes(status), status);
    // Recorded by --record after the first write (2026-10-08, plan c89f5701); --verify compares them with the store.
    for (const name of ['template', 'widget', 'placement']) assert.match(channelFile.uuids[name], UUID, `its ${name} is recorded`);
    assert.equal(fixture.region, channelFile.placement.region);
});

test('six tiles, in the reference\'s order, in a list named by its field, with no heading', async () => {
    const html = await render();
    assert.match(html, /<ul class="rf-link-tiles" aria-label="More fly types and collections">/);
    const tiles = tilesOf(html);
    assert.deepEqual(tiles.map(tile => unescape(text(tile))), TILES.map(({ name }) => name));
    assert.equal(findTags(html, 'h1').length + findTags(html, 'h2').length + findTags(html, 'h3').length, 0);
    assert.deepEqual(unbalancedTags(html), []);
});

test('each tile is exactly one link to its page, with nothing interactive inside it', async () => {
    for (const [index, tile] of tilesOf(await render()).entries()) {
        const { name, href } = TILES[index];
        const links = findTags(tile, 'a');
        assert.equal(links.length, 1, `${name}: one link`);
        assert.equal(links[0].attrs.href, href);
        assert.ok(tile.trim().endsWith('</a>'), `${name}: everything in the tile is inside its link`);
        assert.equal(findTags(tile, 'button').length + findTags(tile, 'input').length, 0);
    }
});

test('each photo is a real <img>: alt="", lazy, a srcset from 160w to 640w, sizes, width and height, no fetchpriority', async () => {
    for (const [index, tile] of tilesOf(await render()).entries()) {
        const { name, photo } = TILES[index];
        const [img, ...more] = findTags(tile, 'img');
        assert.equal(more.length, 0, `${name}: one image`);
        assert.equal(img.attrs.alt, '', `${name}: decorative, the tile's name says where it goes`);
        assert.equal(img.attrs.loading, 'lazy');
        assert.equal(img.attrs.srcset, WIDTHS.map(width => `${BASE}/${width}w/${photo} ${width}w`).join(', '));
        assert.equal(img.attrs.src, `${BASE}/320w/${photo}`);
        assert.equal(img.attrs.sizes, '(max-width: 800px) calc(50vw - 29px), (max-width: 1260px) calc(32vw - 16px), 172px');
        assert.equal(img.attrs.width, '1024');
        assert.equal(img.attrs.height, '683');
        assert.ok(!('fetchpriority' in img.attrs), name);
    }
});

test('no two tiles share a photo, and none uses a card banner or the hero\'s frame (CD-1, CD-4)', () => {
    const photos = Object.entries(channelFile.configuration).filter(([key]) => /^tile\d_photo$/.test(key)).map(([, value]) => value);
    assert.equal(new Set(photos).size, 6);
    for (const photo of photos) assert.doesNotMatch(photo, /dry-flies__|nymphs-sub-surface__|streamers-buggers__|bass-panfish__/);
});

test('channel 1\'s copy carries its own paths in the same fields (ticket 53)', async () => {
    const html = await render({ tile1_url: '/flies/eggs-worms/', tile4_url: '/flies/' });
    const hrefs = findTags(html, 'a').map(tag => tag.attrs.href);
    assert.equal(hrefs[0], '/flies/eggs-worms/');
    assert.equal(hrefs[3], '/flies/');
});

test('the text is escaped, never raw HTML from a field', async () => {
    const html = await render({ tile1_name: 'Eggs <script>alert(1)</script>' });
    assert.equal(findTags(html, 'script').length, 0);
    assert.ok(html.includes('Eggs &lt;script&gt;'));
});

test('the template and its partial use no inline styles: the theme\'s ReelFlies layer styles them (decision 6)', () => {
    for (const file of [path.join(DIR, 'template.html'), path.join(WIDGETS_DIR, '_shared', 'link-tile.html')]) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /style=|<style/, file);
    }
});
