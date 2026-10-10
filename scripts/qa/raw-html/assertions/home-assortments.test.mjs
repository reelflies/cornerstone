// Tests the Assortments band's raw-HTML assertion (ticket 49): home-assortments, on home pages
// built from the widgets' own renders (the tiles, ticket 48's two bands, the Species section, the
// Assortments band and the About block in home_below_top_products, in placement order), with each
// promise broken once. It judges only the page, so a page without the band passes. The band's
// cards are ticket 48's home-product-bands' to check (one link each, the lazy photo, no "+ Add").
//
//   node --test scripts/qa/raw-html/assertions/home-assortments.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import assortments, { assortmentsProblems } from './home-assortments.mjs';
import { productBandsProblems } from './home-product-bands.mjs';

const fixture = (name, which = 'default') => readFixture(path.join(WIDGETS_DIR, name, 'fixtures', `${which}.json`));
const render = (name, which) => renderWidget(name, fixture(name, which));
const ORDER = ['link-tiles', 'best-sellers', 'signature-band', 'shop-by-fish', 'assortments-band', 'about'];
let widgetId = 0;
const wrap = html => {
    widgetId += 1;
    return `<div data-widget-id="w${widgetId}" data-placement-id="p${widgetId}" data-placement-status="ACTIVE">${html}</div>`;
};

// A home page as stencil start serves it, with the widgets in home_below_top_products in
// placement order (or `order`), each rendered from its default fixture unless `parts` gives it.
async function homePage({ parts = {}, order = ORDER } = {}) {
    const below = [];
    for (const name of order) below.push(name in parts ? parts[name] : await render(name)); // eslint-disable-line no-await-in-loop
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: '<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header></header><main class="body" id="main-content">'
            + `<div class="container"><div class="main full"><div data-content-region="home_below_top_products">${below.filter(Boolean).map(wrap).join('')}</div></div></div></main></body></html>`,
    };
}

const failures = page => checkPage(page, [assortments]).filter(result => result.status === 'fail');

test('it is registered, for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-assortments'));
    assert.deepEqual(assortments.pages, ['home']);
    assert.equal(assortments.ticket, 49);
});

test('the band as the widget renders it passes, after ticket 48\'s bands and the Species section and before About, and ticket 48\'s card checks pass on it', async () => {
    const page = await homePage();
    assert.deepEqual(assortmentsProblems(page.html), []);
    assert.deepEqual(failures(page), []);
    assert.deepEqual(productBandsProblems(page.html), []);
    for (const which of ['sold-out', 'two-left', 'one-left', 'empty']) {
        assert.deepEqual(assortmentsProblems((await homePage({ parts: { 'assortments-band': await render('assortments-band', which) } })).html), [], which); // eslint-disable-line no-await-in-loop
    }
});

test('a page without the band passes: the widget isn\'t placed yet, or is unpublished', async () => {
    assert.deepEqual(assortmentsProblems((await homePage({ parts: { 'assortments-band': '' } })).html), []);
    assert.deepEqual(assortmentsProblems((await homePage({ order: ['link-tiles', 'assortments-band'] })).html), []);
});

test('the band has one <h2>, which names it', async () => {
    const band = await render('assortments-band');
    const twoH2 = band.replace('</section>', '<h2>More selections</h2></section>');
    assert.deepEqual(assortmentsProblems(twoH2), ['the Assortments band has 2 <h2> elements: it has exactly one']);
    const noH2 = band.replace(/<h2([^>]*)>/, '<p$1>').replace('</h2>', '</p>');
    assert.deepEqual(assortmentsProblems(noH2), ['the Assortments band has 0 <h2> elements: it has exactly one']);
    const unnamed = band.replace(/aria-labelledby="[^"]*"/, 'aria-labelledby="elsewhere"');
    assert.deepEqual(assortmentsProblems(unnamed), ['the Assortments band is labelled by "elsewhere", not by its <h2>']);
});

test('its copy says the fly boxes are shown for scale and not included (story 18), and types no price or number', async () => {
    const band = await render('assortments-band');
    const silent = band.replace(' Fly boxes are shown for scale and not included.', '');
    assert.deepEqual(assortmentsProblems(silent), ['the Assortments band\'s copy doesn\'t say the fly boxes are not included: its photos show them for scale (story 18)']);
    // Other wordings pass, as long as they say it.
    assert.deepEqual(assortmentsProblems(band.replace('Fly boxes are shown for scale and not included.', 'The fly box in each photo is for scale only and is not included.')), []);
    const priced = band.replace('at one price.', 'from $9.95.');
    assert.deepEqual(assortmentsProblems(priced), ['the Assortments band\'s copy types "$9.95": prices and counts come from the query, never the copy (HOME-4)']);
    const counted = band.replace('Ready-made mixes', 'Over 40 ready-made mixes');
    assert.deepEqual(assortmentsProblems(counted), ['the Assortments band\'s copy types "40": prices and counts come from the query, never the copy (HOME-4)']);
});

test('its link goes to a page, labelled with no number, and never to a hidden size category', async () => {
    const band = await render('assortments-band');
    const gone = band.replace(/<a class="rf-assortments__link"[^>]*>[^<]*<\/a>/, '');
    assert.deepEqual(assortmentsProblems(gone), ['the Assortments band has no link to the Fly Selections & Assortments page (a.rf-assortments__link)']);
    const hash = band.replace('href="/fly-selections-assortments/"', 'href="#"');
    assert.deepEqual(assortmentsProblems(hash), ['the Assortments band\'s link goes to "#", not a page']);
    const sizes = band.replace('href="/fly-selections-assortments/"', 'href="/fly-sizes/14/"');
    assert.deepEqual(assortmentsProblems(sizes), ['the Assortments band\'s link goes to /fly-sizes/14/, a hidden size category (SEO-6)']);
    const counted = band.replace('>Shop fly selections<', '>Shop 48 fly selections<');
    assert.deepEqual(assortmentsProblems(counted), ['the Assortments band\'s link says "Shop 48 fly selections": a label carries no number (HOME-4)']);
});

test('no card shows a unit: an Assortment is priced per set, never "/ fly" (story 18)', async () => {
    const band = await render('assortments-band');
    const unit = band.replace('<span class="rf-product-card__amount">$9.95</span>', '<span class="rf-product-card__amount">$9.95</span> <span class="rf-product-card__unit">/ fly</span>');
    assert.deepEqual(assortmentsProblems(unit), ['Assortments card 2 (Best Sellers Selection - 12 Flies) shows the unit "/ fly": an Assortment is priced per set, with no unit (story 18)']);
});

test('it sits after the Signature band and the Species section and before About, as their placements order them (30, 40, 50 and 70)', async () => {
    const early = await homePage({ order: ['link-tiles', 'best-sellers', 'assortments-band', 'signature-band', 'shop-by-fish', 'about'] });
    assert.deepEqual(assortmentsProblems(early.html), [
        'the Assortments band comes before the Signature band: it follows it (sort_order 50 after 30)',
        'the Assortments band comes before the Species section: it follows it (sort_order 50 after 40)',
    ]);
    const late = await homePage({ order: ['link-tiles', 'best-sellers', 'signature-band', 'shop-by-fish', 'about', 'assortments-band'] });
    assert.deepEqual(assortmentsProblems(late.html), ['the Assortments band comes after the About block: it goes before it (sort_order 50 before 70)']);
    assert.deepEqual(failures(late).map(result => result.status), ['fail']);
});
