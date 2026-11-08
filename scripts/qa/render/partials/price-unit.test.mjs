// The "/ fly" rule, components/reelflies/fly-rule.html (ticket 31; spec module 13, story 28;
// redesign step 3). Master's price-unit.html printed the unit; the redesign's rule renders
// nothing and sets the page variable rf_fly (1 for a fly, 0 for anything else), which the card
// (fly-listing.html, fly-stencil.html) turns into "/ fly" and the product page's details read.
//
// The interim rule (ticket 31, ticket 13's decision 13: no "Sold by" field): a fly is a product
// with a Placement that isn't Gear or an Assortment, and none that is. A product's Placements are
// its `category` paths, as a card carries them; Gear and the Assortments are the category roots
// rf_price_unit_exclude names, comma-separated, as the channel's tree spells them. With the
// setting empty, or naming no root, the rule can't tell, so nothing is a fly.
//
//   node --test scripts/qa/render/partials/price-unit.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { textOf } from '../../raw-html/html.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

const CALLER = 'rf-test/fly-rule-caller';
const TREE_1 = 'Fly Gear,Fly Selections & Fly Boxes';

// The variable the rule sets, read at once as the callers do, from inside a {{#with}} where the
// setting has to be reached through ../, as it is inside a page's {{#partial}} block.
const rule = async (category, exclude = TREE_1) => (await renderPartial(CALLER, {
    product: { category },
    theme_settings: { rf_price_unit_exclude: exclude },
}, {
    overrides: { [CALLER]: "{{#with product}}{{> components/reelflies/fly-rule rf_categories=category rf_exclude=../theme_settings.rf_price_unit_exclude}}{{/with}}[{{getVar 'rf_fly'}}]" },
})).trim();

const FLY = '[1]';
const NONE = '[0]';

describe('the fly rule (components/reelflies/fly-rule.html)', () => {
    it('calls a fly a fly, whether its paths carry their ancestors (a card) or not', async () => {
        assert.equal(await rule(['Flies', 'Flies/Realistic Trout Flies', 'Flies/Realistic Trout Flies/Realistic Dry Flies']), FLY);
        assert.equal(await rule(['Flies/Streamers & Buggers/Streamers & Bucktails', 'Flies/Saltwater, Warmwater & Salmon/Atlantic Salmon Flies']), FLY);
    });

    it('calls Gear, a hook pack and an Assortment not a fly', async () => {
        assert.equal(await rule(['Fly Gear/Mustad Hooks']), NONE, 'a hook pack');
        assert.equal(await rule(['Fly Gear', 'Fly Gear/Hats, Tools & Accessories']), NONE, 'Gear');
        assert.equal(await rule(['Fly Selections & Fly Boxes/Bulk Fly Selections']), NONE, 'an Assortment');
        assert.equal(await rule(['Fly Selections & Fly Boxes/Fly Boxes']), NONE, 'a fly box');
    });

    it('calls a fly that is also placed in an Assortment not a fly', async () => {
        assert.equal(await rule(['Flies/Nymphs & Sub Surface Flies/Beadhead Nymphs', 'Fly Selections & Fly Boxes/Bulk Fly Selections']), NONE);
    });

    it('matches a root as a whole name: "Fly Gear" excludes "Fly Gear/…", not "Fly Gearbox/…"', async () => {
        assert.equal(await rule(['Fly Gearbox/Flies']), FLY);
        assert.equal(await rule(['Fly Gear']), NONE);
    });

    it('reads the setting with spaces round its names and stray commas', async () => {
        assert.equal(await rule(['Fly Gear/Mustad Hooks'], ' Fly Gear , ,Fly Selections & Fly Boxes '), NONE);
        assert.equal(await rule(['Flies/Dry Flies'], ' Fly Gear , ,Fly Selections & Fly Boxes '), FLY);
    });

    it('calls nothing a fly with no Placement, or when the channel names no roots (the rule can\'t tell)', async () => {
        assert.equal(await rule([]), NONE);
        assert.equal(await rule(undefined), NONE);
        assert.equal(await rule(['Flies/Dry Flies'], ''), NONE);
        for (const exclude of [',', ' , ,', '  ']) assert.equal(await rule(['Fly Gear/Fly Boxes'], exclude), NONE, `"${exclude}" names no root`); // eslint-disable-line no-await-in-loop
    });

    it('renders nothing itself: the words are the card\'s, from lang/en.json', async () => {
        const lang = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8'));
        const bare = await renderPartial('components/reelflies/fly-rule', { rf_categories: ['Flies/Dry Flies'], rf_exclude: TREE_1 });
        assert.equal(bare.trim(), '');
        const card = (categories, exclude = TREE_1) => renderPartial('components/reelflies/fly-listing', {
            rf_card: {
                id: 1, name: 'Adams', url: '/adams/', category: categories, price: { without_tax: { formatted: '$1.25', value: 1.25 } }, image: null,
            },
            rf_pos: 1,
            rf_exclude: exclude,
        });
        assert.equal(textOf((await card(['Flies/Dry Flies'])).match(/<p class="rf-fly__price">[\s\S]*?<\/p>/)[0]), `$1.25 ${lang.reelflies.card.per_fly}`);
        assert.equal(textOf((await card(['Fly Gear/Mustad Hooks'])).match(/<p class="rf-fly__price">[\s\S]*?<\/p>/)[0]), '$1.25');
        assert.equal(textOf((await card(['Flies/Dry Flies'], '')).match(/<p class="rf-fly__price">[\s\S]*?<\/p>/)[0]), '$1.25', 'no roots set: no unit');
    });
});
