// Tests the home link sections' raw-HTML assertion (redesign step 2; ticket 49's rules),
// home-link-sections, on the redesign's home page rendered from fixed data (../home-fixture.mjs):
// the Fly Type plates, the Species band and the shop, with each promise broken once. It judges
// only the page, so a page without the plates or the Species band passes.
//
//   node --test scripts/qa/raw-html/assertions/home-link-sections.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { homePage } from '../home-fixture.mjs';
import linkSections, { linkSectionProblems } from './home-link-sections.mjs';

const page = await homePage();
const failures = fixture => checkPage(fixture, [linkSections]).filter(result => result.status === 'fail');
function edited(from, to, html = page.html) {
    assert.ok(typeof from === 'string' ? html.includes(from) : from.test(html), `the fixture has ${from}`);
    return { ...page, html: html.replace(from, to) };
}
const problems = html => linkSectionProblems(html).join('\n');
const PLATE_IMG = /<img src="[^"]*i\/dry-flies\.jpg"[^>]*>/;

test('it is registered, for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-link-sections'));
    assert.deepEqual(linkSections.pages, ['home']);
});

test('the home page as the theme renders it passes: three plates, two row plates, six species and the shop', () => {
    assert.deepEqual(linkSectionProblems(page.html), []);
    assert.deepEqual(failures(page), []);
    assert.equal(page.html.match(/class="rf-plate"/g).length, 3);
    assert.equal(page.html.match(/class="rf-row-plate"/g).length, 2);
    assert.equal(page.html.match(/class="rf-sp"/g).length, 6);
});

test('a page without the plates or the Species band passes: their menu ids are empty', async () => {
    const bare = await homePage({ theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } });
    assert.ok(!bare.html.includes('rf-types') && !bare.html.includes('rf-species'));
    assert.deepEqual(linkSectionProblems(bare.html), []);
    assert.ok(bare.html.includes('<section class="rf-shop"'), 'the shop is always there');
});

test('each section has one <h2>, which names it', () => {
    const twoH2 = edited('<h2 id="rf-types-title">', '<h2>Flies</h2><h2 id="rf-types-title">');
    assert.match(problems(twoH2.html), /the Fly Type plates has 2 <h2> elements/);
    const label = edited('aria-labelledby="rf-species-title"', 'aria-labelledby="elsewhere"');
    assert.match(problems(label.html), /the Species band is labelled by "elsewhere", not by its <h2>/);
    const shop = edited('<h2 id="rf-shop-title">', '<h3 id="rf-shop-title">').html.replace(/<\/h2>(\s*<p class="rf-shop__lead">)/, '</h3>$1');
    assert.match(problems(shop), /the shop has 0 <h2> elements/);
});

test('each plate and row plate is a link to a page with its name, nothing interactive inside, and no size category', () => {
    const anchor = edited('<a class="rf-plate__photo" href="/flies/dry-flies/">', '<a class="rf-plate__photo" href="#">');
    assert.match(problems(anchor.html), /plate 1 \(Dry Flies\)'s photo links to "#", not a page[\s\S]*the Fly Type plates has a link to "#", not a page/);
    const nested = edited('<span class="rf-plate__name">Dry Flies</span>', '<span class="rf-plate__name">Dry Flies</span><button type="button">Shop</button>');
    assert.match(problems(nested.html), /plate 1 \(Dry Flies\)'s photo has <button> inside its link/);
    const unnamed = edited('<span class="rf-plate__name">Dry Flies</span>', '<span class="rf-plate__name"></span>');
    assert.match(problems(unnamed.html), /plate 1 has no name \(\.rf-plate__name\)/);
    const row = edited('<a class="rf-row-plate__link" href="/flies/saltwater-warmwater-salmon/">', '<a class="rf-row-plate__link" href="javascript:void(0)">');
    assert.match(problems(row.html), /row plate 1 \(Saltwater, Warmwater & Salmon\) links to "javascript:void\(0\)", not a page/);
    const sizes = edited('<a href="/flies/dry-flies/parachutes/">Parachutes</a>', '<a href="/fly-sizes/12/">Size 12</a>');
    assert.match(problems(sizes.html), /the Fly Type plates links to \/fly-sizes\/12\/, a hidden size category \(SEO-6\)/);
    const noAll = edited(/<li><a class="rf-plate__all" href="\/flies\/dry-flies\/">[\s\S]*?<\/a><\/li>/, '');
    assert.match(problems(noAll.html), /plate 1 \(Dry Flies\) lists its subcategories with no "All" link/);
});

test('every photo in the plates is a lazy <img> with two or more srcset candidates, sizes, its box, alt="" and no fetchpriority', () => {
    const [img] = page.html.match(PLATE_IMG);
    const cases = [
        [img.replace(' loading="lazy"', ''), /the Fly Type plates' <img> 1 isn't loading="lazy"/],
        [img.replace(/ srcset="[^"]*"/, ` srcset="${img.match(/src="([^"]*)"/)[1]} 800w"`), /srcset has 1 candidate: it needs two or more/],
        [img.replace(/ sizes="[^"]*"/, ''), /<img> 1 has no sizes/],
        [img.replace(' width="1600" height="700"', ''), /has no width[\s\S]*has no height/],
        [img.replace(' alt=""', ' alt="Dry flies"'), /<img> 1 needs alt=""/],
        [img.replace(' loading="lazy"', ' loading="lazy" fetchpriority="low"'), /<img> 1 has fetchpriority="low"/],
    ];
    for (const [to, expected] of cases) assert.match(problems(edited(PLATE_IMG, to).html), expected);
});

test('the Species band carries its hooks for home.js: data-rf-species, each species\' id and name, and the hidden, empty lay region', () => {
    const unmarked = edited(' aria-labelledby="rf-species-title" data-rf-species>', ' aria-labelledby="rf-species-title">');
    assert.match(problems(unmarked.html), /the Species band has no data-rf-species/);
    const noId = edited(' data-rf-sp="601" data-rf-sp-name="Brook Trout"', ' data-rf-sp-name="Brook Trout"');
    assert.match(problems(noId.html), /the Species band's species "Brook Trout" has no data-rf-sp \(its category id\) or data-rf-sp-name/);
    const anchor = edited('<a class="rf-sp" href="/species/brook-trout/"', '<a class="rf-sp" href=""');
    assert.match(problems(anchor.html), /species "Brook Trout" links to "", not a page/);
    const shown = edited('<div class="rf-species__lay" data-rf-sp-region hidden>', '<div class="rf-species__lay" data-rf-sp-region>');
    assert.match(problems(shown.html), /lay region isn't hidden on the server/);
    const filled = edited('<ul class="rf-flies rf-flies--moss" data-rf-sp-lay></ul>', '<ul class="rf-flies rf-flies--moss" data-rf-sp-lay><li data-rf-product="1"></li></ul>');
    assert.match(problems(filled.html), /lay holds cards on the server/);
    const noAll = edited(' data-rf-sp-all>', '>');
    assert.match(problems(noAll.html), /lay region has no its "All" link \(\[data-rf-sp-all\]\)/);
    const noRegion = edited(/<div class="rf-species__lay" data-rf-sp-region hidden>[\s\S]*?<ul class="rf-flies rf-flies--moss" data-rf-sp-lay><\/ul>\s*<\/div>/, '');
    assert.match(problems(noRegion.html), /the Species band has no lay region/);
});

test('the shop\'s photo has alt text and is lazy, its phone link dials, and it carries no card or price', () => {
    const noAlt = edited(/alt="The ReelFlies shop[^"]*"/, 'alt=""');
    assert.match(problems(noAlt.html), /the shop's <img> has no alt text: it says where the shop is/);
    const eager = edited(/(alt="The ReelFlies shop[^"]*") loading="lazy"/, '$1');
    assert.match(problems(eager.html), /the shop's <img> isn't loading="lazy"/);
    const phone = edited('href="tel:+1-866-250-4071"', 'href="tel:866-250-4071"');
    assert.match(problems(phone.html), /the shop's phone link "tel:866-250-4071" isn't tel:\+1 and ten digits/);
    assert.deepEqual(linkSectionProblems(edited('href="tel:+1-866-250-4071"', 'href="tel:+18662504071"').html), [], 'the digits alone dial too');
    const price = edited('<p class="rf-promise">', '<p class="rf-promise">Flies from $0.50. ');
    assert.match(problems(price.html), /the shop shows a price, \$0\.50: it carries none \(CD-9\)/);
    const card = edited('<figure class="rf-shop__photo">', '<li data-rf-product="4877"></li><figure class="rf-shop__photo">');
    assert.match(problems(card.html), /the shop holds a product card \(data-rf-product="4877"\)/);
});
