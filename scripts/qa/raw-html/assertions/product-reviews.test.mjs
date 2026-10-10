// Tests the product-reviews assertion (ticket 40; R11, SEO-5; stories 47 and 75) on the product
// page the templates render from the fixture page's product (the reference's Adams Parachute,
// with its three sample reviews and with none), and on hand-made breakages of it: stock's JSON-LD
// with no section, which criterion 3 is about, among them.
//
//   node --test scripts/qa/raw-html/assertions/product-reviews.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, readFixture, renderPartial } from '../../render/render.mjs';
import productReviews from './product-reviews.mjs';

const { page_context: CONTEXT } = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json'));
const NO_REVIEWS = { reviews: { total: 0 }, num_reviews: 0, rating: 0 };
const page = async ({ product = {}, theme = {}, settings = {} } = {}) => ({
    kind: 'product',
    key: 'product',
    path: '/',
    status: 200,
    html: await renderPartial('pages/product', {
        ...CONTEXT,
        product: { ...CONTEXT.product, ...product },
        settings: { ...CONTEXT.settings, ...settings },
        theme_settings: { ...CONTEXT.theme_settings, ...theme },
    }),
});
const problems = (good, from, to) => productReviews.check({ ...good, html: good.html.replace(from, to) }).join('\n');
// Stock schema.html's own wrap, which read the store's review setting alone (criterion 3).
const STOCK_SCHEMA = fs.readFileSync(path.join(THEME_DIR, 'templates/components/products/schema.html'), 'utf8')
    .replace(/\{\{#all settings\.show_product_reviews theme_settings\.show_product_reviews product\.reviews\.list\.length\}\}(\{\{!--[\s\S]*?--\}\})?/, '{{#and settings.show_product_reviews product.reviews.list.length}}')
    .replace('{{/all}}', '{{/and}}');

test('applies to product pins, ticket 40', () => {
    assert.deepEqual(productReviews.pages, ['product']);
    assert.equal(productReviews.ticket, 40);
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
    assert.match(problems(good, /<section class="rf-reviews"[\s\S]*?<\/section>/, ''), /aggregateRating in the JSON-LD with no reviews section/);
});

test('fails JSON-LD that counts other reviews than the section shows', async () => {
    const good = await page();
    assert.match(problems(good, '"reviewCount": "3"', '"reviewCount": "4"'), /reviewCount 4, but the section says Reviews \(3\)/);
    assert.match(problems(good, /<li class="rf-review" data-rf-review>[\s\S]*?<\/li>/, ''), /3 reviews in the JSON-LD, 2 in the section/);
    assert.match(problems(good, '"datePublished": "2026-06-03"', '"datePublished": "3rd Jun 2026"'), /datePublished "3rd Jun 2026" isn't an ISO 8601 date/);
});

test('fails a section past five reviews, without its id, heading or titles, or a second section (R11)', async () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
        name: `Sample ${i}`, rating: '5', title: `Sample ${i}`, text: 'Sample.', date: '1st May 2026',
    }));
    assert.match(productReviews.check(await page({ product: { reviews: { total: 6, list: six }, num_reviews: 6 } })).join('\n'), /6 reviews in the section, more than 5/);
    const good = await page();
    assert.match(problems(good, 'id="product-reviews"', 'id="reviews"'), /the reviews section isn't id="product-reviews"/);
    assert.match(problems(good, /<h2 class="rf-reviews-heading"[^>]*>Reviews \(3\)<\/h2>/, '<h2 class="rf-reviews-heading">Reviews</h2>'), /the section's heading reads "Reviews", not "Reviews \(3\)"/);
    assert.match(problems(good, /<h3 class="rf-review-title">[^<]*<\/h3>/, ''), /a review with no <h3> title/);
    const section = good.html.match(/<section class="rf-reviews"[\s\S]*?<\/section>/)[0];
    assert.match(problems(good, section, `${section}${section}`), /2 reviews sections/);
});

test('fails a star summary that is missing, doesn\'t link to the section, counts another number, or sits outside the buy box', async () => {
    const good = await page();
    assert.match(problems(good, /<p class="rf-review-summary"[\s\S]*?<\/p>/, ''), /no star summary \(data-rf-review-summary\) in the buy box/);
    assert.match(problems(good, 'href="#product-reviews"', 'href="#reviews"'), /the star summary doesn't link to #product-reviews/);
    assert.match(problems(good, /(data-rf-review-count[^>]*>)3 reviews/, '$14 reviews'), /the star summary says 4, the section 3/);
    const none = await page({ product: NO_REVIEWS });
    const summary = good.html.match(/<p class="rf-review-summary"[\s\S]*?<\/p>/)[0];
    assert.match(problems(none, '<p class="rf-ship-line"', `${summary}<p class="rf-ship-line"`), /a star summary with no reviews section/);
    const moved = good.html.replace(summary, '').replace('<div class="rf-related"', `${summary}<div class="rf-related"`).replace('<section class="rf-related"', `${summary}<section class="rf-related"`);
    assert.match(productReviews.check({ ...good, html: moved }).join('\n'), /no star summary \(data-rf-review-summary\) in the buy box/);
});

test('fails a page that has the review form but doesn\'t offer "Write a review" once, or offers it without the form', async () => {
    const none = await page({ product: NO_REVIEWS });
    assert.match(problems(none, /<div class="rf-reviews rf-reviews--empty"[\s\S]*?<\/div>/, ''), /the review form is on the page, but 0 controls open it/);
    const good = await page();
    assert.match(problems(good, /<div id="modal-review-form"[\s\S]*$/, '</body></html>'), /1 control opens the review form, which isn't on the page/);
    const button = good.html.match(/<button type="button" class="rf-reviews-write"[^>]*>[^<]*<\/button>/)[0];
    assert.match(problems(good, button, `${button}${button}`), /the review form is on the page, but 2 controls open it, not one/);
});

test('fails the no-reviews block on a product whose JSON-LD marks up reviews', async () => {
    const good = await page();
    assert.match(problems(good, /<section class="rf-reviews"[\s\S]*?<\/section>/, '<div class="rf-reviews rf-reviews--empty" data-rf-reviews-empty><p class="rf-reviews-none">No reviews yet for this fly.</p><button type="button" class="rf-reviews-write" data-reveal-id="modal-review-form" data-rf-review-write>Write a review</button></div>'), /aggregateRating in the JSON-LD with no reviews section/);
});
