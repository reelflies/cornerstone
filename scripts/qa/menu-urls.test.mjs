// The grouped menu's rules, as menu-urls.mjs works them out (ticket 28), on the two trees the
// menu renders: tree 4 as refactor 13 plans it, and tree 1 on channel 1 with the channel-1
// variation's ids. The template is held to the same rules by render/partials/menu.test.mjs.
//
//   node --test scripts/qa/menu-urls.test.mjs

import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    expectedUrls, findCategory, isGrouped, menuGroups, parseIds, railNames,
} from './menu-urls.mjs';
import { readFixture, themeConfig } from './render/render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TREE_4 = readFixture(path.join(HERE, 'render/partials/menu/tree-4.json'));
const TREE_1 = readFixture(path.join(HERE, 'render/partials/menu/tree-1.json'));
const CHANNEL_1 = themeConfig('ReelFlies CA channel 1').settings;

describe('parseIds', () => {
    it('reads a comma-separated list, ignoring spaces and stray commas', () => {
        assert.deepEqual(parseIds(' 501, 502,,503 ,'), ['501', '502', '503']);
        assert.deepEqual(parseIds(''), []);
        assert.deepEqual(parseIds(undefined), []);
        assert.deepEqual(parseIds(298), ['298']);
    });
});

describe('findCategory', () => {
    it('finds an id at the top level or one level down, never deeper', () => {
        assert.equal(findCategory(TREE_1.categories, '398').name, 'Flies');
        assert.equal(findCategory(TREE_1.categories, ' 298 ').name, 'Dry Flies');
        assert.equal(findCategory(TREE_1.categories, '384'), null, 'Attractors & Stimulators is two levels down');
        assert.equal(findCategory(TREE_1.categories, '999999'), null);
    });
});

describe('menuGroups on tree 4', () => {
    const groups = menuGroups(TREE_4.categories, TREE_4.theme_settings);

    it('puts the six Fly Types in rf_menu_type_ids order, whatever the tree\'s order', () => {
        assert.deepEqual(groups.types.map(category => category.name), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies']);
    });

    it('finds Flies by Species, with its 11 Species pages', () => {
        assert.equal(groups.species.name, 'Flies by Species');
        assert.equal(groups.species.children.length, 11);
    });

    it('puts every other top-level category in More from ReelFlies, in the tree\'s order', () => {
        assert.deepEqual(groups.more.map(({ category }) => category.name), ['Fly Selections & Assortments', 'Fly Gear', 'Clearance']);
        assert.deepEqual(groups.more.find(({ category }) => category.name === 'Clearance').children, [], 'a plain link');
    });

    it('names the rail in order', () => {
        assert.deepEqual(railNames(groups), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies',
            'Flies by Species', 'Fly Selections & Assortments', 'Fly Gear', 'Clearance']);
    });

    it('expects every Fly Type, subcategory and Species page URL, and no third level', () => {
        const urls = expectedUrls(TREE_4.categories, TREE_4.theme_settings);
        for (const url of ['/dry-flies/', '/dry-flies/caddis-dry-flies/', '/nymphs/hares-ear-nymphs/', '/species/', '/species/steelhead-flies/', '/clearance/']) {
            assert.ok(urls.includes(url), url);
        }
        assert.ok(!urls.includes('/dry-flies/caddis-dry-flies/elk-hair-caddis/'), 'a subcategory\'s child');
        assert.ok(!urls.includes('/species/steelhead-flies/dry-flies/'), 'a Species page\'s Fly Type pages (decision 3: the 11 names)');
        assert.equal(urls.length, 1 + 8 + 1 + 10 + 1 + 5 + 1 + 2 + 1 + 2 + 1 + 2 + 1 + 11 + 1 + 2 + 1 + 4 + 1);
    });

    it('leaves out a top-level category rf_menu_exclude_ids names', () => {
        const excluded = menuGroups(TREE_4.categories, { ...TREE_4.theme_settings, rf_menu_exclude_ids: '560, 540' });
        assert.deepEqual(excluded.more.map(({ category }) => category.name), ['Fly Gear']);
    });

    it('has no Species group when the Species id is empty, and the Fly Types stay as they were', () => {
        const without = menuGroups(TREE_4.categories, { ...TREE_4.theme_settings, rf_menu_species_root_id: '' });
        assert.equal(without.species, null);
        assert.deepEqual(without.types, groups.types);
        // With no Species id the root is just another top-level category, so it joins More in
        // the tree's order. Tree 1, where the id is empty for real, has no such root.
        assert.deepEqual(without.more.map(({ category }) => category.name), ['Fly Selections & Assortments', 'Flies by Species', 'Fly Gear', 'Clearance']);
    });
});

describe('menuGroups on tree 1 with the channel-1 variation (Option A, ticket 53)', () => {
    const groups = menuGroups(TREE_1.categories, CHANNEL_1);

    it('finds the Fly-Type-like categories one level under Flies, in the variation\'s order', () => {
        assert.equal(CHANNEL_1.rf_menu_type_ids, '298,251,255,272,438');
        assert.deepEqual(groups.types.map(category => category.name), ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies']);
    });

    it('has no Species group: tree 1 has no Species root', () => {
        assert.equal(groups.species, null);
    });

    it('makes Flies a plain link in More, because its children are the Fly Types already in the rail', () => {
        assert.deepEqual(groups.more.map(({ category, children }) => [category.name, children.length]), [
            ['Flies', 0], ['Fly Selections & Fly Boxes', 3], ['Fly Gear', 4],
        ]);
    });
});

describe('isGrouped', () => {
    it('is the stock fallback only with both ids empty, or only spaces, as the template reads them', () => {
        assert.equal(isGrouped({ rf_menu_type_ids: '', rf_menu_species_root_id: '' }), false);
        assert.equal(isGrouped({ rf_menu_type_ids: '  ', rf_menu_species_root_id: ' ' }), false);
        assert.equal(isGrouped({ rf_menu_type_ids: ' , ', rf_menu_species_root_id: '' }), true, 'a stray comma counts as set, as {{#or (trim …)}} reads it; the menu then has no Fly Types');
        assert.equal(isGrouped({ rf_menu_type_ids: '', rf_menu_species_root_id: '520' }), true);
        assert.equal(isGrouped({ rf_menu_type_ids: '501', rf_menu_species_root_id: '' }), true);
        assert.deepEqual(expectedUrls(TREE_4.categories, {}), []);
    });
});
