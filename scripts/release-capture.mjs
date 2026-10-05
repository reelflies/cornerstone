// Captures a channel's live theme and Theme Styles, read-only (ticket 05, step 1).
//
//   import { captureLive, toLiveConfig, isThisFork } from './release-capture.mjs';
//
// `stencil pull` can't be used: it crashes when config.json has no variation named like the live
// one, and it skips live keys that config.json lacks. This uses stencil-cli's own API client and
// only its GET calls, like plan/reference/theme-configs-2026-10-05/capture.mjs. The capture has a
// theme config's shape, so scripts/check-contrast.mjs can read it too. The token is never printed.

import fs from 'fs';
import { changedKeys } from './release-diff.mjs';

const API_HOST = 'https://api.bigcommerce.com';
const STENCIL_CLIENT = '../node_modules/@bigcommerce/stencil-cli/lib/theme-api-client.js';

// raw: { channelId, themes, active, variations, savedConfiguration, activeConfiguration }
export function toLiveConfig(raw, capturedAt) {
    const { active, savedConfiguration: saved, activeConfiguration } = raw;
    const theme = raw.themes.find(item => item.uuid === active.active_theme_uuid);
    const variation = raw.variations.find(item => item.uuid === saved.variation_uuid);
    const savedEqualsActive = active.saved_theme_configuration_uuid === active.active_theme_configuration_uuid;
    const variationName = variation ? variation.name : saved.variation_uuid;
    return {
        name: theme ? theme.name : active.active_theme_uuid,
        settings: saved.settings,
        variations: [{ name: variationName, settings: {} }],
        capture: {
            channelId: raw.channelId,
            themeUuid: active.active_theme_uuid,
            themeName: theme ? theme.name : null,
            themeVersionUuid: active.active_theme_version_uuid,
            variationName,
            variationUuid: saved.variation_uuid,
            activeConfigurationUuid: active.active_theme_configuration_uuid,
            savedConfigurationUuid: active.saved_theme_configuration_uuid,
            savedEqualsActive,
            unpublishedKeys: changedKeys(saved.settings, activeConfiguration.settings),
            publishedSettings: activeConfiguration.settings, // what shoppers see; the release guard checks both
            themeCount: raw.themes.length,
            capturedAt,
        },
    };
}

// The diff means something only when the channel already runs this fork: its live variation is one
// of config.json's, or its theme is one the release pushed (releasedUuids, from RELEASES.md). The
// theme's name doesn't count, because config.json's name can change between releases.
export function isThisFork(live, config, releasedUuids = []) {
    return (config.variations || []).some(item => item.name === live.capture.variationName)
        || releasedUuids.includes(live.capture.themeUuid);
}

// Takes a capture's `capture` fields, or the ones step 1 records of the theme a first release replaces.
export function describeLiveTheme({ themeName, variationName, themeUuid }) {
    return `${themeName} · variation "${variationName}" (theme ${themeUuid})`;
}

// Credentials from `stencil init`. Read at runtime only; never printed or copied.
function readStencilCredentials() {
    const read = file => {
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (error) {
            throw new Error(`can't read ${file}: run \`npx stencil init\` first (${error.code || 'unreadable'})`);
        }
    };
    const { normalStoreUrl } = read('config.stencil.json');
    const { accessToken } = read('secrets.stencil.json');
    if (!normalStoreUrl || !accessToken) throw new Error('config.stencil.json or secrets.stencil.json is incomplete: run `npx stencil init`');
    return { normalStoreUrl, accessToken };
}

async function loadStencilClient() {
    const { default: client } = await import(new URL(STENCIL_CLIENT, import.meta.url).href);
    return client;
}

export async function getStoreHash() {
    const client = await loadStencilClient();
    const { normalStoreUrl } = readStencilCredentials();
    return client.getStoreHash({ storeUrl: normalStoreUrl });
}

// GET calls only. Errors carry stencil-cli's message, never the request (which holds the token).
export async function captureLive(channelId) {
    const client = await loadStencilClient();
    const { normalStoreUrl, accessToken } = readStencilCredentials();
    try {
        const storeHash = await client.getStoreHash({ storeUrl: normalStoreUrl });
        const api = { accessToken, apiHost: API_HOST, storeHash };
        const themes = await client.getThemes(api);
        const active = await client.getChannelActiveTheme({ ...api, channelId });
        const themeId = active.active_theme_uuid;
        const variations = await client.getVariationsByThemeId({ ...api, themeId });
        const savedConfiguration = await client.getThemeConfiguration({ ...api, themeId, configurationId: active.saved_theme_configuration_uuid });
        const activeConfiguration = active.saved_theme_configuration_uuid === active.active_theme_configuration_uuid
            ? savedConfiguration
            : await client.getThemeConfiguration({ ...api, themeId, configurationId: active.active_theme_configuration_uuid });
        return toLiveConfig({
            channelId, themes, active, variations, savedConfiguration, activeConfiguration,
        }, new Date().toISOString());
    } catch (error) {
        throw new Error(`capture of channel ${channelId} failed: ${error.message}`);
    }
}
