// The <main> hook in templates/components/common/body.html (ticket 25; build pipeline 6.1).
// Stock home, product and cart pages have no <main>, nor do the account, sign-in, blog post,
// sitemap, newsletter and hibernation pages, and many other stock templates carry their own
// (category.html, brand.html, search.html, page.html, errors/404.html ...). So the wrapper round
// the hero and page blocks is <main> on exactly the templates with none, and the stock <div>
// everywhere else. The raw-HTML check counts the result on every pinned page (one-main).
//
//   node --test scripts/qa/render/partials/body.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial, THEME_DIR } from '../render.mjs';

// stencil-paper sets `template` to the template it renders, as the store sets it to the page's
// template, so each case renders a stand-in page of that name that includes body.html.
const render = template => renderPartial(template, {
    currency_selector: { active_currency_code: 'CAD' },
}, { overrides: { [template]: '{{> components/common/body}}' } });
const wrapper = html => findTags(html).find(tag => tag.attrs.id === 'main-content');

// Every page template that renders inside layout/base, and whether it has a <main> of its own.
const PAGES = path.join(THEME_DIR, 'templates', 'pages');
const pageFiles = (dir = PAGES) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'custom' ? [] : pageFiles(entryPath);
    return entry.name.endsWith('.html') ? [entryPath] : [];
});
// A ReelFlies hook can move a page's body into a partial (ticket 32's category-page.html), so the
// components/reelflies/ partials a template includes count as its own source.
const withHookPartials = source => [source, ...[...source.matchAll(/\{\{>\s*(components\/reelflies\/[\w/-]+)/g)]
    .map(([, name]) => fs.readFileSync(path.join(THEME_DIR, 'templates', `${name}.html`), 'utf8'))].join('\n');
const pageTemplates = () => pageFiles()
    .map(file => ({ file, source: withHookPartials(fs.readFileSync(file, 'utf8')) }))
    .filter(({ source }) => /\{\{>\s*layout\/base/.test(source))
    .map(({ file, source }) => ({ template: path.relative(path.join(THEME_DIR, 'templates'), file).replace(/\.html$/, ''), hasMain: /<main\b/.test(source) }));
const WITHOUT_MAIN = pageTemplates().filter(page => !page.hasMain).map(page => page.template);
const WITH_MAIN = pageTemplates().filter(page => page.hasMain).map(page => page.template);

describe('the body wrapper', () => {
    it('finds the stock templates: home, product and cart have no <main>, category and the 404 page do', () => {
        for (const template of ['pages/home', 'pages/product', 'pages/cart', 'pages/auth/login', 'pages/auth/create-account']) assert.ok(WITHOUT_MAIN.includes(template), template);
        for (const template of ['pages/category', 'pages/errors/404', 'pages/page', 'pages/brand']) assert.ok(WITH_MAIN.includes(template), template);
    });

    for (const template of WITHOUT_MAIN) {
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

    for (const template of [...WITH_MAIN, 'pages/custom/category/rf-noindex', 'pages/custom/product/anything']) {
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
