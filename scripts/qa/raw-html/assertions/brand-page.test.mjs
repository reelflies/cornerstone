// Tests the brand-page assertion (ticket 36; spec module 12; O10; stories 17, 70 and 72; redesign
// step 3) on brand pages the templates render from the brand fixture page's contexts
// (render/pages/brand-page/fixtures/), with the store's canonical put in their head as the store
// does, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/brand-page.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import brandPage from './brand-page.mjs';

const FIXTURES = path.join(THEME_DIR, 'scripts/qa/render/pages/brand-page/fixtures');
const context = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, `${name}.json`), 'utf8')).page_context;
// The store's canonical for brand 411, as stencil start serves it (2026-10-09): its own URL,
// /reelflies-2/, which /brands/ReelFlies.html aliases.
const CANONICAL = '<link rel=\'canonical\' href=\'/reelflies-2/\' />';
const REGION = '<div data-content-region="brand_below_header"></div>';
const LISTING = '<div class="rf-list rf-list--side">';

const page = async (name, brand = {}) => {
    const data = context(name);
    const html = await renderPartial('pages/brand', { ...data, brand: { ...data.brand, ...brand }, settings: {} });
    // The fixture's breadcrumbs carry the store's absolute URLs; stencil start serves them as paths.
    return {
        kind: 'brand', key: 'brand', path: '/brands/ReelFlies.html', status: 200, html: html.replace('<title>', `${CANONICAL}<title>`).replaceAll('https://reelflies.ca/', '/'),
    };
};
const problems = (good, from, to) => brandPage.check({ ...good, html: good.html.replace(from, to) }).join('\n');

test('applies to brand pins, ticket 36', () => {
    assert.deepEqual(brandPage.pages, ['brand']);
    assert.equal(brandPage.ticket, 36);
});

test('passes the rendered pages: with the brand\'s image and without, filters that match nothing, a brand with no products, and filtering off', async () => {
    for (const [name, brand] of [['banner', {}], ['plain', {}], ['empty', {}], ['banner', { products: [] }], ['plain', { faceted_search_enabled: false }]]) {
        assert.deepEqual(brandPage.check(await page(name, brand)), [], `${name} ${JSON.stringify(brand)}`); // eslint-disable-line no-await-in-loop
    }
});

test('fails stock\'s brand page: no listing head, its 100px image and its own <h1>', async () => {
    const stock = '<div class="brand-image-container"><img src="/b.jpg" alt="ReelFlies"></div><h1 class="page-heading">ReelFlies</h1><div data-content-region="brand_below_header"></div>';
    const found = brandPage.check({ kind: 'brand', html: `<main>${stock}</main>` }).join('\n');
    assert.match(found, /no listing head/);
    const good = await page('banner');
    assert.ok(good.html.includes(LISTING));
    const both = problems(good, LISTING, `${stock}${LISTING}`);
    assert.match(both, /stock's brand image \(\.brand-image-container\)/);
    assert.match(both, /stock's page heading \(h1\.page-heading\)/);
    assert.match(both, /2 <h1> on the page/);
});

test('fails a head with no H1 or two, and an H1 outside it', async () => {
    const good = await page('plain');
    assert.match(problems(good, /<h1 [^>]*>[^<]*<\/h1>/, ''), /the listing head has 0 <h1>, not one/);
    assert.match(problems(good, /(<h1 [^>]*>[^<]*<\/h1>)/, '$1<h1>Again</h1>'), /the listing head has 2 <h1>, not one/);
    assert.match(problems(good, '<main', '<h1>Elsewhere</h1><main'), /2 <h1> on the page/);
});

test('fails a banner that is lazy or not high priority, as a category\'s would, should a brand ever carry one', async () => {
    const good = await page('banner');
    const stone = tag => `<div class="rf-list-head__photo">${tag}</div><div class="rf-list-head__inner">`;
    const img = 'class="rf-graded" src="/b.jpg" srcset="/b.jpg 640w, /b2.jpg 1600w" sizes="100vw" width="1600" height="700" alt=""';
    assert.deepEqual(brandPage.check({ ...good, html: good.html.replace('<div class="rf-list-head__inner">', stone(`<img ${img} fetchpriority="high">`)) }), [], 'a sound banner passes');
    assert.match(problems(good, '<div class="rf-list-head__inner">', stone(`<img ${img} fetchpriority="high" loading="lazy">`)), /has loading="lazy"/);
    assert.match(problems(good, '<div class="rf-list-head__inner">', stone(`<img ${img}>`)), /has no fetchpriority="high"/);
});

test('fails the intro\'s region anywhere but right after the head', async () => {
    const good = await page('banner');
    assert.ok(good.html.includes(REGION));
    assert.match(problems(good, REGION, ''), /no brand_below_header region right after the listing head/);
    const moved = good.html.replace(REGION, '').replace('<main', `${REGION}<main`);
    assert.match(brandPage.check({ ...good, html: moved }).join('\n'), /no brand_below_header region right after the listing head/);
});

// As BigCommerce answers a client it takes for a bot (curl's User-Agent, or HeadlessChrome's):
// the facets named, so the nav renders, but with no items (2026-10-09, channel 1).
const facetsWithoutItems = name => ({ facets: context(name).brand.facets.map(facet => ({ ...facet, items: [] })) });

test('fails a brand page that lists products under the facet nav with no facet link, as BigCommerce sends a bot, so facet-links can\'t pass with nothing to check (story 72)', async () => {
    const bot = await page('banner', facetsWithoutItems('banner'));
    assert.match(bot.html, /id="facetedSearch-navList"/);
    assert.match(bot.html, /<ul class="rf-flies[^"]*" data-rf-grid>/);
    assert.match(brandPage.check(bot).join('\n'), /the facet nav has no facet link over the brand's products/);
    // Nothing to judge with no products listed, or with filtering off (the store's brand list).
    assert.deepEqual(brandPage.check(await page('banner', { ...facetsWithoutItems('banner'), products: [] })), []);
    assert.deepEqual(brandPage.check(await page('banner', { faceted_search_enabled: false })), []);
});

test('fails a robots meta that says noindex, as from the store\'s head meta tags (story 72)', async () => {
    const good = await page('banner');
    assert.match(problems(good, '<title>', '<meta name="ROBOTS" content="NOINDEX, FOLLOW"><title>'), /robots "NOINDEX, FOLLOW": the brand listing is indexable/);
});
