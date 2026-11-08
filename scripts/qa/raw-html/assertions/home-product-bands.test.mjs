// Tests the home product bands' assertion (redesign step 2; ticket 48's rules), home-product-bands,
// on the redesign's home page rendered from fixed data (../home-fixture.mjs): the stone's lay,
// the hatch rows' flies, the Signature band and the Selections, with each promise broken once.
// It judges only the page, so a page without an optional band passes.
//
//   node --test scripts/qa/raw-html/assertions/home-product-bands.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { homePage } from '../home-fixture.mjs';
import bands, {
    BAND_ORDER, cardProblems, cards, homeSections, productBands, productBandsProblems,
} from './home-product-bands.mjs';
import { elementsHtml, findTags } from '../html.mjs';

const page = await homePage();
const failures = fixture => checkPage(fixture, [bands]).filter(result => result.status === 'fail');
function edited(from, to, html = page.html) {
    assert.ok(typeof from === 'string' ? html.includes(from) : from.test(html), `the fixture has ${from}`);
    return { ...page, html: html.replace(from, to) };
}
// A Selections card's photo, which is lazy; a stone card's, which is eager.
const SELECTION_IMG = /<img src="[^"]*42-mayfly-assortment\.jpg"[^>]*>/;
const STONE_IMG = /<img src="[^"]*adams-parachute-dry-fly\.jpg"[^>]*>/;
const problems = html => productBandsProblems(html).join('\n');

test('it is registered, for the home page only', async () => {
    const ids = (await loadAssertions()).map(assertion => assertion.id);
    assert.ok(ids.includes(bands.id));
    assert.deepEqual(bands.pages, ['home']);
    assert.equal(bands.id, 'home-product-bands');
});

test('the home page as the theme renders it passes, with every band and 34 cards in them', () => {
    assert.deepEqual(productBandsProblems(page.html), []);
    assert.deepEqual(failures(page), []);
    assert.deepEqual(homeSections(page.html).map(({ name }) => name), BAND_ORDER);
    const names = productBands(page.html).map(({ name }) => name);
    assert.equal(names[0], 'the stone\'s lay');
    assert.ok(names.includes('the Midges row') && names.includes('the Hoppers and terrestrials row'), names.join(', '));
    assert.deepEqual(names.slice(-2), ['the Signature band', 'the Selections']);
    assert.equal(cards(page.html).length, 34);
    assert.equal(productBands(page.html).reduce((sum, band) => sum + cards(band.html).length, 0), 34);
});

test('a page without best sellers, a Signature fly or Selections passes with fewer bands', async () => {
    const bare = await homePage({ best: [], signature: null, selections: [] });
    assert.deepEqual(productBandsProblems(bare.html), []);
    const names = productBands(bare.html).map(({ name }) => name);
    assert.ok(!names.includes('the stone\'s lay') && !names.includes('the Signature band') && !names.includes('the Selections'), names.join(', '));
    assert.ok(names.length >= 10, 'the hatch rows still have their flies');
});

test('with rf_quick_add off, every card buys through a link to its page, and passes', async () => {
    const off = await homePage({ theme_settings: { rf_quick_add: false } });
    assert.deepEqual(productBandsProblems(off.html), []);
    assert.ok(!findTags(off.html).some(tag => 'data-rf-add' in tag.attrs || 'data-rf-sizes' in tag.attrs), 'no "+ Add" and no size panel');
    assert.equal(elementsHtml(off.html, 'a', attrs => (attrs.class || '').includes('rf-add--link')).length, 34);
});

test('the bands keep home.html\'s order, and every card is in a band', () => {
    const shop = elementsHtml(page.html, 'section', attrs => (attrs.class || '').includes('rf-shop'))[0];
    const moved = { ...page, html: page.html.replace(shop, () => '').replace('<section class="rf-stone"', `${shop}<section class="rf-stone"`) };
    assert.match(problems(moved.html), /the home page's bands are out of order \(rf-shop, rf-stone, /);
    const stray = edited('<figure class="rf-shop__photo">', '<ul><li data-rf-product="1"><article></article></li></ul><figure class="rf-shop__photo">');
    assert.match(problems(stray.html), /1 card\(s\) sit outside the product bands/);
});

test('a labelled band has one <h2> that names it, and page links with no number in their label', () => {
    const twoH2 = edited('<h2 id="rf-sig-title">', '<h2>Also</h2><h2 id="rf-sig-title">');
    assert.match(problems(twoH2.html), /the Signature band has 2 <h2> elements/);
    const label = edited('aria-labelledby="rf-sel-title"', 'aria-labelledby="elsewhere"');
    assert.match(problems(label.html), /the Selections is labelled by "elsewhere", not by its <h2>/);
    const counted = edited('>All Signature flies<', '>All 432 Signature flies<');
    assert.match(problems(counted.html), /the Signature band's link says "All 432 Signature flies": a label carries no number \(HOME-4\)/);
    const anchor = edited('href="/flies/streamers-buggers/reelflies-signature-flies/">All Signature flies', 'href="#">All Signature flies');
    assert.match(problems(anchor.html), /the Signature band's link "All Signature flies" goes to "#", not a page/);
});

test('a card\'s photo is one lazy <img> with alt="", srcset, sizes and its box, eager on the stone, never with fetchpriority', () => {
    const [selection] = page.html.match(SELECTION_IMG);
    const [stone] = page.html.match(STONE_IMG);
    const cases = [
        [SELECTION_IMG, selection.replace(' loading="lazy"', ''), /the Selections's card 1 \(42 Mayfly Assortment\)'s <img> isn't loading="lazy"/],
        [SELECTION_IMG, selection.replace(' alt=""', ' alt="42 Mayfly Assortment"'), /card 1 \(42 Mayfly Assortment\)'s <img> needs alt=""/],
        [SELECTION_IMG, selection.replace(/ srcset="[^"]*"/, '').replace(/ sizes="[^"]*"/, ''), /<img> has no srcset[\s\S]*<img> has no sizes/],
        [SELECTION_IMG, selection.replace(' width="720" height="480"', ''), /<img> has no width[\s\S]*<img> has no height/],
        [STONE_IMG, stone.replace(' decoding="async"', ' loading="lazy" decoding="async"'), /the stone's lay's card 1 \(Adams Parachute Dry Fly\)'s <img> is lazy/],
        [STONE_IMG, stone.replace(' decoding="async"', ' fetchpriority="high" decoding="async"'), /card 1 \(Adams Parachute Dry Fly\)'s <img> has fetchpriority="high"/],
    ];
    for (const [from, to, expected] of cases) assert.match(problems(edited(from, to).html), expected);
    const noPhoto = edited(STONE_IMG, '');
    assert.match(problems(noPhoto.html), /card 1 \(Adams Parachute Dry Fly\) has 0 <img> elements in its photo link, not 1/);
});

test('a card\'s links go to its page, with nothing interactive inside, and the photo\'s is hidden from readers', () => {
    const elsewhere = edited('<a class="rf-fly__photo" href="/adams-parachute-dry-fly/"', '<a class="rf-fly__photo" href="/adams/"');
    assert.match(problems(elsewhere.html), /card 1 \(Adams Parachute Dry Fly\)'s photo links to \/adams\/ and its name to \/adams-parachute-dry-fly\/: both go to the product page/);
    const readable = edited('<a class="rf-fly__photo" href="/adams-parachute-dry-fly/" tabindex="-1" aria-hidden="true">', '<a class="rf-fly__photo" href="/adams-parachute-dry-fly/">');
    assert.match(problems(readable.html), /photo link isn't tabindex="-1" aria-hidden="true"/);
    const nested = edited('<h3 class="rf-fly__name"><a href="/adams-parachute-dry-fly/">Adams Parachute Dry Fly</a>', '<h3 class="rf-fly__name"><a href="/adams-parachute-dry-fly/">Adams Parachute Dry Fly<button type="button">+ Add</button></a>');
    assert.match(problems(nested.html), /has <button> inside a link: nothing interactive goes inside a link/);
    const empty = edited('<a href="/adams-parachute-dry-fly/">Adams Parachute Dry Fly</a>', '<a href="">Adams Parachute Dry Fly</a>');
    assert.match(problems(empty.html), /card 1 \(Adams Parachute Dry Fly\)'s name links to "", not a page/);
});

test('each card buys one way: "+ Add" with its hidden size panel, or a link to the page', () => {
    const mode = edited('data-rf-add="sizes"', 'data-rf-add="now"');
    assert.match(problems(mode.html), /"\+ Add" is data-rf-add="now", not "sizes" or "one"/);
    const expanded = edited('data-rf-add="sizes" aria-expanded="false"', 'data-rf-add="sizes" aria-expanded="true"');
    assert.match(problems(expanded.html), /isn't aria-expanded="false" on the server/);
    const shown = edited('<div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>', '<div class="rf-fly__sizes-panel" data-rf-sizes></div>');
    assert.match(problems(shown.html), /size panel isn't hidden on the server/);
    const noPanel = edited('<div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>', '');
    assert.match(problems(noPanel.html), /has 0 size panel\(s\) \(\[data-rf-sizes\]\), not 1/);
    const both = edited('<div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>', '<a class="rf-add rf-add--link" href="/adams-parachute-dry-fly/">Choose a size</a><div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>');
    assert.match(problems(both.html), /has 1 "\+ Add" button\(s\) and 1 buy link\(s\): each card buys one way/);
    const field = edited('<div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>', '<div class="rf-fly__sizes-panel" data-rf-sizes hidden><input type="number"></div>');
    assert.match(problems(field.html), /has <input>: a card holds no form control on the server/);
});

test('the reserved line keeps its hidden in-box tag, and a Selection is never "/ fly"', () => {
    const noTag = edited('<span class="rf-fly__inbox" data-rf-inbox hidden></span>', '');
    assert.match(problems(noTag.html), /line has no in-box tag \(\[data-rf-inbox\]\)/);
    const shown = edited('<span class="rf-fly__inbox" data-rf-inbox hidden></span>', '<span class="rf-fly__inbox" data-rf-inbox>2 in your box</span>');
    assert.match(problems(shown.html), /in-box tag isn't hidden on the server/);
    const unit = edited('<span class="rf-fly__unit">/ set</span>', '<span class="rf-fly__unit">/ fly</span>');
    assert.match(problems(unit.html), /the Selections's card 1 \(42 Mayfly Assortment\) shows the unit "\/ fly": a Selection is priced per set/);
});

test('an empty card is named for everything it lacks', () => {
    const named = cardProblems('<li data-rf-product="x"><article></article></li>', 'the card');
    assert.match(named.join('\n'), /data-rf-product is "x", not a product id/);
    assert.match(named.join('\n'), /has no name link[\s\S]*has no photo link[\s\S]*has no price[\s\S]*has no reserved line[\s\S]*0 "\+ Add" button\(s\) and 0 buy link\(s\)/);
});
