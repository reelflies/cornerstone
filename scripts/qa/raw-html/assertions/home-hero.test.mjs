// Tests the home page's hero assertions (ticket 46): home-hero and home-one-h1, on home pages
// built from the hero widget's own render, with the stock logo <h1> and with ticket 27's <div>.
//
//   node --test scripts/qa/raw-html/assertions/home-hero.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import hero, { heroExpectation, heroHtml, heroProblems } from './home-hero.mjs';
import oneH1 from './home-one-h1.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-home-hero-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const fixture = readFixture(path.join(WIDGETS_DIR, 'home-lead', 'fixtures', 'default.json'));
const STOCK_LOGO = '<h1 class="header-logo header-logo--center"><a href="/" class="header-logo__link"><img src="/logo.png" alt="ReelFlies.ca"></a></h1>';
const DIV_LOGO = '<div class="header-logo header-logo--center"><a href="/" class="header-logo__link" aria-label="ReelFlies home"><img src="/logo.png" alt="ReelFlies home"></a></div>';

// A home page as stencil start serves it: the header, then the home_below_menu region with the
// widget in the store's wrapper.
async function homePage({ logo = DIV_LOGO, configuration = {}, widget } = {}) {
    const html = widget ?? await renderWidget('home-lead', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
    const region = `<div data-content-region="home_below_menu"><div data-layout-id="x"><div data-widget-id="w" data-placement-id="p" data-placement-status="ACTIVE">${html}</div></div></div>`;
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: `<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title><script>var hero = '<div class="rf-hero">';</script></head><body><header>${logo}</header><div class="body" id="main-content">${region}<div class="container"></div></div></body></html>`,
    };
}

test('both are registered, for the home page only', async () => {
    const ids = (await loadAssertions()).map(assertion => assertion.id);
    for (const id of ['home-hero', 'home-one-h1']) assert.ok(ids.includes(id), id);
    for (const assertion of [hero, oneH1]) assert.deepEqual(assertion.pages, ['home']);
});

test('the hero as the widget renders it passes, with the logo as a <div> (ticket 27)', async () => {
    const page = await homePage();
    assert.deepEqual(heroProblems(page.html, 'active'), []);
    assert.deepEqual(oneH1.check(page), []);
    const results = checkPage(page, [hero, oneH1]);
    assert.deepEqual(results.filter(result => result.status === 'fail'), []);
});

test('with the stock logo <h1> the home page has two, which is why the hero waits for ticket 27', async () => {
    assert.deepEqual(oneH1.check(await homePage({ logo: STOCK_LOGO })), ['the home page has 2 <h1> elements, not 1']);
});

test('the hero is found by its element, never by text in a script or a comment', async () => {
    const page = await homePage();
    const found = heroHtml(page.html);
    assert.match(found, /^<div class="rf-hero">/);
    assert.match(found, /<\/div>$/);
    assert.ok(found.includes('rf-hero__actions'));
    assert.equal(heroHtml('<script>var x = \'<div class="rf-hero">\';</script><!-- <div class="rf-hero"> -->'), null);
});

test('each broken promise of the hero is named', async () => {
    const cases = [
        [{ widget: (await renderWidget('home-lead', fixture)).replace(/ srcset="[^"]*"/, '') }, /srcset has no 320w, 480w, 640w, 960w, 1280w, 1600w/],
        [{ widget: (await renderWidget('home-lead', fixture)).replace(/ sizes="[^"]*"/, '') }, /no sizes/],
        [{ widget: (await renderWidget('home-lead', fixture)).replace(/ width="1600"/, '') }, /no width/],
        [{ widget: (await renderWidget('home-lead', fixture)).replace(/ fetchpriority="high"/, ' loading="lazy"') }, /isn't fetchpriority="high"[\s\S]*lazy[\s\S]*0 fetchpriority="high" elements/],
        [{ widget: (await renderWidget('home-lead', fixture)).replace('<div class="rf-hero__copy">', '<div class="rf-hero__copy"><img src="/x.jpg" fetchpriority="high">') }, /2 <img> elements[\s\S]*2 fetchpriority="high"/],
        [{ widget: (await renderWidget('home-lead', fixture)).replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '') }, /0 <h1> with text/],
        [{ configuration: { primary_url: '' } }, /1 button links with a real href, not 2/],
        [{ widget: (await renderWidget('home-lead', fixture)).replace(/<a class="rf-hero__button rf-hero__button--secondary"[^>]*>([^<]*)<\/a>/, '<button class="rf-hero__button">$1</button>') }, /1 button links[\s\S]*<button>/],
    ];
    for (const [options, expected] of cases) {
        const problems = heroProblems((await homePage(options)).html, 'unplaced'); // eslint-disable-line no-await-in-loop
        assert.match(problems.join('\n'), expected);
    }
});

test('a hero recorded active must be on the page, and one recorded inactive must not', async () => {
    const without = (await homePage({ widget: '' })).html;
    assert.match(heroProblems(without, 'active').join('\n'), /records the hero placed and active, and the home page has no \.rf-hero/);
    assert.deepEqual(heroProblems(without, 'inactive'), []);
    assert.deepEqual(heroProblems(without, 'unplaced'), []);
    assert.match(heroProblems((await homePage()).html, 'inactive').join('\n'), /records the hero unpublished \(inactive\), and the home page still has it/);
});

test('the expectation follows the channel\'s file in widgets/home-lead/channels/', () => {
    const write = (channel, data) => {
        fs.mkdirSync(path.join(tmp, 'home-lead', 'channels'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'home-lead', 'channels', `${channel}.json`), JSON.stringify(data));
    };
    const uuid = 'e1e1e1e1-1234-4abc-8def-0123456789ab';
    write(1, { placement: { status: 'active' }, uuids: { placement: null } });
    write(2, { placement: { status: 'active' }, uuids: { placement: uuid } });
    write(3, { placement: { status: 'inactive' }, uuids: { placement: uuid } });
    assert.equal(heroExpectation(1, tmp), 'unplaced');
    assert.equal(heroExpectation(2, tmp), 'active');
    assert.equal(heroExpectation(3, tmp), 'inactive');
    assert.equal(heroExpectation(4, tmp), 'no-file');
});
