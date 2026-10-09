// The Fly size filter's templates (ticket 33; spec modules 9 and 24; R2, O11, O20, SEO-6, SEO-12;
// stories 23, 24, 25 and 72): stock faceted-search/facets/multi.html's hook
// (components/reelflies/facet-sizes.html), show-more-facets.html's, and stock
// category/product-listing.html's (components/reelflies/listing-top.html and listing-empty.html),
// on facet contexts shaped as BigCommerce's (`category.facets`, `category.selected`); and the
// facet's name, which the templates, two scripts and the size-filter assertion share.
//
//   node --test scripts/qa/render/partials/size-filter.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { SIZE_FACET } from '../../raw-html/assertions/size-filter.mjs';

const href = query => `https://reelflies.ca/flies/dry-flies/?_bc_fsnf=1&${query}`;
const value = (title, { selected = false, count = 12 } = {}) => ({
    id: title, title, count, selected, url: href(`Fly+Sizes=${encodeURIComponent(title)}`),
});
const SIZES = ['14', '1', '2/0', '24'].map(title => value(title, { selected: title === '14' }));
const FLY_SIZES = {
    facet: 'Fly Sizes', title: 'Fly Sizes', partial: 'multi', visible: true, start_collapsed: false, show_product_counts: true, show_more_toggle: false, has_more_results: false, selected: true, remove_url: href(''), items: SIZES,
};
const BRAND = {
    ...FLY_SIZES, facet: 'Brand', title: 'Brand', selected: false, items: [{ ...value('ReelFlies'), url: href('Brand=ReelFlies') }],
};
const CATEGORY = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/pages/category-page/fixtures/fly-type.json'), 'utf8')).page_context;

const facet = context => renderPartial('components/faceted-search/facets/multi', context);
const listing = ({
    facets = [FLY_SIZES], products = CATEGORY.category.products, selected = { items: [], remove_all_url: '' }, enabled = true,
} = {}) => renderPartial('components/category/product-listing', {
    ...CATEGORY,
    category: {
        ...CATEGORY.category, faceted_search_enabled: enabled, facets, products, selected,
    },
});
const row = html => outerHtml(html, 'div', attrs => attrs.class === 'rf-list-top');
const chosenSort = html => findTags(row(html), 'option').filter(tag => 'selected' in tag.attrs).map(tag => tag.attrs.value);
const count = html => textOf(outerHtml(html, 'p', attrs => 'data-rf-list-count' in attrs));

describe('the Fly Sizes facet as pills (components/reelflies/facet-sizes.html)', () => {
    it('keeps BigCommerce\'s anchors untouched: the context\'s URL with _bc_fsnf=1, rel="nofollow", data-faceted-search-facet (SEO-6, SEO-12)', async () => {
        const anchors = findTags(await facet(FLY_SIZES), 'a').filter(tag => /rf-size-pill/.test(tag.attrs.class || ''));
        assert.deepEqual(anchors.map(tag => decodeHtml(tag.attrs.href)), SIZES.map(size => size.url));
        for (const tag of anchors) {
            assert.equal(tag.attrs.rel, 'nofollow');
            assert.ok('data-faceted-search-facet' in tag.attrs);
        }
    });

    it('shows each size alone, named "Size 14", with the selected one marked current, and no count or hook drawing', async () => {
        const html = await facet(FLY_SIZES);
        const pills = findTags(html, 'a').filter(tag => /rf-size-pill/.test(tag.attrs.class || ''));
        assert.deepEqual(pills.map(tag => tag.attrs['aria-label']), ['Size 14', 'Size 1', 'Size 2/0', 'Size 24']);
        assert.deepEqual(pills.map(tag => tag.attrs['aria-current'] ?? null), ['true', null, null, null]);
        const list = outerHtml(html, 'ul', attrs => attrs['data-facet'] === 'Fly Sizes');
        assert.deepEqual(elementsHtml(list, 'a', () => true).map(textOf), ['14', '1', '2/0', '24']);
        assert.equal(findTags(list, 'svg').length, 0);
    });

    it('keeps stock\'s ids and data attributes, which faceted-search.js finds the list by', async () => {
        const [list] = findTags(await facet(FLY_SIZES), 'ul');
        assert.equal(list.attrs.id, 'facetedSearch-navList--fly-sizes');
        assert.equal(list.attrs['data-facet'], 'Fly Sizes');
        assert.equal(list.attrs['data-has-more-results'], 'false');
        assert.match(await facet({ ...FLY_SIZES, show_more_toggle: true }), /href="#facetedSearch-navList--fly-sizes" role="button" class="toggleLink"/);
    });

    it('gives the items their own class, not navList-item, which stock\'s "Show more" search hides document-wide', async () => {
        const items = findTags(await facet(FLY_SIZES), 'li');
        assert.equal(items.length, SIZES.length);
        for (const item of items) assert.equal(item.attrs.class, 'rf-size-pills-item');
    });

    it('links "What do sizes mean?" to the hook size chart (story 24)', async () => {
        const help = outerHtml(await facet(FLY_SIZES), 'p', attrs => attrs.class === 'rf-size-help');
        assert.equal(findTags(help, 'a')[0].attrs.href, '/fly-hook-size-chart/');
        assert.equal(textOf(help), 'What do sizes mean?');
    });

    it('leaves every other facet stock: its checkboxes and counts', async () => {
        const html = await facet(BRAND);
        assert.match(html, /navList-action--checkbox/);
        assert.match(html, /<span>\(12\)<\/span>/);
        assert.doesNotMatch(html, /rf-size-pill|rf-size-help/);
    });

    it('renders nothing for a facet with no values, as stock', async () => {
        assert.equal((await facet({ ...FLY_SIZES, items: [] })).trim(), '');
    });
});

describe('the facet\'s name (components/reelflies/size-facet-name.html)', () => {
    it('is the same in the templates, facet-order.js, quick-add-route.js and the size-filter assertion', () => {
        const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
        const [, templates] = read('templates/components/reelflies/size-facet-name.html').match(/assignVar 'rf_size_facet' '([^']+)'/);
        const [, facetOrder] = read('assets/js/theme/reelflies/facet-order.js').match(/FLY_SIZE_FACET = '([^']+)'/);
        const [, quickAdd] = read('assets/js/theme/reelflies/quick-add-route.js').match(/SIZE_OPTION_NAMES = Object\.freeze\(\[([^\]]*)\]\)/);
        assert.equal(templates, 'Fly Sizes');
        assert.equal(facetOrder, templates);
        assert.equal(SIZE_FACET, templates);
        assert.ok(quickAdd.includes(`'${templates}'`), quickAdd);
    });

    it('decides the pills: a facet under another name stays stock', async () => {
        const html = await facet({ ...FLY_SIZES, facet: 'Hook Size', title: 'Hook Size' });
        assert.doesNotMatch(html, /rf-size-pill/);
        assert.match(html, /navList-action--checkbox/);
    });
});

describe('the "Show more" list (stock show-more-facets.html\'s hook)', () => {
    it('names its facet, as the sidebar\'s list does, so size-filter.js can order it', async () => {
        const html = await renderPartial('components/faceted-search/show-more-facets', { all_facets: 'Fly Sizes', facets: [FLY_SIZES] });
        const [list] = findTags(html, 'ul');
        assert.equal(list.attrs['data-facet'], 'Fly Sizes');
    });
});

describe('the row above the grid (components/reelflies/listing-top.html)', () => {
    it('counts flies where the listing has the Fly Sizes facet, else products, from category.total_products', async () => {
        assert.equal(count(await listing()), '48 flies');
        assert.equal(count(await listing({ facets: [BRAND] })), '48 products');
        // The live context has no pagination.category.total, nor do the fixtures: the count is the
        // category's own.
        assert.equal(CATEGORY.pagination.category.total, undefined);
        const seven = await renderPartial('components/category/product-listing', {
            ...CATEGORY,
            category: {
                ...CATEGORY.category, total_products: 7, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' },
            },
        });
        assert.equal(count(seven), '7 flies');
    });

    it('carries Filter, for phones, only when a facet shows, beside stock\'s sort bar', async () => {
        const [button] = findTags(row(await listing()), 'button');
        assert.equal(button.attrs['aria-controls'], 'facetedSearch-navList');
        assert.equal(button.attrs['aria-expanded'], 'false');
        assert.equal(textOf(outerHtml(row(await listing()), 'button', () => true)), 'Filter');
        assert.match(row(await listing()), /data-sort-by="product"/);
        assert.equal(findTags(row(await listing({ facets: [{ ...FLY_SIZES, visible: false }] })), 'button').length, 0);
        assert.equal(findTags(row(await listing({ enabled: false })), 'button').length, 0);
    });

    it('chooses the listing\'s sort, which the hook passes as rf_sort', async () => {
        const html = await renderPartial('components/category/product-listing', {
            ...CATEGORY,
            pagination: { category: { ...CATEGORY.pagination.category, sort: 'priceasc' } },
            category: { ...CATEGORY.category, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' } },
        });
        assert.deepEqual(chosenSort(html), ['priceasc']);
    });

    it('renders for another listing\'s context and sort, as ticket 36\'s brand listing will include it', async () => {
        const brand = {
            ...CATEGORY.category, name: 'ReelFlies', total_products: 9, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' },
        };
        const html = await renderPartial('components/reelflies/listing-top', { category: brand, rf_sort: 'alphaasc' });
        assert.equal(count(html), '9 flies');
        assert.deepEqual(chosenSort(html), ['alphaasc']);
    });
});

describe('the empty listing (components/reelflies/listing-empty.html; O20, story 25)', () => {
    const selected = { items: [{ facet: 'Fly Sizes', title: '32', url: href('') }], remove_all_url: href('') };

    it('when filters match nothing: "No flies match these filters" and Clear filters to the context\'s clear-all URL, with Filter still there', async () => {
        const html = await listing({ products: [], selected });
        assert.equal(count(html), 'No flies match these filters');
        const clear = findTags(outerHtml(html, 'p', attrs => attrs.class === 'rf-listing-empty'), 'a')[0];
        assert.equal(decodeHtml(clear.attrs.href), selected.remove_all_url);
        assert.equal(clear.attrs.rel, 'nofollow');
        assert.ok('data-faceted-search-facet' in clear.attrs, 'stock refreshes the listing in place');
        assert.equal(findTags(row(html), 'button').length, 1);
        assert.doesNotMatch(row(html), /data-sort-by/);
    });

    it('takes no focus: no alert and no data-no-products-notification for category.js to focus', async () => {
        for (const html of [await listing({ products: [], selected }), await listing({ products: [] })]) {
            assert.doesNotMatch(html, /data-no-products-notification|role="alert"|aria-live="assertive"/);
            assert.deepEqual(unbalancedTags(html), []);
        }
    });

    it('still says flies when BigCommerce drops the facet but a size is among the filters, with no Filter to open', async () => {
        const html = await listing({ products: [], facets: [], selected });
        assert.equal(count(html), 'No flies match these filters');
        assert.equal(findTags(row(html), 'button').length, 0);
        assert.equal(count(await listing({ products: [], facets: [], selected: { ...selected, items: [{ facet: 'Price', title: '$90 - $100', url: href('') }] } })), 'No products match these filters');
    });

    it('a category with no products and no filters keeps stock\'s plain message, which the hook passes as rf_none', async () => {
        const html = await listing({ products: [] });
        assert.equal(textOf(outerHtml(html, 'p', attrs => attrs.class === 'rf-listing-empty')), 'There are no products listed under this category.');
        assert.equal(findTags(html, 'div').filter(tag => tag.attrs.class === 'rf-list-top').length, 0);
        const other = await renderPartial('components/reelflies/listing-empty', { category: { selected: { items: [] } }, rf_none: 'Nothing here yet.' });
        assert.equal(textOf(outerHtml(other, 'p', attrs => attrs.class === 'rf-listing-empty')), 'Nothing here yet.');
    });
});

describe('the whole category page (pages/category)', () => {
    it('renders the pills in the sidebar, the row over the grid, and "What do sizes mean?" once', async () => {
        const html = await renderPartial('pages/category', { ...CATEGORY, category: { ...CATEGORY.category, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' } } });
        assert.equal(findTags(html, 'ul').filter(tag => tag.attrs['data-facet'] === 'Fly Sizes').length, 1);
        assert.equal(count(html), '48 flies');
        assert.equal(html.split('What do sizes mean?').length - 1, 1);
        assert.deepEqual(unbalancedTags(html), []);
    });
});
