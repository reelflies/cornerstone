// Quick search's templates (ticket 30; spec modules 4 and 5; stories 1, 2 and 3), rendered from
// fixture store data the way stencil start renders them (W0-9):
//
// - components/reelflies/quick-results.html, the dropdown's server half: the count heading from
//   the real total, the empty categories list quick-search.js fills, at most 8 compact product rows
//   with the price, and "See all N results"; or the heading alone when nothing matched.
// - components/reelflies/phone-search-row.html: the phone search row on home, category (stock
//   and custom) and search pages only.
// - the phone header's search link and the toggle quick-search.js swaps it for.
//
// The browser half is quick-search.spec.mjs (Playwright) and the Jest spec of quick-search.js.
//
//   node --test scripts/qa/render/partials/quick-search.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies
import { findTags, outerHtml } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial, THEME_DIR } from '../render.mjs';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');

// A product as the search page's product_results.products carries it (channel 1, 2026-10-07).
const product = (id, extra = {}) => ({
    id,
    name: `Elk Hair Caddis ${id}`,
    url: `https://reelflies.ca/elk-hair-caddis-${id}/?searchuuid=fixture&search_query=caddis`,
    category: ['Flies/Dry Flies/Caddis Dry Flies'],
    image: { data: `https://cdn11.bigcommerce.com/s-fixture/images/stencil/{:size}/products/${id}/1/caddis-${id}.jpg?c=2`, alt: `Elk Hair Caddis ${id}` },
    price: { without_tax: { formatted: '$0.95', value: 0.95, currency: 'CAD' }, tax_label: 'Tax' },
    ...extra,
});

const STORE = {
    urls: { search: '/search.php', home: 'https://reelflies.ca/' },
    settings: { hide_price_from_guests: false },
};

// The store hands the query over HTML-escaped (forms.search.query), as on channel 1.
const results = ({ products = [], total = products.length, query = 'caddis' } = {}, context = {}) => renderPartial('components/reelflies/quick-results', {
    ...STORE,
    product_results: { products },
    pagination: { product_results: { total } },
    forms: { search: { query } },
    ...context,
});

describe('quick-results.html', () => {
    it('opens with the count heading, from the real total, then the empty categories list (story 3)', async () => {
        const html = await results({ products: [product(1), product(2)], total: 203 });
        const heading = outerHtml(html, 'p', attrs => 'data-rf-qs-heading' in attrs);
        assert.equal(text(heading), '203 results for “caddis”');
        const [root] = findTags(html, 'div');
        assert.ok('data-rf-qs-results' in root.attrs);
        assert.equal(root.attrs['data-rf-qs-total'], '203');
        assert.equal(root.attrs['data-rf-qs-category-label'], 'category');
        const lists = findTags(html, 'ul');
        assert.ok('data-rf-qs-categories' in lists[0].attrs, 'the categories list comes first, after the heading');
        assert.ok('hidden' in lists[0].attrs, 'hidden until quick-search.js fills it');
        assert.ok(html.indexOf('data-rf-qs-heading') < html.indexOf('data-rf-qs-categories'));
        assert.ok(html.indexOf('data-rf-qs-categories') < html.indexOf('rf-qs-products'));
        assert.ok(html.indexOf('rf-qs-products') < html.indexOf('data-rf-qs-all'));
        assert.deepEqual(unbalancedTags(html), []);
    });

    // The reference draws each category with a tile holding an arrow in the thumbnail column
    // (.qs .th.cat, reference.src.html:717-718, :1327; rf/skeptic round 1, minor 3).
    it('carries the category rows\' arrow tile as a <template> for quick-search.js to copy', async () => {
        const html = await results({ products: [product(1)], total: 1 });
        const tile = outerHtml(html, 'template', attrs => 'data-rf-qs-category-tile' in attrs);
        assert.ok(tile, 'one template, data-rf-qs-category-tile');
        const [span] = findTags(tile, 'span');
        assert.match(span.attrs.class, /(^|\s)rf-qs-thumb--category(\s|$)/);
        const [svg] = findTags(tile, 'svg');
        assert.equal(svg.attrs['aria-hidden'], 'true', 'the arrow is decorative: the link\'s name is the category\'s');
        assert.equal(findTags(tile, 'use')[0].attrs.href, '#rf-icon-chevron-down', 'the icon sheet\'s chevron, turned to point right, as ticket 28\'s rail does');
        assert.equal(text(tile), '');
        assert.ok(html.indexOf('data-rf-qs-category-tile') < html.indexOf('data-rf-qs-categories'));
        assert.equal((await results({ products: [], total: 0 })).includes('data-rf-qs-category-tile'), true, 'there with no products too: categories can match');
    });

    it('says "1 result" for one', async () => {
        const html = await results({ products: [product(1)], total: 1 });
        assert.equal(text(outerHtml(html, 'p', attrs => 'data-rf-qs-heading' in attrs)), '1 result for “caddis”');
        assert.equal(text(outerHtml(html, 'a', attrs => 'data-rf-qs-all' in attrs)), 'See the result');
    });

    it('renders at most 8 compact rows: a 3:2 thumbnail, the name and the price, each a link to its product (story 2)', async () => {
        const html = await results({ products: Array.from({ length: 12 }, (_, i) => product(i + 1)), total: 40 });
        const rows = findTags(html, 'a').filter(tag => /\brf-qs-product\b/.test(tag.attrs.class || ''));
        assert.equal(rows.length, 8);
        assert.match(rows[0].attrs.href, /^https:\/\/reelflies\.ca\/elk-hair-caddis-1\//);
        const row = outerHtml(html, 'a', attrs => /\brf-qs-product\b/.test(attrs.class || ''));
        assert.equal(text(row), 'Elk Hair Caddis 1 $0.95');
        const [img] = findTags(row, 'img');
        assert.equal(img.attrs.alt, '', 'the name is the link\'s text');
        assert.equal(img.attrs.width, '56');
        assert.equal(img.attrs.height, '37');
        assert.equal(img.attrs.loading, 'lazy');
        assert.match(img.attrs.src, /\/stencil\/100x100\/products\/1\//);
        assert.ok(findTags(html, 'article').length === 0, 'no stock product cards');
    });

    it('ends with "See all N results", linking to the search page', async () => {
        const html = await results({ products: [product(1)], total: 203 });
        const all = findTags(html, 'a').find(tag => 'data-rf-qs-all' in tag.attrs);
        assert.equal(all.attrs.href, '/search.php', 'quick-search.js adds the query');
        assert.equal(text(outerHtml(html, 'a', attrs => 'data-rf-qs-all' in attrs)), 'See all 203 results');
    });

    it('says nothing matched, with no rows and no "See all"', async () => {
        const html = await results({ products: [], total: 0, query: 'zzzz' });
        assert.equal(text(outerHtml(html, 'p', attrs => 'data-rf-qs-heading' in attrs)), 'No results for “zzzz”');
        assert.equal(findTags(html, 'a').length, 0);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('keeps the store\'s escaping of the query, and strips any tag left in it', async () => {
        const html = await results({ products: [product(1)], total: 2, query: '&lt;b&gt; bh &amp; &quot;leech&quot;' });
        const heading = outerHtml(html, 'p', attrs => 'data-rf-qs-heading' in attrs);
        assert.match(heading, /2 results for “&lt;b&gt; bh &amp; &quot;leech&quot;”/);
        assert.equal(findTags(heading, 'b').length, 0);
        const raw = await results({ products: [product(1)], total: 2, query: '<img src=x onerror=alert(1)>caddis' });
        assert.equal(findTags(outerHtml(raw, 'p', attrs => 'data-rf-qs-heading' in attrs), 'img').length, 0);
    });

    it('shows the price with tax when the store shows it, and a price range as its ends', async () => {
        const taxed = await results({ products: [product(1, { price: { with_tax: { formatted: '$1.09' }, without_tax: { formatted: '$0.95' } } })] });
        assert.match(text(outerHtml(taxed, 'span', attrs => /\brf-qs-price\b/.test(attrs.class || ''))), /^\$1\.09$/);
        const range = await results({
            products: [product(1, {
                price: {
                    without_tax: { formatted: '$0.95' },
                    price_range: { min: { without_tax: { formatted: '$0.95' } }, max: { without_tax: { formatted: '$1.25' } } },
                },
            })],
        }, { theme_settings: { price_ranges: true } });
        assert.equal(text(outerHtml(range, 'span', attrs => /\brf-qs-price\b/.test(attrs.class || ''))), '$0.95–$1.25');
    });

    // Ticket 31's price-unit partial in the price's slot: the card's own rule, with the channel's
    // Gear and Assortment roots (rf_price_unit_exclude; tree 1's in ReelFlies CA channel 1).
    it('adds "/ fly" after a fly\'s price and not a hook pack\'s, by the card\'s rule (ticket 31)', async () => {
        const html = await results({
            products: [product(1), product(2, { name: 'Mustad R73-9671 Streamer Hooks [50/pack]', category: ['Fly Gear/Mustad Hooks'] })],
        }, { theme_settings: { rf_price_unit_exclude: 'Fly Gear,Fly Selections & Fly Boxes' } });
        const prices = findTags(html, 'span').filter(tag => /\brf-qs-price\b/.test(tag.attrs.class || ''));
        assert.equal(prices.length, 2);
        const [fly, hooks] = [...html.matchAll(/<span class="rf-qs-price">([\s\S]*?)<\/span>\s*<\/a>/g)].map(([, inner]) => text(inner));
        assert.equal(fly, '$0.95 / fly');
        assert.equal(hooks, '$0.95');
        assert.equal(text(outerHtml(await results({ products: [product(1)] }), 'span', attrs => /\brf-qs-price\b/.test(attrs.class || ''))), '$0.95', 'no roots set (ReelFlies CA until tree 4): no unit');
    });

    it('hides prices from guests when the store does', async () => {
        const html = await results({ products: [product(1)] }, { settings: { hide_price_from_guests: true } });
        assert.equal(text(outerHtml(html, 'span', attrs => /\brf-qs-price\b/.test(attrs.class || ''))), 'Log in for pricing');
        const signedIn = await results({ products: [product(1)] }, { settings: { hide_price_from_guests: true }, customer: { id: 1 } });
        assert.equal(text(outerHtml(signedIn, 'span', attrs => /\brf-qs-price\b/.test(attrs.class || ''))), '$0.95');
    });

    it('falls back to the default product image for a product with none', async () => {
        const html = await results({ products: [product(1, { image: null })] });
        assert.match(findTags(html, 'img')[0].attrs.src, /img\/reelflies\/default-product\.png/);
    });
});

describe('phone-search-row.html (story 1)', () => {
    const row = template => renderPartial(template, STORE, { overrides: { [template]: '{{> components/reelflies/phone-search-row}}' } });

    for (const template of ['pages/home', 'pages/category', 'pages/search', 'pages/custom/category/rf-noindex']) {
        it(`renders the phone row on ${template}: the search form named phone, a real GET with the placeholder`, async () => {
            const html = await row(template);
            const forms = findTags(html, 'form');
            assert.equal(forms.length, 1);
            assert.equal(forms[0].attrs['data-rf-search-form'], 'phone');
            assert.equal(forms[0].attrs.id, 'rf-search-form-phone');
            assert.equal(forms[0].attrs.action, '/search.php');
            assert.equal(forms[0].attrs.method, 'get');
            const [input] = findTags(html, 'input');
            assert.equal(input.attrs.name, 'search_query');
            assert.equal(input.attrs.id, 'rf-search-phone');
            assert.equal(input.attrs.placeholder, 'Search flies by name');
            assert.ok(findTags(html, 'div').some(tag => 'data-rf-phone-search' in tag.attrs));
            assert.equal(findTags(html, 'svg')[0].attrs.class, 'rf-icon', 'the button\'s icon doesn\'t take the form\'s class');
            assert.deepEqual(unbalancedTags(html), []);
        });
    }

    for (const template of ['pages/product', 'pages/cart', 'pages/brand', 'pages/page', 'pages/errors/404', 'pages/custom/page/hook-size-chart']) {
        it(`renders nothing on ${template}`, async () => {
            assert.equal((await row(template)).trim(), '');
        });
    }
});

describe('the phone header\'s search link and toggle', () => {
    it('keeps the link to the search page, and adds the toggle, hidden until quick-search.js swaps them', async () => {
        const html = await renderPartial('components/reelflies/header', { ...STORE, settings: { store_logo: { title: 'ReelFlies.ca' } } });
        const link = findTags(html, 'a').find(tag => 'data-rf-search-link' in tag.attrs);
        assert.equal(link.attrs.href, '/search.php');
        const toggle = findTags(html, 'button').find(tag => 'data-rf-search-toggle' in tag.attrs);
        assert.ok(toggle);
        assert.equal(toggle.attrs.type, 'button');
        assert.ok('hidden' in toggle.attrs);
        assert.equal(toggle.attrs['aria-expanded'], 'false');
        assert.equal(toggle.attrs['aria-controls'], 'rf-search-form-header');
        assert.ok(findTags(html, 'form').some(tag => tag.attrs.id === 'rf-search-form-header'), 'it controls the header\'s form');
        assert.equal(text(outerHtml(html, 'button', attrs => 'data-rf-search-toggle' in attrs)), 'Search');
    });
});

describe('the partials stencil bundle has to find', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);
    const includes = source => [...source.matchAll(/\{\{~?#?>\s*([^\s}]+)/g)].map(match => match[1]);

    for (const file of ['templates/components/reelflies/phone-search-row.html', 'templates/components/reelflies/quick-results.html']) {
        it(`finds every include in ${file}`, () => {
            const source = read(file);
            assert.deepEqual(bundled(source), includes(source));
        });
    }
});
