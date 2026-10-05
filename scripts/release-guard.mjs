// The release guard (ticket 15): a push can't silently turn a module on or off, or point the menu
// at categories the target channel doesn't have. Pure: no network, no files.
//
//   import { checkRelease, menuIdsSet } from './release-guard.mjs';
//   checkRelease({ repoSettings, liveSettings, channelId, categoryIds })
//     -> { pass, reasons, newSwitches, values, notices }
//
// repoSettings: config.json's settings for the target variation (base settings, variation on top).
// liveSettings: the channel's live saved Theme Styles (scripts/release-capture.mjs).
// categoryIds: the ids in the channel's category tree, or null when no menu id is set.
//
// Rule 1: every rf_* key other than the menu ids. A live value that differs from config.json
// fails, and no flag overrides it. A key only in config.json passes as a new switch (a module's
// first release). A key only on the live side fails, because removing a switch must be deliberate.
// Rule 2: rf_menu_type_ids (comma-separated) and rf_menu_species_root_id. Empty passes, because
// the menu falls back to the stock markup. A set id that isn't in the channel's tree fails.

import { isDeepStrictEqual } from 'util';
import { displayValue } from './release-diff.mjs';

export const MENU_ID_KEYS = ['rf_menu_type_ids', 'rf_menu_species_root_id'];

const has = (settings, key) => Object.prototype.hasOwnProperty.call(settings, key);
const isSwitch = key => key.startsWith('rf_') && !MENU_ID_KEYS.includes(key);
const menuIds = value => (value === undefined || value === null ? [] : String(value).split(',').map(id => id.trim()).filter(Boolean));

export function menuIdsSet(settings) {
    return MENU_ID_KEYS.some(key => menuIds(settings[key]).length > 0);
}

function checkSwitches(repo, live) {
    const reasons = [];
    const newSwitches = [];
    const keys = [...new Set([...Object.keys(repo), ...Object.keys(live)])].filter(isSwitch).sort();
    for (const key of keys) {
        if (!has(live, key)) {
            newSwitches.push(key);
        } else if (!has(repo, key)) {
            reasons.push(`${key} is only on the live theme (${displayValue(key, live[key])}): removing a switch must be deliberate, so the guard refuses it`);
        } else if (!isDeepStrictEqual(repo[key], live[key])) {
            reasons.push(`${key}: live ${displayValue(key, live[key])}, config.json ${displayValue(key, repo[key])}. No flag overrides this: set it back in Theme Styles, or change config.json to match, commit, and rerun`);
        }
    }
    return { reasons, newSwitches };
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

function menuIdNotices(repo, live) {
    return MENU_ID_KEYS
        .filter(key => has(live, key) && has(repo, key) && !isDeepStrictEqual(repo[key], live[key]))
        .map(key => `${key}: live ${displayValue(key, live[key])}, config.json ${displayValue(key, repo[key])}; the push sets config.json's value`);
}

export function checkRelease({
    repoSettings, liveSettings, channelId, categoryIds,
}) {
    const switches = checkSwitches(repoSettings, liveSettings);
    const reasons = [...switches.reasons, ...checkMenuIds(repoSettings, channelId, categoryIds)];
    const values = Object.keys(repoSettings).filter(key => key.startsWith('rf_')).sort().map(key => ({ key, value: repoSettings[key] }));
    return {
        pass: reasons.length === 0,
        reasons,
        newSwitches: switches.newSwitches,
        values,
        notices: menuIdNotices(repoSettings, liveSettings),
    };
}
