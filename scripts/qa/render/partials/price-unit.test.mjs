// The "/ fly" price unit, components/reelflies/price-unit.html (ticket 31; spec module 13, story
// 28; build pipeline 6.2: the card, ticket 30's quick-search rows, and 39, 42, 43 and 44 share it).
//
// The interim rule (ticket 31, ticket 13's decision 13: no "Sold by" field): "/ fly" only on a
// product with a Placement that isn't Gear or an Assortment, and none that is. A product's
// Placements are its `category` paths, as a card or a search row carries them; Gear and the
// Assortments are the category roots rf_price_unit_exclude names, comma-separated, as the
// channel's tree spells them. With the setting empty the rule can't tell, so no unit shows.
//
//   node --test scripts/qa/render/partials/price-unit.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial } from '../render.mjs';

const CALLER = 'rf-test/price-unit-caller';
const TREE_1 = 'Fly Gear,Fly Selections & Fly Boxes';

const unit = async (category, exclude = TREE_1) => (await renderPartial(CALLER, {
    product: { category },
    theme_settings: { rf_price_unit_exclude: exclude },
}, {
    overrides: { [CALLER]: '<p>{{#with product}}{{> components/reelflies/price-unit rf_categories=category rf_exclude=../theme_settings.rf_price_unit_exclude}}{{/with}}</p>' },
})).trim();

const FLY = '<p> <span class="rf-price-unit">/ fly</span></p>';
const NONE = '<p></p>';

describe('price-unit', () => {
    it('shows "/ fly" on a fly, whether its paths carry their ancestors (a card) or not (a search row)', async () => {
        assert.equal(await unit(['Flies', 'Flies/Realistic Trout Flies', 'Flies/Realistic Trout Flies/Realistic Dry Flies']), FLY);
        assert.equal(await unit(['Flies/Streamers & Buggers/Streamers & Bucktails', 'Flies/Saltwater, Warmwater & Salmon/Atlantic Salmon Flies']), FLY);
    });

    it('shows nothing on Gear, a hook pack or an Assortment', async () => {
        assert.equal(await unit(['Fly Gear/Mustad Hooks']), NONE, 'a hook pack');
        assert.equal(await unit(['Fly Gear', 'Fly Gear/Hats, Tools & Accessories']), NONE, 'Gear');
        assert.equal(await unit(['Fly Selections & Fly Boxes/Bulk Fly Selections']), NONE, 'an Assortment');
        assert.equal(await unit(['Fly Selections & Fly Boxes/Fly Boxes']), NONE, 'a fly box');
    });

    it('shows nothing on a fly that is also placed in an Assortment', async () => {
        assert.equal(await unit(['Flies/Nymphs & Sub Surface Flies/Beadhead Nymphs', 'Fly Selections & Fly Boxes/Bulk Fly Selections']), NONE);
    });

    it('matches a root as a whole name: "Fly Gear" excludes "Fly Gear/…", not "Fly Gearbox/…"', async () => {
        assert.equal(await unit(['Fly Gearbox/Flies']), FLY);
        assert.equal(await unit(['Fly Gear']), NONE);
    });

    it('reads the setting with spaces round its names and stray commas', async () => {
        assert.equal(await unit(['Fly Gear/Mustad Hooks'], ' Fly Gear , ,Fly Selections & Fly Boxes '), NONE);
        assert.equal(await unit(['Flies/Dry Flies'], ' Fly Gear , ,Fly Selections & Fly Boxes '), FLY);
    });

    it('shows nothing on a product with no Placement, or when the channel names no roots (the rule can\'t tell)', async () => {
        assert.equal(await unit([]), NONE);
        assert.equal(await unit(undefined), NONE);
        assert.equal(await unit(['Flies/Dry Flies'], ''), NONE);
    });

    it('takes its words from lang/en.json', async () => {
        assert.match(await unit(['Flies/Dry Flies']), /\/ fly/);
    });
});
