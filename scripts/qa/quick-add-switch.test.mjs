// Quick add's switch and the release guard (ticket 43; ticket 15's guard; story 73; spec seam 5;
// redesign step 3, round 2): rf_quick_add is on in the base settings, the value 1895766 runs, and
// on in "ReelFlies CA channel 1" too since step 3 (it was off there, the owner's value from
// master, so the release guard flags the change at channel 1's push). A release whose config.json
// value differs from the channel's live one stops, with no flag to override it; the first push
// over Hero-2024 lists it as a new switch for Shaun to confirm.
//
//   node --test scripts/qa/quick-add-switch.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from '../release-guard.mjs';
import { effectiveSettings } from '../release-diff.mjs';
import { ROOT } from './storefront.mjs';

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema.json'), 'utf8'));
const translations = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemaTranslations.json'), 'utf8'));
// 1895766 and channel 1, each with its variation and the value it runs; the menu ids are checked
// against a tree that holds them (rule 2 is release-guard.test.mjs's).
const CHANNELS = [[1895766, 'ReelFlies CA', true], [1, 'ReelFlies CA channel 1', true]];
const treeOf = repo => ['rf_menu_type_ids', 'rf_menu_species_root_id'].flatMap(key => String(repo[key] || '').split(',')).map(Number).filter(Boolean);

describe('rf_quick_add', () => {
    it('is a Theme Styles checkbox under Product cards, with its label, on in the base settings and set on, on purpose, in the channel-1 variation', () => {
        const group = schema.find(({ name }) => name === 'i18n.RfReelFlies');
        const heading = group.settings.findIndex(setting => setting.content === 'i18n.RfProductCards');
        const at = group.settings.findIndex(setting => setting.id === 'rf_quick_add');
        assert.ok(heading >= 0 && at > heading, 'rf_quick_add sits under the Product cards heading');
        const next = group.settings.findIndex((setting, index) => index > heading && setting.type === 'heading');
        assert.ok(next === -1 || at < next, 'and before the next heading');
        assert.deepEqual(group.settings[at], {
            type: 'checkbox', label: 'i18n.RfQuickAdd', force_reload: true, id: 'rf_quick_add',
        });
        assert.ok(translations['i18n.RfQuickAdd'].default);
        assert.equal(config.settings.rf_quick_add, true);
        assert.equal(config.variations.find(({ name }) => name === 'ReelFlies CA channel 1').settings.rf_quick_add, true, 'channel 1 says so itself: the owner\'s master value was false');
        for (const [, variation, value] of CHANNELS) assert.equal(effectiveSettings(config, variation).rf_quick_add, value, variation);
    });

    for (const [channelId, variation, value] of CHANNELS) {
        const repo = effectiveSettings(config, variation);
        const categoryIds = treeOf(repo).length ? treeOf(repo) : null;
        const live = { ...repo };

        it(`stops a release to ${channelId} ("${variation}") when the live value differs from config.json's, whichever way (story 73)`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: { ...live, rf_quick_add: !value }, channelId, categoryIds,
            });
            assert.equal(result.pass, false);
            assert.ok(result.reasons.some(reason => reason.startsWith('rf_quick_add:')), result.reasons.join('; '));
        });

        it(`lets a release to ${channelId} through when the live value matches`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: live, channelId, categoryIds,
            });
            assert.equal(result.pass, true, result.reasons.join('; '));
            assert.ok(result.values.some(entry => entry.key === 'rf_quick_add' && entry.value === value));
        });
    }

    it('is listed as a new switch, on, at channel 1\'s first push over Hero-2024, for Shaun to confirm (ticket 53)', () => {
        const repo = effectiveSettings(config, 'ReelFlies CA channel 1');
        const hero = Object.fromEntries(Object.entries(repo).filter(([key]) => !key.startsWith('rf_')));
        const result = checkRelease({
            repoSettings: repo, liveSettings: hero, channelId: 1, categoryIds: treeOf(repo),
        });
        assert.equal(result.pass, true, result.reasons.join('; '));
        assert.ok(result.newSwitches.includes('rf_quick_add'));
        assert.ok(result.values.some(entry => entry.key === 'rf_quick_add' && entry.value === true));
    });

    it('stops a channel-1 release while the live theme still holds master\'s value, off: the owner confirms the change (redesign step 3)', () => {
        const repo = effectiveSettings(config, 'ReelFlies CA channel 1');
        const result = checkRelease({
            repoSettings: repo, liveSettings: { ...repo, rf_quick_add: false }, channelId: 1, categoryIds: treeOf(repo),
        });
        assert.equal(result.pass, false);
        assert.ok(result.reasons.some(reason => reason.startsWith('rf_quick_add:')), result.reasons.join('; '));
    });
});
