// The buy row and the sticky add bar (ticket 38; spec module 15; O14, UX-10; stories 34, 37, 41
// and 43): stock products/add-to-cart.html's hook (components/reelflies/add-to-cart.html),
// pages/product.html's (components/reelflies/sticky-add.html), and cart/preview.html's heading,
// on product contexts shaped as BigCommerce's.
//
//   node --test scripts/qa/render/partials/add-flow.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, outerHtml, textOf } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const value = (id, label) => ({
    id, label, selected: false, data: label,
});
const SIZES = {
    id: 117, display_name: 'Fly Sizes', partial: 'set-rectangle', required: true, values: [value(301, '12'), value(302, '14')],
};
const product = (options, extra = {}) => ({
    id: 4877, title: 'Adams Parachute', cart_url: '/cart.php', url: '/adams-parachute/', images: [], options, can_purchase: true, show_quantity_input: true, min_purchase_quantity: 0, max_purchase_quantity: 0, price: {}, ...extra,
});
// The buy row as the product page renders it: pages/product.html's hook sets rf_product_page first.
// Quick view (`quickView: true`) renders it without.
const ROW = 'rf-test/buy-row';
const row = (options, extra, { quickView = false } = {}) => renderPartial(ROW, {
    product: product(options, extra), settings: {}, theme_settings: {}, with_wallet_buttons: false, quick_view: quickView,
}, {
    overrides: { [ROW]: "{{#unless quick_view}}{{assignVar 'rf_product_page' 1}}{{/unless}}{{> components/products/add-to-cart}}" },
});
const button = html => findTags(html, 'input').find(tag => tag.attrs.id === 'form-action-addToCart');

describe('the buy row (components/reelflies/add-to-cart.html)', () => {
    it('keeps the ids and data attributes stock product-details.js drives', async () => {
        const html = await row([SIZES]);
        const ids = findTags(html).map(tag => tag.attrs.id).filter(Boolean);
        for (const id of ['add-to-cart-wrapper', 'qty[]', 'form-action-addToCart']) assert.ok(ids.includes(id), id);
        assert.ok(findTags(html, 'div').some(tag => 'data-quantity-change' in tag.attrs));
        assert.deepEqual(findTags(html, 'button').map(tag => tag.attrs['data-action']), ['dec', 'inc']);
        assert.equal(button(html).attrs.type, 'submit');
        assert.ok(button(html).attrs['data-wait-message']);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('says "Choose a size" on a product with several sizes, and "Add 1 to cart" otherwise (stories 37 and 41)', async () => {
        assert.equal(button(await row([SIZES])).attrs.value, 'Choose a size');
        assert.equal(button(await row([{ ...SIZES, values: [value(301, '12')] }])).attrs.value, 'Add 1 to cart');
        assert.equal(button(await row([])).attrs.value, 'Add 1 to cart');
        assert.equal(button(await row([], { min_purchase_quantity: 3 })).attrs.value, 'Add 3 to cart');
    });

    it('carries every word with its placeholders whole, for add-flow.js to fill (the lang helper would fill a missing one with "undefined")', async () => {
        const [wrapper] = findTags(await row([SIZES]), 'div').filter(tag => 'data-rf-add' in tag.attrs);
        const words = Object.fromEntries(Object.entries(wrapper.attrs).filter(([name]) => name.startsWith('data-rf-') && name !== 'data-rf-add'));
        for (const [name, text] of Object.entries(words)) assert.doesNotMatch(text, /undefined/, name);
        assert.equal(words['data-rf-added'], 'Added {qty} × {choice}.');
        assert.equal(words['data-rf-sold-out'], 'Size {size} is sold out. Choose another size.');
        assert.equal(words['data-rf-size'], 'size {size}');
        assert.equal(words['data-rf-size-and'], 'Size {size}, {flies}');
        assert.equal(words['data-rf-add-label'], 'Add # to cart');
        assert.equal(words['data-rf-sold-out-all'], 'Every size is sold out.');
        assert.equal(words['data-rf-sold-out-choice'], 'That choice is sold out.');
        assert.equal(words['data-rf-stock-label'], 'Add to Cart');
    });

    it('finds the size option by the Fly size facet\'s name (size-facet-name.html), in any case, not by "Size" in a name', async () => {
        assert.equal(button(await row([{ ...SIZES, display_name: 'fly sizes' }])).attrs.value, 'Choose a size');
        assert.equal(button(await row([{ ...SIZES, display_name: 'Hook Size' }])).attrs.value, 'Add 1 to cart');
    });

    it('keeps stock\'s labels where add-flow.js doesn\'t run: "Add to Cart" in Quick view, and a pre-order product\'s everywhere', async () => {
        assert.equal(button(await row([SIZES], {}, { quickView: true })).attrs.value, 'Add to Cart');
        assert.equal(button(await row([], {}, { quickView: true })).attrs.value, 'Add to Cart');
        assert.equal(button(await row([SIZES], { pre_order: true })).attrs.value, 'Pre-Order Now');
        const [wrapper] = findTags(await row([SIZES], { pre_order: true }), 'div').filter(tag => 'data-rf-add' in tag.attrs);
        assert.ok('data-rf-pre-order' in wrapper.attrs);
    });

    it('carries the product\'s name, which the confirmation names on a product with no options', async () => {
        const [wrapper] = findTags(await row([]), 'div').filter(tag => 'data-rf-add' in tag.attrs);
        assert.equal(wrapper.attrs['data-rf-product'], 'Adams Parachute');
    });

    it('starts the stepper at 1, or the product\'s minimum, with buttons that never submit the form', async () => {
        const qty = html => findTags(html, 'input').find(tag => tag.attrs.id === 'qty[]').attrs.value;
        const html = await row([SIZES]);
        assert.equal(qty(html), '1');
        assert.equal(qty(await row([SIZES], { min_purchase_quantity: 3 })), '3');
        const steps = findTags(html, 'button').filter(tag => tag.attrs['data-action']);
        assert.deepEqual(steps.map(tag => [tag.attrs['data-action'], tag.attrs.type]), [['dec', 'button'], ['inc', 'button']]);
    });

    it('carries the status line with no role, the flow\'s words, and no stock status span to announce twice (story 68)', async () => {
        const html = await row([SIZES]);
        const [status] = findTags(html, 'p').filter(tag => 'data-rf-add-status' in tag.attrs);
        assert.ok(status, 'the status line');
        assert.equal(status.attrs.role, undefined);
        assert.ok('hidden' in status.attrs);
        const [wrapper] = findTags(html, 'div').filter(tag => 'data-rf-add' in tag.attrs);
        assert.equal(wrapper.attrs['data-rf-add-label'], 'Add # to cart');
        assert.equal(wrapper.attrs['data-rf-choose-first'], 'Choose a fly size first.');
        assert.doesNotMatch(html, /product-status-message/);
    });

    it('gives the status line the reference\'s alert and check icons, then the text box add-flow.js writes', async () => {
        const html = await row([SIZES]);
        const status = html.slice(html.indexOf('<p class="rf-add-status"'), html.indexOf('</p>', html.indexOf('<p class="rf-add-status"')) + 4);
        // The icon partial ends with a newline: whitespace a flex box doesn't draw.
        assert.match(status, /^<p [^>]*><svg class="rf-icon rf-add-status-alert"[^>]*><use href="#rf-icon-alert"><\/use><\/svg>\s*<svg class="rf-icon rf-add-status-check"[^>]*><use href="#rf-icon-check"><\/use><\/svg>\s*<span data-rf-add-status-text><\/span><\/p>$/);
    });
});

describe('the sticky add bar (components/reelflies/sticky-add.html)', () => {
    const bar = extra => renderPartial('components/reelflies/sticky-add', {
        product: product([SIZES], extra), settings: {}, urls: { cart: '/cart.php' },
    });

    it('renders hidden, with its text, its button and a hidden View cart', async () => {
        const html = await bar();
        const [root] = findTags(html, 'div').filter(tag => 'data-rf-sticky-add' in tag.attrs);
        assert.ok('hidden' in root.attrs);
        assert.equal(findTags(html, 'button').filter(tag => 'data-rf-sticky-button' in tag.attrs).length, 1);
        const [view] = findTags(html, 'a').filter(tag => 'data-rf-sticky-view' in tag.attrs);
        assert.equal(view.attrs.href, '/cart.php');
        assert.ok('hidden' in view.attrs);
    });

    it('is left out on a product the shopper can\'t buy', async () => {
        assert.equal((await bar({ can_purchase: false })).trim(), '');
    });

    it('sits on the product page only, never in Quick view', () => {
        const page = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/product.html'), 'utf8');
        const quickView = fs.readFileSync(path.join(THEME_DIR, 'templates/components/products/quick-view.html'), 'utf8');
        assert.match(page, /components\/reelflies\/sticky-add/);
        assert.doesNotMatch(quickView, /sticky-add/);
    });
});

describe('Quick view\'s preview modal (stock cart/preview.html)', () => {
    it('says what the cart holds, not that the whole cart was added', async () => {
        const html = await renderPartial('components/cart/preview', {
            cart: { quantity: 38, items: [], show_primary_checkout_button: true }, urls: { cart: '/cart.php', checkout: { single_address: '/checkout' } }, settings: {},
        });
        assert.equal(textOf(outerHtml(html, 'h1', () => true)), 'Added to cart. Your cart now has 38 items.');
    });
});

describe('against stock\'s own buy row (kept below the hook, unrendered)', () => {
    it('gives the quantity field and the button the attributes stock\'s block gives them', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/components/products/add-to-cart.html'), 'utf8');
        const stock = source.slice(source.indexOf('{{#if false}}'));
        const ours = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/add-to-cart.html'), 'utf8');
        // An input's attributes as written, name="value" pairs; `value` differs by design (the
        // quantity's start, the button's label), so only its presence is held.
        const pairs = (html, marker) => {
            const element = html.match(new RegExp(`<input\\s[^>]*${marker}[^>]*>`, 's'))[0];
            return Object.fromEntries([...element.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, text]) => [name, text]));
        };
        for (const marker of ['name="qty\\[\\]"', 'id="form-action-addToCart"']) {
            const theirs = pairs(stock, marker);
            const mine = pairs(ours, marker);
            for (const [name, text] of Object.entries(theirs)) {
                if (name === 'value') assert.ok('value' in mine, `${marker} keeps a value`);
                else if (name === 'class') assert.ok(text.split(/\s+/).every(part => mine.class.split(/\s+/).includes(part)), `${marker}'s classes ${text}`);
                else assert.equal(mine[name], text, `${marker}'s ${name}`);
            }
        }
    });
});
