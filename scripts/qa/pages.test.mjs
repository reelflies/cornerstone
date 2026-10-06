// What the pinned pages in scripts/qa/pages.mjs make the gates see: the status each pin
// must return, which parts of a page the screenshot diffs mask, and what their stylesheet
// hides or holds at a fixed height.
//
//   node --test scripts/qa/pages.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHANNELS, HIDDEN, expectedStatus, masksFor, screenshotStyle,
} from './pages.mjs';

// The boxes channel 1's product page holds: its related products' carousels.
const RELATED = '#tab-related .productCarousel';
const SIMILAR = '#tab-similar .productCarousel';

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

    it('hide channel 1\'s live product list, which isn\'t pinned, only on its own pages', () => {
        assert.ok(masksFor('1', 'category').includes('.productGrid'));
        assert.ok(!masksFor('1', 'product').includes('.productGrid'));
    });

    it('no longer mask widget regions, which the screenshot stylesheet hides instead (W0-5)', () => {
        for (const [channel, template] of pinned) assert.ok(!masksFor(channel, template).includes('[data-widget-id]'), `${channel} ${template}`);
    });

    it('cover the boxes channel 1\'s product page holds, so a reviewer sees what isn\'t compared', () => {
        assert.ok(masksFor('1', 'product').includes(RELATED));
        assert.ok(masksFor('1', 'product').includes(SIMILAR));
    });

    it('leave the description and the related section\'s frame in the shot', () => {
        for (const selector of ['#tab-related', '#tab-similar', '.productView-description', '.tabs']) {
            assert.ok(!masksFor('1', 'product').includes(selector), `${selector} is masked on channel 1's product page`);
        }
    });
});

// A rough CSS reader for the stylesheet the screenshots apply: selector -> declarations,
// one entry per selector in each rule's selector list.
function rules(css) {
    const found = new Map();
    for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const declarations = Object.fromEntries(body.split(';').map(part => part.trim()).filter(Boolean).map(part => {
            const at = part.indexOf(':');
            return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        }));
        for (const selector of selectors.split(',').map(part => part.trim())) {
            found.set(selector, { ...found.get(selector), ...declarations });
        }
    }
    return found;
}

describe('the screenshot stylesheet (W0-5)', () => {
    const pinned = Object.entries(CHANNELS).flatMap(([channel, { pages }]) => Object.keys(pages).map(template => [channel, template]));
    const kinds = [...pinned, ['1895766', 'product'], ['1895766', 'category'], ['1', 'home'], ['1895766', 'fly-type']];

    it('takes widget regions out of the layout on every page kind and channel, so an applied widget can\'t change a page\'s height', () => {
        for (const [channel, template] of kinds) {
            assert.equal(rules(screenshotStyle(channel, template)).get('[data-widget-id]')?.display, 'none !important', `${channel} ${template}`);
        }
    });

    it('takes the store\'s cookie banner and the bar it leaves after a choice out of the layout on every page', () => {
        // The bar appears about a second after "Reject all", so a shot taken before it was
        // 48 px shorter: the channel-1 product page at 375 failed once at 375x4101 against
        // a 375x4149 baseline.
        for (const [channel, template] of kinds) {
            const css = rules(screenshotStyle(channel, template));
            for (const selector of ['#consent-manager', '#consent-manager-update-banner']) {
                assert.equal(css.get(selector)?.display, 'none !important', `${selector} on ${channel} ${template}`);
            }
        }
        assert.deepEqual(HIDDEN, ['[data-widget-id]', '#consent-manager', '#consent-manager-update-banner']);
    });

    it('holds channel 1\'s related and similar carousels at a fixed height, with their cards taken out', () => {
        const css = rules(screenshotStyle('1', 'product'));
        for (const box of [RELATED, SIMILAR]) {
            const height = CHANNELS[1].hold.product[box];
            assert.ok(Number.isInteger(height) && height > 0, `${box} has a height`);
            for (const property of ['height', 'min-height', 'max-height']) assert.equal(css.get(box)?.[property], `${height}px !important`, `${box} ${property}`);
            assert.equal(css.get(box)?.overflow, 'hidden !important', `${box} overflow`);
            assert.equal(css.get(`${box} > *`)?.display, 'none !important', `${box}'s cards`);
        }
    });

    it('never hides or holds the description or the related section\'s frame, which tickets 39 and 40 change', () => {
        const css = rules(screenshotStyle('1', 'product'));
        for (const selector of ['#tab-related', '#tab-similar', '.productView-description', '.tabs', '.productView']) {
            assert.ok(!css.has(selector), `${selector} is in the stylesheet`);
        }
    });

    it('holds nothing on any other page or channel, so cards stay in those shots', () => {
        for (const [channel, template] of kinds.filter(([kindChannel, kindTemplate]) => !(kindChannel === '1' && kindTemplate === 'product'))) {
            const css = rules(screenshotStyle(channel, template));
            assert.deepEqual([...css.keys()].sort(), [...HIDDEN].sort(), `${channel} ${template}`);
        }
    });
});
