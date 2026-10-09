// Tests the strip-every-page assertion (ticket 27's follow-up) and the harness's cross-page
// checks (checkAll), on the fixture page with and without the shipping strip in its region.
//
//   node --test scripts/qa/raw-html/assertions/strip-every-page.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, checkPages, loadAssertions } from '../../raw-html.mjs';
import stripEveryPage from './strip-every-page.mjs';

const FIXTURE = fs.readFileSync(path.resolve('scripts/qa/raw-html/fixtures/good-product.html'), 'utf8');
const EMPTY_REGION = '<div data-content-region="header_bottom--global"></div>';
const STRIP = '<div data-widget-id="w1"><div class="rf-strip" data-rf-strip><p>Free standard shipping</p></div></div>';

// A pinned page as the harness fetched it, with `strips` copies of the strip in its region.
const page = (key, strips = 1, status = key === '404' ? 404 : 200) => ({
    key,
    kind: key,
    path: `/${key}`,
    url: `http://localhost:3301/${key}`,
    status,
    html: FIXTURE.replace(EMPTY_REGION, `<div data-content-region="header_bottom--global">${STRIP.repeat(strips)}</div>`),
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
    assert.deepEqual(stripEveryPage.check(page('cart', 2)), ['the shipping strip shows 2 times: a placement per template file shows once on its own page, so two mean a global region shows each placement everywhere (docs/widgets.md)']);
    assert.deepEqual(failedIds(checkPage(page('cart', 2), [stripEveryPage])), ['strip-every-page']);
});

test('the strip on every pinned page, or on none, passes; on some only fails, naming the pages without it', () => {
    const keys = ['home', 'cart', 'brand', '404', 'login'];
    assert.deepEqual(stripEveryPage.checkAll(keys.map(key => page(key, 1))), []);
    assert.deepEqual(stripEveryPage.checkAll(keys.map(key => page(key, 0))), []);
    const homeOnly = keys.map(key => page(key, key === 'home' ? 1 : 0));
    assert.deepEqual(stripEveryPage.checkAll(homeOnly), [
        'the shipping strip is on home but not on cart /cart, brand /brand, 404 /404, login /login: place it on each page\'s template file (widgets/shipping-strip/channels/<channel>.json, template_files)',
    ]);
});

test('the harness runs checkAll once on the pages each assertion applies to that rendered as their template', () => {
    const pages = [page('home', 1), page('cart', 0), page('brand', 0, 500)];
    const [all] = checkPages(pages, [stripEveryPage]);
    assert.equal(all.status, 'fail');
    assert.match(all.problems[0], /on home but not on cart \/cart:/, 'a page that didn\'t render is left to page-renders');
    // The 404 page is left out: stencil start never fills its regions (pages/errors/* has no page type there).
    assert.equal(result(checkPages([page('home', 1), page('404', 0)], [stripEveryPage])).status, 'pass');
    const onlyHome = { ...stripEveryPage, pages: ['home'] };
    assert.equal(result(checkPages(pages, [onlyHome])).status, 'pass');
    assert.equal(result(checkPages([page('cart', 0, 500)], [stripEveryPage])).status, 'skip');
    const perPageOnly = { id: 'x', description: 'x', check: () => [] };
    assert.deepEqual(checkPages(pages, [perPageOnly]), [], 'an assertion without checkAll has no cross-page result');
});
