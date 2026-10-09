// Tests the brand-page assertion (ticket 36; spec module 12; O10; stories 17, 70 and 72) on brand
// pages the templates render from the brand fixture page's contexts
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

test('passes the rendered pages: the banner, the plain header, filters that match nothing, and a brand with no products', async () => {
    for (const [name, brand] of [['banner', {}], ['plain', {}], ['empty', {}], ['banner', { products: [] }]]) {
        assert.deepEqual(brandPage.check(await page(name, brand)), [], `${name} ${JSON.stringify(brand)}`); // eslint-disable-line no-await-in-loop
    }
});

test('fails stock\'s brand page: no listing header, its 100px image and its own <h1>', async () => {
    const stock = '<div class="brand-image-container"><img src="/b.jpg" alt="ReelFlies"></div><h1 class="page-heading">ReelFlies</h1><div data-content-region="brand_below_header"></div>';
    const found = brandPage.check({ kind: 'brand', html: `<main>${stock}</main>` }).join('\n');
    assert.match(found, /no listing header/);
    const good = await page('banner');
    assert.match(problems(good, '<div class="page rf-listing-page rf-brand-listing">', `${stock}<div class="page rf-listing-page rf-brand-listing">`), /stock's brand image \(\.brand-image-container\)/);
});

test('fails a header with no H1 or two, and an H1 outside it', async () => {
    const good = await page('plain');
    assert.match(problems(good, /<h1 [^>]*>[^<]*<\/h1>/, ''), /the listing header has 0 <h1>, not one/);
    assert.match(problems(good, /(<h1 [^>]*>[^<]*<\/h1>)/, '$1<h1>Again</h1>'), /the listing header has 2 <h1>, not one/);
    assert.match(problems(good, '<main', '<h1>Elsewhere</h1><main'), /2 <h1> on the page/);
});

test('fails a banner that is lazy or not high priority, as a category\'s would', async () => {
    const good = await page('banner');
    assert.match(problems(good, 'class="rf-listing-banner"', 'class="rf-listing-banner" loading="lazy"'), /has loading="lazy"/);
    assert.match(problems(good, ' fetchpriority="high"', ''), /has no fetchpriority="high"/);
});

test('fails the intro\'s region anywhere but right after the header', async () => {
    const good = await page('banner');
    const region = '<div data-content-region="brand_below_header"></div>';
    assert.ok(good.html.includes(region));
    assert.match(problems(good, region, ''), /no brand_below_header region right after the listing header/);
    const moved = good.html.replace(region, '').replace('<main', `${region}<main`);
    assert.match(brandPage.check({ ...good, html: moved }).join('\n'), /no brand_below_header region right after the listing header/);
});

test('fails a robots meta that says noindex, as from the store\'s head meta tags (story 72)', async () => {
    const good = await page('banner');
    assert.match(problems(good, '<title>', '<meta name="ROBOTS" content="NOINDEX, FOLLOW"><title>'), /robots "NOINDEX, FOLLOW": the brand listing is indexable/);
});

test('fails a canonical that isn\'t the brand\'s own URL, the breadcrumb marked aria-current="page"; an absolute one on the host passes', async () => {
    const good = await page('banner');
    assert.match(problems(good, CANONICAL, '<link rel="canonical" href="/brands/">'), /the canonical points at \/brands\/, not the brand's own URL \/reelflies-2\//);
    assert.deepEqual(brandPage.check({ ...good, html: good.html.replace(CANONICAL, '<link rel="canonical" href="https://reelflies_ca-1895766.mybigcommerce.com/reelflies-2/">') }), []);
    assert.match(problems(good, 'aria-current="page"', ''), /no breadcrumb marks the brand's own URL \(aria-current="page"\)/);
    // No canonical at all is one-canonical's to report.
    assert.deepEqual(brandPage.check({ ...good, html: good.html.replace(CANONICAL, '') }), []);
});
