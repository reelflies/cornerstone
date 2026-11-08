// The ReelFlies brand listing (ticket 36; spec module 12; O10, O20, UX-7; stories 17, 23, 25, 26,
// 68, 70 and 72; redesign step 3): pages/brand.html's hero block is components/reelflies/
// brand-page.html, the category page's plain head (listing-head.html) and its listing, and stock
// brand/product-listing.html's hook puts the listing's row (listing-top.html) and empty states
// (listing-empty.html) round stock's grid and pager, which stock brand.js's faceted search also
// renders alone after a filter or a sort. Rendered on the brand fixture page's contexts
// (render/pages/brand-page/fixtures/), which are channel 1's brand context as ?debug=context
// shaped it on 2026-10-09: the brand's image, its facets and a numbered pagination window, and no
// total (BigCommerce gives a brand page none).
//
// Gone with master's brand-listing.html, and not tested: the brand's image as a banner (every
// brand gets the plain head, DESIGN.md; the first card holds the page's high priority) and the
// listing's own <main> (the page's one <main> is layout/base's, as on every page).
//
//   node --test scripts/qa/render/partials/brand.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const FIXTURES = path.join(THEME_DIR, 'scripts/qa/render/pages/brand-page/fixtures');
const fixture = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')).page_context;
const BANNER = fixture('banner');
const EMPTY = fixture('empty');
const SIZES = '(min-width: 1280px) 250px, (min-width: 1040px) 230px, (min-width: 640px) 31vw, 46vw';
// The banner case on page `n` of its pagination window, as the store sends a later page.
const onPage = n => ({
    ...BANNER,
    pagination: {
        brand: {
            ...BANNER.pagination.brand, current: n, previous: `/brands/ReelFlies.html?page=${n - 1}`, next: `/brands/ReelFlies.html?page=${n + 1}`,
        },
    },
});

// The brand page: `brand` lays fields over the banner case's brand.
const page = (brand = {}, { context = BANNER, regions, theme = {} } = {}) => renderPartial('pages/brand', {
    ...context, brand: { ...context.brand, ...brand }, settings: {}, theme_settings: { ...context.theme_settings, ...theme },
}, regions ? { regions } : {});
// What brand.js's faceted search puts in #product-listing-container: stock brand/product-listing,
// rendered as its own template, with the brand at @root.
const refresh = (brand = {}, context = BANNER) => renderPartial('components/brand/product-listing', {
    brand: { ...context.brand, ...brand },
    pagination: context.pagination,
    settings: {},
    theme_settings: { product_list_display_mode: 'grid' },
});

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const head = html => outerHtml(html, 'div', hasClass('rf-list-head'));
const cardImages = html => elementsHtml(html, 'article', hasClass('rf-fly__card')).map(card => findTags(card, 'img')[0]);
const row = html => outerHtml(html, 'div', hasClass('rf-list-top'));
const count = html => textOf(outerHtml(html, 'p', attrs => 'data-rf-list-count' in attrs));
const chosenSort = html => findTags(row(html), 'option').filter(tag => 'selected' in tag.attrs).map(tag => tag.attrs.value);
const sidebar = html => outerHtml(html, 'aside', attrs => attrs.id === 'faceted-search-container');
const pager = html => outerHtml(html, 'nav', hasClass('pagination'));

describe('the page (components/reelflies/brand-page.html)', () => {
    it('gives every brand the plain head, image or not, with the brand\'s name as the page\'s one H1 and the breadcrumbs (O10)', async () => {
        for (const [name, html] of [['with an image', await page()], ['without', await page({ image: null })]]) {
            assert.ok(head(html), `${name}: the head`);
            assert.match(findTags(head(html), 'div')[0].attrs.class, /(^|\s)rf-list-head--plain(\s|$)/, name);
            assert.equal(findTags(head(html), 'img').length, 0, `${name}: no banner`);
            assert.equal(findTags(html, 'h1').length, 1, name);
            assert.equal(textOf(outerHtml(head(html), 'h1')), 'ReelFlies', name);
            assert.equal(findTags(head(html), 'nav').filter(nav => nav.attrs['aria-label'] === 'Breadcrumb').length, 1, name);
            assert.equal(findTags(head(html), 'ul').length, 0, `${name}: a brand has no chips`);
        }
    });

    it('gives the first card the page\'s one fetchpriority="high" (ticket 31; story 70)', async () => {
        const html = await page();
        const high = findTags(html, 'img').filter(tag => tag.attrs.fetchpriority === 'high');
        assert.equal(high.length, 1);
        assert.equal(high[0].raw, cardImages(html)[0].raw);
    });

    it('replaces stock\'s heading and its 100px image: no .brand-image-container and no H1 outside the head', async () => {
        const html = await page();
        assert.equal(findTags(html, 'div').filter(tag => hasClass('brand-image-container')(tag.attrs)).length, 0);
        assert.doesNotMatch(html, /class="page-heading"/);
        assert.equal(findTags(head(html), 'h1').length, 1);
    });

    it('keeps the brand_below_header region right after the head, where the intro widget goes, and brand_below_content after the listing', async () => {
        const html = await page({}, { regions: { brand_below_header: '<p data-rf-test-intro>Intro</p>', brand_below_content: '<p data-rf-test-below>Below</p>' } });
        const markup = markupOnly(html);
        const after = markup.slice(markup.indexOf(head(html)) + head(html).length);
        assert.match(after, /^\s*<div data-content-region="brand_below_header"><p data-rf-test-intro>Intro<\/p><\/div>\s*<div class="rf-list rf-list--side">/);
        assert.ok(html.indexOf('data-rf-test-below') > html.indexOf('data-rf-grid'), 'brand_below_content after the listing');
        assert.doesNotMatch(outerHtml(html, 'div', attrs => attrs.id === 'product-listing-container'), /data-rf-test-below/, 'outside the container brand.js replaces');
    });

    it('is the one <main>\'s content, the facets in an <aside> beside the listing, which stock brand.js finds by their ids', async () => {
        const html = await page();
        assert.equal(findTags(html, 'main').length, 1);
        assert.ok(outerHtml(html, 'main').includes(head(html)), 'the head is in <main>');
        const [aside] = findTags(sidebar(html), 'aside');
        assert.match(aside.attrs.class, /(^|\s)rf-list__side(\s|$)/);
        assert.equal(findTags(html).find(tag => tag.attrs.id === 'product-listing-container').name, 'div');
        assert.match(findTags(html, 'div').find(tag => hasClass('rf-list')(tag.attrs)).attrs.class, /(^|\s)rf-list--side(\s|$)/);
    });

    it('shows the Fly Sizes facet as ticket 33\'s cells, with BigCommerce\'s own anchors and "What do sizes mean?" (stories 23 and 24)', async () => {
        const html = await page();
        const pills = findTags(sidebar(html), 'a').filter(tag => hasClass('rf-size-pill')(tag.attrs));
        assert.equal(pills.length, BANNER.brand.facets[0].items.length);
        for (const pill of pills) {
            assert.match(decodeHtml(pill.attrs.href), /^https:\/\/reelflies\.ca\/reelflies-2\/\?_bc_fsnf=1&Fly\+Sizes=/);
            assert.equal(pill.attrs.rel, 'nofollow');
        }
        assert.equal(findTags(sidebar(html), 'a').filter(tag => tag.attrs.href === '/fly-hook-size-chart/').length, 1);
    });

    it('prints stock\'s search error in place of the listing when the store sends it with no products, as stock\'s hook orders them', async () => {
        const html = await page({ search_error: true, products: [] });
        assert.match(textOf(outerHtml(html, 'div', attrs => attrs.id === 'product-listing-container')), /^There was a problem retrieving your results/);
        assert.equal(cardImages(html).length, 0);
    });

    it('balances, with products, without an image, and with none', async () => {
        for (const [name, html] of [['banner', await page()], ['plain', await page({ image: null })], ['empty', await page({}, { context: EMPTY })], ['no products', await page({ products: [] })]]) {
            assert.deepEqual(unbalancedTags(html), [], name);
        }
    });
});

describe('the listing (stock brand/product-listing.html\'s hook)', () => {
    for (const [name, render] of [['on the page', () => page()], ['after a filter or sort refresh', () => refresh()]]) {
        it(`puts ticket 33's row above the grid, with the brand's own sort chosen and Filter for phones, ${name}`, async () => {
            const html = await render();
            assert.ok(row(html), 'the row');
            assert.deepEqual(chosenSort(html), ['featured']);
            assert.equal(findTags(row(html), 'button').filter(tag => 'data-rf-filter-button' in tag.attrs).length, 1, 'Filter, with a facet visible');
            assert.ok(html.indexOf('rf-list-top') < html.indexOf('data-rf-grid'));
            assert.equal(textOf(outerHtml(row(html), 'h2')), 'Patterns', 'the Fly Sizes facet makes it a fly listing');
        });

        it(`lists the brand's products as specimen cards, the first three eager, at the grid's sizes, ${name}`, async () => {
            const imgs = cardImages(await render());
            assert.equal(imgs.length, BANNER.brand.products.length);
            imgs.forEach((img, index) => {
                assert.equal(img.attrs.sizes, SIZES, `card ${index + 1}`);
                assert.equal(img.attrs.loading, index < 3 ? undefined : 'lazy', `card ${index + 1}`);
            });
        });

        it(`keeps the stock numbered pager of <a href> links (UX-7; story 26), ${name}`, async () => {
            const links = findTags(pager(await render()), 'a').map(link => decodeHtml(link.attrs.href));
            assert.deepEqual(links, [...BANNER.pagination.brand.links.map(link => link.url), BANNER.pagination.brand.next]);
        });
    }

    it('names the page in the row while there are products, on the page and in the refresh: BigCommerce gives a brand page no total, and a count of one page would be wrong', async () => {
        assert.equal(BANNER.brand.total_products, undefined, 'the fixture has no total, as channel 1\'s brand context');
        assert.equal(count(await page()), 'Page 1');
        assert.equal(count(await refresh()), 'Page 1');
        assert.equal(count(await page({}, { context: onPage(2) })), 'Page 2');
        assert.equal(count(await refresh({}, onPage(2))), 'Page 2');
    });

    // size-filter.js focuses the count when the control the shopper used is gone (a page link,
    // Clear filters, an applied filter removed), and announces it after every other refresh, so
    // an empty count would be focused with nothing to read, and announce nothing (story 68).
    it('never leaves the count empty while there are products: on any page, with a size applied, after a sort, with filtering off', async () => {
        const sized = { selected: { items: [{ facet: 'Fly Sizes', title: '14', url: 'https://reelflies.ca/reelflies-2/?_bc_fsnf=1' }], remove_all_url: 'https://reelflies.ca/reelflies-2/?_bc_fsnf=1' } };
        const cases = [
            ['page 1', BANNER, {}], ['page 3', onPage(3), {}], ['a size applied', BANNER, sized], ['a size applied, page 2', onPage(2), sized],
            ['sorted by price', { ...BANNER, pagination: { brand: { ...BANNER.pagination.brand, sort: 'priceasc' } } }, {}],
            ['filtering off', BANNER, { faceted_search_enabled: false, facets: [] }], ['no image', BANNER, { image: null }],
        ];
        for (const [name, context, brand] of cases) {
            for (const [where, html] of [['the page', await page(brand, { context })], ['the refresh', await refresh(brand, context)]]) { // eslint-disable-line no-await-in-loop
                assert.ok(cardImages(html).length > 0, `${name}, ${where}: has products`);
                assert.match(count(html), /\S/, `${name}, ${where}: the count says something`);
            }
        }
    });

    it('prints the count in patterns if the context ever has a total, as a category\'s does', async () => {
        assert.equal(count(await page({ total_products: 2167 })), '2,167 patterns');
        assert.equal(count(await page({ total_products: 2167, facets: [] })), '2,167 products', 'with no size facet the brand\'s root isn\'t a fly root');
    });

    it('shows the Photos / Quick order switch with quick add on, drawn invisible until the script takes the mark off, and none with it off', async () => {
        const on = findTags(await page(), 'div').find(tag => 'data-rf-view' in tag.attrs);
        assert.ok(on, 'the switch');
        assert.ok('data-rf-view-pending' in on.attrs);
        assert.equal(findTags(await page({}, { theme: { rf_quick_add: false } }), 'div').filter(tag => 'data-rf-view' in tag.attrs).length, 0);
    });
});

describe('the empty states (ticket 33; O20; story 25)', () => {
    for (const [name, render] of [['on the page', () => page({}, { context: EMPTY })], ['after a filter refresh', () => refresh({}, EMPTY)]]) {
        it(`when filters match nothing: "No flies match these filters" and Clear filters to the context's clear-all URL, ${name}`, async () => {
            const html = await render();
            assert.equal(count(html), 'No flies match these filters');
            const empty = outerHtml(html, 'div', hasClass('rf-list-empty'));
            const [clear] = findTags(empty, 'a');
            assert.equal(textOf(empty), 'Clear filters');
            assert.equal(decodeHtml(clear.attrs.href), EMPTY.brand.selected.remove_all_url);
            assert.equal(clear.attrs.rel, 'nofollow');
            assert.ok('data-faceted-search-facet' in clear.attrs, 'stock refreshes the listing in place');
            assert.equal(findTags(html, 'p').filter(tag => 'data-no-products-notification' in tag.attrs).length, 0, 'nothing takes focus');
            assert.equal(cardImages(html).length, 0);
            assert.equal(pager(html), null, 'no pager');
            assert.doesNotMatch(row(html), /data-sort-by/, 'nothing to sort');
        });
    }

    it('a brand with no products and no filters: stock\'s message, with no alert and no row', async () => {
        for (const html of [await page({ products: [] }), await refresh({ products: [] })]) {
            assert.equal(textOf(outerHtml(html, 'div', hasClass('rf-list-empty'))), 'There are no products listed under this brand.');
            assert.equal(row(html), null);
            assert.doesNotMatch(html, /role="alert"|data-no-products-notification/);
        }
    });

    it('keeps the facets beside the empty state, so a size can be unpicked', async () => {
        const current = findTags(sidebar(await page({}, { context: EMPTY })), 'a').filter(tag => hasClass('rf-size-pill')(tag.attrs) && tag.attrs['aria-current'] === 'true');
        assert.deepEqual(current.map(tag => tag.attrs['aria-label']), ['Size 3/0']);
    });
});

describe('24 a page (UX-7; story 26)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));

    it('reads brandpage_products_per_page in brand.html\'s front matter, which config.json sets to 24 (ticket 32\'s setting)', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/brand.html'), 'utf8');
        assert.match(source, /^---\nbrand:\n {4}products:\n {8}limit: \{\{theme_settings\.brandpage_products_per_page\}\}\n---\n\{\{inject "brandProductsPerPage" theme_settings\.brandpage_products_per_page\}\}/);
        assert.equal(config.settings.brandpage_products_per_page, 24);
        for (const variation of config.variations) assert.equal(variation.settings.brandpage_products_per_page, undefined, `${variation.name} keeps the base's 24`);
    });
});

describe('the hooks stay small (ADR 0001; CUSTOMIZATIONS.md)', () => {
    const strip = source => source.split('\n').filter(line => line.trim() && !/^\{\{!--.*--\}\}$/.test(line.trim()));

    it('brand.html\'s hero block is one include, and its front matter, inject and head block are stock\'s', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/brand.html'), 'utf8');
        const block = source.slice(source.indexOf('{{#partial "hero"}}'), source.lastIndexOf('{{/partial}}'));
        assert.deepEqual(strip(block), ['{{#partial "hero"}}', '{{> components/reelflies/brand-page}}']);
        assert.match(source, /<link rel="prev" href="\{\{\{pagination\.brand\.previous\}\}\}">/);
        assert.doesNotMatch(source, /\{\{#partial "page"\}\}/, 'the whole page is the hero block, so its bands run full bleed');
    });

    it('stock brand/product-listing.html keeps its first line and stock\'s grid and pager, and includes the ReelFlies row and empty states', () => {
        const lines = strip(fs.readFileSync(path.join(THEME_DIR, 'templates/components/brand/product-listing.html'), 'utf8'));
        assert.equal(lines[0], '{{inject \'noCompareMessage\' (lang \'compare.no_compare\')}}');
        const includes = lines.join('\n').match(/\{\{> components\/[a-z/-]+/g).map(include => include.slice(4));
        assert.deepEqual(includes, ['components/reelflies/listing-top', 'components/products/grid', 'components/products/list', 'components/common/paginator', 'components/reelflies/listing-empty']);
    });
});
