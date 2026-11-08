// The <main> hook in templates/components/common/body.html (ticket 25; build pipeline 6.1).
// Stock home, product and cart pages have no <main>, nor do the account, sign-in, blog post,
// sitemap, newsletter and hibernation pages, and the Streamside Stone redesign moved the
// category, brand, search, Web Page, contact, blog, 404 and hook chart pages into the hero block
// with none of their own. Many other stock templates carry one (brands.html, compare.html, the
// gift certificate pages ...). So the wrapper round the hero and page blocks is <main> on exactly
// the templates with none, listed in body.html's rf_main_templates, and the stock <div>
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

const TEMPLATES = path.join(THEME_DIR, 'templates');
// stencil-paper sets `template` to the template it renders, as the store sets it to the page's
// template, so each case renders a stand-in page of that name that includes body.html.
const render = template => renderPartial(template, {
    currency_selector: { active_currency_code: 'CAD' },
}, { overrides: { [template]: '{{> components/common/body}}' } });
const wrapper = html => findTags(html).find(tag => tag.attrs.id === 'main-content');

// The templates body.html wraps in <main>, as it lists them.
const BODY = fs.readFileSync(path.join(TEMPLATES, 'components/common/body.html'), 'utf8');
const HOOKED = BODY.match(/assignVar 'rf_main_templates' '([^']+)'/)[1].split(',');

// Every page template that renders inside layout/base, the custom templates included, and
// whether it has a <main> of its own. A ReelFlies hook moves a page's body into partials (the
// redesign's category-page.html, product-page.html ...), so the components/reelflies/ partials a
// template includes, at any depth, count as its own source; Handlebars comments don't.
const PAGES = path.join(TEMPLATES, 'pages');
const pageFiles = (dir = PAGES) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return pageFiles(entryPath);
    return entry.name.endsWith('.html') ? [entryPath] : [];
});
const uncommented = source => source.replace(/\{\{!--[\s\S]*?--\}\}/g, '').replace(/\{\{![\s\S]*?\}\}/g, '');
const withHookPartials = (source, seen = new Set()) => {
    const partials = [...source.matchAll(/\{\{>\s*(components\/reelflies\/[\w/-]+)/g)].map(([, name]) => name).filter(name => !seen.has(name));
    partials.forEach(name => seen.add(name));
    return [source, ...partials.map(name => withHookPartials(uncommented(fs.readFileSync(path.join(TEMPLATES, `${name}.html`), 'utf8')), seen))].join('\n');
};
const pageTemplates = () => pageFiles()
    .map(file => ({ file, source: uncommented(fs.readFileSync(file, 'utf8')) }))
    .filter(({ source }) => /\{\{>\s*layout\/base/.test(source))
    .map(({ file, source }) => ({ template: path.relative(TEMPLATES, file).replace(/\.html$/, ''), hasMain: /<main\b/.test(withHookPartials(source)) }));
const WITHOUT_MAIN = pageTemplates().filter(page => !page.hasMain).map(page => page.template);
const WITH_MAIN = pageTemplates().filter(page => page.hasMain).map(page => page.template);

describe('the body wrapper', () => {
    it('finds the templates: home, product, cart, category, the 404 page, a Web Page and the Species hub have no <main>; brands, compare and the gift certificate pages do', () => {
        for (const template of ['pages/home', 'pages/product', 'pages/cart', 'pages/category', 'pages/errors/404', 'pages/page', 'pages/brand', 'pages/search', 'pages/auth/login', 'pages/custom/category/species-hub', 'pages/custom/page/hook-size-chart']) {
            assert.ok(WITHOUT_MAIN.includes(template), template);
        }
        for (const template of ['pages/brands', 'pages/compare', 'pages/gift-certificate/purchase', 'pages/errors/403', 'pages/account/inbox']) assert.ok(WITH_MAIN.includes(template), template);
    });

    it('lists in rf_main_templates exactly the templates with no <main> of their own, each once', () => {
        assert.deepEqual([...HOOKED].sort(), [...WITHOUT_MAIN].sort());
        assert.equal(new Set(HOOKED).size, HOOKED.length);
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

    for (const template of [...WITH_MAIN, 'pages/custom/product/anything']) {
        it(`stays the stock <div> on ${template}, which carries its own <main> or isn't hooked`, async () => {
            const html = await render(template);
            const tag = wrapper(html);
            assert.equal(tag.name, 'div');
            assert.equal(tag.attrs.class, 'body');
            assert.equal(findTags(html, 'main').length, 0);
            assert.deepEqual(unbalancedTags(html), []);
        });
    }

    it('keeps #main-content > .hero block > .container, which the skip link and product-details.js use', async () => {
        const html = await render('pages/product');
        assert.match(html, /<main class="body" id="main-content"[^>]*>\s*<div class="container">/);
    });
});
