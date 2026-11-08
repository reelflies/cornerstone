// Tests the stone's assertions (redesign step 2; ticket 46's hero rules): home-hero and
// home-one-h1, on the redesign's home page rendered from fixed data (../home-fixture.mjs), with
// each promise broken once. Both judge only the page.
//
//   node --test scripts/qa/raw-html/assertions/home-hero.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { homePage } from '../home-fixture.mjs';
import hero, { stoneHtml, stoneProblems } from './home-hero.mjs';
import oneH1, { oneH1Problems } from './home-one-h1.mjs';

const page = await homePage();
const failures = (fixture, assertion) => checkPage(fixture, [assertion]).filter(result => result.status === 'fail');
// The page with `from` (a string or a RegExp the fixture matches) replaced once by `to`.
function edited(from, to, html = page.html) {
    assert.ok(typeof from === 'string' ? html.includes(from) : from.test(html), `the fixture has ${from}`);
    return { ...page, html: html.replace(from, to) };
}
const STONE_IMG = /<img class="rf-graded" src="[^"]*hero-stone-1600\.jpg" width="1600" height="700" alt="" fetchpriority="high" decoding="async">/;

test('both are registered, for the home page only', async () => {
    const ids = (await loadAssertions()).map(assertion => assertion.id);
    for (const assertion of [hero, oneH1]) {
        assert.ok(ids.includes(assertion.id), assertion.id);
        assert.deepEqual(assertion.pages, ['home']);
    }
});

test('the home page as the theme renders it passes both', () => {
    assert.deepEqual(stoneProblems(page.html), []);
    assert.deepEqual(oneH1Problems(page.html), []);
    for (const assertion of [hero, oneH1]) assert.deepEqual(failures(page, assertion), [], assertion.id);
    assert.equal(hero.check.length, 1, 'check(page) takes the page and nothing else');
});

test('the stone is found by its element, never by text in a script or a comment', () => {
    const found = stoneHtml(page.html);
    assert.match(found, /^<section class="rf-stone"/);
    assert.match(found, /<\/section>$/);
    assert.ok(found.includes('rf-stone__lay'));
    assert.equal(stoneHtml('<script>var x = \'<section class="rf-stone">\';</script><!-- <section class="rf-stone"> -->'), null);
    assert.equal(stoneHtml('<SECTION class=rf-stone><p>x</p></SECTION>'), '<SECTION class=rf-stone><p>x</p></SECTION>');
    assert.equal(stoneHtml('<section data-class="rf-stone"></section>'), null);
});

test('a page without the stone fails: the redesign\'s home opens with it', () => {
    assert.deepEqual(stoneProblems('<main><h1>Flies</h1></main>'), ['the home page has no stone (section.rf-stone): components/reelflies/home.html opens with it']);
});

test('each broken promise of the photograph is named', () => {
    const img = page.html.match(STONE_IMG)[0];
    const cases = [
        [img.replace(' fetchpriority="high"', ''), /isn't fetchpriority="high"[\s\S]*0 fetchpriority="high" elements, not 1/],
        [img.replace(' decoding="async"', ' loading="lazy" decoding="async"'), /is lazy; it must load eagerly/],
        [img.replace(' alt=""', ' alt="A wet stone"'), /needs alt=""/],
        [img.replace(' width="1600"', ''), /no width/],
    ];
    for (const [replacement, expected] of cases) assert.match(stoneProblems(edited(STONE_IMG, replacement).html).join('\n'), expected);
    const twoHigh = edited('<a class="rf-fly__photo"', '<a class="rf-fly__photo" fetchpriority="high"');
    assert.match(stoneProblems(twoHigh.html).join('\n'), /2 fetchpriority="high" elements, not 1/);
    const noSource = edited(/<source media="[^"]*" srcset="[^"]*" width="700" height="1600">/, '');
    assert.match(stoneProblems(noSource.html).join('\n'), /no <source>: the portrait crop/);
    const noMedia = edited(/<source media="[^"]*" /, '<source ');
    assert.match(stoneProblems(noMedia.html).join('\n'), /no media query/);
});

test('the stone is named by its one <h1>', () => {
    const noH1 = edited('<h1 id="rf-stone-title">', '<h2 id="rf-stone-title">');
    noH1.html = noH1.html.replace(/<\/h1>/, '</h2>');
    assert.match(stoneProblems(noH1.html).join('\n'), /0 <h1> with text, not 1/);
    const elsewhere = edited('aria-labelledby="rf-stone-title"', 'aria-labelledby="rf-types-title"');
    assert.deepEqual(stoneProblems(elsewhere.html), ['the stone is labelled by "rf-types-title", not by its <h1>']);
});

test('the ways in are links to pages carrying the hooks home.js reads, and never buttons', () => {
    const anchor = edited('<a class="rf-way" href="/flies/dry-flies/"', '<a class="rf-way" href="#"');
    assert.match(stoneProblems(anchor.html).join('\n'), /way group 1 \(What it is\)'s way "Dry Flies 501" links to "#", not a page/);
    const noHook = edited(' data-rf-way-name="Dry Flies"', '');
    assert.match(stoneProblems(noHook.html).join('\n'), /way "Dry Flies 501" has no data-rf-way \(its category id\) or data-rf-way-name/);
    const button = edited('<div class="rf-ways">', '<div class="rf-ways"><button type="button">Shop all</button>');
    assert.match(stoneProblems(button.html).join('\n'), /1 <button> that isn't a card's "\+ Add": the ways in are links/);
    const untitled = edited('<h2 class="rf-ways__title">What it is</h2>', '');
    assert.match(stoneProblems(untitled.html).join('\n'), /way group 1 has no <h2> title/);
});

test('a page whose menu ids are empty has no ways in, which fails: the stone always offers them', async () => {
    const bare = await homePage({ theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } });
    assert.deepEqual(stoneProblems(bare.html), ['the stone has no ways in (.rf-ways__group): the Fly Types (rf_menu_type_ids) and the Species (rf_menu_species_root_id)']);
    const typesOnly = await homePage({ theme_settings: { rf_menu_species_root_id: '' } });
    assert.deepEqual(stoneProblems(typesOnly.html), []);
});

test('the lay keeps its <h2> label and its "All" link for home.js, and its cards load eagerly', async () => {
    const label = edited('<h2 class="rf-lay__label" data-rf-lay-title>Best sellers</h2>', '<p class="rf-lay__label" data-rf-lay-title>Best sellers</p>');
    assert.deepEqual(stoneProblems(label.html), ['the lay\'s label (data-rf-lay-title) isn\'t an <h2>: home.js rewrites it for a way\'s flies']);
    const noAll = edited(' data-rf-lay-all hidden', ' hidden');
    assert.deepEqual(stoneProblems(noAll.html), ['the lay has no "All" link (a[data-rf-lay-all]) for home.js to fill']);
    const lazy = edited('width="720" height="480" alt="" decoding="async">', 'width="720" height="480" alt="" loading="lazy" decoding="async">');
    assert.match(stoneProblems(lazy.html).join('\n'), /a card on the stone is lazy/);
    const noLay = await homePage({ best: [] });
    assert.ok(!noLay.html.includes('data-rf-lay'), 'no best sellers, no lay');
    assert.deepEqual(stoneProblems(noLay.html), []);
});

test('home-one-h1: the page has exactly one <h1>, the stone\'s', () => {
    const two = edited('<h2 id="rf-shop-title">', '<h1>Welcome</h1><h2 id="rf-shop-title">');
    assert.deepEqual(oneH1Problems(two.html), ['the home page has 2 <h1> elements, not 1: the stone\'s heading is the page\'s only one']);
    const moved = edited('<h1 id="rf-stone-title">', '<h2 id="rf-stone-title">');
    moved.html = moved.html.replace(/<\/h1>/, '</h2>').replace('<h2 id="rf-shop-title">', '<h1>Welcome</h1><h2 id="rf-shop-title">');
    assert.deepEqual(oneH1Problems(moved.html), ['the home page\'s one <h1> isn\'t in the stone (section.rf-stone): the stone\'s heading is the page\'s']);
    assert.deepEqual(oneH1Problems('<main></main>'), ['the home page has 0 <h1> elements, not 1: the stone\'s heading is the page\'s only one']);
    assert.equal(failures(two, oneH1).length, 1);
});

test('the <h1> count ignores comments and the text of scripts', () => {
    const noisy = { ...page, html: page.html.replace('</head>', '<script>var h = "<h1>x</h1>";</script></head><!-- <h1>old</h1> -->') };
    assert.deepEqual(oneH1Problems(noisy.html), []);
});
