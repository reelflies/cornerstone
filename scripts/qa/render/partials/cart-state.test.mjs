// Cart state's server markup (ticket 42; spec module 17; O13, O15, UX-10, UX-18; stories 33, 40,
// 68, 70 and 73), with rf_cart_state on and off:
//
// - js-settings.html: context.rfCartState for cart-marks.js, and the template variable
//   rf_cart_state, which the size pills read (they render with their option as context, where
//   theme_settings can't be reached).
// - size-pills.html, on the product page only (ticket 38's rf_product_page): each size's hidden
//   "(N in cart)" span and corner check, and the "In your cart" line under the sold-out line, its
//   line reserved and empty; the words ride on the line's data attributes.
// - card-cart-state.html, the first include of ticket 31's card-extras.html: the reserved line with
//   its link to the product page, hidden and empty.
// - With the switch off, none of it: the stock markup renders. Nothing here holds a count: the
//   cart is read in the browser, after the page is cached (cart-marks.js).
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
import { THEME_DIR, readFixture, renderPartial } from '../render.mjs';

const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.cart_state;
const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const { products } = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/partials/card/products.json'), 'utf8'));
const PRODUCT_PAGE = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json')).page_context;

const value = (id, label) => ({
    id, label, selected: false, data: label,
});
const SIZES = {
    id: 117, display_name: 'Fly Sizes', partial: 'set-rectangle', required: true, defaultValue: '', values: [value(301, '12'), value(302, '14'), value(303, '16')],
};
const COLOUR = {
    id: 118, display_name: 'Colour', partial: 'set-rectangle', required: true, defaultValue: '', values: [value(401, 'Olive'), value(402, 'Black')],
};

// One option rendered as a page renders it: js-settings.html first (layout/base.html's head, before
// the page block), then, on the product page, pages/product.html's rf_product_page and
// product-view.html's rf_product_id, then stock set-rectangle.html's hook.
const PAGE = 'rf-test/cart-state-option';
const option = (opt, { on = true, productPage = true, productId = 4877 } = {}) => renderPartial(PAGE, {
    option: opt, product_id: productId, theme_settings: { rf_cart_state: on },
}, {
    overrides: {
        [PAGE]: `{{> components/reelflies/js-settings}}${productPage ? "{{assignVar 'rf_product_page' 1}}" : ''}{{assignVar 'rf_product_id' product_id}}{{> components/products/options/set-rectangle option}}`,
    },
});
const labels = html => elementsHtml(html, 'label', attrs => 'data-product-attribute-value' in attrs);
const cartLine = html => findTags(html, 'p').find(tag => 'data-rf-cart-line' in tag.attrs);
const CART_MARKERS = /data-rf-cart-(line|tag|dot|card)/;

describe('the switch (js-settings.html)', () => {
    const PROBE = 'rf-test/cart-state-probe';
    const probe = on => renderPartial(PROBE, { theme_settings: { rf_cart_state: on } }, {
        overrides: { [PROBE]: "{{> components/reelflies/js-settings}}[{{#if (getVar 'rf_cart_state')}}on{{/if}}]" },
    });

    it('is on in the base settings, and the channel-1 variation sets no value of its own (ticket 53)', () => {
        assert.equal(config.settings.rf_cart_state, true);
        for (const variation of config.variations) assert.equal(variation.settings.rf_cart_state, undefined, variation.name);
    });

    it('sets the template variable rf_cart_state only with the switch on, and renders no markup', async () => {
        assert.equal((await probe(true)).trim(), '[on]');
        assert.equal((await probe(false)).trim(), '[]');
    });

    it('passes the switch to the theme\'s JavaScript as context.rfCartState', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/js-settings.html'), 'utf8');
        assert.match(source, /\{\{~inject 'rfCartState' theme_settings\.rf_cart_state\}\}/);
    });
});

describe('the size pills on the product page (components/reelflies/size-pills.html; stories 40 and 68)', () => {
    it('gives each size a hidden "(N in cart)" span after "(sold out)", and a corner check hidden from screen readers, both hidden until the cart is read', async () => {
        const html = await option(SIZES);
        assert.equal(labels(html).length, 3);
        for (const label of labels(html)) {
            const spans = findTags(label, 'span');
            const soldOut = spans.findIndex(tag => 'data-rf-sold-out-tag' in tag.attrs);
            const tag = spans.findIndex(each => 'data-rf-cart-tag' in each.attrs);
            const dot = spans.find(each => 'data-rf-cart-dot' in each.attrs);
            assert.ok(soldOut >= 0 && tag > soldOut, '"(N in cart)" comes after "(sold out)" in the name');
            assert.equal(spans[tag].attrs.class, 'is-srOnly');
            assert.ok('hidden' in spans[tag].attrs);
            assert.equal(textOf(outerHtml(label, 'span', attrs => 'data-rf-cart-tag' in attrs)), '');
            assert.equal(dot.attrs['aria-hidden'], 'true');
            assert.ok('hidden' in dot.attrs);
            assert.equal(findTags(outerHtml(label, 'span', attrs => 'data-rf-cart-dot' in attrs), 'svg').length, 1, 'a check');
        }
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('puts the "In your cart" line under the sold-out line, empty, with the product\'s id and the words the script fills it with', async () => {
        const html = await option(SIZES);
        const line = cartLine(html);
        assert.equal(line.attrs['data-rf-cart-line'], '4877');
        assert.equal(line.attrs['data-rf-pill'], lang.pill.replace('{count}', '#'));
        assert.equal(line.attrs['data-rf-line'], lang.line.replace('{sizes}', '#'));
        assert.equal(line.attrs['data-rf-size'], lang.size.replace('{count}', '#').replace('{size}', '%'));
        assert.equal(line.attrs['data-rf-and'], lang.and);
        assert.match(line.attrs.class, /(^|\s)rf-pills-note(\s|$)/);
        assert.equal(textOf(outerHtml(html, 'p', attrs => 'data-rf-cart-line' in attrs)), '');
        assert.ok(html.indexOf('data-rf-sold-out-line') < html.indexOf('data-rf-cart-line'), 'under the sold-out line');
        assert.equal(lang.line, 'In your cart: {sizes}.');
        assert.equal(lang.size, '{count} × size {size}');
        assert.equal(lang.pill, '({count} in cart)');
    });

    it('marks only the size option: another rectangle option has neither marks nor a line', async () => {
        const html = await option(COLOUR);
        assert.doesNotMatch(html, CART_MARKERS);
    });

    it('renders the stock pills with the switch off: no marks, no line', async () => {
        const [off, on] = await Promise.all([option(SIZES, { on: false }), option(SIZES)]);
        assert.doesNotMatch(off, CART_MARKERS);
        const strip = html => html.replace(/<span class="is-srOnly" data-rf-cart-tag hidden><\/span>/g, '')
            .replace(/<span class="rf-pill-cart" data-rf-cart-dot[^>]*>[\s\S]*?<\/svg>\s*<\/span>/g, '')
            .replace(/\s*<p class="rf-pills-note rf-pills-incart"[^>]*><\/p>/, '');
        assert.equal(strip(on).replace(/\s+/g, ' '), off.replace(/\s+/g, ' '), 'the switch adds only its own markup');
    });

    it('leaves Quick view and the cart\'s Change dialog alone, whose pills aren\'t the product page\'s', async () => {
        assert.doesNotMatch(await option(SIZES, { productPage: false }), CART_MARKERS);
        const dialog = await renderPartial('rf-test/cart-state-dialog', {
            theme_settings: { rf_cart_state: true }, product_name: 'Fat Albert', quote_item_id: 'line-1', options: [SIZES, COLOUR],
        }, { overrides: { 'rf-test/cart-state-dialog': '{{> components/reelflies/js-settings}}{{> components/cart/modals/configure-product}}' } });
        assert.doesNotMatch(dialog, CART_MARKERS);
    });

    it('renders the line on the whole product page, under the buy box\'s pills (ticket 39), once', async () => {
        const html = await renderPartial('pages/product', PRODUCT_PAGE);
        const lines = findTags(html, 'p').filter(tag => 'data-rf-cart-line' in tag.attrs);
        assert.equal(lines.length, 1);
        assert.equal(lines[0].attrs['data-rf-cart-line'], String(PRODUCT_PAGE.product.id));
        const buy = outerHtml(html, 'div', attrs => 'data-rf-product-buy' in attrs);
        assert.ok(buy.includes('data-rf-cart-line'), 'in the buy box');
        assert.ok(buy.indexOf('data-rf-cart-line') < buy.indexOf('data-rf-add'), 'above the quantity and the button');
        const off = await renderPartial('pages/product', { ...PRODUCT_PAGE, theme_settings: { ...PRODUCT_PAGE.theme_settings, rf_cart_state: false } });
        assert.doesNotMatch(off, CART_MARKERS);
    });
});

describe('the card line (components/reelflies/card-cart-state.html; story 33)', () => {
    const CALLER = 'rf-test/cart-state-grid';
    const grid = on => renderPartial(CALLER, { products, theme_settings: { rf_cart_state: on } }, {
        overrides: { [CALLER]: '{{> components/products/grid products=products theme_settings=theme_settings event="list"}}' },
    });
    const cards = html => elementsHtml(html, 'article', attrs => /(^|\s)card(\s|$)/.test(attrs.class || ''));

    it('reserves a line in each card\'s body, under the price, with a hidden link to the product page and its name for screen readers', async () => {
        const html = await grid(true);
        const list = cards(html);
        assert.equal(list.length, products.length);
        list.forEach((card, index) => {
            const product = products[index];
            const body = outerHtml(card, 'div', attrs => /(^|\s)card-body(\s|$)/.test(attrs.class || ''));
            const [slot] = findTags(body, 'p').filter(tag => 'data-rf-cart-card' in tag.attrs);
            assert.ok(slot, `card ${product.id} has the slot`);
            assert.equal(slot.attrs['data-rf-cart-card'], String(product.id));
            assert.equal(slot.attrs['data-rf-words'], lang.card.replace('{count}', '#'));
            assert.ok(body.indexOf('rf-card-price') < body.indexOf('data-rf-cart-card'), 'under the price');
            const [link] = findTags(outerHtml(body, 'p', attrs => 'data-rf-cart-card' in attrs), 'a');
            assert.equal(link.attrs.href, product.url);
            assert.ok('hidden' in link.attrs);
            const count = outerHtml(body, 'span', attrs => 'data-rf-cart-count' in attrs);
            assert.equal(textOf(count), '');
            const linkHtml = outerHtml(body, 'a', attrs => 'hidden' in attrs);
            assert.equal(textOf(outerHtml(linkHtml, 'span', attrs => attrs.class === 'is-srOnly')), lang.card_of.replace('{name}', product.name));
        });
        assert.deepEqual(unbalancedTags(html), []);
        assert.equal(lang.card, '{count} in cart');
    });

    it('renders the stock card with the switch off: no slot, and the card-extras slot empty for it', async () => {
        const html = await grid(false);
        assert.doesNotMatch(html, CART_MARKERS);
        assert.equal(textOf(await renderPartial('components/reelflies/card-cart-state', { theme_settings: { rf_cart_state: false } })), '');
    });

    it('is the extras slot\'s first include, ticket 43\'s after it (build pipeline 6.2)', () => {
        const extras = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/card-extras.html'), 'utf8');
        const body = extras.slice(extras.indexOf('--}}') + 4);
        const includes = [...body.matchAll(/\{\{> components\/reelflies\/([a-z-]+)/g)].map(([, name]) => name);
        assert.equal(includes[0], 'card-cart-state');
    });
});
