// Tests the product-page assertion (ticket 39; redesign step 3; O14, O23, R6, SEO-8; stories 44
// to 48 and 70) on the product page the templates render from the fixture page's product (the
// reference's Adams Parachute and its four related patterns, render/partials/product-page/
// context.mjs), and on hand-made breakages of it.
//
//   node --test scripts/qa/raw-html/assertions/product-page.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { TWO_OPTIONS, productPage } from '../../render/partials/product-page/context.mjs';
import productPageCheck, { CHART_PATH } from './product-page.mjs';

const page = async (options = {}) => ({
    kind: 'product', key: 'product', path: '/', status: 200, html: await productPage(options),
});
const problems = (good, from, to) => productPageCheck.check({ ...good, html: good.html.replace(from, to) }).join('\n');
const MAIN = /<img class="productView-image--default rf-pdp__photo" src="[^"]*" srcset="[^"]*" sizes="[^"]*" width="760" height="507" alt="[^"]*" fetchpriority="high" decoding="async" data-main-image>/;

test('applies to product pins, ticket 39, and names the hook chart\'s default path', () => {
    assert.deepEqual(productPageCheck.pages, ['product']);
    assert.equal(productPageCheck.ticket, 39);
    assert.equal(CHART_PATH, '/fly-hook-size-chart/');
});

test('passes the rendered product page: the picker, one row, or stock\'s form; with and without related products, a description or a photo; gear; and with no threshold (ReelFlies US)', async () => {
    assert.deepEqual(productPageCheck.check(await page()), []);
    assert.deepEqual(productPageCheck.check(await page({ product: { options: [] } })), [], 'no options: one row');
    assert.deepEqual(productPageCheck.check(await page({ product: { options: TWO_OPTIONS } })), [], 'two options: stock\'s form shown');
    assert.deepEqual(productPageCheck.check(await page({ product: { related_products: [] } })), []);
    assert.deepEqual(productPageCheck.check(await page({ product: { description: '' } })), []);
    assert.deepEqual(productPageCheck.check(await page({ product: { main_image: null, images: [] } })), [], 'the default image');
    assert.deepEqual(productPageCheck.check(await page({ product: { category: ['Fly Gear/Fly Boxes'] } })), [], 'gear: no "Hooks and tying"');
    assert.deepEqual(productPageCheck.check(await page({ theme: { rf_ship_free_threshold: '' } })), [], 'no threshold: no shipping line or section');
    assert.deepEqual(productPageCheck.check(await page({ settings: { hide_price_from_guests: true } })), [], 'prices hidden: the form, no unit, the hooks section still there');
});

test('judges only a page with a product view, as the harness\'s fixture pages have none', async () => {
    assert.deepEqual(productPageCheck.check({ ...(await page()), html: '<html><body><main><h1>A product</h1></main></body></html>' }), []);
    const good = await page();
    assert.match(problems(good, 'productView-details product-data rf-pdp__buy', 'productView-details product-data rf-pdp__bought'), /0 buy panels/, 'a product view without its panel fails');
});

test('fails a main image that waits: lazysizes, loading="lazy", no priority, no srcset or no dimensions', async () => {
    const good = await page();
    assert.match(good.html, MAIN);
    assert.match(problems(good, 'class="productView-image--default rf-pdp__photo"', 'class="productView-image--default lazyload"'), /loads through lazysizes/);
    assert.match(problems(good, 'decoding="async" data-main-image', 'decoding="async" loading="lazy" data-main-image'), /is loading="lazy"/);
    assert.match(problems(good, 'fetchpriority="high" decoding="async" data-main-image', 'decoding="async" data-main-image'), /no fetchpriority="high"[\s\S]*0 elements with fetchpriority="high"/);
    assert.match(problems(good, /srcset="[^"]*1520w"/, 'srcset="data:image/gif;base64,R0lGOD 1w"'), /no real srcset/);
    assert.match(problems(good, /width="760" height="507" alt/, 'alt'), /no width and height/);
    assert.match(problems(good, /sizes="\(min-width: 1040px\) 54vw, calc\(100vw - 32px\)"/, ''), /no sizes/);
    assert.match(problems(good, /(data-main-image>)/, '$1<img src="x.jpg" fetchpriority="high" data-main-image>'), /2 main images/);
});

test('fails a second fetchpriority="high" on the page, a related photo\'s included (SEO-8; O23)', async () => {
    const good = await page();
    assert.match(problems(good, /(<a class="rf-fly__photo"[^>]*><img src="[^"]*"[^>]*?) loading="lazy"/, '$1 fetchpriority="high"'), /2 elements with fetchpriority="high"[\s\S]*related card 1's photo isn't loading="lazy"[\s\S]*related card 1's photo has a fetchpriority/);
});

test('fails the buy panel without its H1 or form, the picker beside a shown form, a hidden form with no picker, and a shipping line or promise out of place', async () => {
    const good = await page();
    assert.match(problems(good, /<h1 class="productView-title rf-pdp__title" id="rf-pdp-title">[^<]*<\/h1>/, '<p>Adams</p>'), /doesn't hold the page's <h1>/);
    assert.match(problems(good, 'data-cart-item-add', 'data-cart-item-added'), /doesn't hold the buy form/);
    assert.match(problems(good, '<div class="rf-pdp__form" hidden data-rf-pdp-form>', '<div class="rf-pdp__form">'), /the picker and stock's form are both shown/);
    const two = await page({ product: { options: TWO_OPTIONS } });
    assert.match(problems(two, '<div class="rf-pdp__form">', '<div class="rf-pdp__form" hidden>'), /no picker, and stock's form hidden/);
    assert.match(problems(good, 'fly orders over <span class="rf-num">$60</span>.', 'fly orders over ${threshold}.'), /the shipping line carries a placeholder/);
    assert.match(problems(good, /<p class="rf-pdp__ship">[\s\S]*?<\/p>/, '<p class="rf-pdp__ship">Standard shipping in Canada $X.XX.</p>'), /placeholder/);
    const promise = /<p class="rf-pdp__promise">[^<]*<\/p>/;
    const [line] = good.html.match(promise);
    const moved = good.html.replace(promise, '').replace('<div class="rf-pick rf-pick--page"', `${line}<div class="rf-pick rf-pick--page"`);
    assert.match(productPageCheck.check({ ...good, html: moved }).join('\n'), /the promise line isn't under the buying/);
    assert.match(problems(good, promise, ''), /no promise line/);
});

test('fails details that are missing, before the panel, "About this fly" closed, a closed section open, or without the chart link', async () => {
    const good = await page();
    assert.match(problems(good, '<div class="rf-details">', '<div class="rf-detail">'), /no details under the photographs/);
    assert.match(problems(good, '<details class="rf-details__item" open>', '<details class="rf-details__item">'), /"About this fly" isn't open/);
    assert.match(problems(good, /<details class="rf-details__item">(\s*<summary class="rf-details__summary">Shipping and delivery)/, '<details class="rf-details__item" open>$1'), /the "Shipping and delivery" section is open/);
    assert.match(problems(good, /<a class="rf-more" href="\/fly-hook-size-chart\/">See the hook size chart[\s\S]*?<\/a>/, 'See the hook size chart'), /doesn't link to the hook size chart/);
    const details = good.html.match(/<div class="rf-details">[\s\S]*?<\/details>\s*<\/div>/)[0];
    const before = good.html.replace(details, '').replace('<section class="productView-details', `${details}<section class="productView-details`);
    assert.match(productPageCheck.check({ ...good, html: before }).join('\n'), /the details come before the buy panel/);
});

test('fails a fly ("/ fly" by its price) without "Hooks and tying", and a shipping line without "Shipping and delivery"', async () => {
    const good = await page();
    assert.match(problems(good, '<summary class="rf-details__summary">Hooks and tying', '<summary class="rf-details__summary">Hooks'), /no "Hooks and tying" section, though the price says "\/ fly"/);
    assert.match(problems(good, '<summary class="rf-details__summary">Shipping and delivery', '<summary class="rf-details__summary">Shipping'), /no "Shipping and delivery" section, though the buy panel has the shipping line/);
    const gear = await page({ product: { category: ['Fly Gear/Fly Boxes'] } });
    assert.match(problems(gear, '<p class="rf-pdp__ship">', '<span class="rf-pdp__unit">/ fly</span><p class="rf-pdp__ship">'), /no "Hooks and tying" section/);
});

test('fails a weight row, and stock\'s carousel or tabs back in place of the grid', async () => {
    const good = await page();
    assert.match(problems(good, '<dl class="productView-info rf-pdp__info">', '<dl class="productView-info rf-pdp__info"><dd data-product-weight>0.05 Grams</dd>'), /a weight row/);
    assert.match(problems(good, '<ul class="rf-flies rf-flies--list rf-flies--related" data-rf-grid', '<ul class="rf-flies rf-flies--list rf-flies--related" data-rf-grid data-slick="{}"'), /are a carousel/);
    assert.match(problems(good, 'data-rf-grid data-list-name="Related Products"', 'data-list-name="Related Products"'), /aren't a grid of specimen cards/);
    assert.match(problems(good, '<section class="rf-pdp-related"', '<div id="tab-related"></div><section class="rf-pdp-related"'), /tabs are back/);
});
