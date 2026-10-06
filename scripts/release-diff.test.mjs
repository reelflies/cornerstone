import test from 'node:test';
import assert from 'node:assert/strict';
import {
    acceptLiveValues, blockingDifferences, changedKeys, diffSettings, displayValue, effectiveSettings, hasSetting, threeWayDiff, verifyRelease,
} from './release-diff.mjs';

const config = {
    name: 'Cornerstone',
    settings: { 'body-bg': '#ffffff', logo_size: '250x100', channels: [] },
    variations: [
        { name: 'ReelFlies CA', settings: { logo_size: '300x100' } },
        { name: 'ReelFlies US', settings: {} },
    ],
};

test('a variation sees the base settings with its own settings on top', () => {
    assert.deepEqual(effectiveSettings(config, 'ReelFlies CA'), { 'body-bg': '#ffffff', logo_size: '300x100', channels: [] });
    assert.deepEqual(effectiveSettings(config, 'ReelFlies US'), { 'body-bg': '#ffffff', logo_size: '250x100', channels: [] });
    assert.throws(() => effectiveSettings(config, 'Light'), /Light/);
});

test('the diff lists changed, live-only and repo-only keys with both values', () => {
    const diff = diffSettings(
        {
            'body-bg': '#ffffff', logo_size: '300x100', rf_quick_add: true, channels: ['a'],
        },
        {
            'body-bg': '#fafafa', logo_size: '300x100', homepage_show_carousel: false, channels: ['a'],
        },
    );
    assert.deepEqual(diff.changed, [{ key: 'body-bg', repo: '#ffffff', live: '#fafafa' }]);
    assert.deepEqual(diff.liveOnly, [{ key: 'homepage_show_carousel', live: false }]);
    assert.deepEqual(diff.repoOnly, [{ key: 'rf_quick_add', repo: true }]);
});

test('a setting is there when its key is, whatever its value, and inherited keys don\'t count', () => {
    assert.equal(hasSetting({ rf_menu_type_ids: '' }, 'rf_menu_type_ids'), true);
    assert.equal(hasSetting({ logo: null }, 'logo'), true);
    assert.equal(hasSetting({}, 'toString'), false);
});

test('the changed keys are every key that differs, is only on one side, sorted', () => {
    assert.deepEqual(changedKeys(
        { 'body-bg': '#ffffff', logo_size: '300x100', rf_quick_add: true },
        { 'body-bg': '#fafafa', logo_size: '300x100', homepage_show_carousel: false },
    ), ['body-bg', 'homepage_show_carousel', 'rf_quick_add']);
    assert.deepEqual(changedKeys({ channels: ['a'] }, { channels: ['a'] }), [], 'values are compared deeply');
});

test('changed and live-only keys stop step 1, except the rf_* switches, which the guard owns', () => {
    const diff = diffSettings(
        { 'body-bg': '#ffffff', rf_quick_add: true, new_setting: 1 },
        {
            'body-bg': '#000000', rf_quick_add: false, rf_rise: true, old_setting: 'x',
        },
    );
    assert.deepEqual(blockingDifferences(diff).map(entry => entry.key), ['body-bg', 'old_setting']);
});

test('the menu ids aren\'t switches, so a changed or live-only menu id stops step 1', () => {
    const diff = diffSettings(
        { rf_menu_type_ids: '23,24' },
        { rf_menu_type_ids: '23', rf_menu_species_root_id: '25' },
    );
    assert.deepEqual(blockingDifferences(diff), [
        { key: 'rf_menu_species_root_id', live: '25' },
        { key: 'rf_menu_type_ids', repo: '23,24', live: '23' },
    ]);
});

test('accepting live values writes them into the variation and keeps the file\'s formatting', () => {
    const text = `${JSON.stringify(config, null, 2)}\n`;
    const accepted = acceptLiveValues(text, 'ReelFlies CA', [
        { key: 'body-bg', live: '#fafafa' },
        { key: 'homepage_show_carousel', live: false },
    ]);
    assert.ok(accepted.endsWith('}\n'));
    assert.match(accepted, /\n {6}"settings": \{\n {8}"logo_size": "300x100",\n {8}"body-bg": "#fafafa",\n {8}"homepage_show_carousel": false\n {6}\}/);
    const parsed = JSON.parse(accepted);
    assert.deepEqual(parsed.settings, config.settings, 'base settings are untouched');
    assert.deepEqual(parsed.variations[1], config.variations[1], 'other variations are untouched');
});

test('verify passes when the channel runs the new theme with the target variation and config.json\'s settings', () => {
    const before = { themeUuid: 'cavio', themeVersionUuid: 'v1' };
    const after = {
        settings: { 'body-bg': '#ffffff', logo_size: '300x100', channels: [] },
        capture: {
            themeUuid: 'fork', themeVersionUuid: 'v9', themeName: 'Cornerstone', variationName: 'ReelFlies CA',
        },
    };
    assert.deepEqual(verifyRelease({
        before, after, config, variation: 'ReelFlies CA',
    }), []);
});

test('verify reports an unchanged theme, the wrong variation and every settings difference', () => {
    const before = { themeUuid: 'fork', themeVersionUuid: 'v9' };
    const after = {
        settings: { 'body-bg': '#000000', channels: [], extra: 1 },
        capture: {
            themeUuid: 'fork', themeVersionUuid: 'v9', themeName: 'Cornerstone', variationName: 'ReelFlies US',
        },
    };
    assert.deepEqual(verifyRelease({
        before, after, config, variation: 'ReelFlies CA',
    }), [
        'the channel still runs theme fork (version v9): the push didn\'t change the active theme',
        'the live variation is "ReelFlies US", not "ReelFlies CA"',
        'body-bg: live "#000000", config.json "#ffffff"',
        'extra is only on the live theme',
        'logo_size is missing on the live theme',
    ]);
});

test('values of settings named like credentials are never shown, only their length', () => {
    assert.equal(displayValue('instagram-access-token', 'IGQVJabcdefghijklmnop'), '[hidden, 21 characters]');
    assert.equal(displayValue('rf_api_key', 'abc'), '[hidden, 3 characters]');
    assert.equal(displayValue('client_secret', ''), '""');
    assert.equal(displayValue('body-bg', '#ffffff'), '"#ffffff"');
    assert.equal(displayValue('rf_quick_add', false), 'false');
});

// --- W0-2: the three-way diff, with config.json at the channel's last release ---------------

const released = { 'body-bg': '#ffffff', logo_size: '300x100', channels: ['a'] };

test('W0-2: a key the repo changed passes as "changed in repo" while the live value is still the released one', () => {
    const result = threeWayDiff({
        repo: { ...released, 'body-bg': '#000000', channels: ['b'] },
        live: released,
        released,
    });
    assert.deepEqual(result.changedInRepo, [
        {
            key: 'body-bg', repo: '#000000', live: '#ffffff', released: '#ffffff',
        },
        {
            key: 'channels', repo: ['b'], live: ['a'], released: ['a'],
        },
    ], 'values are compared deeply');
    assert.deepEqual(result.blocking, []);
});

test('W0-2: a live value that differs from the last release blocks, as a control-panel edit, with the released value', () => {
    const result = threeWayDiff({ repo: released, live: { ...released, 'body-bg': '#fafafa' }, released });
    assert.deepEqual(result.blocking, [{
        key: 'body-bg', repo: '#ffffff', live: '#fafafa', released: '#ffffff',
    }]);
    assert.deepEqual(result.changedInRepo, []);
});

test('W0-2: a key changed in both the repo and the control panel blocks, with all three values', () => {
    const result = threeWayDiff({ repo: { ...released, 'body-bg': '#000000' }, live: { ...released, 'body-bg': '#fafafa' }, released });
    assert.deepEqual(result.blocking, [{
        key: 'body-bg', repo: '#000000', live: '#fafafa', released: '#ffffff',
    }]);
    assert.deepEqual(result.changedInRepo, []);
});

test('W0-2: the same change made in the repo and the control panel is no difference at all', () => {
    const result = threeWayDiff({ repo: { ...released, 'body-bg': '#000000' }, live: { ...released, 'body-bg': '#000000' }, released });
    assert.deepEqual(result, { diff: { changed: [], liveOnly: [], repoOnly: [] }, blocking: [], changedInRepo: [] });
});

test('W0-2: a key the repo removed passes while live holds the released value; a live-only key the release never had blocks', () => {
    const result = threeWayDiff({
        repo: { 'body-bg': '#ffffff' },
        live: {
            'body-bg': '#ffffff', logo_size: '300x100', channels: ['a'], added_live: 1,
        },
        released,
    });
    assert.deepEqual(result.changedInRepo, [
        { key: 'channels', live: ['a'], released: ['a'] },
        { key: 'logo_size', live: '300x100', released: '300x100' },
    ]);
    assert.deepEqual(result.blocking, [{ key: 'added_live', live: 1 }]);
});

test('W0-2: a key the repo added still passes as new, and a key only the last release had changes nothing', () => {
    const result = threeWayDiff({ repo: { ...released, new_setting: 3 }, live: { 'body-bg': '#ffffff', channels: ['a'] }, released });
    assert.deepEqual(result.diff.repoOnly, [{ key: 'logo_size', repo: '300x100' }, { key: 'new_setting', repo: 3 }]);
    assert.deepEqual(result.blocking, []);
    assert.deepEqual(result.changedInRepo, []);
});

test('W0-2: a published value that differs from the last release blocks, though the saved draft has the released value', () => {
    const result = threeWayDiff({
        repo: { ...released, 'body-bg': '#000000' },
        live: released,
        published: { ...released, 'body-bg': '#eeeeee' },
        released,
    });
    assert.deepEqual(result.blocking, [{
        key: 'body-bg', repo: '#000000', live: '#ffffff', released: '#ffffff', published: '#eeeeee',
    }]);
    assert.deepEqual(result.changedInRepo, []);
});

test('W0-2: the rf_* switches stay with the release guard; the menu ids follow the three-way rule', () => {
    const live = {
        rf_quick_add: false, rf_menu_type_ids: '', rf_menu_species_root_id: '', rf_rise: true,
    };
    const result = threeWayDiff({
        repo: { rf_quick_add: true, rf_menu_type_ids: '23,24', rf_menu_species_root_id: '25' },
        live,
        released: live,
    });
    assert.deepEqual(result.changedInRepo.map(entry => entry.key), ['rf_menu_species_root_id', 'rf_menu_type_ids']);
    assert.deepEqual(result.blocking, []);
});

test('W0-2: with no last release every difference blocks, exactly as the two-way diff did', () => {
    const repo = { 'body-bg': '#000000', rf_quick_add: true, new_setting: 1 };
    const live = {
        'body-bg': '#ffffff', rf_quick_add: false, old_setting: 'x',
    };
    const result = threeWayDiff({ repo, live, released: null });
    assert.deepEqual(result.blocking, blockingDifferences(diffSettings(repo, live)));
    assert.deepEqual(result.changedInRepo, []);
    assert.deepEqual(result.diff, diffSettings(repo, live));
});
