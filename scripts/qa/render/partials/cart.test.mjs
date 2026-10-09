// The cart's templates (ticket 41; spec module 18; stories 45, 50, 51, 52, 54, 55, 56): the lines
// (components/reelflies/cart-lines.html, through stock cart/content.html's hook), the heading
// and its count (cart-title.html, through cart/page-title.html), the promotion's messages
// (cart-messages.html, through cart/status-messages.html), and the summary panel with Check out,
// the coupon link, the promise line and the phone bar (cart-summary.html, through cart/totals.html).
//
//   node --test scripts/qa/render/partials/cart.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

// A cart line as the cart page's context gives it (cart.items), with the fields the templates read.
const line = (id, productId, name, size, {
    qty = 1, price = 1.25, brand = 'ReelFlies', options,
} = {}) => ({
    id,
    product_id: productId,
    name,
    url: `https://reelflies.ca/${name.toLowerCase().replace(/[^a-z]+/g, '-')}/`,
    type: 'PhysicalItem',
    can_modify: true,
    quantity: qty,
    min_purchase_quantity: 0,
    max_purchase_quantity: 0,
    brand: brand ? { name: brand } : null,
    image: { data: `https://cdn11.bigcommerce.com/s-fixture/images/stencil/{:size}/products/${productId}/1/fly.jpg`, alt: name },
    price: { value: price, formatted: `$${price.toFixed(2)}` },
    total: { value: price * qty, formatted: `$${(price * qty).toFixed(2)}` },
    options: options ?? (size ? [{ name: 'Fly Sizes', value: size }] : []),
});

const CART = [
    line('a1', 5663, 'Parachute Adams', '14', { qty: 6 }),
    line('a2', 5663, 'Parachute Adams', '12', { qty: 12 }),
    line('b1', 4904, 'Beadhead Krystal Bugger Black', '8', { qty: 4, price: 1.5 }),
    line('a3', 5663, 'Parachute Adams', '16', { qty: 6 }),
];
const TOTALS = {
    sub_total: { formatted: '$36.50' }, grand_total: { formatted: '$36.50' }, quantity: 28, show_primary_checkout_button: true, shipping_handling: null, taxes: [],
};
const page = (template, cart = CART, extra = {}) => renderPartial(template, {
    cart: {
        items: cart, ...TOTALS, quantity: cart.reduce((sum, item) => sum + item.quantity, 0), ...extra.cart,
    },
    urls: { checkout: { single_address: '/checkout' }, cart: '/cart.php', home: '/' },
    settings: { hide_price_from_guests: false },
    ...extra.context,
}, { variation: 'ReelFlies CA' });
const groups = html => elementsHtml(html, 'li', attrs => 'data-rf-cart-group' in attrs);
const rows = html => elementsHtml(html, 'li', attrs => 'data-rf-cart-row' in attrs);
const rowIds = html => rows(html).map(row => findTags(row, 'input').find(tag => tag.attrs.id?.startsWith('qty-'))?.attrs.id.slice(4) ?? 'gift');
const gift = id => ({
    id, name: 'Gift certificate', type: 'GiftCertificate', quantity: 1, can_modify: false, edit_url: `/giftcertificates.php?action=edit&id=${id}`, price: { value: 25, formatted: '$25.00' }, total: { value: 25, formatted: '$25.00' }, options: [],
});

describe('the cart lines, grouped on the server (components/reelflies/cart-lines.html; story 50)', () => {
    it('renders one group per pattern, in the order each was first added, with every line of it and no line twice', async () => {
        const html = await page('components/cart/content');
        const found = groups(html);
        assert.equal(found.length, 2);
        assert.deepEqual(found.map(group => textOf(outerHtml(group, 'h2', () => true))), ['Parachute Adams', 'Beadhead Krystal Bugger Black']);
        assert.deepEqual(found.map(rowIds), [['a1', 'a2', 'a3'], ['b1']], 'each group\'s rows in the store\'s order; cart-groups.js sorts them');
        assert.deepEqual(unbalancedTags(html), []);
        // cart-feedback.js removes every [data-rf-cart-error] before it shows one: only its errors.
        assert.equal(findTags(html).filter(tag => 'data-rf-cart-error' in tag.attrs).length, 0);
        assert.equal(findTags(html, 'ul').find(tag => 'data-rf-cart-lines' in tag.attrs).attrs['data-rf-cart-error-words'], 'Something went wrong. Try again.');
    });

    it('marks a group of several rows, which waits out of view for cart-groups.js, and leaves a single row alone', async () => {
        const [adams, bugger] = groups(await page('components/cart/content')).map(group => findTags(group, 'li')[0].attrs);
        assert.ok('data-rf-cart-multi' in adams);
        assert.ok(!('data-rf-cart-multi' in bugger));
    });

    it('gives each row its size for the sort, and the stock attributes cart.js reads', async () => {
        const html = await page('components/cart/content');
        const tags = rows(html).map(row => findTags(row, 'li')[0].attrs);
        assert.deepEqual(tags.map(attrs => attrs['data-rf-size']), ['14', '12', '16', '8']);
        assert.ok(tags.every(attrs => 'data-item-row' in attrs), 'cart.js counts the rows by data-item-row');
        const [list] = findTags(outerHtml(html, 'ul', attrs => 'data-rf-cart-lines' in attrs), 'ul');
        assert.equal(list.attrs['data-cart-quantity'], '28', 'cart.js reads the quantity from the list');
    });

    it('opens the group with its head: a 64px 3:2 photo and the name, both linked to the product, and the unit price (story 56)', async () => {
        const [adams] = groups(await page('components/cart/content'));
        const head = adams.slice(0, adams.indexOf('rf-cart-rows'));
        assert.deepEqual(findTags(head, 'a').map(tag => tag.attrs.href), ['https://reelflies.ca/parachute-adams/', 'https://reelflies.ca/parachute-adams/']);
        const [img] = findTags(head, 'img');
        assert.equal(img.attrs.width, '64');
        assert.equal(img.attrs.height, '43');
        assert.equal(img.attrs.alt, '', 'decorative: the name beside it is the link\'s text');
        assert.match(textOf(outerHtml(head, 'p', attrs => /rf-cart-unit/.test(attrs.class || ''))), /^\$1\.25 each$/);
    });

    it('marks a pattern whose sizes are priced differently, where each row then shows its own unit price (Kaufmann\'s Golden Stone)', async () => {
        const stone = [line('k1', 4831, 'Kaufmann\'s Golden Stone', '6', { price: 2.95 }), line('k2', 4831, 'Kaufmann\'s Golden Stone', '4', { price: 3.25 })];
        const [group] = groups(await page('components/cart/content', [...stone, CART[0]]));
        assert.ok('data-rf-prices-vary' in findTags(group, 'li')[0].attrs);
        assert.deepEqual(rows(group).map(row => textOf(outerHtml(row, 'span', attrs => /rf-cart-row-unit/.test(attrs.class || '')))), ['$2.95 each', '$3.25 each']);
        const [adams] = groups(await page('components/cart/content')).map(found => findTags(found, 'li')[0].attrs);
        assert.ok(!('data-rf-prices-vary' in adams));
    });

    it('shows a discounted unit price as stock did: the list price struck through, then the price', async () => {
        const sale = { ...line('s1', 77, 'Royal Wulff', '12', { price: 1.25 }), price_discounted: { value: 1, formatted: '$1.00' } };
        const [group] = groups(await page('components/cart/content', [sale]));
        const unit = outerHtml(group, 'p', attrs => /rf-cart-unit/.test(attrs.class || ''));
        assert.match(unit, /<span class="price--discounted">\$1\.25<\/span>/);
        assert.match(textOf(unit), /\$1\.00 each$/);
    });

    it('keeps the stock controls cart.js drives, each named by pattern and size: the stepper, the quantity field and Remove (story 68)', async () => {
        const [first] = rows(await page('components/cart/content'));
        const buttons = findTags(first, 'button');
        assert.deepEqual(buttons.map(tag => tag.attrs['data-action'] ?? 'remove'), ['dec', 'inc', 'remove']);
        assert.ok(buttons.slice(0, 2).every(tag => 'data-cart-update' in tag.attrs && tag.attrs['data-cart-itemid'] === 'a1'));
        assert.deepEqual(elementsHtml(first, 'span', attrs => /is-srOnly/.test(attrs.class || '')).map(textOf), [
            'Decrease the quantity of Parachute Adams, size 14', 'Increase the quantity of Parachute Adams, size 14',
        ]);
        const remove = buttons[2];
        assert.match(remove.attrs.class, /(^|\s)cart-remove(\s|$)/);
        assert.equal(remove.attrs['aria-label'], 'Remove Parachute Adams, size 14');
        const [input] = findTags(first, 'input');
        assert.equal(input.attrs.id, 'qty-a1');
        assert.equal(input.attrs['data-action'], 'manualQtyChange');
        assert.equal(input.attrs['aria-label'], 'Quantity of Parachute Adams, size 14');
        assert.equal(textOf(outerHtml(first, 'span', attrs => /rf-cart-sizetag/.test(attrs.class || ''))), 'Size 14');
    });

    it('names a line with no Fly Size by its pattern alone, and shows its other options', async () => {
        const [only] = rows(await page('components/cart/content', [line('c1', 4398, 'Fly Box', null, { options: [{ name: 'Colour', value: 'Green' }] })]));
        assert.equal(findTags(only, 'li')[0].attrs['data-rf-size'], '');
        assert.equal(findTags(only, 'button').find(tag => /cart-remove/.test(tag.attrs.class)).attrs['aria-label'], 'Remove Fly Box');
        assert.match(textOf(only), /Colour: Green/);
    });

    it('gives each gift certificate a group of its own', async () => {
        const html = await page('components/cart/content', [gift('g1'), CART[0], gift('g2')], { context: { theme_settings: { default_image_gift_certificate: 'img/GiftCertificate.png' } } });
        assert.equal(groups(html).length, 3);
        assert.deepEqual(groups(html).map(group => rows(group).length), [1, 1, 1]);
    });
});

describe('the heading and its count (components/reelflies/cart-title.html; story 51)', () => {
    const title = async (cart, flyBrands = 'ReelFlies') => {
        const html = await page('components/cart/page-title', cart, { context: { theme_settings: { rf_fly_brands: flyBrands } } });
        const box = outerHtml(html, 'div', attrs => 'data-cart-page-title' in attrs);
        return { heading: textOf(outerHtml(box, 'h1', () => true)), count: textOf(outerHtml(box, 'p', () => true)), box };
    };

    it('reads "Your cart", with flies and patterns when every line is a fly brand, in one element cart.js replaces', async () => {
        const { heading, count, box } = await title(CART);
        assert.equal(heading, 'Your cart');
        assert.equal(count, '28 flies, 2 patterns');
        assert.ok(box, 'the heading and the count share the data-cart-page-title element');
    });

    it('says items and products when any line isn\'t a fly brand, or has none (Shaun\'s brand rule)', async () => {
        assert.equal((await title([...CART, line('d1', 5460, 'Mustad Streamer Hooks', null, { brand: 'Mustad' })])).count, '29 items, 3 products');
        assert.equal((await title([line('e1', 1, 'Adams', '14', { brand: null })])).count, '1 item, 1 product');
        assert.equal((await title(CART, '')).count, '28 items, 2 products', 'no fly brands named');
    });

    it('counts each gift certificate as a product of its own', async () => {
        assert.equal((await title([gift('g1'), gift('g2'), ...CART])).count, '30 items, 4 products');
    });

    it('takes a second fly brand from rf_fly_brands, and counts one fly and one pattern in the singular', async () => {
        assert.equal((await title([line('f1', 2, 'Red Devil', '4', { brand: 'ReelFlies Signature' })], 'ReelFlies, ReelFlies Signature')).count, '1 fly, 1 pattern');
    });
});

describe('the promotion\'s messages (components/reelflies/cart-messages.html; story 52)', () => {
    it('shows each status message as a plain line with the store\'s own words, no alert box', async () => {
        const html = await page('components/cart/status-messages', CART, { cart: { status_messages: [{ message: 'Add <strong>$23.50</strong> more of flies for free standard shipping in Canada.' }] } });
        assert.equal(findTags(html, 'div').filter(tag => /alertBox/.test(tag.attrs.class || '')).length, 0);
        const [message] = findTags(html, 'p');
        assert.match(message.attrs.class, /(^|\s)rf-cart-message(\s|$)/);
        assert.match(html, /<strong>\$23\.50<\/strong>/, 'the store\'s markup stays');
    });

    it('holds no threshold of its own: the ReelFlies cart code never says 60', () => {
        const files = [
            'templates/components/reelflies/cart-messages.html', 'templates/components/reelflies/cart-summary.html', 'templates/components/reelflies/cart-lines.html',
            'templates/components/reelflies/cart-row.html', 'templates/components/reelflies/cart-counts.html', 'templates/components/reelflies/cart-title.html',
            'assets/js/theme/reelflies/cart-groups.js', 'assets/js/theme/reelflies/cart-count.js', 'assets/scss/reelflies/_cart.scss',
        ];
        for (const file of files) assert.doesNotMatch(fs.readFileSync(path.resolve(file), 'utf8'), /\b60\b/, file);
    });
});

describe('the summary (components/reelflies/cart-summary.html)', () => {
    const summary = async (extra = {}) => page('components/cart/totals', CART, extra);

    it('opens with "Order summary" and ends as the reference does: Check out, the promise line with its check, then the coupon link (stories 45 and 54)', async () => {
        const html = await summary();
        assert.equal(textOf(outerHtml(html, 'h2', () => true)), 'Order summary');
        const checkout = html.indexOf('data-primary-checkout-now-action');
        const promise = html.indexOf('We stand behind every fly we sell.');
        const coupon = html.indexOf('Have a coupon code?');
        assert.ok(checkout > 0 && promise > checkout && coupon > promise, `${checkout} ${promise} ${coupon}`);
        assert.match(outerHtml(html, 'p', attrs => /rf-cart-promise/.test(attrs.class || '')), /#rf-icon-check/);
    });

    it('keeps every class, id, name and control stock cart.js binds in the coupon form it copies (cart/coupon-input.html)', async () => {
        const ours = await summary();
        const stock = await renderPartial('components/cart/coupon-input', { urls: { cart: '/cart.php' } }, { variation: 'ReelFlies CA' });
        const hooks = html => {
            const tags = ['button', 'div', 'form', 'input', 'label'].flatMap(name => findTags(html, name));
            return {
                classes: [...new Set(tags.flatMap(tag => (tag.attrs.class || '').split(/\s+/)).filter(name => /^coupon-/.test(name)))].sort(),
                ids: tags.map(tag => tag.attrs.id).filter(Boolean).sort(),
                names: tags.map(tag => tag.attrs.name).filter(Boolean).sort(),
                controls: tags.map(tag => tag.attrs['aria-controls']).filter(Boolean).sort(),
                labels: tags.map(tag => tag.attrs.for).filter(Boolean).sort(),
            };
        };
        assert.deepEqual(hooks(outerHtml(ours, 'div', attrs => /rf-cart-coupon/.test(attrs.class || ''))), hooks(stock));
    });

    it('keeps the attributes of stock cart.html\'s Check out link it copies', async () => {
        const source = fs.readFileSync(path.resolve('templates/pages/cart.html'), 'utf8');
        const stock = source.match(/<a\s[^>]*data-primary-checkout-now-action[^>]*>/)[0];
        const names = tag => [...tag.matchAll(/\s([a-z-]+)(?==|\s|>)/g)].map(match => match[1]);
        const [ours] = findTags(await summary(), 'a').filter(tag => 'data-primary-checkout-now-action' in tag.attrs);
        for (const name of names(stock)) assert.ok(name in ours.attrs, name);
    });

    it('keeps the coupon field hidden until its link is used: the stock toggle and form cart.js binds', async () => {
        const html = await summary();
        const [link] = findTags(html, 'button').filter(tag => /coupon-code-add/.test(tag.attrs.class || ''));
        assert.ok(link, 'the stock .coupon-code-add toggle, a button');
        assert.equal(link.attrs.type, 'button');
        const container = findTags(html, 'div').find(tag => /(^|\s)coupon-code(\s|$)/.test(tag.attrs.class || ''));
        assert.equal(container.attrs['aria-hidden'], 'true');
        assert.ok('hidden' in container.attrs, 'hidden until the link is used');
        assert.ok(findTags(html, 'form').some(tag => /coupon-form/.test(tag.attrs.class || '')));
    });

    it('carries the phone bar: the order total for the flies in the cart, by the brand rule, and Check out', async () => {
        const bar = async (cart, flyBrands = 'ReelFlies') => outerHtml(await page('components/cart/totals', cart, { context: { theme_settings: { rf_fly_brands: flyBrands } } }), 'div', attrs => 'data-rf-cart-bar' in attrs);
        const flies = await bar(CART);
        assert.match(textOf(flies), /^\$36\.50 for 28 flies/);
        assert.ok(findTags(flies, 'a').some(tag => tag.attrs.href === '/checkout'));
        assert.match(textOf(await bar([...CART, line('d1', 5460, 'Mustad Streamer Hooks', null, { brand: 'Mustad' })])), /^\$36\.50 for 29 items/);
    });

    it('offers sign-in instead of Check out when prices are hidden from guests', async () => {
        const html = await summary({ context: { settings: { hide_price_from_guests: true }, urls: { auth: { login: '/login.php' }, checkout: { single_address: '/checkout' }, cart: '/cart.php' } } });
        assert.equal(html.indexOf('data-primary-checkout-now-action'), -1);
    });
});

// The whole page, not just the partials: inside a page's {{#partial "page"}} block @root is empty,
// so anything that read the root's settings would lose them here and nowhere else (ticket 31's
// lesson).
describe('the whole cart page (pages/cart)', () => {
    it('renders the count by the brand rule, the lines, the summary and the phone bar, once each', async () => {
        const html = await page('pages/cart', CART, { context: { theme_settings: { rf_fly_brands: 'ReelFlies' }, breadcrumbs: [] } });
        assert.equal(textOf(outerHtml(html, 'p', attrs => 'data-rf-cart-count' in attrs)), '28 flies, 2 patterns');
        assert.equal(groups(html).length, 2);
        assert.equal(rows(html).length, 4);
        assert.equal(findTags(html, 'div').filter(tag => 'data-rf-cart-bar' in tag.attrs).length, 1);
        assert.equal(findTags(html, 'a').filter(tag => 'data-primary-checkout-now-action' in tag.attrs).length, 1, 'Check out once: stock cart.html\'s is skipped');
        assert.equal(findTags(html, 'h1').length, 1);
    });
});

describe('the wording', () => {
    it('has no "fly-only" in lang/en.json or the templates (UX-12)', () => {
        const lang = fs.readFileSync(path.resolve('lang/en.json'), 'utf8');
        assert.doesNotMatch(lang, /fly[- ]only/i);
        const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]));
        for (const file of walk(path.resolve('templates'))) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /fly[- ]only/i, file);
    });
});
