// The product page (redesign step 3; tickets 37-40; spec module 15; O14, O23, R6, SEO-8, UX-11,
// UX-12, UX-20; stories 36, 44 to 49 and 70): pages/product.html renders components/reelflies/
// product-page.html in its hero block, whose product-view.html keeps every hook stock
// ProductDetails and image-gallery.js read, with product-image.html (the main photo),
// product-buy.html (how the page buys), shipping-line.html, product-details.html and
// product-related.html. Stock products/product-view.html is Quick view's alone now. Rendered on
// the fixture page's product, the reference's Adams Parachute and its four related patterns
// (render/pages/product-page/fixtures/adams.json), with the GraphQL answer built from its options
// (product-page/context.mjs). The picker's rows are product-picker.test.mjs's; the reviews
// product-reviews.test.mjs's.
//
// Retired with the redesign: ticket 39's "Save to wish list" button (stock's dropdown stays, in
// the panel), the alerts box above the photos (stock's alerts render in the view), and the
// details' data-rf-details markers (the sections are read by their summaries).
//
//   node --test scripts/qa/render/partials/product-page.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import { CONTEXT, productPage, quickView } from './product-page/context.mjs';

const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.product;

const has = name => attrs => name in attrs;
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const tagClassed = name => tag => classed(name)(tag.attrs);
// Text with tags cut out and nothing put in their place, for a line whose span sits before a stop.
const plain = html => decodeHtml(markupOnly(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const productView = html => outerHtml(html, 'div', classed('productView'));
const buyBox = html => outerHtml(html, 'section', classed('rf-pdp__buy'));
const details = html => outerHtml(html, 'div', classed('rf-details'));
const mainImage = html => findTags(html, 'img').filter(tag => 'data-main-image' in tag.attrs);
const related = html => outerHtml(html, 'section', classed('rf-pdp-related'));
const sections = html => elementsHtml(details(html) || '', 'details', () => true);
const summaries = html => sections(html).map(each => textOf(outerHtml(each, 'summary') || ''));
const section = (html, title) => sections(html).find(each => textOf(outerHtml(each, 'summary') || '') === title);
// Each marker's place in `html`, which must exist, in the order given.
const inOrder = (html, markers) => {
    const at = markers.map(marker => [marker, html.indexOf(marker)]);
    for (const [marker, index] of at) assert.ok(index >= 0, `${marker} is there`);
    for (let i = 1; i < at.length; i++) assert.ok(at[i][1] > at[i - 1][1], `${at[i][0]} comes after ${at[i - 1][0]}`);
};

describe('the product page\'s settings (config.json) and front matter (pages/product.html)', () => {
    it('has the main image at 760x507, no weight row, four related patterns and five reviews a page (O14; R6; R11)', () => {
        assert.equal(config.settings.product_size, '760x507');
        assert.equal(config.settings.show_product_weight, false);
        assert.equal(config.settings.productpage_related_products_count, 4);
        assert.equal(config.settings.productpage_reviews_count, 5);
        assert.equal(config.settings.show_quick_payment_buttons, true, 'ticket 24\'s setting, as it was');
    });

    it('asks the store for the related products and each choice\'s variant and stock, and for no "Customers Also Viewed" list', () => {
        const [, front] = fs.readFileSync(path.join(THEME_DIR, 'templates/pages/product.html'), 'utf8').split(/^---$/m);
        assert.match(front, /related_products:/);
        assert.match(front, /^gql: "query RfProductSizes\(\$productId: Int!\)/m);
        assert.match(front, /variants\(first: 50\)[^"]*isPurchasable inventory \{ isInStock \}/);
        assert.doesNotMatch(front, /similar_by_views/);
    });
});

describe('the layout (components/reelflies/product-page.html and product-view.html)', () => {
    it('puts the breadcrumbs, then the view: the photographs, the buy panel and the details, in that order, inside one band (story 46)', async () => {
        const html = await productPage();
        const band = outerHtml(html, 'div', classed('rf-pdp'));
        assert.ok(band, 'the band');
        inOrder(band, ['class="breadcrumbs"', 'rf-pdp__view', 'rf-pdp__photos', 'rf-pdp__buy', 'rf-pdp__more']);
        const view = productView(html);
        assert.match(findTags(view, 'div')[0].attrs.class, /(^|\s)rf-pdp__view(\s|$)/);
        const [photos] = findTags(view, 'section').filter(tagClassed('rf-pdp__photos'));
        assert.ok('data-image-gallery' in photos.attrs, 'stock image-gallery.js\'s root');
        assert.equal(decodeHtml(photos.attrs['aria-label']), 'Adams Parachute Dry Fly, photographs');
        assert.ok(!buyBox(html).includes('rf-pdp__photos'), 'the photos are outside the buy panel');
        assert.ok(!buyBox(html).includes('rf-details'), 'the details are outside the buy panel');
        assert.ok(outerHtml(html, 'div', classed('rf-pdp__more')).includes('class="rf-details"'), 'the details under the photographs');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('has one H1, the product\'s name, which labels the buy panel', async () => {
        const html = await productPage();
        const h1s = elementsHtml(html, 'h1');
        assert.equal(h1s.length, 1);
        assert.equal(textOf(h1s[0]), CONTEXT.product.title);
        const [title] = findTags(h1s[0], 'h1');
        assert.equal(title.attrs.id, 'rf-pdp-title');
        assert.match(title.attrs.class, /(^|\s)productView-title(\s|$)/, 'stock\'s class, which the data layer reads');
        assert.equal(findTags(buyBox(html), 'section')[0].attrs['aria-labelledby'], 'rf-pdp-title');
    });

    it('keeps the hooks stock ProductDetails and image-gallery.js read, whichever way the product is bought', async () => {
        const html = await productPage();
        const [view] = findTags(productView(html), 'div');
        assert.equal(view.attrs['data-event-type'], 'product');
        assert.equal(view.attrs['data-entity-id'], '4877');
        assert.equal(decodeHtml(view.attrs['data-name']), CONTEXT.product.title);
        assert.equal(view.attrs['data-product-price'], '0.95');
        for (const hook of ['data-cart-item-add', 'data-product-option-change', 'id="form-action-addToCart"', 'data-product-sku', 'data-image-gallery-main', 'data-image-gallery-item', 'data-image-gallery-new-image-url', 'data-image-gallery-zoom-image-url']) {
            assert.ok(html.includes(hook), hook);
        }
        assert.ok(findTags(html, 'div').some(tag => tag.attrs.id === 'previewModal' && 'data-reveal' in tag.attrs), 'stock\'s preview modal, which itemAdd opens');
        assert.equal(textOf(outerHtml(html, 'dd', has('data-product-sku'))), 'RF-3905');
        assert.ok(!('hidden' in findTags(html, 'dt').find(tagClassed('sku-label')).attrs));
        assert.ok('hidden' in findTags(await productPage({ product: { sku: '' } }), 'dt').find(tagClassed('sku-label')).attrs, 'the SKU label hides with no SKU');
    });

    it('orders the buy panel: title, price with "/ fly", the stars, the picker, the shipping line, the promise, the SKU and the wish list', async () => {
        inOrder(buyBox(await productPage()), [
            'id="rf-pdp-title"', 'rf-pdp__price', 'rf-pdp__unit', 'rf-review-sum', 'data-rf-pick-page', 'data-rf-pdp-form', 'rf-pdp__ship', 'rf-pdp__promise', 'data-product-sku', 'rf-pdp__wish',
        ]);
    });

    it('shows no weight row, no share links, no stock tabs and no stock rating row (story 50; the redesign\'s own summary and details)', async () => {
        const html = await productPage();
        assert.ok(CONTEXT.product.weight, 'the fixture has a weight');
        assert.ok(!html.includes('data-product-weight'));
        assert.equal(findTags(productView(html), 'ul').filter(tagClassed('socialLinks')).length, 0);
        assert.ok(!findTags(html, 'ul').some(tag => 'data-tab' in tag.attrs), 'no description tabs');
        assert.ok(!findTags(html, 'div').some(tagClassed('productView-rating')), 'no stock rating row');
    });

    it('renders stock\'s review alerts in the view, each once', async () => {
        const messages = [{ error: 'Please enter a title.' }, { success: 'Thank you for your review.' }];
        const view = productView(await productPage({ product: { reviews: { ...CONTEXT.product.reviews, messages } } }));
        // Before the photographs: stock's review modal, further down, holds an alert box of its own.
        assert.equal(elementsHtml(view.slice(0, view.indexOf('rf-pdp__photos')), 'div', attrs => /alertBox--(error|success)/.test(attrs.class || '')).length, 2);
        for (const words of ['Please enter a title.', 'Thank you for your review.']) assert.equal(view.split(words).length, 2, `"${words}" once`);
    });

    it('carries the Page Builder regions: product_below_price in the panel, product_below_content after the band', async () => {
        const html = await productPage();
        assert.ok(findTags(buyBox(html), 'div').some(tag => tag.attrs['data-content-region'] === 'product_below_price'));
        assert.ok(html.indexOf('data-content-region="product_below_content"') > html.indexOf('rf-pdp__more'));
    });
});

describe('the main image (components/reelflies/product-image.html)', () => {
    it('loads first: fetchpriority high, never lazy, a srcset with its sizes, width and height, stock\'s class and the gallery\'s hook (story 70; SEO-8)', async () => {
        const [img] = mainImage(await productPage());
        assert.ok(img, 'the main image');
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.notEqual(img.attrs.loading, 'lazy');
        assert.equal(img.attrs.sizes, '(min-width: 1040px) 54vw, calc(100vw - 32px)');
        assert.equal(img.attrs.width, '760');
        assert.equal(img.attrs.height, '507');
        assert.equal(img.attrs.decoding, 'async');
        assert.doesNotMatch(img.attrs.class, /(^|\s)lazyload(\s|$)/);
        assert.match(img.attrs.class, /(^|\s)productView-image--default(\s|$)/, 'stock\'s class, which stock\'s styles and the gallery read');
        assert.equal(img.attrs['data-srcset'], undefined);
        const widths = img.attrs.srcset.split(',').map(candidate => candidate.trim().split(/\s+/)[1]);
        assert.deepEqual(widths, ['480w', '640w', '760w', '960w', '1280w', '1520w']);
        assert.match(img.attrs.src, /\/stencil\/760x507\/products\/4877\//);
        assert.equal(decodeHtml(img.attrs.alt), CONTEXT.product.main_image.alt);
    });

    it('takes its size from product_size, and its alt from the product\'s name when the photo has none', async () => {
        const [img] = mainImage(await productPage({ product: { main_image: { ...CONTEXT.product.main_image, alt: '' } }, theme: { product_size: '600x400' } }));
        assert.equal(img.attrs.alt, 'Adams Parachute Dry Fly');
        assert.equal(img.attrs.width, '600');
        assert.equal(img.attrs.height, '400');
        assert.match(img.attrs.src, /\/stencil\/600x400\//);
    });

    it('is the page\'s only fetchpriority="high"; the thumbnails are lazy 96x64 links the gallery swaps by, the shown photo\'s outlined', async () => {
        const html = await productPage();
        assert.equal(findTags(html).filter(tag => tag.attrs.fetchpriority === 'high').length, 1);
        const thumbs = outerHtml(html, 'ul', classed('rf-pdp__thumbs'));
        const links = findTags(thumbs, 'a');
        assert.deepEqual(links.map(link => classed('is-active')(link.attrs)), [true, false]);
        assert.deepEqual(links.map(link => link.attrs['aria-label']), ['Photo 1', 'Photo 2']);
        for (const link of links) assert.ok('data-image-gallery-item' in link.attrs && link.attrs['data-image-gallery-new-image-url'] && link.attrs['data-image-gallery-zoom-image-url']);
        for (const thumb of findTags(thumbs, 'img')) {
            assert.equal(thumb.attrs.loading, 'lazy');
            assert.equal(thumb.attrs.width, '96');
            assert.equal(thumb.attrs.height, '64');
            assert.equal(thumb.attrs.alt, '');
            assert.equal(thumb.attrs.fetchpriority, undefined);
        }
        assert.equal(outerHtml(await productPage({ product: { images: [CONTEXT.product.images[0]] } }), 'ul', classed('rf-pdp__thumbs')), null, 'no thumbnails for one photo');
    });

    it('shows the theme\'s default image, with the same priority and size, when the product has no photo', async () => {
        const html = await productPage({ product: { main_image: null, images: [] } });
        const [img] = mainImage(html);
        assert.match(img.attrs.src, /default-product/);
        assert.equal(img.attrs.fetchpriority, 'high');
        assert.equal(img.attrs.width, '760');
        assert.equal(img.attrs.height, '507');
        assert.equal(findTags(html).filter(tag => tag.attrs.fetchpriority === 'high').length, 1);
    });
});

describe('Quick view (products/quick-view.html, stock\'s product view)', () => {
    it('keeps stock\'s view: the lazy main image, the tabs and the rating row, with nothing of the page\'s own', async () => {
        const html = await quickView();
        assert.ok(!html.includes('rf-pdp__view'));
        assert.ok(!html.includes('data-rf-pick-page'));
        assert.ok(!html.includes('rf-pdp__ship'));
        assert.ok(!html.includes('rf-review-sum'));
        const [img] = mainImage(html);
        assert.match(img.attrs.class, /(^|\s)lazyload(\s|$)/);
        assert.equal(img.attrs.fetchpriority, undefined);
        assert.ok(findTags(html, 'ul').some(tag => 'data-tab' in tag.attrs), 'the description tabs');
        assert.ok(findTags(html, 'div').some(tagClassed('productView-rating')), 'the rating row');
        assert.deepEqual(unbalancedTags(html), []);
    });
});

describe('the price unit and the note under the price (fly-rule.html, category-match.html)', () => {
    it('says "/ fly" after the price of a fly, and nothing on gear or where no roots are named', async () => {
        assert.equal(textOf(outerHtml(buyBox(await productPage()), 'span', classed('rf-pdp__unit'))), '/ fly');
        assert.ok(!buyBox(await productPage({ product: { category: ['Fly Gear/Fly Boxes'] } })).includes('rf-pdp__unit'));
        assert.ok(!buyBox(await productPage({ theme: { rf_price_unit_exclude: '' } })).includes('rf-pdp__unit'), 'no roots set: the rule can\'t tell a fly');
    });

    it('shows "Log in for pricing" and no unit with the price hidden from guests', async () => {
        const box = buyBox(await productPage({ settings: { hide_price_from_guests: true } }));
        assert.ok(!box.includes('rf-pdp__unit'));
        assert.match(textOf(outerHtml(box, 'div', classed('rf-pdp__price'))), /Log in for pricing/);
    });

    it('adds "Fly box not included." under the price of a fly selection (rf_no_box_note_paths) and nowhere else', async () => {
        const paths = 'Fly Selections & Fly Boxes/Bulk Fly Selections,Fly Selections & Fly Boxes/Mini Fly Selections';
        const bulk = await productPage({ product: { category: ['Fly Selections & Fly Boxes/Bulk Fly Selections/Nymphs'] }, theme: { rf_no_box_note_paths: paths } });
        assert.equal(textOf(outerHtml(buyBox(bulk), 'p', classed('rf-pdp__note'))), lang.no_box);
        assert.equal(outerHtml(buyBox(await productPage({ theme: { rf_no_box_note_paths: paths } })), 'p', classed('rf-pdp__note')), null, 'a dry fly');
        assert.equal(outerHtml(buyBox(await productPage({ product: { category: ['Fly Selections & Fly Boxes/Bulk Fly Selections'] } })), 'p', classed('rf-pdp__note')), null, 'no paths named');
    });
});

describe('the shipping line (components/reelflies/shipping-line.html; story 44; UX-12)', () => {
    const CALLER = 'rf-test/shipping-line';
    const line = settings => renderPartial(CALLER, { theme_settings: settings, settings: { money: { currency_token: '$' } } }, {
        overrides: { [CALLER]: '{{> components/reelflies/shipping-line threshold=theme_settings.t rate=theme_settings.r expedited=theme_settings.e}}' },
    });
    const text = html => plain(outerHtml(html, 'p', classed('rf-pdp__ship')) || '');

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

    it('renders nothing without a threshold (ReelFlies US keeps its flat rate), and never says "fly-only"', async () => {
        assert.equal((await line({ t: '', r: '', e: '' })).trim(), '');
        assert.equal((await line({ t: '  ', r: '9.95', e: '' })).trim(), '');
        for (const words of Object.values(lang)) assert.doesNotMatch(words, /fly-only/i);
    });

    it('sits under the buying on the product page with the base settings\' $60, carrying no figure it wasn\'t given', async () => {
        const box = buyBox(await productPage());
        const shipping = outerHtml(box, 'p', classed('rf-pdp__ship'));
        assert.equal(plain(shipping), 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.');
        assert.doesNotMatch(shipping, /undefined|\{|X\.XX/);
        assert.ok(box.indexOf('data-rf-pdp-form') < box.indexOf('rf-pdp__ship'));
    });
});

describe('the end of the buy panel: the promise and the wish list', () => {
    it('puts the promise line under the buying, in the panel\'s hand (story 45; UX-11)', async () => {
        const box = buyBox(await productPage());
        inOrder(box, ['data-rf-pdp-form', 'rf-pdp__ship', 'rf-pdp__promise']);
        assert.equal(textOf(outerHtml(box, 'p', classed('rf-pdp__promise'))), lang.promise);
    });

    it('keeps stock\'s wish-list dropdown, posting to the product\'s add URL, and leaves it out with wish lists off (UX-20)', async () => {
        const wish = outerHtml(buyBox(await productPage()), 'div', classed('rf-pdp__wish'));
        assert.ok(wish, 'the wish list');
        const [form] = findTags(wish, 'form');
        assert.equal(decodeHtml(form.attrs.action), CONTEXT.product.add_to_wishlist_url);
        assert.ok('data-wishlist-add' in form.attrs, 'stock\'s marker, which product-details-base.js reads');
        assert.ok(findTags(wish, 'a').some(tag => tag.attrs['data-dropdown'] === 'wishlist-dropdown'));
        assert.equal(outerHtml(buyBox(await productPage({ settings: { show_wishlist: false } })), 'div', classed('rf-pdp__wish')), null);
    });
});

describe('the details under the photographs (components/reelflies/product-details.html; story 46; R6)', () => {
    it('renders three disclosures: "About this fly" open with the whole description, the other two closed, one summary each', async () => {
        const html = await productPage();
        assert.deepEqual(summaries(html), ['About this fly', 'Shipping and delivery', 'Hooks and tying']);
        const [about, shipping, hooks] = sections(html).map(each => findTags(each, 'details')[0]);
        assert.ok('open' in about.attrs);
        assert.ok(!('open' in shipping.attrs));
        assert.ok(!('open' in hooks.attrs));
        for (const each of sections(html)) {
            assert.equal(findTags(each, 'summary').length, 1, 'one summary, which the keyboard opens');
            assert.match(findTags(each, 'details')[0].attrs.class, /(^|\s)rf-details__item(\s|$)/);
            assert.ok(findTags(each, 'svg').some(tagClassed('rf-details__chev')), 'the chevron');
        }
        assert.ok(section(html, 'About this fly').includes(CONTEXT.product.description));
    });

    it('words shipping from the threshold, and links "Hooks and tying" to the hook size chart (the setting, else its default path)', async () => {
        const html = await productPage();
        assert.match(plain(section(html, 'Shipping and delivery')), /Free standard shipping in Canada on fly orders over \$60 \(fly boxes and gear not included\)\. Standard Canada Post/);
        assert.deepEqual(findTags(section(html, 'Hooks and tying'), 'a').map(link => link.attrs.href), ['/fly-hook-size-chart/']);
        assert.deepEqual(findTags(section(await productPage({ theme: { rf_hook_chart_url: '/hooks/' } }), 'Hooks and tying'), 'a').map(link => link.attrs.href), ['/hooks/']);
    });

    it('leaves "Shipping and delivery" out without a threshold (ReelFlies US), as the shipping line', async () => {
        const html = await productPage({ theme: { rf_ship_free_threshold: ' ' } });
        assert.deepEqual(summaries(html), ['About this fly', 'Hooks and tying']);
        assert.ok(!html.includes('rf-pdp__ship'));
    });

    it('leaves "About this fly" out of a product with no description, and adds the warranty when there is one', async () => {
        assert.deepEqual(summaries(await productPage({ product: { description: '' } })), ['Shipping and delivery', 'Hooks and tying']);
        const warranty = await productPage({ product: { warranty: '<p>Replaced if a hook fails.</p>' } });
        assert.deepEqual(summaries(warranty), ['About this fly', 'Shipping and delivery', 'Hooks and tying', 'Warranty Information']);
        assert.ok(section(warranty, 'Warranty Information').includes('Replaced if a hook fails.'));
    });

    it('words the details for a fly by the "/ fly" rule: gear, an Assortment, or a product the rule can\'t place gets "Description" and no "Hooks and tying"', async () => {
        for (const [why, product, theme] of [
            ['a fly box', { category: ['Fly Gear', 'Fly Gear/Fly Boxes'] }, {}],
            ['an Assortment', { category: ['Fly Selections & Fly Boxes/Bulk Fly Selections'] }, {}],
            ['no Placement', { category: [] }, {}],
            ['no roots named', {}, { rf_price_unit_exclude: '' }],
        ]) {
            assert.deepEqual(summaries(await productPage({ product, theme })), ['Description', 'Shipping and delivery'], why); // eslint-disable-line no-await-in-loop
        }
        assert.deepEqual(summaries(await productPage({ settings: { hide_price_from_guests: true } })), ['About this fly', 'Shipping and delivery', 'Hooks and tying'], 'a fly, its price hidden from guests');
    });

    it('keeps the custom fields, when Theme Styles puts them in a tab, as a section of their own', async () => {
        const html = await productPage({ product: { custom_fields: [{ name: 'Hook', value: 'Dry fly' }] }, theme: { show_custom_fields_tabs: true } });
        assert.equal(summaries(html).length, 4);
        assert.match(textOf(sections(html)[3]), /Hook/);
    });

    it('ends with the reviews, after the last section, in the same column (render/partials/product-reviews.test.mjs)', async () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/product-details.html'), 'utf8');
        const slot = source.indexOf('{{> components/reelflies/product-reviews}}');
        assert.ok(slot > source.lastIndexOf('</details>'), 'the include comes after the last section');
        assert.ok(slot > source.lastIndexOf('</div>'), 'outside the sections\' wrapper');
        const more = outerHtml(await productPage(), 'div', classed('rf-pdp__more'));
        inOrder(more, ['class="rf-details"', 'class="rf-reviews"']);
    });
});

describe('the related patterns (components/reelflies/product-related.html; story 48; O23)', () => {
    it('render a grid of specimen cards under "Related patterns": no carousel, no tab, no "Customers Also Viewed"', async () => {
        const html = await productPage();
        const grid = related(html);
        assert.ok(grid, 'the section');
        assert.equal(findTags(grid, 'section')[0].attrs['aria-labelledby'], 'rf-pdp-related-title');
        assert.equal(textOf(outerHtml(grid, 'h2')), lang.related);
        const [list] = findTags(grid, 'ul');
        assert.match(list.attrs.class, /(^|\s)rf-flies--related(\s|$)/);
        assert.ok('data-rf-grid' in list.attrs, 'listing.js fills the size lines, as a listing\'s');
        assert.equal(list.attrs['data-list-name'], 'Related Products', 'stock\'s list name, which the data layer reads');
        const cards = elementsHtml(grid, 'li', classed('rf-fly'));
        assert.equal(cards.length, 4);
        assert.deepEqual(cards.map(card => findTags(card, 'article')[0].attrs['data-entity-id']), CONTEXT.product.related_products.map(each => String(each.id)));
        assert.ok(!html.includes('productCarousel') && !findTags(grid).some(tag => 'data-slick' in tag.attrs), 'no carousel');
        assert.ok(!findTags(html).some(tag => tag.attrs.role === 'tablist' || tag.attrs.id === 'tab-related'), 'no tab');
        assert.ok(!html.includes('Customers Also Viewed'));
    });

    it('load their photos lazily, with no fetchpriority, measured for the grid', async () => {
        for (const img of findTags(related(await productPage()), 'img')) {
            assert.equal(img.attrs.loading, 'lazy');
            assert.equal(img.attrs.fetchpriority, undefined);
            assert.equal(img.attrs.sizes, '(min-width: 1280px) 250px, (min-width: 1040px) 230px, (min-width: 640px) 31vw, 46vw');
        }
    });

    it('offer no quick add: each card links to its own page to choose (ticket 43)', async () => {
        const grid = related(await productPage());
        assert.equal(findTags(grid, 'button').filter(tag => 'data-rf-add' in tag.attrs).length, 0);
        const links = findTags(grid, 'a').filter(tagClassed('rf-add--link'));
        assert.equal(links.length, 4);
        assert.deepEqual(links.map(link => link.attrs.href), CONTEXT.product.related_products.map(each => each.url));
        assert.deepEqual(elementsHtml(grid, 'a', classed('rf-add--link')).map(link => textOf(link).replace(/\s*:.*$/, '')), CONTEXT.product.related_products.map(each => (each.has_options ? 'Choose a size' : 'View')));
        assert.ok(!grid.includes('data-rf-sizes'), 'no picker panel');
    });

    it('render nothing for a product with no related products', async () => {
        assert.equal(related(await productPage({ product: { related_products: [] } })), null);
    });
});

describe('the words (lang/en.json, reelflies.product)', () => {
    it('are the reference\'s, with the promise and the free-shipping wording ticket 13 set', () => {
        assert.equal(lang.promise, 'We stand behind every fly we sell.');
        assert.equal(lang.related, 'Related patterns');
        assert.equal(lang.no_box, 'Fly box not included.');
        assert.deepEqual([lang.about, lang.description, lang.shipping, lang.hooks], ['About this fly', 'Description', 'Shipping and delivery', 'Hooks and tying']);
    });

    it('give "Hooks and tying" the reference\'s paragraph, and a second one that is new wording (story 15; a DRAFT for Shaun, ticket 39\'s close-out)', async () => {
        assert.equal(lang.hooks_body, 'Tied by hand on a branded hook from makers such as Mustad, Daiichi, Dai-Riki or Kamasan.');
        assert.equal(lang.hooks_chart, 'A bigger hook number means a smaller hook.');
        assert.equal(lang.hooks_chart_link, 'See the hook size chart');
        const hooks = textOf(section(await productPage(), 'Hooks and tying'));
        assert.match(hooks, /Tied by hand on a branded hook/);
        assert.match(hooks, /A bigger hook number means a smaller hook\. See the hook size chart/);
    });
});
