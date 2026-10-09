// The product page layout (ticket 39; spec module 15; O14, O23, R6, SEO-8, UX-11, UX-12, UX-20;
// stories 36, 44 to 49 and 70): stock products/product-view.html's hooks on the product page
// (pages/product.html sets rf_product_page first), and pages/product.html's related grid. The page
// is the fixture page's product, the reference's Adams Parachute and its four related patterns
// (render/pages/product-page/fixtures/adams.json). Quick view renders the same product view
// without the flag, and keeps stock's.
//
//   node --test scripts/qa/render/partials/product-page.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, readFixture, renderPartial } from '../render.mjs';

const FIXTURE = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json'));
const CONTEXT = FIXTURE.page_context;
const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.product;

// The product page, with `product` laid over the fixture's product and `theme`, `settings` and
// `context` over the rest.
const productPage = ({
    product = {}, theme = {}, settings = {}, context = {},
} = {}) => renderPartial('pages/product', {
    ...CONTEXT,
    ...context,
    product: { ...CONTEXT.product, ...product },
    settings: { ...CONTEXT.settings, ...settings },
    theme_settings: { ...CONTEXT.theme_settings, ...theme },
});
const WITH_LISTS = { id: 1, wishlists: [{ name: 'Spring', add_url: '/wishlist.php?action=add&wishlistid=7', num_items: '2' }] };
const quickView = ({ product = {} } = {}) => renderPartial('components/products/quick-view', {
    ...CONTEXT,
    product: { ...CONTEXT.product, ...product },
});

const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const productView = html => outerHtml(html, 'div', hasClass('productView'));
const buyBox = html => outerHtml(html, 'div', attrs => 'data-rf-product-buy' in attrs);
const details = html => outerHtml(html, 'div', attrs => 'data-rf-product-details' in attrs);
const mainImage = html => findTags(html, 'img').filter(tag => 'data-main-image' in tag.attrs);
const related = html => outerHtml(html, 'section', attrs => 'data-rf-related' in attrs);
const sections = html => elementsHtml(details(html) || '', 'details', () => true);
const section = (html, name) => sections(html).find(each => findTags(each, 'details')[0].attrs['data-rf-details'] === name);
// Each marker's place in `html`, which must exist, in the order given.
const inOrder = (html, markers) => {
    const at = markers.map(marker => [marker, html.indexOf(marker)]);
    for (const [marker, index] of at) assert.ok(index >= 0, `${marker} is there`);
    for (let i = 1; i < at.length; i++) assert.ok(at[i][1] > at[i - 1][1], `${at[i][0]} comes after ${at[i - 1][0]}`);
};

describe('the product page\'s settings (config.json)', () => {
    it('has the main image at 760x507, no weight row and four related patterns (O14; R6)', () => {
        assert.equal(config.settings.product_size, '760x507');
        assert.equal(config.settings.show_product_weight, false);
        assert.equal(config.settings.productpage_related_products_count, 4);
    });

    it('keeps ticket 24\'s quick payment buttons setting as it was: this ticket only checks the page', () => {
        assert.equal(config.settings.show_quick_payment_buttons, true);
    });

    it('asks the store for no "Customers Also Viewed" list, which the page no longer shows (pages/product.html\'s front matter)', () => {
        const [, front] = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/product.html'), 'utf8').split(/^---$/m);
        assert.match(front, /related_products:/);
        assert.doesNotMatch(front, /similar_by_views/);
    });
});

describe('the layout (product-view.html\'s hooks, on the product page)', () => {
    it('puts the photos, the buy box and the details in that order, the buy box one wrapper for the sticky column (story 46)', async () => {
        const html = await productPage();
        const view = productView(html);
        assert.ok(view, 'the product view');
        assert.match(findTags(view, 'div')[0].attrs.class, /(^|\s)rf-product-view(\s|$)/);
        inOrder(view, ['class="productView-images"', 'data-rf-product-buy', 'data-rf-product-details']);
        const box = buyBox(html);
        for (const marker of ['productView-details product-data', 'productView-details product-options', '<h1', 'data-cart-item-add']) assert.ok(box.includes(marker), marker);
        assert.ok(!box.includes('productView-images'), 'the photos are outside the buy box');
        assert.ok(!box.includes('data-rf-product-details'), 'the details are outside the buy box');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('orders the buy box as the reference: title, price with "/ fly", shipping line, pills, quantity and button, promise, Save to wish list', async () => {
        inOrder(buyBox(await productPage()), [
            '<h1', 'class="productView-price"', 'rf-price-unit', 'data-rf-ship-line', 'data-rf-pills="size"', 'id="form-action-addToCart"', 'data-rf-promise', 'data-rf-wishlist',
        ]);
    });

    it('shows no weight row, and no share links in the buy box (story 50\'s criterion; the ticket\'s buy box order)', async () => {
        const html = await productPage();
        assert.ok(CONTEXT.product.weight, 'the fixture has a weight');
        assert.ok(!html.includes('data-product-weight'));
        assert.equal(findTags(productView(html), 'ul').filter(tag => hasClass('socialLinks')(tag.attrs)).length, 0);
    });

    it('shows no wallet buttons when the store sends none (ticket 24 owns show_quick_payment_buttons)', async () => {
        const wallet = outerHtml(await productPage(), 'div', attrs => 'data-add-to-cart-wallet-buttons' in attrs);
        assert.ok(wallet, 'stock\'s wallet box');
        assert.equal(findTags(wallet.replace(/^<div[^>]*>/, '')).length, 0);
    });

    it('stacks the review messages (stock\'s alerts) in one box above the photos, so two never share a cell', async () => {
        const messages = [{ error: 'Please enter a title.' }, { error: 'Please choose a rating.' }];
        const view = productView(await productPage({ product: { reviews: { ...CONTEXT.product.reviews, messages } } }));
        const alerts = outerHtml(view, 'div', attrs => 'data-rf-product-alerts' in attrs);
        assert.ok(alerts, 'one box for the messages');
        assert.equal(elementsHtml(alerts, 'div', hasClass('alertBox')).length, 2);
        for (const { error } of messages) assert.equal(view.split(error).length, 2, `"${error}" once, in the box`);
        inOrder(view, ['data-rf-product-alerts', 'class="productView-images"']);
        assert.ok(!(await quickView()).includes('data-rf-product-alerts'), 'Quick view keeps stock\'s');
    });
});

describe('the main image (components/reelflies/product-image.html)', () => {
    it('loads first: eager, fetchpriority high, a srcset, sizes, width and height, and no lazysizes class (story 70; SEO-8)', async () => {
        const [img] = mainImage(await productPage());
        assert.ok(img, 'the main image');
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.equal(img.attrs.loading, 'eager');
        assert.equal(img.attrs.sizes, '(min-width: 801px) 50vw, 100vw');
        assert.equal(img.attrs.width, '760');
        assert.equal(img.attrs.height, '507');
        assert.doesNotMatch(img.attrs.class, /(^|\s)lazyload(\s|$)/);
        assert.match(img.attrs.class, /(^|\s)productView-image--default(\s|$)/, 'stock\'s class, which stock\'s styles and the gallery read');
        assert.equal(img.attrs['data-srcset'], undefined);
        const widths = img.attrs.srcset.split(',').map(candidate => candidate.trim().split(/\s+/)[1]);
        assert.deepEqual(widths, ['320w', '480w', '640w', '760w', '960w', '1280w', '1520w']);
        assert.match(img.attrs.src, /\/stencil\/760x507\/products\/4877\//);
        assert.equal(img.attrs.alt, CONTEXT.product.main_image.alt);
    });

    it('is the page\'s only fetchpriority="high"; the thumbnails stay lazy', async () => {
        const html = await productPage();
        assert.equal(findTags(html).filter(tag => tag.attrs.fetchpriority === 'high').length, 1);
        const thumbs = findTags(outerHtml(html, 'ul', hasClass('productView-thumbnails')), 'img');
        assert.equal(thumbs.length, 2);
        for (const thumb of thumbs) assert.match(thumb.attrs.class, /(^|\s)lazyload(\s|$)/);
    });

    it('outlines the shown photo\'s thumbnail as the page loads, as the reference does; Quick view keeps stock\'s', async () => {
        const active = html => findTags(outerHtml(html, 'ul', hasClass('productView-thumbnails')), 'a').map(link => hasClass('is-active')(link.attrs));
        assert.deepEqual(active(await productPage()), [true, false]);
        assert.deepEqual(active(await productPage({ product: { main_image: CONTEXT.product.images[1] } })), [false, true], 'the main image\'s, wherever it is in the row');
        assert.deepEqual(active(await quickView()), [false, false]);
    });

    it('takes its alt from the product\'s name when the photo has none', async () => {
        const [img] = mainImage(await productPage({ product: { main_image: { ...CONTEXT.product.main_image, alt: '' } } }));
        assert.equal(img.attrs.alt, 'Adams Parachute Dry Fly');
    });

    it('shows the theme\'s default image, as stock does, with the same priority, when the product has no photo', async () => {
        const html = await productPage({ product: { main_image: null, images: [] } });
        const [img] = mainImage(html);
        assert.match(img.attrs.src, /default-product/);
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.ok(img.attrs.width && img.attrs.height && img.attrs.srcset && img.attrs.sizes);
        assert.equal(findTags(html).filter(tag => tag.attrs.fetchpriority === 'high').length, 1);
    });
});

describe('Quick view (products/quick-view.html, without the flag)', () => {
    it('keeps stock\'s product view: the lazy main image, the tabs, the share links and the wish-list dropdown', async () => {
        const html = await quickView();
        assert.ok(!html.includes('data-rf-product-buy'));
        assert.ok(!html.includes('rf-product-view'));
        assert.ok(!html.includes('data-rf-product-details'));
        assert.ok(!html.includes('data-rf-ship-line'));
        const [img] = mainImage(html);
        assert.match(img.attrs.class, /(^|\s)lazyload(\s|$)/);
        assert.equal(img.attrs.fetchpriority, undefined);
        assert.ok(findTags(html, 'ul').some(tag => 'data-tab' in tag.attrs), 'the description tabs');
        assert.ok(findTags(html, 'ul').some(tag => hasClass('socialLinks')(tag.attrs)), 'the share links');
        assert.ok(findTags(html, 'a').some(tag => tag.attrs['data-dropdown'] === 'wishlist-dropdown'), 'the wish-list dropdown');
        assert.deepEqual(unbalancedTags(html), []);
    });
});

describe('the shipping line (components/reelflies/shipping-line.html; story 44; UX-12)', () => {
    const CALLER = 'rf-test/shipping-line';
    const line = settings => renderPartial(CALLER, { theme_settings: settings }, {
        overrides: { [CALLER]: '{{> components/reelflies/shipping-line threshold=theme_settings.t rate=theme_settings.r expedited=theme_settings.e}}' },
    });
    const text = html => textOf(outerHtml(html, 'p', attrs => 'data-rf-ship-line' in attrs) || '');

    it('says the free-shipping sentence only while there are no rates: no placeholder figures (decision 12\'s fallback)', async () => {
        assert.equal(text(await line({ t: '60', r: '', e: '' })), 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.');
    });

    it('gives the standard rate and the Expedited "from" price once they are set', async () => {
        assert.equal(
            text(await line({ t: '60', r: '9.95', e: '14.95' })),
            'Standard shipping in Canada $9.95, free on fly orders over $60 (fly boxes and gear not included). Tracked Expedited from $14.95.',
        );
        assert.equal(text(await line({ t: '60', r: '9.95', e: '' })), 'Standard shipping in Canada $9.95, free on fly orders over $60 (fly boxes and gear not included).');
        assert.equal(text(await line({ t: '60', r: '', e: '14.95' })), 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included. Tracked Expedited from $14.95.');
    });

    it('renders nothing without a threshold (ReelFlies US: .com keeps its flat rate), and never says "fly-only"', async () => {
        assert.equal((await line({ t: '', r: '', e: '' })).trim(), '');
        assert.equal((await line({ t: '  ', r: '9.95', e: '' })).trim(), '');
        for (const words of Object.values(lang)) assert.doesNotMatch(words, /fly-only/i);
    });

    it('sits near the price on the product page with the base settings\' $60, carrying no figure it wasn\'t given', async () => {
        const html = await productPage();
        const shipping = outerHtml(buyBox(html), 'p', attrs => 'data-rf-ship-line' in attrs);
        assert.equal(textOf(shipping), 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.');
        assert.doesNotMatch(shipping, /undefined|\{|X\.XX/);
    });
});

describe('the price unit on the product page (31\'s price-unit.html)', () => {
    it('says "/ fly" after the price of a fly, and nothing on gear', async () => {
        assert.equal(textOf(outerHtml(buyBox(await productPage()), 'span', hasClass('rf-price-unit'))), '/ fly');
        const gear = await productPage({ product: { category: ['Fly Gear/Fly Boxes'] } });
        assert.ok(!buyBox(gear).includes('rf-price-unit'));
    });

    it('shows no unit with the price hidden from guests', async () => {
        const html = await productPage({ settings: { hide_price_from_guests: true } });
        assert.ok(!buyBox(html).includes('rf-price-unit'));
    });
});

describe('the end of the buy box (components/reelflies/buy-box-end.html)', () => {
    it('puts the promise line under Add to cart (story 45; UX-11)', async () => {
        const box = buyBox(await productPage());
        inOrder(box, ['id="add-to-cart-wrapper"', 'data-rf-promise']);
        assert.equal(textOf(outerHtml(box, 'p', attrs => 'data-rf-promise' in attrs)), 'We stand behind every fly we sell.');
    });

    it('gives a guest one "Save to wish list" button, which posts stock\'s wish-list form to the product\'s add URL (story 49; UX-20)', async () => {
        const html = await productPage();
        const form = outerHtml(outerHtml(buyBox(html), 'div', attrs => 'data-rf-wishlist' in attrs), 'form', () => true);
        const [tag] = findTags(form, 'form');
        assert.equal(decodeHtml(tag.attrs.action), CONTEXT.product.add_to_wishlist_url);
        assert.equal(tag.attrs.method, 'post');
        assert.ok('data-wishlist-add' in tag.attrs, 'stock\'s marker, which product-details-base.js reads');
        const buttons = findTags(form, 'button');
        assert.equal(buttons.length, 1);
        assert.equal(buttons[0].attrs.type, 'submit');
        assert.equal(textOf(form), 'Save to wish list');
        assert.ok(!findTags(html, 'a').some(link => link.attrs['data-dropdown'] === 'wishlist-dropdown'));
    });

    it('gives a customer with wish lists stock\'s dropdown, to choose one, under the same "Save to wish list" (story 49)', async () => {
        const wish = outerHtml(buyBox(await productPage({ context: { customer: WITH_LISTS } })), 'div', attrs => 'data-rf-wishlist' in attrs);
        const trigger = outerHtml(wish, 'a', attrs => attrs['data-dropdown'] === 'wishlist-dropdown');
        assert.ok(trigger, 'the dropdown\'s trigger');
        assert.equal(textOf(trigger), 'Save to wish list');
        assert.ok(findTags(wish, 'input').some(input => input.attrs.value === 'Spring'), 'the customer\'s list');
        assert.doesNotMatch(textOf(wish), /Add to Wish List/);
        assert.equal(findTags(wish, 'form').length, 1);
    });

    it('holds the dropdown\'s copy (components/reelflies/wishlist-dropdown.html) to stock\'s, but for its label', async () => {
        const shape = html => findTags(html).map(tag => `${tag.name} ${JSON.stringify(tag.attrs)}`);
        for (const customer of [WITH_LISTS, { id: 1, wishlists: [] }]) {
            const context = { ...CONTEXT, customer };
            const ours = await renderPartial('components/reelflies/wishlist-dropdown', context); // eslint-disable-line no-await-in-loop
            const stock = await renderPartial('components/common/wishlist-dropdown', context); // eslint-disable-line no-await-in-loop
            assert.deepEqual(shape(ours), shape(stock));
            assert.equal(textOf(ours), textOf(stock).replace('Add to Wish List', 'Save to wish list'));
        }
    });

    it('shows nothing with wish lists off', async () => {
        assert.ok(!buyBox(await productPage({ settings: { show_wishlist: false } })).includes('data-rf-wishlist'));
        assert.ok(!buyBox(await productPage({ settings: { show_wishlist: false }, context: { customer: WITH_LISTS } })).includes('data-rf-wishlist'));
    });
});

describe('the details under the photos (components/reelflies/product-details.html; story 46; R6)', () => {
    it('renders three sections: "About this fly" open with the whole description, the other two closed', async () => {
        const html = await productPage();
        const all = sections(html);
        assert.deepEqual(all.map(each => findTags(each, 'details')[0].attrs['data-rf-details']), ['about', 'shipping', 'hooks']);
        const [about, shipping, hooks] = all.map(each => findTags(each, 'details')[0]);
        assert.ok('open' in about.attrs);
        assert.ok(!('open' in shipping.attrs));
        assert.ok(!('open' in hooks.attrs));
        for (const each of all) assert.equal(findTags(each, 'summary').length, 1, 'one summary, which the keyboard opens');
        assert.ok(section(html, 'about').includes(CONTEXT.product.description));
        assert.equal(textOf(outerHtml(section(html, 'about'), 'summary') || ''), 'About this fly');
    });

    it('words shipping from the threshold, and links "Hooks and tying" to the hook size chart', async () => {
        const html = await productPage();
        assert.match(textOf(section(html, 'shipping')), /Free standard shipping in Canada on fly orders over \$60 \(fly boxes and gear not included\)\. Standard Canada Post/);
        assert.deepEqual(findTags(section(html, 'hooks'), 'a').map(link => link.attrs.href), ['/fly-hook-size-chart/']);
    });

    it('leaves "Shipping and delivery" out without a threshold (ReelFlies US: its words are Canada\'s), as the shipping line', async () => {
        const html = await productPage({ theme: { rf_ship_free_threshold: ' ' } });
        assert.equal(section(html, 'shipping'), undefined);
        assert.ok(!html.includes('data-rf-ship-line'));
        assert.deepEqual(sections(html).map(each => findTags(each, 'details')[0].attrs['data-rf-details']), ['about', 'hooks']);
    });

    it('leaves "About this fly" out of a product with no description, and adds the warranty when there is one', async () => {
        const bare = await productPage({ product: { description: '' } });
        assert.deepEqual(sections(bare).map(each => findTags(each, 'details')[0].attrs['data-rf-details']), ['shipping', 'hooks']);
        const warranty = await productPage({ product: { warranty: '<p>Replaced if a hook fails.</p>' } });
        assert.ok(section(warranty, 'warranty').includes('Replaced if a hook fails.'));
    });

    it('words the details for a fly by ticket 31\'s rule, as "/ fly": gear, an Assortment, or a product the rule can\'t place gets "Description" and no "Hooks and tying"', async () => {
        const names = html => sections(html).map(each => findTags(each, 'details')[0].attrs['data-rf-details']);
        const title = html => textOf(outerHtml(section(html, 'about'), 'summary') || '');
        for (const [why, product, theme] of [
            ['a fly box', { category: ['Fly Gear', 'Fly Gear/Fly Boxes'] }, {}],
            ['an Assortment', { category: ['Fly Selections & Fly Boxes/Bulk Fly Selections'] }, {}],
            ['no Placement', { category: [] }, {}],
            ['no roots named', {}, { rf_price_unit_exclude: '' }],
        ]) {
            const html = await productPage({ product, theme }); // eslint-disable-line no-await-in-loop
            assert.deepEqual(names(html), ['about', 'shipping'], why);
            assert.equal(title(html), 'Description', why);
        }
        const hidden = await productPage({ settings: { hide_price_from_guests: true } });
        assert.deepEqual(names(hidden), ['about', 'shipping', 'hooks'], 'a fly, its price hidden from guests');
        assert.equal(title(hidden), 'About this fly');
    });

    it('keeps the custom fields, when Theme Styles puts them in a tab, as a section of their own', async () => {
        const fields = [{ name: 'Hook', value: 'Dry fly' }];
        const html = await productPage({ product: { custom_fields: fields }, theme: { show_custom_fields_tabs: true } });
        assert.match(textOf(section(html, 'custom-fields')), /Hook/);
    });

    it('ends with ticket 40\'s reviews slot, empty until ticket 40 fills it (build pipeline 6.9)', async () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/product-details.html'), 'utf8');
        const slot = source.indexOf('{{> components/reelflies/product-reviews}}');
        assert.ok(slot > source.lastIndexOf('</details>'), 'the slot comes after the last section');
        const CALLER = 'rf-test/reviews-slot';
        const empty = await renderPartial(CALLER, { product: CONTEXT.product }, { overrides: { [CALLER]: '{{> components/reelflies/product-reviews}}' } });
        assert.equal(empty.trim(), '');
    });
});

describe('the related patterns (components/reelflies/product-related.html; story 48; O23)', () => {
    it('render a grid of the card under "Related patterns": no carousel, no tab', async () => {
        const html = await productPage();
        const grid = related(html);
        assert.ok(grid, 'the section');
        assert.equal(textOf(outerHtml(grid, 'h2', () => true)), 'Related patterns');
        const [list] = findTags(grid, 'ul');
        assert.match(list.attrs.class, /(^|\s)productGrid(\s|$)/);
        assert.equal(list.attrs['data-list-name'], 'Related Products', 'stock\'s list name, which the data layer reads');
        assert.equal(elementsHtml(grid, 'article', hasClass('card')).length, 4);
        assert.ok(!html.includes('productCarousel'), 'no carousel');
        assert.ok(!findTags(grid).some(tag => 'data-slick' in tag.attrs), 'no slick');
        assert.ok(!findTags(html).some(tag => tag.attrs.role === 'tablist' || tag.attrs.id === 'tab-related'), 'no tab');
        assert.ok(!html.includes('Customers Also Viewed'), 'no similar-by-views list');
    });

    it('load their photos lazily, with no fetchpriority, sized for four across from 801px', async () => {
        for (const img of findTags(related(await productPage()), 'img')) {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
            assert.match(img.attrs.sizes, /^\(min-width: 1136px\) 258px, \(min-width: 801px\) calc\(23\.8vw - 13px\), calc\(50vw - 24px\)$/);
        }
    });

    it('render nothing for a product with no related products', async () => {
        assert.equal(related(await productPage({ product: { related_products: [] } })), null);
    });
});

describe('the words (lang/en.json, reelflies.product)', () => {
    it('are the reference\'s, with the promise and the free-shipping wording ticket 13 set', () => {
        assert.equal(lang.promise, 'We stand behind every fly we sell.');
        assert.equal(lang.wishlist, 'Save to wish list');
        assert.equal(lang.related, 'Related patterns');
        assert.deepEqual([lang.about, lang.shipping, lang.hooks], ['About this fly', 'Shipping and delivery', 'Hooks and tying']);
    });
});
