import test from 'node:test';
import assert from 'node:assert/strict';
import { describeLiveTheme, isThisFork, toLiveConfig } from './release-capture.mjs';

// Shapes as the Themes API returned them for ReelFlies_CA on 2026-10-05 (trimmed).
const THEME = '25121d00-dd0c-013d-4919-76cf528056e2';
const raw = {
    channelId: 1895766,
    themes: [
        {
            uuid: 'e3d82ce0-9bae-0133-0de7-525400970412', name: 'Cornerstone', is_private: false, is_active: false,
        },
        {
            uuid: THEME, name: 'Cavio', is_private: false, is_active: true,
        },
    ],
    active: {
        active_theme_uuid: THEME,
        active_theme_configuration_uuid: '5ccf46c0-9d28-013f-22d4-1635e1ac7e32',
        active_theme_version_uuid: 'c49e4aa0-1a50-013f-eb22-72d48cc2b3c3',
        saved_theme_configuration_uuid: '5ccf46c0-9d28-013f-22d4-1635e1ac7e32',
    },
    variations: [
        { uuid: 'c4bf7600-1a50-013f-eb22-72d48cc2b3c3', name: 'Natural' },
        { uuid: 'c4ccb320-1a50-013f-eb22-72d48cc2b3c3', name: 'Parts' },
    ],
    savedConfiguration: { uuid: '5ccf46c0-9d28-013f-22d4-1635e1ac7e32', variation_uuid: 'c4bf7600-1a50-013f-eb22-72d48cc2b3c3', settings: { hide_blog: false, 'body-bg': '#ffffff' } },
    activeConfiguration: { uuid: '5ccf46c0-9d28-013f-22d4-1635e1ac7e32', variation_uuid: 'c4bf7600-1a50-013f-eb22-72d48cc2b3c3', settings: { hide_blog: false, 'body-bg': '#ffffff' } },
};

test('a capture reads like a theme config, so the diff and the contrast check can use it', () => {
    const live = toLiveConfig(raw, '2026-10-05T12:00:00.000Z');
    assert.equal(live.name, 'Cavio');
    assert.deepEqual(live.settings, { hide_blog: false, 'body-bg': '#ffffff' });
    assert.deepEqual(live.variations, [{ name: 'Natural', settings: {} }]);
    assert.deepEqual(live.capture, {
        channelId: 1895766,
        themeUuid: THEME,
        themeName: 'Cavio',
        themeVersionUuid: 'c49e4aa0-1a50-013f-eb22-72d48cc2b3c3',
        variationName: 'Natural',
        variationUuid: 'c4bf7600-1a50-013f-eb22-72d48cc2b3c3',
        activeConfigurationUuid: '5ccf46c0-9d28-013f-22d4-1635e1ac7e32',
        savedConfigurationUuid: '5ccf46c0-9d28-013f-22d4-1635e1ac7e32',
        savedEqualsActive: true,
        unpublishedKeys: [],
        themeCount: 2,
        capturedAt: '2026-10-05T12:00:00.000Z',
    });
});

test('unpublished Theme Styles edits are the saved settings, and the keys that differ are listed', () => {
    const live = toLiveConfig({
        ...raw,
        active: { ...raw.active, saved_theme_configuration_uuid: 'saved-1' },
        savedConfiguration: { ...raw.savedConfiguration, uuid: 'saved-1', settings: { hide_blog: true, 'body-bg': '#ffffff' } },
    }, '2026-10-05T12:00:00.000Z');
    assert.equal(live.capture.savedEqualsActive, false);
    assert.deepEqual(live.settings, { hide_blog: true, 'body-bg': '#ffffff' });
    assert.deepEqual(live.capture.unpublishedKeys, ['hide_blog']);
});

test('the channel runs this fork only with the same theme name and one of its variations', () => {
    const config = { name: 'Cornerstone', variations: [{ name: 'ReelFlies CA' }, { name: 'ReelFlies US' }] };
    const live = (name, variation) => ({ capture: { themeName: name, variationName: variation } });
    assert.equal(isThisFork(live('Cornerstone', 'ReelFlies CA'), config), true);
    assert.equal(isThisFork(live('Cavio', 'Natural'), config), false);
    assert.equal(isThisFork(live('Cornerstone', 'Light'), config), false, 'stock Cornerstone from the Marketplace');
});

test('the live theme is described by name, variation and uuid', () => {
    assert.equal(describeLiveTheme(toLiveConfig(raw, 'now')), `Cavio · variation "Natural" (theme ${THEME})`);
});
