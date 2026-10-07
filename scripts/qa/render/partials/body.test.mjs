// The <main> hook in templates/components/common/body.html (ticket 25; build pipeline 6.1).
// Stock home, product and cart pages have no <main>, and many other stock templates carry their
// own (category.html, brand.html, search.html, page.html, errors/404.html ...). So the wrapper
// round the hero and page blocks is <main> on home, product and cart only, and the stock <div>
// everywhere else. The raw-HTML check counts the result on every pinned page (one-main).
//
//   node --test scripts/qa/render/partials/body.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

// stencil-paper sets `template` to the template it renders, as the store sets it to the page's
// template, so each case renders a stand-in page of that name that includes body.html.
const render = template => renderPartial(template, {
    currency_selector: { active_currency_code: 'CAD' },
}, { overrides: { [template]: '{{> components/common/body}}' } });
const wrapper = html => findTags(html).find(tag => tag.attrs.id === 'main-content');

describe('the body wrapper', () => {
    for (const template of ['pages/home', 'pages/product', 'pages/cart']) {
        it(`is the page's <main> on ${template}, whose template has none`, async () => {
            const html = await render(template);
            const tag = wrapper(html);
            assert.equal(tag.name, 'main');
            assert.equal(tag.attrs.class, 'body');
            assert.equal(tag.attrs['data-currency-code'], 'CAD');
            assert.equal(findTags(html, 'main').length, 1);
            assert.deepEqual(unbalancedTags(html), []);
        });
    }

    for (const template of [
        'pages/category', 'pages/brand', 'pages/search', 'pages/page', 'pages/errors/404',
        'pages/contact-us', 'pages/custom/category/rf-noindex', 'pages/custom/product/anything',
    ]) {
        it(`stays the stock <div> on ${template}, which carries its own <main> or isn't hooked`, async () => {
            const html = await render(template);
            const tag = wrapper(html);
            assert.equal(tag.name, 'div');
            assert.equal(tag.attrs.class, 'body');
            assert.equal(findTags(html, 'main').length, 0);
            assert.deepEqual(unbalancedTags(html), []);
        });
    }

    it('keeps #main-content > .container, which the skip link and product-details.js use', async () => {
        const html = await render('pages/product');
        assert.match(html, /<main class="body" id="main-content"[^>]*>\s*<div class="container">/);
    });
});
