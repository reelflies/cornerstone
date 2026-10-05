// Compares the repo's Theme Styles for a variation with a channel's live saved settings
// (ticket 05, step 1). Pure: no network, no files.
//
//   import { effectiveSettings, diffSettings, blockingDifferences, acceptLiveValues } from './release-diff.mjs';

import { isDeepStrictEqual } from 'util';

// The menu category ids (ticket 15, rule 2). They aren't switches, so step 1 diffs them like any
// other setting, and the release guard checks that set ids are in the channel's category tree.
export const MENU_ID_KEYS = ['rf_menu_type_ids', 'rf_menu_species_root_id'];

// Module switches and other rf_* values: the release guard's rule 1, which no flag overrides.
// Step 1 leaves them to the guard.
export const isSwitchKey = key => key.startsWith('rf_') && !MENU_ID_KEYS.includes(key);

export const formatValue = value => JSON.stringify(value);

// Theme settings are public, but a credential pasted into one (Cavio's instagram-access-token,
// say) still shouldn't be copied into terminal output or RELEASES.md.
const CREDENTIAL = /token|secret|password|api[-_]?key/i;

export function displayValue(key, value) {
    if (CREDENTIAL.test(key) && value !== '' && value !== null && value !== undefined) {
        return `[hidden, ${String(value).length} characters]`;
    }
    return formatValue(value);
}

// What the storefront sees for a variation: base settings with the variation's settings on top.
export function effectiveSettings(config, variationName) {
    const variation = (config.variations || []).find(item => item.name === variationName);
    if (!variation) throw new Error(`"${variationName}" isn't a variation in config.json`);
    return { ...config.settings, ...variation.settings };
}

export function diffSettings(repo, live) {
    const keys = [...new Set([...Object.keys(repo), ...Object.keys(live)])].sort();
    const has = (settings, key) => Object.prototype.hasOwnProperty.call(settings, key);
    const diff = { changed: [], liveOnly: [], repoOnly: [] };
    for (const key of keys) {
        if (has(repo, key) && has(live, key)) {
            if (!isDeepStrictEqual(repo[key], live[key])) diff.changed.push({ key, repo: repo[key], live: live[key] });
        } else if (has(live, key)) {
            diff.liveOnly.push({ key, live: live[key] });
        } else {
            diff.repoOnly.push({ key, repo: repo[key] });
        }
    }
    return diff;
}

// Live values a push would overwrite or drop. Repo-only keys are new settings, so they pass.
export function blockingDifferences(diff) {
    return [...diff.changed, ...diff.liveOnly].filter(entry => !isSwitchKey(entry.key)).sort((a, b) => a.key.localeCompare(b.key));
}

// Writes live values into the variation's settings, keeping config.json's 2-space formatting.
export function acceptLiveValues(configText, variationName, entries) {
    const config = JSON.parse(configText);
    const variation = config.variations.find(item => item.name === variationName);
    if (!variation) throw new Error(`"${variationName}" isn't a variation in config.json`);
    variation.settings = variation.settings || {};
    for (const { key, live } of entries) variation.settings[key] = live;
    return `${JSON.stringify(config, null, 2)}\n`;
}

// Step 6: after a push, the channel runs a new theme or version with the target variation, and its
// saved settings are the repo's effective settings. `before` is the capture taken just before the push.
export function verifyRelease({
    before, after, config, variation,
}) {
    const problems = [];
    const live = after.capture;
    if (live.themeUuid === before.themeUuid && live.themeVersionUuid === before.themeVersionUuid) {
        problems.push(`the channel still runs theme ${live.themeUuid} (version ${live.themeVersionUuid}): the push didn't change the active theme`);
    }
    if (live.themeName !== config.name) problems.push(`the live theme is "${live.themeName}", not "${config.name}"`);
    if (live.variationName !== variation) problems.push(`the live variation is "${live.variationName}", not "${variation}"`);
    const diff = diffSettings(effectiveSettings(config, variation), after.settings);
    for (const entry of diff.changed) problems.push(`${entry.key}: live ${displayValue(entry.key, entry.live)}, config.json ${displayValue(entry.key, entry.repo)}`);
    for (const entry of diff.liveOnly) problems.push(`${entry.key} is only on the live theme`);
    for (const entry of diff.repoOnly) problems.push(`${entry.key} is missing on the live theme`);
    return problems;
}
