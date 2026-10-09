// Tests the species-hub assertion (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70 and
// 72) on the hub the template renders from tree-4-shaped data (the fixture page's own,
// render/pages/species-hub/fixtures/tree-4.json), and on hand-made breakages of it.
//
//   node --test scripts/qa/raw-html/assertions/species-hub.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import speciesHub, { EAGER } from './species-hub.mjs';

const CONTEXT = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/pages/species-hub/fixtures/tree-4.json'), 'utf8')).page_context;
const CANONICAL = '<link rel="canonical" href="https://reelflies.ca/species/">';

// The hub as the harness fetches it from /species/: the store puts the canonical in head.meta_tags.
const page = async ({ category = {}, head = CANONICAL, pagePath = '/species/' } = {}) => ({
    kind: 'species-hub',
    key: 'species-hub',
    path: pagePath,
    url: `http://localhost:3301${pagePath}`,
    status: 200,
    html: await renderPartial('pages/custom/category/species-hub', {
        ...CONTEXT,
        category: { ...CONTEXT.category, ...category },
        head: { meta_tags: head },
        settings: {},
    }),
});
const problems = (good, from, to) => speciesHub.check({ ...good, html: good.html.replace(from, to) }).join('\n');

test('applies to the species-hub pins, ticket 34, with two eager tile photos', () => {
    assert.deepEqual(speciesHub.pages, ['species-hub']);
    assert.equal(speciesHub.ticket, 34);
    assert.equal(EAGER, 2);
});

test('passes the rendered hub, a hub with 24 cards a page and a pager, and one with no products', async () => {
    assert.deepEqual(speciesHub.check(await page()), []);
    const products = Array.from({ length: 24 }, (_, index) => ({ ...CONTEXT.category.products[index % 6], id: 9000 + index }));
    assert.deepEqual(speciesHub.check(await page({ category: { products } })), []);
    assert.deepEqual(speciesHub.check(await page({ category: { products: [], total_products: 0 } })), []);
});

test('passes a canonical on another host, or with ?page=2: the path is the page\'s own', async () => {
    assert.deepEqual(speciesHub.check(await page({ head: '<link rel="canonical" href="https://reelflies_ca-1895766.mybigcommerce.com/species/?page=2">', pagePath: '/species/?page=2' })), []);
});

test('fails a page that isn\'t the hub: no tiles, the wrong H1, or the H1 or tiles outside <main>', async () => {
    assert.match(speciesHub.check({ kind: 'species-hub', path: '/species/', html: '<main><h1>Flies by Species</h1></main>' }).join('\n'), /no Species tiles \(\[data-rf-hub-tiles\]\)/);
    const good = await page();
    assert.match(problems(good, 'Fly Fishing Flies by Species</h1>', 'Flies by Species</h1>'), /the H1 reads "Flies by Species", not "Fly Fishing Flies by Species"/);
    assert.match(problems(good, '<main class="rf-hub" data-rf-hub>', '<div class="rf-hub" data-rf-hub>'), /the H1 and the tiles aren't inside <main>/);
});

test('fails a tile with no name link, a photo link that a keyboard or a screen reader meets, or one to another page', async () => {
    const good = await page();
    assert.match(problems(good, /<h2 class="rf-hub-tile__name"><a href="[^"]*">/, '<h2 class="rf-hub-tile__name"><a>'), /tile 1 \(Trout Flies\) has no name link with an href in an <h2>/);
    assert.match(problems(good, 'tabindex="-1" aria-hidden="true"', 'aria-hidden="true"'), /tile 1 \(Trout Flies\): its photo's link isn't out of the tab order and hidden from screen readers/);
    assert.match(problems(good, 'class="rf-hub-tile__media" href="https://reelflies.ca/species/trout-flies/"', 'class="rf-hub-tile__media" href="/elsewhere/"'), /tile 1 \(Trout Flies\): its photo links to \/elsewhere\/, not its name's page/);
});

test('fails a tile photo with no srcset, sizes, width or height, or loaded through lazysizes', async () => {
    const good = await page();
    assert.match(problems(good, /(class="rf-hub-tile__img"[^>]*?) srcset="[^"]*"/, '$1'), /tile 1 \(Trout Flies\)'s photo has no srcset/);
    assert.match(problems(good, /(class="rf-hub-tile__img"[^>]*?) sizes="[^"]*"/, '$1'), /tile 1 \(Trout Flies\)'s photo has no sizes/);
    assert.match(problems(good, /(class="rf-hub-tile__img"[^>]*?) width="600"/, '$1'), /tile 1 \(Trout Flies\)'s photo has no width/);
    assert.match(problems(good, 'class="rf-hub-tile__img" src=', 'class="rf-hub-tile__img lazyload" data-srcset="x" src='), /tile 1 \(Trout Flies\)'s photo loads through lazysizes/);
});

test('fails a hub whose first two tile photos aren\'t eager, a later one that isn\'t lazy, or a page with another high-priority image', async () => {
    const good = await page();
    assert.match(problems(good, 'alt="" fetchpriority="high"', 'alt="" fetchpriority="high" loading="lazy"'), /tile 1 \(Trout Flies\)'s photo is lazy: the first 2 load eagerly/);
    assert.match(problems(good, ' fetchpriority="high"', ''), /tile 1 \(Trout Flies\)'s photo has no fetchpriority="high"/);
    const third = good.html.indexOf('loading="lazy"', good.html.indexOf('rf-hub-tile__img'));
    assert.match(speciesHub.check({ ...good, html: `${good.html.slice(0, third)}${good.html.slice(third + 'loading="lazy"'.length)}` }).join('\n'), /tile 3 \(Atlantic Salmon Flies\)'s photo isn't lazy: only the first 2 load eagerly/);
    assert.match(problems(good, '<article', '<img src="/x.jpg" fetchpriority="high" alt=""><article'), /2 images have fetchpriority="high": only the first tile's photo/);
});

test('fails a Fly Type list with no links, or a link with no href or no name', async () => {
    const good = await page();
    assert.match(problems(good, /(<ul class="rf-hub-tile__types"[^>]*>)[\s\S]*?(<\/ul>)/, '$1$2'), /tile 1 \(Trout Flies\) has a Fly Type list with no links/);
    assert.match(problems(good, /class="rf-hub-tile__type" href="[^"]*"/, 'class="rf-hub-tile__type"'), /tile 1 \(Trout Flies\): a Fly Type link has no href/);
});

test('fails the "no products" message, the marker in the page, or a robots noindex', async () => {
    const good = await page();
    assert.match(problems(good, '<main class="rf-hub" data-rf-hub>', '<main class="rf-hub" data-rf-hub><p role="alert" data-no-products-notification>There are no products listed under this category.</p>'), /a "no products" message/);
    assert.match(problems(good, '<main class="rf-hub" data-rf-hub>', '<main class="rf-hub" data-rf-hub><p class="rf-listing-empty">None</p>'), /a "no products" message/);
    assert.match(problems(good, '</h1>', '</h1><!--more-->'), /the description's <!--more--> marker is in the page/);
    assert.match(problems(good, CANONICAL, `${CANONICAL}<meta name="robots" content="noindex, follow">`), /a robots meta says noindex: the hub is indexed \(refactor 11\)/);
});

test('fails a canonical to another page', async () => {
    assert.match(speciesHub.check(await page({ head: '<link rel="canonical" href="https://reelflies.ca/flies/">' })).join('\n'), /the canonical points at \/flies\/, not the page's own path \/species\//);
});

test('fails a grid before the tiles, more than 24 cards, an eager or high-priority card photo, or no pager when the count runs past the page', async () => {
    const good = await page();
    const products = Array.from({ length: 25 }, (_, index) => ({ ...CONTEXT.category.products[index % 6], id: 9000 + index }));
    assert.match(speciesHub.check(await page({ category: { products } })).join('\n'), /the grid has 25 cards: 24 a page/);
    assert.match(problems(good, /(<img class="card-image rf-card-image"[^>]*?) loading="lazy"/, '$1'), /card 1's photo isn't lazy/);
    assert.match(problems(good, /<nav class="pagination"[\s\S]*?<\/nav>/, ''), /the grid lists 6 of 1904 patterns with no numbered pager/);
    const tilesStart = good.html.indexOf('<ul class="rf-hub-tiles"');
    const gridHtml = good.html.slice(good.html.indexOf('<section class="rf-hub-products"'), good.html.indexOf('</section>') + '</section>'.length);
    const moved = good.html.replace(gridHtml, '').replace('<ul class="rf-hub-tiles"', `${gridHtml}<ul class="rf-hub-tiles"`);
    assert.ok(tilesStart > 0);
    assert.match(speciesHub.check({ ...good, html: moved }).join('\n'), /the grid comes before the tiles/);
});
