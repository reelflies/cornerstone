// Quick add's server half (ticket 43; redesign step 3, the owner's choice of 2026-11-07: every
// size with a quantity beside it; spec module 14; UX-8, UX-21, SCOPE-3; stories 29, 30, 32, 35
// and 68): "+ Add" on the specimen card (components/reelflies/fly.html, through fly-listing.html
// and products/grid.html's hook, and fly-stencil.html for the home page's cards), the card's
// reserved line and its size panel, and what head.html hands quick-add.js. The picker itself is
// scripted: quick-add.js and size-picker.js draw it over the Storefront API (their Jest specs),
// so nothing here renders a panel. The cards are channel 1's search results for "streamer"
// (card/products.json).
//
// Retired with the redesign: the server-rendered panel (quick-add-product.html), ticket 37's
// pills in it, the Quick view guard (the specimen card has no Quick view) and js-settings.html
// (head.html injects the context now).
//
//   node --test scripts/qa/render/partials/quick-add.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { quickAddProblems } from '../../raw-html/assertions/quick-add.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { productPage } from './product-page/context.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const { products: CARDS } = JSON.parse(fs.readFileSync(path.join(HERE, 'card/products.json'), 'utf8'));
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies;
const TREE_1 = 'Fly Gear,Fly Selections & Fly Boxes';
const CALLER = 'rf-test/quick-add-caller';

// The grid as a listing renders it (products/grid.html reads the switch from the theme_settings
// each caller passes, since a facet refresh renders it without the page's head); `before` runs
// first, as a page template's own lines would. `on: null` leaves the switch to the variation.
const grid = ({
    on = true, products = CARDS, before = '', variation, theme = {},
} = {}) => renderPartial(CALLER, {
    products,
    settings: { hide_price_from_guests: false },
    theme_settings: { rf_price_unit_exclude: TREE_1, ...(on === null ? {} : { rf_quick_add: on }), ...theme },
}, {
    variation,
    overrides: { [CALLER]: `${before}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` },
});
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const tagClassed = name => tag => classed(name)(tag.attrs);
const cards = html => elementsHtml(html, 'li', classed('rf-fly'));
const control = card => findTags(card).find(tagClassed('rf-add'));
const controlHtml = card => elementsHtml(card, control(card).name, classed('rf-add'))[0];
const words = card => textOf(controlHtml(card)).replace(/\s+:/, ':');
const mode = card => (control(card).name === 'button' ? control(card).attrs['data-rf-add'] : 'link');
const line = card => outerHtml(card, 'p', classed('rf-fly__line'));

describe('"+ Add" on a listing card (components/reelflies/fly.html, through fly-listing.html)', () => {
    it('is a button on every card that isn\'t sold out: "+ Add" to open the picker where the shopper picks a size, "Add 1" where there is nothing to pick (stories 29 and 35)', async () => {
        const html = await grid();
        const list = cards(html);
        // 4831 and 4804 have options; 5906, 5697 and 5879 have none (5906 and 5697 because every size
        // is sold out, which the store sends as no options: listing.js's Storefront read marks them
        // sold out, the server can't); 5234 is at stock level 0.
        assert.deepEqual(list.map(mode), ['sizes', 'one', 'one', 'one', 'link', 'sizes']);
        const [first] = list;
        const button = control(first);
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs['aria-expanded'], 'false');
        assert.equal(words(first), '+ Add: Royal Coachman Streamer');
        assert.match(controlHtml(first), /^<button[^>]*>\+ Add<span class="is-srOnly">: Royal Coachman Streamer<\/span><\/button>$/, '"+ Add" is the visible word; the name is for screen readers');
        assert.equal(words(list[1]), 'Add 1: Streamer John');
        assert.deepEqual(unbalancedTags(html), []);
        assert.deepEqual(quickAddProblems(html), []);
    });

    it('reserves the card\'s line and its size panel for quick-add.js, both empty and hidden on the server, so a cached page never shows another shopper\'s box (story 32)', async () => {
        for (const card of cards(await grid())) {
            const reserved = line(card);
            assert.ok(reserved, 'the reserved line');
            const [inbox] = findTags(reserved, 'span').filter(tag => 'data-rf-inbox' in tag.attrs);
            assert.ok('hidden' in inbox.attrs);
            assert.equal(textOf(outerHtml(reserved, 'span', attrs => 'data-rf-inbox' in attrs)), '');
            assert.equal(textOf(outerHtml(reserved, 'span', classed('rf-fly__sizes'))), classed('is-sold')(findTags(card, 'li')[0].attrs) ? 'Sold out' : '', 'a listing\'s size range comes from listing.js\'s one Storefront read');
            const panel = outerHtml(card, 'div', attrs => 'data-rf-sizes' in attrs);
            assert.ok(panel, 'the panel');
            assert.ok('hidden' in findTags(panel, 'div')[0].attrs);
            assert.equal(textOf(panel), '');
        }
    });

    it('gives a card sold out in every size (stock level 0) "Sold out" on its line and a link to its page in place of the button (the owner\'s choice, 2026-11-07)', async () => {
        const sold = cards(await grid()).find(card => classed('is-sold')(findTags(card, 'li')[0].attrs));
        assert.equal(findTags(sold, 'li')[0].attrs['data-rf-product'], '5234');
        assert.equal(textOf(outerHtml(sold, 'span', classed('rf-fly__sizes'))), 'Sold out');
        assert.equal(control(sold).name, 'a');
        assert.match(control(sold).attrs.class, /(^|\s)rf-add--link(\s|$)/);
        assert.equal(control(sold).attrs.href, CARDS[4].url);
        assert.equal(words(sold), 'View: Monster Streamer Shad Pike Fly');
        assert.ok(!findTags(sold, 'img')[0] || !outerHtml(sold, 'a', classed('rf-fly__photo')).includes('Sold out'), 'nothing is set over the photo');
    });

    it('links every card to its page with the switch off: "Choose a size" where there are sizes, "View" where not, and no panel (story 35)', async () => {
        const html = await grid({ on: false });
        const list = cards(html);
        assert.equal(findTags(html).filter(tag => 'data-rf-add' in tag.attrs).length, 0);
        assert.deepEqual(list.map(card => control(card).name), CARDS.map(() => 'a'));
        assert.deepEqual(list.map(card => control(card).attrs.href), CARDS.map(card => card.url));
        assert.deepEqual(list.map(card => words(card).replace(/:.*$/, '')), ['Choose a size', 'View', 'View', 'View', 'View', 'Choose a size']);
        assert.equal(findTags(html).filter(tag => 'data-rf-sizes' in tag.attrs).length, 0, 'no panel');
        assert.equal(findTags(html).filter(tag => 'data-rf-inbox' in tag.attrs).length, CARDS.length, 'the reserved line stays');
        assert.deepEqual(quickAddProblems(html), []);
    });

    it('never has a card Quick view or stock\'s Add to Cart, on or off: the specimen card buys through its picker or links to its page', async () => {
        for (const html of [await grid(), await grid({ on: false })]) {
            assert.equal(findTags(html, 'button').filter(tagClassed('quickview')).length, 0);
            assert.ok(!findTags(html, 'a').some(tag => tag.attrs['data-button-type'] === 'add-cart' || /cart\.php\?action=add/.test(tag.attrs.href || '')));
        }
        assert.ok(CARDS.find(card => card.id === 5879).add_to_cart_url, 'the store offers 5879 stock\'s one-tap add, which no card takes');
    });

    it('follows each variation: on in ReelFlies CA and, since step 3\'s round 2, in ReelFlies CA channel 1 too (ticket 53)', async () => {
        const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
        assert.equal(config.settings.rf_quick_add, true);
        assert.equal(config.variations.find(variation => variation.name === 'ReelFlies CA channel 1').settings.rf_quick_add, true);
        for (const variation of ['ReelFlies CA', 'ReelFlies CA channel 1']) {
            assert.ok(findTags(await grid({ on: null, variation }), 'button').some(tag => 'data-rf-add' in tag.attrs), variation); // eslint-disable-line no-await-in-loop
        }
    });

    it('reads the switch from the grid\'s own theme_settings, as a facet refresh renders the grid without the page\'s head', async () => {
        const refreshed = await grid({ on: false, before: "{{assignVar 'rf_quick_add' 1}}" });
        assert.equal(findTags(refreshed).filter(tag => 'data-rf-add' in tag.attrs).length, 0, 'the grid\'s own setting wins over the page variable');
        assert.ok(findTags(await grid({ on: true, before: "{{assignVar 'rf_quick_add' 0}}" }), 'button').some(tag => 'data-rf-add' in tag.attrs));
    });

    it('never shows on the product page\'s related patterns, which link to their page to choose (tickets 39 and 43)', async () => {
        const html = await productPage();
        const related = outerHtml(html, 'section', classed('rf-pdp-related'));
        assert.equal(findTags(related).filter(tag => 'data-rf-add' in tag.attrs).length, 0);
        assert.equal(findTags(related, 'a').filter(tagClassed('rf-add--link')).length, 4);
        assert.deepEqual(quickAddProblems(html, { productPage: true }), []);
    });
});

// The home page's cards (fly-stencil.html) carry their size range from the page's GraphQL front
// matter, so "+ Add" and "Add 1" follow the sizes the store has, not has_options alone.
describe('"+ Add" on the home page\'s cards (components/reelflies/fly-stencil.html)', () => {
    const STENCIL = 'rf-test/quick-add-stencil';
    const edge = (id, labels) => ({
        node: { entityId: id, productOptions: { edges: labels.length ? [{ node: { values: { edges: labels.map(label => ({ node: { label } })) } } }] : [] } },
    });
    const stencil = (card, labels) => renderPartial(STENCIL, {
        card, gql: [edge(card.id, labels)], theme_settings: { rf_quick_add: true, rf_price_unit_exclude: TREE_1 },
    }, {
        overrides: { [STENCIL]: "{{assignVar 'rf_quick_add' 1}}{{> components/reelflies/fly-stencil rf_card=card rf_gql=gql rf_size='md' rf_eager=1 rf_exclude=theme_settings.rf_price_unit_exclude}}" },
    });

    it('opens the picker for several sizes, with the range on the line; adds one for a single size, named on the line; adds one for no options', async () => {
        const several = cards(await stencil(CARDS[0], ['8', '10', '12']))[0];
        assert.equal(mode(several), 'sizes');
        assert.equal(textOf(outerHtml(several, 'span', classed('rf-fly__sizes'))), 'Sizes 8–12');
        const single = cards(await stencil(CARDS[0], ['14']))[0];
        assert.equal(mode(single), 'one');
        assert.equal(words(single), 'Add 1: Royal Coachman Streamer');
        assert.equal(textOf(outerHtml(single, 'span', classed('rf-fly__sizes'))), 'Size 14');
        const none = cards(await stencil(CARDS[3], []))[0];
        assert.equal(mode(none), 'one');
        assert.equal(textOf(outerHtml(none, 'span', classed('rf-fly__sizes'))), '');
    });
});

describe('what head.html hands quick-add.js (context.rfQuickAdd and the words)', () => {
    const PROBE = 'rf-test/quick-add-context';
    const context = async (theme = {}) => {
        const html = await renderPartial(PROBE, { theme_settings: theme, settings: { money: { currency_token: '$' } } }, {
            overrides: { [PROBE]: '{{> components/reelflies/head}}<!--ctx-->{{{jsContext}}}' },
        });
        return JSON.parse(JSON.parse(html.slice(html.indexOf('<!--ctx-->') + '<!--ctx-->'.length)));
    };

    it('passes the switch, the cart-state switch, the fly brands and the hook chart\'s URL', async () => {
        const on = await context({ rf_quick_add: true, rf_hook_chart_url: ' /fly-hook-size-chart/ ' });
        assert.equal(on.rfQuickAdd, true);
        assert.equal(on.rfCartState, true);
        assert.equal(on.rfFlyBrands, 'ReelFlies');
        assert.equal(on.rfHookChart, '/fly-hook-size-chart/');
        assert.equal((await context({ rf_quick_add: false })).rfQuickAdd, false);
    });

    it('passes every word the script writes, lang reelflies.js whole, with its placeholders (langJson\'s translations, which words.js reads)', async () => {
        const { translations } = JSON.parse((await context()).rfWords);
        const rfWords = Object.fromEntries(Object.entries(translations).map(([key, text]) => [key.replace(/^reelflies\.js\./, ''), text]));
        assert.deepEqual(rfWords, LANG.js);
        for (const key of ['add', 'add_one', 'pick_hint', 'pick_hint_choice', 'sold_one', 'sold_many', 'sold_all', 'sold_out_row', 'sizes_gloss', 'sizes_help', 'done', 'close', 'load_failed', 'choose_on_page', 'page_link', 'in_box_full', 'in_box_short', 'in_box_count', 'quantity']) {
            assert.ok(typeof rfWords[key] === 'string' && rfWords[key], key);
        }
        assert.equal(rfWords.in_box_full, 'In your box: {list}');
        assert.equal(rfWords.sold_one, 'Size {size} is sold out.');
    });

    it('words the card the same in the templates and in the script (reelflies.card and reelflies.js)', () => {
        for (const key of ['add', 'add_one', 'choose', 'view', 'per_fly', 'per_set', 'sizes', 'size']) assert.equal(LANG.js[key], LANG.card[key], key);
        assert.equal(LANG.card.add, '+ Add');
        assert.equal(LANG.card.add_one, 'Add 1');
        assert.equal(LANG.card.sold_out, 'Sold out');
    });
});

describe('the button\'s size (assets/scss/reelflies/_fly.scss)', () => {
    it('is 40px tall on the card, and the full 44px tap minimum across the card on phones (step 4)', () => {
        const scss = fs.readFileSync(path.join(THEME_DIR, 'assets/scss/reelflies/_fly.scss'), 'utf8');
        assert.match(scss, /\.rf-add,\s*\.rf-buy \{[^}]*min-height: 40px;/s);
        assert.match(scss, /@media \(max-width: 639px\) \{[\s\S]*?\.rf-add \{\s*width: 100%;\s*min-height: var\(--rf-tap-min\);/);
    });
});
