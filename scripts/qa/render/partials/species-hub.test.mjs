// The Species hub (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70 and 72; redesign
// step 3, round 4): pages/custom/category/species-hub.html, the custom category template of the
// Species root (/species/, "Flies by Species"), renders category-page.html in its hub mode: the
// moss head (components/reelflies/hub-head.html: the breadcrumbs, the H1, the root's intro and a
// tile per Species page, hub-tiles.html and hub-tile.html, with its Fly Type links, hub-types.html),
// then every pattern under "All flies" (listing-body.html) while the root lists products, then
// the rest of the description. The page is tree-4-shaped: the fixture page's own data
// (render/pages/species-hub/fixtures/tree-4.json), with tree 4's categories and menu ids.
//
// Gone with master's category-tile.html, and not tested: the plain listing header round the hub
// (the moss field is the head), the 3:2 tile photo with the theme's default image (the store's
// 16:7 banner now, the stone where a Species has none), the unmarked description shown whole as
// the intro (no marker, no intro, as on every listing), and the grid without stock's container
// and sort (the hub's listing is a category's, so stock's facets and sort refresh it in place).
//
//   node --test scripts/qa/render/partials/species-hub.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const FIXTURE = JSON.parse(fs.readFileSync(path.join(HERE, '../pages/species-hub/fixtures/tree-4.json'), 'utf8'));
const CONTEXT = FIXTURE.page_context;
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies;
const TEMPLATE = 'pages/custom/category/species-hub';
const SPECIES = CONTEXT.category.subcategories;
const TYPES = Object.fromEntries(CONTEXT.categories.find(top => String(top.id) === '520').children.map(species => [species.id, species.children]));
// Tree 4's saltwater Species pages, as rf_species_salt_ids would name them.
const SALT = ['630', '633', '636', '639'];
const SIZES = '(min-width: 1280px) 250px, (min-width: 1040px) 230px, (min-width: 640px) 31vw, 46vw';

// The hub on tree 4's data: `category` lays fields over the root's, `categories` replaces the
// categories data, and `theme` lays settings over the fixture's.
const render = ({ category = {}, categories = CONTEXT.categories, theme = {} } = {}) => renderPartial(TEMPLATE, {
    ...CONTEXT,
    category: { ...CONTEXT.category, ...category },
    categories,
    settings: {},
    theme_settings: { ...CONTEXT.theme_settings, ...theme },
});

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const main = html => outerHtml(html, 'main');
const hub = html => outerHtml(html, 'div', hasClass('rf-hub'));
const tiles = html => elementsHtml(html, 'li', hasClass('rf-hub-tile'));
const tilePhoto = tile => findTags(tile, 'img')[0];
const tileName = (tile, level = 'h2') => outerHtml(tile, level, hasClass('rf-hub-tile__name'));
const tileCount = tile => textOf(outerHtml(tile, 'p', attrs => 'data-rf-hub-count' in attrs) || '');
const tileIntro = tile => textOf(outerHtml(tile, 'div', hasClass('rf-list-head__intro')) || '');
const typeLinks = tile => findTags(outerHtml(tile, 'ul', hasClass('rf-hub-tile__types')) || '', 'a');
const grid = html => outerHtml(html, 'div', attrs => 'data-rf-hub-products' in attrs);
const cardPhotos = html => elementsHtml(grid(html) || '', 'article', hasClass('rf-fly__card')).map(card => findTags(card, 'img')[0]);
const highPriority = html => findTags(markupOnly(html), 'img').filter(img => img.attrs.fetchpriority === 'high');
const intro = html => outerHtml(outerHtml(hub(html) || '', 'div', hasClass('rf-hub__lead')) || '', 'div', hasClass('rf-list-head__intro'));
const about = html => outerHtml(html, 'section', hasClass('rf-list-about'));
const rest = html => outerHtml(html, 'div', attrs => 'data-rf-description' in attrs);
const count = html => textOf(outerHtml(html, 'p', attrs => 'data-rf-list-count' in attrs) || '');
const position = (html, needle) => html.indexOf(needle);

describe('the page (spec module 10; DESIGN.md "Species Band (moss)")', () => {
    it('has one <h1>, "Fly Fishing Flies by Species", in the moss head, and no listing head or banner', async () => {
        const html = await render();
        assert.equal(LANG.hub.heading, 'Fly Fishing Flies by Species');
        assert.equal(findTags(html, 'h1').length, 1);
        assert.equal(textOf(outerHtml(hub(html), 'h1')), LANG.hub.heading);
        assert.equal(findTags(html, 'div').filter(tag => hasClass('rf-list-head')(tag.attrs)).length, 0, 'no listing head: the moss field is the head');
        assert.equal(findTags(html, 'div').filter(tag => hasClass('rf-list-head__photo')(tag.attrs)).length, 0, 'no banner (O10)');
    });

    it('has one <main>, holding the head, the tiles, the grid and the rest of the description, with the breadcrumbs first in the head', async () => {
        const html = await render();
        assert.equal(findTags(html, 'main').length, 1);
        const inMain = main(html);
        for (const needle of ['class="rf-hub"', 'data-rf-hub-tiles', 'data-rf-hub-products', 'data-rf-description']) assert.ok(inMain.includes(needle), needle);
        assert.equal(findTags(hub(html), 'nav').filter(nav => nav.attrs['aria-label'] === 'Breadcrumb').length, 1);
        assert.ok(position(hub(html), 'class="breadcrumbs"') < position(hub(html), '<h1'), 'the breadcrumbs before the H1');
        assert.equal(findTags(html, 'nav').filter(nav => nav.attrs['aria-label'] === 'Breadcrumb').length, 1);
    });

    it('puts the root\'s description before <!--more--> under the H1, and the rest after the grid under "About {name}"; the marker is never printed', async () => {
        const html = await render();
        assert.match(textOf(intro(html)), /^Choose the fish you're after/);
        assert.doesNotMatch(intro(html), /Flies for every fish/);
        assert.match(textOf(rest(html)), /^Flies for every fish we tie for/);
        assert.equal(textOf(outerHtml(about(html), 'h2')), 'About Flies by Species');
        assert.ok(position(html, 'data-rf-description') > position(html, 'data-rf-hub-products'), 'the rest after the grid');
        assert.equal(html.includes('<!--more-->'), false);
    });

    it('puts an unmarked description whole after the grid, with no intro under the H1 (the owner, 2026-11-07)', async () => {
        const html = await render({ category: { description: '<p>Choose the fish you\'re after.</p><p>Then narrow by fly type.</p>' } });
        assert.equal(intro(html), null);
        assert.equal(textOf(rest(html)), 'Choose the fish you\'re after. Then narrow by fly type.');
    });

    it('splits a marker the editor saved in its own paragraph, and prints neither part for an empty description', async () => {
        const marked = await render({ category: { description: '<p>Choose the fish.</p><p><!--more--></p><p>The rest.</p>' } });
        assert.equal(textOf(intro(marked)), 'Choose the fish.');
        assert.equal(textOf(rest(marked)), 'The rest.');
        assert.deepEqual(unbalancedTags(marked), []);
        const empty = await render({ category: { description: '' } });
        assert.equal(intro(empty), null);
        assert.equal(rest(empty), null);
        assert.equal(about(empty), null);
        assert.equal(findTags(empty, 'h1').length, 1);
    });

    it('adds no robots meta (the hub is indexed: refactor 11) and keeps the stock rel next link', async () => {
        const html = await render();
        assert.equal(findTags(html, 'meta').filter(meta => (meta.attrs.name || '').toLowerCase() === 'robots').length, 0);
        assert.deepEqual(findTags(html, 'link').filter(link => link.attrs.rel === 'next').map(link => link.attrs.href), ['?page=2']);
    });

    it('keeps the stock category template\'s front matter, inject and head block, so it lists 24 a page (UX-7), and renders the category page in hub mode', () => {
        const read = name => fs.readFileSync(path.join(THEME_DIR, 'templates', `${name}.html`), 'utf8');
        const parts = source => ({
            front: source.match(/^---\n[\s\S]*?\n---\n/)[0],
            inject: source.match(/\{\{inject "categoryProductsPerPage"[^}]*\}\}/)[0],
            head: source.match(/\{\{#partial "head"\}\}[\s\S]*?\{\{\/partial\}\}/)[0],
        });
        assert.deepEqual(parts(read(TEMPLATE)), parts(read('pages/category')));
        assert.match(parts(read(TEMPLATE)).front, /limit: \{\{theme_settings\.categorypage_products_per_page\}\}/);
        assert.match(read(TEMPLATE), /\{\{#partial "hero"\}\}\s*\{\{> components\/reelflies\/category-page rf_hub=1\}\}\s*\{\{\/partial\}\}/);
    });

    it('renders balanced markup', async () => {
        assert.deepEqual(unbalancedTags(await render()), []);
    });
});

describe('the tiles (hub-tiles.html, hub-tile.html; stories 13 and 14)', () => {
    it('renders one tile per Species page, in the store\'s order, each named by an <h2> link to its page, in one list named Species', async () => {
        const html = await render();
        const list = findTags(html, 'ul').filter(tag => 'data-rf-hub-tiles' in tag.attrs);
        assert.equal(list.length, 1);
        assert.equal(list[0].attrs['aria-label'], LANG.hub.tiles);
        const found = tiles(html);
        assert.equal(found.length, 11);
        assert.deepEqual(found.map(tile => textOf(tileName(tile))), SPECIES.map(species => species.name));
        assert.deepEqual(found.map(tile => findTags(tileName(tile), 'a')[0].attrs.href), SPECIES.map(species => species.url));
    });

    it('gives each tile its photo as a second link to the page, hidden from screen readers and the tab order, a 16:7 banner with srcset and sizes', async () => {
        for (const [index, tile] of tiles(await render()).entries()) {
            const media = findTags(tile, 'a')[0];
            assert.match(media.attrs.class, /(^|\s)rf-hub-tile__media(\s|$)/);
            assert.equal(media.attrs.href, SPECIES[index].url);
            assert.equal(media.attrs['aria-hidden'], 'true');
            assert.equal(media.attrs.tabindex, '-1');
            const img = tilePhoto(tile);
            assert.equal(img.attrs.alt, '', 'the name beside it names the page');
            assert.ok(img.attrs.sizes, 'sizes');
            assert.ok(img.attrs.srcset, 'srcset');
            assert.equal(Number(img.attrs.width) / Number(img.attrs.height), 16 / 7, 'the store\'s 16:7 banner');
            assert.equal(img.attrs.decoding, 'async');
        }
    });

    it('takes the Species page\'s own image, 640 by 280, at 320w to 960w', async () => {
        const img = tilePhoto(tiles(await render())[0]);
        assert.match(img.attrs.src, /\/stencil\/640w\/j\/searching-nymphs__22204\.original\.jpg/);
        assert.deepEqual(img.attrs.srcset.split(',').map(candidate => candidate.trim().split(/\s+/)[1]), ['320w', '480w', '640w', '960w']);
        assert.equal(img.attrs.width, '640');
        assert.equal(img.attrs.height, '280');
    });

    it('shows the stone, graded, for a Species with no image, never a broken <img>, so every tile keeps its shape', async () => {
        const panfish = tiles(await render())[5];
        assert.equal(textOf(tileName(panfish)), 'Panfish Flies');
        const img = tilePhoto(panfish);
        assert.match(img.attrs.src, /img\/reelflies\/stone\/hero-stone-1600\.jpg$/);
        assert.match(img.attrs.srcset, /hero-stone-1600\.jpg 1600w$/);
        assert.match(img.attrs.class, /(^|\s)rf-graded(\s|$)/);
        assert.equal(img.attrs.width, '1600');
        assert.equal(img.attrs.height, '700');
        assert.equal(img.attrs.sizes, tilePhoto(tiles(await render())[0]).attrs.sizes, 'the same sizes as a photo');
    });

    it('loads the first two photos eagerly, the first with fetchpriority="high", and every later one lazily (O23; story 70)', async () => {
        const photos = tiles(await render()).map(tilePhoto);
        assert.deepEqual(photos.map(img => img.attrs.loading ?? 'eager'), ['eager', 'eager', ...Array(9).fill('lazy')]);
        assert.deepEqual(photos.map(img => img.attrs.fetchpriority ?? null), ['high', ...Array(10).fill(null)]);
    });

    it('gives the stone the same loading rules: the first tile\'s is still the page\'s high-priority image', async () => {
        const [first, second, third] = SPECIES;
        const html = await render({ category: { subcategories: [{ ...first, image: null }, { ...second, image: undefined }, third] } });
        const photos = tiles(html).map(tilePhoto);
        assert.match(photos[0].attrs.src, /hero-stone-1600\.jpg/);
        assert.equal(photos[0].attrs.fetchpriority, 'high');
        assert.equal(photos[1].attrs.loading, undefined);
        assert.equal(photos[2].attrs.loading, 'lazy');
    });

    it('leaves the first tile\'s photo the page\'s only high-priority image: the grid\'s cards give it up (rf_cards_lazy)', async () => {
        const html = await render();
        assert.equal(highPriority(html).length, 1);
        assert.equal(highPriority(html)[0].raw, tilePhoto(tiles(html)[0]).raw);
    });

    it('counts each Species page\'s products as patterns while counts are on, thousands with a comma, and shows no count of 0 or none', async () => {
        const counts = tiles(await render()).map(tileCount);
        assert.deepEqual(counts.slice(0, 2), ['1,600 patterns', '737 patterns']);
        const [first, second, third] = SPECIES;
        const html = await render({ category: { subcategories: [{ ...first, product_count: 1 }, { ...second, product_count: 0 }, { ...third, product_count: undefined }] } });
        assert.deepEqual(tiles(html).map(tileCount), ['1 patterns', '', '']);
        assert.deepEqual(tiles(await render({ theme: { rf_counts: false } })).map(tileCount), Array(11).fill(''), 'counts off');
    });

    it('gives each tile its description\'s part before <!--more-->, a marker in its own paragraph too, and none without a marker', async () => {
        const found = tiles(await render());
        const intros = found.map(tileIntro);
        assert.equal(intros[0], 'Dry flies, nymphs, streamers and egg flies for rivers, lakes and spring creeks.');
        assert.equal(intros[1], 'Nymphs, egg flies and swing flies for Great Lakes and BC steelhead.', 'Steelhead\'s marker is in its own paragraph');
        assert.equal(intros[10], '', 'Barracuda\'s description has no marker');
        for (const tile of found) {
            assert.doesNotMatch(tile, /Every [a-z, &]+ pattern we tie/, 'nothing after the marker');
            assert.deepEqual(unbalancedTags(tile), []);
        }
    });

    it('falls into Freshwater and Saltwater, each under its own H2 with the names as H3s, when rf_species_salt_ids names the saltwater pages', async () => {
        const html = await render({ theme: { rf_species_salt_ids: SALT.join(',') } });
        const groups = elementsHtml(hub(html), 'section', hasClass('rf-hub__group'));
        assert.equal(groups.length, 2);
        assert.deepEqual(groups.map(group => textOf(outerHtml(group, 'h2'))), [LANG.species.fresh, LANG.species.salt]);
        assert.deepEqual(groups.map(group => findTags(group, 'ul').filter(tag => 'data-rf-hub-tiles' in tag.attrs).length), [1, 1]);
        const names = group => tiles(group).map(tile => textOf(tileName(tile, 'h3')));
        assert.deepEqual(names(groups[0]), SPECIES.filter(species => !SALT.includes(String(species.id))).map(species => species.name));
        assert.deepEqual(names(groups[1]), SPECIES.filter(species => SALT.includes(String(species.id))).map(species => species.name));
        assert.equal(tiles(html).length, 11, 'every Species once');
        assert.equal(findTags(hub(html), 'h2').filter(tag => hasClass('rf-hub-tile__name')(tag.attrs)).length, 0);
        const photos = tiles(html).map(tilePhoto);
        assert.deepEqual(photos.map(img => img.attrs.fetchpriority ?? null), ['high', ...Array(10).fill(null)], 'the first tile on the page is still the one');
        assert.deepEqual(photos.map(img => img.attrs.loading ?? 'eager').slice(0, 3), ['eager', 'eager', 'lazy']);
        assert.deepEqual(unbalancedTags(html), []);
    });
});

describe('the Fly Type links under each tile (hub-types.html; stories 14 and 72; decision 3)', () => {
    it('lists each Species page\'s children from the categories data as <a href> links, in order, named for the Species', async () => {
        const found = tiles(await render());
        SPECIES.forEach((species, index) => {
            const expected = TYPES[species.id];
            const links = typeLinks(found[index]);
            assert.deepEqual(links.map(link => link.attrs.href), expected.map(type => type.url), species.name);
            if (expected.length) {
                const list = findTags(found[index], 'ul').find(tag => hasClass('rf-hub-tile__types')(tag.attrs));
                assert.equal(list.attrs['aria-label'], LANG.hub.types.replace('{name}', species.name).replace('&', '&amp;'));
            }
        });
        assert.deepEqual(elementsHtml(outerHtml(found[0], 'ul', hasClass('rf-hub-tile__types')), 'a').map(textOf), ['Dry Flies for Trout', 'Nymphs for Trout', 'Trout Streamers', 'Egg Flies for Trout']);
    });

    it('prints no list for a Species with no Fly Type pages', async () => {
        const panfish = tiles(await render())[5];
        assert.equal(findTags(panfish, 'ul').length, 0);
    });

    it('finds the Species root one level down too, as the menu does', async () => {
        const root = CONTEXT.categories.find(top => String(top.id) === '520');
        const flies = {
            id: 900, name: 'Flies', url: '/flies/', children: [root],
        };
        const nested = [flies, ...CONTEXT.categories.filter(top => top !== root)];
        assert.deepEqual(typeLinks(tiles(await render({ categories: nested }))[0]).map(link => link.attrs.href), TYPES[609].map(type => type.url));
    });

    it('prints no lists when the categories data stops at the Species (a Menu Display Depth of 2), or doesn\'t hold the root', async () => {
        const shallow = CONTEXT.categories.map(top => (String(top.id) === '520' ? { ...top, children: top.children.map(species => ({ ...species, children: [] })) } : top));
        const withoutRoot = CONTEXT.categories.filter(top => String(top.id) !== '520');
        for (const categories of [shallow, withoutRoot]) {
            const html = await render({ categories }); // eslint-disable-line no-await-in-loop
            assert.equal(findTags(html, 'ul').filter(tag => hasClass('rf-hub-tile__types')(tag.attrs)).length, 0);
            assert.equal(tiles(html).length, 11, 'the tiles stay');
        }
    });
});

describe('the grid after the tiles (listing-body.html with rf_title; probe 8 passed: the root rolls up its products)', () => {
    it('follows the tiles as a titled listing, "All flies", with the row\'s count, the specimen cards and the stock numbered pager, in stock\'s refreshable container', async () => {
        const html = await render();
        const listing = grid(html);
        assert.ok(listing, 'a grid');
        assert.ok(position(html, 'data-rf-hub-products') > position(html, 'data-rf-hub-tiles'));
        assert.match(findTags(listing, 'div')[0].attrs.class, /(^|\s)rf-list--titled(\s|$)/);
        assert.equal(textOf(outerHtml(listing, 'h2', hasClass('rf-list__title'))), LANG.hub.products);
        assert.equal(count(listing), '1,904 products', 'no size facet and a root of its own: products');
        assert.equal(cardPhotos(html).length, CONTEXT.category.products.length);
        assert.equal(elementsHtml(listing, 'li', hasClass('rf-fly')).length, CONTEXT.category.products.length, 'ticket 31\'s card');
        assert.equal(findTags(listing).find(tag => tag.attrs.id === 'product-listing-container').name, 'div');
        const pager = outerHtml(listing, 'nav', hasClass('pagination'));
        assert.ok(pager, 'the numbered pager');
        assert.deepEqual(findTags(pager, 'a').map(link => decodeHtml(link.attrs.href || '')).filter(href => /page=\d/.test(href)).slice(0, 5), ['?page=1', '?page=2', '?page=3', '?page=4', '?page=5']);
    });

    it('lists 24 a page when the store sends 24', async () => {
        const products = Array.from({ length: 24 }, (_, index) => ({ ...CONTEXT.category.products[index % 6], id: 9000 + index }));
        assert.equal(cardPhotos(await render({ category: { products } })).length, 24);
    });

    it('loads every card photo lazily, with no fetchpriority: the tiles fill the first screen above it', async () => {
        for (const img of cardPhotos(await render())) {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
            assert.equal(img.attrs.sizes, SIZES);
        }
    });

    it('is a <div>, not a <section>, and shows the facets only when the root has one: with none, no Filter and no sidebar', async () => {
        const html = await render();
        assert.equal(findTags(html, 'section').filter(tag => 'data-rf-hub-products' in tag.attrs).length, 0);
        assert.equal(findTags(html, 'aside').filter(tag => tag.attrs.id === 'faceted-search-container').length, 0);
        assert.equal(html.includes('data-rf-filter-button'), false);
        assert.ok(html.includes('data-sort-by'), 'stock\'s sort stays');
    });

    it('with no products, prints no grid, title or pager, and no "no products" message (R8; ticket 33\'s listing-empty)', async () => {
        const html = await render({ category: { products: [], total_products: 0 } });
        assert.equal(grid(html), null);
        assert.equal(findTags(html, 'nav').filter(nav => hasClass('pagination')(nav.attrs)).length, 0);
        assert.equal(html.includes('data-no-products-notification'), false);
        assert.equal(html.includes('rf-list-empty'), false);
        assert.equal(html.includes(LANG.hub.products), false);
        assert.equal(tiles(html).length, 11, 'the tiles stay');
        assert.ok(about(html), 'the rest of the description still follows');
        assert.deepEqual(unbalancedTags(html), []);
    });
});
