// The product page's reviews (ticket 40; redesign step 3; spec modules 15 and 23; R11, SEO-5;
// stories 47, 68 and 75): the section under the details (components/reelflies/
// product-reviews.html), the star summary beside the price (review-summary.html, from
// product-view.html's price row), the stars (stars.html), "Write a review" (review-write.html),
// the no-reviews state, and stock products/schema.html's JSON-LD, whose aggregateRating and
// review follow the same rule as the section: the store's review setting,
// theme_settings.show_product_reviews and reviews on the page. Rendered on the fixture page's
// product (the reference's Adams Parachute, render/pages/product-page/fixtures/adams.json), whose
// three reviews are samples, never a shopper's.
//
// The redesign's partials carry no data-rf-* hooks: the tests read their classes.
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
import { THEME_DIR } from '../render.mjs';
import { CONTEXT, productPage, quickView } from './product-page/context.mjs';

const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies.reviews;

const NO_REVIEWS = { reviews: { total: 0 }, num_reviews: 0, rating: 0 };
const FIVE = Array.from({ length: 5 }, (_, i) => ({
    name: `Sample reviewer ${i + 1}`, rating: String(5 - (i % 2)), title: `Sample review ${i + 1}`, text: `Sample text ${i + 1}.`, date: `${i + 1}th May 2026`,
}));

const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const tagClassed = name => tag => classed(name)(tag.attrs);
const section = html => outerHtml(html, 'section', classed('rf-reviews'));
const empty = html => outerHtml(html, 'div', classed('rf-reviews--none'));
const summary = html => outerHtml(html, 'p', classed('rf-review-sum'));
const items = html => elementsHtml(section(html) || '', 'li', classed('rf-review'));
const writes = html => findTags(html).filter(tag => tag.attrs['data-reveal-id'] === 'modal-review-form');
const forms = html => findTags(html, 'div').filter(tag => tag.attrs.id === 'modal-review-form');
const buyBox = html => outerHtml(html, 'section', classed('rf-pdp__buy'));
const stars = html => findTags(html, 'span').find(tag => tag.attrs.role === 'img' && classed('rf-stars')(tag.attrs));
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
    it('renders "Reviews (N)" with each review: its title, its stars, who and when, and the text', async () => {
        const html = await productPage();
        const reviews = section(html);
        assert.ok(reviews, 'the section');
        const [open] = findTags(reviews, 'section');
        assert.equal(open.attrs.id, 'product-reviews', 'stock\'s id, which the summary\'s link and stock\'s reviews.js read');
        const heading = outerHtml(reviews, 'h2');
        assert.equal(textOf(heading), 'Reviews (3)');
        assert.equal(open.attrs['aria-labelledby'], findTags(heading, 'h2')[0].attrs.id);
        const list = items(html);
        assert.equal(list.length, 3);
        assert.ok(outerHtml(reviews, 'ol', classed('rf-reviews__list')), 'an ordered list, newest first');
        const [first, , third] = list;
        assert.equal(textOf(outerHtml(first, 'h3')), CONTEXT.product.reviews.list[0].title);
        assert.equal(stars(first).attrs['aria-label'], 'Rated 5 out of 5');
        assert.match(textOf(first), new RegExp(`Posted by ${CONTEXT.product.reviews.list[0].name} on ${CONTEXT.product.reviews.list[0].date}`));
        assert.match(textOf(third), /Posted by Unknown on/, 'stock\'s word for a review with no name');
        assert.ok(first.includes(CONTEXT.product.reviews.list[0].text), 'the text, line breaks kept for the stylesheet to show');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('draws each review\'s stars in ink, filled up to its rating, as one image with its words (stars.html)', async () => {
        const second = items(await productPage())[1];
        const star = stars(second);
        assert.equal(star.attrs['aria-label'], `Rated ${CONTEXT.product.reviews.list[1].rating} out of 5`);
        const icons = findTags(outerHtml(second, 'span', classed('rf-stars')), 'svg').filter(tagClassed('rf-star'));
        assert.equal(icons.length, 5);
        assert.equal(icons.filter(tag => !classed('rf-star--empty')(tag.attrs)).length, Number(CONTEXT.product.reviews.list[1].rating));
        assert.deepEqual(findTags(outerHtml(second, 'span', classed('rf-stars')), 'use').map(tag => tag.attrs.href), ['#rf-i-star', '#rf-i-star', '#rf-i-star', '#rf-i-star', '#rf-i-star-empty']);
        for (const icon of icons) assert.equal(icon.attrs['aria-hidden'], 'true');
    });

    it('lists what the store sends for the page (productpage_reviews_count), and stock\'s pager when there are more', async () => {
        const html = await productPage({
            product: { reviews: { total: 12, list: FIVE }, num_reviews: 12, rating: 5 },
            context: { pagination: { reviews: { current: 1, next: 'https://reelflies.ca/adams-parachute-dry-fly/?revpage=2' } } },
        });
        assert.equal(items(html).length, 5);
        assert.equal(textOf(outerHtml(section(html), 'h2')), 'Reviews (12)');
        const pager = outerHtml(section(html), 'nav', classed('pagination'));
        assert.ok(pager, 'stock\'s pager inside the section');
        assert.ok(findTags(pager, 'a').some(tag => decodeHtml(tag.attrs.href).endsWith('?revpage=2')));
        assert.equal(outerHtml(section(await productPage()), 'nav'), null, 'no pager on one page of reviews');
    });

    it('offers "Write a review" in the section\'s head: one button that opens stock\'s review form, which is on the page once', async () => {
        const html = await productPage();
        const head = outerHtml(section(html), 'div', classed('rf-reviews__head'));
        const [button] = findTags(head, 'button');
        assert.equal(button.attrs.type, 'button');
        assert.equal(button.attrs['data-reveal-id'], 'modal-review-form');
        assert.match(button.attrs.class, /(^|\s)rf-reviews__write(\s|$)/);
        assert.equal(textOf(outerHtml(head, 'button')), 'Write a review');
        assert.equal(writes(html).length, 1, 'one control opens the form');
        assert.equal(forms(html).length, 1, 'stock\'s form once');
        assert.ok(findTags(html, 'form').some(tagClassed('writeReview-form')), 'stock\'s form, which product.js wires');
    });

    it('comes after the details, under the photographs, and before the related patterns', async () => {
        const html = await productPage();
        inOrder(html, ['class="rf-details"', 'class="rf-reviews"', 'class="rf-pdp-related"']);
        assert.ok(outerHtml(html, 'div', classed('rf-pdp__more')).includes('class="rf-reviews"'), 'in the details\' column');
    });

    it('is the page\'s only list of reviews, whatever show_product_details_tabs says', async () => {
        for (const tabs of [true, false]) {
            const html = await productPage({ theme: { show_product_details_tabs: tabs } }); // eslint-disable-line no-await-in-loop
            assert.equal(findTags(html).filter(tag => tag.attrs.id === 'product-reviews').length, 1, `tabs ${tabs}`);
            assert.ok(!html.includes('productReviews-list'), `no stock list, tabs ${tabs}`);
        }
    });
});

describe('the star summary beside the price (components/reelflies/review-summary.html)', () => {
    it('shows the stars and "N reviews" as one link to the section, in the price row after the price and before the buying', async () => {
        const html = await productPage();
        const line = summary(html);
        assert.ok(line, 'the summary');
        const [link] = findTags(line, 'a');
        assert.equal(link.attrs.href, '#product-reviews');
        assert.equal(stars(line).attrs['aria-label'], 'Rated 5 out of 5');
        assert.equal(textOf(outerHtml(line, 'span', classed('rf-review-sum__count'))), '3 reviews');
        inOrder(buyBox(html), ['rf-pdp__price', 'rf-pdp__unit', 'rf-review-sum', 'data-rf-pick-page']);
        assert.ok(outerHtml(buyBox(html), 'div', classed('rf-pdp__price-row')).includes('rf-review-sum'), 'in the price row');
    });

    it('says "1 review" for one', async () => {
        const html = await productPage({ product: { reviews: { total: 1, list: FIVE.slice(0, 1) }, num_reviews: 1, rating: 5 } });
        assert.equal(textOf(outerHtml(summary(html), 'span', classed('rf-review-sum__count'))), '1 review');
        assert.equal(textOf(outerHtml(section(html), 'h2')), 'Reviews (1)');
    });

    it('replaces stock\'s rating row on the product page; Quick view keeps it', async () => {
        const html = await productPage();
        assert.ok(!findTags(html, 'div').some(tagClassed('productView-rating')), 'no stock rating row');
        assert.ok(!html.includes('productReview_link'));
        const quick = await quickView();
        assert.ok(findTags(quick, 'div').some(tagClassed('productView-rating')), 'Quick view\'s rating row');
        assert.ok(!quick.includes('rf-review-sum') && !quick.includes('rf-reviews'));
    });
});

describe('a product with no reviews (stories 47 and 75)', () => {
    it('has no section and no summary, and offers "Write a review" under "No reviews yet for this fly."', async () => {
        const html = await productPage({ product: NO_REVIEWS });
        assert.equal(section(html), null);
        assert.equal(summary(html), null);
        const block = empty(html);
        assert.ok(block, 'the no-reviews block');
        assert.equal(findTags(block, 'div')[0].attrs.id, 'product-reviews', 'the id the summary would link to stays on the block');
        assert.equal(findTags(html).filter(tag => tag.attrs.id === 'product-reviews').length, 1);
        assert.equal(findTags(block, 'h2').length + findTags(block, 'h3').length, 0, 'no heading: not a reviews section');
        assert.equal(textOf(outerHtml(block, 'p', classed('rf-reviews__none'))), 'No reviews yet for this fly.');
        assert.equal(textOf(outerHtml(block, 'button')), 'Write a review');
        assert.equal(writes(html).length, 1);
        assert.equal(forms(html).length, 1);
        inOrder(html, ['class="rf-details"', 'rf-reviews--none', 'class="rf-pdp-related"']);
    });

    it('says "No reviews yet." off a fly, by the "/ fly" rule, as the details\' words', async () => {
        const html = await productPage({ product: { ...NO_REVIEWS, category: ['Fly Gear', 'Fly Gear/Fly Boxes'] } });
        assert.equal(textOf(outerHtml(empty(html), 'p', classed('rf-reviews__none'))), 'No reviews yet.');
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
    it('are the spec\'s: "Reviews (N)", "N reviews" and "Write a review", with "review" in lower case', () => {
        assert.equal(lang.heading, 'Reviews ({total})');
        assert.equal(lang.write, 'Write a review');
        assert.equal(lang.rated, 'Rated {rating} out of 5');
        assert.equal(lang.none_fly, 'No reviews yet for this fly.');
        assert.equal(lang.none, 'No reviews yet.');
    });
});
