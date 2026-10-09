// The Species hub (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70 and 72):
// pages/custom/category/species-hub.html, the custom category template of the Species root
// (/species/, "Flies by Species"), with one tile per Species page (components/reelflies/
// category-tile.html). The page is tree-4-shaped: the fixture page's own data
// (render/pages/species-hub/fixtures/tree-4.json), with tree 4's categories and menu ids.
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
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.hub;
const TEMPLATE = 'pages/custom/category/species-hub';
const SPECIES = CONTEXT.category.subcategories;
const TYPES = Object.fromEntries(CONTEXT.categories.find(top => String(top.id) === '520').children.map(species => [species.id, species.children]));

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
const tiles = html => elementsHtml(html, 'li', hasClass('rf-hub-tile'));
const tilePhoto = tile => findTags(tile, 'img')[0];
const tileName = tile => outerHtml(tile, 'h2');
const typeLinks = tile => findTags(outerHtml(tile, 'ul', hasClass('rf-hub-tile__types')) || '', 'a');
const grid = html => outerHtml(html, 'section', attrs => 'data-rf-hub-products' in attrs);
const cardPhotos = html => elementsHtml(grid(html) || '', 'article', hasClass('card')).map(card => findTags(card, 'img')[0]);
const highPriority = html => findTags(markupOnly(html), 'img').filter(img => img.attrs.fetchpriority === 'high');
const header = html => outerHtml(html, 'div', hasClass('rf-listing-header'));
const intro = html => outerHtml(header(html) || '', 'div', hasClass('rf-listing-intro'));
const rest = html => outerHtml(html, 'div', attrs => 'data-rf-description' in attrs);
const position = (html, needle) => html.indexOf(needle);

describe('the page (spec module 10)', () => {
    it('has one <h1>, "Fly Fishing Flies by Species", in the plain listing header, and no banner', async () => {
        const html = await render();
        assert.equal(LANG.heading, 'Fly Fishing Flies by Species');
        assert.equal(findTags(html, 'h1').length, 1);
        assert.equal(textOf(outerHtml(header(html), 'h1')), LANG.heading);
        assert.match(header(html), /rf-listing-header--plain/);
        assert.equal(findTags(header(html), 'img').length, 0, 'no banner: the Species root gets the plain header (O10)');
    });

    it('has one <main>, holding the header, the tiles and the grid; the breadcrumbs come before it', async () => {
        const html = await render();
        assert.equal(findTags(html, 'main').length, 1);
        const inMain = main(html);
        for (const needle of ['rf-listing-header', 'data-rf-hub-tiles', 'data-rf-hub-products', 'data-rf-description']) assert.ok(inMain.includes(needle), needle);
        assert.ok(position(html, 'class="breadcrumbs"') < position(html, '<main'), 'the breadcrumbs before <main>');
        assert.equal(findTags(html, 'nav').filter(nav => nav.attrs['aria-label'] === 'Breadcrumb').length, 1);
    });

    it('puts the root\'s description before <!--more--> under the H1, and the rest after the grid; the marker is never printed', async () => {
        const html = await render();
        assert.match(textOf(intro(html)), /^Choose the fish you're after/);
        assert.doesNotMatch(intro(html), /Flies for every fish/);
        assert.match(textOf(rest(html)), /^Flies for every fish we tie for/);
        assert.ok(position(html, 'data-rf-description') > position(html, 'data-rf-hub-products'), 'the rest after the grid');
        assert.equal(html.includes('<!--more-->'), false);
    });

    it('takes an unmarked description whole as the intro, with nothing after the grid (the root\'s copy is its intro)', async () => {
        const html = await render({ category: { description: '<p>Choose the fish you\'re after.</p><p>Then narrow by fly type.</p>' } });
        assert.equal(textOf(intro(html)), 'Choose the fish you\'re after. Then narrow by fly type.');
        assert.equal(rest(html), null);
    });

    it('splits a marker the editor saved in its own paragraph, and prints no intro for an empty description', async () => {
        const marked = await render({ category: { description: '<p>Choose the fish.</p><p><!--more--></p><p>The rest.</p>' } });
        assert.equal(textOf(intro(marked)), 'Choose the fish.');
        assert.equal(textOf(rest(marked)), 'The rest.');
        assert.deepEqual(unbalancedTags(marked), []);
        const empty = await render({ category: { description: '' } });
        assert.equal(intro(empty), null);
        assert.equal(rest(empty), null);
        assert.equal(findTags(empty, 'h1').length, 1);
    });

    it('adds no robots meta (the hub is indexed: refactor 11) and keeps the stock rel next link', async () => {
        const html = await render();
        assert.equal(findTags(html, 'meta').filter(meta => (meta.attrs.name || '').toLowerCase() === 'robots').length, 0);
        assert.deepEqual(findTags(html, 'link').filter(link => link.attrs.rel === 'next').map(link => link.attrs.href), ['?page=2']);
    });

    it('keeps the stock category template\'s front matter, inject and head block, so it lists 24 a page (UX-7)', () => {
        const read = name => fs.readFileSync(path.join(THEME_DIR, 'templates', `${name}.html`), 'utf8');
        const parts = source => ({
            front: source.match(/^---\n[\s\S]*?\n---\n/)[0],
            inject: source.match(/\{\{inject "categoryProductsPerPage"[^}]*\}\}/)[0],
            head: source.match(/\{\{#partial "head"\}\}[\s\S]*?\{\{\/partial\}\}/)[0],
        });
        assert.deepEqual(parts(read(TEMPLATE)), parts(read('pages/category')));
        assert.match(parts(read(TEMPLATE)).front, /limit: \{\{theme_settings\.categorypage_products_per_page\}\}/);
    });

    it('renders balanced markup', async () => {
        assert.deepEqual(unbalancedTags(await render()), []);
    });
});

describe('the tiles (category-tile.html; stories 13 and 14)', () => {
    it('renders one tile per Species page, in the store\'s order, each named by an <h2> link to its page', async () => {
        const html = await render();
        const list = findTags(html, 'ul').find(tag => 'data-rf-hub-tiles' in tag.attrs);
        assert.equal(list.attrs['aria-label'], LANG.tiles);
        const found = tiles(html);
        assert.equal(found.length, 11);
        assert.deepEqual(found.map(tile => textOf(tileName(tile))), SPECIES.map(species => species.name));
        assert.deepEqual(found.map(tile => findTags(tileName(tile), 'a')[0].attrs.href), SPECIES.map(species => species.url));
    });

    it('gives each tile its photo as a second link to the page, hidden from screen readers and the tab order', async () => {
        for (const [index, tile] of tiles(await render()).entries()) {
            const media = findTags(tile, 'a')[0];
            assert.equal(media.attrs.href, SPECIES[index].url);
            assert.equal(media.attrs['aria-hidden'], 'true');
            assert.equal(media.attrs.tabindex, '-1');
            const img = tilePhoto(tile);
            assert.equal(img.attrs.alt, '', 'the name beside it names the page');
            assert.equal(img.attrs.width, '600');
            assert.equal(img.attrs.height, '400', 'the reference\'s 3:2 box');
            assert.ok(img.attrs.sizes, 'sizes');
            assert.ok(img.attrs.srcset, 'srcset');
        }
    });

    it('takes the Species page\'s own image, at 160w to 960w', async () => {
        const img = tilePhoto(tiles(await render())[0]);
        assert.match(img.attrs.src, /\/stencil\/480w\/j\/searching-nymphs__22204\.original\.jpg/);
        assert.deepEqual(img.attrs.srcset.split(',').map(candidate => candidate.trim().split(/\s+/)[1]), ['160w', '320w', '480w', '640w', '960w']);
    });

    it('shows the theme\'s default image for a Species with none, never a broken <img>', async () => {
        const panfish = tiles(await render())[5];
        assert.equal(textOf(tileName(panfish)), 'Panfish Flies');
        const img = tilePhoto(panfish);
        assert.match(img.attrs.src, /img\/reelflies\/default-product\.png/);
        assert.match(img.attrs.srcset, /default-product\.png 500w$/);
        assert.match(img.attrs.class, /rf-hub-tile__img--default/);
    });

    it('loads the first two photos eagerly, the first with fetchpriority="high", and every later one lazily (O23; story 70)', async () => {
        const photos = tiles(await render()).map(tilePhoto);
        assert.deepEqual(photos.map(img => img.attrs.loading ?? 'eager'), ['eager', 'eager', ...Array(9).fill('lazy')]);
        assert.deepEqual(photos.map(img => img.attrs.fetchpriority ?? null), ['high', ...Array(10).fill(null)]);
    });

    it('gives a default image the same loading rules: the first tile\'s is still the page\'s high-priority image', async () => {
        const [first, second, third] = SPECIES;
        const html = await render({ category: { subcategories: [{ ...first, image: null }, { ...second, image: undefined }, third] } });
        const photos = tiles(html).map(tilePhoto);
        assert.match(photos[0].attrs.src, /default-product\.png/);
        assert.equal(photos[0].attrs.fetchpriority, 'high');
        assert.equal(photos[1].attrs.loading, undefined);
        assert.equal(photos[2].attrs.loading, 'lazy');
    });

    it('leaves the first tile\'s photo the page\'s only high-priority image: the grid\'s cards give it up', async () => {
        const html = await render();
        assert.equal(highPriority(html).length, 1);
        assert.equal(highPriority(html)[0].raw, tilePhoto(tiles(html)[0]).raw);
    });

    it('counts each Species page\'s products as patterns, and shows no count of 0 or none', async () => {
        const counts = tiles(await render()).map(tile => textOf(outerHtml(tile, 'p', hasClass('rf-hub-tile__count')) || ''));
        assert.deepEqual(counts.slice(0, 2), ['1600 patterns', '737 patterns']);
        const [first, second, third] = SPECIES;
        const html = await render({ category: { subcategories: [{ ...first, product_count: 1 }, { ...second, product_count: 0 }, { ...third, product_count: undefined }] } });
        assert.deepEqual(tiles(html).map(tile => textOf(outerHtml(tile, 'p', hasClass('rf-hub-tile__count')) || '')), ['1 pattern', '', '']);
    });

    it('gives each tile its description\'s part before <!--more-->, a marker in its own paragraph too, and none without a marker', async () => {
        const found = tiles(await render());
        const intros = found.map(tile => textOf(outerHtml(tile, 'div', hasClass('rf-listing-intro')) || ''));
        assert.equal(intros[0], 'Dry flies, nymphs, streamers and egg flies for rivers, lakes and spring creeks.');
        assert.equal(intros[1], 'Nymphs, egg flies and swing flies for Great Lakes and BC steelhead.', 'Steelhead\'s marker is in its own paragraph');
        assert.equal(intros[10], '', 'Barracuda\'s description has no marker');
        for (const tile of found) {
            assert.doesNotMatch(tile, /Every [a-z, &]+ pattern we tie/, 'nothing after the marker');
            assert.deepEqual(unbalancedTags(tile), []);
        }
    });
});

describe('the Fly Type links under each tile (stories 14 and 72; decision 3)', () => {
    it('lists each Species page\'s children from the categories data as <a href> links, in order, named for the Species', async () => {
        const found = tiles(await render());
        SPECIES.forEach((species, index) => {
            const expected = TYPES[species.id];
            const links = typeLinks(found[index]);
            assert.deepEqual(links.map(link => link.attrs.href), expected.map(type => type.url), species.name);
            if (expected.length) {
                const list = findTags(found[index], 'ul').find(tag => hasClass('rf-hub-tile__types')(tag.attrs));
                assert.equal(list.attrs['aria-label'], LANG.types.replace('{name}', species.name).replace('&', '&amp;'));
            }
        });
        assert.deepEqual(typeLinks(found[0]).map(link => textOf(elementsHtml(found[0], 'a', attrs => attrs.href === link.attrs.href)[0])), ['Dry Flies for Trout', 'Nymphs for Trout', 'Trout Streamers', 'Egg Flies for Trout']);
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

describe('the grid after the tiles (probe 8 passed: the root rolls up its products)', () => {
    it('follows the tiles, under its own <h2> and count, with ticket 31\'s cards and the stock numbered pager', async () => {
        const html = await render();
        const section = grid(html);
        assert.ok(section, 'a grid');
        assert.ok(position(html, 'data-rf-hub-products') > position(html, 'data-rf-hub-tiles'));
        assert.equal(textOf(outerHtml(section, 'h2')), LANG.products);
        assert.equal(textOf(outerHtml(section, 'p', hasClass('rf-hub-products__count'))), '1904 patterns');
        assert.equal(cardPhotos(html).length, CONTEXT.category.products.length);
        assert.equal(elementsHtml(section, 'article', hasClass('rf-card')).length, CONTEXT.category.products.length, 'ticket 31\'s card');
        const pager = outerHtml(section, 'nav', hasClass('pagination'));
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
            assert.match(img.attrs.sizes, /^\(min-width: 801px\) 346px, calc\(50vw - 24px\)$/, 'a full-width grid\'s sizes: no facet sidebar');
        }
    });

    it('has no sort bar, Filter or facet sidebar, and isn\'t #product-listing-container, which stock faceted search would swap', async () => {
        const html = await render();
        assert.equal(findTags(html).filter(tag => tag.attrs.id === 'product-listing-container' || tag.attrs.id === 'faceted-search-container').length, 0);
        assert.equal(html.includes('data-sort-by'), false);
        assert.equal(html.includes('data-rf-filter-button'), false);
    });

    it('with no products, prints no grid, heading or pager, and no "no products" message (R8; ticket 33\'s listing-empty)', async () => {
        const html = await render({ category: { products: [], total_products: 0 } });
        assert.equal(grid(html), null);
        assert.equal(findTags(html, 'nav').filter(nav => hasClass('pagination')(nav.attrs)).length, 0);
        assert.equal(html.includes('data-no-products-notification'), false);
        assert.equal(html.includes('rf-listing-empty'), false);
        assert.equal(tiles(html).length, 11, 'the tiles stay');
        assert.deepEqual(unbalancedTags(html), []);
    });
});
