// Tests the strip-every-page assertion (ticket 27's follow-up) and the harness's cross-page
// checks (checkAll), on pages built with the redesign's utility strip (components/reelflies/
// strip.html) none, once or twice.
//
//   node --test scripts/qa/raw-html/assertions/strip-every-page.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, checkPages, loadAssertions } from '../../raw-html.mjs';
import stripEveryPage from './strip-every-page.mjs';

const STRIP = '<div class="rf-strip" role="region" aria-label="Store"><div class="rf-strip__inner"><p class="rf-strip__ship">Free shipping in Canada on fly orders over <span class="rf-num">$60</span></p></div></div>';
// A region that isn't the strip, and a strip-like class without the region role, which don't count.
const OTHERS = '<div class="rf-strip__inner">not the strip</div><div class="rf-head" role="region" aria-label="Header"></div>';

// A pinned page as the harness fetched it, with `strips` copies of the strip above the header.
const page = (key, strips = 1, status = key === '404' ? 404 : 200, origin = 'http://localhost:3301') => ({
    key,
    kind: key,
    path: `/${key}`,
    url: `${origin}/${key}`,
    status,
    html: `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><a class="skip-to-main-link" href="#main-content">Skip to main content</a>${STRIP.repeat(strips)}${OTHERS}<header class="rf-head" data-rf-head></header><main id="main-content"><h1>${key}</h1></main></body></html>`,
});
const result = (results, id = 'strip-every-page') => results.find(item => item.id === id);
const failedIds = results => results.filter(item => item.status === 'fail').map(item => item.id);

test('the assertion is registered, with a per-page and a cross-page check', async () => {
    const assertions = await loadAssertions();
    const found = assertions.find(assertion => assertion.id === 'strip-every-page');
    assert.ok(found, 'strip-every-page is registered');
    assert.equal(found.ticket, 27);
    assert.equal(typeof found.check, 'function');
    assert.equal(typeof found.checkAll, 'function');
});

test('a page shows the strip once at most: a second copy fails', () => {
    assert.deepEqual(stripEveryPage.check(page('cart', 0)), []);
    assert.deepEqual(stripEveryPage.check(page('cart', 1)), []);
    assert.deepEqual(stripEveryPage.check(page('cart', 2)), ['the utility strip shows 2 times: the header\'s hook renders it once, so two mean a template includes the hook twice or draws its own (components/reelflies/strip.html)']);
    assert.deepEqual(failedIds(checkPage(page('cart', 2), [stripEveryPage])), ['strip-every-page']);
});

test('the strip on every pinned page, or on none, passes; on some only fails, naming the pages without it', () => {
    const keys = ['home', 'cart', 'brand', '404', 'login', 'species-hub'];
    assert.deepEqual(stripEveryPage.checkAll(keys.map(key => page(key, 1))), []);
    assert.deepEqual(stripEveryPage.checkAll(keys.map(key => page(key, 0))), []);
    const homeOnly = keys.map(key => page(key, key === 'home' ? 1 : 0));
    assert.deepEqual(stripEveryPage.checkAll(homeOnly), [
        'the utility strip is on home but not on cart /cart, brand /brand, 404 /404, login /login, species-hub /species-hub: every page template renders the header\'s hook (components/common/header.html), which draws it',
    ]);
});

test('the 404 page and a custom template\'s pin count like any other, on a local server too', () => {
    // The strip is the theme's, so a local stencil start renders it as the store does: a 404 page
    // or a custom-template pin without it is a page missing the header's hook, wherever it rendered.
    assert.equal(result(checkPages([page('home', 1), page('404', 0)], [stripEveryPage])).status, 'fail');
    assert.equal(result(checkPages([page('home', 1), page('species-hub', 0)], [stripEveryPage])).status, 'fail');
    assert.equal(result(checkPages([page('home', 1), page('404', 1), page('species-hub', 1)], [stripEveryPage])).status, 'pass');
});

test('the harness runs checkAll once on the pages each assertion applies to that rendered as their template', () => {
    const pages = [page('home', 1), page('cart', 0), page('brand', 0, 500)];
    const [all] = checkPages(pages, [stripEveryPage]);
    assert.equal(all.status, 'fail');
    assert.match(all.problems[0], /on home but not on cart \/cart:/, 'a page that didn\'t render is left to page-renders');
    const onlyHome = { ...stripEveryPage, pages: ['home'] };
    assert.equal(result(checkPages(pages, [onlyHome])).status, 'pass');
    assert.equal(result(checkPages([page('cart', 0, 500)], [stripEveryPage])).status, 'skip');
    const perPageOnly = { id: 'x', description: 'x', check: () => [] };
    assert.deepEqual(checkPages(pages, [perPageOnly]), [], 'an assertion without checkAll has no cross-page result');
});
