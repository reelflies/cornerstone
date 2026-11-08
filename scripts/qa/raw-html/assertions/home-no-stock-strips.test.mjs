// Tests the home page's stock-strip assertion (ticket 47; redesign step 2): home-no-stock-strips,
// on each stock strip partial rendered with a product, on the redesign's home page with the
// store's best sellers (which lay on the stone, not in a stock strip), and config.json's three
// homepage_*_count settings.
//
//   node --test scripts/qa/raw-html/assertions/home-no-stock-strips.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial, themeConfig } from '../../render/render.mjs';
import { loadAssertions } from '../../raw-html.mjs';
import { homePage } from '../home-fixture.mjs';
import noStrips, { stockStrips } from './home-no-stock-strips.mjs';

const COUNTS = ['homepage_featured_products_count', 'homepage_top_products_count', 'homepage_new_products_count'];
const product = id => ({
    id, name: `Fly ${id}`, url: `/fly-${id}/`, add_to_cart_url: `/cart.php?action=add&product_id=${id}`, image: null, price: { without_tax: { formatted: '$0.95', value: 0.95 } }, show_cart_action: true,
});
// Each stock strip, as the stock home page rendered it (components/products/featured, top and new).
const STRIPS = [['components/products/featured', 'featured products'], ['components/products/top', 'most popular products'], ['components/products/new', 'new products']];

test('it is registered for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-no-stock-strips'));
    assert.deepEqual(noStrips.pages, ['home']);
});

test('each stock strip fails the home page', async () => {
    for (const [partial, name] of STRIPS) {
        const html = await renderPartial(partial, { products: [product(1)], columns: 4 }, { strict: false }); // eslint-disable-line no-await-in-loop
        assert.deepEqual(stockStrips(html).map(problem => problem.match(/stock (.+) strip/)[1]), [name], partial);
    }
});

test('the redesign\'s home with the store\'s best sellers passes: they lay on the stone, in no stock strip', async () => {
    const page = await homePage();
    assert.ok(page.html.includes('data-rf-lay'), 'the best sellers are on the page');
    assert.deepEqual(stockStrips(page.html), []);
    assert.deepEqual(noStrips.check(page), []);
});

test('config.json turns all three strips off in the base settings ("Disable"), and no variation turns one back on', () => {
    const config = themeConfig('ReelFlies CA');
    for (const key of COUNTS) assert.equal(config.settings[key], 0, key);
    for (const { name } of config.variations) {
        const { settings } = themeConfig(name);
        for (const key of COUNTS) assert.equal(settings[key], 0, `${name}: ${key}`);
    }
});
