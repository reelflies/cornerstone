// Snapshots for the store-write helper (W0-11): the GETs taken before a write, their sha256, and
// the files they are kept in, outside git (as ticket 18 keeps catalogue snapshots in
// ~/reelflies/catalog/snapshots/):
//
//   ~/reelflies/store-snapshots/<channel>/<object>/<time>-<label>.json
//
// - A create reads the channel's whole list of that object (every page), so the plan shows what
//   exists and apply notices anything added since.
// - An update reads its item, which must name channel 1895766.
// - A lifted settings write reads the setting for 1895766, globally, and for channels 1 and
//   1855224: parts 1 and 2 of ticket 21's test are proved from the first two, and part 3 is
//   checked against the last three.
// - An approved write reads the global setting and the three channels, or the promotion.
//
// The snapshot's sha256 is over its reads in canonical JSON (keys sorted), so apply can tell
// whether anything changed since the plan. Any read that names a channel other than 1895766
// (bar the settings reads of other channels, which are read on purpose) stops the run.
//
// RF_STORE_ROOT moves the folder for tests, and only under `node --test`: a real run refuses it,
// so every plan, apply and log row lands in the one place the orchestrator mirrors from.

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { APPROVED_SETTINGS } from './allowlist.mjs';
import { CHANNEL, LIVE_CHANNELS, responseChannelProblems } from './channel.mjs';
import { describeFailure, queryString } from './client.mjs';

// A read or a write that stops the run. `channel` is true when a response named a channel other
// than 1895766, which after a write also locks the helper (apply.mjs).
export class Stopped extends Error {
    constructor(message, { channel = false } = {}) {
        super(message);
        this.name = 'Stopped';
        this.channel = channel;
    }
}

const PAGE_SIZE = 250;
const MAX_PAGES = 40;

export function storeRoot(env = process.env) {
    if (env.RF_STORE_ROOT) {
        if (!env.NODE_TEST_CONTEXT) throw new Error(`RF_STORE_ROOT is a test seam for node --test, and a real run keeps its snapshots and log in ~/reelflies/store-snapshots: unset it (it is ${env.RF_STORE_ROOT})`);
        return env.RF_STORE_ROOT;
    }
    return path.join(os.homedir(), 'reelflies', 'store-snapshots');
}

export function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
}

export const sha256 = text => crypto.createHash('sha256').update(text).digest('hex');

export const timeStamp = (date = new Date()) => date.toISOString().replace(/:/g, '-');

export const readSpec = ({
    path: apiPath, query = {}, object, scope, check, paginate = false, token = 'read',
}) => ({
    key: `GET ${apiPath}${queryString(query)}`, path: apiPath, query, object, scope, check, paginate, token,
});

function readsForOne({ request, what }, mode) {
    const { entity } = what;
    if (what.kind === 'settings') {
        const settings = { path: request.path, object: what.object };
        if (mode === 'lifted') {
            return [
                readSpec({
                    ...settings, query: { channel_id: CHANNEL }, scope: String(CHANNEL), check: 'channel',
                }),
                readSpec({ ...settings, scope: 'global', check: 'none' }),
                ...LIVE_CHANNELS.map(channel => readSpec({
                    ...settings, query: { channel_id: channel }, scope: String(channel), check: 'none',
                })),
            ];
        }
        const channels = APPROVED_SETTINGS[what.settingsPath].channelReads ? [...LIVE_CHANNELS, CHANNEL] : [];
        return [
            readSpec({ ...settings, scope: 'global', check: 'none' }),
            ...channels.map(channel => readSpec({
                ...settings, query: { channel_id: channel }, scope: String(channel), check: 'none',
            })),
        ];
    }
    if (what.kind === 'promotion') {
        return [what.id
            ? readSpec({
                path: request.path, object: what.object, scope: 'item', check: 'none',
            })
            : readSpec({
                path: entity.base, object: what.object, scope: 'list', check: 'none', paginate: true,
            })];
    }
    if (what.kind === 'template-association') {
        return [readSpec({
            path: entity.base, query: { [entity.listChannelQuery]: CHANNEL }, object: what.object, scope: 'channel', check: 'channel', paginate: true, token: entity.readToken,
        })];
    }
    if (what.action === 'update') {
        return [readSpec({
            path: request.path, object: what.object, scope: 'item', check: 'item',
        })];
    }
    return [readSpec({
        path: entity.base, query: { [entity.listChannelQuery]: CHANNEL }, object: what.object, scope: 'channel', check: 'channel', paginate: true,
    })];
}

// The GETs that make the snapshot of these writes, each once, in the order first needed.
export function readsFor(items, mode) {
    const seen = new Map();
    for (const item of items) {
        for (const spec of readsForOne(item, mode)) {
            if (!seen.has(spec.key)) seen.set(spec.key, spec);
        }
    }
    return [...seen.values()];
}

function checkResponse(spec, response) {
    if (!response.ok) throw new Stopped(`${spec.key} answered ${describeFailure(response)}`);
    if (spec.check === 'none') return;
    const problems = responseChannelProblems(response.body, { requireOnData: spec.check === 'item' });
    if (problems.length) throw new Stopped(`${spec.key}: ${problems.join('; ')}`, { channel: true });
}

// One read: every page of a list, or the one answer. Returns the data.
export async function takeRead(client, spec) {
    if (!spec.paginate) {
        const response = await client.get(spec.path, spec.query);
        checkResponse(spec, response);
        return response.body ? response.body.data : null;
    }
    const data = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        // Pages are read one after another: each says how many there are.
        // eslint-disable-next-line no-await-in-loop
        const response = await client.get(spec.path, { ...spec.query, limit: PAGE_SIZE, page });
        checkResponse(spec, response);
        data.push(...((response.body && response.body.data) || []));
        const total = response.body?.meta?.pagination?.total_pages ?? 1;
        if (page >= total) return data;
    }
    throw new Stopped(`${spec.key} has more than ${MAX_PAGES * PAGE_SIZE} items: too many to snapshot`);
}

// Takes every read in turn. A read that fails or names another channel stops it.
export async function takeSnapshot(client, reads) {
    const records = [];
    for (const spec of reads) {
        // eslint-disable-next-line no-await-in-loop
        const data = await takeRead(client, spec);
        records.push({
            key: spec.key, object: spec.object, scope: spec.scope, data, sha256: sha256(canonicalJson(data)),
        });
    }
    return { reads: records, sha256: sha256(canonicalJson(records)) };
}

const objectDir = object => object.replace(/\//g, '-');

// Writes the snapshot, one file per object, never over an existing file. Returns each file and
// the sha256 of its bytes.
export function writeSnapshotFiles(root, { channel, label, now = new Date() }, snapshot) {
    const objects = [...new Set(snapshot.reads.map(record => record.object))];
    return objects.map(object => {
        const dir = path.join(root, String(channel), objectDir(object));
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        const file = path.join(dir, `${timeStamp(now)}-${label}.json`);
        const text = `${JSON.stringify({
            taken: now.toISOString(), channel, object, label, snapshot_sha256: snapshot.sha256, reads: snapshot.reads.filter(record => record.object === object),
        }, null, 2)}\n`;
        fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
        return { object, file, sha256: sha256(text) };
    });
}
