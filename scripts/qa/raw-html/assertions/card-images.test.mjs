// Tests the card-images assertion (ticket 31; SEO-14, O23; story 70) on grids the card partial
// renders, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/card-images.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import cardImages from './card-images.mjs';

const { products } = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/partials/card/products.json'), 'utf8'));
const CALLER = 'rf-test/card-images-caller';
// Ticket 32's listing banner, as listing-header.html prints it.
const BANNER = '<img class="rf-listing-banner" src="https://cdn11.bigcommerce.com/s-x/images/stencil/1600w/c/streamers__1.jpg" alt="" fetchpriority="high" width="1600" height="700">';

const page = async ({ kind = 'search', banner = false } = {}) => {
    const grid = await renderPartial(CALLER, { products, page_type: kind, theme_settings: {} }, {
        overrides: { [CALLER]: `${banner ? "{{assignVar 'rf_banner' 1}}" : ''}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` },
    });
    return {
        kind, key: kind, path: '/', status: 200, html: `${banner ? BANNER : ''}<main id="product-listing-container">${grid}</main>`,
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

test('passes a search or brand page with no grid, and fails a category pin with none', () => {
    for (const kind of ['search', 'brand']) assert.deepEqual(cardImages.check({ kind, html: '<main><p>No products found</p></main>' }), [], kind);
    assert.match(cardImages.check({ kind: 'category', html: '<main><p>No products found</p></main>' }).join('\n'), /has no product grid/);
});

test('reads the listing\'s own grid, not an earlier one, and fails a product that isn\'t a card', async () => {
    const good = await page();
    const decoy = '<ul class="productGrid"><li class="product"><article class="card"><img src="/x.jpg" srcset="/x.jpg 1x" sizes="1px" width="1" height="1"></article></li></ul>';
    const allEager = good.html.replace(/ loading="lazy"/g, '');
    assert.match(cardImages.check({ ...good, html: decoy + allEager }).join('\n'), /card 4's photo isn't lazy/);
    // The first card's <article> becomes a <div>, its closing tag too.
    const first = good.html.indexOf('<article');
    const close = good.html.indexOf('</article>', first);
    const bare = `${good.html.slice(0, first)}<div${good.html.slice(first + 8, close)}</div>${good.html.slice(close + 10)}`;
    assert.match(cardImages.check({ ...good, html: bare }).join('\n'), /the grid has 6 products but 5 cards/);
});

test('fails lazysizes, a missing srcset or sizes, and a card out of its eager or lazy place', async () => {
    const good = await page();
    const swap = (from, to) => ({ ...good, html: good.html.replace(from, to) });
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
    const elsewhere = `<img src="/logo.png" fetchpriority="high">${good.html.replace(' fetchpriority="high"', '')}`;
    assert.match(cardImages.check({ ...good, html: elsewhere }).join('\n'), /fetchpriority="high" is on \/logo\.png, not the banner or the first card's photo/);
});
