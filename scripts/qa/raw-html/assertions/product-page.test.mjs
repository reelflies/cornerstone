// Tests the product-page assertion (ticket 39; O14, O23, R6, SEO-8; stories 44 to 48 and 70) on the
// product page the templates render from the fixture page's product (the reference's Adams
// Parachute and its four related patterns), and on hand-made breakages of it.
//
//   node --test scripts/qa/raw-html/assertions/product-page.test.mjs

import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, readFixture, renderPartial } from '../../render/render.mjs';
import productPage from './product-page.mjs';

const { page_context: CONTEXT } = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json'));
const page = async (product = {}) => ({
    kind: 'product', key: 'product', path: '/', status: 200, html: await renderPartial('pages/product', { ...CONTEXT, product: { ...CONTEXT.product, ...product } }),
});
const problems = (good, from, to) => productPage.check({ ...good, html: good.html.replace(from, to) }).join('\n');

test('applies to product pins, ticket 39', () => {
    assert.deepEqual(productPage.pages, ['product']);
    assert.equal(productPage.ticket, 39);
});

test('passes the rendered product page: with and without related products, a description or a photo', async () => {
    assert.deepEqual(productPage.check(await page()), []);
    assert.deepEqual(productPage.check(await page({ related_products: [] })), []);
    assert.deepEqual(productPage.check(await page({ description: '' })), []);
    assert.deepEqual(productPage.check(await page({ main_image: null, images: [] })), []);
});

test('judges only a page with a product view, as the harness\'s fixture pages have none', async () => {
    assert.deepEqual(productPage.check({ ...(await page()), html: '<html><body><main><h1>A product</h1></main></body></html>' }), []);
    const good = await page();
    assert.match(problems(good, 'data-rf-product-buy', 'data-rf-product-bought'), /0 buy boxes/, 'a product view without its hooks fails');
});

test('fails a main image that waits: lazysizes, loading="lazy", no priority, no srcset or no dimensions', async () => {
    const good = await page();
    assert.match(problems(good, 'class="productView-image--default rf-product-image"', 'class="productView-image--default lazyload"'), /loads through lazysizes/);
    assert.match(problems(good, 'loading="eager" data-main-image', 'loading="lazy" data-main-image'), /is loading="lazy"/);
    assert.match(problems(good, 'fetchpriority="high" loading="eager"', 'loading="eager"'), /no fetchpriority="high"[\s\S]*0 elements with fetchpriority="high"/);
    assert.match(problems(good, /srcset="[^"]*1520w"/, 'srcset="data:image/gif;base64,R0lGOD 1w"'), /no real srcset/);
    assert.match(problems(good, /width="760" height="507"/, ''), /no width and height/);
    assert.match(problems(good, /sizes="\(min-width: 801px\) 50vw, 100vw"/, ''), /no sizes/);
});

test('fails a second fetchpriority="high" on the page, a related photo\'s included (SEO-8; O23)', async () => {
    const good = await page();
    assert.match(problems(good, /<img class="card-image rf-card-image"([^>]*) loading="lazy"/, '<img class="card-image rf-card-image"$1 fetchpriority="high"'), /2 elements with fetchpriority="high"[\s\S]*related card 1's photo isn't loading="lazy"[\s\S]*related card 1's photo has a fetchpriority/);
});

test('fails the buy box without its H1, a shipping line with a placeholder, and the promise above Add to cart', async () => {
    const good = await page();
    assert.match(problems(good, 'data-rf-product-buy', 'data-rf-product-bought'), /0 buy boxes/);
    assert.match(problems(good, 'fly orders over $60.', 'fly orders over ${threshold}.'), /the shipping line carries a placeholder/);
    assert.match(problems(good, 'Free standard shipping in Canada on fly orders over $60.', 'Standard shipping in Canada $X.XX, free on fly orders over $60.'), /placeholder/);
    const promise = /<p class="rf-promise" data-rf-promise>[\s\S]*?<\/p>/;
    const [line] = good.html.match(promise);
    const moved = good.html.replace(promise, '').replace('<div id="add-to-cart-wrapper"', `${line}<div id="add-to-cart-wrapper"`);
    assert.match(productPage.check({ ...good, html: moved }).join('\n'), /the promise line isn't under Add to cart/);
    assert.match(problems(good, promise, ''), /no promise line/);
});

test('fails details that are missing, closed where "About this fly" belongs open, or without the chart link', async () => {
    const good = await page();
    assert.match(problems(good, 'data-rf-product-details', 'data-rf-gone'), /no details under the photos/);
    assert.match(problems(good, 'data-rf-details="about" open', 'data-rf-details="about"'), /"About this fly" isn't open/);
    assert.match(problems(good, 'data-rf-details="shipping"', 'data-rf-details="shipping" open'), /the "shipping" section is open/);
    assert.match(problems(good, '<a href="/fly-hook-size-chart/">See the hook size chart</a>', ''), /doesn't link to \/fly-hook-size-chart\//);
});

test('fails a weight row, and stock\'s carousel or tabs back in place of the grid', async () => {
    const good = await page();
    assert.match(problems(good, '<dl class="productView-info">', '<dl class="productView-info"><dd data-product-weight>0.05 Grams</dd>'), /a weight row/);
    assert.match(problems(good, '<ul class="productGrid rf-related-grid"', '<ul class="productGrid rf-related-grid" data-slick="{}"'), /are a carousel/);
    assert.match(problems(good, '<section class="rf-related"', '<div id="tab-related"></div><section class="rf-related"'), /tabs are back/);
});
