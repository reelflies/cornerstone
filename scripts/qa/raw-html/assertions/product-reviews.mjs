// The product page's reviews as a crawler gets them (ticket 40; spec modules 15 and 23; R11, SEO-5;
// stories 47 and 75), on every product pin: the structured data marks up only the reviews the page
// shows.
//
// - aggregateRating and review in the Product JSON-LD exactly when the page has the reviews section
//   (section[data-rf-reviews], components/reelflies/product-reviews.html), so stock's JSON-LD on a
//   page that shows no reviews (the theme setting off: criterion 3) fails. With the section, the
//   JSON-LD counts what it says: reviewCount is the N of its "Reviews (N)", and one review for each
//   review it lists, each datePublished an ISO 8601 date.
// - The section, at most one: id="product-reviews" (the summary's link and stock's reviews.js read
//   it), its <h2> "Reviews (N)", at most five reviews (productpage_reviews_count), each with an
//   <h3> title.
// - The star summary (p[data-rf-review-summary]) exactly when there is a section, in the buy box,
//   linking to #product-reviews, its count the section's N.
// - "Write a review": the page has stock's review form (#modal-review-form) exactly when one control
//   opens it ([data-reveal-id="modal-review-form"]), so a product with no reviews still offers it
//   while the store takes reviews (criterion 2). The control sits in the section, or in the
//   no-reviews block (data-rf-reviews-empty).
// - The two pins that prove criteria 1 and 2 (pages.mjs), keyed as dead-ends keys search@none, so
//   a page that lost its reviews, or its form and button together, fails rather than passing as
//   consistently absent:
//   - product@reviews, a best seller with reviews (criterion 1): the section, so the summary and
//     the JSON-LD's reviews too, and "Write a review" in it. Under the overlay that hides reviews
//     (QA_OVERLAY show_product_reviews-off, criterion 3), no section, and the no-reviews block with
//     "Write a review" alone, not "No reviews yet".
//   - product, the reference's hopper, with none (criterion 2): no section, and the no-reviews
//     block with "Write a review". Should the store's product gain a review, this fails: pin a
//     product with none.
//
// A block that doesn't parse is json-ld-parses' to report. A page with no product view and no
// reviews markup (the harness's own fixture pages) passes, the pins' rules included.

import {
    elementsHtml, findTags, markupOnly, outerHtml, scriptsOfType, textOf,
} from '../html.mjs';

export const MAX_LISTED = 5; // productpage_reviews_count (config.json), the ticket's "latest 5"
export const REVIEWS_PIN = 'product@reviews'; // pages.mjs, channel 1: Copper John
export const NO_REVIEWS_PIN = 'product'; // pages.mjs: the reference's hopper (6178)
export const REVIEWS_OFF_OVERLAY = 'show_product_reviews-off'; // overlays/, Theme Styles' setting off
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;
const has = name => attrs => name in attrs;
const isWrite = tag => tag.attrs['data-reveal-id'] === 'modal-review-form';
const typed = (block, type) => [].concat(block['@type']).includes(type);

// The Product blocks among the JSON-LD blocks, or null when a block doesn't parse.
export function productBlocks(html) {
    const parsed = [];
    for (const block of scriptsOfType(html, 'application/ld+json')) {
        try {
            parsed.push(JSON.parse(block));
        } catch {
            return null;
        }
    }
    return parsed.flatMap(block => [].concat(block['@graph'] || block)).filter(block => block && typed(block, 'Product'));
}

const number = text => (/\d+/.exec(text || '') || [])[0];

function sectionProblems(section, data) {
    const problems = [];
    const [tag] = findTags(section, 'section');
    if (tag.attrs.id !== 'product-reviews') problems.push('the reviews section isn\'t id="product-reviews"');
    const total = tag.attrs['data-rf-review-total'];
    const heading = textOf(outerHtml(section, 'h2') || '');
    if (heading !== `Reviews (${total})`) problems.push(`the section's heading reads "${heading}", not "Reviews (${total})"`);
    const reviews = elementsHtml(section, 'li', has('data-rf-review'));
    if (!reviews.length) problems.push('a reviews section that lists no review');
    if (reviews.length > MAX_LISTED) problems.push(`${reviews.length} reviews in the section, more than ${MAX_LISTED}`);
    if (reviews.some(review => findTags(review, 'h3').length !== 1 || !textOf(outerHtml(review, 'h3') || ''))) problems.push('a review with no <h3> title');
    if (data) {
        const count = data.aggregateRating?.reviewCount;
        if (data.aggregateRating && String(count) !== String(total)) problems.push(`the JSON-LD's reviewCount ${count}, but the section says Reviews (${total})`);
        const marked = [].concat(data.review || []);
        if (marked.length !== reviews.length) problems.push(`${marked.length} reviews in the JSON-LD, ${reviews.length} in the section`);
        for (const review of marked) {
            if (review.datePublished !== undefined && !ISO_DATE.test(review.datePublished)) problems.push(`a review's datePublished "${review.datePublished}" isn't an ISO 8601 date`);
        }
    }
    return problems;
}

function summaryProblems(markup, section) {
    const box = outerHtml(markup, 'div', has('data-rf-product-buy')) || '';
    const inBox = elementsHtml(box, 'p', has('data-rf-review-summary'));
    const anywhere = elementsHtml(markup, 'p', has('data-rf-review-summary'));
    if (!section) return anywhere.length ? ['a star summary with no reviews section'] : [];
    if (inBox.length !== 1) return [`no star summary (data-rf-review-summary) in the buy box${anywhere.length ? `, but ${anywhere.length} elsewhere` : ''}`];
    const [summary] = inBox;
    const problems = [];
    if (!findTags(summary, 'a').some(tag => tag.attrs.href === '#product-reviews')) problems.push('the star summary doesn\'t link to #product-reviews');
    const said = number(textOf(outerHtml(summary, 'span', has('data-rf-review-count')) || ''));
    const total = findTags(section, 'section')[0].attrs['data-rf-review-total'];
    if (said !== total) problems.push(`the star summary says ${said}, the section ${total}`);
    return problems;
}

function writeProblems(markup, section) {
    const controls = findTags(markup).filter(isWrite);
    const form = findTags(markup).some(tag => tag.attrs.id === 'modal-review-form');
    if (form && controls.length !== 1) return [`the review form is on the page, but ${controls.length} controls open it${controls.length > 1 ? ', not one' : ''}`];
    if (!form && controls.length) return [`${controls.length} control${controls.length > 1 ? 's' : ''} open${controls.length > 1 ? '' : 's'} the review form, which isn't on the page`];
    if (!controls.length) return [];
    const empty = outerHtml(markup, 'div', has('data-rf-reviews-empty')) || '';
    const where = `${section || ''}${empty}`;
    return where.includes(controls[0].raw) ? [] : ['"Write a review" sits outside the reviews section and the no-reviews block'];
}

const productView = markup => findTags(markup, 'div').some(tag => /(^|\s)productView(\s|$)/.test(tag.attrs.class || ''));

// What a pin that proves a criterion must show (the module header), on a page with a product view.
function pinProblems(page, markup, section, overlay) {
    if (![REVIEWS_PIN, NO_REVIEWS_PIN].includes(page.key) || !productView(markup)) return [];
    const empty = outerHtml(markup, 'div', has('data-rf-reviews-empty'));
    const emptyProblems = where => {
        if (!empty) return [`no no-reviews block (data-rf-reviews-empty) on ${where}`];
        return findTags(empty).some(isWrite) ? [] : [`no "Write a review" in the no-reviews block (data-rf-reviews-empty) on ${where}`];
    };
    if (page.key === NO_REVIEWS_PIN) {
        const where = `${NO_REVIEWS_PIN}, the pin with no reviews`;
        return section ? [`a reviews section on ${where}: pin a product with none (pages.mjs)`] : emptyProblems(where);
    }
    if (overlay === REVIEWS_OFF_OVERLAY) {
        if (section) return [`a reviews section on ${REVIEWS_PIN} under the overlay ${REVIEWS_OFF_OVERLAY}, which hides reviews`];
        const none = textOf(outerHtml(empty || '', 'p', attrs => /(^|\s)rf-reviews-none(\s|$)/.test(attrs.class || '')) || '');
        return [...emptyProblems(REVIEWS_PIN), ...(none ? [`the no-reviews block says "${none}" on ${REVIEWS_PIN}, which has reviews`] : [])];
    }
    if (!section) return [`no reviews section (data-rf-reviews) on ${REVIEWS_PIN}, the pin with reviews: the section, the star summary and the JSON-LD's reviews are all missing`];
    return findTags(section).some(isWrite) ? [] : [`no "Write a review" in the reviews section on ${REVIEWS_PIN}`];
}

export default {
    id: 'product-reviews',
    ticket: 40,
    description: 'aggregateRating and review in the JSON-LD only with the visible reviews section, counting what it lists; the section, the star summary and one "Write a review" whenever the store takes reviews',
    pages: ['product'],
    // `overlay` is the run's QA_OVERLAY (raw-html.mjs renders every page with it); a test passes it.
    check(page, { overlay = process.env.QA_OVERLAY || '' } = {}) {
        const markup = markupOnly(page.html);
        const blocks = productBlocks(page.html);
        if (blocks === null) return [];
        const data = blocks[0];
        const sections = elementsHtml(markup, 'section', has('data-rf-reviews'));
        if (sections.length > 1) return [`${sections.length} reviews sections, not one`];
        const [section] = sections;
        const problems = [];
        if (!section) {
            if (data?.aggregateRating) problems.push('aggregateRating in the JSON-LD with no reviews section on the page');
            if (data?.review) problems.push('review in the JSON-LD with no reviews section on the page');
            if (findTags(markup).some(tag => tag.attrs.id === 'product-reviews')) problems.push('an element with id="product-reviews" but no reviews section');
        } else {
            problems.push(...sectionProblems(section, data));
        }
        problems.push(...summaryProblems(markup, section), ...writeProblems(markup, section), ...pinProblems(page, markup, section, overlay));
        return problems;
    },
};
