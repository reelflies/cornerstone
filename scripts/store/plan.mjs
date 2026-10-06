#!/usr/bin/env node
// Plans store writes (W0-11): checks each request against the allowlist, the channel rule and
// the release calendar, takes a GET snapshot, proves parts 1 and 2 of ticket 21's test for each
// settings write, and writes the exact requests, the snapshot's sha256 and a diff to a plan file.
// It sends GETs only (a read-only client), so it writes nothing to the store.
//
//   node scripts/store/plan.mjs --ticket 46 --changes widgets/home-lead/changes.json
//   node scripts/store/plan.mjs --ticket 21 --changes store-wide.json --approved   # for Shaun's batch
//   … --out <plan file>                     default ~/reelflies/store-snapshots/plans/<time>-<ticket>.json
//
// The changes file is a JSON array of requests, or {"requests": [...]}, each
// {"method": "POST" or "PUT", "path": "/v3/…", "query": {...}, "body": ...}. A widget create may
// take the uuid of a template or widget created earlier in the same plan:
// "widget_template_uuid": {"$created": 0} (request indexes count from 0).
//
// Then review the diff, and apply: `node scripts/store/apply.mjs <plan file>`. An approved plan
// is applied by Shaun alone, at his terminal: `node scripts/store/apply.mjs --approved <plan file>`.
// docs/store-writes.md has the whole routine.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { isDeepStrictEqual } from 'util';
import { isMain } from '../lib/is-main.mjs';
import { currentTicket } from '../lib/lock.mjs';
import { describePhase, phaseOn, readCalendar } from '../lib/release-calendar.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { redact } from '../release-redact.mjs';
import { Refused, calendarRefusal, classify } from './allowlist.mjs';
import { CHANNEL, requestChannelProblems } from './channel.mjs';
import { createClient, queryString } from './client.mjs';
import { proveSettingsWrite } from './settings-proof.mjs';
import {
    canonicalJson, readsFor, sha256, storeRoot, takeSnapshot, timeStamp, writeSnapshotFiles,
} from './snapshot.mjs';

export const PLAN_FORMAT = 'reelflies-store-plan/1';
export const MAX_REQUESTS = 50;

// The id fields a create may fill from an earlier create in the same plan, and what that is.
const REF_KEYS = { widget_template_uuid: 'widget-templates', widget_uuid: 'widgets' };
const SECRET_KEY = /token|secret|password|api[ _-]?key/i;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const isRef = value => isObject(value) && Object.keys(value).length === 1 && Number.isInteger(value.$created);

// The request as the plan keeps it: an absent query becomes {}. Any other field stays, so
// classify() refuses it as unknown instead of the plan dropping a typo silently.
function normalize(raw) {
    if (!isObject(raw)) return raw;
    return { ...raw, query: raw.query || {} };
}

function refProblems(items) {
    const problems = [];
    items.forEach(({ index, request }) => {
        const where = `request ${index + 1}`;
        const walk = (node, key, top) => {
            if (isRef(node)) {
                if (!top || !(key in REF_KEYS)) {
                    problems.push(`${where}: a {"$created": n} reference may only be ${Object.keys(REF_KEYS).join(' or ')}, not ${key}`);
                    return;
                }
                const target = items[node.$created];
                if (node.$created >= index || !target || target.what.action !== 'create') {
                    problems.push(`${where}: ${key} refers to request ${node.$created + 1}, which isn't an earlier create`);
                } else if (target.what.object !== REF_KEYS[key]) {
                    problems.push(`${where}: ${key} must refer to a ${REF_KEYS[key]} create, and request ${node.$created + 1} creates ${target.what.object}`);
                }
                return;
            }
            if (Array.isArray(node)) node.forEach(child => walk(child, key, false));
            else if (isObject(node)) Object.entries(node).forEach(([name, child]) => walk(child, name, false));
        };
        if (isObject(request.body)) Object.entries(request.body).forEach(([key, value]) => walk(value, key, true));
        else walk(request.body, 'body', false);
    });
    return problems;
}

// Checks every request before anything is read: the allowlist, the channel rule (lifted mode),
// the calendar, the references and one write per settings endpoint. Throws Refused listing
// every problem, one line each.
export function checkRequests(requests, { mode, phase }) {
    if (!Array.isArray(requests) || !requests.length || requests.length > MAX_REQUESTS) {
        throw new Refused(`a plan needs 1 to ${MAX_REQUESTS} requests`);
    }
    const problems = [];
    const items = [];
    requests.forEach((raw, index) => {
        const request = normalize(raw);
        try {
            const what = classify(request, { mode });
            const found = mode === 'lifted' ? requestChannelProblems(request, what) : [];
            const frozen = calendarRefusal(what, request, phase);
            if (frozen) found.push(frozen);
            problems.push(...found.map(problem => `request ${index + 1}: ${problem}`));
            items.push({ index, request, what });
        } catch (error) {
            if (error.name !== 'Refused') throw error;
            problems.push(`request ${index + 1}: ${error.message}`);
        }
    });
    // In approved mode no create can be referred to, so any reference is refused.
    problems.push(...refProblems(items));
    const settingsSeen = new Map();
    for (const { index, what } of items) {
        if (what.kind === 'settings') {
            if (settingsSeen.has(what.object)) problems.push(`request ${index + 1}: ${what.object} is already written by request ${settingsSeen.get(what.object) + 1}: one write per settings endpoint per plan`);
            else settingsSeen.set(what.object, index);
        }
    }
    if (problems.length) throw new Refused(problems.join('\n'));
    return items;
}

const recordFor = (snapshot, key) => snapshot.reads.find(record => record.key === key);
const settingsRead = (snapshot, request, query = {}) => recordFor(snapshot, `GET ${request.path}${queryString(query)}`)?.data;

// Problems only the snapshot shows, for a lifted plan.
export function snapshotProblems(items, snapshot, mode) {
    if (mode !== 'lifted') return [];
    const problems = [];
    for (const { index, request, what } of items) {
        if (what.object === 'scripts' && what.action === 'update') {
            const current = recordFor(snapshot, `GET ${request.path}`)?.data;
            if (!current || current.enabled !== false) problems.push(`request ${index + 1}: script ${what.id} is enabled on the store: an enabled script is Shaun's to change`);
        }
    }
    return problems;
}

// Parts 1 and 2 of ticket 21's test for each lifted settings write, from the snapshot's reads.
export function proofsFor(items, snapshot) {
    return items.filter(({ what }) => what.kind === 'settings').map(({ index, request, what }) => ({
        index,
        ...proveSettingsWrite({
            settingsPath: what.settingsPath,
            body: request.body,
            globalData: settingsRead(snapshot, request),
            channelData: settingsRead(snapshot, request, { channel_id: CHANNEL }),
            globalOnly: what.entity.globalOnly,
        }),
    }));
}

export function proofProblem(proof) {
    const reasons = [
        ...(proof.part1.proved ? [] : [`part 1: ${proof.part1.evidence}`]),
        ...proof.part2.filter(item => !item.proved).map(item => `${item.key}: ${item.evidence}`),
    ];
    return `request ${proof.index + 1}: parts 1 and 2 of ticket 21's three-part test aren't proved for settings/${proof.settings} (${reasons.join('; ')}): it goes in Shaun's approval batch instead`;
}

// A value as the diff shows it: short JSON, long text cut with its length and sha256, and the
// values of credential-like keys hidden.
export function showValue(value, key = '') {
    if (SECRET_KEY.test(key) && value !== null && value !== '') return '[hidden]';
    if (isRef(value)) return `the uuid request ${value.$created + 1} creates`;
    const json = JSON.stringify(value === undefined ? null : value);
    if (typeof value === 'string' && json.length > 80) return `${JSON.stringify(`${value.slice(0, 60)}…`)} (${value.length} characters, sha256 ${sha256(value).slice(0, 8)})`;
    if (json.length > 80) return `${json.slice(0, 60)}… (${json.length} characters of JSON, sha256 ${sha256(json).slice(0, 8)})`;
    return json;
}

const INDENT = '     ';

function entityDiff({ request, what }, snapshot) {
    const nameField = what.entity.nameField;
    if (what.action === 'create') {
        const bodies = Array.isArray(request.body) ? request.body : [request.body];
        const existing = recordFor(snapshot, `GET ${what.entity.base}${queryString({ [what.entity.listChannelQuery]: CHANNEL })}`)?.data || [];
        return bodies.flatMap(body => {
            const lines = [`${INDENT}+ new ${what.object}${body[nameField] !== undefined ? ` ${showValue(body[nameField])}` : ''}`];
            Object.entries(body).filter(([, value]) => isRef(value)).forEach(([key, value]) => lines.push(`${INDENT}${key}: ${showValue(value)}`));
            const twin = body[nameField] !== undefined && existing.find(item => isObject(item) && item[nameField] === body[nameField]);
            if (twin && what.object !== 'placements') lines.push(`${INDENT}! 1895766 already has a ${what.object} named ${showValue(body[nameField])} (${twin[what.entity.idField]})`);
            return lines;
        });
    }
    const current = recordFor(snapshot, `GET ${request.path}`)?.data || {};
    const lines = Object.entries(request.body)
        .filter(([key, value]) => !isDeepStrictEqual(current[key], value))
        .map(([key, value]) => `${INDENT}${key}: ${showValue(current[key], key)} -> ${showValue(value, key)}`);
    return lines.length ? lines : [`${INDENT}(no change)`];
}

function associationDiff({ request, what }, snapshot) {
    const existing = recordFor(snapshot, `GET ${what.entity.base}${queryString({ channel_id: CHANNEL })}`)?.data || [];
    return request.body.map(item => {
        const now = existing.find(old => old.entity_type === item.entity_type && old.entity_id === item.entity_id);
        return `${INDENT}${item.entity_type} ${item.entity_id}: ${now ? showValue(now.file_name) : '(none)'} -> ${showValue(item.file_name)}`;
    });
}

const channelValue = (data, key) => {
    if (!isObject(data) || !Object.hasOwn(data, key)) return 'not shown';
    return data[key] === null ? 'inherits' : showValue(data[key], key);
};

function settingsDiff({ request }, snapshot, mode) {
    const global = settingsRead(snapshot, request) || {};
    if (mode === 'lifted') {
        const channel = settingsRead(snapshot, request, { channel_id: CHANNEL }) || {};
        return Object.entries(request.body).map(([key, value]) => {
            const now = channel[key] === null || channel[key] === undefined
                ? `1895766 ${channel[key] === null ? 'null' : 'not shown'} (inherits the global ${showValue(global[key], key)})`
                : `1895766 ${showValue(channel[key], key)} (the global is ${showValue(global[key], key)})`;
            return `${INDENT}${key}: ${now} -> ${showValue(value, key)}`;
        });
    }
    if (Array.isArray(request.body)) return [`${INDENT}global: ${showValue(global)} -> ${showValue(request.body)}`];
    const channels = [['channel 1', 1], ['1855224', 1855224], ['1895766', CHANNEL]];
    return Object.entries(request.body).map(([key, value]) => {
        const reads = channels.map(([name, id]) => `${name}: ${channelValue(settingsRead(snapshot, request, { channel_id: id }), key)}`).join('; ');
        return `${INDENT}${key}: global ${showValue(global[key], key)} -> ${showValue(value, key)} (${reads})`;
    });
}

function promotionDiff({ request, what }, snapshot) {
    if (what.action === 'create') return [`${INDENT}+ new promotion ${showValue(request.body.name)}`];
    const current = recordFor(snapshot, `GET ${request.path}`)?.data || {};
    const lines = Object.entries(request.body).filter(([key, value]) => !isDeepStrictEqual(current[key], value)).map(([key, value]) => `${INDENT}${key}: ${showValue(current[key], key)} -> ${showValue(value, key)}`);
    return lines.length ? lines : [`${INDENT}(no change)`];
}

// The diff a person reads before apply: one heading per request, then what it changes.
export function diffLines(items, snapshot, mode) {
    return items.flatMap(item => {
        const { index, request, what } = item;
        const heading = `${index + 1}. ${request.method} ${request.path}${queryString(request.query)} (${what.object} ${what.action}${what.id ? ` ${what.id}` : ''})`;
        if (what.kind === 'settings') return [heading, ...settingsDiff(item, snapshot, mode)];
        if (what.kind === 'template-association') return [heading, ...associationDiff(item, snapshot)];
        if (what.kind === 'promotion') return [heading, ...promotionDiff(item, snapshot)];
        return [heading, ...entityDiff(item, snapshot)];
    });
}

// The digest covers the whole plan bar itself: the requests, the snapshot, the proofs and the
// diff a reviewer reads. apply refuses a plan whose digest doesn't match, which catches a plan
// edited after plan.mjs made it. Anyone can recompute it, so apply also re-checks every request
// and re-proves every setting from its own reads, and trusts nothing else in the file.
export function planDigest(plan) {
    const { digest, ...rest } = plan;
    return sha256(canonicalJson(rest));
}

export async function buildPlan({
    requests, ticket, mode = 'lifted', phase, client, storeHash, operator, now = new Date(),
}) {
    const items = checkRequests(requests, { mode, phase });
    const snapshot = await takeSnapshot(client, readsFor(items, mode));
    const proofs = mode === 'lifted' ? proofsFor(items, snapshot) : [];
    const problems = [...snapshotProblems(items, snapshot, mode), ...proofs.filter(proof => !proof.proved).map(proofProblem)];
    if (problems.length) throw new Refused(problems.join('\n'));
    const plan = {
        format: PLAN_FORMAT,
        mode,
        created: now.toISOString(),
        ticket,
        operator,
        store_hash: storeHash,
        channel: mode === 'lifted' ? CHANNEL : 'store-wide',
        calendar: describePhase(phase),
        requests: items.map(item => item.request),
        writes: items.map(({ index, what }) => ({
            index, object: what.object, action: what.action, id: what.id,
        })),
        snapshot: {
            sha256: snapshot.sha256,
            reads: snapshot.reads.map(({
                key, object, scope, sha256: hash,
            }) => ({
                key, object, scope, sha256: hash,
            })),
        },
        proofs,
        diff: diffLines(items, snapshot, mode),
    };
    plan.digest = planDigest(plan);
    return { plan, snapshot, items };
}

const slug = text => String(text).replace(/[^A-Za-z0-9-]+/g, '-');

// Writes the plan, never over another. Returns its file and the sha256 of its bytes, the value
// Shaun types the first 8 characters of in approved mode.
export function writePlan(root, plan, { out, now = new Date() } = {}) {
    const file = out || path.join(root, 'plans', `${timeStamp(now)}-${slug(plan.ticket)}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const text = `${JSON.stringify(plan, null, 2)}\n`;
    fs.writeFileSync(file, text, { flag: 'wx', mode: 0o600 });
    return { file, sha256: sha256(text) };
}

// --- The command ----------------------------------------------------------------------------

const USAGE = 'usage: node scripts/store/plan.mjs --ticket <NN> --changes <file> [--approved] [--out <plan file>]';
const TICKET = /^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/;

export function parseArgs(argv) {
    const options = { approved: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--approved') options.approved = true;
        else if (['--ticket', '--changes', '--out'].includes(arg) && i + 1 < argv.length) options[arg.slice(2)] = argv[++i];
        else throw new Error(`unknown or incomplete argument ${arg}`);
    }
    if (!options.ticket || !TICKET.test(options.ticket)) throw new Error('--ticket is required: the ticket the write is for, such as 46 or W0-11');
    if (!options.changes) throw new Error('--changes is required: the JSON file of requests');
    return options;
}

export function operatorName(env = process.env) {
    if (env.RF_OPERATOR) return env.RF_OPERATOR;
    let user = 'unknown';
    try {
        user = os.userInfo().username;
    } catch {
        // keep "unknown"
    }
    return `${user} on ${currentTicket() || 'no branch'}`;
}

// The fetch the commands use: the network, or under `node --test` only, RF_STORE_FIXTURES' routes.
export async function commandFetch(root, env = process.env) {
    if (!env.RF_STORE_FIXTURES) return fetch;
    if (!env.NODE_TEST_CONTEXT) throw new Error('RF_STORE_FIXTURES is a test seam for node --test: unset it');
    const { fixtureFetch } = await import('./fixtures/store.mjs');
    const routes = JSON.parse(fs.readFileSync(env.RF_STORE_FIXTURES, 'utf8'));
    return fixtureFetch(routes, { record: call => fs.appendFileSync(path.join(root, 'fixture-calls.jsonl'), `${JSON.stringify({ ...call, token: call.token ? 'set' : 'none' })}\n`) });
}

// The store hash: RF_BC_STORE_HASH, or stencil-cli's GET of the store URL in config.stencil.json.
// Only the URL is read: the helper never opens secrets.stencil.json, the Stencil-CLI publish token.
export async function commandStoreHash(env = process.env, configFile = fileURLToPath(new URL('../../config.stencil.json', import.meta.url))) {
    if (env.RF_BC_STORE_HASH) return env.RF_BC_STORE_HASH;
    let storeUrl;
    try {
        storeUrl = JSON.parse(fs.readFileSync(configFile, 'utf8')).normalStoreUrl;
    } catch (error) {
        throw new Error(`can't read the store URL from ${configFile} (${error.code || 'not JSON'}): run \`npx stencil init\`, or set RF_BC_STORE_HASH`);
    }
    if (!storeUrl) throw new Error(`${configFile} has no normalStoreUrl: run \`npx stencil init\`, or set RF_BC_STORE_HASH`);
    const { default: client } = await import(new URL('../../node_modules/@bigcommerce/stencil-cli/lib/theme-api-client.js', import.meta.url).href);
    return client.getStoreHash({ storeUrl });
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error(`${USAGE}\n  ${error.message}`);
        return 2;
    }
    const secrets = [];
    const say = line => console.log(redact(line, secrets));
    try {
        const root = storeRoot();
        if (fs.existsSync(path.join(root, 'LOCKED'))) say(`WARN     ${path.join(root, 'LOCKED')} exists: apply refuses every plan until Shaun removes it`);
        const changes = JSON.parse(fs.readFileSync(options.changes, 'utf8'));
        const requests = Array.isArray(changes) ? changes : changes.requests;
        const mode = options.approved ? 'approved' : 'lifted';
        const phase = phaseOn(readCalendar());
        say(describePhase(phase));
        const items = checkRequests(requests, { mode, phase });
        const kind = mode === 'lifted' && items.some(({ what }) => what.entity && what.entity.readToken === 'write') ? 'write' : 'read';
        const { token, source } = readStoreToken(kind);
        secrets.push(token);
        say(`Reading the snapshot with ${source} (GET only)…`);
        const storeHash = await commandStoreHash();
        const client = createClient({
            storeHash, token, fetch: await commandFetch(root), readOnly: true,
        });
        const now = new Date();
        const { plan, snapshot } = await buildPlan({
            requests, ticket: options.ticket, mode, phase, client, storeHash, operator: operatorName(), now,
        });
        const files = writeSnapshotFiles(root, { channel: plan.channel, label: 'plan', now }, snapshot);
        const written = writePlan(root, plan, { out: options.out, now });
        say('');
        plan.diff.forEach(say);
        plan.proofs.forEach(proof => say(`proof    request ${proof.index + 1}, settings/${proof.settings}: ${proof.part1.evidence}; ${proof.part2.map(item => `${item.key} ${item.evidence}`).join('; ')}`));
        say('');
        files.forEach(file => say(`snapshot ${file.file}`));
        say(`plan     ${written.file}`);
        say(`sha256   ${written.sha256}`);
        say(mode === 'lifted'
            ? `Next: review the diff, then node scripts/store/apply.mjs ${written.file}`
            : `Next: Shaun reviews it on the review page and runs, at his own terminal: node scripts/store/apply.mjs --approved ${written.file}`);
        return 0;
    } catch (error) {
        const tag = error.name === 'Refused' ? 'REFUSED' : 'STOP';
        error.message.split('\n').forEach(line => console.error(redact(`${tag.padEnd(8)} ${line}`, secrets)));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
