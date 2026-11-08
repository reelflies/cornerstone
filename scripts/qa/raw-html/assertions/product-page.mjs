// The product page as a crawler gets it (ticket 39; redesign step 3; spec module 15; O14, O23,
// R6, SEO-8, UX-11, UX-12; stories 44 to 48 and 70), on every product pin
// (components/reelflies/product-view.html and its partials):
//
// - The main image (img[data-main-image], product-image.html) loads first: fetchpriority="high",
//   a real srcset with its sizes (the theme's default image has its one file), a width and a
//   height, an alt, and never lazily (no lazyload class, no data-srcset, no loading="lazy"). It is
//   the only element on the page with fetchpriority="high" (SEO-8).
// - One buy panel (section.rf-pdp__buy) holds the page's <h1>, the buy form (data-cart-item-add,
//   which stock ProductDetails reads whichever way the product is bought) and, after the buying,
//   the shipping line (p.rf-pdp__ship, at most one, saying no figure it wasn't given: no "{",
//   "undefined" or "X.XX") and the promise line (p.rf-pdp__promise). The page buys through the
//   picker (data-rf-pick-page, product-picker's check) with the form hidden (data-rf-pdp-form), or
//   through the form shown: never both shown, never neither.
// - The details (div.rf-details) come after the buy panel, each <details> with one <summary>:
//   "About this fly" or "Description" open when there is one; "Shipping and delivery", closed,
//   wherever the panel has the shipping line (both follow the channel's threshold); and "Hooks
//   and tying", closed and linking to the hook size chart, wherever the price says "/ fly"
//   (span.rf-pdp__unit; both follow the fly rule, so gear has neither).
// - No weight row (data-product-weight; show_product_weight is off).
// - Related patterns, when the product has any (section.rf-pdp-related): a grid of specimen
//   cards (ul[data-rf-grid] of li.rf-fly), not stock's carousel or tabs, their photos
//   loading="lazy" with no fetchpriority (O23).
//
// A page with no product view (.productView) at all isn't judged: the harness's own fixture pages
// (raw-html/fixtures/) are product pages without one. A product page that lost the view fails
// its screenshots.

import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../html.mjs';

export const CHART_PATH = '/fly-hook-size-chart/'; // rf_hook_chart_url's default (product-details.html)
const has = name => attrs => name in attrs;
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const tagClassed = name => tag => classed(name)(tag.attrs);

function mainImageProblems(markup) {
    const images = findTags(markup, 'img').filter(tag => 'data-main-image' in tag.attrs);
    if (images.length !== 1) return [`${images.length} main images (img[data-main-image]), not one`];
    const problems = [];
    const { attrs } = images[0];
    const srcset = decodeHtml(attrs.srcset || '');
    const candidates = srcset.includes('data:') ? [] : srcset.split(',').map(each => each.trim()).filter(Boolean);
    const defaultImage = /default-product/.test(attrs.src || '');
    if (attrs.fetchpriority !== 'high') problems.push('the main image has no fetchpriority="high"');
    if (!defaultImage && candidates.length < 1) problems.push('the main image has no real srcset (a data: stand-in counts as none)');
    if (!defaultImage && !attrs.sizes) problems.push('the main image has no sizes');
    if (!/^\d+$/.test(attrs.width || '') || !/^\d+$/.test(attrs.height || '')) problems.push('the main image has no width and height');
    if (classed('lazyload')(attrs) || 'data-srcset' in attrs || 'data-sizes' in attrs) problems.push('the main image loads through lazysizes');
    if (attrs.loading === 'lazy') problems.push('the main image is loading="lazy"');
    if (!attrs.alt) problems.push('the main image has no alt');
    return problems;
}

function buyPanelProblems(markup) {
    const panels = elementsHtml(markup, 'section', classed('rf-pdp__buy'));
    if (panels.length !== 1) return [`${panels.length} buy panels (section.rf-pdp__buy), not one`];
    const [panel] = panels;
    const problems = [];
    if (findTags(panel, 'h1').length !== 1) problems.push('the buy panel doesn\'t hold the page\'s <h1>');
    if (!findTags(panel, 'form').some(tag => 'data-cart-item-add' in tag.attrs)) problems.push('the buy panel doesn\'t hold the buy form (data-cart-item-add)');
    const pickers = findTags(panel, 'div').filter(tag => 'data-rf-pick-page' in tag.attrs);
    const forms = findTags(panel, 'div').filter(tagClassed('rf-pdp__form'));
    if (forms.length !== 1) problems.push(`${forms.length} form wrappers (.rf-pdp__form), not one`);
    const formHidden = forms.length === 1 && 'hidden' in forms[0].attrs;
    if (pickers.length > 1) problems.push(`${pickers.length} size pickers, not one`);
    if (pickers.length === 1 && !formHidden) problems.push('the picker and stock\'s form are both shown: the form hides behind the picker (data-rf-pdp-form)');
    if (!pickers.length && formHidden) problems.push('no picker, and stock\'s form hidden: nothing to buy with');
    const buying = Math.max(panel.indexOf('data-rf-pick-page'), panel.indexOf('rf-pdp__form'));
    const lines = elementsHtml(panel, 'p', classed('rf-pdp__ship'));
    if (lines.length > 1) problems.push(`${lines.length} shipping lines, not one`);
    for (const line of lines) {
        if (/undefined|\{|X\.XX/.test(textOf(line))) problems.push(`the shipping line carries a placeholder: "${textOf(line)}"`);
        if (panel.indexOf(line) < buying) problems.push('the shipping line comes before the buying');
    }
    const promise = findTags(panel, 'p').find(tagClassed('rf-pdp__promise'));
    if (!promise) problems.push('no promise line (p.rf-pdp__promise) in the buy panel');
    else if (panel.indexOf(promise.raw) < buying) problems.push('the promise line isn\'t under the buying');
    return problems;
}

function detailsProblems(markup) {
    const details = outerHtml(markup, 'div', classed('rf-details'));
    if (!details) return ['no details under the photographs (div.rf-details)'];
    const problems = [];
    const panel = markup.indexOf('rf-pdp__buy');
    if (panel < 0 || markup.indexOf(details) < panel) problems.push('the details come before the buy panel');
    const sections = elementsHtml(details, 'details').map(section => ({
        section, tag: findTags(section, 'details')[0], title: textOf(outerHtml(section, 'summary') || ''),
    }));
    const named = title => sections.find(section => section.title === title);
    for (const { section, title } of sections) {
        if (findTags(section, 'summary').length !== 1) problems.push(`the "${title}" section has no summary of its own`);
    }
    const about = named('About this fly') || named('Description');
    if (about && !('open' in about.tag.attrs)) problems.push(`"${about.title}" isn't open`);
    const buy = outerHtml(markup, 'section', classed('rf-pdp__buy')) || '';
    const expected = {
        'Shipping and delivery': findTags(buy, 'p').some(tagClassed('rf-pdp__ship')) && 'the buy panel has the shipping line',
        'Hooks and tying': findTags(buy, 'span').some(tagClassed('rf-pdp__unit')) && 'the price says "/ fly"',
    };
    for (const [title, why] of Object.entries(expected)) {
        const section = named(title);
        if (!section && why) problems.push(`no "${title}" section, though ${why}`);
        else if (section && 'open' in section.tag.attrs) problems.push(`the "${title}" section is open`);
    }
    const hooks = named('Hooks and tying');
    if (hooks && !findTags(hooks.section, 'a').some(link => decodeHtml(link.attrs.href || '').trim())) problems.push('"Hooks and tying" doesn\'t link to the hook size chart');
    return problems;
}

function relatedProblems(markup) {
    const problems = [];
    if (findTags(markup).some(tag => tag.attrs.id === 'tab-related' || tag.attrs.id === 'tab-similar')) problems.push('stock\'s related products tabs are back (#tab-related, #tab-similar)');
    const related = outerHtml(markup, 'section', classed('rf-pdp-related'));
    if (!related) return problems;
    if (findTags(related).some(tag => 'data-slick' in tag.attrs || classed('productCarousel')(tag.attrs))) problems.push('the related patterns are a carousel');
    const grid = outerHtml(related, 'ul', has('data-rf-grid'));
    if (!grid || elementsHtml(grid, 'li', classed('rf-fly')).length === 0) problems.push('the related patterns aren\'t a grid of specimen cards');
    findTags(related, 'img').forEach((img, index) => {
        if (img.attrs.loading !== 'lazy') problems.push(`related card ${index + 1}'s photo isn't loading="lazy"`);
        if ('fetchpriority' in img.attrs) problems.push(`related card ${index + 1}'s photo has a fetchpriority`);
    });
    return problems;
}

export function productPageProblems(html) {
    const markup = markupOnly(html);
    // The harness's own fixture pages (raw-html/fixtures/) are product pages with no product view.
    if (!findTags(markup, 'div').some(tagClassed('productView'))) return [];
    const problems = [...mainImageProblems(markup)];
    const high = findTags(markup).filter(tag => tag.attrs.fetchpriority === 'high');
    if (high.length !== 1) problems.push(`${high.length} elements with fetchpriority="high", not one (SEO-8)`);
    problems.push(...buyPanelProblems(markup), ...detailsProblems(markup), ...relatedProblems(markup));
    if (findTags(markup).some(tag => 'data-product-weight' in tag.attrs)) problems.push('a weight row (data-product-weight): show_product_weight is off');
    return problems;
}

export default {
    id: 'product-page',
    ticket: 39,
    description: 'the main image first (fetchpriority high, srcset, sizes, dimensions, no lazysizes) and the page\'s only fetchpriority; one buy panel with the H1, the buy form, the picker or the form shown, the shipping line with no placeholder and the promise under the buying; the details after it, "About this fly" open, "Shipping and delivery" with the shipping line and "Hooks and tying" (the hook chart linked) with "/ fly"; no weight row; related patterns a lazy grid of cards, not a carousel',
    pages: ['product'],
    check(page) {
        return productPageProblems(page.html);
    },
};
