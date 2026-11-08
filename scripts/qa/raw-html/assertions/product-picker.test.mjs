// Tests the product-picker assertion (redesign step 3; tickets 37 and 38's rule that nothing is
// chosen for the shopper) on the product page the templates render from the fixture page's
// product (render/partials/product-page/context.mjs): the picker, one row, and stock's form for
// two options, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/product-picker.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { TWO_OPTIONS, productPage } from '../../render/partials/product-page/context.mjs';
import productPicker from './product-picker.mjs';

const page = async (options = {}) => ({
    kind: 'product', key: 'product', path: '/', status: 200, html: await productPage(options),
});
const problems = (good, from, to) => productPicker.check({ ...good, html: good.html.replace(from, to) }).join('\n');
const FIELD = /<input class="rf-qty__input"[^>]*value="0"[^>]*data-rf-label="12"[^>]*>/;

test('applies to product pins, ticket 37', () => {
    assert.deepEqual(productPicker.pages, ['product']);
    assert.equal(productPicker.ticket, 37);
    assert.equal(productPicker.id, 'product-picker');
});

test('passes the rendered page: the picker with a sold-out size, one row for no options, and stock\'s form for two options', async () => {
    assert.deepEqual(productPicker.check(await page({ stock: { soldOut: ['20'] } })), []);
    assert.deepEqual(productPicker.check(await page({ product: { options: [] } })), []);
    assert.deepEqual(productPicker.check(await page({ product: { options: TWO_OPTIONS } })), []);
    assert.deepEqual(productPicker.check(await page({ product: { pre_order: true } })), [], 'a pre-order: the form');
});

test('judges only a page with a product view, as the harness\'s fixture pages have none', async () => {
    assert.deepEqual(productPicker.check({ ...(await page()), html: '<html><body><main><h1>A product</h1></main></body></html>' }), []);
});

test('fails a quantity the server set, a "−" enabled at 0, or anything checked in the picker', async () => {
    const good = await page();
    assert.match(good.html, FIELD);
    assert.match(problems(good, FIELD, match => match.replace('value="0"', 'value="2"')), /a quantity field reads "2", not 0/);
    assert.match(problems(good, /(data-rf-qty-step="-1"[^>]*) disabled>/, '$1>'), /a "−" is enabled at 0/);
    assert.match(problems(good, FIELD, match => match.replace('value="0"', 'value="0" checked')), /checked or pressed before the shopper chose/);
});

test('fails a row without its variant or stock, a sold-out row with a stepper or without its words, and a picker with no row', async () => {
    const good = await page({ stock: { soldOut: ['20'] } });
    assert.match(problems(good, 'data-rf-label="12" data-rf-variant="50002" data-rf-stock="1"', 'data-rf-label="12" data-rf-variant="" data-rf-stock="1"'), /row 12 names no variant/);
    assert.match(problems(good, 'data-rf-label="12" data-rf-variant="50002" data-rf-stock="1"', 'data-rf-label="12" data-rf-variant="50002" data-rf-stock="yes"'), /row 12's stock is "yes", not 0 or 1/);
    assert.match(problems(good, '<span class="rf-pick__sold">Sold out</span>', '<span class="rf-pick__sold">Sold out</span><button type="button" data-rf-qty-step="1">+</button>'), /row 20 is sold out and has a stepper/);
    assert.match(problems(good, '<span class="rf-pick__sold">Sold out</span>', '<span class="rf-pick__sold"></span>'), /row 20 is sold out and doesn't say so/);
    assert.match(problems(good, /<ul class="rf-pick__rows"[^>]*>[\s\S]*?<\/ul>/, '<ul class="rf-pick__rows" data-rf-rows></ul>'), /a picker with no row/);
    assert.match(problems(good, 'data-rf-mode="sizes"', 'data-rf-mode="strip"'), /mode is "strip"/);
    const one = await page({ product: { options: [] } });
    const row = one.html.match(/<li class="rf-pick__row rf-pick__row--one"[\s\S]*?<\/li>/)[0];
    assert.match(problems(one, row, `${row}${row}`), /2 rows in a picker for a product with no options/);
});

test('fails the form shown beside the picker, hidden with no picker, or two pickers', async () => {
    const good = await page();
    assert.match(problems(good, '<div class="rf-pdp__form" hidden data-rf-pdp-form>', '<div class="rf-pdp__form">'), /stock's form is shown beside the picker/);
    const two = await page({ product: { options: TWO_OPTIONS } });
    assert.match(problems(two, '<div class="rf-pdp__form">', '<div class="rf-pdp__form" hidden>'), /stock's form is hidden with no picker/);
    const picker = good.html.match(/<div class="rf-pick rf-pick--page"[\s\S]*?<p class="rf-pick__inbox" data-rf-pick-inbox><\/p>\s*<\/div>/)[0];
    assert.match(problems(good, picker, `${picker}${picker}`), /2 size pickers/);
});

test('fails a size checked for the shopper in the shown form (the catalogue\'s default), and lets a single-value group be', async () => {
    const two = await page({ product: { options: TWO_OPTIONS } });
    assert.match(two.html, /name="attribute\[29102\]"\s+value="30104"/);
    assert.match(problems(two, /(name="attribute\[29102\]"\s+value="30104")/, '$1 checked data-default'), /the option attribute\[29102\] has 2 values and one checked \(30104\) before the shopper chose/);
    const single = TWO_OPTIONS.map(option => (option.display_name === 'Fly Sizes' ? { ...option, values: [{ ...option.values[0], selected: true }] } : option));
    assert.deepEqual(productPicker.check(await page({ product: { options: single } })), [], 'one size checked is no choice');
    const hidden = await page({ product: { options: [{ ...TWO_OPTIONS[1], values: TWO_OPTIONS[1].values.map((value, index) => ({ ...value, selected: index === 0 })) }] } });
    assert.deepEqual(productPicker.check(hidden), [], 'a default checked in the hidden form behind the picker is stock\'s');
});
