// Tests the home link sections' raw-HTML assertion (ticket 49): home-link-sections, on home pages
// built from the widgets' own renders (the hero and the cards in home_below_menu; the tiles, the
// Species section and the About block in home_below_top_products), with each promise broken
// once. It judges only the page, so a page without the sections passes.
//
//   node --test scripts/qa/raw-html/assertions/home-link-sections.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFixture, renderWidget, WIDGETS_DIR } from '../../render/render.mjs';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import linkSections, { linkSectionProblems } from './home-link-sections.mjs';

const fixture = name => readFixture(path.join(WIDGETS_DIR, name, 'fixtures', 'default.json'));
const render = name => renderWidget(name, fixture(name));
let widgetId = 0;
const wrap = html => {
    widgetId += 1;
    return `<div data-widget-id="w${widgetId}" data-placement-id="p${widgetId}" data-placement-status="ACTIVE">${html}</div>`;
};

// A home page as stencil start serves it, with the widgets in their regions, in placement order.
async function homePage({
    lead, tiles, species, about, order,
} = {}) {
    const parts = {
        tiles: tiles ?? await render('link-tiles'),
        species: species ?? await render('shop-by-fish'),
        about: about ?? await render('about'),
    };
    const below = (order || ['tiles', 'species', 'about']).map(name => parts[name]).filter(Boolean).map(wrap).join('');
    const leadHtml = lead ?? await render('home-lead');
    return {
        kind: 'home',
        key: 'home',
        path: '/',
        url: 'http://localhost:3301/',
        status: 200,
        html: '<!DOCTYPE html><html lang="en"><head><title>ReelFlies</title></head><body><header></header><main class="body" id="main-content">'
            + `<div data-content-region="home_below_menu">${leadHtml && wrap(leadHtml)}</div><div class="container"><div class="main full">`
            + `<div data-content-region="home_below_top_products">${below}</div></div></div></main></body></html>`,
    };
}

const failures = page => checkPage(page, [linkSections]).filter(result => result.status === 'fail');

test('it is registered, for the home page only', async () => {
    assert.ok((await loadAssertions()).some(assertion => assertion.id === 'home-link-sections'));
    assert.deepEqual(linkSections.pages, ['home']);
    assert.equal(linkSections.ticket, 49);
});

test('the Species section and the About block as the widgets render them pass, after the hero, the cards and the tiles', async () => {
    const page = await homePage();
    assert.deepEqual(linkSectionProblems(page.html), []);
    assert.deepEqual(failures(page), []);
});

test('a page without the sections passes: the widgets aren\'t placed yet, or are unpublished', async () => {
    assert.deepEqual(linkSectionProblems((await homePage({ species: '', about: '' })).html), []);
    assert.deepEqual(linkSectionProblems((await homePage({ species: '' })).html), []);
    assert.deepEqual(linkSectionProblems((await homePage({ about: '' })).html), []);
});

test('each section has one <h2>, which names it', async () => {
    const species = await render('shop-by-fish');
    const about = await render('about');
    const twoH2 = species.replace('</section>', '<h2>More species</h2></section>');
    assert.deepEqual(linkSectionProblems(twoH2), ['the Species section (Shop by fish) has 2 <h2> elements: each section has exactly one']);
    const noH2 = about.replace(/<h2([^>]*)>/, '<p$1>').replace('</h2>', '</p>');
    assert.deepEqual(linkSectionProblems(noH2), ['the About block has 0 <h2> elements: each section has exactly one']);
    const unnamed = species.replace(/aria-labelledby="[^"]*"/, 'aria-labelledby="elsewhere"');
    assert.deepEqual(linkSectionProblems(unnamed), ['the Species section (Shop by fish) is labelled by "elsewhere", not by its <h2>']);
});

test('each group\'s image is one link with its photo, its name and a visible call to action, and nothing interactive inside it', async () => {
    const species = await render('shop-by-fish');
    const button = species.replace('<span class="rf-species-group__cta">Shop bass flies</span>', '<button class="rf-species-group__cta">Shop bass flies</button>');
    assert.deepEqual(linkSectionProblems(button), [
        'group 2 (Bass, pike & panfish) has no call to action (.rf-species-group__cta, a <span>) in its link',
        'group 2 (Bass, pike & panfish) has <button> inside its link: nothing interactive goes inside a link',
    ]);
    const noLink = species.replace('href="/bonefish-flies/" class="rf-species-group__link"', 'class="rf-species-group__link"').replace('class="rf-species-group__link" href="/bonefish-flies/"', 'class="rf-species-group__link"');
    assert.deepEqual(linkSectionProblems(noLink), ['group 3 (Saltwater) links to "", not a page']);
    const pillHash = species.replace('href="/carp-flies/"', 'href="#"');
    assert.deepEqual(linkSectionProblems(pillHash), ['the Species section\'s pill "Carp Flies" links to "#", not a page']);
});

test('no link in the sections goes to a hidden size category or a size listing (SEO-6, UX-16)', async () => {
    const species = (await render('shop-by-fish')).replace('href="/permit-flies/"', 'href="/fly-sizes/14/"');
    assert.deepEqual(linkSectionProblems(species), ['the Species section (Shop by fish) links to /fly-sizes/14/, a hidden size category (SEO-6)']);
});

test('every photo is a lazy server-rendered <img> with a srcset, sizes, width and height, no fetchpriority and no CSS background (SEO-8)', async () => {
    const species = await render('shop-by-fish');
    const about = await render('about');
    const bare = about.replace(/ srcset="[^"]*" sizes="[^"]*"/, '').replace(/ width="600" height="450"/, '');
    assert.deepEqual(linkSectionProblems(bare), ['srcset', 'sizes', 'width', 'height'].map(name => `the About block's <img> has no ${name}`));
    const eager = species.replace('alt="" loading="lazy" data-rf-photo-repeat', 'alt="" data-rf-photo-repeat');
    assert.deepEqual(linkSectionProblems(eager), ['the Species section (Shop by fish)\'s <img> 1 isn\'t loading="lazy"']);
    const priority = about.replace('loading="lazy"', 'loading="lazy" fetchpriority="high"');
    assert.deepEqual(linkSectionProblems(priority), ['the About block\'s <img> has fetchpriority="high": the hero\'s photo is the page\'s only one']);
    const background = species.replace('<span class="rf-species-group__media">', '<span class="rf-species-group__media" style="background-image: url(/x.jpg)">');
    assert.deepEqual(linkSectionProblems(background), ['the Species section (Shop by fish) sets a photo as a CSS background: style="background-image: url(/x.jpg)"']);
});

// CD-4: the Dry banner's left third is the page's one allowed repeat, a section or more away
// from the Dry card.
test('the marked crop of the Dry banner sits at least one section away from the Dry card', async () => {
    assert.deepEqual(linkSectionProblems((await homePage()).html), []);
    const next = await homePage({ order: ['species', 'tiles', 'about'] });
    assert.deepEqual(linkSectionProblems(next.html), ['the photo i/dry-flies__36885.original.jpg, marked data-rf-photo-repeat, is in the widget right after the one that shows it: put a section or more between them (CD-4)']);
    // A marked photo that repeats nothing is no problem.
    const fresh = (await render('shop-by-fish')).replace(/i\/dry-flies__36885\.original\.jpg/g, 'image-manager/rf-cold-water.jpg');
    assert.deepEqual(linkSectionProblems((await homePage({ species: fresh, order: ['species', 'tiles', 'about'] })).html), []);
});

test('the About block has the photo\'s alt text, a real tel: number and no product card or price (CD-9)', async () => {
    const about = await render('about');
    const noAlt = about.replace(/alt="The ReelFlies shop front[^"]*"/, 'alt=""');
    assert.deepEqual(linkSectionProblems(noAlt), ['the About block\'s photo has no alt text: it says where the shop is']);
    const priced = about.replace('</ul>', '</ul><p class="price">$34.95</p>');
    assert.deepEqual(linkSectionProblems(priced), [
        'the About block holds a price or product card (class="price"): it carries none',
        'the About block shows a price, $34.95: it carries none',
    ]);
    const card = about.replace('</ul>', '</ul><article class="card" data-product-id="3886"></article>');
    assert.deepEqual(linkSectionProblems(card), [
        'the About block holds a price or product card (class="card"): it carries none',
        'the About block holds a price or product card (data-product-id="3886"): it carries none',
    ]);
    const badTel = about.replace('tel:+18662504071', 'tel:1 866 250 4071');
    assert.deepEqual(linkSectionProblems(badTel), ['the About block\'s phone link "tel:1 866 250 4071" isn\'t tel:+1 and ten digits']);
});
