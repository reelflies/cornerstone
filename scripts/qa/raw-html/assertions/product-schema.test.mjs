// Tests the product-schema assertion (ticket 40; spec module 23; R10, SEO-9; story 75): one
// Product block with exactly one Offer, and the brand marked up exactly when the product view
// names one, on the product page the templates render from the fixture page's product, on the
// harness's own fixture page, and on hand-made breakages.
//
//   node --test scripts/qa/raw-html/assertions/product-schema.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, readFixture, renderPartial } from '../../render/render.mjs';
import productSchema from './product-schema.mjs';

const { page_context: CONTEXT } = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json'));
const BRAND = { name: 'ReelFlies', url: 'https://reelflies.ca/reelflies-2/' };
const page = async (product = {}) => ({
    kind: 'product',
    key: 'product',
    path: '/',
    status: 200,
    html: await renderPartial('pages/product', { ...CONTEXT, product: { ...CONTEXT.product, ...product } }),
});
const problems = (good, from, to) => productSchema.check({ ...good, html: good.html.replace(from, to) }).join('\n');
const harnessFixture = name => ({
    kind: 'product', key: 'product', path: '/', status: 200, html: fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/raw-html/fixtures', name), 'utf8'),
});

test('applies to product pins, ticket 40', () => {
    assert.deepEqual(productSchema.pages, ['product']);
    assert.equal(productSchema.ticket, 40);
});

test('passes the rendered page, with and without a brand, reviews or a SKU, and the harness\'s product page', async () => {
    assert.deepEqual(productSchema.check(await page()), []);
    assert.deepEqual(productSchema.check(await page({ brand: BRAND })), []);
    assert.deepEqual(productSchema.check(await page({ reviews: { total: 0 }, num_reviews: 0, sku: '' })), []);
    assert.deepEqual(productSchema.check(harnessFixture('good-product.html')), []);
});

test('leaves a block that doesn\'t parse to json-ld-parses', () => {
    assert.deepEqual(productSchema.check(harnessFixture('broken-json-ld.html')), []);
});

test('fails a page with no Product block, or two (story 75)', async () => {
    const good = await page();
    const block = good.html.match(/<script type="application\/ld\+json">\s*\{\s*"@context": "https:\/\/schema.org\/",\s*"@type": "Product"[\s\S]*?<\/script>/)[0];
    assert.match(problems(good, block, ''), /0 Product blocks in the JSON-LD, not one/);
    assert.match(problems(good, block, `${block}${block}`), /2 Product blocks in the JSON-LD, not one/);
});

test('fails anything but exactly one Offer: none, a list of two, or an AggregateOffer (criterion 5)', async () => {
    const good = await page();
    assert.match(problems(good, /"offers": \{/, '"notOffers": {'), /the Product has no offers/);
    assert.match(problems(good, /"offers": \{([\s\S]*?)"priceValidUntil": "([^"]*)"\s*\}/, '"offers": [{$1"priceValidUntil": "$2"}, {$1"priceValidUntil": "$2"}]'), /2 offers, not one Offer/);
    assert.match(problems(good, '"@type": "Offer"', '"@type": "AggregateOffer"'), /an AggregateOffer, not one Offer/);
});

test('fails an Offer with no price or currency', async () => {
    const good = await page();
    assert.match(problems(good, /"priceCurrency": "[^"]*"/, '"priceCurrency": ""'), /the Offer has no priceCurrency/);
    assert.match(problems(good, /"price": "[^"]*"/, '"price": ""'), /the Offer has no price/);
});

test('fails a brand the page doesn\'t show, a shown brand not marked up, or another name (ticket 18\'s brand; criterion 7)', async () => {
    const plain = await page();
    const branded = await page({ brand: BRAND });
    assert.match(problems(plain, /"url" : "[^"]*",\n/, m => `${m}        "brand": { "@type": "Brand", "name": "ReelFlies" },\n`), /a brand \("ReelFlies"\) in the JSON-LD, but the product view names none/);
    assert.match(problems(branded, /"brand": \{[\s\S]*?\},/, ''), /the product view names the brand "ReelFlies", but the JSON-LD has none/);
    assert.match(problems(branded, /"name": "ReelFlies"\s*\}/, '"name": "Reel Flies" }'), /the JSON-LD's brand is "Reel Flies", the product view's "ReelFlies"/);
    assert.match(problems(branded, /"@type": "Brand",/, ''), /the brand isn't a Brand/);
});
