// Tests the size-filter assertion (ticket 33; O11, O20; stories 24 and 25) on the category fixture
// pages' contexts (render/pages/category-page/fixtures/), with and without products, on ticket
// 36's brand pages (render/pages/brand-page/fixtures/), and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/size-filter.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import sizeFilter, { FLY_PINS } from './size-filter.mjs';

const FIXTURES = path.join(THEME_DIR, 'scripts/qa/render/pages/category-page/fixtures');
const context = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')).page_context;
const page = async (name, change = context_ => context_) => ({
    kind: 'category', key: 'category', path: '/', status: 200, html: await renderPartial('pages/category', change(context(name))),
});
const BRAND_FIXTURES = path.join(THEME_DIR, 'scripts/qa/render/pages/brand-page/fixtures');
const brandPage = async name => ({
    kind: 'brand',
    key: 'brand',
    path: '/brands/ReelFlies.html',
    status: 200,
    html: await renderPartial('pages/brand', JSON.parse(fs.readFileSync(path.join(BRAND_FIXTURES, `${name}.json`), 'utf8')).page_context),
});
const problems = (good, from, to) => sizeFilter.check({ ...good, html: good.html.replace(from, to) }).join('\n');

test('applies to category pins, the Fly Type and Species kinds and ticket 36\'s brand listing, ticket 33', () => {
    assert.deepEqual(sizeFilter.pages, ['category', 'fly-type', 'species', 'brand']);
    assert.ok(FLY_PINS.includes('brand'), 'the ReelFlies brand listing is a fly listing');
    assert.equal(sizeFilter.ticket, 33);
});

test('passes the rendered pages: with the facet, filtered, with filters matching nothing, and with no facets at all', async () => {
    for (const name of ['fly-type', 'filtered', 'empty']) assert.deepEqual(sizeFilter.check(await page(name)), [], name); // eslint-disable-line no-await-in-loop
    const bare = await page('fly-type', ({ category, ...rest }) => ({ ...rest, category: { ...category, facets: [] } }));
    assert.deepEqual(sizeFilter.check(bare), []);
});

test('passes ticket 36\'s brand pages: with the facet and products, and with filters matching nothing', async () => {
    for (const name of ['banner', 'plain', 'empty']) assert.deepEqual(sizeFilter.check(await brandPage(name)), [], name); // eslint-disable-line no-await-in-loop
});

test('fails a Fly Sizes facet with no "What do sizes mean?" link, or two', async () => {
    const good = await page('fly-type');
    assert.match(problems(good, /<p class="rf-size-help">[\s\S]*?<\/p>/, ''), /has 0 links to \/fly-hook-size-chart\//);
    assert.match(problems(good, '<p class="rf-size-help">', '<p class="rf-size-help"><a href="/fly-hook-size-chart/">Again</a>'), /has 2 links/);
});

test('fails stock\'s Fly Sizes list, and stock\'s focus-grabbing no-products alert', async () => {
    const good = await page('fly-type');
    assert.match(problems(good, /<div class="accordion-block rf-size-facet">/, '<div class="accordion-block">'), /a Fly Sizes list is stock's/);
    assert.match(problems(good, '</main>', '<p data-no-products-notification role="alert">There are no products.</p></main>'), /no-products alert/);
});

test('fails a fly pin that lists facets but not Fly Sizes, as after a rename; the gear pin and a page with no facets pass', async () => {
    const renamed = context_ => ({
        ...context_,
        category: { ...context_.category, facets: context_.category.facets.map(facet => ({ ...facet, facet: 'Hook Size', title: 'Hook Size' })) },
    });
    for (const key of FLY_PINS) assert.match(sizeFilter.check({ ...(await page('fly-type', renamed)), key }).join('\n'), /lists facets but not "Fly Sizes"/, key); // eslint-disable-line no-await-in-loop
    assert.deepEqual(sizeFilter.check({ ...(await page('fly-type', renamed)), key: 'category@more' }), []);
    const brand = await brandPage('banner');
    assert.match(sizeFilter.check({ ...brand, html: brand.html.replaceAll('data-facet="Fly Sizes"', 'data-facet="Hook Size"').replace(/<div class="accordion-block rf-size-facet">/, '<div class="accordion-block">') }).join('\n'), /lists facets but not "Fly Sizes"/, 'brand');
    const bare = await page('fly-type', ({ category, ...rest }) => ({ ...rest, category: { ...category, facets: [] } }));
    assert.deepEqual(sizeFilter.check(bare), []);
});
