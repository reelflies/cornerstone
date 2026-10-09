// Tests the card-images assertion (ticket 31; SEO-14, O23; story 70) on grids the card partial
// renders, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/card-images.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial } from '../../render/render.mjs';
import cardImages from './card-images.mjs';

const { products } = JSON.parse(fs.readFileSync(path.resolve('scripts/qa/render/partials/card/products.json'), 'utf8'));
const CALLER = 'rf-test/card-images-caller';
const BANNER = '<img src="https://cdn11.bigcommerce.com/s-x/images/stencil/1600w/c/streamers__1.jpg" alt="" fetchpriority="high" width="1600" height="700">';

const page = async ({ kind = 'search', banner = false } = {}) => {
    const grid = await renderPartial(CALLER, { products, page_type: kind, theme_settings: {} }, {
        overrides: { [CALLER]: `${banner ? "{{assignVar 'rf_banner' 1}}" : ''}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` },
    });
    return {
        kind, key: kind, path: '/', status: 200, html: `<main>${banner ? BANNER : ''}${grid}</main>`,
    };
};

test('applies to listings: category, search and brand pages', () => {
    assert.deepEqual(cardImages.pages, ['category', 'search', 'brand']);
    assert.equal(cardImages.ticket, 31);
});

test('passes the card partial\'s grid, with no banner and with one', async () => {
    assert.deepEqual(cardImages.check(await page()), []);
    assert.deepEqual(cardImages.check(await page({ kind: 'category', banner: true })), []);
});

test('passes a page with no grid', () => {
    assert.deepEqual(cardImages.check({ kind: 'search', html: '<main><p>No products found</p></main>' }), []);
});

test('fails lazysizes, a missing srcset or sizes, and a card out of its eager or lazy place', async () => {
    const good = await page();
    const swap = (from, to, count = 1) => {
        let html = good.html;
        for (let i = 0; i < count; i += 1) html = html.replace(from, to);
        return { ...good, html };
    };
    assert.match(cardImages.check(swap('class="card-image rf-card-image"', 'class="card-image lazyload"')).join('\n'), /card 1's photo loads through lazysizes/);
    assert.match(cardImages.check(swap(/ sizes="[^"]*"/, '')).join('\n'), /card 1's photo has no sizes/);
    assert.match(cardImages.check(swap(/ srcset="[^"]*"/, ' srcset="data:image/gif;base64,R0lGOD"')).join('\n'), /card 1's photo has no real srcset/);
    assert.match(cardImages.check(swap(' fetchpriority="high"', ' loading="lazy"')).join('\n'), /card 1's photo is lazy: the first three load eagerly/);
    const allEager = { ...good, html: good.html.replace(/ loading="lazy"/g, '') };
    assert.match(cardImages.check(allEager).join('\n'), /card 4's photo isn't lazy/);
    assert.match(cardImages.check(swap(/ width="600"/, '')).join('\n'), /card 1's photo has no width/);
});

test('wants one fetchpriority="high" on the page: the first card\'s, or the banner\'s when there is one', async () => {
    const good = await page();
    assert.match(cardImages.check({ ...good, html: good.html.replace(' fetchpriority="high"', '') }).join('\n'), /no image on the page has fetchpriority="high": with no banner, the first card's photo takes it/);
    assert.match(cardImages.check({ ...good, html: BANNER + good.html }).join('\n'), /2 images have fetchpriority="high"/);
    const second = good.html.replace(/(<img class="card-image[^>]*?)( decoding)/g, (match, head, tail, offset) => (offset > good.html.indexOf('data-position="2"') && !match.includes('fetchpriority') ? `${head} fetchpriority="high"${tail}` : match));
    assert.match(cardImages.check({ ...good, html: second }).join('\n'), /card 2's photo has fetchpriority="high"/);
});
