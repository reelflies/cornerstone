// Tests the home page's card, tile and photo assertions (ticket 47): home-cards-tiles and
// home-photo-once, on home pages built from the widgets' own renders (the hero and the cards in
// home_below_menu, the tiles in home_below_top_products), with each promise broken once. Both
// judge only the page, so a page without the widgets passes.
//
//   node --test scripts/qa/raw-html/assertions/home-cards-tiles.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
    readFixture, renderPartial, renderWidget, WIDGETS_DIR,
} from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import cardsTiles, { cardsTilesProblems, linksWithClass } from './home-cards-tiles.mjs';
import photoOnce, { photoKey, photosOn, repeatedPhotos } from './home-photo-once.mjs';
import hero from './home-hero.mjs';

const fixture = name => readFixture(path.join(WIDGETS_DIR, name, 'fixtures', 'default.json'));
const LOGO = '<div class="header-logo"><a href="/" class="header-logo__link"><img class="header-logo-image" src="https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/250x100/logo.png" alt="ReelFlies home"></a></div>';
const wrap = html => `<div data-widget-id="w" data-placement-id="p" data-placement-status="ACTIVE">${html}</div>`;

// A home page as stencil start serves it, with the widgets in their regions.
async function homePage({ lead, tiles } = {}) {
    const leadHtml = lead ?? await renderWidget('home-lead', fixture('home-lead'));
    const tilesHtml = tiles ?? await renderWidget('link-tiles', fixture('link-tiles'));
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: `<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header>${LOGO}</header><main class="body" id="main-content">`
            + `<div data-content-region="home_below_menu">${leadHtml && wrap(leadHtml)}</div><div class="container"><div class="main full">`
            + `<div data-content-region="home_below_top_products">${tilesHtml && wrap(tilesHtml)}</div></div></div></main></body></html>`,
    };
}

const failures = (page, assertion) => checkPage(page, [assertion]).filter(result => result.status === 'fail');

test('both are registered, for the home page only', async () => {
    const ids = (await loadAssertions()).map(assertion => assertion.id);
    for (const assertion of [cardsTiles, photoOnce]) {
        assert.ok(ids.includes(assertion.id), assertion.id);
        assert.deepEqual(assertion.pages, ['home']);
    }
});

test('the hero, the cards and the tiles as the widgets render them pass, beside the stock logo', async () => {
    const page = await homePage();
    assert.equal(linksWithClass(page.html, 'rf-type-card').length, 3);
    assert.equal(linksWithClass(page.html, 'rf-link-tile').length, 6);
    assert.deepEqual(cardsTilesProblems(page.html), []);
    assert.deepEqual(repeatedPhotos(page.html), []);
    for (const assertion of [cardsTiles, photoOnce, hero]) assert.deepEqual(failures(page, assertion), [], assertion.id);
});

test('a page without the cards or the tiles passes: the widgets aren\'t placed yet', async () => {
    assert.deepEqual(cardsTilesProblems((await homePage({ lead: '', tiles: '' })).html), []);
    assert.deepEqual(repeatedPhotos((await homePage({ lead: '', tiles: '' })).html), []);
});

test('a card or tile that isn\'t one clean link fails, naming it', async () => {
    const lead = await renderWidget('home-lead', fixture('home-lead'));
    const tiles = await renderWidget('link-tiles', fixture('link-tiles'));
    const nestedButton = lead.replace('<span class="rf-type-card__cta">Shop dry flies</span>', '<button class="rf-type-card__cta">Shop dry flies</button>');
    assert.deepEqual(cardsTilesProblems(nestedButton), ['card 1 (Dry Flies) has <button> inside its link: nothing interactive goes inside a link']);
    const nestedLink = tiles.replace('<span class="rf-link-tile__name">Fly Gear</span>', '<a href="/fly-gear/boxes/">Boxes</a><span class="rf-link-tile__name">Fly Gear</span>');
    assert.deepEqual(cardsTilesProblems(nestedLink), ['tile 6 has <a> inside its link: nothing interactive goes inside a link']);
    const noHref = tiles.replace('href="/eggs-worms/"', 'href="#"');
    assert.deepEqual(cardsTilesProblems(noHref), ['tile 1 (Eggs & Worms) links to "#", not a page']);
});

test('a card or tile photo without alt="", srcset, sizes or dimensions fails', async () => {
    const lead = await renderWidget('home-lead', fixture('home-lead'));
    const tiles = await renderWidget('link-tiles', fixture('link-tiles'));
    const alt = lead.replace('height="700" alt=""', 'height="700" alt="Dry flies on stone"');
    assert.deepEqual(cardsTilesProblems(alt), ['card 1 (Dry Flies)\'s <img> needs alt="": the link\'s text names it']);
    const bare = tiles.replace(/ srcset="[^"]*Glo-Bug[^"]*" sizes="[^"]*" width="1024" height="683"/, '');
    assert.deepEqual(cardsTilesProblems(bare), ['srcset', 'sizes', 'width', 'height'].map(name => `tile 1 (Eggs & Worms)'s <img> has no ${name}`));
});

test('the cards load eagerly with no fetchpriority, and the tiles lazily', async () => {
    const lead = await renderWidget('home-lead', fixture('home-lead'));
    const tiles = await renderWidget('link-tiles', fixture('link-tiles'));
    const priority = lead.replace('height="700" alt=""', 'height="700" alt="" fetchpriority="high"');
    assert.deepEqual(cardsTilesProblems(priority), ['card 1 (Dry Flies)\'s <img> has fetchpriority="high": the hero\'s photo is the only one']);
    const lazyCard = lead.replace('height="700" alt=""', 'height="700" alt="" loading="lazy"');
    assert.deepEqual(cardsTilesProblems(lazyCard), ['card 1 (Dry Flies)\'s <img> is lazy; the cards load eagerly']);
    const eagerTile = tiles.replace('alt="" loading="lazy"', 'alt=""');
    assert.deepEqual(cardsTilesProblems(eagerTile), ['tile 1 (Eggs & Worms)\'s <img> isn\'t loading="lazy"']);
    // The hero's own check still sees the page's one fetchpriority="high".
    assert.match(failures(await homePage({ lead: priority }), hero).map(result => result.problems.join('\n')).join('\n'), /2 fetchpriority="high" elements/);
});

test('a photo is named by its path after the size segment, so every size of one file is one photo', () => {
    assert.equal(photoKey('https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/320w/i/dry-flies__36885.original.jpg'), 'i/dry-flies__36885.original.jpg');
    assert.equal(photoKey('https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/500x659/products/5101/5675/Glo-Bug-Pink__15852.1683224794.jpg?c=2'), 'products/5101/5675/Glo-Bug-Pink__15852.1683224794.jpg');
    assert.equal(photoKey('/content/rf-photo.jpg'), '/content/rf-photo.jpg');
});

test('the same photo twice fails, a <picture> and its <img> are one photo, and ticket 49\'s marked crop is allowed', async () => {
    const lead = await renderWidget('home-lead', fixture('home-lead'));
    const tiles = await renderWidget('link-tiles', fixture('link-tiles'));
    // A tile showing the Dry Flies banner, which card 1 shows.
    const twice = tiles.replace('products/5101/5675/Glo-Bug-Pink__15852.1683224794.jpg', 'i/dry-flies__36885.original.jpg');
    const problems = repeatedPhotos((await homePage({ lead, tiles: twice })).html);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^the photo i\/dry-flies__36885\.original\.jpg appears twice on the home page: <img class="rf-type-card__img/);
    // Card 1 with its 4:5 frame: one <picture>, two files, one photo.
    const framed = await renderWidget('home-lead', readFixture(path.join(WIDGETS_DIR, 'home-lead', 'fixtures', 'frames.json')));
    const [, card1] = photosOn(framed);
    assert.deepEqual(card1.keys, ['image-manager/rf-frame-standin-1.jpg', 'i/dry-flies__36885.original.jpg']);
    assert.deepEqual(repeatedPhotos(framed), []);
    // Ticket 49's left-third crop of the Dry banner, marked.
    const crop = '<img src="https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/800w/i/dry-flies__36885.original.jpg" alt="" data-rf-photo-repeat>';
    assert.deepEqual(repeatedPhotos((await homePage({ lead, tiles: `${tiles}${crop}` })).html), []);
    assert.equal(repeatedPhotos((await homePage({ lead, tiles: `${tiles}${crop.replace(' data-rf-photo-repeat', '')}` })).html).length, 1);
});

// Ticket 29's pane banners reuse the Fly Type banners the cards show (each pane's category image).
// They are the menu's, not the home page's: a closed, lazy pane downloads nothing, so a banner
// marked data-rf-menu-banner inside a data-rf-menu-pane isn't counted.
test('a menu pane banner showing a card\'s photo isn\'t counted inside a pane, and is unmarked or outside one', async () => {
    const banner = await renderPartial('components/reelflies/menu-banner', {
        rf_image: { data: 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/{:size}/i/dry-flies__36885.original.jpg', alt: '' },
    });
    assert.match(banner, /data-rf-menu-banner/);
    const home = await homePage();
    const withMenu = { ...home, html: home.html.replace(`<header>${LOGO}`, `<header>${LOGO}<nav id="menu"><div data-rf-menu-pane>${banner}</div></nav>`) };
    assert.deepEqual(repeatedPhotos(withMenu.html), []);
    assert.deepEqual(failures(withMenu, photoOnce), []);
    const problems = repeatedPhotos(withMenu.html.replace(' data-rf-menu-banner', ''));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^the photo i\/dry-flies__36885\.original\.jpg appears twice/);
    // Only inside a pane: with the pane still in the menu, the same marked <img> in the page body
    // counts (rf/spec on #58, minor 1; rf/standards on #58 round 2, minor 1).
    const inBody = withMenu.html.replace('<div data-content-region="home_below_top_products">', `${banner}<div data-content-region="home_below_top_products">`);
    const bodyProblems = repeatedPhotos(inBody);
    assert.equal(bodyProblems.length, 1);
    assert.match(bodyProblems[0], /^the photo i\/dry-flies__36885\.original\.jpg appears twice/);
});

// A pane's markup is replaced as text, never read as a replacement pattern (rf/standards on #58
// round 2, minor 2): a "$&" in a category name doesn't put the banner back.
test('a pane whose text holds "$&" or "$\'" still has its banner left out', async () => {
    const banner = await renderPartial('components/reelflies/menu-banner', {
        rf_image: { data: 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/{:size}/i/dry-flies__36885.original.jpg', alt: '' },
    });
    const home = await homePage();
    for (const name of ['Flies $&amp; Gear', 'Cost $&#x27;s', 'Pay $$ less']) {
        const html = home.html.replace(`<header>${LOGO}`, () => `<header>${LOGO}<nav id="menu"><div data-rf-menu-pane><h2>${name}</h2>${banner}</div></nav>`);
        assert.deepEqual(repeatedPhotos(html), [], name);
    }
});

// A pane banner served as a <picture> goes with its <source> elements, which would otherwise
// attach to the next <img> on the page (rf/skeptic on #58 round 2, minor 1).
test('a pane banner inside a <picture> goes with its sources', async () => {
    const home = await homePage();
    const picture = '<picture><source srcset="https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/640w/i/dry-flies__36885.original.jpg 640w" media="(min-width: 801px)">'
        + '<img src="https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil/320w/i/dry-flies__36885.original.jpg" alt="" data-rf-menu-banner></picture>';
    const html = home.html.replace(`<header>${LOGO}`, () => `<header>${LOGO}<nav id="menu"><div data-rf-menu-pane><h2>Dry Flies</h2>${picture}</div></nav>`);
    assert.deepEqual(repeatedPhotos(html), []);
    assert.ok(!photosOn(html).some(photo => photo.keys.includes('i/dry-flies__36885.original.jpg') && /rf-hero/.test(photo.raw)), 'no source lands on the hero');
});

test('lazy-loaded photos count too, and a photo inside a comment or a script doesn\'t', () => {
    const img = 'https://cdn11.bigcommerce.com/s-x/images/stencil/320w/products/1/2/fly.jpg';
    assert.equal(repeatedPhotos(`<img src="${img}"><img data-src="${img.replace('320w', '640w')}">`).length, 1);
    assert.deepEqual(repeatedPhotos(`<img src="${img}"><!-- <img src="${img}"> --><script>var a = '<img src="${img}">';</script>`), []);
});
