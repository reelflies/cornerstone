// Tests the home page's stock-strip assertion (ticket 47): home-no-stock-strips, on home pages
// rendered from templates/pages/home.html with and without the store's featured, most popular
// and new products, and config.json's three homepage_*_count settings.
//
//   node --test scripts/qa/raw-html/assertions/home-no-stock-strips.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial, themeConfig } from '../../render/render.mjs';
import { loadAssertions } from '../../raw-html.mjs';
import noStrips, { stockStrips } from './home-no-stock-strips.mjs';

const COUNTS = ['homepage_featured_products_count', 'homepage_top_products_count', 'homepage_new_products_count'];
const LAYOUT = '{{#block "hero"}}{{/block}}{{#block "page"}}{{/block}}';
const product = id => ({
    id, name: `Fly ${id}`, url: `/fly-${id}/`, add_to_cart_url: `/cart.php?action=add&product_id=${id}`, image: null, price: { without_tax: { formatted: '$0.95', value: 0.95 } }, show_cart_action: true,
});
const home = products => renderPartial('pages/home', { products }, { overrides: { 'layout/base': LAYOUT }, strict: false });

test('it is registered for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-no-stock-strips'));
    assert.deepEqual(noStrips.pages, ['home']);
});

test('each stock strip fails the home page, and the home page without them passes', async () => {
    assert.deepEqual(stockStrips(await home({})), []);
    const strips = await home({ featured: [product(1)], top_sellers: [product(2)], new: [product(3)] });
    const problems = stockStrips(strips);
    assert.deepEqual(problems.map(problem => problem.match(/stock (.+) strip/)[1]), ['featured products', 'most popular products', 'new products']);
});

test('config.json turns all three strips off in the base settings ("Disable"), and no variation turns one back on', () => {
    const config = themeConfig('ReelFlies CA');
    for (const key of COUNTS) assert.equal(config.settings[key], 0, key);
    for (const { name } of config.variations) {
        const { settings } = themeConfig(name);
        for (const key of COUNTS) assert.equal(settings[key], 0, `${name}: ${key}`);
    }
});
