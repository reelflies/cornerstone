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
// 6. derives the diff, the list of writes and the proofs again from the fresh reads, refuses a
//    plan whose own copies differ, and shows the diff it derived (never the file's).
// 7. for each request: an intent row in log.jsonl (flushed), the request, the response's channel
//    check, the re-read, and for a settings write part 3: the global value and channels 1 and
//    1855224 read back unchanged. Then the result row, whatever happened.
//    - A refused write stops the run (outcome "failed"); nothing after it is sent.
//    - A response or re-read naming another channel stops the run and writes LOCKED.
//    - Part 3 is read after every settings write that was sent, whatever it answered, even
//      none: a PUT that times out may still have landed. Each GET after a write is tried up
//      to 3 times.
//    - A failed part 3 puts back the snapshot's values at once (1895766's own first, then the
//      global value and each live channel that changed), stops, and writes LOCKED.
//    - A part 3 that can't be read (a scope still unreadable after its tries) is unproved: the
//      run stops and writes LOCKED, and puts back only what it read as changed.
//
// Approved mode runs only at a terminal, which an agent's shell isn't. It prints the exact
// requests, asks Shaun for a token at a hidden prompt (used for this run and never stored), takes
// the fresh snapshot and shows the diff it derived, and only then asks him to type the first 8
// characters of the plan's sha256 as his go-ahead. It keeps the snapshot, the log and the
// re-reads; part 3 is reported, not enforced, because the write is meant to reach .com and
// channel 1. It ends with the same-day smoke tests (HANDOFF: store-wide switches also hit .com
// and channel 1).
//
// One apply runs at a time on this Mac: the store-write lock (scripts/lib/lock.mjs).

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Writable } from 'stream';
import { setTimeout as pause } from 'timers/promises';
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
    PLAN_FORMAT, TICKET, checkRequests, commandFetch, commandStoreHash, diffLines, isRef, operatorName, planDigest, proofProblem, proofsFor, snapshotProblems, writesFor,
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
// 1895766 is put back first: its PUT is the kind that just leaked, so the global value and the
// live channels are put back after it.
const RESTORE_SCOPES = [String(CHANNEL), ...PART3_SCOPES];
// Each GET after a write is tried this often (a 429, a 5xx or no answer), with a pause between.
const READ_TRIES = 3;
const defaultWait = attempt => pause(1000 * attempt);

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
    // The ticket labels the log rows and the RELEASES.md mirror. It can't be proved, but it can
    // be held to what plan.mjs accepts.
    if (typeof plan.ticket !== 'string' || !TICKET.test(plan.ticket)) throw new Refused(`the plan's ticket ${JSON.stringify(plan.ticket)} isn't a ticket name such as 46 or W0-11: plan again`);
    return plan;
}

// The plan file's copy of something apply derives again, compared as JSON (as the file holds it).
const sameAsFile = (derived, fromFile) => isDeepStrictEqual(JSON.parse(JSON.stringify(derived)), fromFile);

// --- Approved mode's prompts ------------------------------------------------------------------

// Reads one line at the terminal, shown as typed or hidden. Refuses without a terminal, before
// asking anything. Resolves null when stdin closes first.
export async function askAtTerminal({
    input = process.stdin, output = process.stdout, question, hidden = false,
}) {
    if (!input.isTTY || !output.isTTY) throw new Refused(NO_TERMINAL);
    const sink = new Writable({
        write(chunk, encoding, done) {
            if (!sink.muted) output.write(chunk, encoding);
            done();
        },
    });
    sink.muted = false;
    const prompt = readline.createInterface({ input, output: sink, terminal: true });
    try {
        return await new Promise(resolve => {
            prompt.once('close', () => resolve(null));
            prompt.question(question, answer => resolve(answer));
            sink.muted = hidden;
        });
    } finally {
        sink.muted = false;
        if (hidden) output.write('\n');
        prompt.close();
    }
}

// The approved-write token, at a hidden prompt. The caller uses it for this run only.
export async function askApprovedToken(io = {}) {
    const token = await askAtTerminal({ ...io, question: 'Paste the approved-write token (hidden, used for this run and never stored), then Return: ', hidden: true });
    if (token === null) throw new Refused('no answer (stdin closed): stopped');
    if (!token.trim()) throw new Refused('no token given: stopped');
    return token.trim();
}

// Shaun's go-ahead, after the diff apply derived: the first 8 characters of the plan's sha256.
// A wrong answer isn't repeated back, in case a token was pasted here by mistake.
export async function confirmPlanSha({ planSha, ...io }) {
    const typed = await askAtTerminal({ ...io, question: 'To apply the writes above, type the first 8 characters of the plan\'s sha256, as plan.mjs printed it: ' });
    if (typed === null) throw new Refused('no answer (stdin closed): stopped');
    if (typed.trim().toLowerCase() !== planSha.slice(0, 8)) throw new Refused('what was typed isn\'t the start of this plan\'s sha256: stopped');
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

// One GET after a write, tried up to READ_TRIES times. A read naming another channel isn't
// tried again: that isn't a blip.
async function readTried(client, spec, wait, attempt = 1) {
    try {
        return await takeRead(client, spec);
    } catch (error) {
        if (error.channel || attempt >= READ_TRIES) throw error;
        await wait(attempt);
        return readTried(client, spec, wait, attempt + 1);
    }
}

const readRecord = (spec, data) => ({
    key: spec.key, object: spec.object, scope: spec.scope, data, sha256: sha256(canonicalJson(data)),
});

async function readAll(client, specs, wait) {
    const records = [];
    for (const spec of specs) {
        // eslint-disable-next-line no-await-in-loop
        records.push(readRecord(spec, await readTried(client, spec, wait)));
    }
    return records;
}

// One setting at each scope, each read on its own, so a scope that can't be read doesn't hide
// another's change. Returns the data by scope, the records, and the scopes left unread.
async function readScopes(client, { request, what }, scopes, wait) {
    const data = {};
    const records = [];
    const unread = [];
    for (const scope of scopes) {
        const spec = settingsSpec(request, what, scope, scope === String(CHANNEL) ? 'channel' : 'none');
        try {
            // eslint-disable-next-line no-await-in-loop
            const value = await readTried(client, spec, wait);
            data[scope] = value;
            records.push(readRecord(spec, value));
        } catch (error) {
            unread.push({ scope, message: error.message });
        }
    }
    return { data, records, unread };
}

const scopeData = (records, request, what, scopes) => Object.fromEntries(scopes.map(scope => [scope, records.find(record => record.key === settingsSpec(request, what, scope).key)?.data]));
const describeChanges = changes => changes.map(change => `${change.scope} changed (${change.keys.join(', ')})`).join('; ');
const describeUnread = unread => unread.map(({ scope, message }) => `${scope} couldn't be read (${message})`).join('; ');

// Puts back the snapshot's values after a failed part 3: the whole read of each channel that
// changed (BigCommerce resets a channel's override only when every field is sent, null where it
// inherited), 1895766 first, and the changed keys of the global value. A scope that couldn't be
// read is never written blind. Then reads all four again: `held` says they match the snapshot.
async function restoreSettings({
    client, item, before, after, root, row, now, wait,
}) {
    const { request } = item;
    const results = [];
    for (const scope of RESTORE_SCOPES.filter(name => Object.hasOwn(after, name))) {
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
    const check = await readScopes(client, item, RESTORE_SCOPES, wait);
    const held = !check.unread.length && RESTORE_SCOPES.every(scope => isDeepStrictEqual(check.data[scope], before[scope]));
    return { results, held };
}

// After a lifted settings write was sent, whatever it answered: the re-read of 1895766 and part
// 3. Returns null to go on, or the outcome that stops the run. Every path writes the result row.
async function afterLiftedSettingsWrite({
    client, item, fresh, response, sendError, wait, result, lock, afterRecords, log, root, row, now,
}) {
    const { index, request, what } = item;
    const status = response ? response.status : null;
    let failure = null;
    if (sendError) failure = { short: `no answer: ${sendError.message}`, long: `got no answer: ${sendError.message}` };
    else if (!response.ok) failure = { short: describeFailure(response), long: `answered ${describeFailure(response)}` };
    const tail = failure ? `; the write itself ${failure.long}` : '';
    const wrong = response && response.ok ? responseChannelProblems(response.body) : [];
    const read = await readScopes(client, item, RESTORE_SCOPES, wait);
    afterRecords.push(...read.records);
    const afterSha = read.records.length ? sha256(canonicalJson(read.records)) : null;
    const before = scopeData(fresh.reads, request, what, RESTORE_SCOPES);
    const changes = part3Changes(before, read.data, PART3_SCOPES.filter(scope => Object.hasOwn(read.data, scope)));
    const notes = [...(read.unread.length ? [describeUnread(read.unread)] : []), ...wrong];
    const where = { request: index, method: request.method, path: request.path };

    if (changes.length) {
        log(`FAIL     part 3: ${describeChanges(changes)}. Restoring the snapshot's values now`);
        const restore = await restoreSettings({
            client, item, before, after: read.data, root, row, now, wait,
        });
        const message = [`part 3 failed: ${describeChanges(changes)}`, ...notes, restore.held ? 'restored and locked' : 'restore not confirmed: check the store by hand; locked'].join('; ') + tail;
        result({
            status, outcome: 'stopped', after_sha256: afterSha, message,
        });
        lock(`part 3 of ticket 21's test failed for ${what.object}: ${describeChanges(changes)}`, {
            ...where, changes, unread: read.unread, restore: restore.results, restored: restore.held,
        });
        log(restore.held ? 'restored 1895766, the global value and every channel to the snapshot\'s values, and wrote LOCKED' : 'STOP     the restore didn\'t read back as the snapshot: check the store by hand. LOCKED is written');
        return {
            outcome: 'locked', request: index, message, changes, restore,
        };
    }
    if (notes.length) {
        const proof = read.unread.length ? `part 3 unproved: ${describeUnread(read.unread)}` : 'part 3 held';
        const message = [proof, ...wrong].join('; ') + tail;
        result({
            status, outcome: 'stopped', after_sha256: afterSha, message,
        });
        lock(read.unread.length ? `part 3 of ticket 21's test is unproved for ${what.object}: ${message}` : `a write's response named another channel: ${wrong.join('; ')}`, { ...where, unread: read.unread });
        log(`STOP     ${message}. LOCKED is written`);
        return { outcome: 'locked', request: index, message };
    }
    log('part 3   the global value and channels 1 and 1855224 read back unchanged');
    if (failure) {
        const message = `${failure.short}; part 3 held: the global value and channels 1 and 1855224 read back unchanged`;
        result({
            status, outcome: 'failed', after_sha256: afterSha, message,
        });
        return { outcome: 'failed', request: index, message };
    }
    result({
        status, outcome: 'ok', after_sha256: afterSha, message: '',
    });
    log(`ok       ${index + 1}. ${status}`);
    return null;
}

// After any other write: the response's checks, the re-read, and in approved mode part 3's
// report. Returns null to go on, or the outcome that stops the run.
async function afterWrite({
    client, item, fresh, response, sendError, wait, result, lock, afterRecords, log, mode, created,
}) {
    const { index, request, what } = item;
    const where = { request: index, method: request.method, path: request.path };
    if (sendError) {
        const message = `no answer: ${sendError.message}`;
        result({ status: null, outcome: 'failed', message });
        return { outcome: 'failed', request: index, message };
    }
    if (!response.ok) {
        const message = describeFailure(response);
        result({ status: response.status, outcome: 'failed', message });
        return { outcome: 'failed', request: index, message };
    }
    if (mode === 'lifted') {
        const wrong = responseChannelProblems(response.body, { requireOnData: ['widget', 'page', 'script'].includes(what.kind) });
        if (wrong.length) {
            const message = wrong.join('; ');
            result({ status: response.status, outcome: 'stopped', message });
            lock(`a write's response named another channel: ${message}`, where);
            return { outcome: 'locked', request: index, message };
        }
    }
    const ids = createdIds(item, response);
    if (what.action === 'create' && ids.length) created.set(index, ids[0]);
    const id = what.id ?? (ids.length ? ids.join(',') : null);
    let records;
    try {
        records = await readAll(client, reReadSpecs(item, ids, mode), wait);
    } catch (error) {
        const message = `the write answered ${response.status}, but its re-read stopped: ${error.message}`;
        result({
            id, status: response.status, outcome: 'stopped', message,
        });
        if (error.channel) {
            lock(`a re-read after a write named another channel: ${error.message}`, where);
            return { outcome: 'locked', request: index, message };
        }
        return { outcome: 'failed', request: index, message };
    }
    afterRecords.push(...records);
    let afterSha = sha256(canonicalJson(records));
    if (what.kind === 'settings' && mode === 'approved' && APPROVED_SETTINGS[what.settingsPath].channelReads) {
        const scopes = [...LIVE_CHANNELS, CHANNEL].map(String);
        const read = await readScopes(client, item, scopes, wait);
        afterRecords.push(...read.records);
        afterSha = sha256(canonicalJson([...records, ...read.records]));
        if (read.unread.length) {
            const message = `the write answered ${response.status}, but part 3's report couldn't be read: ${describeUnread(read.unread)}`;
            result({
                id, status: response.status, outcome: 'stopped', after_sha256: afterSha, message,
            });
            return { outcome: 'failed', request: index, message };
        }
        const all = ['global', ...scopes];
        const changes = part3Changes(scopeData(fresh.reads, request, what, all), { ...read.data, global: records[0].data }, all);
        log(`part 3 (reported, not enforced): ${changes.length ? describeChanges(changes) : 'nothing read back changed'}`);
    }
    result({
        id, status: response.status, outcome: 'ok', after_sha256: afterSha, message: '',
    });
    log(`ok       ${index + 1}. ${response.status}${id ? `, ${what.object} ${id}` : ''}`);
    return null;
}

// Applies a plan. Throws Refused before anything is written; once writing starts it returns
// { outcome: 'applied' | 'failed' | 'locked', ... } and every request it sent has its log rows.
// - confirm({ planSha, diff, requests }) runs after the diff is derived and shown, and before the
//   first write; it throws to stop. Approved mode needs one: Shaun's typed go-ahead.
// - dryRun stops there instead, having written nothing: { outcome: 'dry-run', ... }.
export async function applyPlan({
    planText, client, phase, root, operator, approved = false, confirm, dryRun = false, now = () => new Date(), log = () => {}, wait = defaultWait,
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
    const diff = diffLines(items, fresh, mode);
    if (!sameAsFile(diff, plan.diff)) throw new Refused('the plan\'s diff isn\'t what a fresh read of the store gives: it was edited after plan.mjs made it. Plan again');
    if (!sameAsFile(writesFor(items), plan.writes)) throw new Refused('the plan\'s list of writes isn\'t what its requests make: it was edited after plan.mjs made it. Plan again');
    if (mode === 'lifted' && !sameAsFile(proofsFor(items, fresh), plan.proofs)) throw new Refused('the plan\'s proofs aren\'t what a fresh read of the store proves: it was edited after plan.mjs made it. Plan again');
    log('diff, from a fresh read of the store (the same as the plan\'s):');
    diff.forEach(line => log(line));
    const requests = items.map(item => item.request);
    if (dryRun) return { outcome: 'dry-run', count: items.length, diff };
    if (approved && typeof confirm !== 'function') throw new Refused('approved mode applies nothing without Shaun\'s go-ahead at his terminal');
    if (confirm) await confirm({ planSha, diff, requests });

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

    const lock = (reason, details) => writeLocked(root, {
        locked: now().toISOString(), reason, plan: planSha, plan_created: plan.created, ticket: plan.ticket, ...details,
    });

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
        let response = null;
        let sendError = null;
        try {
            // Requests go one after another: each may need the uuid the one before created.
            // eslint-disable-next-line no-await-in-loop
            response = await client.request({
                method: request.method, path: request.path, query: request.query, body,
            });
        } catch (error) {
            sendError = error;
        }
        const context = {
            client, item, fresh, response, sendError, wait, result, lock, afterRecords, log, mode, created, root, row, now,
        };
        // eslint-disable-next-line no-await-in-loop
        const stop = what.kind === 'settings' && mode === 'lifted' ? await afterLiftedSettingsWrite(context) : await afterWrite(context);
        if (stop) return finish(stop);
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
        say(`Plan ${files[0]}, made ${plan.created} for ticket ${plan.ticket} (${plan.mode}), sha256 ${sha256(planText)}`);
        if (approved) {
            // What will be sent, exactly. The diff follows once the fresh read is in.
            say('The exact requests:');
            (Array.isArray(plan.requests) ? plan.requests : []).forEach((request, index) => say(`  ${index + 1}. ${request.method} ${request.path}${queryString(request.query)} ${JSON.stringify(request.body)}`));
        }
        const token = approved ? await askApprovedToken() : readStoreToken('write').token;
        secrets.push(token);
        const storeHash = await commandStoreHash();
        if (storeHash !== plan.store_hash) throw new Refused(`the plan is for store ${plan.store_hash}, and this checkout's store is ${storeHash}`);
        const client = createClient({ storeHash, token, fetch: await commandFetch(root) });
        const lock = acquireLock('store-write', `scripts/store/apply.mjs ${path.basename(files[0])}`, { releaseOnExit: true });
        try {
            if (lock.brokeStale) say(lock.brokeStale);
            const result = await applyPlan({
                planText,
                client,
                phase,
                root,
                operator: approved ? 'Shaun at his terminal (--approved)' : operatorName(),
                approved,
                confirm: approved ? ({ planSha }) => confirmPlanSha({ planSha }) : undefined,
                log: say,
            });
            if (result.outcome === 'applied') say(`applied: ${result.count} request${result.count === 1 ? '' : 's'} on ${approved ? 'store-wide' : CHANNEL}; the log is ${path.join(root, 'log.jsonl')}`);
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
