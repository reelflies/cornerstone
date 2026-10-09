// Tests the size-pills assertion (ticket 37; O14, O15, R9; stories 37, 68 and 70) on product views
// the templates render from a small product context, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/size-pills.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial } from '../../render/render.mjs';
import sizePills from './size-pills.mjs';

const value = (id, label, selected = false) => ({
    id, label, selected, data: label,
});
const SIZES = {
    id: 117, display_name: 'Fly Sizes', partial: 'set-rectangle', required: true, values: [value(301, '12'), value(302, '14', true), value(303, '16')],
};
const product = options => ({
    id: 4877, title: 'Adams Parachute', cart_url: '/cart.php', url: '/adams-parachute/', images: [], options, can_purchase: true, show_quantity_input: true, min_purchase_quantity: 1, price: {},
});
const page = async options => ({
    kind: 'product', key: 'product', path: '/', status: 200, html: await renderPartial('components/products/product-view', { product: product(options), settings: {}, theme_settings: {} }),
});
const problems = (good, from, to) => sizePills.check({ ...good, html: good.html.replace(from, to) }).join('\n');

test('applies to product pins, ticket 37', () => {
    assert.deepEqual(sizePills.pages, ['product']);
    assert.equal(sizePills.ticket, 37);
});

test('passes the rendered product view: several sizes, one size, and no options', async () => {
    assert.deepEqual(sizePills.check(await page([SIZES])), []);
    assert.deepEqual(sizePills.check(await page([{ ...SIZES, values: [value(301, '12')] }])), []);
    assert.deepEqual(sizePills.check(await page([])), []);
});

test('fails hidden options, a size checked for the shopper, and a group without its own label', async () => {
    const good = await page([SIZES]);
    assert.match(problems(good, '<div data-product-option-change>', '<div data-product-option-change style="display:none;">'), /options container is hidden/);
    assert.match(problems(good, 'value="302"', 'value="302" checked'), /a size group with 3 sizes has one checked/);
    assert.match(problems(good, /aria-labelledby="rf-option-4877-117-label"/, 'aria-labelledby="rectangle-group-label"'), /not an id of its own/);
    assert.match(problems(good, 'id="rf-option-4877-117-label"', 'id="other"'), /is on 0 elements, not one/);
});

test('fails a size group without its one "Hook size guide" link, and stock\'s rectangle markup come back', async () => {
    const good = await page([SIZES]);
    assert.match(problems(good, /<a class="rf-pills-guide"[^>]*>[^<]*<\/a>/, ''), /the size group has 0 links to \/fly-hook-size-chart\//);
    assert.match(problems(good, 'data-rf-pills="size"', ''), /stock's markup/);
    assert.match(problems(good, 'id="rf-option-4877-117-label"', 'id="rectangle-group-label"'), /stock's markup/);
});
