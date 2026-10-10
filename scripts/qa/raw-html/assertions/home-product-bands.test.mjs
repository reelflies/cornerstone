// Tests the home product bands' assertion (ticket 48), home-product-bands, on home pages built
// from the widgets' own renders (the tiles, then best sellers and the Signature band in
// home_below_top_products), with each promise broken once. It judges only the page, so a page
// without the bands passes.
//
//   node --test scripts/qa/raw-html/assertions/home-product-bands.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import bands, { productBandsProblems } from './home-product-bands.mjs';
import cardsTiles from './home-cards-tiles.mjs';
import photoOnce from './home-photo-once.mjs';
import nothingBetween from './home-nothing-between.mjs';

const fixture = (name, file = 'default') => readFixture(path.join(WIDGETS_DIR, name, 'fixtures', `${file}.json`));
const wrap = html => `<div data-widget-id="w" data-placement-id="p" data-placement-status="ACTIVE">${html}</div>`;
const rendered = {
    tiles: await renderWidget('link-tiles', fixture('link-tiles')),
    best: await renderWidget('best-sellers', fixture('best-sellers')),
    signature: await renderWidget('signature-band', fixture('signature-band')),
};

// A home page as stencil start serves it, with the widgets in home_below_top_products in
// placement order.
function homePage({ tiles = rendered.tiles, best = rendered.best, signature = rendered.signature } = {}) {
    const region = [tiles, best, signature].filter(Boolean).map(wrap).join('');
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: '<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header><div class="header-logo"><a href="/">ReelFlies</a></div></header><main class="body" id="main-content">'
            + `<div class="container"><div class="main full"><div data-content-region="home_below_top_products">${region}</div></div></div></main></body></html>`,
    };
}

const failures = (page, assertion) => checkPage(page, [assertion]).filter(result => result.status === 'fail');

test('it is registered, for the home page only', async () => {
    const ids = (await loadAssertions()).map(assertion => assertion.id);
    assert.ok(ids.includes(bands.id));
    assert.deepEqual(bands.pages, ['home']);
    assert.equal(bands.id, 'home-product-bands');
});

test('both bands as the widgets render them pass, beside the tiles, and so do the other home checks', () => {
    const page = homePage();
    assert.deepEqual(productBandsProblems(page.html), []);
    for (const assertion of [bands, cardsTiles, photoOnce, nothingBetween]) assert.deepEqual(failures(page, assertion), [], assertion.id);
});

test('a page without either band passes: the widgets aren\'t placed yet, or are unpublished', () => {
    assert.deepEqual(productBandsProblems(homePage({ best: '', signature: '' }).html), []);
    assert.deepEqual(productBandsProblems(homePage({ best: '' }).html), []);
    assert.deepEqual(productBandsProblems(homePage({ signature: '' }).html), []);
});

test('a band without its H2, or the Signature band before best sellers, fails', () => {
    const noHeading = rendered.best.replace(/<h2 class="rf-home-band__heading"([^>]*)>Best sellers<\/h2>/, '<p class="rf-home-band__heading"$1>Best sellers</p>');
    assert.deepEqual(productBandsProblems(homePage({ best: noHeading }).html), ['the best-sellers band has no <h2>: each band\'s heading is an H2 (story 68)']);
    const h3 = rendered.signature.replace(/<h2 (class="rf-home-band__heading[^"]*"[^>]*)>([^<]*)<\/h2>/, '<h3 $1>$2</h3>');
    assert.match(productBandsProblems(homePage({ signature: h3 }).html)[0], /the signature band has no <h2>/);
    const swapped = homePage({ best: rendered.signature, signature: rendered.best });
    assert.deepEqual(productBandsProblems(swapped.html), ['the bands are out of order: best sellers comes before the Signature band (placements 20 and 30)']);
});

test('a card with a button, a second link or no href fails, naming the card', () => {
    const withAdd = rendered.best.replace('<h3 class="rf-product-card__name">Elk Hair Caddis Tan</h3>', '<h3 class="rf-product-card__name">Elk Hair Caddis Tan</h3><button type="button">+ Add</button>');
    assert.deepEqual(productBandsProblems(homePage({ best: withAdd }).html), ['best-sellers card 3 (Elk Hair Caddis Tan) has <button> inside its link: each card is one link to its product page, with no "+ Add"']);
    const addOutside = rendered.best.replace('</ul>', '<li><button type="button" class="rf-quick-add">+ Add</button></li></ul>');
    assert.deepEqual(productBandsProblems(homePage({ best: addOutside }).html), ['the best-sellers band has <button>: its cards are links only, with no "+ Add"']);
    const noHref = rendered.signature.replace('href="/reel-egg-nuke/"', 'href=""');
    assert.deepEqual(productBandsProblems(homePage({ signature: noHref }).html), ['signature card 4 (Reel Egg Nuke) links to "", not a page']);
});

test('a card photo that isn\'t a lazy server-rendered <img> with alt="", srcset, sizes and dimensions fails', () => {
    const eager = rendered.best.replace(' alt="" loading="lazy" />', ' alt="" fetchpriority="high" />');
    assert.deepEqual(productBandsProblems(homePage({ best: eager }).html), [
        'best-sellers card 1 (Adams Parachute Dry Fly)\'s <img> has fetchpriority="high": both bands sit below the first screen (SEO-8)',
        'best-sellers card 1 (Adams Parachute Dry Fly)\'s <img> isn\'t loading="lazy": both bands sit below the first screen (SEO-8)',
    ]);
    const bare = rendered.signature.replace(/ srcset="[^"]*reel-leech[^"]*" sizes="[^"]*" width="600" height="400"/, '');
    assert.deepEqual(productBandsProblems(homePage({ signature: bare }).html), ['srcset', 'sizes', 'width', 'height']
        .map(name => `signature card 1 (Black Reel Egg Sucking Leech)'s <img> has no ${name}`));
    const lazySizes = rendered.best.replace(/<img class="rf-product-card__img" src="([^"]*)"/, '<img class="rf-product-card__img lazyload" data-src="$1"');
    assert.deepEqual(productBandsProblems(homePage({ best: lazySizes }).html), ['best-sellers card 1 (Adams Parachute Dry Fly)\'s <img> has no src']);
    const alt = rendered.best.replace(' alt="" loading', ' alt="Adams Parachute" loading');
    assert.deepEqual(productBandsProblems(homePage({ best: alt }).html), ['best-sellers card 1 (Adams Parachute Dry Fly)\'s <img> needs alt="": the card\'s name says what it is']);
});

test('the Signature button must be a link to the ReelFlies brand listing, with no number in its label', () => {
    const elsewhere = rendered.signature.replace('href="/brands/ReelFlies.html"', 'href="/reelflies-signature-flies/"');
    assert.deepEqual(productBandsProblems(homePage({ signature: elsewhere }).html), ['the Signature band\'s button links to "/reelflies-signature-flies/", not the ReelFlies brand listing /brands/ReelFlies.html (ticket 36)']);
    const counted = rendered.signature.replace('>See all ReelFlies originals</a>', '>Shop 355 signature patterns</a>');
    assert.deepEqual(productBandsProblems(homePage({ signature: counted }).html), ['the Signature band\'s button says "Shop 355 signature patterns": a label carries no number (HOME-4)']);
    const asButton = rendered.signature.replace(/<a class="rf-signature__button" href="[^"]*">([^<]*)<\/a>/, '<button class="rf-signature__button">$1</button>');
    assert.deepEqual(productBandsProblems(homePage({ signature: asButton }).html), [
        'the signature band has <button>: its cards are links only, with no "+ Add"',
        'the Signature band has no button link (a.rf-signature__button) to the ReelFlies brand listing',
    ]);
});
