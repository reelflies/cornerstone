// Tests the species-hub assertion (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70 and
// 72; redesign step 3) on the hub the template renders from tree-4-shaped data (the fixture page's
// own, render/pages/species-hub/fixtures/tree-4.json), and on hand-made breakages of it.
//
//   node --test scripts/qa/raw-html/assertions/species-hub.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import {
    elementsHtml, findTags, markupOnly, outerHtml,
} from '../html.mjs';
import speciesHub, { EAGER, STAND_IN } from './species-hub.mjs';

const FIXTURE = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/pages/species-hub/fixtures/tree-4.json'), 'utf8')).page_context;
// The hub as /species/ will be once its pin is checked on 1895766 (wave R2): every Species page's
// copy carries its <!--more--> marker (refactor 10) and has products placed (refactor 14). The
// fixture page leaves Barracuda's description unmarked, to show a tile with no intro.
const CONTEXT = {
    ...FIXTURE,
    category: {
        ...FIXTURE.category,
        subcategories: FIXTURE.category.subcategories.map(sub => (sub.description.includes('<!--more-->') ? sub : { ...sub, description: `${sub.description}<!--more-->` })),
    },
};
// The categories data cut to its first `levels` levels, as a Menu Display Depth of `levels` gives it.
const toDepth = (nodes, levels) => nodes.map(node => ({ ...node, children: levels > 1 ? toDepth(node.children || [], levels - 1) : [] }));
const CANONICAL = '<link rel="canonical" href="https://reelflies.ca/species/">';
const HUB_OPEN = '<div class="rf-hub">';

// The hub as the harness fetches it from /species/: the store puts the canonical in head.meta_tags.
// The page is kept as markup (comments out, scripts emptied), as the html helpers return it, so
// a tile or a card the helpers find can be replaced in it.
const page = async ({
    category = {}, categories = CONTEXT.categories, head = CANONICAL, pagePath = '/species/',
} = {}) => ({
    kind: 'species-hub',
    key: 'species-hub',
    path: pagePath,
    url: `http://localhost:3301${pagePath}`,
    status: 200,
    html: markupOnly(await renderPartial('pages/custom/category/species-hub', {
        ...CONTEXT,
        categories,
        category: { ...CONTEXT.category, ...category },
        head: { meta_tags: head },
        settings: {},
    })),
});
const problems = (good, from, to) => speciesHub.check({ ...good, html: good.html.replace(from, to) }).join('\n');
const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const tiles = html => elementsHtml(html, 'li', hasClass('rf-hub-tile'));
const tilePhoto = (html, index) => findTags(tiles(html)[index], 'img')[0].raw;
const cardPhoto = (html, index) => findTags(elementsHtml(outerHtml(html, 'div', attrs => 'data-rf-hub-products' in attrs), 'article', hasClass('rf-fly__card'))[index], 'img')[0].raw;
// The page with one tag changed: `change` takes the tag's markup and returns the new one.
const retag = (good, tag, change) => problems(good, tag, change(tag));

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
    assert.ok(good.html.includes('<main class="body"'), 'layout/base\'s main');
    assert.match(speciesHub.check({ ...good, html: good.html.replace('<main class="body"', '<div class="body"').replace('</main>', '</div>') }).join('\n'), /the H1 and the tiles aren't inside <main>/);
});

test('fails a tile with no name link, a photo link that a keyboard or a screen reader meets, or one to another page', async () => {
    const good = await page();
    const media = 'class="rf-hub-tile__media" href="https://reelflies.ca/species/trout-flies/" tabindex="-1" aria-hidden="true"';
    assert.ok(good.html.includes(media), 'the first tile\'s photo link');
    assert.match(problems(good, '<h2 class="rf-hub-tile__name"><a href="https://reelflies.ca/species/trout-flies/">', '<h2 class="rf-hub-tile__name"><a>'), /tile 1 \(Trout Flies\) has no name link with an href in an <h2>/);
    assert.match(problems(good, media, media.replace(' tabindex="-1"', '')), /tile 1 \(Trout Flies\): its photo's link isn't out of the tab order and hidden from screen readers/);
    assert.match(problems(good, media, media.replace('https://reelflies.ca/species/trout-flies/', '/elsewhere/')), /tile 1 \(Trout Flies\): its photo links to \/elsewhere\/, not its name's page/);
});

test('fails a tile photo with no srcset, sizes, width or height, or loaded through lazysizes', async () => {
    const good = await page();
    const img = tilePhoto(good.html, 0);
    assert.match(retag(good, img, tag => tag.replace(/ srcset="[^"]*"/, '')), /tile 1 \(Trout Flies\)'s photo has no srcset/);
    assert.match(retag(good, img, tag => tag.replace(/ sizes="[^"]*"/, '')), /tile 1 \(Trout Flies\)'s photo has no sizes/);
    assert.match(retag(good, img, tag => tag.replace(' width="640"', '')), /tile 1 \(Trout Flies\)'s photo has no width/);
    assert.match(retag(good, img, tag => tag.replace(' height="280"', '')), /tile 1 \(Trout Flies\)'s photo has no height/);
    assert.match(retag(good, img, tag => tag.replace('<img ', '<img class="lazyload" data-srcset="x" ')), /tile 1 \(Trout Flies\)'s photo loads through lazysizes/);
});

test('fails a hub whose first two tile photos aren\'t eager, a later one that isn\'t lazy, or a page with another high-priority image', async () => {
    const good = await page();
    const first = tilePhoto(good.html, 0);
    assert.match(retag(good, first, tag => tag.replace('<img ', '<img loading="lazy" ')), /tile 1 \(Trout Flies\)'s photo is lazy: the first 2 load eagerly/);
    assert.match(retag(good, first, tag => tag.replace(' fetchpriority="high"', '')), /tile 1 \(Trout Flies\)'s photo has no fetchpriority="high"/);
    const third = tilePhoto(good.html, 2);
    assert.ok(third.includes(' loading="lazy"'));
    assert.match(retag(good, third, tag => tag.replace(' loading="lazy"', '')), /tile 3 \(Atlantic Salmon Flies\)'s photo isn't lazy: only the first 2 load eagerly/);
    assert.match(problems(good, HUB_OPEN, `${HUB_OPEN}<img src="/x.jpg" fetchpriority="high" alt="">`), /2 images have fetchpriority="high": only the first tile's photo/);
    const card = cardPhoto(good.html, 0);
    const onCard = good.html.replace(first, first.replace(' fetchpriority="high"', '')).replace(card, card.replace(' decoding', ' fetchpriority="high" decoding'));
    assert.match(speciesHub.check({ ...good, html: onCard }).join('\n'), /the page's fetchpriority="high" is on .*, not the first tile's photo/);
});

test('fails a Fly Type list with no links, or a link with no href', async () => {
    const good = await page();
    assert.match(problems(good, /(<ul class="rf-hub-tile__types"[^>]*>)[\s\S]*?(<\/ul>)/, '$1$2'), /tile 1 \(Trout Flies\) has a Fly Type list with no links/);
    assert.ok(good.html.includes('<li><a href="/species/trout-flies/dry-flies/">'), 'the first Fly Type link');
    assert.match(problems(good, '<li><a href="/species/trout-flies/dry-flies/">', '<li><a>'), /tile 1 \(Trout Flies\): a Fly Type link has no href/);
});

test('fails the "no products" message, the marker in the page, or a robots noindex', async () => {
    const good = await page();
    assert.match(problems(good, HUB_OPEN, `${HUB_OPEN}<p role="alert" data-no-products-notification>There are no products listed under this category.</p>`), /a "no products" message/);
    assert.match(problems(good, HUB_OPEN, `${HUB_OPEN}<p class="rf-listing-empty">None</p>`), /a "no products" message/);
    assert.match(problems(good, '</h1>', '</h1><!--more-->'), /the description's <!--more--> marker is in the page/);
    assert.match(problems(good, CANONICAL, `${CANONICAL}<meta name="robots" content="noindex, follow">`), /a robots meta says noindex: the hub is indexed \(refactor 11\)/);
});

test('fails a canonical to another page', async () => {
    assert.match(speciesHub.check(await page({ head: '<link rel="canonical" href="https://reelflies.ca/flies/">' })).join('\n'), /the canonical points at \/flies\/, not the page's own path \/species\//);
});

// The module's grid checks read master's card (article.card) and the grid's total from
// data-rf-hub-count, the tiles' mark; the redesign's cards are article.rf-fly__card and its row
// counts in data-rf-list-count, so 25 cards, an eager card photo and a missing pager go
// unreported until the module reads them (card-images checks the card photos on the listing
// pins). Only the grid's place is checked here.
test('fails a grid before the tiles', async () => {
    const good = await page();
    const card = cardPhoto(good.html, 0);
    assert.ok(card.includes(' loading="lazy"'), 'the redesign\'s cards are lazy under the tiles');
    const tilesStart = good.html.indexOf('<ul class="rf-hub__tiles"');
    const gridHtml = outerHtml(good.html, 'div', attrs => 'data-rf-hub-products' in attrs);
    const moved = good.html.replace(gridHtml, '').replace('<ul class="rf-hub__tiles"', `${gridHtml}<ul class="rf-hub__tiles"`);
    assert.ok(tilesStart > 0);
    assert.match(speciesHub.check({ ...good, html: moved }).join('\n'), /the grid comes before the tiles/);
});

test('fails a hub on any pin but channel 1\'s stand-in with no root intro, a tile with no count or no intro, or no Fly Type links on any tile (criteria 1 and 2 on prelaunch)', async () => {
    assert.match(speciesHub.check(await page({ category: { description: '' } })).join('\n'), /the root has no intro under the H1 \(\.rf-listing-intro, the redesign's \.rf-list-head__intro\): its description is empty/);
    const uncounted = CONTEXT.category.subcategories.map((sub, index) => (index === 0 ? { ...sub, product_count: 0 } : sub));
    assert.match(speciesHub.check(await page({ category: { subcategories: uncounted } })).join('\n'), /tile 1 \(Trout Flies\) has no count: its Species page lists no products of its own/);
    assert.match(speciesHub.check(await page({ category: { subcategories: FIXTURE.category.subcategories } })).join('\n'), /tile 11 \(Barracuda Flies\) has no intro: its Species page's description has no <!--more--> marker/);
    assert.match(speciesHub.check(await page({ categories: toDepth(CONTEXT.categories, 2) })).join('\n'), /no tile lists its Species × Fly Type pages: the categories data stops at the Species pages \(Menu Display Depth below 3\?\)/);
});

test('passes channel 1\'s stand-in without them: tree 1\'s copy has no marker, and its Fly Type pages sit past Menu Display Depth 3', async () => {
    assert.equal(STAND_IN, '/flies/saltwater-warmwater-salmon/');
    const subcategories = FIXTURE.category.subcategories.map(sub => ({ ...sub, description: '', product_count: 0 }));
    const standIn = await page({
        category: { description: '', subcategories }, categories: toDepth(CONTEXT.categories, 2), head: `<link rel="canonical" href="https://reelflies.ca${STAND_IN}">`, pagePath: STAND_IN,
    });
    assert.deepEqual(speciesHub.check(standIn), []);
});
