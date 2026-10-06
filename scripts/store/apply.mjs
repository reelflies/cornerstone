#!/usr/bin/env node
// Applies a store plan (W0-11): exactly the plan's requests, on a fresh snapshot that must match
// the plan's, with a log row before and after each request and a re-read of every object written.
//
//   node scripts/store/apply.mjs <plan file>               lifted writes on 1895766 (agents may)
//   node scripts/store/apply.mjs --approved <plan file>    Shaun's approved store-wide writes
//
// In order, it:
//
// 1. refuses while ~/reelflies/store-snapshots/LOCKED exists (a failed part 3, or a write whose
//    response named another channel). Shaun reads it, checks the store and removes it.
// 2. refuses a file that isn't a plan, or whose digest doesn't match. The digest catches an edit,
//    but anyone could recompute it, so nothing below trusts the plan's own checks:
// 3. checks every request again: the allowlist, the channel, and today's release calendar.
// 4. takes a fresh snapshot with the same GETs and refuses if anything changed since the plan.
// 5. proves parts 1 and 2 of ticket 21's test again from those reads, and refuses a settings
//    write whose plan carries no proof.
// 6. for each request: an intent row in log.jsonl (flushed), the request, the response's channel
//    check, the re-read, and for a settings write part 3: the global value and channels 1 and
//    1855224 read back unchanged. Then the result row.
//    - A refused write stops the run (outcome "failed"); nothing after it is sent.
//    - A response or re-read naming another channel stops the run and writes LOCKED.
//    - A failed part 3 puts back the snapshot's values at once (the global value and each
//      channel that changed, and 1895766's own), stops, and writes LOCKED.
//
// Approved mode runs only at a terminal, which an agent's shell isn't: it asks Shaun to type the
// first 8 characters of the plan's sha256, then for a token at a hidden prompt, which is used for
// this run and never stored. It keeps the snapshot, the log and the re-reads; part 3 is reported,
// not enforced, because the write is meant to reach .com and channel 1. It ends with the same-day
// smoke tests (HANDOFF: store-wide switches also hit .com and channel 1).
//
// One apply runs at a time on this Mac: the store-write lock (scripts/lib/lock.mjs).

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Writable } from 'stream';
import { isDeepStrictEqual } from 'util';
import { isMain } from '../lib/is-main.mjs';
import { acquireLock } from '../lib/lock.mjs';
import { describePhase, phaseOn, readCalendar } from '../lib/release-calendar.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { redact } from '../release-redact.mjs';
import { APPROVED_SETTINGS, Refused } from './allowlist.mjs';
import { CHANNEL, LIVE_CHANNELS, responseChannelProblems } from './channel.mjs';
import { createClient, describeFailure, queryString } from './client.mjs';
import { appendLogRow, logRow } from './log.mjs';
import {
    PLAN_FORMAT, checkRequests, commandFetch, commandStoreHash, isRef, operatorName, planDigest, proofProblem, proofsFor, snapshotProblems,
} from './plan.mjs';
import { PART3_SCOPES, part3Changes } from './settings-proof.mjs';
import {
    Stopped, canonicalJson, readSpec, readsFor, sha256, storeRoot, takeRead, takeSnapshot, writeSnapshotFiles,
} from './snapshot.mjs';

export const LOCKED_NAME = 'LOCKED';

export const SMOKE_TESTS = [
    'Same-day smoke tests (HANDOFF: store-wide switches also hit .com and channel 1):',
    '  - reelflies.com (1855224): home, a Fly Type listing and its filters, a product page with a sold-out size, add to cart, the cart',
    '  - reelflies.ca (channel 1): the same five pages',
    '  - ReelFlies_CA (1895766): the same, through the preview cookie',
    '  - for a promotion: a .com cart isn\'t discounted, and a .ca fly cart over the threshold is',
    'Record each result on the review page.',
];

const NO_TERMINAL = 'apply --approved runs only at Shaun\'s terminal: it asks him to type the start of the plan\'s sha256 and to paste a token at a hidden prompt, which no agent can answer (as with release.sh)';
const RESTORE_SCOPES = [...PART3_SCOPES, String(CHANNEL)];

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function lockedProblem(root) {
    const file = path.join(root, LOCKED_NAME);
    if (!fs.existsSync(file)) return null;
    let reason;
    try {
        reason = JSON.parse(fs.readFileSync(file, 'utf8')).reason;
    } catch {
        reason = 'its contents are unreadable';
    }
    return `${file} exists: every apply refuses until Shaun removes it (${reason || 'no reason recorded'})`;
}

function writeLocked(root, details) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(root, LOCKED_NAME), `${JSON.stringify({
        ...details,
        clear: 'Shaun removes this file once he has read it and checked the store. Until then every apply refuses, and the review page puts this failure first.',
    }, null, 2)}\n`, { mode: 0o600 });
}

export function readPlan(text) {
    let plan;
    try {
        plan = JSON.parse(text);
    } catch {
        throw new Refused('this file isn\'t a store plan: it isn\'t JSON');
    }
    if (!isObject(plan) || plan.format !== PLAN_FORMAT) throw new Refused(`this file isn't a store plan (format ${PLAN_FORMAT})`);
    if (plan.digest !== planDigest(plan)) throw new Refused('the plan\'s digest doesn\'t match its contents: it was edited after plan.mjs made it. Plan again');
    return plan;
}

// --- Approved mode's prompts ------------------------------------------------------------------

// Asks for the start of the plan's sha256, then for the token at a hidden prompt. Returns the
// token, which the caller uses for this run only. Refuses without a terminal, before asking.
export async function approvedGate({ input = process.stdin, output = process.stdout, planSha }) {
    if (!input.isTTY || !output.isTTY) throw new Refused(NO_TERMINAL);
    const sink = new Writable({
        write(chunk, encoding, done) {
            if (!sink.muted) output.write(chunk, encoding);
            done();
        },
    });
    sink.muted = false;
    const prompt = readline.createInterface({ input, output: sink, terminal: true });
    let closed = false;
    prompt.on('close', () => { closed = true; });
    const ask = (question, hidden) => new Promise(resolve => {
        if (closed) {
            resolve(null);
            return;
        }
        const onClose = () => resolve(null);
        prompt.once('close', onClose);
        sink.muted = false;
        prompt.question(question, answer => {
            prompt.off('close', onClose);
            resolve(answer);
        });
        sink.muted = hidden;
    });
    try {
        const typed = await ask('Type the first 8 characters of the plan\'s sha256, as plan.mjs printed it: ', false);
        if (typed === null) throw new Refused('no answer (stdin closed): stopped');
        if (typed.trim().toLowerCase() !== planSha.slice(0, 8)) throw new Refused(`"${typed.trim()}" isn't the start of this plan's sha256: stopped`);
        const token = await ask('Paste the approved-write token (hidden, used for this run and never stored), then Return: ', true);
        sink.muted = false;
        output.write('\n');
        if (token === null) throw new Refused('no answer (stdin closed): stopped');
        if (!token.trim()) throw new Refused('no token given: stopped');
        return token.trim();
    } finally {
        prompt.close();
    }
}

// --- Applying -------------------------------------------------------------------------------

function resolveRefs(body, created) {
    if (!isObject(body)) return body;
    return Object.fromEntries(Object.entries(body).map(([key, value]) => {
        if (!isRef(value)) return [key, value];
        if (!created.has(value.$created)) throw new Stopped(`${key} refers to request ${value.$created + 1}, which created nothing`);
        return [key, created.get(value.$created)];
    }));
}

function createdIds({ what }, response) {
    const field = what.entity && what.entity.idField;
    if (!field) return [];
    const data = response.body && response.body.data;
    return (Array.isArray(data) ? data : [data]).filter(isObject).map(item => item[field]).filter(id => id !== undefined && id !== null).map(String);
}

const settingsSpec = (request, what, channel, check = 'none') => readSpec({
    path: request.path, query: channel === 'global' ? {} : { channel_id: Number(channel) }, object: what.object, scope: String(channel), check,
});

// The GETs that re-read what a request wrote.
function reReadSpecs({ request, what }, ids, mode) {
    const { entity } = what;
    if (what.kind === 'settings') return [mode === 'lifted' ? settingsSpec(request, what, CHANNEL, 'channel') : settingsSpec(request, what, 'global')];
    if (what.kind === 'template-association') {
        return [readSpec({
            path: entity.base, query: { [entity.listChannelQuery]: CHANNEL }, object: what.object, scope: 'channel', check: 'channel', paginate: true, token: entity.readToken,
        })];
    }
    const check = what.kind === 'promotion' ? 'none' : 'item';
    if (what.action === 'update') {
        return [readSpec({
            path: request.path, object: what.object, scope: 'item', check,
        })];
    }
    if (!ids.length) {
        return [readSpec({
            path: entity.base, query: what.kind === 'promotion' ? {} : { [entity.listChannelQuery]: CHANNEL }, object: what.object, scope: 'channel', check: check === 'item' ? 'channel' : 'none', paginate: true,
        })];
    }
    return ids.map(id => readSpec({
        path: `${entity.base}/${id}`, object: what.object, scope: 'item', check,
    }));
}

async function readAll(client, specs) {
    const records = [];
    for (const spec of specs) {
        // eslint-disable-next-line no-await-in-loop
        const data = await takeRead(client, spec);
        records.push({
            key: spec.key, object: spec.object, scope: spec.scope, data, sha256: sha256(canonicalJson(data)),
        });
    }
    return records;
}

const scopeData = (records, request, what, scopes) => Object.fromEntries(scopes.map(scope => [scope, records.find(record => record.key === settingsSpec(request, what, scope).key)?.data]));

// Puts back the snapshot's values after a failed part 3: the changed keys of the global value,
// and the whole read of each channel that changed (BigCommerce resets a channel's override only
// when every field is sent, null where it inherited). Then reads all four again.
async function restoreSettings({
    client, item, before, after, root, row, now,
}) {
    const { request, what } = item;
    const results = [];
    for (const scope of RESTORE_SCOPES) {
        const was = isObject(before[scope]) ? before[scope] : {};
        const is = isObject(after[scope]) ? after[scope] : {};
        const keys = [...new Set([...Object.keys(was), ...Object.keys(is)])].filter(key => !isDeepStrictEqual(was[key], is[key]));
        if (keys.length) {
            const body = scope === 'global' || !Object.keys(was).length
                ? Object.fromEntries(keys.map(key => [key, Object.hasOwn(was, key) ? was[key] : null]))
                : was;
            const query = scope === 'global' ? {} : { channel_id: Number(scope) };
            const fields = {
                ...row, channel: scope === 'global' ? 'global' : Number(scope), action: 'restore', method: 'PUT', path: request.path,
            };
            appendLogRow(root, logRow({ row: 'intent', ...fields, date: now().toISOString() }));
            let response;
            try {
                // eslint-disable-next-line no-await-in-loop
                response = await client.request({
                    method: 'PUT', path: request.path, query, body,
                });
            } catch (error) {
                response = {
                    ok: false, status: null, body: null, text: error.message,
                };
            }
            appendLogRow(root, logRow({
                row: 'result', ...fields, date: now().toISOString(), status: response.status, outcome: response.ok ? 'ok' : 'failed', message: response.ok ? '' : describeFailure(response),
            }));
            results.push({
                scope, keys, status: response.status, ok: response.ok,
            });
        }
    }
    let held = false;
    try {
        const check = scopeData(await readAll(client, RESTORE_SCOPES.map(scope => settingsSpec(request, what, scope))), request, what, RESTORE_SCOPES);
        held = RESTORE_SCOPES.every(scope => isDeepStrictEqual(check[scope], before[scope]));
    } catch {
        held = false;
    }
    return { results, held };
}

const describeChanges = changes => changes.map(change => `${change.scope} changed (${change.keys.join(', ')})`).join('; ');

// Applies a plan. Throws Refused before anything is written; once writing starts it returns
// { outcome: 'applied' | 'failed' | 'locked', ... } and every request it sent has its log rows.
export async function applyPlan({
    planText, client, phase, root, operator, approved = false, now = () => new Date(), log = () => {},
}) {
    const locked = lockedProblem(root);
    if (locked) throw new Refused(locked);
    const plan = readPlan(planText);
    const planSha = sha256(planText);
    if (!['lifted', 'approved'].includes(plan.mode)) throw new Refused(`the plan's mode ${JSON.stringify(plan.mode)} is neither lifted nor approved`);
    if (approved && plan.mode !== 'approved') throw new Refused('--approved applies an approved plan (plan.mjs --approved) only');
    if (!approved && plan.mode !== 'lifted') throw new Refused('this is an approved plan: only Shaun applies it, with apply.mjs --approved at his own terminal');
    // Everything is derived again here, never taken from the plan file: its digest catches an
    // edit, but anyone can recompute one.
    const { mode } = plan;
    const channel = mode === 'lifted' ? CHANNEL : 'store-wide';
    const items = checkRequests(plan.requests, { mode, phase });
    const fresh = await takeSnapshot(client, readsFor(items, mode));
    if (fresh.sha256 !== plan.snapshot.sha256) {
        const planned = new Map((plan.snapshot.reads || []).map(record => [record.key, record.sha256]));
        const changed = fresh.reads.filter(record => planned.get(record.key) !== record.sha256).map(record => record.key);
        throw new Refused(`the plan is stale: ${changed.length ? changed.join(', ') : 'its reads'} changed since the plan was made (${plan.created}): plan again`);
    }
    const problems = snapshotProblems(items, fresh, mode);
    if (mode === 'lifted') {
        for (const proof of proofsFor(items, fresh)) {
            const recorded = (plan.proofs || []).find(item => item.index === proof.index);
            if (!recorded || !recorded.proved) problems.push(`request ${proof.index + 1}: the plan has no proof of parts 1 and 2 of ticket 21's test for settings/${proof.settings}: plan it with plan.mjs`);
            else if (!proof.proved) problems.push(proofProblem(proof));
        }
    }
    if (problems.length) throw new Refused(problems.join('\n'));

    const stamp = planSha.slice(0, 8);
    const beforeFiles = writeSnapshotFiles(root, { channel, label: `before-${stamp}`, now: now() }, fresh);
    beforeFiles.forEach(file => log(`snapshot ${file.file}`));
    const created = new Map();
    const afterRecords = [];
    const finish = outcome => {
        const afterFiles = afterRecords.length ? writeSnapshotFiles(root, { channel, label: `after-${stamp}`, now: now() }, { reads: afterRecords, sha256: sha256(canonicalJson(afterRecords)) }) : [];
        afterFiles.forEach(file => log(`re-read  ${file.file}`));
        return { ...outcome, beforeFiles, afterFiles };
    };

    for (const item of items) {
        const { index, request, what } = item;
        const row = {
            channel, object: what.object, id: what.id, action: what.action, snapshot_sha256: fresh.sha256, ticket: plan.ticket, operator, mode, plan_sha256: planSha, request: index, method: request.method, path: request.path,
        };
        const result = fields => appendLogRow(root, logRow({
            row: 'result', ...row, date: now().toISOString(), ...fields,
        }));
        let body;
        try {
            body = resolveRefs(request.body, created);
        } catch (error) {
            // Nothing is sent: the create it refers to answered without an id.
            return finish({ outcome: 'failed', request: index, message: error.message });
        }
        appendLogRow(root, logRow({ row: 'intent', ...row, date: now().toISOString() }));
        log(`write    ${index + 1}. ${request.method} ${request.path}${queryString(request.query)}`);
        let response;
        try {
            // Requests go one after another: each may need the uuid the one before created.
            // eslint-disable-next-line no-await-in-loop
            response = await client.request({
                method: request.method, path: request.path, query: request.query, body,
            });
        } catch (error) {
            const message = `no answer: ${error.message}`;
            result({ status: null, outcome: 'failed', message });
            return finish({ outcome: 'failed', request: index, message });
        }
        if (!response.ok) {
            const message = describeFailure(response);
            result({ status: response.status, outcome: 'failed', message });
            return finish({ outcome: 'failed', request: index, message });
        }
        if (mode === 'lifted') {
            const wrong = responseChannelProblems(response.body, { requireOnData: ['widget', 'page', 'script'].includes(what.kind) });
            if (wrong.length) {
                const message = wrong.join('; ');
                result({ status: response.status, outcome: 'stopped', message });
                writeLocked(root, {
                    locked: now().toISOString(), reason: `a write's response named another channel: ${message}`, plan: planSha, plan_created: plan.created, ticket: plan.ticket, request: index, method: request.method, path: request.path,
                });
                return finish({ outcome: 'locked', request: index, message });
            }
        }
        const ids = createdIds(item, response);
        if (what.action === 'create' && ids.length) created.set(index, ids[0]);
        const id = what.id ?? (ids.length ? ids.join(',') : null);
        let records;
        try {
            // eslint-disable-next-line no-await-in-loop
            records = await readAll(client, reReadSpecs(item, ids, mode));
        } catch (error) {
            const message = `the write answered ${response.status}, but its re-read stopped: ${error.message}`;
            result({
                id, status: response.status, outcome: 'stopped', message,
            });
            if (error.channel) {
                writeLocked(root, {
                    locked: now().toISOString(), reason: `a re-read after a write named another channel: ${error.message}`, plan: planSha, plan_created: plan.created, ticket: plan.ticket, request: index, method: request.method, path: request.path,
                });
                return finish({ outcome: 'locked', request: index, message });
            }
            return finish({ outcome: 'failed', request: index, message });
        }
        afterRecords.push(...records);
        const afterSha = sha256(canonicalJson(records));

        if (what.kind === 'settings' && mode === 'lifted') {
            // eslint-disable-next-line no-await-in-loop
            const part3 = await readAll(client, PART3_SCOPES.map(scope => settingsSpec(request, what, scope)));
            afterRecords.push(...part3);
            const before = scopeData(fresh.reads, request, what, RESTORE_SCOPES);
            const afterData = { ...scopeData(part3, request, what, PART3_SCOPES), [CHANNEL]: records[0].data };
            const changes = part3Changes(before, afterData);
            if (changes.length) {
                log(`FAIL     part 3: ${describeChanges(changes)}. Restoring the snapshot's values now`);
                // eslint-disable-next-line no-await-in-loop
                const restore = await restoreSettings({
                    client, item, before, after: afterData, root, row: { ...row, id }, now,
                });
                const message = `part 3 failed: ${describeChanges(changes)}; restored and locked`;
                result({
                    id, status: response.status, outcome: 'stopped', after_sha256: afterSha, message,
                });
                writeLocked(root, {
                    locked: now().toISOString(),
                    reason: `part 3 of ticket 21's test failed for ${what.object}: ${describeChanges(changes)}`,
                    plan: planSha,
                    plan_created: plan.created,
                    ticket: plan.ticket,
                    request: index,
                    changes,
                    restore: restore.results,
                    restored: restore.held,
                });
                log(restore.held ? 'restored the global value and every channel to the snapshot\'s values, and wrote LOCKED' : 'STOP     the restore didn\'t read back as the snapshot: check the store by hand. LOCKED is written');
                return finish({
                    outcome: 'locked', request: index, message, changes, restore,
                });
            }
            log('part 3   the global value and channels 1 and 1855224 read back unchanged');
        }
        if (what.kind === 'settings' && mode === 'approved' && APPROVED_SETTINGS[what.settingsPath].channelReads) {
            const scopes = [...LIVE_CHANNELS, CHANNEL].map(String);
            // eslint-disable-next-line no-await-in-loop
            const channels = await readAll(client, scopes.map(scope => settingsSpec(request, what, scope)));
            afterRecords.push(...channels);
            const all = ['global', ...scopes];
            const changes = part3Changes(scopeData(fresh.reads, request, what, all), { ...scopeData(channels, request, what, scopes), global: records[0].data }, all);
            log(`part 3 (reported, not enforced): ${changes.length ? describeChanges(changes) : 'nothing read back changed'}`);
        }
        result({
            id, status: response.status, outcome: 'ok', after_sha256: afterSha, message: '',
        });
        log(`ok       ${index + 1}. ${response.status}${id ? `, ${what.object} ${id}` : ''}`);
    }
    return finish({ outcome: 'applied', count: items.length });
}

// --- The command ----------------------------------------------------------------------------

const USAGE = 'usage: node scripts/store/apply.mjs [--approved] <plan file>';

async function main(argv) {
    const approved = argv.includes('--approved');
    const files = argv.filter(arg => arg !== '--approved');
    if (files.length !== 1 || files[0].startsWith('-')) {
        console.error(USAGE);
        return 2;
    }
    if (approved && (!process.stdin.isTTY || !process.stdout.isTTY)) {
        console.error(`STOP     ${NO_TERMINAL}`);
        return 1;
    }
    const secrets = [];
    const say = line => console.log(redact(line, secrets));
    try {
        const root = storeRoot();
        const locked = lockedProblem(root);
        if (locked) throw new Refused(locked);
        const planText = fs.readFileSync(files[0], 'utf8');
        const plan = readPlan(planText);
        const phase = phaseOn(readCalendar());
        say(describePhase(phase));
        say(`Plan ${files[0]}, made ${plan.created} for ticket ${plan.ticket} (${plan.mode}):`);
        plan.diff.forEach(say);
        const token = approved
            ? await approvedGate({ planSha: sha256(planText) })
            : readStoreToken('write').token;
        secrets.push(token);
        const storeHash = await commandStoreHash();
        if (storeHash !== plan.store_hash) throw new Refused(`the plan is for store ${plan.store_hash}, and this checkout's store is ${storeHash}`);
        const client = createClient({ storeHash, token, fetch: await commandFetch(root) });
        const lock = acquireLock('store-write', `scripts/store/apply.mjs ${path.basename(files[0])}`, { releaseOnExit: true });
        try {
            if (lock.brokeStale) say(lock.brokeStale);
            const result = await applyPlan({
                planText, client, phase, root, operator: approved ? 'Shaun at his terminal (--approved)' : operatorName(), approved, log: say,
            });
            if (result.outcome === 'applied') say(`applied: ${result.count} request${result.count === 1 ? '' : 's'} on ${plan.channel}; the log is ${path.join(root, 'log.jsonl')}`);
            else say(`STOP     ${result.outcome} at request ${result.request + 1}: ${result.message}`);
            if (approved) SMOKE_TESTS.forEach(say);
            return result.outcome === 'applied' ? 0 : 1;
        } finally {
            lock.release();
        }
    } catch (error) {
        const tag = error.name === 'Refused' ? 'REFUSED' : 'STOP';
        error.message.split('\n').forEach(line => console.error(redact(`${tag.padEnd(8)} ${line}`, secrets)));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
