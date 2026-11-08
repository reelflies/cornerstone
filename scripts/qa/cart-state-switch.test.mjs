// Cart state's switch (ticket 42; ticket 15's guard; story 73; spec seam 5; redesign step 2):
// rf_cart_state is a Theme Styles checkbox under Product cards, on in the base settings, which
// both gated variations inherit. A release whose config.json value differs from the channel's
// live one stops, with no flag to override it; the first push over Hero-2024 lists it as a new
// switch for Shaun to confirm. head.html reads it (context.rfCartState), so the switch matrix
// (ticket 54) renders every pin with it off too, through rf_cart_state-off; the module's whole
// effect is quick-add.js's, in the browser, so the entry names no marker or chunk of its own.
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
    it('is a Theme Styles checkbox under Product cards, with its label, on in the base settings and in both gated variations', () => {
        const group = schema.find(({ name }) => name === 'i18n.RfReelFlies');
        const heading = group.settings.findIndex(setting => setting.content === 'i18n.RfProductCards');
        const at = group.settings.findIndex(setting => setting.id === 'rf_cart_state');
        assert.ok(heading >= 0 && at > heading, 'rf_cart_state sits under the Product cards heading');
        const next = group.settings.findIndex((setting, index) => index > heading && setting.type === 'heading');
        assert.ok(next === -1 || at < next, 'and before the next heading');
        assert.deepEqual(group.settings[at], {
            type: 'checkbox', label: 'i18n.RfCartState', force_reload: true, id: 'rf_cart_state',
        });
        assert.ok(translations['i18n.RfCartState'].default);
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

    it('is read by a template (head.html injects it for quick-add.js), so its module has landed', () => {
        assert.ok(reading.has('rf_cart_state'), 'a template reads theme_settings.rf_cart_state');
        assert.match(fs.readFileSync(path.join(ROOT, 'templates/components/reelflies/head.html'), 'utf8'), /inject 'rfCartState' theme_settings\.rf_cart_state/);
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

    it('names no marker or chunk of its own, and says what the off row shows instead: the in-box tag every card carries is quick-add.js\'s to fill', () => {
        assert.deepEqual(SWITCHES.rf_cart_state.markers, []);
        assert.deepEqual(SWITCHES.rf_cart_state.chunks, []);
        assert.match(SWITCHES.rf_cart_state.browser, /in-box lines stay empty/);
        const card = fs.readFileSync(path.join(ROOT, 'templates/components/reelflies/fly.html'), 'utf8');
        assert.match(card, /<span class="rf-fly__inbox" data-rf-inbox hidden><\/span>/, 'the tag is on every card, whatever the switch says');
        assert.doesNotMatch(card, /rf_cart_state/);
        assert.match(fs.readFileSync(path.join(ROOT, 'assets/js/theme/reelflies/quick-add.js'), 'utf8'), /cartState: context\.rfCartState !== false/);
    });
});
