// The product page as a crawler gets it (ticket 39; spec module 15; O14, O23, R6, SEO-8, UX-11,
// UX-12; stories 44 to 48 and 70), on every product pin:
//
// - The main image (img[data-main-image], components/reelflies/product-image.html) loads first:
//   fetchpriority="high", a real srcset (the default image's holds its one file), sizes, a width
//   and a height, and never through lazysizes (no lazyload class, no data-srcset, no
//   loading="lazy"). It is the only element on the page with fetchpriority="high" (SEO-8).
// - One buy box (data-rf-product-buy) holds the page's <h1>, the price, the shipping line
//   (data-rf-ship-line, which says no figure it wasn't given: no "{", "undefined" or "X.XX"), the
//   buy form and, after Add to cart, the promise line (data-rf-promise).
// - The details (data-rf-product-details) come after the buy box: "About this fly" open when the
//   product has a description, then "Shipping and delivery" and "Hooks and tying", closed, each
//   with one <summary>; "Hooks and tying" links to the hook size chart.
// - No weight row (data-product-weight; show_product_weight is off).
// - Related patterns, when the product has any: a grid of cards (data-rf-related), not stock's
//   carousel or tabs, whose photos are loading="lazy" with no fetchpriority (O23).
//
// A page with no product view (.productView) at all isn't judged: the harness's own fixture pages
// (raw-html/fixtures/) are product pages without one. A product page that lost the view fails
// its screenshots.

import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../html.mjs';
import { CHART_PATH } from './size-filter.mjs';

const has = name => attrs => name in attrs;
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');

function mainImageProblems(markup) {
    const images = findTags(markup, 'img').filter(tag => 'data-main-image' in tag.attrs);
    if (images.length !== 1) return [`${images.length} main images (img[data-main-image]), not one`];
    const problems = [];
    const { attrs } = images[0];
    const srcset = decodeHtml(attrs.srcset || '');
    const candidates = srcset.includes('data:') ? [] : srcset.split(',').map(each => each.trim()).filter(Boolean);
    if (attrs.fetchpriority !== 'high') problems.push('the main image has no fetchpriority="high"');
    if (candidates.length < 1) problems.push('the main image has no real srcset (a data: stand-in counts as none)');
    if (!attrs.sizes) problems.push('the main image has no sizes');
    if (!/^\d+$/.test(attrs.width || '') || !/^\d+$/.test(attrs.height || '')) problems.push('the main image has no width and height');
    if (/(^|\s)lazyload(\s|$)/.test(attrs.class || '') || 'data-srcset' in attrs || 'data-sizes' in attrs) problems.push('the main image loads through lazysizes');
    if (attrs.loading === 'lazy') problems.push('the main image is loading="lazy"');
    if (!attrs.alt) problems.push('the main image has no alt');
    return problems;
}

function buyBoxProblems(markup) {
    const boxes = elementsHtml(markup, 'div', has('data-rf-product-buy'));
    if (boxes.length !== 1) return [`${boxes.length} buy boxes (data-rf-product-buy), not one`];
    const [box] = boxes;
    const problems = [];
    if (findTags(box, 'h1').length !== 1) problems.push('the buy box doesn\'t hold the page\'s <h1>');
    if (!findTags(box, 'form').some(tag => 'data-cart-item-add' in tag.attrs)) problems.push('the buy box doesn\'t hold the buy form');
    const lines = elementsHtml(box, 'p', has('data-rf-ship-line'));
    if (lines.length > 1) problems.push(`${lines.length} shipping lines, not one`);
    for (const line of lines) if (/undefined|\{|X\.XX/.test(textOf(line))) problems.push(`the shipping line carries a placeholder: "${textOf(line)}"`);
    const button = box.indexOf('id="form-action-addToCart"');
    const promise = findTags(box, 'p').find(tag => 'data-rf-promise' in tag.attrs);
    if (!promise) problems.push('no promise line (data-rf-promise) in the buy box');
    else if (button < 0 || box.indexOf(promise.raw) < button) problems.push('the promise line isn\'t under Add to cart');
    return problems;
}

function detailsProblems(markup) {
    const details = outerHtml(markup, 'div', has('data-rf-product-details'));
    if (!details) return ['no details under the photos (data-rf-product-details)'];
    const problems = [];
    const buy = markup.indexOf('data-rf-product-buy');
    if (buy < 0 || markup.indexOf(details) < buy) problems.push('the details come before the buy box');
    const sections = elementsHtml(details, 'details').map(section => ({ section, tag: findTags(section, 'details')[0] }));
    const named = name => sections.find(({ tag }) => tag.attrs['data-rf-details'] === name);
    for (const { section, tag } of sections) {
        if (findTags(section, 'summary').length !== 1) problems.push(`the "${tag.attrs['data-rf-details']}" section has no summary of its own`);
    }
    const about = named('about');
    if (about && !('open' in about.tag.attrs)) problems.push('"About this fly" isn\'t open');
    for (const name of ['shipping', 'hooks']) {
        const section = named(name);
        if (!section) problems.push(`no "${name}" section`);
        else if ('open' in section.tag.attrs) problems.push(`the "${name}" section is open`);
    }
    const hooks = named('hooks');
    if (hooks && !findTags(hooks.section, 'a').some(link => link.attrs.href === CHART_PATH)) problems.push(`"Hooks and tying" doesn't link to ${CHART_PATH}`);
    return problems;
}

function relatedProblems(markup) {
    const problems = [];
    if (findTags(markup).some(tag => tag.attrs.id === 'tab-related' || tag.attrs.id === 'tab-similar')) problems.push('stock\'s related products tabs are back (#tab-related, #tab-similar)');
    const related = outerHtml(markup, 'section', has('data-rf-related'));
    if (!related) return problems;
    if (findTags(related).some(tag => 'data-slick' in tag.attrs || classed('productCarousel')(tag.attrs))) problems.push('the related patterns are a carousel');
    const grid = outerHtml(related, 'ul', classed('productGrid'));
    if (!grid || elementsHtml(grid, 'article', classed('card')).length === 0) problems.push('the related patterns aren\'t a grid of cards');
    findTags(related, 'img').forEach((img, index) => {
        if (img.attrs.loading !== 'lazy') problems.push(`related card ${index + 1}'s photo isn't loading="lazy"`);
        if ('fetchpriority' in img.attrs) problems.push(`related card ${index + 1}'s photo has a fetchpriority`);
    });
    return problems;
}

export function productPageProblems(html) {
    const markup = markupOnly(html);
    // The harness's own fixture pages (raw-html/fixtures/) are product pages with no product view.
    if (!findTags(markup, 'div').some(tag => classed('productView')(tag.attrs))) return [];
    const problems = [...mainImageProblems(markup)];
    const high = findTags(markup).filter(tag => tag.attrs.fetchpriority === 'high');
    if (high.length !== 1) problems.push(`${high.length} elements with fetchpriority="high", not one (SEO-8)`);
    problems.push(...buyBoxProblems(markup), ...detailsProblems(markup), ...relatedProblems(markup));
    if (findTags(markup).some(tag => 'data-product-weight' in tag.attrs)) problems.push('a weight row (data-product-weight): show_product_weight is off');
    return problems;
}

export default {
    id: 'product-page',
    ticket: 39,
    description: 'the main image first (fetchpriority high, srcset, sizes, dimensions, no lazysizes) and the page\'s only fetchpriority; one buy box with the H1, the shipping line with no placeholder and the promise under Add to cart; the details after it, "About this fly" open and the hook chart linked; no weight row; related patterns a lazy grid, not a carousel',
    pages: ['product'],
    check(page) {
        return productPageProblems(page.html);
    },
};
