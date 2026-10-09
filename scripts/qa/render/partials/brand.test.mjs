// The ReelFlies brand listing (ticket 36; spec module 12; O10, O20, UX-7; stories 17, 23, 25, 26,
// 68, 70 and 72): pages/brand.html's page block is components/reelflies/brand-page.html, and
// stock brand/product-listing.html's listing is components/reelflies/brand-listing.html, which
// stock brand.js's faceted search also renders alone after a filter or a sort. Rendered on the
// brand fixture page's contexts (render/pages/brand-page/fixtures/), which are channel 1's brand
// context as ?debug=context shaped it on 2026-10-09: the brand's image, its facets and a numbered
// pagination window, and no total (BigCommerce gives a brand page none).
//
//   node --test scripts/qa/render/partials/brand.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const FIXTURES = path.join(THEME_DIR, 'scripts/qa/render/pages/brand-page/fixtures');
const fixture = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')).page_context;
const BANNER = fixture('banner');
const EMPTY = fixture('empty');

// The brand page: `brand` lays fields over the banner case's brand.
const page = (brand = {}, { context = BANNER, regions } = {}) => renderPartial('pages/brand', {
    ...context, brand: { ...context.brand, ...brand }, settings: {},
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
const header = html => outerHtml(html, 'div', hasClass('rf-listing-header'));
const banner = html => findTags(html, 'img').find(img => hasClass('rf-listing-banner')(img.attrs));
const cardImages = html => elementsHtml(html, 'article', hasClass('card')).map(card => findTags(card, 'img')[0]);
const row = html => outerHtml(html, 'div', hasClass('rf-list-top'));
const count = html => textOf(outerHtml(html, 'p', attrs => 'data-rf-list-count' in attrs));
const chosenSort = html => findTags(row(html), 'option').filter(tag => 'selected' in tag.attrs).map(tag => tag.attrs.value);
const SIDEBAR_SIZES = /^\(min-width: 1136px\) 258px, \(min-width: 801px\) calc\(23\.8vw - 13px\), calc\(50vw - 24px\)$/;

describe('the page (components/reelflies/brand-page.html)', () => {
    it('gives a brand with an image the banner: eager, fetchpriority="high", alt="", with the brand\'s name as the page\'s one H1 (O10; story 70)', async () => {
        const html = await page();
        const img = banner(header(html));
        assert.ok(img, 'the banner is in the listing header');
        assert.equal(img.attrs.loading, undefined, 'eager');
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.equal(img.attrs.alt, '');
        assert.match(img.attrs.srcset, /boxes-assortments-for-website_1662739586__80374\.original\.jpg 1600w$/);
        assert.deepEqual(findTags(html, 'h1').length, 1);
        assert.equal(textOf(outerHtml(header(html), 'h1', () => true)), 'ReelFlies');
        assert.deepEqual(findTags(html, 'img').filter(tag => tag.attrs.fetchpriority === 'high').map(tag => tag.attrs.class), ['rf-listing-banner'], 'the banner holds the one fetchpriority');
    });

    it('gives a brand with no image the plain header, the H1 alone, and the first card the page\'s fetchpriority (ticket 31; story 70)', async () => {
        const html = await page({ image: null });
        assert.equal(banner(html), undefined);
        assert.match(header(html), /rf-listing-header--plain/);
        assert.equal(textOf(header(html)), 'ReelFlies');
        const high = findTags(html, 'img').filter(tag => tag.attrs.fetchpriority === 'high');
        assert.equal(high.length, 1);
        assert.equal(high[0].raw, cardImages(html)[0].raw);
    });

    it('replaces stock\'s heading and its 100px image: no .brand-image-container and no H1 outside the listing header', async () => {
        const html = await page();
        assert.equal(findTags(html, 'div').filter(tag => hasClass('brand-image-container')(tag.attrs)).length, 0);
        assert.equal(findTags(header(html), 'h1').length, 1);
    });

    it('keeps the brand_below_header region right after the header, where the intro widget goes, and brand_below_content after the listing', async () => {
        const html = await page({}, { regions: { brand_below_header: '<p data-rf-test-intro>Intro</p>', brand_below_content: '<p data-rf-test-below>Below</p>' } });
        const after = html.slice(html.indexOf(header(html)) + header(html).length);
        assert.match(after, /^\s*<div data-content-region="brand_below_header"><p data-rf-test-intro>Intro<\/p><\/div>\s*<div class="page rf-listing-page rf-brand-listing">/);
        const main = outerHtml(html, 'main', () => true);
        assert.ok(main.indexOf('data-rf-test-below') > main.indexOf('productGrid'), 'below the grid, inside <main>');
    });

    it('keeps stock\'s one <main>, the listing\'s, beside the facet sidebar, in the page ticket 33\'s phone rules key on', async () => {
        const html = await page();
        const mains = findTags(html, 'main');
        assert.equal(mains.length, 1);
        assert.equal(mains[0].attrs.id, 'product-listing-container');
        assert.equal(mains[0].attrs.class, 'page-content');
        const [pageDiv] = findTags(html, 'div').filter(tag => hasClass('page')(tag.attrs));
        assert.equal(pageDiv.attrs.class, 'page rf-listing-page rf-brand-listing');
        assert.equal(findTags(html, 'aside')[0].attrs.id, 'faceted-search-container');
    });

    it('shows the Fly Sizes facet as ticket 33\'s pills, with BigCommerce\'s own anchors and "What do sizes mean?" (stories 23 and 24)', async () => {
        const html = await page();
        const sidebar = outerHtml(html, 'aside', () => true);
        const pills = findTags(sidebar, 'a').filter(tag => hasClass('rf-size-pill')(tag.attrs));
        assert.equal(pills.length, BANNER.brand.facets[0].items.length);
        for (const pill of pills) {
            assert.match(decodeHtml(pill.attrs.href), /^https:\/\/reelflies\.ca\/reelflies-2\/\?_bc_fsnf=1&Fly\+Sizes=/);
            assert.equal(pill.attrs.rel, 'nofollow');
        }
        assert.equal(findTags(sidebar, 'a').filter(tag => tag.attrs.href === '/fly-hook-size-chart/').length, 1);
    });

    it('prints stock\'s search error in place of the listing', async () => {
        const html = await page({ search_error: true });
        assert.match(textOf(outerHtml(html, 'main', () => true)), /^There was a problem retrieving your results/);
        assert.equal(cardImages(html).length, 0);
    });

    it('balances, with products, without an image, and with none', async () => {
        for (const [name, html] of [['banner', await page()], ['plain', await page({ image: null })], ['empty', await page({}, { context: EMPTY })], ['no products', await page({ products: [] })]]) {
            assert.deepEqual(unbalancedTags(html), [], name);
        }
    });
});

describe('the listing (components/reelflies/brand-listing.html)', () => {
    for (const [name, render] of [['on the page', () => page()], ['after a filter or sort refresh', () => refresh()]]) {
        it(`puts ticket 33's row above the grid, with the brand's own sort chosen, ${name}`, async () => {
            const html = await render();
            assert.ok(row(html), 'the row');
            assert.deepEqual(chosenSort(html), ['featured']);
            assert.equal(findTags(row(html), 'button').filter(tag => 'data-rf-filter-button' in tag.attrs).length, 1, 'Filter, with a facet visible');
            assert.ok(html.indexOf('rf-list-top') < html.indexOf('productGrid'));
        });

        it(`lists the brand's products as cards, the first three eager, sized for the column beside the sidebar, ${name}`, async () => {
            const imgs = cardImages(await render());
            assert.equal(imgs.length, BANNER.brand.products.length);
            imgs.forEach((img, index) => {
                assert.match(img.attrs.sizes, SIDEBAR_SIZES, `card ${index + 1}`);
                assert.equal(img.attrs.loading, index < 3 ? undefined : 'lazy', `card ${index + 1}`);
            });
        });

        it(`keeps the stock numbered pager of <a href> links (UX-7; story 26), ${name}`, async () => {
            const pager = outerHtml(await render(), 'nav', attrs => /pagination/.test(attrs.class || ''));
            const links = findTags(pager, 'a').map(link => decodeHtml(link.attrs.href));
            assert.deepEqual(links, [...BANNER.pagination.brand.links.map(link => link.url), BANNER.pagination.brand.next]);
        });
    }

    it('prints no count while there are products: BigCommerce gives a brand page no total, and a count of one page would be wrong', async () => {
        assert.equal(BANNER.brand.total_products, undefined, 'the fixture has no total, as channel 1\'s brand context');
        assert.equal(count(await page()), '');
        assert.equal(count(await refresh()), '');
    });

    it('prints the count if the context ever has a total, as a category\'s does', async () => {
        assert.equal(count(await page({ total_products: 2167 })), '2167 flies');
    });
});

describe('the empty states (ticket 33; O20; story 25)', () => {
    for (const [name, render] of [['on the page', () => page({}, { context: EMPTY })], ['after a filter refresh', () => refresh({}, EMPTY)]]) {
        it(`when filters match nothing: "No flies match these filters" and Clear filters to the context's clear-all URL, ${name}`, async () => {
            const html = await render();
            assert.equal(count(html), 'No flies match these filters');
            const link = elementsHtml(outerHtml(html, 'p', hasClass('rf-listing-empty')), 'a', () => true)[0];
            assert.equal(textOf(link), 'Clear filters');
            const [clear] = findTags(link, 'a');
            assert.equal(decodeHtml(clear.attrs.href), EMPTY.brand.selected.remove_all_url);
            assert.equal(clear.attrs.rel, 'nofollow');
            assert.ok('data-faceted-search-facet' in clear.attrs, 'stock refreshes the listing in place');
            assert.equal(findTags(html, 'p').filter(tag => 'data-no-products-notification' in tag.attrs).length, 0, 'nothing takes focus');
            assert.equal(cardImages(html).length, 0);
            assert.equal(outerHtml(html, 'nav', attrs => /pagination/.test(attrs.class || '')), null, 'no pager');
        });
    }

    it('a brand with no products and no filters: stock\'s message, with no alert and no row', async () => {
        for (const html of [await page({ products: [] }), await refresh({ products: [] })]) {
            assert.equal(textOf(outerHtml(html, 'p', hasClass('rf-listing-empty'))), 'There are no products listed under this brand.');
            assert.equal(row(html), null);
            assert.doesNotMatch(html, /role="alert"|data-no-products-notification/);
        }
    });

    it('keeps the facets beside the empty state, so a size can be unpicked', async () => {
        const sidebar = outerHtml(await page({}, { context: EMPTY }), 'aside', () => true);
        const current = findTags(sidebar, 'a').filter(tag => hasClass('rf-size-pill')(tag.attrs) && tag.attrs['aria-current'] === 'true');
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
    it('brand.html\'s page block is one include, and its front matter, inject and head block are stock\'s', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/brand.html'), 'utf8');
        const block = source.slice(source.indexOf('{{#partial "page"}}'), source.lastIndexOf('{{/partial}}'));
        assert.deepEqual(block.split('\n').filter(line => line.trim() && !/^\{\{!--.*--\}\}$/.test(line.trim())), ['{{#partial "page"}}', '{{> components/reelflies/brand-page}}']);
        assert.match(source, /<link rel="prev" href="\{\{\{pagination\.brand\.previous\}\}\}">/);
    });

    it('stock brand/product-listing.html keeps its first line and includes the ReelFlies listing', () => {
        const lines = fs.readFileSync(path.join(THEME_DIR, 'templates/components/brand/product-listing.html'), 'utf8').split('\n').filter(line => line.trim());
        assert.equal(lines[0], '{{inject \'noCompareMessage\' (lang \'compare.no_compare\')}}');
        assert.deepEqual(lines.slice(1).filter(line => !/^\{\{!--.*--\}\}$/.test(line.trim())), ['{{> components/reelflies/brand-listing}}']);
    });
});
