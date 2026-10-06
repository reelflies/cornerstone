// Ticket 21's three-part test for a settings write (plan/build-pipeline.md section 5). A settings
// write on 1895766 is lifted only when all three hold:
//
//   1. The endpoint takes channel_id in the query or the body.
//   2. A GET with channel_id=1895766 shows an override field.
//   3. After the write, the global value and channels 1 and 1855224 read back unchanged.
//
// plan.mjs proves parts 1 and 2 by its own reads before it writes a key, and records the proof;
// apply.mjs proves them again on its fresh reads and refuses a settings write without both.
// Part 3 is apply.mjs's check after the write, so it isn't the first discovery.
//
// How the reads prove them, on BigCommerce's documented behaviour (a read with channel_id shows
// the channel's overrides, null where the channel inherits the global value):
//
// - Part 1: the read with channel_id=1895766 answered with a data object that isn't the global
//   read's. An endpoint that ignored channel_id would answer with the global settings, so an
//   identical answer proves nothing, and the write is refused.
// - Part 2: for each key written, the channel read shows the field: null (the channel inherits,
//   and the field takes an override) or a value (already overridden). A key the channel read
//   doesn't show, a key the global read doesn't have, and a key BigCommerce documents as global-
//   only are refused. So an empty channel read ({}, "inherits everything") proves part 1 but no
//   key: on such an endpoint the write goes to Shaun's batch (revisitable, once probe 10 shows
//   what the store returns).

import { isDeepStrictEqual } from 'util';

export const PART3_SCOPES = ['global', '1', '1855224'];

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const show = value => JSON.stringify(value);

function part1(globalData, channelData) {
    if (!isObject(channelData)) return { proved: false, evidence: 'the GET with channel_id=1895766 returned no data object' };
    if (!isObject(globalData)) return { proved: false, evidence: 'the global GET returned no data object' };
    if (isDeepStrictEqual(channelData, globalData)) {
        return { proved: false, evidence: 'the GET with channel_id=1895766 returned exactly the global settings, so the endpoint may ignore channel_id' };
    }
    const fields = Object.keys(channelData);
    const nulls = fields.filter(key => channelData[key] === null).length;
    return {
        proved: true,
        evidence: `GET ?channel_id=1895766 answered with its own view (${fields.length} fields, ${nulls} of them null), not the global read's ${Object.keys(globalData).length} fields`,
    };
}

function part2(key, globalData, channelData, globalOnly) {
    if (globalOnly.includes(key)) return { key, proved: false, evidence: `BigCommerce documents ${key} as global-only` };
    if (!isObject(globalData) || !Object.hasOwn(globalData, key)) return { key, proved: false, evidence: `the global read has no field ${key}` };
    if (!isObject(channelData) || !Object.hasOwn(channelData, key)) return { key, proved: false, evidence: `the channel read shows no override field for ${key}` };
    if (channelData[key] === null) return { key, proved: true, evidence: `shown as null: 1895766 inherits the global value ${show(globalData[key])}` };
    return { key, proved: true, evidence: `shown with the channel's own value ${show(channelData[key])} (the global value is ${show(globalData[key])})` };
}

// Parts 1 and 2 for writing `body` to one settings endpoint, from its global read and its read
// with channel_id=1895766 (each the response's `data`).
export function proveSettingsWrite({
    settingsPath, body, globalData, channelData, globalOnly = [],
}) {
    const first = part1(globalData, channelData);
    const second = Object.keys(body).map(key => part2(key, globalData, channelData, globalOnly));
    return {
        settings: settingsPath, proved: first.proved && second.every(item => item.proved), part1: first, part2: second,
    };
}

// Part 3: what changed between the reads before the write and after it, for the global value and
// channels 1 and 1855224 (or the scopes given). Each argument maps a scope to that read's data.
// Empty means unchanged.
export function part3Changes(before, after, scopes = PART3_SCOPES) {
    const changes = [];
    for (const scope of scopes) {
        const was = before[scope];
        const now = after[scope];
        if (!isObject(was) || !isObject(now)) {
            if (!isDeepStrictEqual(was, now)) changes.push({ scope, keys: ['(the whole read)'] });
        } else {
            const keys = [...new Set([...Object.keys(was), ...Object.keys(now)])].filter(key => !isDeepStrictEqual(was[key], now[key]));
            if (keys.length) changes.push({ scope, keys });
        }
    }
    return changes;
}
