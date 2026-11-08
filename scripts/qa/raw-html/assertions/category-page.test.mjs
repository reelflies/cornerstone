// Tests the category-page assertion (ticket 32; O10, UX-5; stories 21, 22 and 72; redesign step
// 3) on category pages the templates render from tree-4-shaped data (render/partials/category/
// pages.json), on the Species hub rendered as a category, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/category-page.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import { findTags, markupOnly, outerHtml } from '../html.mjs';
import categoryPage, { headBanner, listingHead } from './category-page.mjs';

const PARTIALS = path.join(THEME_DIR, 'scripts/qa/render/partials');
const read = file => JSON.parse(fs.readFileSync(path.join(PARTIALS, file), 'utf8'));
const tree4 = read('menu/tree-4.json');
const { products } = read('card/products.json');
const { pages } = read('category/pages.json');
const HUB = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/pages/species-hub/fixtures/tree-4.json'), 'utf8')).page_context;

const page = async (key, category = {}) => ({
    kind: 'category',
    key: 'category',
    path: '/',
    status: 200,
    // The head holds the breadcrumbs' JSON-LD, which the html helpers read as text: the pages
    // are checked and broken as markup, as the helpers return it.
    html: markupOnly(await renderPartial('pages/category', {
        page_type: 'category',
        breadcrumbs: pages[key].breadcrumbs,
        category: { ...pages[key].category, products, ...category },
        categories: tree4.categories,
        settings: {},
        theme_settings: tree4.theme_settings,
    })),
});
const problems = (good, from, to) => categoryPage.check({ ...good, html: good.html.replace(from, to) }).join('\n');
// The banner's tag, and the page with it changed.
const banner = good => headBanner(listingHead(good.html)).raw;
const withBanner = (good, change) => problems(good, banner(good), change(banner(good)));

test('applies to category pins, ticket 32', () => {
    assert.deepEqual(categoryPage.pages, ['category']);
    assert.equal(categoryPage.ticket, 32);
});

test('passes the rendered pages: a Fly Type with its banner, a Species page, a sub-type and a More category', async () => {
    for (const key of ['fly-type', 'species', 'sub-type', 'more']) assert.deepEqual(categoryPage.check(await page(key)), [], key); // eslint-disable-line no-await-in-loop
});

test('passes the Species hub rendered as a category: its moss head holds the H1, and the rest of its description follows the grid', async () => {
    const html = await renderPartial('pages/custom/category/species-hub', { ...HUB, settings: {} });
    assert.deepEqual(categoryPage.check({ kind: 'category', key: 'category', html }), []);
});

test('fails a page that isn\'t the category page, or a head with no H1 or two', async () => {
    assert.match(categoryPage.check({ kind: 'category', html: '<main><h1>Dry Flies</h1></main>' }).join('\n'), /no listing head/);
    const good = await page('sub-type');
    assert.match(problems(good, /<h1 [^>]*>[^<]*<\/h1>/, ''), /the listing head has 0 <h1>, not one/);
    assert.match(problems(good, /(<h1 [^>]*>[^<]*<\/h1>)/, '$1<h1>Again</h1>'), /the listing head has 2 <h1>, not one/);
});

test('fails a banner that is lazy, not high priority, or missing its srcset, sizes, dimensions or empty alt', async () => {
    const good = await page('fly-type');
    assert.ok(banner(good).includes('class="rf-graded"'), 'the stone\'s banner');
    assert.match(withBanner(good, tag => tag.replace('<img ', '<img loading="lazy" ')), /has loading="lazy"/);
    assert.match(withBanner(good, tag => tag.replace(' fetchpriority="high"', '')), /has no fetchpriority="high"/);
    assert.match(withBanner(good, tag => tag.replace(/ srcset="[^"]*"/, ' srcset="/one.jpg 640w"')), /no srcset of two or more candidates/);
    assert.match(withBanner(good, tag => tag.replace(/ sizes="[^"]*"/, '')), /has no sizes/);
    assert.match(withBanner(good, tag => tag.replace(' width="1600"', '')), /has no width and height/);
    assert.match(withBanner(good, tag => tag.replace(' alt=""', ' alt="Dry Flies"')), /has alt "Dry Flies", not ""/);
});

test('reads the banner in the stone\'s photo wrapper only, so a plain head\'s page has none to check', async () => {
    const plain = await page('sub-type');
    assert.equal(headBanner(listingHead(plain.html)), undefined);
    assert.equal(findTags(listingHead(plain.html), 'img').length, 0);
});

test('fails a chip with no href, a "more" chip shown in the HTML, or none at all', async () => {
    const good = await page('fly-type');
    assert.match(problems(good, /(<a class="rf-chip") href="[^"]*"/, '$1 href=""'), /a chip has no href/);
    assert.match(problems(good, 'data-rf-chips-more hidden', 'data-rf-chips-more'), /the "more" chip isn't hidden/);
    assert.match(problems(good, /<li class="rf-chips__item rf-chips__more"[\s\S]*?<\/li>/, ''), /0 "more" chips, not one/);
    assert.match(problems(good, /<li class="rf-chips__item"><a class="rf-chip"/, '<li class="rf-chips__item"><span class="rf-chip"'), /8 chips but 7 links/);
});

test('fails a marker inside an element, which splits it and lets the head swallow the listing', async () => {
    const split = await page('fly-type', { description: '<div class="intro"><p>Dry flies.</p><!--more--><p>More.</p></div>' });
    assert.match(categoryPage.check(split).join('\n'), /a <!--more--> marker inside an element split it/);
});

test('fails the description\'s rest before the grid, and a printed <!--more--> marker', async () => {
    const good = await page('fly-type');
    const about = outerHtml(good.html, 'section', attrs => /(^|\s)rf-list-about(\s|$)/.test(attrs.class || ''));
    assert.ok(about.includes('data-rf-description'));
    const moved = good.html.replace(about, '').replace('<div class="rf-list', `${about}<div class="rf-list`);
    assert.match(categoryPage.check({ ...good, html: moved }).join('\n'), /comes before the product grid/);
    assert.match(problems(good, '</h1>', '</h1><!--more-->'), /marker is in the page/);
});
