// Fixture renders of best sellers on the home page (ticket 48; spec module 7, R5, CD-8, HOME-4,
// SEO-8; stories 12, 68 and 70): what the store renders from widgets/best-sellers/template.html,
// with its product cards (widgets/_shared/product-card.html), from a channel's
// widget_configuration and a storefront query result. The element shots at 375 and 1280 are
// widget-screens.spec.mjs's; the band's place on the page (one row of four, the 2x2 phone grid,
// the spares kept hidden, unpublishing it with no gap) home-widgets-screens.spec.mjs's; the
// served page's markup home-product-bands' (raw HTML); and the typed-value lint
// scripts/widgets/typed-values.test.mjs's.
//
//   node --test scripts/qa/render/widgets/best-sellers.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';
import { readChannelFile, readWidget } from '../../../widgets/source.mjs';
import { typedValuesIn } from '../../../widgets/typed-values.mjs';
import {
    CARD_FIELDS, CARD_WIDTHS, PICKS, cardsOf, photoProducts, readQuery, withPicks,
} from './product-bands.mjs';

const DIR = path.join(WIDGETS_DIR, 'best-sellers');
const fixture = name => readFixture(path.join(DIR, 'fixtures', `${name}.json`));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const render = (data = fixture('default'), configuration = {}) => renderWidget('best-sellers', { ...data, configuration: { ...data.configuration, ...configuration } });
const BASE = 'https://cdn11.bigcommerce.com/s-8pfqkn26ea/images/stencil';
const SIZES = '(min-width: 1136px) 256px, (min-width: 801px) calc(23.65vw - 12px), calc(50vw - 31px)';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The reference's best sellers on reelflies.ca by units sold (store-data.json ranks 1 to 6):
// four picks, then two spares.
const PICKED = [4877, 4507, 5835, 4754, 4675, 4368];

test('the shot fixtures carry exactly what ReelFlies_CA gets', () => {
    for (const name of ['default', 'sold-out', 'empty']) assert.deepEqual(fixture(name).configuration, channelFile.configuration, name);
});

test('it is placed in home_below_top_products after the tiles (10) and before the Signature band (30), inactive with no uuids until the orchestrator\'s apply', () => {
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 20 });
    // Recorded inactive, as #60 recorded 47's: the apply comes after a release carries
    // _home-bands.scss. An R12 unpublish later sets it inactive again in a PR that must pass CI.
    assert.ok(['active', 'inactive'].includes(status), status);
    for (const name of ['template', 'widget', 'placement']) assert.ok(channelFile.uuids[name] === null || UUID.test(channelFile.uuids[name]), name);
    const tiles = readFixture(path.join(WIDGETS_DIR, 'link-tiles', 'channels', '1895766.json')).placement;
    const signature = readFixture(path.join(WIDGETS_DIR, 'signature-band', 'channels', '1895766.json')).placement;
    assert.equal(tiles.region, channelFile.placement.region);
    assert.ok(tiles.sort_order < channelFile.placement.sort_order && channelFile.placement.sort_order < signature.sort_order);
});

test('the picks are product ids, in rank order, with two spares, and none repeats a tile\'s photo or a Signature pick', () => {
    assert.deepEqual(PICKS.map(pick => Number(channelFile.configuration[pick])), PICKED);
    // home-photo-once: each tile shows a product's own photo (ticket 47's wave-2 note).
    const tiles = photoProducts('link-tiles');
    assert.deepEqual(tiles, [5101, 5300, 3857, 5490, 5445, 4398]);
    const signature = PICKS.map(pick => Number(readFixture(path.join(WIDGETS_DIR, 'signature-band', 'channels', '1895766.json')).configuration[pick]));
    for (const id of PICKED) {
        assert.ok(!tiles.includes(id), `${id} repeats a tile's photo`);
        assert.ok(!signature.includes(id), `${id} is a Signature pick too`);
    }
    assert.equal(new Set(PICKED).size, PICKED.length);
});

test('the query reads each pick by its id, mapped from its setting, and every field the card shows', () => {
    const { variables, aliases, fragment } = readQuery('best-sellers');
    assert.deepEqual(variables, PICKS);
    assert.deepEqual(aliases, Object.fromEntries(PICKS.map(pick => [pick, pick])));
    for (const field of CARD_FIELDS) assert.ok(fragment.includes(field), field);
    const widget = readWidget('best-sellers');
    const [hidden] = widget.schema;
    assert.equal(hidden.type, 'hidden');
    const { mappings } = hidden.settings.find(setting => setting.type === 'graphQl').typeMeta;
    assert.deepEqual(mappings, Object.fromEntries(PICKS.map(pick => [pick, { reads: pick, type: 'Int!' }])));
    assert.deepEqual(widget.settings.filter(id => id.startsWith('pick')), PICKS);
    assert.equal(widget.query, readQuery('best-sellers').query.trim());
    assert.deepEqual(readChannelFile(widget, 1895766).channel, 1895766);
});

test('an H2 names the band, which is labelled by it, and each card\'s name is an H3', async () => {
    const html = await render();
    const [section] = findTags(html, 'section');
    const [h2, ...more] = findTags(html, 'h2');
    assert.equal(more.length, 0);
    assert.equal(section.attrs['aria-labelledby'], h2.attrs.id);
    assert.match(html, /<h2 class="rf-home-band__heading" id="rf-best-sellers-[^"]+">Best sellers<\/h2>/);
    assert.equal(findTags(html, 'h1').length, 0);
    assert.equal(findTags(html, 'h3').length, cardsOf(html).length);
    assert.deepEqual(unbalancedTags(html), []);
});

test('every pick in stock renders, in pick order: the first four show and the two spares follow (the CSS shows four)', async () => {
    const cards = cardsOf(await render());
    assert.deepEqual(cards.map(card => card.product), PICKED);
    assert.deepEqual(cards.map(card => card.name), ['Adams Parachute Dry Fly', 'Beadhead Prince Nymph', 'Elk Hair Caddis Tan', 'Beadhead Pheasant Tail', 'Adams Dry Fly', 'Adams Irresistible']);
});

test('a pick sold out in every size, or missing from the channel, renders nothing, and the spares move up', async () => {
    const soldOut = fixture('sold-out');
    assert.equal(soldOut.data.site.pick2.inventory.isInStock, false);
    assert.equal(soldOut.data.site.pick4, null);
    assert.deepEqual(cardsOf(await render(soldOut)).map(card => card.product), [4877, 5835, 4675, 4368]);
    assert.doesNotMatch(await render(soldOut), /Beadhead Prince Nymph|Beadhead Pheasant Tail/);
});

test('with none of the picks on the channel (ReelFlies_CA before refactor 14), no card renders', async () => {
    const html = await render(fixture('empty'));
    assert.deepEqual(cardsOf(html), []);
    assert.match(html, /<ul class="rf-product-cards">\s*<\/ul>/);
});

test('a changed price in the query result changes the rendered price: no price is typed (HOME-4)', async () => {
    const before = cardsOf(await render());
    assert.deepEqual(before.map(card => card.amount), Array(6).fill('$0.95'));
    const changed = withPicks(fixture('default'), (node, pick) => (pick === 'pick3' ? { ...node, prices: { price: { value: 1.25, currencyCode: 'CAD' } } } : node));
    const after = cardsOf(await render(changed));
    assert.deepEqual(after.map(card => card.amount), ['$0.95', '$0.95', '$1.25', '$0.95', '$0.95', '$0.95']);
    for (const card of after) assert.equal(card.unit, '/ fly');
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
        assert.match(links[0].attrs.href, /^\/[a-z0-9-]+\/$/, card.name);
        assert.ok(card.html.trim().endsWith('</a>'), `${card.name}: everything in the card is inside its link`);
    }
    assert.deepEqual(cardsOf(html).slice(0, 4).map(card => card.link.attrs.href), ['/adams-parachute-dry-fly/', '/beadhead-prince-nymph/', '/elk-hair-caddis-tan/', '/beadhead-pheasant-tail/']);
});

test('each photo is a real <img>: alt="", lazy, a srcset of the query\'s URLs at 160w to 640w, sizes, width and height, no fetchpriority', async () => {
    const data = fixture('default').data.site;
    for (const [index, card] of cardsOf(await render()).entries()) {
        const { defaultImage } = data[PICKS[index]];
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

test('a product with no photo keeps its white box and no <img>', async () => {
    const noPhoto = withPicks(fixture('default'), (node, pick) => (pick === 'pick1' ? { ...node, defaultImage: null } : node));
    const [first] = cardsOf(await render(noPhoto));
    assert.equal(first.img, undefined);
    assert.match(first.html, /<span class="rf-product-card__media">\s*<\/span>/);
});

test('the unit is a field: empty, no unit shows (ticket 49\'s Assortments)', async () => {
    for (const card of cardsOf(await render(fixture('default'), { price_unit: '' }))) assert.equal(card.unit, undefined);
});

test('text from the query and the fields is escaped, never raw HTML', async () => {
    const hostile = withPicks(fixture('default'), (node, pick) => (pick === 'pick1' ? { ...node, name: 'Adams <script>alert(1)</script>' } : node));
    const html = await render(hostile, { heading: 'Best <em>sellers</em>' });
    assert.equal(findTags(html, 'script').length + findTags(html, 'em').length, 0);
    assert.ok(html.includes('Adams &lt;script&gt;'));
});

test('no setting holds a typed price, count or product name (HOME-4)', () => {
    assert.deepEqual(typedValuesIn('best-sellers'), []);
});

test('the template and the card use no inline styles: the theme\'s ReelFlies layer styles them (decision 6)', () => {
    for (const file of [path.join(DIR, 'template.html'), path.join(WIDGETS_DIR, '_shared', 'product-card.html')]) {
        assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /style=|<style/, file);
    }
});
