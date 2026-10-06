// What the pinned pages in scripts/qa/pages.mjs make the gates see: the status each pin
// must return, and which parts of a page the screenshot diffs mask.
//
//   node --test scripts/qa/pages.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, expectedStatus, masksFor } from './pages.mjs';

describe('the status a pinned page must return', () => {
    it('is 404 for the 404 template and 200 for every other one', () => {
        assert.equal(expectedStatus('404'), 404);
        for (const template of ['home', 'product', 'category', 'cart', 'brand', 'fly-type']) assert.equal(expectedStatus(template), 200);
    });
});

describe('the screenshot masks', () => {
    const LIVE = ['.price-section', '[data-product-stock]', '.productView-rating', '.countPill', '.cart-total-value'];
    const CARDS_AND_LISTS = ['.productGrid', '.productCarousel', '.card', '.card-title', '.card-image', '#tab-related', '#tab-similar'];
    const pinned = Object.entries(CHANNELS).flatMap(([channel, { pages }]) => Object.keys(pages).map(template => [channel, template]));

    it('hide prices, stock, ratings and cart counts on every pinned page', () => {
        for (const [channel, template] of pinned) {
            for (const selector of LIVE) assert.ok(masksFor(channel, template).includes(selector), `${selector} on ${channel} ${template}`);
        }
    });

    it('leave product cards, grids and carousels visible, so a change to them fails a diff', () => {
        for (const template of ['home', 'brand', 'cart', '404', 'product', 'category', 'fly-type', 'species']) {
            const masks = masksFor('1895766', template);
            for (const selector of CARDS_AND_LISTS) assert.ok(!masks.includes(selector), `${selector} is masked on 1895766 ${template}`);
        }
    });

    it('hide channel 1\'s live product list and related products, which aren\'t pinned, only on its own pages', () => {
        assert.ok(masksFor('1', 'category').includes('.productGrid'));
        assert.ok(masksFor('1', 'product').includes('#tab-related'));
        assert.ok(masksFor('1', 'product').includes('#tab-similar'));
        assert.ok(!masksFor('1', 'product').includes('.productGrid'));
    });
});
