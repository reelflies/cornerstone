// The Fly size filter's templates (ticket 33; spec modules 9 and 24; R2, O11, O20, SEO-6, SEO-12;
// stories 23, 24, 25 and 72; redesign step 3): stock faceted-search/facets/multi.html's hook
// (components/reelflies/facet-sizes.html, the size strip's cells), show-more-facets.html's, and
// stock category/product-listing.html's (components/reelflies/listing-top.html and
// listing-empty.html), on facet contexts shaped as BigCommerce's (`category.facets`,
// `category.selected`); and the facet's name, which the templates, the scripts and the
// size-filter assertion share. The count says "patterns" on a fly listing: one with the Fly Sizes
// facet, a size among its filters, or a root rf_fly_roots names (step 4's critique: channel 1
// exposes no size facet yet), and never one whose root rf_price_unit_exclude names.
//
//   node --test scripts/qa/render/partials/size-filter.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { SIZE_FACET } from '../../raw-html/assertions/size-filter.mjs';
import { FACET_NAME } from '../../../hook-gauge/sizes.mjs';

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
// A listing under the Flies root (tree 1's), and one under Fly Gear's, by their breadcrumbs.
const UNDER_FLIES = [{ name: 'Home', url: '/' }, { name: 'Flies', url: '/flies/' }, { name: 'Dry Flies', url: '/flies/dry-flies/' }];
const UNDER_GEAR = [{ name: 'Home', url: '/' }, { name: 'Fly Gear', url: '/fly-gear/' }, { name: 'Mustad Hooks', url: '/fly-gear/mustad-hooks/' }];

const facet = context => renderPartial('components/faceted-search/facets/multi', context);
const listing = ({
    facets = [FLY_SIZES], products = CATEGORY.category.products, selected = { items: [], remove_all_url: '' }, enabled = true, breadcrumbs = CATEGORY.breadcrumbs, theme = {}, total = CATEGORY.category.total_products,
} = {}) => renderPartial('components/category/product-listing', {
    ...CATEGORY,
    breadcrumbs,
    category: {
        ...CATEGORY.category, faceted_search_enabled: enabled, facets, products, selected, total_products: total,
    },
    theme_settings: { ...CATEGORY.theme_settings, ...theme },
});
const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const row = html => outerHtml(html, 'div', hasClass('rf-list-top'));
const heading = html => textOf(outerHtml(row(html), 'h2', hasClass('is-srOnly')));
const chosenSort = html => findTags(row(html), 'option').filter(tag => 'selected' in tag.attrs).map(tag => tag.attrs.value);
const count = html => textOf(outerHtml(html, 'p', attrs => 'data-rf-list-count' in attrs));
const filterButtons = html => findTags(row(html), 'button').filter(tag => 'data-rf-filter-button' in tag.attrs);
const pills = html => findTags(html, 'a').filter(tag => hasClass('rf-size-pill')(tag.attrs));

describe('the Fly Sizes facet as the size strip\'s cells (components/reelflies/facet-sizes.html)', () => {
    it('keeps BigCommerce\'s anchors untouched: the context\'s URL with _bc_fsnf=1, rel="nofollow", data-faceted-search-facet (SEO-6, SEO-12)', async () => {
        const anchors = pills(await facet(FLY_SIZES));
        assert.deepEqual(anchors.map(tag => decodeHtml(tag.attrs.href)), SIZES.map(size => size.url));
        for (const tag of anchors) {
            assert.equal(tag.attrs.rel, 'nofollow');
            assert.ok('data-faceted-search-facet' in tag.attrs);
        }
    });

    it('shows each size alone, named "Size 14", with the chosen one marked current and selected, and no count or hook drawing', async () => {
        const html = await facet(FLY_SIZES);
        assert.deepEqual(pills(html).map(tag => tag.attrs['aria-label']), ['Size 14', 'Size 1', 'Size 2/0', 'Size 24']);
        assert.deepEqual(pills(html).map(tag => tag.attrs['aria-current'] ?? null), ['true', null, null, null]);
        assert.deepEqual(pills(html).map(tag => hasClass('is-selected')(tag.attrs)), [true, false, false, false]);
        const list = outerHtml(html, 'ul', attrs => attrs['data-facet'] === 'Fly Sizes');
        assert.deepEqual(elementsHtml(list, 'a').map(textOf), ['14', '1', '2/0', '24']);
        assert.equal(findTags(list, 'svg').length, 0);
        assert.doesNotMatch(textOf(list), /\(12\)/, 'no product count');
    });

    it('keeps stock\'s ids, classes and data attributes, which faceted-search.js finds the list by', async () => {
        const html = await facet(FLY_SIZES);
        const [list] = findTags(html, 'ul');
        assert.equal(list.attrs.id, 'facetedSearch-navList--fly-sizes');
        assert.equal(list.attrs['data-facet'], 'Fly Sizes');
        assert.equal(list.attrs['data-has-more-results'], 'false');
        assert.match(list.attrs.class, /(^|\s)navList(\s|$)/);
        assert.equal(findTags(html, 'div')[0].attrs.class, 'accordion-block rf-size-facet');
        assert.equal(findTags(html, 'div')[1].attrs.id, 'facetedSearch-content--fly-sizes');
        assert.match(await facet({ ...FLY_SIZES, show_more_toggle: true }), /href="#facetedSearch-navList--fly-sizes" role="button" class="toggleLink rf-size-facet__more"/);
        assert.doesNotMatch(html, /toggleLink rf-size-facet__more/, 'no "Show more" when the store has no more');
    });

    it('gives the items their own class, not navList-item, which stock\'s "Show more" search hides document-wide', async () => {
        const items = findTags(await facet(FLY_SIZES), 'li');
        assert.equal(items.length, SIZES.length);
        for (const item of items) assert.equal(item.attrs.class, 'rf-size-pills__item');
    });

    it('links "What do sizes mean?" to the hook size chart under the cells: the page variable, or the chart\'s own address on a refresh (story 24)', async () => {
        const help = outerHtml(await facet(FLY_SIZES), 'p', hasClass('rf-size-facet__help'));
        assert.equal(findTags(help, 'a')[0].attrs.href, '/fly-hook-size-chart/');
        assert.equal(textOf(help), 'What do sizes mean?');
        const set = await renderPartial('rf-test/facet-caller', FLY_SIZES, { overrides: { 'rf-test/facet-caller': "{{assignVar 'rf_hook_chart' '/hooks/'}}{{> components/reelflies/facet-sizes}}" } });
        assert.equal(findTags(outerHtml(set, 'p', hasClass('rf-size-facet__help')), 'a')[0].attrs.href, '/hooks/');
    });

    it('leaves every other facet stock: its checkboxes and counts', async () => {
        const html = await facet(BRAND);
        assert.match(html, /navList-action--checkbox/);
        assert.match(html, /<span>\(12\)<\/span>/);
        assert.doesNotMatch(html, /rf-size-pill|rf-size-facet/);
    });

    it('renders nothing for a facet with no values, as stock', async () => {
        assert.equal((await facet({ ...FLY_SIZES, items: [] })).trim(), '');
    });
});

describe('the facet\'s name (components/reelflies/size-facet-name.html)', () => {
    it('is the same in the templates, facet-order.js, storefront.js, quick-search.js, the chart scripts and the size-filter assertion', () => {
        const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
        const [, templates] = read('templates/components/reelflies/size-facet-name.html').match(/assignVar 'rf_size_facet' '([^']+)'/);
        const [, facetOrder] = read('assets/js/theme/reelflies/facet-order.js').match(/FLY_SIZE_FACET = '([^']+)'/);
        const [, storefront] = read('assets/js/theme/reelflies/storefront.js').match(/productAttributes: \[\{ attribute: "([^"]+)"/);
        const [, quickSearch] = read('assets/js/theme/reelflies/quick-search.js').match(/params\.append\('([^']+)', size\)/);
        assert.equal(templates, 'Fly Sizes');
        assert.equal(facetOrder, templates);
        assert.equal(storefront, templates);
        assert.equal(quickSearch, templates);
        assert.equal(FACET_NAME, templates);
        assert.equal(SIZE_FACET, templates);
    });

    it('decides the cells: a facet under another name stays stock', async () => {
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
        assert.equal(findTags(html, 'a').filter(tag => 'data-faceted-search-facet' in tag.attrs).length, SIZES.length);
    });
});

describe('the row above the grid (components/reelflies/listing-top.html)', () => {
    it('counts patterns where the listing has the Fly Sizes facet, else products, from category.total_products, with a hidden H2 to match', async () => {
        assert.equal(count(await listing()), '48 patterns');
        assert.equal(heading(await listing()), 'Patterns');
        assert.equal(count(await listing({ facets: [BRAND] })), '48 products');
        assert.equal(heading(await listing({ facets: [BRAND] })), 'Products');
        // The live context has no pagination.category.total, nor do the fixtures: the count is the
        // category's own.
        assert.equal(CATEGORY.pagination.category.total, undefined);
        assert.equal(count(await listing({ total: 7 })), '7 patterns');
        assert.equal(count(await listing({ total: 1 })), '1 pattern');
        assert.equal(count(await listing({ total: 1, facets: [BRAND] })), '1 product');
        assert.equal(count(await listing({ total: 1446 })), '1,446 patterns', 'thousands take a comma');
    });

    it('counts patterns under a root rf_fly_roots names though the channel exposes no size facet, and never under one rf_price_unit_exclude names (step 4)', async () => {
        assert.equal(count(await listing({ facets: [], breadcrumbs: UNDER_FLIES, theme: { rf_fly_roots: 'Flies' } })), '48 patterns');
        assert.equal(count(await listing({ facets: [], breadcrumbs: UNDER_FLIES, theme: { rf_fly_roots: '' } })), '48 products', 'no fly roots named');
        assert.equal(count(await listing({ facets: [], breadcrumbs: UNDER_FLIES, theme: { rf_fly_roots: ' Fly Gear , Flies ' } })), '48 patterns', 'spaces round the names');
        assert.equal(count(await listing({ facets: [], breadcrumbs: CATEGORY.breadcrumbs, theme: { rf_fly_roots: 'Flies' } })), '48 products', 'a top-level page is its own root');
        assert.equal(count(await listing({ breadcrumbs: UNDER_GEAR, theme: { rf_fly_roots: 'Flies,Fly Gear', rf_price_unit_exclude: 'Fly Gear' } })), '48 products', 'Gear\'s hooks have sizes, but they aren\'t patterns');
        assert.equal(heading(await listing({ breadcrumbs: UNDER_GEAR, theme: { rf_price_unit_exclude: 'Fly Gear' } })), 'Products');
    });

    it('takes the paginator\'s total where the context has none (search), or the caller\'s own text (a brand page)', async () => {
        const context = {
            category: {
                ...CATEGORY.category, total_products: undefined, facets: [FLY_SIZES], selected: { items: [] },
            },
            breadcrumbs: [],
            theme_settings: {},
        };
        assert.equal(count(await renderPartial('components/reelflies/listing-top', { ...context, rf_sort: 'featured', rf_total: 123 })), '123 patterns');
        assert.equal(count(await renderPartial('components/reelflies/listing-top', { ...context, rf_sort: 'featured', rf_count: 'Page 2' })), 'Page 2');
    });

    it('carries Filter, for phones, only when a facet shows, beside stock\'s sort bar', async () => {
        const [button] = filterButtons(await listing());
        assert.equal(button.attrs['aria-controls'], 'facetedSearch-navList');
        assert.equal(button.attrs['aria-expanded'], 'false');
        assert.equal(button.attrs.type, 'button');
        assert.equal(textOf(outerHtml(row(await listing()), 'button', attrs => 'data-rf-filter-button' in attrs)), 'Filter');
        assert.match(row(await listing()), /data-sort-by="product"/);
        assert.equal(filterButtons(await listing({ facets: [{ ...FLY_SIZES, visible: false }] })).length, 0);
        assert.equal(filterButtons(await listing({ enabled: false })).length, 0);
    });

    it('chooses the listing\'s sort, which the hook passes as rf_sort', async () => {
        const html = await renderPartial('components/category/product-listing', {
            ...CATEGORY,
            pagination: { category: { ...CATEGORY.pagination.category, sort: 'priceasc' } },
            category: { ...CATEGORY.category, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' } },
        });
        assert.deepEqual(chosenSort(html), ['priceasc']);
    });

    it('shows the Photos / Quick order switch with quick add on and products, drawn invisible until order-list.js takes the mark off', async () => {
        const on = await listing({ theme: { rf_quick_add: true } });
        const view = findTags(on, 'div').find(tag => 'data-rf-view' in tag.attrs);
        assert.ok(view, 'the switch');
        assert.ok('data-rf-view-pending' in view.attrs);
        assert.equal(view.attrs.role, 'group');
        assert.deepEqual(findTags(view.raw + on.slice(on.indexOf(view.raw) + view.raw.length), 'button').slice(0, 2).map(tag => [tag.attrs['data-rf-view-set'], tag.attrs['aria-pressed']]), [['grid', 'true'], ['list', 'false']]);
        assert.match(findTags(on, 'div').find(tag => hasClass('rf-list-top')(tag.attrs)).attrs.class, /(^|\s)rf-list-top--views(\s|$)/);
        assert.equal(findTags(await listing({ theme: { rf_quick_add: false } }), 'div').filter(tag => 'data-rf-view' in tag.attrs).length, 0, 'quick add off');
        assert.equal(findTags(await listing({ products: [], selected: { items: [{ facet: 'Fly Sizes', title: '32', url: href('') }], remove_all_url: href('') }, theme: { rf_quick_add: true } }), 'div').filter(tag => 'data-rf-view' in tag.attrs).length, 0, 'nothing to order');
    });

    it('renders for another listing\'s context and sort, as the brand listing includes it', async () => {
        const brand = {
            ...CATEGORY.category, name: 'ReelFlies', total_products: 9, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' },
        };
        const html = await renderPartial('components/reelflies/listing-top', { category: brand, breadcrumbs: [], rf_sort: 'alphaasc' });
        assert.equal(count(html), '9 patterns');
        assert.deepEqual(chosenSort(html), ['alphaasc']);
    });
});

describe('the empty listing (components/reelflies/listing-empty.html; O20, story 25)', () => {
    const selected = { items: [{ facet: 'Fly Sizes', title: '32', url: href('') }], remove_all_url: href('') };

    it('when filters match nothing: "No flies match these filters" and Clear filters to the context\'s clear-all URL, with Filter still there', async () => {
        const html = await listing({ products: [], selected });
        assert.equal(count(html), 'No flies match these filters');
        const clear = findTags(outerHtml(html, 'div', hasClass('rf-list-empty')), 'a')[0];
        assert.match(clear.attrs.class, /(^|\s)rf-list-empty__clear(\s|$)/);
        assert.equal(decodeHtml(clear.attrs.href), selected.remove_all_url);
        assert.equal(clear.attrs.rel, 'nofollow');
        assert.ok('data-faceted-search-facet' in clear.attrs, 'stock refreshes the listing in place');
        assert.equal(filterButtons(html).length, 1);
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
        assert.equal(filterButtons(html).length, 0);
        assert.equal(count(await listing({ products: [], facets: [], selected: { ...selected, items: [{ facet: 'Price', title: '$90 - $100', url: href('') }] } })), 'No products match these filters');
    });

    it('a category with no products and no filters keeps stock\'s plain message, which the hook passes as rf_none, and no row', async () => {
        const html = await listing({ products: [] });
        assert.equal(textOf(outerHtml(html, 'div', hasClass('rf-list-empty'))), 'There are no products listed under this category.');
        assert.equal(row(html), null);
        const other = await renderPartial('components/reelflies/listing-empty', { category: { selected: { items: [] } }, rf_none: 'Nothing here yet.' });
        assert.equal(textOf(outerHtml(other, 'div', hasClass('rf-list-empty'))), 'Nothing here yet.');
    });
});

describe('the whole category page (pages/category)', () => {
    it('renders the cells in the sidebar, the row over the grid, and "What do sizes mean?" once', async () => {
        const html = await renderPartial('pages/category', { ...CATEGORY, category: { ...CATEGORY.category, facets: [FLY_SIZES], selected: { items: [], remove_all_url: '' } } });
        assert.equal(findTags(html, 'ul').filter(tag => tag.attrs['data-facet'] === 'Fly Sizes').length, 1);
        assert.equal(count(html), '48 patterns');
        // In the markup: the page's script context carries the words quick add writes too.
        assert.equal(markupOnly(html).split('What do sizes mean?').length - 1, 1);
        assert.ok(html.indexOf('rf-size-facet') < html.indexOf('rf-list-top'), 'the facets before the row in the source');
        assert.deepEqual(unbalancedTags(html), []);
    });
});
