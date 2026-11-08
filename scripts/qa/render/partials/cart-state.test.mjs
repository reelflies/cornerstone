// Cart state's server markup (ticket 42; redesign step 3; spec module 17; O13, O15, UX-10, UX-18;
// stories 33, 40, 68, 70 and 73), with rf_cart_state on and off. What the box holds is read in
// the browser, after the page is cached: the picker's quantities are the box's (quantity.js), the
// card's reserved line is filled by quick-add.js, and the product page's "In your box" line by
// product-buy.js. So the server renders the places and never a count:
//
// - head.html: context.rfCartState for the scripts (quick-add.js leaves the card's line and ring
//   out with it off), beside the other switches.
// - fly.html: the card's reserved line (data-rf-inbox), hidden and empty, with the switch on or
//   off, so adding never moves the layout.
// - product-picker.html: every quantity 0 and the "In your box" line (data-rf-pick-inbox) empty.
//
// Retired with the redesign: ticket 37's pill marks ("(N in cart)", the corner check) and the
// card-cart-state partial; the picker's quantity is what the box holds.
//
//   node --test scripts/qa/render/partials/cart-state.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { productPage } from './product-page/context.mjs';

const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const { products } = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/partials/card/products.json'), 'utf8'));
const has = name => attrs => name in attrs;
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

describe('the switch (head.html)', () => {
    const PROBE = 'rf-test/cart-state-probe';
    const context = async theme => {
        const html = await renderPartial(PROBE, { theme_settings: theme, settings: { money: { currency_token: '$' } } }, {
            overrides: { [PROBE]: '{{> components/reelflies/head}}<!--ctx-->{{{jsContext}}}' },
        });
        return JSON.parse(JSON.parse(html.slice(html.indexOf('<!--ctx-->') + '<!--ctx-->'.length)));
    };

    it('is on in the base settings, and no variation sets a value of its own (ticket 53)', () => {
        assert.equal(config.settings.rf_cart_state, true);
        for (const variation of config.variations) assert.equal(variation.settings.rf_cart_state, undefined, variation.name);
    });

    it('passes the switch to the theme\'s JavaScript as context.rfCartState, true or false', async () => {
        assert.equal((await context({ rf_cart_state: true })).rfCartState, true);
        assert.equal((await context({ rf_cart_state: false })).rfCartState, false);
        assert.match(fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/head.html'), 'utf8'), /\{\{~inject 'rfCartState' theme_settings\.rf_cart_state\}\}/);
    });

    it('is what quick-add.js reads to show the card\'s line, off only when false', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'assets/js/theme/reelflies/quick-add.js'), 'utf8');
        assert.match(source, /cartState: context\.rfCartState !== false/);
        assert.match(source, /settings\.cartState && n > 0/);
    });
});

describe('the card\'s reserved line (components/reelflies/fly.html; story 33)', () => {
    const CALLER = 'rf-test/cart-state-grid';
    const grid = on => renderPartial(CALLER, { products, settings: {}, theme_settings: { rf_cart_state: on, rf_quick_add: true, rf_price_unit_exclude: 'Fly Gear,Fly Selections & Fly Boxes' } }, {
        overrides: { [CALLER]: '{{> components/products/grid products=products theme_settings=theme_settings event="list"}}' },
    });
    const cards = html => elementsHtml(html, 'li', classed('rf-fly'));

    it('reserves a line in each card, under the price, hidden and empty on the server, with the switch on', async () => {
        const html = await grid(true);
        const list = cards(html);
        assert.equal(list.length, products.length);
        for (const card of list) {
            const line = outerHtml(card, 'p', classed('rf-fly__line'));
            assert.ok(line, 'the reserved line');
            assert.ok(card.indexOf('rf-fly__price') < card.indexOf('rf-fly__line'), 'under the price');
            const [inbox] = findTags(line, 'span').filter(tag => 'data-rf-inbox' in tag.attrs);
            assert.ok(inbox, 'the "In your box" span');
            assert.ok('hidden' in inbox.attrs);
            assert.equal(textOf(outerHtml(line, 'span', has('data-rf-inbox'))), '');
        }
        assert.doesNotMatch(html, /in your box|in cart/i, 'no count on the server');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('keeps the line with the switch off too: quick-add.js leaves it empty, so the layout is the same either way', async () => {
        const off = await grid(false);
        assert.equal(findTags(off, 'span').filter(tag => 'data-rf-inbox' in tag.attrs).length, products.length);
        assert.equal((await grid(true)).replace(/\s+/g, ' '), off.replace(/\s+/g, ' '), 'the switch changes nothing on the server');
    });
});

describe('the product page (components/reelflies/product-picker.html; stories 40 and 68)', () => {
    it('starts every quantity at 0 and keeps the "In your box" line empty, with the switch on or off: the box is read in the browser', async () => {
        for (const on of [true, false]) {
            const html = await productPage({ theme: { rf_cart_state: on } }); // eslint-disable-line no-await-in-loop
            const picker = outerHtml(html, 'div', has('data-rf-pick-page'));
            const fields = findTags(picker, 'input').filter(tag => 'data-rf-qty' in tag.attrs);
            assert.equal(fields.length, 7, `switch ${on}`);
            for (const field of fields) assert.equal(field.attrs.value, '0');
            const lines = elementsHtml(picker, 'p', has('data-rf-pick-inbox'));
            assert.equal(lines.length, 1);
            assert.equal(textOf(lines[0]), '');
        }
    });
});
