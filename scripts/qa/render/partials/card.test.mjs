// The specimen card and the listing grid (ticket 31; spec module 13; stories 28, 35 and 70;
// redesign step 3; DESIGN.md "Cards"): components/products/grid.html's hook hands every listing's
// products (category, search, brand) to components/reelflies/fly-listing.html, which turns a
// Stencil card into components/reelflies/fly.html's params: the photo at the grid's sizes, the
// price with "/ fly" by the fly rule (fly-rule.html), the sold-out line and the buy control.
// The product page's related patterns (product-related.html) render the same card lazily. The
// cards are search results for "streamer" on channel 1 (card/products.json).
//
// Gone with master's card.html, and not tested: the top-left sold-out badge (a "Sold out" line
// under the photo now), stock's Quick view, Add to cart and compare actions, the card-extras slot
// (tickets 42 and 43 write into the reserved line) and the default image for a product with no
// photo (fly.html prints no <img> then).
//
//   node --test scripts/qa/render/partials/card.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { cardImageProblems } from '../../raw-html/assertions/card-images.mjs';

const { products } = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'card/products.json'), 'utf8'));
const TREE_1 = 'Fly Gear,Fly Selections & Fly Boxes';
const CALLER = 'rf-test/card-grid-caller';
const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.card;
// The one sizes attribute for a listing's photos: two across on phones, three from 640px, three
// beside the facets from 1040px and four from 1280px (fly-listing.html).
const SIZES = '(min-width: 1280px) 250px, (min-width: 1040px) 230px, (min-width: 640px) 31vw, 46vw';

// The grid as a listing renders it, with tree 1's Gear and Assortment roots and quick add on
// unless a test sets otherwise; `before` runs first, to set a page variable (rf_banner from the
// listing head, rf_cards_lazy from the hub's head).
const grid = (context = {}, { before = '' } = {}) => renderPartial(CALLER, {
    products,
    page_type: 'category',
    settings: {},
    ...context,
    theme_settings: { rf_price_unit_exclude: TREE_1, rf_quick_add: true, ...context.theme_settings },
}, {
    overrides: { [CALLER]: `${before}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` },
});
const hasClass = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const items = html => elementsHtml(html, 'li', hasClass('rf-fly'));
const cards = html => elementsHtml(html, 'article', hasClass('rf-fly__card'));
const image = card => findTags(card, 'img')[0];
const line = card => textOf(outerHtml(card, 'span', hasClass('rf-fly__sizes')));
const price = card => textOf(outerHtml(card, 'p', hasClass('rf-fly__price')));
const control = card => findTags(card).find(tag => hasClass('rf-add')(tag.attrs));
// The control's words with its screen-reader name: "+ Add: Royal Coachman Streamer".
const controlText = card => textOf(outerHtml(card, control(card).name, hasClass('rf-add'))).replace(/\s*:\s*/, ': ');

describe('the card (components/reelflies/fly.html, from fly-listing.html)', () => {
    it('is one li.product per product, in order, each with the stock card\'s analytics attributes on its article, and balances', async () => {
        const html = await grid();
        assert.deepEqual(items(html).map(item => findTags(item, 'li')[0].attrs['data-rf-product']), products.map(product => String(product.id)));
        assert.deepEqual(cards(html).map(card => findTags(card, 'article')[0].attrs['data-entity-id']), products.map(product => String(product.id)));
        const [article] = findTags(cards(html)[0], 'article');
        assert.equal(article.attrs['data-event-type'], 'list');
        assert.equal(article.attrs['data-position'], '1');
        assert.equal(article.attrs['data-name'], 'Royal Coachman Streamer');
        assert.equal(article.attrs['data-product-category'], 'Flies/Streamers &amp; Buggers/Streamers &amp; Bucktails, Flies/Saltwater, Warmwater &amp; Salmon/Atlantic Salmon Flies');
        assert.equal(article.attrs['data-product-price'], '1.25');
        assert.equal(findTags(cards(html)[5], 'article')[0].attrs['data-product-brand'], 'ReelFlies');
        assert.match(findTags(items(html)[0], 'li')[0].attrs.class, /(^|\s)product(\s|$)/, 'li.product, which stock search.js counts');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('shows the name as an H3 link and the price, with no brand line, star row, compare checkbox or Quick view (SEO-9; story 28)', async () => {
        const html = await grid();
        for (const card of cards(html)) {
            assert.equal(findTags(card, 'input').length, 0, 'no compare checkbox');
            assert.doesNotMatch(card, /quickview|card-figcaption|data-test-info-type/, 'nothing of stock\'s card');
            const name = outerHtml(card, 'h3', hasClass('rf-fly__name'));
            assert.equal(findTags(name, 'a').length, 1);
            assert.ok(price(card), 'the price');
        }
        assert.doesNotMatch(cards(html)[5], />\s*ReelFlies\s*</, 'no brand line, though the product has a brand');
        assert.equal(textOf(outerHtml(cards(html)[0], 'h3')), 'Royal Coachman Streamer');
    });

    it('adds "/ fly" to flies only, by the fly rule (story 28)', async () => {
        const units = cards(await grid()).map(card => /rf-fly__unit/.test(card));
        // 4831 and 5906 flies; 5697 a hook pack; 5879 a bulk selection; 5234 and 4804 flies.
        assert.deepEqual(units, [true, true, false, false, true, true]);
        assert.equal(price(cards(await grid())[0]), `$1.25 ${LANG.per_fly}`);
        assert.equal(price(cards(await grid())[2]), '$22.95');
        assert.deepEqual(cards(await grid({ theme_settings: { rf_price_unit_exclude: '' } })).map(card => /rf-fly__unit/.test(card)), products.map(() => false), 'no roots set: no unit');
    });

    it('prices a range from its lowest, with "from"', async () => {
        const ranged = { ...products[0], price: { price_range: { min: { without_tax: { formatted: '$1.25', value: 1.25 } }, max: { without_tax: { formatted: '$2.50', value: 2.5 } } } } };
        const [card] = cards(await grid({ products: [ranged] }));
        assert.equal(price(card), `${LANG.from} $1.25 ${LANG.per_fly}`);
        assert.equal(findTags(card, 'article')[0].attrs['data-product-price'], '1.25');
    });

    it('says "Sold out" in the reserved line of a product with stock_level 0, marks its item, and links to its page instead of adding (the owner, 2026-11-07: nothing over the photo)', async () => {
        const html = await grid();
        assert.deepEqual(items(html).map(item => hasClass('is-sold')(findTags(item, 'li')[0].attrs)), [false, false, false, false, true, false]);
        assert.deepEqual(cards(html).map(line), ['', '', '', '', LANG.sold_out, '']);
        const sold = control(cards(html)[4]);
        assert.equal(sold.name, 'a');
        assert.equal(sold.attrs.href, products[4].url);
        assert.equal(controlText(cards(html)[4]), `${LANG.view}: ${products[4].name}`);
        assert.equal(findTags(cards(html)[4], 'button').length, 0);
    });

    it('with quick add on, "+ Add" opens the sizes for a product with options and "Add 1" adds one without, each naming its product, with the hidden panel the script fills (story 35)', async () => {
        const list = cards(await grid());
        const expected = [['sizes', LANG.add], ['one', LANG.add_one], ['one', LANG.add_one], ['one', LANG.add_one], null, ['sizes', LANG.add]];
        list.forEach((card, index) => {
            if (!expected[index]) return;
            const button = control(card);
            assert.equal(button.name, 'button', `card ${index + 1}`);
            assert.equal(button.attrs.type, 'button');
            assert.equal(button.attrs['data-rf-add'], expected[index][0], `card ${index + 1}`);
            assert.equal(button.attrs['aria-expanded'], 'false');
            assert.equal(controlText(card), `${expected[index][1]}: ${products[index].name}`);
            const panel = findTags(card, 'div').find(tag => 'data-rf-sizes' in tag.attrs);
            assert.ok(panel && 'hidden' in panel.attrs, `card ${index + 1}: a hidden sizes panel`);
        });
    });

    it('with quick add off, links to the product page: "Choose a size" with options, "View" without, and no panel', async () => {
        const list = cards(await grid({ theme_settings: { rf_quick_add: false } }));
        assert.deepEqual(list.map(card => control(card).name), products.map(() => 'a'));
        assert.deepEqual(list.map(card => control(card).attrs.href), products.map(product => product.url));
        assert.deepEqual(list.map(card => controlText(card).split(':')[0]), [LANG.choose, LANG.view, LANG.view, LANG.view, LANG.view, LANG.choose]);
        assert.equal(findTags(await grid({ theme_settings: { rf_quick_add: false } })).filter(tag => 'data-rf-sizes' in tag.attrs).length, 0);
    });

    it('reserves one line under the price for the size range and what the box holds, so adding never moves the layout', async () => {
        for (const card of cards(await grid())) {
            const reserved = outerHtml(card, 'p', hasClass('rf-fly__line'));
            assert.ok(reserved, 'the reserved line');
            assert.equal(findTags(reserved, 'span').filter(tag => hasClass('rf-fly__sizes')(tag.attrs)).length, 1);
            const inbox = findTags(reserved, 'span').find(tag => 'data-rf-inbox' in tag.attrs);
            assert.ok(inbox && 'hidden' in inbox.attrs, 'the box line, hidden until the box has the fly');
        }
    });
});

describe('the card\'s photo (SEO-14, O23, IMG-1)', () => {
    it('is the photo as shot at 3:2, 720 by 480, in a link out of the tab order (the name is the link), with alt=""', async () => {
        for (const card of cards(await grid())) {
            const img = image(card);
            assert.equal(img.attrs.width, '720');
            assert.equal(img.attrs.height, '480');
            assert.equal(img.attrs.alt, '');
            const link = findTags(card, 'a').find(tag => hasClass('rf-fly__photo')(tag.attrs));
            assert.equal(link.attrs.tabindex, '-1');
            assert.equal(link.attrs['aria-hidden'], 'true');
            assert.equal(findTags(outerHtml(card, 'a', hasClass('rf-fly__photo'))).filter(tag => tag.name !== 'a' && tag.name !== 'img').length, 0, 'nothing over the photo');
        }
    });

    it('on a page with no banner: the first card high priority, the first three eager, the rest lazy, none through lazysizes (story 70)', async () => {
        const imgs = cards(await grid()).map(image);
        assert.equal(imgs[0].attrs.fetchpriority, 'high');
        imgs.slice(1).forEach(img => assert.equal(img.attrs.fetchpriority, undefined));
        imgs.slice(0, 3).forEach(img => assert.equal(img.attrs.loading, undefined, 'eager'));
        imgs.slice(3).forEach(img => assert.equal(img.attrs.loading, 'lazy'));
        for (const img of imgs) {
            assert.match(img.attrs.srcset, /\/80w\/.* 80w, .*\/2560w\/.* 2560w$/, 'Stencil\'s sizes');
            assert.match(img.attrs.src, /\/360w\//);
            assert.equal(img.attrs.sizes, SIZES);
            assert.equal(img.attrs.decoding, 'async');
            assert.doesNotMatch(img.attrs.class || '', /(^|\s)lazyload(\s|$)/, 'not lazysizes');
            assert.equal(img.attrs['data-srcset'], undefined);
            assert.doesNotMatch(img.attrs.srcset, /^data:/, 'no LQIP stand-in');
        }
    });

    it('on a page with a banner (listing-head.html sets rf_banner): no card high priority, the first three still eager', async () => {
        const imgs = cards(await grid({}, { before: "{{assignVar 'rf_banner' 1}}" })).map(image);
        imgs.forEach(img => assert.equal(img.attrs.fetchpriority, undefined));
        imgs.slice(0, 3).forEach(img => assert.equal(img.attrs.loading, undefined));
        imgs.slice(3).forEach(img => assert.equal(img.attrs.loading, 'lazy'));
    });

    it('under the Species hub (hub-head.html sets rf_cards_lazy): every photo lazy, none high priority', async () => {
        const imgs = cards(await grid({}, { before: "{{assignVar 'rf_cards_lazy' 1}}" })).map(image);
        imgs.forEach(img => {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
        });
    });

    it('passes the card-images assertion, with and without a banner', async () => {
        const page = (html, banner) => `${banner ? '<div class="rf-list-head rf-list-head--stone"><div class="rf-list-head__photo"><img src="/b.jpg" srcset="/b.jpg 1600w" sizes="100vw" width="1600" height="700" alt="" fetchpriority="high"></div></div>' : ''}<div id="product-listing-container">${html}</div>`;
        assert.deepEqual(cardImageProblems(page(await grid(), false), 'category'), []);
        assert.deepEqual(cardImageProblems(page(await grid({}, { before: "{{assignVar 'rf_banner' 1}}" }), true), 'category'), []);
    });
});

// A whole page, not just the grid: inside a page's {{#partial}} block @root is empty, so a card
// that read @root.theme_settings would lose them there and nowhere else. The grid reads
// rf_quick_add from the theme_settings each caller passes, because a refresh renders it alone.
describe('the cards on a whole search page (pages/search)', () => {
    const searchPage = theme => renderPartial('pages/search', {
        page_type: 'search',
        product_results: { products, show_compare: true },
        forms: { search: { query: 'streamer', section: 'product' } },
        pagination: { product_results: { total: products.length, links: [] } },
        settings: {},
        urls: { search: '/search.php' },
        theme_settings: theme,
    }, { variation: 'ReelFlies CA channel 1' });

    it('keeps "/ fly", the buy controls and the first row\'s eager photos, with the first one high priority and the page\'s only one', async () => {
        const html = await searchPage({});
        const list = cards(html);
        assert.equal(list.length, products.length);
        assert.deepEqual(list.map(card => /rf-fly__unit/.test(card)), [true, true, false, false, true, true]);
        assert.deepEqual(list.map(card => control(card).name), ['button', 'button', 'button', 'button', 'a', 'button'], 'channel 1 has quick add on');
        const imgs = list.map(image);
        assert.equal(imgs[0].attrs.fetchpriority, 'high');
        assert.deepEqual(imgs.map(img => img.attrs.loading ?? 'eager'), ['eager', 'eager', 'eager', 'lazy', 'lazy', 'lazy']);
        assert.equal(findTags(html, 'img').filter(img => img.attrs.fetchpriority === 'high').length, 1);
        assert.equal(findTags(html, 'h1').length, 1);
    });

    it('and a refresh of the listing alone, with the quick-add switch off, draws links in place of the buttons', async () => {
        const html = await renderPartial('components/search/product-listing', {
            product_results: { products },
            pagination: { product_results: { total: products.length, links: [] } },
            settings: {},
            theme_settings: { product_list_display_mode: 'grid', rf_quick_add: false, rf_price_unit_exclude: TREE_1 },
        });
        assert.deepEqual(cards(html).map(card => control(card).name), products.map(() => 'a'));
        assert.equal(findTags(html).filter(tag => 'data-rf-sizes' in tag.attrs).length, 0);
    });
});

describe('the cards outside a listing grid (the product page\'s related patterns)', () => {
    it('are lazy, with no high priority and no quick add: each links to its own page to choose', async () => {
        const html = await renderPartial('components/reelflies/product-related', {
            product: { related_products: products },
            settings: {},
            theme_settings: { rf_price_unit_exclude: TREE_1, rf_quick_add: true },
        });
        const imgs = cards(html).map(image);
        assert.equal(imgs.length, products.length);
        imgs.forEach(img => {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
        });
        assert.deepEqual(cards(html).map(card => control(card).name), products.map(() => 'a'));
        assert.deepEqual(cards(html).map(card => /rf-fly__unit/.test(card)), [true, true, false, false, true, true], 'the fly rule holds here too');
    });
});

describe('the card grid\'s shot (card-screens.spec.mjs)', () => {
    it('shoots exactly these products, with tree 1\'s Gear and Assortment roots', () => {
        const shot = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/pages/card-grid/fixtures/search.json'), 'utf8'));
        assert.deepEqual(shot.page_context.product_results.products, products);
        assert.equal(shot.page_context.theme_settings.rf_price_unit_exclude, TREE_1);
        assert.equal(shot.page, 'pages/search');
    });

    it('and every fixture page that lists these products lists them as this file has them, so the shots show what the store sends (stock_level included)', () => {
        const byId = new Map(products.map(product => [product.id, product]));
        const listed = [];
        const walk = (value, found) => {
            if (Array.isArray(value)) value.forEach(item => walk(item, found));
            else if (value && typeof value === 'object') {
                if (byId.has(value.id) && 'has_options' in value) found.push(value);
                else Object.values(value).forEach(item => walk(item, found));
            }
        };
        const pages = path.join(THEME_DIR, 'scripts/qa/render/pages');
        for (const page of fs.readdirSync(pages)) {
            const dir = path.join(pages, page, 'fixtures');
            if (!fs.existsSync(dir)) continue; // eslint-disable-line no-continue
            for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) {
                const found = [];
                walk(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')), found);
                found.forEach(product => assert.deepEqual(product, byId.get(product.id), `${page}/${file}: product ${product.id}`));
                if (found.length) listed.push(`${page}/${file}`);
            }
        }
        assert.ok(listed.length >= 7, `the card grid, the category pages, quick add's panel and the Species hub list them (${listed.join(', ')})`);
    });
});

describe('the grid (components/products/grid.html)', () => {
    it('is the specimen list, ul.rf-flies[data-rf-grid], one card per product in order, and reads the quick-add switch from the theme_settings it is passed', async () => {
        const html = await grid();
        const [list] = findTags(html, 'ul');
        assert.match(list.attrs.class, /(^|\s)rf-flies(\s|$)/);
        assert.ok('data-rf-grid' in list.attrs);
        assert.equal(findTags(html, 'ul').length, 1);
        assert.deepEqual(cards(html).map(card => findTags(card, 'article')[0].attrs['data-entity-id']), products.map(product => String(product.id)));
        assert.doesNotMatch(html, /productGrid/, 'stock\'s grid is gone');
    });
});
