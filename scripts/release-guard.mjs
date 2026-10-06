// The release guard (ticket 15): a push can't silently turn a module on or off, or point the menu
// at categories the target channel doesn't have. Pure: no network, no files.
//
//   import { checkRelease, menuIdsSet } from './release-guard.mjs';
//   checkRelease({ repoSettings, liveSettings, publishedSettings, channelId, categoryIds })
//     -> { pass, reasons, newSwitches, values }
//
// repoSettings: config.json's settings for the target variation (base settings, variation on top).
// liveSettings: the channel's live saved Theme Styles (scripts/release-capture.mjs).
// publishedSettings: its published Theme Styles, what shoppers see. They differ from the saved
//   ones while an edit is saved but not published. Omitted, they are taken to equal liveSettings.
// categoryIds: the ids in the channel's category tree, or null when no menu id is set.
//
// Rule 1: every rf_* key other than the menu ids. A live value that differs from config.json
// fails, and no flag overrides it. A key only in config.json passes as a new switch (a module's
// first release). A key only on the live side fails, because removing a switch must be deliberate.
// A switch with an unpublished draft is checked on both sides, so a push can't change what
// shoppers see when only the draft matches config.json.
// Rule 2: rf_menu_type_ids (comma-separated) and rf_menu_species_root_id. Empty passes, because
// the menu falls back to the stock markup. A set id that isn't in the channel's tree fails. A live
// menu id that differs from config.json, or exists only on the live side, is step 1's, like any
// other Theme Styles setting (scripts/release-diff.mjs threeWayDiff): it passes when config.json
// changed it since the channel's last release and the live id is still the released one (W0-2),
// and otherwise stops step 1 as a control-panel edit.

import { isDeepStrictEqual } from 'util';
import {
    changedKeys, displayValue, hasSetting, isSwitchKey, MENU_ID_KEYS,
} from './release-diff.mjs';

const menuIds = value => (value === undefined || value === null ? [] : String(value).split(',').map(id => id.trim()).filter(Boolean));

export function menuIdsSet(settings) {
    return MENU_ID_KEYS.some(key => menuIds(settings[key]).length > 0);
}

// The switches config.json and the saved settings differ on: new, live only, or changed.
function checkSwitches(repo, live) {
    const reasons = [];
    const newSwitches = [];
    for (const key of changedKeys(repo, live).filter(isSwitchKey)) {
        if (!hasSetting(live, key)) {
            newSwitches.push(key);
        } else if (!hasSetting(repo, key)) {
            reasons.push(`${key} is only on the live theme (${displayValue(key, live[key])}): removing a switch must be deliberate, so the guard refuses it`);
        } else {
            reasons.push(`${key}: live ${displayValue(key, live[key])}, config.json ${displayValue(key, repo[key])}. No flag overrides this: set it back in Theme Styles, or change config.json to match, commit, and rerun`);
        }
    }
    return { reasons, newSwitches };
}

// Only published switches whose value differs from the saved one: checkSwitches covers the rest.
function checkPublishedSwitches(repo, saved, published) {
    const reasons = [];
    const keys = changedKeys(saved, published).filter(key => isSwitchKey(key) && hasSetting(published, key));
    for (const key of keys) {
        const value = displayValue(key, published[key]);
        const draft = hasSetting(saved, key) ? displayValue(key, saved[key]) : 'no value';
        if (!hasSetting(repo, key)) {
            reasons.push(`${key} is only on the live theme, published ${value} (the saved draft has ${draft}): removing a switch must be deliberate, so the guard refuses it`);
        } else if (!isDeepStrictEqual(repo[key], published[key])) {
            reasons.push(`${key}: published ${value} (what shoppers see), config.json ${displayValue(key, repo[key])}; the saved draft has ${draft}. No flag overrides this: publish the draft in Theme Styles, or set the draft and config.json to the published value, commit, and rerun`);
        }
    }
    return reasons;
}

function checkMenuIds(repo, channelId, categoryIds) {
    const reasons = [];
    const known = categoryIds ? new Set(categoryIds.map(Number)) : null;
    for (const key of MENU_ID_KEYS) {
        const ids = menuIds(repo[key]);
        if (ids.length && !known) {
            reasons.push(`${key} is set, but channel ${channelId}'s category tree wasn't read`);
        } else {
            for (const id of ids) {
                if (!/^\d+$/.test(id)) reasons.push(`${key}: "${id}" isn't a category id`);
                else if (!known.has(Number(id))) reasons.push(`${key}: category ${id} isn't in channel ${channelId}'s category tree`);
            }
        }
    }
    return reasons;
}

export function checkRelease({
    repoSettings, liveSettings, publishedSettings = liveSettings, channelId, categoryIds,
}) {
    const switches = checkSwitches(repoSettings, liveSettings);
    const reasons = [
        ...switches.reasons,
        ...checkPublishedSwitches(repoSettings, liveSettings, publishedSettings),
        ...checkMenuIds(repoSettings, channelId, categoryIds),
    ];
    const values = Object.keys(repoSettings).filter(key => key.startsWith('rf_')).sort().map(key => ({ key, value: repoSettings[key] }));
    return {
        pass: reasons.length === 0,
        reasons,
        newSwitches: switches.newSwitches,
        values,
    };
}
