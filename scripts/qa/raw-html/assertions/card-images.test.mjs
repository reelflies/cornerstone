// Tests the card-images assertion (ticket 31; SEO-14, O23; story 70; redesign step 3) on grids
// the specimen card renders, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/card-images.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import cardImages, { EAGER } from './card-images.mjs';

const { products } = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/partials/card/products.json'), 'utf8'));
const CALLER = 'rf-test/card-images-caller';
// Ticket 32's banner, as listing-head.html prints the stone.
const BANNER_IMG = '<img class="rf-graded" src="https://cdn11.bigcommerce.com/s-x/images/stencil/1280w/i/dry-flies.jpg" srcset="https://cdn11.bigcommerce.com/s-x/images/stencil/640w/i/dry-flies.jpg 640w, https://cdn11.bigcommerce.com/s-x/images/stencil/1600w/i/dry-flies.jpg 1600w" sizes="100vw" width="1600" height="700" alt="" fetchpriority="high" decoding="async">';
const BANNER = `<div class="rf-list-head rf-list-head--stone"><div class="rf-list-head__photo">${BANNER_IMG}</div><div class="rf-list-head__inner"><h1>Dry Flies</h1></div></div>`;
// The Species hub's first tile, as hub-tile.html prints it.
const TILE_IMG = '<img src="https://cdn11.bigcommerce.com/s-x/images/stencil/640w/j/trout.jpg" srcset="https://cdn11.bigcommerce.com/s-x/images/stencil/320w/j/trout.jpg 320w, https://cdn11.bigcommerce.com/s-x/images/stencil/960w/j/trout.jpg 960w" sizes="104px" width="640" height="280" alt="" fetchpriority="high" decoding="async">';
const TILES = `<div class="rf-hub"><ul class="rf-hub__tiles" data-rf-hub-tiles><li class="rf-hub-tile"><a class="rf-hub-tile__media" href="/trout/" tabindex="-1" aria-hidden="true">${TILE_IMG}</a></li></ul></div>`;

// A listing page with the grid: `lead` sets the page variable the head would (rf_banner, or the
// hub's rf_cards_lazy) and puts the head's markup before the listing.
const page = async ({ kind = 'search', lead = '' } = {}) => {
    const before = { banner: "{{assignVar 'rf_banner' 1}}", hub: "{{assignVar 'rf_cards_lazy' 1}}" }[lead] || '';
    const grid = await renderPartial(CALLER, { products, page_type: kind, theme_settings: {} }, {
        overrides: { [CALLER]: `${before}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` },
    });
    const head = { banner: BANNER, hub: TILES }[lead] || '';
    return {
        kind, key: kind, path: '/', status: 200, html: `<main>${head}<div id="product-listing-container">${grid}</div></main>`,
    };
};
const firstImg = html => html.match(/<img [^>]*>/)[0];

test('applies to listings: category, search and brand pages, with three eager cards', () => {
    assert.deepEqual(cardImages.pages, ['category', 'search', 'brand']);
    assert.equal(cardImages.ticket, 31);
    assert.equal(EAGER, 3);
});

test('passes the specimen grid, with no banner, with one, and under the hub\'s tiles', async () => {
    assert.deepEqual(cardImages.check(await page()), []);
    assert.deepEqual(cardImages.check(await page({ kind: 'category', lead: 'banner' })), []);
    assert.deepEqual(cardImages.check(await page({ kind: 'category', lead: 'hub' })), []);
});

test('passes a search or brand page with no grid, and fails a category pin with none', () => {
    for (const kind of ['search', 'brand']) assert.deepEqual(cardImages.check({ kind, html: '<main><p>No products found</p></main>' }), [], kind);
    assert.match(cardImages.check({ kind: 'category', html: '<main><p>No products found</p></main>' }).join('\n'), /has no product grid/);
});

test('reads the listing\'s own grid, not an earlier one, and fails a product that isn\'t a card', async () => {
    const good = await page();
    const decoy = '<ul class="rf-flies" data-rf-grid><li class="rf-fly"><article class="rf-fly__card"><img src="/x.jpg" srcset="/x.jpg 1x" sizes="1px" width="1" height="1"></article></li></ul>';
    const allEager = good.html.replace(/ loading="lazy"/g, '');
    assert.match(cardImages.check({ ...good, html: decoy + allEager }).join('\n'), /card 4's photo isn't lazy/);
    // The first card's <article> becomes a <div>, its closing tag too.
    const first = good.html.indexOf('<article');
    const close = good.html.indexOf('</article>', first);
    const bare = `${good.html.slice(0, first)}<div${good.html.slice(first + 8, close)}</div>${good.html.slice(close + 10)}`;
    assert.match(cardImages.check({ ...good, html: bare }).join('\n'), /the grid has 6 products but 5 cards/);
});

test('fails a card with no photo', async () => {
    const good = await page();
    const gone = good.html.replace(firstImg(good.html), '');
    assert.match(cardImages.check({ ...good, html: gone }).join('\n'), /card 1 has no photo/);
});

test('fails lazysizes, a missing srcset, sizes or dimensions, and a card out of its eager or lazy place', async () => {
    const good = await page();
    const img = firstImg(good.html);
    const swap = (from, to) => ({ ...good, html: good.html.replace(from, to) });
    assert.match(cardImages.check(swap(img, img.replace('<img ', '<img class="lazyload" '))).join('\n'), /card 1's photo loads through lazysizes/);
    assert.match(cardImages.check(swap(img, img.replace(/ sizes="[^"]*"/, ''))).join('\n'), /card 1's photo has no sizes/);
    assert.match(cardImages.check(swap(img, img.replace(/ srcset="[^"]*"/, ' srcset="data:image/gif;base64,R0lGOD"'))).join('\n'), /card 1's photo has no real srcset/);
    assert.match(cardImages.check(swap(img, img.replace(' width="720"', ''))).join('\n'), /card 1's photo has no width/);
    assert.match(cardImages.check(swap(img, img.replace(' fetchpriority="high"', ' loading="lazy"'))).join('\n'), /card 1's photo is lazy: the first three load eagerly/);
    const allEager = { ...good, html: good.html.replace(/ loading="lazy"/g, '') };
    assert.match(cardImages.check(allEager).join('\n'), /card 4's photo isn't lazy: only the first three load eagerly/);
});

test('wants one fetchpriority="high" on the page: the first card\'s, or the banner\'s when there is one', async () => {
    const good = await page();
    assert.match(cardImages.check({ ...good, html: good.html.replace(' fetchpriority="high"', '') }).join('\n'), /no image on the page has fetchpriority="high": with no banner, the first card's photo takes it/);
    assert.match(cardImages.check({ ...good, html: BANNER + good.html }).join('\n'), /2 images have fetchpriority="high"/);
    const withSecond = good.html.replace(/data-position="2"[\s\S]*?<img [^>]*? decoding/, match => match.replace(' decoding', ' fetchpriority="high" decoding'));
    assert.match(cardImages.check({ ...good, html: withSecond }).join('\n'), /card 2's photo has fetchpriority="high"/);
    const lost = await page({ kind: 'category' });
    const quietBanner = `${BANNER.replace(' fetchpriority="high"', '')}${lost.html}`;
    assert.match(cardImages.check({ ...lost, html: quietBanner }).join('\n'), /the page has the banner \(\.rf-list-head__photo\), so it holds the one fetchpriority="high", not the first card/);
    const elsewhere = `<img src="/logo.png" fetchpriority="high">${good.html.replace(' fetchpriority="high"', '')}`;
    assert.match(cardImages.check({ ...good, html: elsewhere }).join('\n'), /fetchpriority="high" is on \/logo\.png, not the banner or the first card's photo/);
});

test('under the Species hub, wants every card lazy and the first tile\'s photo the page\'s one fetchpriority="high"', async () => {
    const hub = await page({ kind: 'category', lead: 'hub' });
    const eagerFirst = hub.html.replace(/(data-rf-grid>[\s\S]*?<img [^>]*?) loading="lazy"/, '$1');
    assert.match(cardImages.check({ ...hub, html: eagerFirst }).join('\n'), /card 1's photo isn't lazy: under the Species hub's tiles every card photo is/);
    const cardLeads = hub.html.replace(TILE_IMG, TILE_IMG.replace(' fetchpriority="high"', '')).replace(/(data-rf-grid>[\s\S]*?<img [^>]*?) decoding/, '$1 fetchpriority="high" decoding');
    assert.match(cardImages.check({ ...hub, html: cardLeads }).join('\n'), /the page has the hub's first tile photo, so it holds the one fetchpriority="high", not the first card/);
});
