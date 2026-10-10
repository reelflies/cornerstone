// Tests the hook band's raw-HTML assertion (ticket 49): home-hook-band, on home pages built from
// the widgets' own renders (the tiles, the Species section, the hook band and the About block in
// home_below_top_products), with each promise broken once. It judges only the page, so a page
// without the band passes.
//
//   node --test scripts/qa/raw-html/assertions/home-hook-band.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import hookBand, { hookBandProblems } from './home-hook-band.mjs';

const fixture = name => readFixture(path.join(WIDGETS_DIR, name, 'fixtures', 'default.json'));
const render = name => renderWidget(name, fixture(name));
const wrap = (html, n) => `<div data-widget-id="w${n}" data-placement-id="p${n}" data-placement-status="ACTIVE">${html}</div>`;

// A home page as stencil start serves it, with the widgets in home_below_top_products in
// placement order.
async function homePage({ band } = {}) {
    const below = [await render('link-tiles'), await render('shop-by-fish'), band ?? await render('hook-sizes'), await render('about')]
        .filter(Boolean).map(wrap).join('');
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: '<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header></header><main class="body" id="main-content">'
            + `<div class="container"><div class="main full"><div data-content-region="home_below_top_products">${below}</div></div></div></main></body></html>`,
    };
}

const failures = page => checkPage(page, [hookBand]).filter(result => result.status === 'fail');

test('it is registered, for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-hook-band'));
    assert.deepEqual(hookBand.pages, ['home']);
    assert.equal(hookBand.ticket, 49);
});

test('the band as the widget renders it passes, between the Species section and About', async () => {
    const page = await homePage();
    assert.deepEqual(hookBandProblems(page.html), []);
    assert.deepEqual(failures(page), []);
});

test('a page without the band passes: the widget isn\'t placed yet, is unpublished, or Shaun drops it', async () => {
    const page = await homePage({ band: '' });
    assert.deepEqual(hookBandProblems(page.html), []);
    assert.deepEqual(failures(page), []);
});

test('the band has one <h2>, which names it', async () => {
    const band = await render('hook-sizes');
    const twoH2 = band.replace('</section>', '<h2>More sizes</h2></section>');
    assert.deepEqual(hookBandProblems(twoH2), ['the hook band (Bigger number, smaller hook.) has 2 <h2> elements: it has exactly one']);
    const unnamed = band.replace(/aria-labelledby="[^"]*"/, 'aria-labelledby="elsewhere"');
    assert.deepEqual(hookBandProblems(unnamed), ['the hook band (Bigger number, smaller hook.) is labelled by "elsewhere", not by its <h2>']);
});

test('the gauge is 13 hooks in two rows, 2/0 to 6 then 8 to 20, each linking to its row on the chart page (CD-12, contract 6.9)', async () => {
    const band = await render('hook-sizes');
    const third = band.replace(/(<li class="rf-hook-gauge__item">\s*<a [^>]*#size-18"[\s\S]*?<\/li>)/, '</ol><ol class="rf-hook-gauge__row">$1');
    assert.deepEqual(hookBandProblems(third), ['the hook band\'s gauge has 3 rows of 6, 5, 2 hooks: it has two, 2/0 to 6 then 8 to 20']);
    const missing = band.replace(/<li class="rf-hook-gauge__item">\s*<a [^>]*#size-12"[\s\S]*?<\/li>/, '');
    assert.deepEqual(hookBandProblems(missing), [
        'the hook band\'s gauge has 2 rows of 6, 6 hooks: it has two, 2/0 to 6 then 8 to 20',
        'the hook band\'s gauge shows 2/0, 1/0, 1, 2, 4, 6, 8, 10, 14, 16, 18, 20: it shows 2/0, 1/0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, in that order',
    ]);
    const wrongRow = band.replace('href="/fly-hook-size-chart/#size-14"', 'href="/fly-hook-size-chart/#size-16"');
    assert.deepEqual(hookBandProblems(wrongRow), ['the hook band\'s hook 14 links to /fly-hook-size-chart/#size-16, not its row /fly-hook-size-chart/#size-14']);
});

test('each hook is drawn as inline SVG hidden from screen readers, with its size as text, and nothing else inside its link', async () => {
    const band = await render('hook-sizes');
    const shown = band.replace(/(#size-4"[^>]*>\s*<svg[^>]*?) aria-hidden="true"/, '$1');
    assert.deepEqual(hookBandProblems(shown), ['the hook band\'s hook 4 draws its hook without aria-hidden="true": the size text carries it']);
    const sprite = band.replace(/(#size-6"[^>]*>\s*)<svg[\s\S]*?<\/svg>/, '$1<svg aria-hidden="true"><use href="#icon-hook"></use></svg>');
    assert.deepEqual(hookBandProblems(sprite), ['the hook band\'s hook 6 draws its hook from a sprite (<use>): it is drawn inline, whole on any theme']);
    const image = band.replace(/(#size-8"[^>]*>\s*)<svg[\s\S]*?<\/svg>/, '$1<img src="/hook-8.png" alt="" />');
    assert.deepEqual(hookBandProblems(image), ['the hook band\'s hook 8 has no inline <svg> hook', 'the hook band\'s hook 8 has <img> inside its link: only its drawing and its size']);
});

// SEO-6 and UX-16: the band never links to a hidden "All Flies" category, a "Flies in size N"
// listing or a hand-built facet URL; the chart page's rows carry the facet links.
test('every link in the band goes to the chart page: none to a size category, a size listing or a facet URL (SEO-6, UX-16)', async () => {
    const band = await render('hook-sizes');
    const facet = band.replace('href="/fly-hook-size-chart/#size-10"', 'href="/dry-flies/?Fly+Sizes=10"');
    assert.deepEqual(hookBandProblems(facet), [
        'the hook band\'s hook 10 links to /dry-flies/?Fly+Sizes=10, not its row /fly-hook-size-chart/#size-10',
        'the hook band links to /dry-flies/?Fly+Sizes=10: every link in it goes to the chart page, /fly-hook-size-chart/ (SEO-6, UX-16)',
    ]);
    const listing = band.replace(/href="\/fly-hook-size-chart\/"/, 'href="/fly-sizes/"');
    assert.deepEqual(hookBandProblems(listing), [
        'the hook band links to /fly-sizes/: every link in it goes to the chart page, /fly-hook-size-chart/ (SEO-6, UX-16)',
        'the hook band has no text link to the chart page outside its gauge',
    ]);
});

test('the band has a text link to the chart page beside its gauge, and its gauge at all', async () => {
    const band = await render('hook-sizes');
    const noText = band.replace(/<a class="rf-hook-band__link"[^>]*>[\s\S]*?<\/a>/, '');
    assert.deepEqual(hookBandProblems(noText), ['the hook band has no text link to the chart page outside its gauge']);
    const noGauge = band.replace(/<div class="rf-hook-gauge [\s\S]*<\/div>\s*<\/div>\s*<\/section>/, '</div></section>');
    assert.deepEqual(hookBandProblems(noGauge), ['the hook band has no gauge (div.rf-hook-gauge--band)']);
});
