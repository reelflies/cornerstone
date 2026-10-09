// Tests the category-page assertion (ticket 32; O10, UX-5; stories 21, 22 and 72) on category
// pages the templates render from tree-4-shaped data (render/partials/category/pages.json), and on
// hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/category-page.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import categoryPage from './category-page.mjs';

const PARTIALS = path.join(THEME_DIR, 'scripts/qa/render/partials');
const read = file => JSON.parse(fs.readFileSync(path.join(PARTIALS, file), 'utf8'));
const tree4 = read('menu/tree-4.json');
const { products } = read('card/products.json');
const { pages } = read('category/pages.json');

const page = async key => ({
    kind: 'category',
    key: 'category',
    path: '/',
    status: 200,
    html: await renderPartial('pages/category', {
        page_type: 'category',
        breadcrumbs: pages[key].breadcrumbs,
        category: { ...pages[key].category, products },
        categories: tree4.categories,
        settings: {},
        theme_settings: tree4.theme_settings,
    }),
});
const problems = (good, from, to) => categoryPage.check({ ...good, html: good.html.replace(from, to) }).join('\n');

test('applies to category pins, ticket 32', () => {
    assert.deepEqual(categoryPage.pages, ['category']);
    assert.equal(categoryPage.ticket, 32);
});

test('passes the rendered pages: a Fly Type with its banner, a Species page, a sub-type and a More category', async () => {
    for (const key of ['fly-type', 'species', 'sub-type', 'more']) assert.deepEqual(categoryPage.check(await page(key)), [], key); // eslint-disable-line no-await-in-loop
});

test('fails a page that isn\'t the category page, or a header with no H1 or two', async () => {
    assert.match(categoryPage.check({ kind: 'category', html: '<main><h1>Dry Flies</h1></main>' }).join('\n'), /no listing header/);
    const good = await page('sub-type');
    assert.match(problems(good, /<h1 [^>]*>[^<]*<\/h1>/, ''), /the listing header has 0 <h1>, not one/);
    assert.match(problems(good, /(<h1 [^>]*>[^<]*<\/h1>)/, '$1<h1>Again</h1>'), /the listing header has 2 <h1>, not one/);
});

test('fails a banner that is lazy, not high priority, or missing its srcset, sizes, dimensions or empty alt', async () => {
    const good = await page('fly-type');
    assert.match(problems(good, 'class="rf-listing-banner"', 'class="rf-listing-banner" loading="lazy"'), /has loading="lazy"/);
    assert.match(problems(good, ' fetchpriority="high"', ''), /has no fetchpriority="high"/);
    assert.match(problems(good, /class="rf-listing-banner" src="([^"]*)" srcset="[^"]*"/, 'class="rf-listing-banner" src="$1" srcset="$1 480w"'), /no srcset of two or more candidates/);
    assert.match(problems(good, /(class="rf-listing-banner"[^>]*) sizes="[^"]*"/, '$1'), /has no sizes/);
    assert.match(problems(good, ' width="1600"', ''), /has no width and height/);
    assert.match(problems(good, /(class="rf-listing-banner"[^>]*) alt=""/, '$1 alt="Dry Flies"'), /has alt "Dry Flies", not ""/);
});

test('fails a chip with no href, a "more" chip shown in the HTML, or none at all', async () => {
    const good = await page('fly-type');
    assert.match(problems(good, /(<a class="rf-chip[^"]*") href="[^"]*"/, '$1 href=""'), /a chip has no href/);
    assert.match(problems(good, 'data-rf-chips-more hidden', 'data-rf-chips-more'), /the "more" chip isn't hidden/);
    assert.match(problems(good, /<li class="rf-chips-item rf-chips-more"[\s\S]*?<\/li>/, ''), /0 "more" chips, not one/);
});

test('fails a marker inside an element, which splits it and lets the header swallow the page', async () => {
    const split = await renderPartial('pages/category', {
        page_type: 'category',
        breadcrumbs: pages['fly-type'].breadcrumbs,
        category: { ...pages['fly-type'].category, products, description: '<div class="intro"><p>Dry flies.</p><!--more--><p>More.</p></div>' },
        categories: tree4.categories,
        settings: {},
        theme_settings: tree4.theme_settings,
    });
    assert.match(categoryPage.check({ kind: 'category', key: 'category', html: split }).join('\n'), /a <!--more--> marker inside an element split it/);
});

test('fails the description\'s rest before the grid, and a printed <!--more--> marker', async () => {
    const good = await page('fly-type');
    const rest = good.html.match(/<div class="rf-listing-description" data-rf-description>[\s\S]*?<\/div>/)[0];
    const moved = good.html.replace(rest, '').replace('<div class="page">', `${rest}<div class="page">`);
    assert.match(categoryPage.check({ ...good, html: moved }).join('\n'), /comes before the product grid/);
    assert.match(problems(good, '</h1>', '</h1><!--more-->'), /marker is in the page/);
});
