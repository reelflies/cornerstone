// The product page's reviews (ticket 40; spec module 15 and 23; R11, SEO-5; stories 47, 68 and
// 75): the section in ticket 39's slot (components/reelflies/product-reviews.html), the star summary
// under the price (review-summary.html, from product-price-extras.html), the no-reviews state, and
// stock products/schema.html's JSON-LD, whose aggregateRating and review follow the same rule as
// the section: the store's review setting, theme_settings.show_product_reviews and reviews on the
// page. Rendered on the fixture page's product (the reference's Adams Parachute,
// render/pages/product-page/fixtures/adams.json), whose three reviews are samples, never a
// shopper's.
//
//   node --test scripts/qa/render/partials/product-reviews.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, scriptsOfType, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, readFixture, renderPartial } from '../render.mjs';

const FIXTURE = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json'));
const CONTEXT = FIXTURE.page_context;
const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.reviews;

const NO_REVIEWS = { reviews: { total: 0 }, num_reviews: 0, rating: 0 };
const SIX = Array.from({ length: 5 }, (_, i) => ({
    name: `Sample reviewer ${i + 1}`, rating: String(5 - (i % 2)), title: `Sample review ${i + 1}`, text: `Sample text ${i + 1}.`, date: `${i + 1}th May 2026`,
}));

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
const quickView = ({ product = {} } = {}) => renderPartial('components/products/quick-view', {
    ...CONTEXT,
    product: { ...CONTEXT.product, ...product },
});

const has = name => attrs => name in attrs;
const section = html => outerHtml(html, 'section', has('data-rf-reviews'));
const empty = html => outerHtml(html, 'div', has('data-rf-reviews-empty'));
const summary = html => outerHtml(html, 'p', has('data-rf-review-summary'));
const items = html => elementsHtml(section(html) || '', 'li', has('data-rf-review'));
const writes = html => findTags(html).filter(tag => tag.attrs['data-reveal-id'] === 'modal-review-form');
const forms = html => findTags(html, 'div').filter(tag => tag.attrs.id === 'modal-review-form');
const buyBox = html => outerHtml(html, 'div', has('data-rf-product-buy'));
const product = html => scriptsOfType(html, 'application/ld+json').map(block => JSON.parse(block)).find(block => block['@type'] === 'Product');
// Each marker's place in `html`, which must exist, in the order given.
const inOrder = (html, markers) => {
    const at = markers.map(marker => [marker, html.indexOf(marker)]);
    for (const [marker, index] of at) assert.ok(index >= 0, `${marker} is there`);
    for (let i = 1; i < at.length; i++) assert.ok(at[i][1] > at[i - 1][1], `${at[i][0]} comes after ${at[i - 1][0]}`);
};

describe('the settings (config.json)', () => {
    it('shows the reviews and lists five of them (R11)', () => {
        assert.equal(config.settings.show_product_reviews, true);
        assert.equal(config.settings.productpage_reviews_count, 5);
    });

    it('gives the fixture page\'s product three reviews, each marked a sample (SEO-5\'s mockup note)', () => {
        const { reviews } = CONTEXT.product;
        assert.equal(reviews.total, 3);
        assert.equal(CONTEXT.product.num_reviews, 3);
        for (const review of reviews.list) assert.match(`${review.name} ${review.title}`, /Sample/);
    });
});

describe('the reviews section (components/reelflies/product-reviews.html; story 47)', () => {
    it('renders "Reviews (N)" with each review: its title, stars, who and when, and the text', async () => {
        const html = await productPage();
        const reviews = section(html);
        assert.ok(reviews, 'the section');
        const [open] = findTags(reviews, 'section');
        assert.equal(open.attrs.id, 'product-reviews', 'stock\'s id, which the in-page link and stock\'s reviews.js read');
        assert.equal(open.attrs['data-rf-review-total'], '3');
        const [heading] = elementsHtml(reviews, 'h2', () => true);
        assert.equal(textOf(heading), 'Reviews (3)');
        assert.equal(open.attrs['aria-labelledby'], findTags(heading, 'h2')[0].attrs.id);
        const list = items(html);
        assert.equal(list.length, 3);
        const [first, , third] = list;
        assert.equal(textOf(outerHtml(first, 'h3', () => true)), CONTEXT.product.reviews.list[0].title);
        assert.equal(findTags(first, 'span').find(tag => tag.attrs.role === 'img').attrs['aria-label'], 'Rated 5 out of 5');
        assert.match(textOf(first), new RegExp(`Posted by ${CONTEXT.product.reviews.list[0].name} on ${CONTEXT.product.reviews.list[0].date}`));
        assert.match(textOf(third), /Posted by Unknown on/, 'stock\'s word for a review with no name');
        assert.ok(first.includes(CONTEXT.product.reviews.list[0].text), 'the text, line breaks kept for the stylesheet to show');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('draws each review\'s stars filled up to its rating', async () => {
        const second = items(await productPage())[1];
        const stars = findTags(second, 'svg').filter(tag => /(^|\s)rf-star(\s|$)/.test(tag.attrs.class || ''));
        assert.equal(stars.length, 5);
        assert.equal(stars.filter(tag => /rf-star--full/.test(tag.attrs.class)).length, Number(CONTEXT.product.reviews.list[1].rating));
        assert.equal(findTags(second, 'use')[0].attrs.href, '#rf-icon-star');
    });

    it('lists what the store sends for the page (productpage_reviews_count), and stock\'s pager when there are more', async () => {
        const html = await productPage({
            product: { reviews: { total: 12, list: SIX }, num_reviews: 12, rating: 5 },
            context: { pagination: { reviews: { current: 1, next: 'https://reelflies.ca/adams-parachute-dry-fly/?revpage=2' } } },
        });
        assert.equal(items(html).length, 5);
        assert.equal(textOf(outerHtml(section(html), 'h2', () => true)), 'Reviews (12)');
        const pager = outerHtml(section(html), 'nav', attrs => /(^|\s)pagination(\s|$)/.test(attrs.class || ''));
        assert.ok(pager, 'stock\'s pager inside the section');
        assert.ok(findTags(pager, 'a').some(tag => decodeHtml(tag.attrs.href).endsWith('?revpage=2')));
        assert.equal(outerHtml(section(await productPage()), 'nav', () => true), null, 'no pager on one page of reviews');
    });

    it('offers "Write a review" in the section\'s head: one button that opens stock\'s review form, which is on the page once', async () => {
        const html = await productPage();
        const head = outerHtml(section(html), 'div', attrs => /rf-reviews-head/.test(attrs.class || ''));
        const [button] = findTags(head, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs['data-reveal-id'], 'modal-review-form');
        assert.equal(textOf(outerHtml(head, 'button', () => true)), 'Write a review');
        assert.equal(writes(html).length, 1, 'one control opens the form');
        assert.equal(forms(html).length, 1, 'stock\'s form once');
        assert.ok(findTags(html, 'form').some(tag => /writeReview-form/.test(tag.attrs.class || '')), 'stock\'s form, which product.js wires');
    });

    it('comes after the details, under the photos: ticket 39\'s slot (build pipeline 6.9)', async () => {
        const html = await productPage();
        inOrder(html, ['data-rf-product-details', 'data-rf-reviews ', 'data-rf-related']);
        const description = outerHtml(html, 'article', attrs => /productView-description/.test(attrs.class || ''));
        assert.ok(description.includes('data-rf-reviews '), 'inside the details\' column');
    });

    it('is the page\'s only list of reviews, whatever show_product_details_tabs says (pages/product.html\'s hook)', async () => {
        for (const tabs of [true, false]) {
            const html = await productPage({ theme: { show_product_details_tabs: tabs } }); // eslint-disable-line no-await-in-loop
            assert.equal(findTags(html).filter(tag => tag.attrs.id === 'product-reviews').length, 1, `tabs ${tabs}`);
            assert.ok(!html.includes('productReviews-list'), `no stock list, tabs ${tabs}`);
        }
    });
});

describe('the star summary under the price (components/reelflies/review-summary.html)', () => {
    it('shows the stars and "N reviews" as one link to the section, in the buy box between the price and the shipping line', async () => {
        const html = await productPage();
        const line = summary(html);
        assert.ok(line, 'the summary');
        const [link] = findTags(line, 'a');
        assert.equal(link.attrs.href, '#product-reviews');
        assert.equal(findTags(line, 'span').find(tag => tag.attrs.role === 'img').attrs['aria-label'], 'Rated 5 out of 5');
        assert.equal(textOf(outerHtml(line, 'span', has('data-rf-review-count'))), '3 reviews');
        inOrder(buyBox(html), ['class="productView-price"', 'data-rf-review-summary', 'data-rf-ship-line']);
    });

    it('says "1 review" for one', async () => {
        const html = await productPage({ product: { reviews: { total: 1, list: SIX.slice(0, 1) }, num_reviews: 1, rating: 5 } });
        assert.equal(textOf(outerHtml(summary(html), 'span', has('data-rf-review-count'))), '1 review');
        assert.equal(textOf(outerHtml(section(html), 'h2', () => true)), 'Reviews (1)');
    });

    it('replaces stock\'s rating row on the product page; Quick view keeps it', async () => {
        const html = await productPage();
        assert.ok(!findTags(html, 'div').some(tag => /(^|\s)productView-rating(\s|$)/.test(tag.attrs.class || '')), 'no stock rating row');
        assert.ok(!html.includes('productReview_link'));
        const quick = await quickView();
        assert.ok(findTags(quick, 'div').some(tag => /(^|\s)productView-rating(\s|$)/.test(tag.attrs.class || '')), 'Quick view\'s rating row');
        assert.ok(!quick.includes('data-rf-review-summary') && !quick.includes('data-rf-reviews'));
    });
});

describe('a product with no reviews (stories 47 and 75)', () => {
    it('has no section and no summary, and offers "Write a review" under "No reviews yet for this fly."', async () => {
        const html = await productPage({ product: NO_REVIEWS });
        assert.equal(section(html), null);
        assert.equal(summary(html), null);
        assert.ok(!findTags(html).some(tag => tag.attrs.id === 'product-reviews'));
        const block = empty(html);
        assert.ok(block, 'the no-reviews block');
        assert.equal(findTags(block, 'h2').length + findTags(block, 'h3').length, 0, 'no heading: not a reviews section');
        assert.equal(textOf(outerHtml(block, 'p', () => true)), 'No reviews yet for this fly.');
        assert.equal(textOf(outerHtml(block, 'button', () => true)), 'Write a review');
        assert.equal(writes(html).length, 1);
        assert.equal(forms(html).length, 1);
        inOrder(html, ['data-rf-product-details', 'data-rf-reviews-empty', 'data-rf-related']);
    });

    it('says "No reviews yet." off a fly, by ticket 31\'s rule, as the details\' words', async () => {
        const html = await productPage({ product: { ...NO_REVIEWS, category: ['Fly Gear', 'Fly Gear/Fly Boxes'] } });
        assert.equal(textOf(outerHtml(empty(html), 'p', () => true)), 'No reviews yet.');
    });

    it('offers nothing, and has no review form, while the store doesn\'t take reviews (settings.show_product_reviews)', async () => {
        for (const reviewed of [{}, NO_REVIEWS]) {
            const html = await productPage({ product: reviewed, settings: { show_product_reviews: false } }); // eslint-disable-line no-await-in-loop
            assert.equal(section(html), null);
            assert.equal(summary(html), null);
            assert.equal(empty(html), null);
            assert.equal(writes(html).length, 0);
            assert.equal(forms(html).length, 0);
        }
    });

    it('with the theme setting off, shows no reviews but still offers "Write a review" alone, as stock did', async () => {
        const html = await productPage({ theme: { show_product_reviews: false } });
        assert.equal(section(html), null);
        assert.equal(summary(html), null);
        const block = empty(html);
        assert.equal(findTags(block, 'p').length, 0, 'no "No reviews yet": the product has reviews');
        assert.equal(writes(html).length, 1);
    });
});

describe('the JSON-LD (stock products/schema.html\'s hook; module 23; story 75)', () => {
    it('marks up the reviews the page shows: aggregateRating, and one review for each in the section', async () => {
        const html = await productPage();
        const data = product(html);
        assert.deepEqual(data.aggregateRating, {
            '@type': 'AggregateRating', ratingValue: '5', reviewCount: '3',
        });
        assert.equal(data.review.length, items(html).length);
        assert.deepEqual(data.review.map(review => review.name), CONTEXT.product.reviews.list.map(review => review.title));
    });

    it('writes each review\'s datePublished as an ISO 8601 date, not the store\'s display string', async () => {
        const data = product(await productPage());
        assert.deepEqual(data.review.map(review => review.datePublished), ['2026-06-03', '2026-05-14', '2025-04-02']);
    });

    it('marks up no aggregateRating or review without the section: no reviews, the theme setting off, or the store\'s off (criteria 2 and 3)', async () => {
        for (const [why, options] of [
            ['no reviews', { product: NO_REVIEWS }],
            ['the theme setting off', { theme: { show_product_reviews: false } }],
            ['the store setting off', { settings: { show_product_reviews: false } }],
        ]) {
            const html = await productPage(options); // eslint-disable-line no-await-in-loop
            const data = product(html);
            assert.equal(data.aggregateRating, undefined, why);
            assert.equal(data.review, undefined, why);
            assert.equal(section(html), null, why);
        }
    });

    it('keeps one Offer, and the brand when the product has one (stock\'s, for ticket 18\'s ReelFlies brand)', async () => {
        const plain = product(await productPage());
        assert.equal(plain.offers['@type'], 'Offer');
        assert.ok(!Array.isArray(plain.offers));
        assert.equal(plain.brand, undefined);
        const branded = product(await productPage({ product: { brand: { name: 'ReelFlies', url: 'https://reelflies.ca/reelflies-2/' } } }));
        assert.deepEqual(branded.brand, { '@type': 'Brand', url: 'https://reelflies.ca/reelflies-2/', name: 'ReelFlies' });
    });

    it('parses with every optional part present and absent', async () => {
        const everything = {
            brand: { name: 'ReelFlies', url: '/b/' }, sku: '', mpn: 'M1', gtin: '0123456789012',
        };
        for (const options of [{}, { product: NO_REVIEWS }, { product: everything }]) {
            const html = await productPage(options); // eslint-disable-line no-await-in-loop
            for (const block of scriptsOfType(html, 'application/ld+json')) assert.doesNotThrow(() => JSON.parse(block));
        }
    });
});

describe('the words (lang/en.json, reelflies.reviews)', () => {
    it('are the spec\'s: "Reviews (N)" and "Write a review", with "review" in lower case', () => {
        assert.equal(lang.write, 'Write a review');
        assert.equal(lang.none_fly, 'No reviews yet for this fly.');
        assert.equal(lang.none, 'No reviews yet.');
    });
});
