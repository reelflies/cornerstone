// Fixture renders of the home lead, the photo hero (ticket 46; spec module 6, O21) and the three
// big Fly Type cards after it (ticket 47; SEO-8, CD-2, HOME-1, HOME-2, HOME-4): what the store
// renders from widgets/home-lead/template.html with a channel's widget_configuration.
// The element shots at 375 and 1280 are widget-screens.spec.mjs's, the hero's layout checks
// (300px cap, text below the photo on phones, contrast over the scrim) home-lead-screens.spec.mjs's,
// and the cards' place on the page home-widgets-screens.spec.mjs's.
//
//   node --test scripts/qa/render/widgets/home-lead.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';

const DIR = path.join(WIDGETS_DIR, 'home-lead');
const fixture = readFixture(path.join(DIR, 'fixtures', 'default.json'));
const countsFixture = readFixture(path.join(DIR, 'fixtures', 'counts.json'));
const framesFixture = readFixture(path.join(DIR, 'fixtures', 'frames.json'));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const render = (configuration = {}) => renderWidget('home-lead', { ...fixture, configuration: { ...fixture.configuration, ...configuration } });
const WIDTHS = [320, 480, 640, 960, 1280, 1600];
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const FILE = 's/bass-panfish__24775.original.jpg';
const text = html => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const inner = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map(([, body]) => text(body));

test('the shot\'s fixture is exactly what ReelFlies_CA gets', () => {
    assert.deepEqual(fixture.configuration, channelFile.configuration);
});

const heroOnly = html => html.slice(0, html.indexOf('<ul class="rf-type-cards"'));

test('the H1 is the configured heading, the widget\'s only <h1>, and the hero\'s only heading', async () => {
    const html = await render();
    assert.deepEqual(inner(html, 'h1'), ['Hand-tied fly fishing flies, sold one at a time.']);
    assert.equal(findTags(heroOnly(html), 'h2').length + findTags(html, 'h3').length, 0);
    assert.deepEqual(inner(html, 'p'), ['Nearly 2,000 patterns from $0.75 a fly, tied by hand and shipped across Canada from our family shop in Tillsonburg, Ontario, since 2003.']);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the photo is a real <img> with a srcset, sizes, width and height, eager and fetchpriority="high"', async () => {
    const [img, ...more] = findTags(heroOnly(await render()), 'img');
    assert.equal(more.length, 0, 'one image in the hero');
    assert.equal(img.attrs.srcset, WIDTHS.map(width => `${BASE}/${width}w/${FILE} ${width}w`).join(', '));
    assert.equal(img.attrs.src, `${BASE}/1280w/${FILE}`);
    assert.equal(img.attrs.sizes, '(min-width: 1284px) 1200px, 100vw');
    assert.equal(img.attrs.width, '1600');
    assert.equal(img.attrs.height, '700');
    assert.equal(img.attrs.fetchpriority, 'high');
    assert.equal(img.attrs.alt, '', 'decorative: the H1 says what the page is');
    assert.ok(!('loading' in img.attrs), 'eager');
});

test('an image-manager file builds the same srcset (HOME-2: the path is a text field)', async () => {
    const [img] = findTags(heroOnly(await render({ image_path: 'image-manager/rf-hero-bass.jpg' })), 'img');
    assert.equal(img.attrs.srcset.split(', ')[0], `${BASE}/320w/image-manager/rf-hero-bass.jpg 320w`);
});

test('the photo is mirrored only when the field says so', async () => {
    const mirrored = findTags(await render(), 'img')[0].attrs.class;
    assert.equal(mirrored, 'rf-hero__img rf-hero__img--mirror');
    const plain = findTags(await render({ image_mirror: false }), 'img')[0].attrs.class;
    assert.equal(plain, 'rf-hero__img');
});

test('both buttons are links to real pages, from the widget\'s fields, and nothing is a <button>', async () => {
    const html = heroOnly(await render());
    assert.deepEqual(findTags(html, 'a').map(tag => tag.attrs.href), ['/dry-flies/', '/species/']);
    assert.deepEqual(inner(html, 'a'), ['Shop dry flies', 'Shop by fish']);
    assert.equal(findTags(await render(), 'button').length, 0);
    // Channel 1's copy carries tree-1 paths in the same fields (ticket 53).
    const tree1 = heroOnly(await render({ primary_url: '/flies/dry-flies/', secondary_url: '/flies/' }));
    assert.deepEqual(findTags(tree1, 'a').map(tag => tag.attrs.href), ['/flies/dry-flies/', '/flies/']);
});

test('the copy is escaped, never raw HTML from a field', async () => {
    const html = await render({ heading: 'Flies <script>alert(1)</script> & more' });
    assert.equal(findTags(html, 'script').length, 0);
    assert.ok(html.includes('Flies &lt;script&gt;'));
});

test('the template and the card partial use no inline styles: the theme\'s ReelFlies layer styles them (decision 6)', () => {
    for (const file of [path.join(DIR, 'template.html'), path.join(WIDGETS_DIR, '_shared', 'type-card.html')]) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /style=|<style/, file);
    }
});

// The three big Fly Type cards (ticket 47).

const BANNER_WIDTHS = [400, 800, 1200, 1600];
const CARDS = [
    {
        href: '/dry-flies/', label: 'On the surface', name: 'Dry Flies', cta: 'Shop dry flies', banner: 'i/dry-flies__36885.original.jpg', focus: '75',
    },
    {
        href: '/nymphs/', label: 'Below the surface', name: 'Nymphs', cta: 'Shop nymphs', banner: 'n/nymphs-sub-surface__11277.original.jpg', focus: '5',
    },
    {
        href: '/streamers/', label: 'Stripped and swung', name: 'Streamers', cta: 'Shop streamers', banner: 'l/streamers-buggers__88399.original.jpg', focus: '10',
    },
];
// Each card's markup, from its <li> to the next.
const cardsOf = html => html.split('<li class="rf-type-cards__item">').slice(1).map(part => part.slice(0, part.indexOf('</li>')));
const byClass = (html, name) => [...html.matchAll(new RegExp(`<(\\w+)\\b[^>]*class="(?:[^"]*\\s)?${name}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</\\1>`, 'g'))].map(([, , body]) => text(body));
const srcsetOf = file => BANNER_WIDTHS.map(width => `${BASE}/${width}w/${file} ${width}w`).join(', ');
const configuration = (file, keys) => Object.fromEntries(Object.entries(readFixture(file).configuration).filter(([key]) => keys.test(key)));

test('three cards follow the hero, in a list named by its field, in the order Dry Flies, Nymphs, Streamers', async () => {
    const html = await render();
    assert.match(html, /<\/div>\s*<ul class="rf-type-cards" aria-label="Our biggest fly types">/, 'the list comes right after the hero, in the same container');
    const cards = cardsOf(html);
    assert.equal(cards.length, 3);
    assert.deepEqual(inner(html, 'h2'), CARDS.map(({ name }) => name));
    assert.equal(findTags(html, 'h1').length, 1, 'the cards add no <h1>');
    assert.deepEqual(unbalancedTags(html), []);
});

test('each card is exactly one link holding its label, its name as an <h2>, and the call to action as a <span>', async () => {
    for (const [index, card] of cardsOf(await render()).entries()) {
        const expected = CARDS[index];
        const links = findTags(card, 'a');
        assert.equal(links.length, 1, `${expected.name}: one link`);
        assert.equal(links[0].attrs.href, expected.href);
        assert.equal(links[0].attrs.class, 'rf-type-card');
        assert.ok(card.trim().endsWith('</a>'), `${expected.name}: everything in the card is inside its link`);
        assert.equal(findTags(card, 'button').length + findTags(card, 'input').length + findTags(card, 'select').length, 0, `${expected.name}: nothing interactive inside the link`);
        assert.deepEqual(byClass(card, 'rf-type-card__label'), [expected.label]);
        assert.match(card, new RegExp(`<h2 class="rf-type-card__name">${expected.name}</h2>`));
        assert.match(card, new RegExp(`<span class="rf-type-card__cta">${expected.cta}</span>`), 'the CTA is a span, not a control');
    }
});

test('each card photo is a real <img>: alt="", the banner\'s srcset from 400w to 1600w, sizes, width and height, eager, no fetchpriority', async () => {
    for (const [index, card] of cardsOf(await render()).entries()) {
        const { name, banner, focus } = CARDS[index];
        const images = findTags(card, 'img');
        assert.equal(images.length, 1, `${name}: one image`);
        const { attrs } = images[0];
        assert.equal(attrs.alt, '', `${name}: decorative, the heading names it`);
        assert.equal(attrs.srcset, srcsetOf(banner));
        assert.equal(attrs.src, `${BASE}/800w/${banner}`);
        assert.equal(attrs.sizes, '(max-width: 800px) calc(143vw - 69px), (max-width: 1260px) calc(73vw - 37px), 805px');
        assert.equal(attrs.width, '1600');
        assert.equal(attrs.height, '700');
        assert.ok(!('loading' in attrs), `${name}: eager`);
        assert.ok(!('fetchpriority' in attrs), `${name}: the hero's photo is the page's only fetchpriority="high"`);
        assert.equal(attrs.class, `rf-type-card__img rf-type-card__img--x${focus}`, `${name}: its crop's focus is a class, never inline CSS`);
        assert.equal(findTags(card, 'source').length, 0, `${name}: with no 4:5 frame, the banner serves every width`);
    }
});

test('a 4:5 frame swaps in on desktop through a <picture> source, and phones keep the banner (HOME-1)', async () => {
    const html = await renderWidget('home-lead', framesFixture);
    for (const [index, card] of cardsOf(html).entries()) {
        const { name, banner } = CARDS[index];
        assert.match(card, /<a class="rf-type-card rf-type-card--frame"/, `${name}: the card takes the 4:5 shape`);
        const [source, ...more] = findTags(card, 'source');
        assert.equal(more.length, 0);
        assert.equal(source.attrs.media, '(min-width: 801px)');
        assert.equal(source.attrs.srcset, srcsetOf(`image-manager/rf-frame-standin-${index + 1}.jpg`));
        assert.equal(source.attrs.sizes, '(max-width: 1260px) calc(32vw - 16px), 352px');
        assert.equal(source.attrs.width, '1600');
        assert.equal(source.attrs.height, '2000');
        assert.equal(findTags(card, 'img')[0].attrs.srcset, srcsetOf(banner), `${name}: the banner for phones`);
        assert.ok(card.indexOf('<source') < card.indexOf('<img'), `${name}: the source comes before the img`);
    }
});

test('a count shows only when the storefront query returns one (HOME-4)', async () => {
    assert.deepEqual(byClass(await render(), 'rf-type-card__count'), [], 'no query result: no count');
    const counted = cardsOf(await renderWidget('home-lead', countsFixture));
    assert.deepEqual(counted.map(card => byClass(card, 'rf-type-card__count')), [['436 patterns'], ['601 patterns'], []], 'the third card\'s route returned no node');
    const zero = structuredClone(countsFixture);
    zero.data.site.card1.node.products.collectionInfo.totalItems = 0;
    assert.deepEqual(byClass(cardsOf(await renderWidget('home-lead', zero))[0], 'rf-type-card__count'), [], 'a count of 0 shows nothing');
});

test('no card field holds a typed count or price: counts come only from the query', () => {
    const cards = configuration(path.join(DIR, 'channels', '1895766.json'), /^card/);
    assert.ok(Object.keys(cards).length >= 21);
    for (const [key, value] of Object.entries(cards)) {
        if (!/_(width|height|focus|banner|frame)$/.test(key)) assert.doesNotMatch(String(value), /\d|\$/, `${key} holds "${value}"`);
    }
    for (const file of ['counts.json', 'frames.json']) {
        assert.deepEqual(configuration(path.join(DIR, 'fixtures', file), /^card[^1-3]|^cards/), configuration(path.join(DIR, 'channels', '1895766.json'), /^card[^1-3]|^cards/), `${file} shares ReelFlies_CA's card settings`);
    }
});

// A pin, not a check against the tree: the approved tree lives outside the repo
// (plan/design/src/store-data.json, menu, until refactor 06's new-tree.json), so these paths were
// checked against it by hand, and a change to ReelFlies_CA's links has to change CARDS too.
test('ReelFlies_CA\'s card links are pinned to the planned Fly Type paths in CARDS', () => {
    const cards = configuration(path.join(DIR, 'channels', '1895766.json'), /^card\d_url$/);
    assert.deepEqual(Object.values(cards), CARDS.map(({ href }) => href));
});

test('the card text is escaped, never raw HTML from a field', async () => {
    const html = await render({ card1_name: 'Dry <script>alert(1)</script>', card1_label: '<b>x</b>' });
    assert.equal(findTags(html, 'script').length + findTags(html, 'b').length, 0);
});
