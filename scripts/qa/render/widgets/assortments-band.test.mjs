// Fixture renders of the Assortments band on the home page (ticket 49; spec module 7, R5, HOME-4,
// SEO-8; stories 18, 68 and 70): what the store renders from widgets/assortments-band/template.html,
// with ticket 48's product cards (widgets/_shared/product-card.html), from a channel's
// widget_configuration and a storefront query result. The element shots at 375 and 1280 are
// widget-screens.spec.mjs's; the band's place on the page (the copy beside three cards, two on
// phones, the spares, fewer cards, unpublishing it with no gap) home-assortments-screens.spec.mjs's;
// the served page's markup home-assortments' and home-product-bands' (raw HTML); and the
// typed-value lint scripts/widgets/typed-values.test.mjs's.
//
//   node --test scripts/qa/render/widgets/assortments-band.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';
import { readChannelFile, readWidget } from '../../../widgets/source.mjs';
import { PRODUCT_BANDS, typedValuesIn } from '../../../widgets/typed-values.mjs';
import {
    CARD_FIELDS, CARD_WIDTHS, PICKS, cardsOf, photoProducts, readQuery, text, withPicks,
} from './product-bands.mjs';

const WIDGET = 'assortments-band';
const DIR = path.join(WIDGETS_DIR, WIDGET);
const FIXTURES = ['default', 'sold-out', 'two-left', 'one-left', 'empty', 'price-change'];
const fixture = name => readFixture(path.join(DIR, 'fixtures', `${name}.json`));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const placementOf = widget => readFixture(path.join(WIDGETS_DIR, widget, 'channels', '1895766.json')).placement;
const render = (data = fixture('default'), configuration = {}) => renderWidget(WIDGET, { ...data, configuration: { ...data.configuration, ...configuration } });
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
// The card's width in this band, as home-assortments-screens measures it at every width: a
// third of the 8/12 from 1261px, a third of the band's width less its padding from 801px, and
// half of it on phones, where the third card is hidden.
const SIZES = '(min-width: 1261px) 185px, (min-width: 801px) calc(31.33vw - 45px), calc(50vw - 63px)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The reference's three Assortments, then two spares: the next two Assortments by units sold
// that are in stock, show no tile's photo and print their price whole (ticket 49's PR 2 defaults).
const BAND_PICKS = PICKS.slice(0, 5);
const PICKED = [3886, 3870, 4251, 4888, 4397];
const NAMES = ['42 Mayfly Assortment', 'Best Sellers Selection - 12 Flies', 'The Adams Family Selection - 12 Flies', 'Caddis Dry Fly Selection - 10 Flies', 'Searching Nymph Selection - 12 Flies'];
const NOT_INCLUDED = /Fly boxes are shown for scale and not included\./;

test('every fixture carries exactly what ReelFlies_CA gets', () => {
    for (const name of FIXTURES) assert.deepEqual(fixture(name).configuration, channelFile.configuration, name);
    assert.deepEqual(fixture('default').data.site, Object.fromEntries(BAND_PICKS.map((pick, index) => [pick, fixture('default').data.site[`pick${index + 1}`]])));
});

test('it is placed in home_below_top_products after ticket 48\'s bands and the Species section, before About, inactive with no uuids until the orchestrator\'s apply', () => {
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 50 });
    // Recorded inactive, as #60 recorded 47's: the apply comes after a release carries
    // _home-links.scss and after probe 13's spike. An R12 unpublish later sets it inactive again.
    assert.ok(['active', 'inactive'].includes(status), status);
    for (const name of ['template', 'widget', 'placement']) assert.ok(channelFile.uuids[name] === null || UUID.test(channelFile.uuids[name]), name);
    const before = ['link-tiles', 'best-sellers', 'signature-band', 'shop-by-fish'].map(placementOf);
    const about = placementOf('about');
    for (const other of [...before, about]) assert.equal(other.region, channelFile.placement.region);
    assert.ok(before.every(other => other.sort_order < channelFile.placement.sort_order), 'after the tiles, both bands and the Species section');
    assert.ok(channelFile.placement.sort_order < about.sort_order, 'before About');
});

test('the picks are product ids: the reference\'s three, then two spares, none repeating a tile\'s photo or a pick of ticket 48\'s bands', () => {
    assert.deepEqual(BAND_PICKS.map(pick => Number(channelFile.configuration[pick])), PICKED);
    // home-photo-once: each tile shows a product's own photo (5445, the 30-nymph Selection, is the
    // Fly Selections tile's).
    const tiles = photoProducts('link-tiles');
    assert.ok(tiles.includes(5445));
    const others = ['best-sellers', 'signature-band'].flatMap(widget => PICKS.map(pick => Number(readFixture(path.join(WIDGETS_DIR, widget, 'channels', '1895766.json')).configuration[pick])));
    for (const id of PICKED) {
        assert.ok(!tiles.includes(id), `${id} repeats a tile's photo`);
        assert.ok(!others.includes(id), `${id} is in one of ticket 48's bands too`);
    }
    assert.equal(new Set(PICKED).size, PICKED.length);
});

test('the query reads each pick by its id, mapped from its setting, with ticket 48\'s card fragment', () => {
    const { variables, aliases, fragment } = readQuery(WIDGET);
    assert.deepEqual(variables, BAND_PICKS);
    assert.deepEqual(aliases, Object.fromEntries(BAND_PICKS.map(pick => [pick, pick])));
    for (const field of CARD_FIELDS) assert.ok(fragment.includes(field), field);
    assert.equal(fragment, readQuery('best-sellers').fragment, 'the same fragment as ticket 48\'s bands: the card reads these fields');
    const widget = readWidget(WIDGET);
    const [hidden] = widget.schema;
    assert.equal(hidden.type, 'hidden');
    const { mappings } = hidden.settings.find(setting => setting.type === 'graphQl').typeMeta;
    assert.deepEqual(mappings, Object.fromEntries(BAND_PICKS.map(pick => [pick, { reads: pick, type: 'Int!' }])));
    assert.deepEqual(widget.settings.filter(id => id.startsWith('pick')), BAND_PICKS);
    assert.equal(widget.query, readQuery(WIDGET).query.trim());
    assert.equal(readChannelFile(widget, 1895766).channel, 1895766);
});

test('the H2 names the band, which is labelled by it, and each card\'s name is an H3', async () => {
    const html = await render();
    const [section] = findTags(html, 'section');
    const [h2, ...more] = findTags(html, 'h2');
    assert.equal(more.length, 0);
    assert.equal(section.attrs['aria-labelledby'], h2.attrs.id);
    assert.equal(section.attrs['data-rf-band'], 'assortments', 'ticket 48\'s home-product-bands checks the cards of every section[data-rf-band]');
    assert.match(html, /<h2 class="rf-assortments__heading" id="rf-assortments-[^"]+">Fly selections<\/h2>/);
    assert.equal(findTags(html, 'h1').length, 0);
    assert.equal(findTags(html, 'h3').length, cardsOf(html).length);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the copy says the fly boxes are shown for scale and not included, and its link goes to the Fly Selections & Assortments page (story 18)', async () => {
    const html = await render();
    const copy = html.slice(html.indexOf('<div class="rf-assortments__copy">'), html.indexOf('<ul class="rf-product-cards'));
    assert.match(text(copy), NOT_INCLUDED);
    assert.equal(text(copy), 'Fly selections Ready-made mixes of patterns and sizes at one price. A good start for a new box or a new water. Fly boxes are shown for scale and not included. Shop fly selections');
    const [link, ...more] = findTags(copy, 'a');
    assert.equal(more.length, 0);
    assert.equal(link.attrs.href, '/fly-selections-assortments/');
    assert.equal(link.attrs.class, 'rf-assortments__link');
    assert.doesNotMatch(text(copy), /\d/, 'no typed number or price in the copy (HOME-4)');
});

test('every pick in stock renders, in pick order: the first three show and the two spares follow (the CSS shows three, two on phones)', async () => {
    const cards = cardsOf(await render());
    assert.deepEqual(cards.map(card => card.product), PICKED);
    assert.deepEqual(cards.map(card => card.name), NAMES);
});

test('a pick sold out in every size, or missing from the channel, renders nothing, and the spares move up', async () => {
    const soldOut = fixture('sold-out');
    assert.equal(soldOut.data.site.pick1.inventory.isInStock, false);
    assert.equal(soldOut.data.site.pick3, null);
    assert.deepEqual(cardsOf(await render(soldOut)).map(card => card.product), [3870, 4888, 4397]);
    assert.doesNotMatch(await render(soldOut), /42 Mayfly Assortment|The Adams Family Selection/);
});

test('with two, one or none of the picks left, it renders only those (the CSS then shares the row between two, or hides the band)', async () => {
    assert.deepEqual(cardsOf(await render(fixture('two-left'))).map(card => card.product), [3870, 4397]);
    assert.deepEqual(cardsOf(await render(fixture('one-left'))).map(card => card.product), [3870]);
    const empty = await render(fixture('empty'));
    assert.deepEqual(cardsOf(empty), []);
    assert.match(empty, /<ul class="rf-product-cards rf-product-cards--plates rf-assortments__cards">\s*<\/ul>/);
});

test('each card shows the query\'s price per set, with no unit: no "/ fly" (story 18), and a changed price changes it (HOME-4)', async () => {
    const before = cardsOf(await render());
    assert.deepEqual(before.map(card => card.amount), ['$34.95', '$9.95', '$10.95', '$9.95', '$9.95']);
    for (const card of before) {
        assert.equal(card.unit, undefined, `${card.name}: no unit`);
        assert.doesNotMatch(card.html, /rf-product-card__unit|\/\s*fly|per fly/i, card.name);
    }
    assert.deepEqual(cardsOf(await render(fixture('price-change'))).map(card => card.amount), ['$29.95', '$10.95', '$10.95', '$9.95', '$9.95']);
    const changed = withPicks(fixture('default'), (node, pick) => (pick === 'pick3' ? { ...node, prices: { price: { value: 12.45, currencyCode: 'CAD' } } } : node));
    assert.deepEqual(cardsOf(await render(changed)).map(card => card.amount), ['$34.95', '$9.95', '$12.45', '$9.95', '$9.95']);
});

test('a product with no price shown (the store hides prices) shows no price line', async () => {
    const hidden = withPicks(fixture('default'), node => ({ ...node, prices: null }));
    for (const card of cardsOf(await render(hidden))) assert.doesNotMatch(card.html, /rf-product-card__price/);
});

test('each card is one link to its product page, with nothing interactive inside it and no "+ Add"', async () => {
    const html = await render();
    assert.equal(findTags(html, 'button').length + findTags(html, 'form').length + findTags(html, 'input').length, 0);
    assert.doesNotMatch(html, /\+ ?Add|Add to cart/i);
    for (const card of cardsOf(html)) {
        const links = findTags(card.html, 'a');
        assert.equal(links.length, 1, `${card.name}: one link`);
        assert.ok(card.html.trim().endsWith('</a>'), `${card.name}: everything in the card is inside its link`);
    }
    assert.deepEqual(cardsOf(html).map(card => card.link.attrs.href), ['/42-mayfly-assortment/', '/best-sellers-selection-12-flies/', '/the-adams-family-selection-12-flies/', '/caddis-dry-fly-selection-10-flies/', '/searching-nymph-selection-12-flies/']);
});

test('each photo is a real <img>: alt="", lazy, a srcset of the query\'s URLs at 160w to 640w, the band\'s sizes, width and height, no fetchpriority', async () => {
    const data = fixture('default').data.site;
    for (const [index, card] of cardsOf(await render()).entries()) {
        const { defaultImage } = data[BAND_PICKS[index]];
        assert.equal(findTags(card.html, 'img').length, 1, card.name);
        const { attrs } = card.img;
        assert.equal(attrs.alt, '', `${card.name}: decorative, the card's name says what it is`);
        assert.equal(attrs.loading, 'lazy');
        assert.equal(attrs.src, defaultImage.url320);
        assert.equal(attrs.srcset, CARD_WIDTHS.map(width => `${defaultImage[`url${width}`]} ${width}w`).join(', '));
        assert.ok(attrs.srcset.startsWith(`${BASE}/160w/products/${card.product}/`), attrs.srcset);
        assert.equal(attrs.sizes, SIZES);
        assert.deepEqual([attrs.width, attrs.height], ['600', '400']);
        assert.ok(!('fetchpriority' in attrs), card.name);
    }
});

test('text from the query and the fields is escaped, never raw HTML', async () => {
    const hostile = withPicks(fixture('default'), (node, pick) => (pick === 'pick1' ? { ...node, name: 'Mayflies <script>alert(1)</script>' } : node));
    const html = await render(hostile, { heading: 'Fly <em>selections</em>', text: 'Mixes <img src=x onerror=alert(1)>' });
    assert.equal(findTags(html, 'script').length + findTags(html, 'em').length, 0);
    assert.equal(findTags(html, 'img').length, cardsOf(html).length);
    assert.ok(html.includes('Mayflies &lt;script&gt;'));
});

test('it is one of the product bands the typed-value lint covers, and no setting holds a typed price, count or product name (HOME-4)', () => {
    assert.ok(PRODUCT_BANDS.includes(WIDGET));
    assert.deepEqual(typedValuesIn(WIDGET), []);
});

test('the template uses no inline styles: the theme\'s ReelFlies layer styles it (decision 6)', () => {
    assert.doesNotMatch(fs.readFileSync(path.join(DIR, 'template.html'), 'utf8'), /style=|<style/);
});

test('the store copy holds the card once per pick, with no unit to print', () => {
    const { template } = readWidget(WIDGET);
    assert.equal(template.match(/<li class="rf-product-cards__item">/g).length, BAND_PICKS.length);
    assert.doesNotMatch(template, /_shared\/product-card/, 'the sync pasted every call');
});
