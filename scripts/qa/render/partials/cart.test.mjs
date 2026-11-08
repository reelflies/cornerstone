// The cart's templates, "Your box" (ticket 41; redesign step 3; spec module 18; stories 45, 50,
// 51, 52, 54, 55, 56; the owner kept "Your box" over ticket 41's "Your cart", 2026-11-07): the
// page (components/reelflies/cart-page.html, from pages/cart.html's hero block) with its summary
// and phone bar, the heading and its count (cart-title.html, through stock cart/page-title.html),
// the store's messages as plain lines (stock cart/status-messages.html, hooked), and the lines
// grouped by pattern (cart-lines.html, cart-group.html and cart-row.html, through stock
// cart/content.html). Stock cart.js does every update through the hooks these keep. Rendered on
// lines shaped as the cart page's context gives them, and on the fixture carts
// (render/pages/cart-page/fixtures).
//
// Retired with the redesign: the coupon link in the summary (stock's coupon form, restyled, sits in
// the totals) and the bar's "for N flies" (the bar carries the count and the total, which
// cart-page.js keeps in step).
//
//   node --test scripts/qa/render/partials/cart.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, readFixture, renderPartial } from '../render.mjs';

const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies;
const TWELVE = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/cart-page/fixtures/twelve.json')).page_context;
const DISCOUNTED = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/cart-page/fixtures/discounted.json')).page_context;

// A cart line as the cart page's context gives it (cart.items), with the fields the templates read.
const line = (id, productId, name, size, {
    qty = 1, price = 1.25, brand = 'ReelFlies', options, canModify = true,
} = {}) => ({
    id,
    product_id: productId,
    name,
    url: `https://reelflies.ca/${name.toLowerCase().replace(/[^a-z]+/g, '-')}/`,
    type: 'PhysicalItem',
    can_modify: canModify,
    quantity: qty,
    min_purchase_quantity: 0,
    max_purchase_quantity: 0,
    brand: brand ? { name: brand } : null,
    image: { data: `https://cdn11.bigcommerce.com/s-fixture/images/stencil/{:size}/products/${productId}/1/fly.jpg`, alt: name },
    price: { value: price, formatted: `$${price.toFixed(2)}` },
    total: { value: price * qty, formatted: `$${(price * qty).toFixed(2)}` },
    options: options ?? (size ? [{ name: 'Fly Sizes', value: size }] : []),
});
const gift = id => ({
    id, name: 'Gift certificate', type: 'GiftCertificate', quantity: 1, can_modify: false, edit_url: `/giftcertificates.php?action=edit&id=${id}`, price: { value: 25, formatted: '$25.00' }, total: { value: 25, formatted: '$25.00' }, options: [],
});

const CART = [
    line('a1', 5663, 'Parachute Adams', '14', { qty: 6 }),
    line('a2', 5663, 'Parachute Adams', '12', { qty: 12 }),
    line('b1', 4904, 'Beadhead Krystal Bugger Black', '8', { qty: 4, price: 1.5 }),
    line('a3', 5663, 'Parachute Adams', '16', { qty: 6 }),
];
const TOTALS = {
    sub_total: { formatted: '$36.50' }, grand_total: { formatted: '$36.50' }, show_primary_checkout_button: true, shipping_handling: null, taxes: [],
};
const URLS = {
    checkout: { single_address: '/checkout', multiple_address: '/checkout?multi' }, cart: '/cart.php', home: '/', auth: { login: '/login.php' },
};
const page = (template, cart = CART, extra = {}) => renderPartial(template, {
    cart: {
        items: cart, ...TOTALS, quantity: cart.reduce((sum, item) => sum + item.quantity, 0), ...extra.cart,
    },
    urls: URLS,
    settings: { hide_price_from_guests: false, money: { currency_token: '$' } },
    theme_settings: { rf_fly_brands: 'ReelFlies' },
    ...extra.context,
}, { variation: 'ReelFlies CA' });
const has = name => attrs => name in attrs;
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const tagClassed = name => tag => classed(name)(tag.attrs);
const groups = html => elementsHtml(html, 'section', classed('rf-cart-group'));
const rows = html => elementsHtml(html, 'li', has('data-item-row'));
const rowIds = html => rows(html).map(row => findTags(row, 'input').find(tag => tag.attrs.id?.startsWith('qty-'))?.attrs.id.slice(4) ?? 'gift');

describe('the lines, grouped by pattern on the server (components/reelflies/cart-lines.html; story 50)', () => {
    it('renders one group per pattern, in the order each first went in, with every line of it and no line twice', async () => {
        const html = await page('components/cart/content');
        const found = groups(html);
        assert.equal(found.length, 2);
        assert.deepEqual(found.map(group => textOf(outerHtml(group, 'h2'))), ['Parachute Adams', 'Beadhead Krystal Bugger Black']);
        assert.deepEqual(found.map(rowIds), [['a1', 'a2', 'a3'], ['b1']], 'each group\'s rows in the store\'s order; cart-page.js puts them in hook order');
        const [list] = findTags(outerHtml(html, 'div', classed('rf-cart-lines')), 'div');
        assert.equal(list.attrs['data-cart-quantity'], '28', 'stock cart.js reads the quantity here, and reloads at 0');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('marks a group of several sizes, whose rows wait unseen until cart-page.js has sorted them, and leaves a single row alone', async () => {
        const lists = groups(await page('components/cart/content')).map(group => findTags(group, 'ul').find(tag => 'data-rf-cart-rows' in tag.attrs).attrs);
        assert.ok('data-rf-cart-multi' in lists[0]);
        assert.ok(!('data-rf-cart-multi' in lists[1]));
    });

    it('gives each row its size for the sort, and stock\'s data-item-row', async () => {
        const tags = rows(await page('components/cart/content')).map(row => findTags(row, 'li')[0].attrs);
        assert.deepEqual(tags.map(attrs => attrs['data-rf-size']), ['14', '12', '16', '8']);
        assert.ok(tags.every(attrs => 'data-item-row' in attrs), 'cart.js counts the rows by data-item-row');
    });

    it('opens the group with its head: a 96x64 photo and the name, both linked to the product, and the price each (story 56)', async () => {
        const [adams] = groups(await page('components/cart/content'));
        const head = adams.slice(0, adams.indexOf('rf-cart-group__rows'));
        assert.deepEqual(findTags(head, 'a').map(tag => tag.attrs.href), ['https://reelflies.ca/parachute-adams/', 'https://reelflies.ca/parachute-adams/']);
        const [img] = findTags(head, 'img');
        assert.equal(img.attrs.width, '96');
        assert.equal(img.attrs.height, '64');
        assert.equal(img.attrs.loading, 'lazy');
        assert.equal(img.attrs.alt, '', 'decorative: the name beside it is the link\'s text');
        assert.equal(findTags(head, 'a')[0].attrs['aria-hidden'], 'true');
        assert.equal(textOf(outerHtml(head, 'p', classed('rf-cart-group__price'))), '$1.25 each');
        const [section] = findTags(adams, 'section');
        assert.equal(section.attrs['aria-labelledby'], findTags(outerHtml(adams, 'h2'), 'h2')[0].attrs.id, 'the group is named by its heading');
    });

    it('shows a size\'s own price each where it differs from its pattern\'s (Kaufmann\'s Golden Stone), and a discounted price as the group\'s', async () => {
        const stone = [line('k1', 4831, 'Kaufmann\'s Golden Stone', '6', { price: 2.95 }), line('k2', 4831, 'Kaufmann\'s Golden Stone', '4', { price: 3.25 })];
        const [group] = groups(await page('components/cart/content', [...stone, CART[0]]));
        assert.equal(textOf(outerHtml(group, 'p', classed('rf-cart-group__price'))), '$2.95 each', 'the first line\'s price');
        assert.deepEqual(rows(group).map(row => textOf(outerHtml(row, 'span', classed('rf-cart-row__each')) || '')), ['', '$3.25 each']);
        const [adams] = groups(await page('components/cart/content'));
        assert.equal(elementsHtml(adams, 'span', classed('rf-cart-row__each')).length, 0, 'one price for the pattern');
        const sale = { ...line('s1', 77, 'Royal Wulff', '12', { price: 1.25 }), price_discounted: { value: 1, formatted: '$1.00' }, total_discounted: { value: 1, formatted: '$1.00' } };
        const [discounted] = groups(await page('components/cart/content', [sale]));
        assert.equal(textOf(outerHtml(discounted, 'p', classed('rf-cart-group__price'))), '$1.00 each');
        assert.equal(textOf(outerHtml(discounted, 's', classed('rf-cart-row__was'))), '$1.25', 'the list total struck through');
        assert.equal(textOf(outerHtml(discounted, 'span', classed('rf-cart-row__total'))), '$1.00');
    });

    it('keeps the stock controls cart.js drives, each named by pattern and size: the stepper, the quantity field and Remove (story 68)', async () => {
        const [first] = rows(await page('components/cart/content'));
        assert.equal(textOf(outerHtml(first, 'span', classed('rf-cart-row__size'))), 'Size 14');
        const buttons = findTags(first, 'button');
        assert.deepEqual(buttons.map(tag => tag.attrs['data-action'] ?? 'remove'), ['dec', 'inc', 'remove']);
        assert.deepEqual(buttons.slice(0, 2).map(tag => [tag.attrs['data-rf-cart-step'], tag.attrs['data-cart-itemid'], tag.attrs.type]), [['-1', 'a1', 'button'], ['1', 'a1', 'button']]);
        assert.ok(buttons.slice(0, 2).every(tag => !('data-cart-update' in tag.attrs)), 'not stock\'s one-step buttons: cart-page.js adds the taps up');
        assert.deepEqual(buttons.slice(0, 2).map(tag => tag.attrs['aria-label']), ['One fewer, Parachute Adams, Size 14', 'One more, Parachute Adams, Size 14']);
        const remove = buttons[2];
        assert.match(remove.attrs.class, /(^|\s)cart-remove(\s|$)/);
        assert.equal(remove.attrs['data-cart-itemid'], 'a1');
        assert.ok(remove.attrs['data-confirm-delete']);
        assert.equal(remove.attrs['aria-label'], 'Remove Parachute Adams, Size 14');
        const [input] = findTags(first, 'input');
        assert.equal(input.attrs.id, 'qty-a1');
        assert.equal(input.attrs.name, 'qty-a1');
        assert.match(input.attrs.class, /(^|\s)cart-item-qty-input(\s|$)/);
        assert.equal(input.attrs['data-cart-itemid'], 'a1');
        assert.equal(input.attrs['data-action'], 'manualQtyChange');
        assert.equal(input.attrs.value, '6');
        assert.equal(input.attrs.inputmode, 'numeric');
        assert.equal(input.attrs.min, '1');
        assert.equal(input.attrs['aria-label'], 'How many, Parachute Adams, Size 14');
        assert.equal(textOf(outerHtml(first, 'span', classed('rf-cart-row__total'))), '$7.50');
    });

    it('names a line with no Fly Size "Quantity", shows another choice in words with "Change", and no Change for a size alone', async () => {
        const html = await page('components/cart/content', [line('c1', 4398, 'Fly Box', null, { options: [{ name: 'Colour', value: 'Green' }] }), ...CART]);
        const [only] = rows(html);
        assert.equal(findTags(only, 'li')[0].attrs['data-rf-size'], '');
        assert.equal(textOf(outerHtml(only, 'span', classed('rf-cart-row__size'))), 'Quantity');
        assert.equal(textOf(outerHtml(only, 'span', classed('rf-cart-row__other'))), 'Green');
        const [change] = findTags(only, 'a').filter(tag => 'data-item-edit' in tag.attrs);
        assert.equal(change.attrs['data-item-edit'], 'c1');
        assert.equal(change.attrs['data-product-id'], '4398');
        assert.equal(textOf(outerHtml(only, 'a', has('data-item-edit'))), 'Change');
        assert.equal(findTags(only, 'button').find(tagClassed('cart-remove')).attrs['aria-label'], 'Remove Fly Box, Quantity, Green');
        assert.equal(findTags(rows(html)[1], 'a').filter(tag => 'data-item-edit' in tag.attrs).length, 0, 'a size alone: no Change');
    });

    it('fixes a line the shopper can\'t change: the field disabled, no stepper, no Remove', async () => {
        const [row] = rows(await page('components/cart/content', [line('f1', 1, 'Fixed Fly', '12', { canModify: false })]));
        assert.ok('disabled' in findTags(row, 'input')[0].attrs);
        assert.equal(findTags(row, 'button').length, 0);
    });

    it('gives each gift certificate a group of its own, with its fixed quantity and Change', async () => {
        const html = await page('components/cart/content', [gift('g1'), CART[0], gift('g2')]);
        assert.equal(groups(html).length, 3);
        assert.deepEqual(groups(html).map(group => rows(group).length), [1, 1, 1]);
        const [certificate] = groups(html);
        assert.equal(textOf(outerHtml(certificate, 'h2')), 'Gift certificate');
        assert.equal(findTags(certificate, 'input').length, 0, 'no quantity field');
        assert.equal(textOf(outerHtml(certificate, 'span', classed('rf-cart-row__qty-fixed'))), '1');
        assert.ok(findTags(certificate, 'a').some(tag => decodeHtml(tag.attrs.href) === '/giftcertificates.php?action=edit&id=g1' && classed('rf-cart-row__edit')(tag.attrs)));
        assert.ok(findTags(certificate, 'button').some(tagClassed('cart-remove')));
    });
});

describe('the heading and its count (components/reelflies/cart-title.html; story 51)', () => {
    const title = async (cart, flyBrands = 'ReelFlies') => {
        const html = await page('components/cart/page-title', cart, { context: { theme_settings: { rf_fly_brands: flyBrands } } });
        const box = outerHtml(html, 'div', has('data-cart-page-title'));
        return { heading: textOf(outerHtml(box, 'h1')), count: textOf(outerHtml(box, 'p') || ''), box };
    };

    it('reads "Your box", with flies and patterns when every line is a fly brand, in one element cart.js replaces', async () => {
        const { heading, count, box } = await title(CART);
        assert.equal(heading, 'Your box');
        assert.equal(count, '28 flies, 2 patterns');
        assert.ok(findTags(box, 'p').some(tag => 'data-rf-cart-count' in tag.attrs), 'the count cart-page.js reads');
    });

    it('says items and products when any line isn\'t a fly brand, or has none (Shaun\'s brand rule)', async () => {
        assert.equal((await title([...CART, line('d1', 5460, 'Mustad Streamer Hooks', null, { brand: 'Mustad' })])).count, '29 items, 3 products');
        assert.equal((await title([line('e1', 1, 'Adams', '14', { brand: null })])).count, '1 item, 1 product');
        assert.equal((await title(CART, '')).count, '28 items, 2 products', 'no fly brands named');
    });

    it('shows no count for an empty box, and counts one fly and one pattern in the singular', async () => {
        assert.equal((await title([])).count, '');
        assert.equal((await title([line('f1', 2, 'Red Devil', '4')])).count, '1 fly, 1 pattern');
        assert.equal((await title([line('f1', 2, 'Red Devil', '4', { brand: 'ReelFlies Signature' })], 'ReelFlies,ReelFlies Signature')).count, '1 fly, 1 pattern', 'a second fly brand from rf_fly_brands');
    });

    // cart-title.html splits rf_fly_brands on "," without trimming, where cart-count.js (the order
    // line's rule) trims each brand: with the setting written "a, b" the two counts disagree. A
    // theme finding; this case fails until the template trims.
    it('reads a second fly brand from rf_fly_brands written with a space after the comma, as the order line does', async () => {
        assert.equal((await title([line('f1', 2, 'Red Devil', '4', { brand: 'ReelFlies Signature' })], 'ReelFlies, ReelFlies Signature')).count, '1 fly, 1 pattern');
    });

    // cart-title.html counts patterns by product_id, which a gift certificate hasn't, so two gift
    // certificates count as one product while cart-lines.html gives each its own group. A theme
    // finding; this case fails until the count tells them apart.
    it('counts each gift certificate as a product of its own, as the lines group them', async () => {
        assert.equal((await title([gift('g1'), gift('g2'), ...CART])).count, '30 items, 4 products');
    });
});

describe('the store\'s messages (stock cart/status-messages.html, hooked; story 52)', () => {
    it('shows each status message as a plain line in the store\'s own words and markup, no alert box', async () => {
        const html = await page('components/cart/status-messages', CART, { cart: { status_messages: [{ message: 'Add <strong>$23.50</strong> more of flies for free standard shipping in Canada.' }] } });
        assert.equal(findTags(html, 'div').filter(tagClassed('alertBox')).length, 0);
        const [message] = findTags(html, 'p');
        assert.match(message.attrs.class, /(^|\s)rf-cart__message(\s|$)/);
        assert.match(html, /<strong>\$23\.50<\/strong>/, 'the store\'s markup stays');
    });

    it('holds no threshold of its own: the ReelFlies cart code never says 60', () => {
        const files = [
            'templates/components/reelflies/cart-page.html', 'templates/components/reelflies/cart-title.html', 'templates/components/reelflies/cart-lines.html',
            'templates/components/reelflies/cart-group.html', 'templates/components/reelflies/cart-row.html', 'templates/components/reelflies/cart-empty.html',
            'assets/js/theme/reelflies/cart-page.js', 'assets/js/theme/reelflies/box-words.js', 'assets/scss/reelflies/_cart.scss',
        ];
        for (const file of files) assert.doesNotMatch(fs.readFileSync(path.join(THEME_DIR, file), 'utf8'), /\b60\b/, file);
    });
});

// The whole page: inside a page's {{#partial}} block @root is empty, so anything that read the
// root's settings would lose them here and nowhere else.
describe('the cart page (components/reelflies/cart-page.html, from pages/cart.html)', () => {
    const cartPage = (cart = CART, extra = {}) => page('pages/cart', cart, { ...extra, context: { breadcrumbs: [], ...extra.context } });

    it('renders the heading with its count, the messages, the lines, the summary and the phone bar, once each, in stock cart.js\'s containers', async () => {
        const html = await cartPage(CART, { cart: { status_messages: [{ message: 'Your fly order qualifies for free standard shipping in Canada.' }] } });
        assert.equal(findTags(html, 'h1').length, 1);
        assert.equal(textOf(outerHtml(html, 'p', has('data-rf-cart-count'))), '28 flies, 2 patterns');
        assert.equal(textOf(outerHtml(html, 'div', has('data-cart-status'))), 'Your fly order qualifies for free standard shipping in Canada.');
        for (const hook of ['data-cart', 'data-cart-content', 'data-cart-totals', 'data-cart-status', 'data-cart-page-title']) assert.equal(findTags(html).filter(tag => hook in tag.attrs).length, 1, hook);
        assert.equal(groups(html).length, 2);
        assert.equal(rows(html).length, 4);
        assert.equal(findTags(html, 'div').filter(tag => 'data-rf-cartbar' in tag.attrs).length, 1);
        assert.equal(findTags(html, 'a').filter(tag => 'data-primary-checkout-now-action' in tag.attrs).length, 1, 'Check out once in the summary; the bar has its own');
        assert.ok(findTags(html, 'div').some(tagClassed('loadingOverlay')), 'stock\'s overlay, which cart.js shows while it works');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('puts the summary beside the lines: "Order summary", stock\'s totals, the free-shipping meter\'s place, copper Check out, the promise and the way back', async () => {
        const html = await cartPage();
        const summary = outerHtml(html, 'aside', classed('rf-cart__summary'));
        assert.ok(summary, 'the summary');
        const [aside] = findTags(summary, 'aside');
        assert.equal(aside.attrs['aria-labelledby'], findTags(outerHtml(summary, 'h2'), 'h2')[0].attrs.id);
        assert.equal(textOf(outerHtml(summary, 'h2')), 'Order summary');
        assert.ok(findTags(outerHtml(summary, 'div', has('data-cart-totals')), 'ul').some(tagClassed('cart-totals')), 'stock\'s totals');
        const [ship] = findTags(summary, 'div').filter(tag => 'data-rf-cart-ship' in tag.attrs);
        assert.equal(ship.attrs['data-rf-free'], '60');
        assert.equal(ship.attrs['data-rf-money'], '$');
        assert.equal(textOf(outerHtml(summary, 'div', has('data-rf-cart-ship'))), '', 'cart-page.js draws the meter from the box');
        const [checkout] = findTags(summary, 'a').filter(tag => 'data-primary-checkout-now-action' in tag.attrs);
        assert.equal(checkout.attrs.href, '/checkout');
        assert.match(checkout.attrs.class, /(^|\s)rf-buy(\s|$)/);
        assert.ok('data-rf-cart-checkout' in checkout.attrs);
        assert.equal(textOf(outerHtml(summary, 'a', has('data-primary-checkout-now-action'))), 'Check out');
        assert.equal(textOf(outerHtml(summary, 'p', classed('rf-cart__promise'))), 'We stand behind every fly we sell.');
        const back = outerHtml(summary, 'a', classed('rf-cart__back'));
        assert.equal(findTags(back, 'a')[0].attrs.href, '/');
        assert.equal(textOf(back), 'Keep shopping');
        assert.ok(summary.indexOf('data-cart-totals') < summary.indexOf('data-rf-cart-ship') && summary.indexOf('data-rf-cart-ship') < summary.indexOf('data-rf-cart-checkout'), 'totals, meter, Check out');
    });

    it('keeps the attributes of stock cart.html\'s Check out link, which cart.js and the data layer read', async () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/cart.html'), 'utf8');
        const stock = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/cart-page.html'), 'utf8').match(/<a\s[^>]*data-primary-checkout-now-action[^>]*>/)[0];
        assert.doesNotMatch(source, /data-primary-checkout-now-action/, 'the page template leaves Check out to the partial');
        for (const name of ['href', 'data-primary-checkout-now-action']) assert.match(stock, new RegExp(`\\s${name}(=|\\s|>)`));
    });

    it('leaves the free-shipping meter out without a threshold, and the coupons box out unless the store\'s multi-coupon UI is on', async () => {
        const plain = await cartPage();
        assert.equal(findTags(plain).filter(tag => 'data-rf-cart-ship' in tag.attrs).length, 1);
        assert.equal(findTags(plain).filter(tag => 'data-rf-cart-ship' in tag.attrs).length, 1);
        assert.equal(findTags(await cartPage(CART, { context: { theme_settings: { rf_ship_free_threshold: '', rf_fly_brands: 'ReelFlies' } } })).filter(tag => 'data-rf-cart-ship' in tag.attrs).length, 0);
        assert.equal(findTags(plain).filter(tag => 'data-cart-coupons' in tag.attrs).length, 0);
        assert.equal(findTags(await cartPage(CART, { cart: { multi_coupon_ui_enabled: true } })).filter(tag => 'data-cart-coupons' in tag.attrs).length, 1);
        assert.ok(findTags(plain, 'form').some(tagClassed('coupon-form')), 'stock\'s coupon form in the totals meanwhile');
    });

    it('carries the phone bar: the count\'s place, empty for cart-page.js, and Check out with the store\'s total', async () => {
        const bar = outerHtml(await cartPage(), 'div', has('data-rf-cartbar'));
        assert.equal(textOf(outerHtml(bar, 'p', has('data-rf-cartbar-count'))), '');
        const [checkout] = findTags(bar, 'a');
        assert.equal(checkout.attrs.href, '/checkout');
        assert.equal(textOf(outerHtml(bar, 'a')), 'Check out $36.50');
        assert.equal(textOf(outerHtml(bar, 'span', has('data-rf-cartbar-total'))), '$36.50');
    });

    it('offers sign-in instead of Check out, and no bar, with prices hidden from guests; Continue shopping when the store takes no checkout', async () => {
        const guest = await cartPage(CART, { context: { settings: { hide_price_from_guests: true, money: { currency_token: '$' } } } });
        assert.equal(findTags(guest).filter(tag => 'data-primary-checkout-now-action' in tag.attrs).length, 0);
        assert.equal(findTags(guest).filter(tag => 'data-rf-cartbar' in tag.attrs).length, 0);
        assert.equal(textOf(outerHtml(guest, 'a', classed('rf-cart__checkout'))), 'Login to proceed to checkout');
        assert.equal(findTags(outerHtml(guest, 'aside', classed('rf-cart__summary')), 'a').find(tagClassed('rf-cart__checkout')).attrs.href, '/login.php');
        const none = await cartPage(CART, { cart: { show_primary_checkout_button: false } });
        assert.equal(textOf(outerHtml(none, 'a', classed('rf-cart__checkout'))), 'Click here to continue shopping', 'stock\'s words (cart.continue_shopping)');
        assert.equal(findTags(none).filter(tag => 'data-rf-cartbar' in tag.attrs).length, 0);
    });

    // cart-group.html and cart-row.html read `settings` and `customer` from inside cart-lines.html's
    // {{#each cart.items}}, where the context is the line, so the guest rule never holds and every
    // price shows (stock content.html read ../settings). A theme finding; this case fails until
    // the lines pass the rule down.
    it('hides the price each and the totals from guests, as the summary hides Check out', async () => {
        const guest = await cartPage(CART, { context: { settings: { hide_price_from_guests: true, money: { currency_token: '$' } } } });
        assert.equal(textOf(outerHtml(guest, 'p', classed('rf-cart-group__price'))), '', 'no price each');
        assert.equal(elementsHtml(guest, 'span', classed('rf-cart-row__total')).length, 0, 'no totals');
    });

    it('shows the empty box in place of the lines, with no summary and no bar (cart-empty.html; dead-ends.test.mjs has the words)', async () => {
        const html = await cartPage([], { context: { categories: [] } });
        assert.ok(outerHtml(html, 'div', has('data-rf-cart-empty')), 'the empty box');
        assert.match(findTags(outerHtml(html, 'div', has('data-cart')), 'div')[0].attrs.class, /(^|\s)rf-cart__body--empty(\s|$)/);
        assert.equal(outerHtml(html, 'aside', classed('rf-cart__summary')), null);
        assert.equal(findTags(html).filter(tag => 'data-rf-cartbar' in tag.attrs).length, 0);
        assert.equal(findTags(html).filter(tag => 'data-cart-content' in tag.attrs).length, 0);
        assert.equal(textOf(outerHtml(html, 'h1')), 'Your box');
    });

    it('renders the fixture carts: twelve patterns in 23 lines, and the discounted one with struck totals', async () => {
        const twelve = await renderPartial('pages/cart', { ...TWELVE, settings: { ...TWELVE.settings, money: { currency_token: '$' } } });
        assert.equal(groups(twelve).length, 12);
        assert.equal(rows(twelve).length, 23);
        assert.equal(textOf(outerHtml(twelve, 'p', has('data-rf-cart-count'))), '82 flies, 12 patterns');
        assert.equal(findTags(twelve, 'ul').filter(tag => 'data-rf-cart-multi' in tag.attrs).length, 6, 'six patterns in more than one size');
        assert.deepEqual(unbalancedTags(twelve), []);
        const discounted = await renderPartial('pages/cart', { ...DISCOUNTED, settings: { ...DISCOUNTED.settings, money: { currency_token: '$' } } });
        assert.ok(elementsHtml(discounted, 's', classed('rf-cart-row__was')).length > 0, 'struck list totals');
        assert.equal(textOf(outerHtml(discounted, 'span', has('data-rf-cartbar-total'))), '$1,095.50');
    });
});

describe('the wording', () => {
    it('is "Your box", counted in flies and patterns, with "Keep shopping" (lang reelflies.cart)', () => {
        assert.equal(LANG.cart.heading, 'Your box');
        assert.equal(LANG.cart.summary, 'Order summary');
        assert.equal(LANG.cart.keep_shopping, 'Keep shopping');
        assert.equal(LANG.cart.each, 'each');
        assert.deepEqual([LANG.js.fly, LANG.js.flies, LANG.js.pattern, LANG.js.patterns], ['fly', 'flies', 'pattern', 'patterns']);
    });

    it('has no "fly-only" in lang/en.json or the templates (UX-12)', () => {
        const lang = fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8');
        assert.doesNotMatch(lang, /fly[- ]only/i);
        const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
        for (const file of walk(path.join(THEME_DIR, 'templates'))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /fly[- ]only/i, file);
    });
});
