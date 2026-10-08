// Tests the home page's hero assertions (ticket 46): home-hero and home-one-h1, on home pages
// built from the hero widget's own render, with the stock logo <h1> and with ticket 27's <div>,
// and with the hero on the page or not. Both judge only the page: whether the store has the hero
// placed is the sync's check (widgets-sync.mjs --verify), so a widget write on 1895766 never
// fails anyone's gate (build pipeline, section 6.6).
//
//   node --test scripts/qa/raw-html/assertions/home-hero.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import hero, { heroHtml, heroProblems } from './home-hero.mjs';
import oneH1 from './home-one-h1.mjs';

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

test('without the hero, home may have no <h1> (ticket 27\'s branch) or one (the stock logo today), never two', async () => {
    assert.deepEqual(oneH1.check(await homePage({ widget: '' })), [], 'the logo as a <div> and the hero not placed: 0 <h1>');
    assert.deepEqual(oneH1.check(await homePage({ logo: STOCK_LOGO, widget: '' })), [], 'the stock logo <h1>: 1');
    assert.deepEqual(oneH1.check(await homePage({ logo: `${STOCK_LOGO}<h1>Welcome</h1>`, widget: '' })), ['the home page has 2 <h1> elements, not at most 1']);
});

test('with the hero on the page, its heading is the only <h1>, which is why the hero goes active only after ticket 27', async () => {
    assert.deepEqual(oneH1.check(await homePage({ logo: STOCK_LOGO })), ['the home page has 2 <h1> elements, not 1: with the hero on it, the hero\'s heading is the only <h1>']);
    const headless = (await renderWidget('home-lead', fixture)).replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
    assert.deepEqual(oneH1.check(await homePage({ logo: STOCK_LOGO, widget: headless })), ['the home page\'s one <h1> isn\'t in the hero: with the hero on it, the hero\'s heading is the <h1>']);
    assert.deepEqual(oneH1.check(await homePage({ widget: headless })), ['the home page has 0 <h1> elements, not 1: with the hero on it, the hero\'s heading is the only <h1>']);
});

test('the <h1> count ignores comments and the text of scripts', async () => {
    const page = await homePage({ widget: '' });
    page.html = page.html.replace('</head>', '<script>var h = "<h1>x</h1>";</script></head><!-- <h1>old</h1> -->');
    assert.deepEqual(oneH1.check(page), []);
});

test('the hero is found by its element, never by text in a script or a comment', async () => {
    const page = await homePage();
    const found = heroHtml(page.html);
    assert.match(found, /^<div class="rf-hero">/);
    assert.match(found, /<\/div>$/);
    assert.ok(found.includes('rf-hero__actions'));
    assert.equal(heroHtml('<script>var x = \'<div class="rf-hero">\';</script><!-- <div class="rf-hero"> -->'), null);
    // The class as a whole word, anywhere in the list, and the <div> to its own end tag.
    assert.equal(heroHtml('<div class="rf-hero__media"><div class="x rf-hero y"><div></div></div><p>after</p></div>'), '<div class="x rf-hero y"><div></div></div>');
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
        const problems = heroProblems((await homePage(options)).html); // eslint-disable-line no-await-in-loop
        assert.match(problems.join('\n'), expected);
    }
});

test('the gate checks the hero whenever the page has it, and never asks the store\'s state', async () => {
    const without = await homePage({ widget: '' });
    assert.deepEqual(heroProblems(without.html), [], 'no hero on the page: nothing to check');
    assert.deepEqual(hero.check(without), []);
    assert.deepEqual(hero.check(await homePage()), []);
    assert.equal(hero.check.length, 1, 'check(page) takes the page and nothing else');
    assert.equal(heroProblems.length, 1, 'heroProblems(html) takes the page\'s HTML and nothing else');
});
