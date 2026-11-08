// Tests the product-reviews assertion (ticket 40; redesign step 3; R11, SEO-5; stories 47 and 75)
// on the product page the templates render from the fixture page's product (the reference's Adams
// Parachute, with its three sample reviews and with none; render/partials/product-page/
// context.mjs), and on hand-made breakages of it: stock's JSON-LD with no section, which
// criterion 3 is about, among them.
//
//   node --test scripts/qa/raw-html/assertions/product-reviews.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import { CONTEXT, productPage } from '../../render/partials/product-page/context.mjs';
import { CHANNELS } from '../../pages.mjs';
import productReviews, { NO_REVIEWS_PIN, REVIEWS_OFF_OVERLAY, REVIEWS_PIN } from './product-reviews.mjs';

const NO_REVIEWS = { reviews: { total: 0 }, num_reviews: 0, rating: 0 };
// A product page under a key no pin rule names, unless `key` is given: the pins' own rules
// (product@reviews, product) have their tests below.
const page = async ({ key = 'product@sample', ...options } = {}) => ({
    kind: 'product', key, path: '/', status: 200, html: await productPage(options),
});
const problems = (good, from, to, options) => productReviews.check({ ...good, html: good.html.replace(from, to) }, options).join('\n');
const BUTTON = /<button type="button" class="rf-reviews__write" data-reveal-id="modal-review-form">[^<]*<\/button>/;
const FORM = /<div id="modal-review-form"[\s\S]*$/;
const SECTION = /<section class="rf-reviews" id="product-reviews"[\s\S]*?<\/section>/;
const EMPTY_BLOCK = /<div class="rf-reviews rf-reviews--none" id="product-reviews">[\s\S]*?<\/div>/;
const SUMMARY = /<p class="rf-review-sum">[\s\S]*?<\/p>/;
// The page with "Write a review" and stock's review form both gone, which the page-wide rule
// (the form exactly when one control opens it) passes.
const withoutWrite = good => ({ ...good, html: good.html.replace(BUTTON, '').replace(FORM, '</body></html>') });
// Stock schema.html's own wrap, which read the store's review setting alone (criterion 3).
const STOCK_SCHEMA = fs.readFileSync(path.join(THEME_DIR, 'templates/components/products/schema.html'), 'utf8')
    .replace(/\{\{#all settings\.show_product_reviews theme_settings\.show_product_reviews product\.reviews\.list\.length\}\}(\{\{!--[\s\S]*?--\}\})?/, '{{#and settings.show_product_reviews product.reviews.list.length}}')
    .replace('{{/all}}', '{{/and}}');

test('applies to product pins, ticket 40, and names its two pins and the overlay that hides reviews', () => {
    assert.deepEqual(productReviews.pages, ['product']);
    assert.equal(productReviews.ticket, 40);
    assert.equal(REVIEWS_PIN, 'product@reviews');
    assert.equal(NO_REVIEWS_PIN, 'product');
    assert.equal(REVIEWS_OFF_OVERLAY, 'show_product_reviews-off');
    assert.ok(fs.existsSync(path.join(THEME_DIR, `scripts/qa/overlays/${REVIEWS_OFF_OVERLAY}.json`)), 'the overlay exists');
    for (const pin of [REVIEWS_PIN, NO_REVIEWS_PIN]) assert.ok(CHANNELS[1].pages[pin], `channel 1 pins ${pin}`);
});

test('passes the rendered page with reviews, with none, and with the store\'s or the theme\'s review setting off', async () => {
    assert.deepEqual(productReviews.check(await page()), []);
    assert.deepEqual(productReviews.check(await page({ product: NO_REVIEWS })), []);
    assert.deepEqual(productReviews.check(await page({ settings: { show_product_reviews: false } })), []);
    assert.deepEqual(productReviews.check(await page({ theme: { show_product_reviews: false } })), []);
    assert.deepEqual(productReviews.check(await page({ product: { ...NO_REVIEWS, category: ['Fly Gear/Fly Boxes'] } })), []);
});

test('passes a product page with neither a product view nor reviews, as the harness\'s fixture pages', async () => {
    assert.deepEqual(productReviews.check({ ...(await page()), html: '<html><body><main><h1>A product</h1></main></body></html>' }), []);
});

test('fails stock\'s JSON-LD on a page that shows no reviews: the theme setting off (criterion 3) or no section', async () => {
    const off = await page({ theme: { show_product_reviews: false } });
    const stock = await renderPartial('rf-test/stock-schema', { ...CONTEXT, theme_settings: { ...CONTEXT.theme_settings, show_product_reviews: false } }, {
        overrides: { 'rf-test/stock-schema': STOCK_SCHEMA },
    });
    const html = off.html.replace(/<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema.org\/",\s*"@type": "Product"[\s\S]*?<\/script>/, stock);
    assert.notEqual(html, off.html, 'the stock block went in');
    assert.match(productReviews.check({ ...off, html }).join('\n'), /aggregateRating in the JSON-LD with no reviews section[\s\S]*review in the JSON-LD with no reviews section/);
    const good = await page();
    assert.match(good.html, SECTION);
    assert.match(problems(good, SECTION, ''), /aggregateRating in the JSON-LD with no reviews section/);
});

test('fails JSON-LD that counts other reviews than the section shows', async () => {
    const good = await page();
    assert.match(problems(good, '"reviewCount": "3"', '"reviewCount": "4"'), /reviewCount 4, but the section says Reviews \(3\)/);
    assert.match(problems(good, /<li class="rf-review">[\s\S]*?<\/li>/, ''), /3 reviews in the JSON-LD, 2 in the section/);
    assert.match(problems(good, '"datePublished": "2026-06-03"', '"datePublished": "3rd Jun 2026"'), /datePublished "3rd Jun 2026" isn't an ISO 8601 date/);
});

test('fails a section past five reviews, without its id, its "Reviews (N)" heading or its titles, or a second section (R11)', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
        name: `Sample ${i}`, rating: '5', title: `Sample ${i}`, text: 'Sample.', date: '1st May 2026',
    }));
    assert.match(productReviews.check(await page({ product: { reviews: { total: 6, list: six }, num_reviews: 6 } })).join('\n'), /6 reviews in the section, more than 5/);
    const good = await page();
    assert.match(problems(good, '<section class="rf-reviews" id="product-reviews"', '<section class="rf-reviews" id="reviews"'), /the reviews section isn't id="product-reviews"/);
    assert.match(problems(good, /<h2 class="rf-reviews__heading" id="rf-reviews-heading">Reviews \(3\)<\/h2>/, '<h2 class="rf-reviews__heading" id="rf-reviews-heading">Reviews</h2>'), /the section's heading reads "Reviews", not "Reviews \(N\)"/);
    assert.match(problems(good, /<h3 class="rf-review__title">[^<]*<\/h3>/, ''), /a review with no <h3> title/);
    const [section] = good.html.match(SECTION);
    assert.match(problems(good, section, `${section}${section}`), /2 reviews sections/);
});

test('fails a star summary that is missing, doesn\'t link to the section, counts another number, or sits outside the buy panel', async () => {
    const good = await page();
    assert.match(good.html, SUMMARY);
    assert.match(problems(good, SUMMARY, ''), /no star summary \(p\.rf-review-sum\) in the buy panel/);
    assert.match(problems(good, 'href="#product-reviews"', 'href="#reviews"'), /the star summary doesn't link to #product-reviews/);
    assert.match(problems(good, '<span class="rf-review-sum__count">3 reviews', '<span class="rf-review-sum__count">4 reviews'), /the star summary says 4, the section 3/);
    const none = await page({ product: NO_REVIEWS });
    const [summary] = good.html.match(SUMMARY);
    assert.match(problems(none, '<p class="rf-pdp__ship">', `${summary}<p class="rf-pdp__ship">`), /a star summary with no reviews section/);
    const moved = good.html.replace(summary, '').replace('<section class="rf-pdp-related"', `${summary}<section class="rf-pdp-related"`);
    assert.match(productReviews.check({ ...good, html: moved }).join('\n'), /no star summary \(p\.rf-review-sum\) in the buy panel, but 1 elsewhere/);
});

test('fails a page that has the review form but doesn\'t offer "Write a review" once, or offers it without the form, or outside the section and the block', async () => {
    const none = await page({ product: NO_REVIEWS });
    assert.match(none.html, EMPTY_BLOCK);
    assert.match(problems(none, EMPTY_BLOCK, ''), /the review form is on the page, but 0 controls open it/);
    const good = await page();
    assert.match(problems(good, FORM, '</body></html>'), /1 control opens the review form, which isn't on the page/);
    const [button] = good.html.match(BUTTON);
    assert.match(problems(good, button, `${button}${button}`), /the review form is on the page, but 2 controls open it, not one/);
    const outside = good.html.replace(button, '').replace('<section class="rf-pdp-related"', `${button}<section class="rf-pdp-related"`);
    assert.match(productReviews.check({ ...good, html: outside }).join('\n'), /"Write a review" sits outside the reviews section and the no-reviews block/);
});

test('fails the id "product-reviews" on anything but the section or the no-reviews block, and the block on a product whose JSON-LD marks up reviews', async () => {
    const good = await page();
    assert.match(problems(good, SECTION, '<div id="product-reviews"></div>'), /neither the reviews section nor the no-reviews block/);
    assert.match(problems(good, SECTION, '<div class="rf-reviews rf-reviews--none" id="product-reviews"><p class="rf-reviews__none">No reviews yet for this fly.</p><button type="button" class="rf-reviews__write" data-reveal-id="modal-review-form">Write a review</button></div>'), /aggregateRating in the JSON-LD with no reviews section/);
});

test('requires the reviews on product@reviews, the pin with reviews: the section, the summary and its "Write a review" (criterion 1)', async () => {
    const good = await page({ key: REVIEWS_PIN });
    assert.deepEqual(productReviews.check(good), []);
    assert.deepEqual(productReviews.check(good, { overlay: 'rf_quick_add-off' }), [], 'another overlay leaves the reviews on');
    const none = await page({ key: REVIEWS_PIN, product: NO_REVIEWS });
    assert.match(productReviews.check(none).join('\n'), /no reviews section \(\.rf-reviews\) on product@reviews, the pin with reviews/);
    const off = await page({ key: REVIEWS_PIN, theme: { show_product_reviews: false } });
    assert.match(productReviews.check(off).join('\n'), /no reviews section \(\.rf-reviews\) on product@reviews/, 'the theme setting off, with no overlay asking for it');
    assert.match(productReviews.check(withoutWrite(good)).join('\n'), /no "Write a review" in the reviews section on product@reviews/);
});

test('requires product@reviews under the show_product_reviews-off overlay to show no section and "Write a review" alone (criterion 3)', async () => {
    const off = await page({ key: REVIEWS_PIN, theme: { show_product_reviews: false } });
    assert.deepEqual(productReviews.check(off, { overlay: REVIEWS_OFF_OVERLAY }), []);
    const on = await page({ key: REVIEWS_PIN });
    assert.match(productReviews.check(on, { overlay: REVIEWS_OFF_OVERLAY }).join('\n'), /a reviews section on product@reviews under the overlay show_product_reviews-off, which hides reviews/);
    assert.match(productReviews.check(withoutWrite(off), { overlay: REVIEWS_OFF_OVERLAY }).join('\n'), /no "Write a review" in the no-reviews block \(\.rf-reviews--none\) on product@reviews/);
    assert.match(problems(off, '<div class="rf-reviews rf-reviews--none" id="product-reviews">', '<div class="rf-reviews rf-reviews--none" id="product-reviews"><p class="rf-reviews__none">No reviews yet for this fly.</p>', { overlay: REVIEWS_OFF_OVERLAY }), /the no-reviews block says "No reviews yet for this fly\." on product@reviews, which has reviews/);
});

test('requires the no-reviews block and its "Write a review" on product, the pin with none (criterion 2)', async () => {
    const none = await page({ key: NO_REVIEWS_PIN, product: NO_REVIEWS });
    assert.deepEqual(productReviews.check(none), []);
    assert.deepEqual(productReviews.check(await page({ key: NO_REVIEWS_PIN, product: NO_REVIEWS, theme: { show_product_reviews: false } }), { overlay: REVIEWS_OFF_OVERLAY }), []);
    assert.match(productReviews.check(withoutWrite(none)).join('\n'), /no "Write a review" in the no-reviews block \(\.rf-reviews--none\) on product, the pin with no reviews/);
    assert.match(problems(none, EMPTY_BLOCK, ''), /the review form is on the page, but 0 controls open it/, 'the block gone with the form left: the page-wide rule');
    assert.match(productReviews.check({ ...none, html: none.html.replace(EMPTY_BLOCK, '').replace(FORM, '</body></html>') }).join('\n'), /no no-reviews block \(\.rf-reviews--none\) on product, the pin with no reviews/);
    assert.match(productReviews.check(await page({ key: NO_REVIEWS_PIN })).join('\n'), /a reviews section on product, the pin with no reviews: pin a product with none/);
});

test('holds a page with no product view to neither pin\'s rule, as the harness\'s fixture pages', async () => {
    const bare = '<html><body><main><h1>A product</h1></main></body></html>';
    assert.deepEqual(productReviews.check({ ...(await page({ key: REVIEWS_PIN })), html: bare }), []);
    assert.deepEqual(productReviews.check({ ...(await page({ key: NO_REVIEWS_PIN })), html: bare }), []);
});
