// Tests the home page's nothing-between assertion (ticket 47; R5, HOME-3): home-nothing-between,
// on home pages rendered from templates/pages/home.html with the widgets ReelFlies_CA places
// there (render/home-page.mjs), then with something dropped between the cards and the tiles
// where the store could put it: a Page Builder widget in a region between them, one placed
// before the tiles in theirs or after the hero in its, and a shipping message.
//
//   node --test scripts/qa/raw-html/assertions/home-nothing-between.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { homeCases, renderHomePage } from '../../render/home-page.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import nothingBetween, { betweenCardsAndTiles } from './home-nothing-between.mjs';

const TEXT_WIDGET = '<div data-widget-id="pb-text" data-placement-id="pb-text-p" data-placement-status="ACTIVE"><div class="pb-text"><p>Spring sale on now</p></div></div>';
const SPACER_WIDGET = '<div data-widget-id="pb-spacer" data-placement-id="pb-spacer-p" data-placement-status="ACTIVE"><div style="height: 40px"></div></div>';
const homePage = async (options = {}) => ({
    kind: 'home', key: 'home', path: '/', url: 'http://localhost:3301/', status: 200, html: await renderHomePage(homeCases(), { chrome: false, ...options }),
});
// The page with `html` put into a region, before what the widgets put there.
const intoRegion = (html, region, extra) => {
    const open = `<div data-content-region="${region}">`;
    assert.equal(html.split(open).length, 2, `the page has one ${region} region`);
    return html.replace(open, `${open}${extra}`);
};
const failures = page => checkPage(page, [nothingBetween]).filter(result => result.status === 'fail');

test('it is registered for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-nothing-between'));
    assert.deepEqual(nothingBetween.pages, ['home']);
});

test('the home page with the hero, the cards and the tiles as ReelFlies_CA places them passes', async () => {
    const page = await homePage();
    assert.match(page.html, /class="rf-type-cards"/);
    assert.match(page.html, /class="rf-home-tiles"/);
    assert.deepEqual(betweenCardsAndTiles(page.html), []);
    assert.deepEqual(failures(page), []);
});

test('a page without the cards or the tiles passes: the widgets aren\'t placed yet', async () => {
    assert.deepEqual(betweenCardsAndTiles(await renderHomePage([], { chrome: false })), []);
    const cardsOnly = await renderHomePage(homeCases().filter(({ widget }) => widget === 'home-lead'), { chrome: false });
    assert.deepEqual(betweenCardsAndTiles(cardsOnly), []);
});

test('a Page Builder widget between them fails, in either region between or before the tiles in theirs or after the hero in its', async () => {
    const { html } = await homePage();
    for (const region of ['home_below_carousel', 'home_below_featured_products', 'home_below_top_products']) {
        const problems = betweenCardsAndTiles(intoRegion(html, region, TEXT_WIDGET));
        assert.ok(problems.some(problem => problem.includes('data-widget-id="pb-text"')), `${region}: ${problems.join(' | ')}`);
    }
    const afterHero = html.replace(/(<\/ul>\s*<\/div>\s*<\/div>)/, `$1${TEXT_WIDGET}`);
    assert.notEqual(afterHero, html);
    assert.ok(betweenCardsAndTiles(afterHero).some(problem => problem.includes('data-widget-id="pb-text"')));
});

test('a widget that shows no text, such as a spacer, fails too: it still moves the tiles down', async () => {
    const problems = betweenCardsAndTiles(intoRegion((await homePage()).html, 'home_below_top_products', SPACER_WIDGET));
    assert.equal(problems.length, 1, problems.join(' | '));
    assert.match(problems[0], /a widget sits between the Fly Type cards and the tiles: <div data-widget-id="pb-spacer"/);
});

test('a shipping message fails: home.html prints the store\'s shipping messages between them', async () => {
    const page = await homePage({ context: { shipping_messages: [{ message: 'Free shipping on orders over $60' }] } });
    const problems = betweenCardsAndTiles(page.html);
    assert.ok(problems.some(problem => problem.includes('Free shipping on orders over $60')), problems.join(' | '));
    assert.equal(failures(page).length, 1);
});

test('the tiles before the cards fail', () => {
    const html = '<div class="rf-home-tiles"><ul class="rf-link-tiles"></ul></div><ul class="rf-type-cards"></ul>';
    assert.deepEqual(betweenCardsAndTiles(html), ['the tiles (.rf-home-tiles) come before the Fly Type cards (.rf-type-cards) on the home page']);
});
