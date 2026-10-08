// Ticket 53, Option A: the channel-1 variation (wave 1, lane B). Channel 1 is live reelflies.ca on
// tree 1. Its variation, "ReelFlies CA channel 1" (decision 10's interim name), is as thin as
// "ReelFlies CA" and "ReelFlies US": it holds only what differs on channel 1, which today is tree
// 1's menu ids. Merging it applies nothing to channel 1: only ticket 53's guarded channel-1 target
// takes it (wave 2, lane F: typed by Shaun at his own terminal, never an agent), and ticket 56
// pushes it there after Shaun approves it and its ids (53:7).
//
// From this ticket on, channel-1 gate runs render that variation, and their baselines live in
// scripts/qa/baselines/1-reelflies-ca-channel-1/ (build pipeline, wave 1, lane B).
//
//   node --test scripts/qa/channel-1-variation.test.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRelease } from '../release-guard.mjs';
import { effectiveSettings, MENU_ID_KEYS, threeWayDiff } from '../release-diff.mjs';
import { resolveTarget } from '../release-args.mjs';
import { validateThemeConfig } from '../release-schema.mjs';
import { CHANNELS, DEFAULT_VARIATION, defaultVariation } from './pages.mjs';
import { ROOT, slug } from './storefront.mjs';

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const NAME = 'ReelFlies CA channel 1';
const variationNamed = name => config.variations.find(variation => variation.name === name);

// Tree 1, as lane G re-read it from `stencil start -c 1` `?debug=context` on 2026-10-07 (ticket
// 53's comment, section 4), unchanged since refactor `data/current-tree-1.md` (2026-09-06).
// The visible top level, and the Fly-Type-like categories one level down under Flies, in tree
// order. Tree 1 has no Species root.
const FLIES = 398;
const TREE_1_TOP = [FLIES, 399, 400]; // Flies, Fly Selections & Fly Boxes, Fly Gear
const TREE_1_UNDER_FLIES = [438, 298, 251, 255, 272]; // Realistic Trout, Dry, Nymphs & Sub Surface, Streamers & Buggers, Saltwater, Warmwater & Salmon
const TREE_1_IDS = [...TREE_1_TOP, ...TREE_1_UNDER_FLIES];
// The menu's order: the ticket's (53:28-33), lane G's default (revisitable once ticket 28 says
// whether it renders in list order).
const TYPE_IDS = '298,251,255,272,438';

describe('config.json: the channel-1 variation', () => {
    const variation = variationNamed(NAME);

    it('is declared, after ReelFlies CA and ReelFlies US', () => {
        assert.ok(variation, `config.json has a variation named "${NAME}"`);
        assert.equal(variation.id, 'reelflies-ca-channel-1');
        // stencil start names a variation by its position (theme_config_id), and the gates check
        // it, so the two sets made before it keep positions 1 and 2.
        assert.deepEqual(config.variations.slice(0, 2).map(({ name }) => name), ['ReelFlies CA', 'ReelFlies US']);
    });

    it('points at reelflies.ca and has both screenshots in meta/', () => {
        assert.equal(variation.meta.demo_url, 'https://reelflies.ca');
        for (const key of ['desktop_screenshot', 'mobile_screenshot']) {
            assert.ok(fs.existsSync(path.join(ROOT, 'meta', variation.meta[key])), `meta/${variation.meta[key]} exists`);
        }
    });

    it('holds only what differs on channel 1: tree 1\'s menu ids', () => {
        assert.deepEqual(variation.settings, {
            rf_menu_type_ids: TYPE_IDS,
            rf_menu_species_root_id: '',
        });
    });

    it('names the five Fly-Type-like categories under Flies on tree 1, and no Species root', () => {
        const ids = variation.settings.rf_menu_type_ids.split(',').map(Number);
        assert.deepEqual([...ids].sort(), [...TREE_1_UNDER_FLIES].sort());
        assert.ok(!ids.some(id => TREE_1_TOP.includes(id)), 'no top-level category');
        assert.equal(variation.settings.rf_menu_species_root_id, '', 'tree 1 has no Species root');
    });

    it('keeps tree 1\'s ids out of every other variation, whose channels run other trees', () => {
        for (const { name, settings } of config.variations.filter(other => other.name !== NAME)) {
            for (const key of MENU_ID_KEYS) {
                const ids = String(settings[key] ?? '').split(',').filter(Boolean).map(Number);
                assert.deepEqual(ids.filter(id => TREE_1_IDS.includes(id)), [], `${name} ${key}`);
            }
        }
    });

    it('stays within stencil-cli\'s theme config schema: four variations at most, each with demo_url', () => {
        assert.ok(config.variations.length <= 4);
        assert.deepEqual(validateThemeConfig(config), []);
    });
});

describe('only the guarded channel-1 target takes the channel-1 variation (ticket 56 pushes it, after Shaun approves)', () => {
    it('is channel 1\'s only variation, and channel 1 is production, typed only', () => {
        const target = resolveTarget({ channel: '1', variation: NAME }, config);
        assert.equal(target.name, 'reelflies.ca');
        assert.deepEqual(target.variations, [NAME]);
        assert.equal(target.production, true);
        assert.deepEqual(target.confirmation, ['typed']);
        assert.throws(() => resolveTarget({ channel: '1', variation: 'ReelFlies CA' }, config), /isn't released to channel 1: reelflies\.ca takes "ReelFlies CA channel 1"/);
    });

    it('refuses the variation on ReelFlies_CA', () => {
        assert.throws(() => resolveTarget({ channel: '1895766', variation: NAME }, config), /isn't released to channel 1895766/);
    });
});

// Spec seam 5: the release guard on the channel-1 variation, as ticket 53's target runs it.
describe('the release guard and step 1 on the channel-1 variation (seam 5)', () => {
    const repo = effectiveSettings(config, NAME);
    // Channel 1 runs Hero-2024 until ticket 56's push: its Theme Styles hold no rf_* key.
    const hero = Object.fromEntries(Object.entries(repo).filter(([key]) => !key.startsWith('rf_')));

    it('lets the first push over Hero-2024 through, listing every switch as new for Shaun to confirm (53:44)', () => {
        const result = checkRelease({
            repoSettings: repo, liveSettings: hero, channelId: 1, categoryIds: TREE_1_IDS,
        });
        assert.equal(result.pass, true, result.reasons.join('; '));
        const switches = Object.keys(repo).filter(key => key.startsWith('rf_') && !MENU_ID_KEYS.includes(key)).sort();
        assert.deepEqual([...result.newSwitches].sort(), switches);
        assert.ok(result.values.some(({ key, value }) => key === 'rf_menu_type_ids' && value === TYPE_IDS));
    });

    it('doesn\'t stop step 1 on the first push: the rf_* keys are only in config.json', () => {
        const { blocking } = threeWayDiff({ repo, live: hero });
        assert.deepEqual(blocking.filter(entry => entry.key.startsWith('rf_')), []);
    });

    it('refuses the tree-1 ids against a tree that lacks them, such as a tree-4 channel', () => {
        const result = checkRelease({
            repoSettings: repo, liveSettings: hero, channelId: 1, categoryIds: [FLIES, 501, 502],
        });
        assert.equal(result.pass, false);
        assert.ok(result.reasons.some(reason => reason.includes('298')), result.reasons.join('; '));
    });

    it('accepts empty menu ids, which fall back to the stock menu', () => {
        const empty = { ...repo, rf_menu_type_ids: '', rf_menu_species_root_id: '' };
        const result = checkRelease({
            repoSettings: empty, liveSettings: hero, channelId: 1, categoryIds: null,
        });
        assert.equal(result.pass, true, result.reasons.join('; '));
    });
});

describe('the gates render channel 1 with its own variation', () => {
    it('names a variation for each channel that config.json has', () => {
        const names = config.variations.map(({ name }) => name);
        assert.ok(names.includes(DEFAULT_VARIATION));
        for (const channel of Object.keys(CHANNELS)) assert.ok(names.includes(defaultVariation(channel)), `channel ${channel}: ${defaultVariation(channel)}`);
    });

    it('defaults channel 1 to the channel-1 variation and every other channel to ReelFlies CA', () => {
        assert.equal(DEFAULT_VARIATION, 'ReelFlies CA');
        assert.equal(defaultVariation('1'), NAME);
        assert.equal(defaultVariation(1), NAME);
        assert.equal(defaultVariation('1895766'), 'ReelFlies CA');
        assert.equal(defaultVariation('1855224'), 'ReelFlies CA', 'unchanged: .com runs name ReelFlies US themselves');
        assert.equal(defaultVariation('42'), 'ReelFlies CA');
    });

    // storefront.mjs reads the environment once, when it loads.
    const load = env => {
        const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('QA_')));
        const script = 'const m = await import("./scripts/qa/storefront.mjs"); console.log(JSON.stringify([m.QA_VARIATION, m.BASELINE_SET]));';
        const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: ROOT, env: { ...clean, ...env }, encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr);
        return JSON.parse(run.stdout.trim().split('\n').pop());
    };

    it('runs QA_CHANNEL=1 as the channel-1 variation, into 1-reelflies-ca-channel-1/', () => {
        assert.deepEqual(load({ QA_CHANNEL: '1' }), [NAME, '1-reelflies-ca-channel-1']);
        assert.equal(`1-${slug(NAME)}`, '1-reelflies-ca-channel-1');
    });

    it('keeps ReelFlies_CA\'s runs, and an explicit QA_VARIATION, as they were', () => {
        assert.deepEqual(load({}), ['ReelFlies CA', '1895766-reelflies-ca']);
        assert.deepEqual(load({ QA_CHANNEL: '1', QA_VARIATION: 'ReelFlies CA' }), ['ReelFlies CA', '1-reelflies-ca']);
        assert.deepEqual(load({ QA_CHANNEL: '1855224', QA_VARIATION: 'ReelFlies US' }), ['ReelFlies US', '1855224-reelflies-us']);
    });

    const BASELINES = path.join(ROOT, 'scripts/qa/baselines');

    it('has a baseline in 1-reelflies-ca-channel-1/ for every page pinned on channel 1, at both widths', () => {
        for (const key of Object.keys(CHANNELS[1].pages)) {
            for (const project of ['phone-375', 'desktop-1280']) {
                const file = path.join(BASELINES, '1-reelflies-ca-channel-1', `${key}-${project}-darwin.png`);
                assert.ok(fs.existsSync(file), path.relative(ROOT, file));
            }
        }
    });

    it('has the widget self-test\'s shots for the channel-1 variation, which every qa:screens run takes', () => {
        for (const project of ['phone-375', 'desktop-1280']) {
            const file = path.join(BASELINES, 'widgets', 'reelflies-ca-channel-1', `rf-selftest-default-${project}-darwin.png`);
            assert.ok(fs.existsSync(file), path.relative(ROOT, file));
        }
    });

    it('leaves no channel-1 set under the old variation\'s name, so one set is kept up to date', () => {
        assert.equal(fs.existsSync(path.join(BASELINES, '1-reelflies-ca')), false);
    });
});
