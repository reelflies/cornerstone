// Quick add's templates (ticket 43; spec module 14; UX-8, UX-21, SCOPE-3; stories 29, 30, 32, 35
// and 68): "+ Add" on the card (quick-add-gate.html and quick-add-button.html, from the card's
// extras slot), the card's Quick view guard (components/reelflies/card.html), the product getById
// renders for the panel (quick-add-product.html), and the words js-settings.html passes to the
// script. The cards are channel 1's search results for "streamer" (card/products.json); the
// products are quick-add/products.json; ticket 34's Species hub is its fixture page's data.
//
//   node --test scripts/qa/render/partials/quick-add.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';
import { quickAddProblems } from '../../raw-html/assertions/quick-add.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const { products: CARDS } = JSON.parse(fs.readFileSync(path.join(HERE, 'card/products.json'), 'utf8'));
const { products: PRODUCTS, urls: URLS } = JSON.parse(fs.readFileSync(path.join(HERE, 'quick-add/products.json'), 'utf8'));
const TREE_1 = 'Fly Gear,Fly Selections & Fly Boxes';
const CALLER = 'rf-test/quick-add-caller';

// The grid as a listing renders it (components/products/grid.html passes rf_listing), with the
// switch as `on` says; `before` runs first, as a page template's own lines would.
const grid = ({
    on = true, products = CARDS, before = '', variation, settings = {},
} = {}) => renderPartial(CALLER, {
    products,
    settings: { show_product_rating: true, hide_price_from_guests: false },
    theme_settings: {
        rf_price_unit_exclude: TREE_1, show_product_quick_view: true, ...(on === null ? {} : { rf_quick_add: on }), ...settings,
    },
}, {
    variation,
    overrides: { [CALLER]: `${before}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` },
});
const cards = html => elementsHtml(html, 'article', attrs => /(^|\s)card(\s|$)/.test(attrs.class || ''));
const button = card => findTags(card, 'a').find(tag => 'data-rf-quick-add' in tag.attrs);
const actions = card => outerHtml(card, 'div', attrs => /(^|\s)rf-card-actions(\s|$)/.test(attrs.class || ''));
const quickViews = html => findTags(html, 'button').filter(tag => /(^|\s)quickview(\s|$)/.test(tag.attrs.class || ''));
const sold = (product, extra) => ({ ...product, ...extra });

describe('"+ Add" on a listing card (quick-add-gate.html, quick-add-button.html)', () => {
    it('shows on every card with options that isn\'t sold out, as a link to the product page named for the pattern (stories 29 and 35; SCOPE-3)', async () => {
        const html = await grid();
        const list = cards(html);
        // 4831 and 4804 have options; 5906, 5697 and 5879 have none; 5234 is sold out.
        assert.deepEqual(list.map(card => Boolean(button(card))), [true, false, false, false, false, true]);
        const link = button(list[0]);
        assert.equal(link.attrs.href, CARDS[0].url);
        assert.equal(link.attrs['data-rf-quick-add'], String(CARDS[0].id));
        const words = textOf(elementsHtml(list[0], 'a', attrs => 'data-rf-quick-add' in attrs)[0]).replace(/\s+/g, ' ').trim();
        assert.equal(words, 'Add Royal Coachman Streamer');
        assert.match(list[0], /<span class="is-srOnly"> Royal Coachman Streamer<\/span>/, 'the name is for screen readers; "Add" is the visible word');
        assert.ok(findTags(list[0], 'svg').some(tag => /rf-qa-plus/.test(tag.attrs.class) && tag.attrs['aria-hidden'] === 'true'), 'the plus is drawn, hidden from screen readers');
        assert.deepEqual(unbalancedTags(html), []);
        assert.deepEqual(quickAddProblems(html), []);
    });

    it('takes the stock actions row off a card with "+ Add", and Quick view off every card, while the switch is on (build pipeline 6.4)', async () => {
        const html = await grid();
        const list = cards(html);
        assert.deepEqual(list.map(card => Boolean(actions(card))), [false, true, true, true, true, false]);
        assert.equal(quickViews(html).length, 0, 'no Quick view on any card');
    });

    it('gives a card with no options a link to its product page in place of stock\'s Add to Cart while the switch is on: 42 CH Bow River Streamers (5879; criterion 4, the ticket\'s drafted answer)', async () => {
        const assortment = CARDS.find(card => card.id === 5879);
        assert.equal(assortment.has_options, false);
        assert.ok(assortment.add_to_cart_url, 'the store gives 5879 stock\'s one-tap add');
        const row = actions(cards(await grid()).find(card => findTags(card, 'article')[0].attrs['data-entity-id'] === '5879'));
        const links = findTags(row, 'a');
        assert.deepEqual(links.map(tag => tag.attrs.href), [assortment.url], 'one link, to the product page');
        assert.ok(!links.some(tag => tag.attrs['data-button-type'] === 'add-cart'));
        assert.doesNotMatch(row, /cart\.php\?action=add/);
        assert.equal(textOf(row).replace(/\s+/g, ' ').trim(), 'View 42 CH Bow River Streamers');
        assert.match(row, /<span class="is-srOnly"> 42 CH Bow River Streamers<\/span>/, '"View" is the visible word; the name is for screen readers');
        assert.deepEqual(quickAddProblems(await grid()), []);
    });

    it('leaves stock\'s Add to Cart on a card with no options with the switch off, and on the product page', async () => {
        const stockAdd = html => actions(cards(html).find(card => findTags(card, 'article')[0].attrs['data-entity-id'] === '5879'));
        for (const html of [await grid({ on: false }), await grid({ before: "{{assignVar 'rf_product_page' 1}}" })]) {
            const row = stockAdd(html);
            assert.ok(findTags(row, 'a').some(tag => tag.attrs['data-button-type'] === 'add-cart' && /cart\.php\?action=add/.test(decodeHtml(tag.attrs.href))));
            assert.doesNotMatch(textOf(row), /View/);
        }
    });

    it('renders the stock card with the switch off: no "+ Add" and Quick view back on every card (story 35)', async () => {
        const html = await grid({ on: false });
        assert.equal(findTags(html).filter(tag => 'data-rf-quick-add' in tag.attrs).length, 0);
        assert.doesNotMatch(html, /rf-qa-/);
        assert.equal(quickViews(html).length, CARDS.length);
        assert.ok(cards(html).every(card => actions(card)));
    });

    it('follows each variation: on in ReelFlies CA, off in ReelFlies CA channel 1 (ticket 53)', async () => {
        assert.ok(findTags(await grid({ on: null }), 'a').some(tag => 'data-rf-quick-add' in tag.attrs));
        assert.ok(!findTags(await grid({ on: null, variation: 'ReelFlies CA channel 1' }), 'a').some(tag => 'data-rf-quick-add' in tag.attrs));
    });

    it('leaves out a card sold out in every size (its badge shows), a pre-order, and one the store sells no cart action for', async () => {
        const [first] = CARDS;
        const list = cards(await grid({
            products: [sold(first, { stock_level: 0 }), sold(first, { id: 9001, pre_order: true }), sold(first, { id: 9002, show_cart_action: false }), sold(first, { id: 9003, stock_level: 4 })],
        }));
        assert.deepEqual(list.map(card => Boolean(button(card))), [false, false, false, true]);
        assert.ok(outerHtml(list[0], 'div', attrs => attrs.class === 'sold-out-flag-side'), 'the sold-out badge');
    });

    it('never shows outside a listing grid: the product page\'s related products, and a grid on the product page (tickets 38 and 39)', async () => {
        const related = await renderPartial('rf-test/related-caller', { products: CARDS, settings: {}, theme_settings: { rf_quick_add: true } }, {
            overrides: { 'rf-test/related-caller': '{{> components/products/related products}}' },
        });
        assert.equal(findTags(related).filter(tag => 'data-rf-quick-add' in tag.attrs).length, 0);
        assert.equal(quickViews(related).length, 0, 'and no Quick view while the switch is on');
        const onProductPage = await grid({ before: "{{assignVar 'rf_product_page' 1}}" });
        assert.equal(findTags(onProductPage).filter(tag => 'data-rf-quick-add' in tag.attrs).length, 0);
        assert.deepEqual(quickAddProblems(onProductPage, { productPage: true }), []);
        assert.ok(cards(onProductPage).every(card => actions(card)), 'the related cards keep their stock actions');
    });

    it('sits in the card\'s extras slot, after ticket 42\'s, inside the card body', async () => {
        const source = fs.readFileSync(path.resolve('templates/components/reelflies/card-extras.html'), 'utf8');
        const body = source.slice(source.indexOf('--}}') + 4).split('\n').filter(line => line.trim());
        assert.deepEqual(body, [
            '{{!-- 42 cart state: "N in cart" --}}',
            '{{> components/reelflies/card-cart-state}}',
            '{{!-- 43 quick add: "+ Add", when quick-add-gate.html says the card gets it --}}',
            '{{> components/reelflies/quick-add-button}}',
        ]);
        const [card] = cards(await grid());
        const cardBody = outerHtml(card, 'div', attrs => /(^|\s)card-body(\s|$)/.test(attrs.class || ''));
        assert.ok(findTags(cardBody, 'a').some(tag => 'data-rf-quick-add' in tag.attrs));
    });
});

// Ticket 34's Species hub renders ticket 31's card itself, not through the stock grid, so its card
// include passes quick add's own flag, rf_quick_add_card: rf_listing would also make its first
// three card photos eager, where the hub's tiles hold the first screen. The hub is the fixture
// page's tree-4 data (render/pages/species-hub/), whose grid holds the same six cards.
const HUB = JSON.parse(fs.readFileSync(path.join(HERE, '../pages/species-hub/fixtures/tree-4.json'), 'utf8')).page_context;
const hub = (on = true) => renderPartial('pages/custom/category/species-hub', {
    ...HUB, settings: {}, theme_settings: { ...HUB.theme_settings, show_product_quick_view: true, rf_quick_add: on },
});
const hubGrid = html => outerHtml(html, 'section', attrs => 'data-rf-hub-products' in attrs);
const entity = id => card => findTags(card, 'article')[0].attrs['data-entity-id'] === String(id);

describe('"+ Add" on the Species hub\'s grid (ticket 34\'s template passes rf_quick_add_card)', () => {
    it('shows on the hub\'s cards as on a listing\'s: no stock actions row beside it, no Quick view, and "View" for a card with no options in place of stock\'s Add to Cart', async () => {
        const html = await hub();
        const list = cards(hubGrid(html));
        assert.deepEqual(list.map(card => findTags(card, 'article')[0].attrs['data-entity-id']), CARDS.map(card => String(card.id)), 'the same six cards as the search grid');
        assert.deepEqual(list.map(card => Boolean(button(card))), [true, false, false, false, false, true]);
        assert.deepEqual(list.map(card => Boolean(actions(card))), [false, true, true, true, true, false]);
        assert.equal(quickViews(html).length, 0, 'no Quick view on any card');
        const row = actions(list.find(entity(5879)));
        assert.equal(textOf(row).replace(/\s+/g, ' ').trim(), 'View 42 CH Bow River Streamers');
        assert.ok(!findTags(row, 'a').some(tag => tag.attrs['data-button-type'] === 'add-cart'));
        assert.deepEqual(quickAddProblems(html), []);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('keeps the stock card on the hub with the switch off: no "+ Add", Quick view and stock\'s Add to Cart back', async () => {
        const html = await hub(false);
        const list = cards(hubGrid(html));
        assert.equal(findTags(html).filter(tag => 'data-rf-quick-add' in tag.attrs).length, 0);
        assert.equal(quickViews(html).length, list.length);
        assert.ok(findTags(actions(list.find(entity(5879))), 'a').some(tag => tag.attrs['data-button-type'] === 'add-cart'));
    });

    it('leaves the hub\'s photos as ticket 34 loads them: every card photo lazy with no fetchpriority, the first tile\'s the page\'s one high-priority image', async () => {
        const html = await hub();
        const photos = cards(hubGrid(html)).map(card => findTags(card, 'img')[0]);
        assert.equal(photos.length, CARDS.length);
        for (const img of photos) {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
        }
        const high = findTags(html, 'img').filter(img => img.attrs.fetchpriority === 'high');
        assert.equal(high.length, 1);
        assert.match(high[0].attrs.class, /rf-hub-tile/, 'the first tile\'s photo');
    });
});

// The product as getById renders it for the panel, with the product page's context.
const product = (name, extra = {}) => renderPartial('components/reelflies/quick-add-product', {
    product: PRODUCTS[name], urls: URLS, settings: {}, theme_settings: { rf_price_unit_exclude: TREE_1, ...extra },
});
const content = html => findTags(html, 'div').find(tag => 'data-rf-qa-content' in tag.attrs);
const radios = html => findTags(html, 'input').filter(tag => tag.attrs.type === 'radio');

describe('the product for the panel (quick-add-product.html)', () => {
    it('carries the product\'s options as JSON, product.options whole, which quick-add-route.js reads (its Jest spec has the routes)', async () => {
        for (const name of Object.keys(PRODUCTS)) {
            const html = await product(name); // eslint-disable-line no-await-in-loop
            const options = JSON.parse(decodeHtml(content(html).attrs['data-rf-qa-options']));
            assert.deepEqual(options, PRODUCTS[name].options, name);
            assert.equal(content(html).attrs['data-rf-qa-product'], String(PRODUCTS[name].id));
            assert.deepEqual(unbalancedTags(html), [], name);
        }
    });

    it('shows the sizes as ticket 37\'s pills, labelled by an id of this product\'s, with no size chosen unless there is one (story 68; UX-21)', async () => {
        const html = await product('sizes');
        const [group] = findTags(html, 'div').filter(tag => tag.attrs['data-rf-pills'] === 'size');
        assert.equal(group.attrs.role, 'radiogroup');
        assert.equal(group.attrs['aria-labelledby'], 'rf-option-4831-117-label');
        assert.equal(findTags(html).filter(tag => tag.attrs.id === 'rf-option-4831-117-label').length, 1);
        assert.deepEqual(radios(html).map(tag => tag.attrs.value), ['301', '302', '303', '304'], 'catalogue order: hook order once ticket 18 applies');
        assert.ok(radios(html).every(tag => !('checked' in tag.attrs)), 'the catalogue\'s default size isn\'t chosen');
        assert.ok(radios(await product('one-size')).every(tag => 'checked' in tag.attrs), 'a single size is');
    });

    it('gives two products\' pills distinct group ids, as the product page and the panel put them on one page (ticket 37\'s criterion 5)', async () => {
        const page = await renderPartial('rf-test/page-pills', { option: PRODUCTS['two-options'].options[1], product_id: 5663 }, {
            overrides: { 'rf-test/page-pills': "{{assignVar 'rf_product_id' product_id}}{{> components/products/options/set-rectangle option}}" },
        });
        const both = `${page}${await product('sizes')}`;
        const ids = findTags(both).map(tag => tag.attrs.id).filter(Boolean);
        assert.equal(new Set(ids).size, ids.length, `no id twice: ${ids.join(', ')}`);
    });

    it('heads the panel with the name, a link to the product, the price with "/ fly" by ticket 31\'s rule, and Close', async () => {
        const html = await product('sizes');
        const title = outerHtml(html, 'p', attrs => attrs.class === 'rf-qa-title');
        assert.equal(findTags(title, 'p')[0].attrs.id, 'rf-qa-title-4831');
        assert.equal(findTags(title, 'a')[0].attrs.href, PRODUCTS.sizes.url);
        assert.equal(textOf(title), 'Royal Coachman Streamer');
        assert.equal(decodeHtml(content(html).attrs['data-rf-dialog-name']), 'Choose sizes of Royal Coachman Streamer', 'the dialog\'s name, as the reference names it');
        const price = markup => outerHtml(markup, 'div', attrs => attrs.class === 'rf-qa-price');
        // Stock's price partial keeps its hidden MSRP and Was labels, as on the card.
        assert.match(textOf(price(html)), /\$1\.25 \/ fly$/);
        assert.doesNotMatch(textOf(price(await product('other-option'))), /\/ fly/, 'an Assortment has no unit');
        const close = outerHtml(html, 'button', attrs => 'data-rf-qa-close' in attrs);
        assert.equal(findTags(close, 'button')[0].attrs.type, 'button');
        assert.equal(textOf(close).trim(), 'Close');
    });

    it('ends with the cart\'s count, filled by the script, and View cart', async () => {
        const html = await product('sizes');
        const foot = outerHtml(html, 'p', attrs => attrs.class === 'rf-qa-foot');
        assert.ok(findTags(foot, 'span').some(tag => 'data-rf-qa-count' in tag.attrs));
        assert.equal(findTags(foot, 'a')[0].attrs.href, '/cart.php');
        assert.match(textOf(foot), /View cart$/);
    });

    it('carries ticket 38\'s words for the add, with their placeholders whole, and quick add\'s own', async () => {
        const { attrs } = content(await product('one-size'));
        assert.equal(decodeHtml(attrs['data-rf-added']), 'Added {qty} × {choice}.');
        assert.equal(attrs['data-rf-size'], 'size {size}');
        assert.equal(attrs['data-rf-cart-flies'], '# flies in your cart.');
        assert.equal(attrs['data-rf-cart-item'], '# item in your cart.');
        assert.equal(attrs['data-rf-view-cart'], 'View cart');
        assert.equal(decodeHtml(attrs['data-rf-error']), 'That didn\'t go in your cart. Try again.');
        assert.equal(attrs['data-rf-cart-empty'], 'Your cart is empty.');
    });

    it('is a form the script reads and never submits, with no quantity field for stock\'s validator to find (ticket 38)', async () => {
        const html = await product('sizes');
        const [form] = findTags(html, 'form');
        assert.ok('novalidate' in form.attrs);
        assert.ok('data-rf-qa-form' in form.attrs);
        assert.deepEqual(findTags(html, 'input').filter(tag => tag.attrs.type === 'hidden').map(tag => [tag.attrs.name, tag.attrs.value]), [['product_id', '4831']]);
        assert.equal(findTags(html, 'input').filter(tag => /qty/.test(tag.attrs.name || '')).length, 0);
        assert.equal(findTags(html).filter(tag => 'data-product-option-change' in tag.attrs).length, 0, 'not stock\'s options container, which stock\'s scripts look for');
    });
});

describe('what js-settings.html passes to the script', () => {
    const context = async settings => JSON.parse(JSON.parse(await renderPartial('rf-test/js', { theme_settings: settings }, {
        overrides: { 'rf-test/js': '{{> components/reelflies/js-settings}}{{{jsContext}}}' },
    })));

    it('the switch, and with it on the words the panel needs before a product has loaded', async () => {
        const on = await context({ rf_quick_add: true });
        assert.equal(on.rfQuickAdd, true);
        assert.equal(on.rfQuickAddClose, 'Close');
        assert.equal(on.rfQuickAddFailed, 'We couldn\'t load the sizes.');
        assert.equal(on.rfQuickAddPage, 'Go to the product page');
        const off = await context({ rf_quick_add: false });
        assert.equal(off.rfQuickAdd, false);
        assert.ok(!('rfQuickAddClose' in off) && !('rfQuickAddFailed' in off) && !('rfQuickAddPage' in off));
    });
});
