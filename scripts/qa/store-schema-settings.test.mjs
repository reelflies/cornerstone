// Ticket 40's rf_store_* settings (the home page's store schema and the footer's store block)
// against the release guard (spec seam 5) and Theme Styles. The Streamside Stone redesign's
// step 4 declared the "Store details" group again, rf_store_same_as first. ReelFlies_CA has run
// rf_store_same_as = "" since ticket 25's push (RELEASES.md), so the guard's rule 1 holds it
// there until Shaun sets it in Theme Styles first (CUSTOMIZATIONS.md, "Changing a pre-declared
// value"); the other nine keys are new to the live theme, so the next push lists them once as
// new and changes no live value.
//
//   node --test scripts/qa/store-schema-settings.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR } from './render/render.mjs';
import { checkRelease } from '../release-guard.mjs';
import { effectiveSettings, threeWayDiff } from '../release-diff.mjs';

const json = file => JSON.parse(fs.readFileSync(path.join(THEME_DIR, file), 'utf8'));
const config = json('config.json');
const NEW_KEYS = [
    'rf_store_name', 'rf_store_url', 'rf_store_legal_name', 'rf_store_phone', 'rf_store_street',
    'rf_store_locality', 'rf_store_region', 'rf_store_postal_code', 'rf_store_country',
];
// The variations a release pushes (scripts/release-targets.mjs): 1895766 and channel 1.
const RELEASED = ['ReelFlies CA', 'ReelFlies CA channel 1'];

describe('the rf_store_* settings', () => {
    it('sit in ticket 40\'s group, after rf_store_same_as, with reelflies.ca\'s values in the base', () => {
        const keys = Object.keys(config.settings);
        const at = keys.indexOf('rf_store_same_as');
        assert.deepEqual(keys.slice(at + 1, at + 1 + NEW_KEYS.length), NEW_KEYS);
        assert.deepEqual(Object.fromEntries(NEW_KEYS.map(key => [key, config.settings[key]])), {
            rf_store_name: 'ReelFlies.ca',
            rf_store_url: 'https://reelflies.ca/',
            rf_store_legal_name: 'Digital Barn Ltd.',
            rf_store_phone: '+1-866-250-4071',
            rf_store_street: '93 Broadway St',
            rf_store_locality: 'Tillsonburg',
            rf_store_region: 'ON',
            rf_store_postal_code: 'N4G 3P5',
            rf_store_country: 'CA',
        });
    });

    it('keep rf_store_same_as at the value 1895766 runs, "", on every variation a release pushes', () => {
        for (const variation of RELEASED) assert.equal(effectiveSettings(config, variation).rf_store_same_as, '', variation);
    });

    it('each have a Theme Styles text field under "Store details", so a value can be set live first', () => {
        const group = json('schema.json').find(item => item.name === 'i18n.RfReelFlies').settings;
        const heading = group.findIndex(setting => setting.content === 'i18n.RfStoreDetails');
        assert.ok(heading > 0, 'the Store details heading is in the ReelFlies group');
        assert.equal(json('schemaTranslations.json')['i18n.RfStoreDetails'].default, 'Store details');
        const next = group.findIndex((setting, index) => index > heading && setting.type === 'heading');
        const fields = group.slice(heading + 1, next);
        assert.deepEqual(fields.map(setting => setting.id), ['rf_store_same_as', ...NEW_KEYS]);
        assert.ok(fields.every(setting => setting.type === 'text'));
        for (const field of fields) assert.equal(typeof json('schemaTranslations.json')[field.label]?.default, 'string', `${field.id} has its label`);
    });
});

describe('the next release after ticket 40 (seam 5)', () => {
    for (const variation of RELEASED) {
        const repo = effectiveSettings(config, variation);
        // The live theme as the last release left it: every key but the new ones.
        const live = Object.fromEntries(Object.entries(repo).filter(([key]) => !NEW_KEYS.includes(key)));
        const tree = variation === 'ReelFlies CA' ? null : String(repo.rf_menu_type_ids).split(',').map(Number);

        it(`passes on ${variation}, listing the nine new rf_store_* keys once as new and no other`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: live, channelId: variation === 'ReelFlies CA' ? 1895766 : 1, categoryIds: tree,
            });
            assert.equal(result.pass, true, result.reasons.join('; '));
            assert.deepEqual(result.newSwitches.filter(key => key.startsWith('rf_store_')).sort(), [...NEW_KEYS].sort());
            assert.deepEqual(threeWayDiff({ repo, live, released: live }).blocking, []);
        });

        it(`refuses, on ${variation}, an rf_store_same_as config.json changes before Theme Styles holds it`, () => {
            const result = checkRelease({
                repoSettings: { ...repo, rf_store_same_as: 'facebook,instagram,youtube' }, liveSettings: repo, channelId: 1895766, categoryIds: tree,
            });
            assert.equal(result.pass, false);
            assert.ok(result.reasons.some(reason => reason.startsWith('rf_store_same_as: live ')));
        });
    }
});
