// Tests home-photo-once's skip of ticket 29's menu pane banners at its edges (ticket 49, from
// #58's round-3 reviewers; ticket 47's own cases are in home-cards-tiles.test.mjs), and ticket
// 49's cold-water crop of the Dry banner on a home page with the Species section on it.
//
// A pane banner is skipped with the <picture> round it, from the <picture>'s start tag through its
// first <img>, and only when that <img> is the marked banner. So markup after it in the pane (a
// second, unmarked <img>, or everything up to the pane's end when the <picture> is never closed)
// is still read, and a photo it repeats is still counted.
//
//   node --test scripts/qa/raw-html/assertions/home-photo-once.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage } from '../../raw-html.mjs';
import photoOnce, { photosOn, repeatedPhotos } from './home-photo-once.mjs';

const fixture = name => readFixture(path.join(WIDGETS_DIR, name, 'fixtures', 'default.json'));
const CDN = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const DRY = 'i/dry-flies__36885.original.jpg'; // card 1's banner, and the Dry Flies pane's
const GLO_BUG = 'products/5101/5675/Glo-Bug-Pink__15852.1683224794.jpg'; // tile 1's photo
const wrap = html => `<div data-widget-id="w" data-placement-id="p" data-placement-status="ACTIVE">${html}</div>`;

// A home page as stencil start serves it: the menu's panes in the header, then the widgets in
// their regions, each in the store's wrapper.
async function homePage({ menu = '', below = [] } = {}) {
    const lead = await renderWidget('home-lead', fixture('home-lead'));
    const tiles = await renderWidget('link-tiles', fixture('link-tiles'));
    const sections = await Promise.all(below.map(name => renderWidget(name, fixture(name))));
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: `<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header><nav id="menu">${menu}</nav></header><main class="body" id="main-content">`
            + `<div data-content-region="home_below_menu">${wrap(lead)}</div><div class="container"><div class="main full">`
            + `<div data-content-region="home_below_top_products">${[tiles, ...sections].map(wrap).join('')}</div></div></div></main></body></html>`,
    };
}
const pane = inner => `<div data-rf-menu-pane hidden><h2><a href="/dry-flies/">Dry Flies</a></h2>${inner}</div>`;
const banner = `<img src="${CDN}/320w/${DRY}" srcset="${CDN}/320w/${DRY} 320w, ${CDN}/640w/${DRY} 640w" sizes="640px" width="1600" height="700" alt="" loading="lazy" data-rf-menu-banner>`;
const source = `<source media="(min-width: 801px)" srcset="${CDN}/640w/${DRY} 640w">`;
const repeat = `<img src="${CDN}/320w/${GLO_BUG}" alt="">`;
const failures = page => checkPage(page, [photoOnce]).filter(result => result.status === 'fail');

test('a pane banner in a closed <picture> is still skipped with its sources', async () => {
    const page = await homePage({ menu: pane(`<picture>${source}${banner}</picture>`) });
    assert.deepEqual(repeatedPhotos(page.html), []);
    assert.deepEqual(failures(page), []);
});

test('an unclosed <picture> round a pane banner can\'t hide a repeat later in the pane', async () => {
    const page = await homePage({ menu: pane(`<picture>${source}${banner}<p>More dry flies</p>${repeat}`) });
    const problems = repeatedPhotos(page.html);
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`^the photo ${GLO_BUG.replace(/[.]/g, '\\.')} appears twice`));
    assert.equal(failures(page).length, 1);
});

test('a second, unmarked <img> in a pane banner\'s <picture> still counts', async () => {
    const page = await homePage({ menu: pane(`<picture>${source}${banner}${repeat}</picture>`) });
    const problems = repeatedPhotos(page.html);
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`^the photo ${GLO_BUG.replace(/[.]/g, '\\.')} appears twice`));
});

test('a <picture> whose first <img> isn\'t the marked banner isn\'t skipped: its sources go with that <img>', async () => {
    // The browser shows the source's file in the first <img>, the Dry banner, which card 1 shows.
    const page = await homePage({ menu: pane(`<picture>${source}<img src="${CDN}/320w/image-manager/rf-pane-photo.jpg" alt="">${banner}</picture>`) });
    const [first] = photosOn(page.html);
    assert.deepEqual(first.keys, [DRY, 'image-manager/rf-pane-photo.jpg']);
    const problems = repeatedPhotos(page.html);
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`^the photo ${DRY.replace(/[.]/g, '\\.')} appears twice`));
});

// Ticket 49's Species section shows the Dry banner's left third in its cold-water group, marked
// as the page's one allowed repeat (CD-4).
test('the Species section\'s cold-water crop of the Dry banner is the allowed repeat, and is counted once unmarked', async () => {
    const page = await homePage({ below: ['shop-by-fish', 'about'] });
    assert.deepEqual(repeatedPhotos(page.html), []);
    assert.deepEqual(failures(page), []);
    const crop = photosOn(page.html).find(photo => photo.repeat);
    assert.deepEqual(crop.keys, [DRY]);
    assert.equal(repeatedPhotos(page.html.replace(' data-rf-photo-repeat', '')).length, 1);
});

test('the description names the skip exactly: the marked banners inside a div[data-rf-menu-pane], with their <picture>', () => {
    assert.match(photoOnce.description, /data-rf-menu-banner/);
    assert.match(photoOnce.description, /div\[data-rf-menu-pane\]/);
    assert.match(photoOnce.description, /<picture>/);
});
