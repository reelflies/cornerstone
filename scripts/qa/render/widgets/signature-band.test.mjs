// Fixture renders of the ReelFlies Signature Flies band on the home page (ticket 48; spec module 7,
// R5, CD-6, CD-8, HOME-4, SEO-8; stories 17, 68 and 70): what the store renders from
// widgets/signature-band/template.html, with its product cards (widgets/_shared/product-card.html),
// from a channel's widget_configuration and a storefront query result. The element shots at 375
// and 1280 are widget-screens.spec.mjs's; the band's layout (copy left and cards right at 1280,
// the 2x2 phone grid, full-bleed with no sideways scroll, unpublishing it with no gap)
// home-widgets-screens.spec.mjs's; the served page's markup home-product-bands' (raw HTML); and
// the typed-value lint scripts/widgets/typed-values.test.mjs's. best-sellers.test.mjs holds the
// card's own promises (one link, the photo's attributes, a changed price), which this band shares.
//
//   node --test scripts/qa/render/widgets/signature-band.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { WIDGETS_DIR, readFixture, renderWidget } from '../render.mjs';
import { readWidget } from '../../../widgets/source.mjs';
import { typedValuesIn } from '../../../widgets/typed-values.mjs';
import {
    CARD_FIELDS, PICKS, cardsOf, photoProducts, readQuery, text, withPicks,
} from './product-bands.mjs';

const DIR = path.join(WIDGETS_DIR, 'signature-band');
const fixture = name => readFixture(path.join(DIR, 'fixtures', `${name}.json`));
const channelFile = readFixture(path.join(DIR, 'channels', '1895766.json'));
const render = (data = fixture('default'), configuration = {}) => renderWidget('signature-band', { ...data, configuration: { ...data.configuration, ...configuration } });
const SIZES = '(min-width: 1261px) 142px, (min-width: 801px) calc(25vw - 43px), calc(50vw - 47px)';
// The reference's four Signature picks (reference.src.html:1354), then two ReelFlies patterns as
// spares: the Psycho Caddis its story names, and the Rocky Mountain Pupa.
const PICKED = [4797, 5837, 6232, 4576, 3899, 3855];
const STORY = 'Patterns sold under the ReelFlies name, from the Psycho Caddis to tungsten-bead eggs and the ReelCray. You\'ll also find each one in its fly type.';

test('the shot fixture carries exactly what ReelFlies_CA gets', () => {
    for (const name of ['default', 'sold-out']) assert.deepEqual(fixture(name).configuration, channelFile.configuration, name);
});

test('it is placed in home_below_top_products after best sellers (20), inactive with no uuids until the orchestrator\'s apply', () => {
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_top_products', sort_order: 30 });
    assert.ok(['active', 'inactive'].includes(status), status);
    // Ticket 49's sections take 40 to 70 after it (build pipeline 6.5).
    assert.ok(readFixture(path.join(WIDGETS_DIR, 'best-sellers', 'channels', '1895766.json')).placement.sort_order < 30);
});

test('the picks are product ids, in the reference\'s order, with two spares, none repeating a tile\'s photo', () => {
    assert.deepEqual(PICKS.map(pick => Number(channelFile.configuration[pick])), PICKED);
    for (const id of PICKED) assert.ok(!photoProducts('link-tiles').includes(id), `${id} repeats a tile's photo`);
    assert.equal(new Set(PICKED).size, PICKED.length);
});

test('the query is best sellers\' shape: each pick by its id, mapped from its setting, with every field the card shows', () => {
    const { variables, aliases, fragment } = readQuery('signature-band');
    assert.deepEqual(variables, PICKS);
    assert.deepEqual(aliases, Object.fromEntries(PICKS.map(pick => [pick, pick])));
    for (const field of CARD_FIELDS) assert.ok(fragment.includes(field), field);
    assert.equal(fragment, readQuery('best-sellers').fragment, 'both bands read the same fields for the shared card');
    const { mappings } = readWidget('signature-band').schema[0].settings[0].typeMeta;
    assert.deepEqual(mappings, Object.fromEntries(PICKS.map(pick => [pick, { reads: pick, type: 'Int!' }])));
});

test('the copy: the eyebrow, then the H2 the band is labelled by, the owner\'s story and the button', async () => {
    const html = await render();
    const [section] = findTags(html, 'section');
    const [h2, ...more] = findTags(html, 'h2');
    assert.equal(more.length, 0);
    assert.equal(section.attrs['aria-labelledby'], h2.attrs.id);
    assert.ok(section.attrs.class.split(' ').includes('rf-on-dark'), 'its links take the gold ring on the forest ground (ticket 25)');
    const copy = html.slice(html.indexOf('<div class="rf-signature__copy">'), html.indexOf('<ul class="rf-product-cards'));
    assert.deepEqual(findTags(copy).filter(tag => ['p', 'h2', 'a'].includes(tag.name)).map(tag => tag.name), ['p', 'h2', 'p', 'a']);
    assert.match(copy, /<p class="rf-signature__eyebrow">Only at ReelFlies<\/p>/);
    assert.match(copy, />ReelFlies Signature Flies<\/h2>/);
    assert.equal(text(copy.match(/<p class="rf-signature__story">([\s\S]*?)<\/p>/)[1]), STORY);
    assert.equal(findTags(html, 'h1').length, 0);
    assert.deepEqual(unbalancedTags(html), []);
});

test('the button is a real link to the ReelFlies brand listing (ticket 36), its label without a number (HOME-4)', async () => {
    const html = await render();
    const [button] = findTags(html, 'a').filter(tag => tag.attrs.class === 'rf-signature__button');
    assert.equal(button.attrs.href, '/brands/ReelFlies.html');
    assert.equal(findTags(html, 'button').length, 0);
    const label = text(html.match(/<a class="rf-signature__button"[^>]*>([\s\S]*?)<\/a>/)[1]);
    assert.equal(label, 'See all ReelFlies originals');
    assert.doesNotMatch(label, /\d/);
    assert.doesNotMatch(channelFile.configuration.button_url, /categor|signature/i, 'never a Signature category: tree 4 has none');
});

test('every pick in stock renders as a card, in order: the first four show and the two spares follow', async () => {
    const cards = cardsOf(await render());
    assert.deepEqual(cards.map(card => card.product), PICKED);
    assert.deepEqual(cards.map(card => card.amount), ['$1.75', '$1.95', '$1.45', '$1.95', '$1.45', '$1.95']);
    for (const card of cards) {
        assert.equal(card.unit, '/ fly');
        assert.equal(findTags(card.html, 'a').length, 1, card.name);
        assert.equal(card.img.attrs.sizes, SIZES);
        assert.equal(card.img.attrs.loading, 'lazy');
        assert.ok(!('fetchpriority' in card.img.attrs));
    }
    const html = await render();
    assert.equal(findTags(html, 'button').length, 0);
    assert.doesNotMatch(html, /\+ ?Add|Add to cart/i);
});

test('a pick sold out in every size renders nothing, and the first spare takes its place', async () => {
    const soldOut = fixture('sold-out');
    assert.equal(soldOut.data.site.pick3.inventory.isInStock, false);
    assert.deepEqual(cardsOf(await render(soldOut)).map(card => card.product), [4797, 5837, 4576, 3899, 3855]);
});

test('a changed price in the query result changes the rendered price (HOME-4)', async () => {
    const changed = withPicks(fixture('default'), (node, pick) => (pick === 'pick1' ? { ...node, prices: { price: { value: 1.95, currencyCode: 'CAD' } } } : node));
    assert.equal(cardsOf(await render(changed))[0].amount, '$1.95');
});

test('no setting holds a typed price, count or product name (HOME-4)', () => {
    assert.deepEqual(typedValuesIn('signature-band'), []);
});

test('the template uses no inline styles: the theme\'s ReelFlies layer styles it (decision 6)', () => {
    assert.doesNotMatch(fs.readFileSync(path.join(DIR, 'template.html'), 'utf8'), /style=|<style/);
});
