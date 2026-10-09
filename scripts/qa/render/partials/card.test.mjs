// The product card and the listing grid (ticket 31; spec module 13; stories 28, 35 and 70):
// components/products/card.html hands the card to components/reelflies/card.html, which every
// listing shares (category, search, brand, related products), with components/reelflies/
// card-image.html for its photo, price-unit.html for "/ fly" and card-extras.html as tickets 42
// and 43's slot. The cards are search results for "streamer" on channel 1 (card/products.json).
//
//   node --test scripts/qa/render/partials/card.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

const { products } = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'card/products.json'), 'utf8'));
const TREE_1 = 'Fly Gear,Fly Selections & Fly Boxes';
const CALLER = 'rf-test/card-grid-caller';

// The grid as a listing renders it, on a page of `pageType`, with tree 1's Gear and Assortment
// roots unless a test sets others; `banner` sets ticket 32's rf_banner flag before the grid.
const grid = (context = {}, { pageType = 'search', banner = false } = {}) => renderPartial(CALLER, {
    products,
    page_type: pageType,
    settings: { show_product_rating: true, hide_price_from_guests: false },
    show_compare: true,
    ...context,
    theme_settings: { rf_price_unit_exclude: TREE_1, ...context.theme_settings },
}, {
    overrides: {
        [CALLER]: `${banner ? "{{assignVar 'rf_banner' 1}}" : ''}{{> components/products/grid products=products show_compare=show_compare theme_settings=theme_settings event="list"}}`,
    },
});
const cards = html => elementsHtml(html, 'article', attrs => /(^|\s)card(\s|$)/.test(attrs.class || ''));
const image = card => findTags(card, 'img')[0];

describe('the card (components/reelflies/card.html)', () => {
    it('keeps the stock card\'s data attributes, which the store\'s scripts read, and balances its markup', async () => {
        const html = await grid();
        const list = cards(html);
        assert.equal(list.length, products.length);
        const [article] = findTags(list[0], 'article');
        assert.equal(article.attrs['data-entity-id'], '4831');
        assert.equal(article.attrs['data-position'], '1');
        assert.equal(article.attrs['data-name'], 'Royal Coachman Streamer');
        assert.equal(article.attrs['data-event-type'], 'list');
        assert.equal(article.attrs['data-test'], 'card-4831');
        assert.match(article.attrs.class, /(^|\s)rf-card(\s|$)/);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('shows the name as a link and the price, with no brand line, star row or compare checkbox (SEO-9; story 28)', async () => {
        const html = await grid();
        for (const card of cards(html)) {
            assert.equal(findTags(card, 'input').length, 0, 'no compare checkbox');
            assert.doesNotMatch(card, /data-test-info-type="(brandName|productRating)"/);
            assert.equal(findTags(outerHtml(card, 'h3', attrs => /card-title/.test(attrs.class || '')), 'a').length, 1);
            assert.ok(outerHtml(card, 'div', attrs => attrs['data-test-info-type'] === 'price'), 'the price');
        }
        assert.doesNotMatch(cards(html)[5], />\s*ReelFlies\s*</, 'no brand line, though the product has a brand');
    });

    it('adds "/ fly" to flies only, by the price-unit rule (story 28)', async () => {
        const units = cards(await grid()).map(card => /rf-price-unit/.test(card));
        // 4831 and 5906 flies; 5697 a hook pack; 5879 a bulk selection; 5234 and 4804 flies.
        assert.deepEqual(units, [true, true, false, false, true, true]);
        assert.deepEqual(cards(await grid({ theme_settings: { rf_price_unit_exclude: '' } })).map(card => /rf-price-unit/.test(card)), products.map(() => false), 'no roots set: no unit');
    });

    it('marks a sold-out product with the top-left badge (ticket 13, decision 1)', async () => {
        const list = cards(await grid());
        const badged = list.map(card => outerHtml(card, 'div', attrs => attrs.class === 'sold-out-flag-side'));
        assert.deepEqual(badged.map(Boolean), [false, false, false, false, true, false]);
        assert.equal(textOf(badged[4]), 'Sold out');
    });

    it('keeps the stock actions, outside the photo, with no compare: Quick view, Choose options, Add to cart (story 35)', async () => {
        const list = cards(await grid());
        const actions = card => outerHtml(card, 'div', attrs => /(^|\s)rf-card-actions(\s|$)/.test(attrs.class || ''));
        for (const card of list) {
            assert.ok(actions(card), 'an actions row');
            assert.equal(findTags(actions(card), 'button').filter(tag => /quickview/.test(tag.attrs.class)).length, 1, 'Quick view');
            const figure = outerHtml(card, 'figure', () => true);
            assert.doesNotMatch(figure, /quickview|card-figcaption/, 'nothing over the photo');
        }
        assert.match(textOf(actions(list[0])), /Choose Options/i, 'a product with sizes links to its page');
        assert.match(textOf(actions(list[3])), /Add to Cart/i, 'a product with none adds from the card');
    });

    it('honours hide_product_quick_view, as the cart preview passes it', async () => {
        const html = await renderPartial('components/products/card', { ...products[0], hide_product_quick_view: true, theme_settings: { show_product_quick_view: true } });
        assert.equal(findTags(html, 'button').filter(tag => /quickview/.test(tag.attrs.class)).length, 0);
    });

    it('leaves an empty slot for tickets 42 and 43 inside the card body', async () => {
        const source = fs.readFileSync(path.resolve('templates/components/reelflies/card.html'), 'utf8');
        assert.match(source, /\{\{> components\/reelflies\/card-extras\}\}/);
    });
});

describe('the card\'s photo (components/reelflies/card-image.html; SEO-14, O23, IMG-1)', () => {
    it('is a 3:2 box: width 600 and height 400, as productgallery_size says', async () => {
        for (const card of cards(await grid())) {
            const img = image(card);
            assert.equal(img.attrs.width, '600');
            assert.equal(img.attrs.height, '400');
        }
    });

    it('on a page with no banner: the first card high priority, the first three eager, the rest lazy, none through lazysizes (story 70)', async () => {
        const imgs = cards(await grid()).map(image);
        assert.equal(imgs[0].attrs.fetchpriority, 'high');
        imgs.slice(1).forEach(img => assert.equal(img.attrs.fetchpriority, undefined));
        imgs.slice(0, 3).forEach(img => assert.equal(img.attrs.loading, undefined, 'eager'));
        imgs.slice(3).forEach(img => assert.equal(img.attrs.loading, 'lazy'));
        for (const img of imgs) {
            assert.match(img.attrs.srcset, /320w, .* 640w, /, 'a real srcset');
            assert.ok(img.attrs.sizes, 'sizes');
            assert.ok(img.attrs.src, 'src');
            assert.doesNotMatch(img.attrs.class, /(^|\s)lazyload(\s|$)/, 'not lazysizes');
            assert.equal(img.attrs['data-srcset'], undefined);
            assert.equal(img.attrs['data-sizes'], undefined);
            assert.doesNotMatch(img.attrs.srcset, /^data:/, 'no LQIP stand-in');
        }
    });

    it('on a page with a banner (ticket 32 sets rf_banner): no card high priority, the first three still eager', async () => {
        const imgs = cards(await grid({}, { pageType: 'category', banner: true })).map(image);
        imgs.forEach(img => assert.equal(img.attrs.fetchpriority, undefined));
        imgs.slice(0, 3).forEach(img => assert.equal(img.attrs.loading, undefined));
        imgs.slice(3).forEach(img => assert.equal(img.attrs.loading, 'lazy'));
    });

    it('carries the photo\'s alt text, and the default image for a product with none', async () => {
        assert.equal(image(cards(await grid())[0]).attrs.alt, 'Royal-Coachman-Streamer');
        const html = await grid({ products: [{ ...products[0], image: null }], theme_settings: { default_image_product: 'img/ProductDefault.png' } });
        const img = image(cards(html)[0]);
        assert.match(img.attrs.src, /ProductDefault\.png/);
        assert.equal(img.attrs.width, '600');
    });
});

// A whole page, not just the grid: inside a page's {{#partial "page"}} block @root is empty, so a
// card that read @root.theme_settings or @root.page_type would lose them there and nowhere else.
describe('the cards on a whole search page (pages/search)', () => {
    const searchPage = theme => renderPartial('pages/search', {
        page_type: 'search',
        product_results: { products, show_compare: true },
        forms: { search: { query: 'streamer', section: 'product' } },
        pagination: { product_results: { total: products.length, links: [] } },
        settings: {},
        urls: { search: '/search.php' },
        theme_settings: theme,
    }, { variation: 'ReelFlies CA channel 1' });

    it('keeps "/ fly" and the first row\'s eager photos, with the first one high priority', async () => {
        const list = cards(await searchPage({}));
        assert.equal(list.length, products.length);
        assert.deepEqual(list.map(card => /rf-price-unit/.test(card)), [true, true, false, false, true, true]);
        const imgs = list.map(image);
        assert.equal(imgs[0].attrs.fetchpriority, 'high');
        assert.deepEqual(imgs.map(img => img.attrs.loading ?? 'eager'), ['eager', 'eager', 'eager', 'lazy', 'lazy', 'lazy']);
    });
});

describe('the cards outside a listing grid (related products)', () => {
    it('are lazy, with no high priority', async () => {
        // As the product page's tabs call it, with the related products as its context.
        const html = await renderPartial('rf-test/related-caller', { products, settings: {}, theme_settings: {} }, {
            overrides: { 'rf-test/related-caller': '{{> components/products/related products}}' },
        });
        const imgs = cards(html).map(image);
        assert.equal(imgs.length, products.length);
        imgs.forEach(img => {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
        });
    });
});

describe('the card grid\'s shot (card-screens.spec.mjs)', () => {
    it('shoots exactly these products, with tree 1\'s Gear and Assortment roots', () => {
        const shot = JSON.parse(fs.readFileSync(path.resolve('scripts/qa/render/pages/card-grid/fixtures/search.json'), 'utf8'));
        assert.deepEqual(shot.page_context.product_results.products, products);
        assert.equal(shot.page_context.theme_settings.rf_price_unit_exclude, TREE_1);
        assert.equal(shot.page, 'pages/search');
    });
});

describe('the grid (components/products/grid.html)', () => {
    it('is the stock list of products, one card each, in order', async () => {
        const html = await grid();
        const [list] = findTags(html, 'ul');
        assert.match(list.attrs.class, /(^|\s)productGrid(\s|$)/);
        assert.deepEqual(cards(html).map(card => findTags(card, 'article')[0].attrs['data-entity-id']), products.map(product => String(product.id)));
    });
});
