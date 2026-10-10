// Cart state's switch (ticket 42; ticket 15's guard; story 73; spec seam 5): rf_cart_state is a
// Theme Styles checkbox, on in the base settings, which both gated variations inherit (ticket 53's
// default: the channel-1 variation sets no switch of its own). A release whose config.json value
// differs from the channel's live one stops, with no flag to override it; the first push over
// Hero-2024 lists it as a new switch for Shaun to confirm. Once a template reads it, the switch
// matrix (ticket 54) renders every pin with it off too, through rf_cart_state-off, and checks
// that none of the module's markup or script is on the page.
//
//   node --test scripts/qa/cart-state-switch.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from '../release-guard.mjs';
import { effectiveSettings } from '../release-diff.mjs';
import { listOverlays, readOverlay } from './overlays.mjs';
import { ROOT } from './storefront.mjs';
import { SWITCHES, moduleSwitches, templatesReading } from './switches.mjs';
import { matrixPlan } from './switch-matrix.mjs';

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema.json'), 'utf8'));
const translations = JSON.parse(fs.readFileSync(path.join(ROOT, 'schemaTranslations.json'), 'utf8'));
// 1895766 and channel 1, each with its variation; the menu ids are checked against a tree that
// holds them (rule 2 is release-guard.test.mjs's).
const CHANNELS = [[1895766, 'ReelFlies CA'], [1, 'ReelFlies CA channel 1']];
const treeOf = repo => ['rf_menu_type_ids', 'rf_menu_species_root_id'].flatMap(key => String(repo[key] || '').split(',')).map(Number).filter(Boolean);

describe('rf_cart_state', () => {
    it('is a Theme Styles checkbox under Cart state, with its label, on in the base settings and in both gated variations', () => {
        const group = schema.find(({ name }) => name === 'i18n.RfReelFlies');
        const index = group.settings.findIndex(setting => setting.content === 'i18n.RfCartState');
        assert.deepEqual(group.settings[index + 1], {
            type: 'checkbox', label: 'i18n.RfCartStateSwitch', force_reload: true, id: 'rf_cart_state',
        });
        assert.ok(translations['i18n.RfCartStateSwitch'].default);
        assert.equal(config.settings.rf_cart_state, true);
        for (const [, variation] of CHANNELS) assert.equal(effectiveSettings(config, variation).rf_cart_state, true, variation);
    });

    for (const [channelId, variation] of CHANNELS) {
        const repo = effectiveSettings(config, variation);
        const categoryIds = treeOf(repo).length ? treeOf(repo) : null;

        it(`stops a release to ${channelId} ("${variation}") when the live value differs from config.json's (story 73)`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: { ...repo, rf_cart_state: false }, channelId, categoryIds,
            });
            assert.equal(result.pass, false);
            assert.ok(result.reasons.some(reason => reason.startsWith('rf_cart_state:')), result.reasons.join('; '));
        });

        it(`lets a release to ${channelId} through when the live value matches`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: { ...repo }, channelId, categoryIds,
            });
            assert.equal(result.pass, true, result.reasons.join('; '));
            assert.ok(result.values.some(entry => entry.key === 'rf_cart_state' && entry.value === true));
        });
    }

    it('is listed as a new switch, on, at channel 1\'s first push over Hero-2024, for Shaun to confirm (ticket 53)', () => {
        const repo = effectiveSettings(config, 'ReelFlies CA channel 1');
        const hero = Object.fromEntries(Object.entries(repo).filter(([key]) => !key.startsWith('rf_')));
        const result = checkRelease({
            repoSettings: repo, liveSettings: hero, channelId: 1, categoryIds: treeOf(repo),
        });
        assert.equal(result.pass, true, result.reasons.join('; '));
        assert.ok(result.newSwitches.includes('rf_cart_state'));
    });
});

describe('rf_cart_state in the switch matrix (ticket 54)', () => {
    const reading = templatesReading(moduleSwitches(config));
    const overlays = listOverlays().map(name => readOverlay(name));

    it('is read by a template, so its module has landed', () => {
        assert.ok(reading.has('rf_cart_state'), 'a template reads theme_settings.rf_cart_state');
    });

    it('renders off by rf_cart_state-off on both gated variations, with no problem in the plan', () => {
        for (const [, variation] of CHANNELS) {
            const plan = matrixPlan({
                config, variation, overlays, reading,
            });
            const row = plan.rows.find(({ switch: key }) => key === 'rf_cart_state');
            assert.ok(row, `${variation}: ${plan.rows.map(({ name }) => name).join(', ')}`);
            assert.equal(row.overlay, 'rf_cart_state-off');
            assert.equal(row.values.rf_cart_state, false);
            assert.ok(!plan.waiting.some(({ key }) => key === 'rf_cart_state'), variation);
            assert.deepEqual(plan.problems.filter(problem => /rf_cart_state/.test(problem)), [], variation);
        }
    });

    it('names its markers and its chunk, which the switch-off rows check are off the page', () => {
        assert.deepEqual(SWITCHES.rf_cart_state.markers, ['data-rf-cart-line', 'data-rf-cart-tag', 'data-rf-cart-dot', 'data-rf-cart-card']);
        assert.deepEqual(SWITCHES.rf_cart_state.chunks, ['rf-cart-state']);
    });
});
