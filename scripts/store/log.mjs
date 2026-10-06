#!/usr/bin/env node
// The store-write log (W0-11): ~/reelflies/store-snapshots/log.jsonl, outside git, so an
// abandoned PR can't lose the record of a real store write. apply.mjs appends an intent row
// before each request and a result row after it, each flushed to disk before it goes on.
//
// A row holds the date, channel, object, id, action, snapshot sha256, ticket and operator, then
// the mode, the plan's sha256, the request's index, method and path, and for a result the HTTP
// status, the outcome (ok, failed or stopped), the re-read's sha256 and a message.
//
// An intent row that no result row answers means a run stopped mid-request, so its write may
// have landed: plan.mjs and apply.mjs warn of each one before they read the store.
//
// The orchestrator mirrors new rows into RELEASES.md's "Store writes" section through each
// release-log PR (plan/build-pipeline.md section 6.5). This prints them as that table's rows:
//
//   node scripts/store/log.mjs [--since YYYY-MM-DD]

import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import { CHANNEL, LIVE_CHANNELS } from './channel.mjs';
import { storeRoot } from './snapshot.mjs';

export const LOG_NAME = 'log.jsonl';

const ORDER = ['row', 'date', 'channel', 'object', 'id', 'action', 'snapshot_sha256', 'ticket', 'operator', 'mode', 'plan_sha256', 'request', 'method', 'path', 'status', 'outcome', 'after_sha256', 'message'];
const ACTIONS = ['create', 'update', 'upsert', 'settings', 'restore'];
const OUTCOMES = ['ok', 'failed', 'stopped'];
const HEX64 = /^[0-9a-f]{64}$/;

const text = value => typeof value === 'string' && value.trim() !== '';

function checkChannel(fields) {
    const { channel, action, mode } = fields;
    if (channel === CHANNEL) return;
    if (mode === 'approved' && channel === 'store-wide') return;
    // A restore after a failed part 3 puts back the global value or a live channel's.
    if (action === 'restore' && (channel === 'global' || LIVE_CHANNELS.includes(channel))) return;
    throw new Error(`the log row's channel ${JSON.stringify(channel)} isn't 1895766 (or "store-wide" for an approved write, or a scope a restore put back)`);
}

// Checks a row and returns it with its fields in the documented order.
export function logRow(fields) {
    if (!['intent', 'result'].includes(fields.row)) throw new Error(`the log row's row must be intent or result, not ${JSON.stringify(fields.row)}`);
    if (!text(fields.date) || Number.isNaN(Date.parse(fields.date))) throw new Error('the log row has no date (an ISO time)');
    if (!('channel' in fields)) throw new Error('the log row has no channel');
    checkChannel(fields);
    if (!text(fields.object)) throw new Error('the log row has no object');
    if (!ACTIONS.includes(fields.action)) throw new Error(`the log row's action must be one of ${ACTIONS.join(', ')}, not ${JSON.stringify(fields.action)}`);
    if (!HEX64.test(fields.snapshot_sha256 || '')) throw new Error('the log row\'s snapshot_sha256 must be a sha256');
    if (!text(fields.ticket)) throw new Error('the log row has no ticket');
    if (!text(fields.operator)) throw new Error('the log row has no operator');
    if (!['lifted', 'approved'].includes(fields.mode)) throw new Error('the log row\'s mode must be lifted or approved');
    if (fields.plan_sha256 !== undefined && !HEX64.test(fields.plan_sha256)) throw new Error('the log row\'s plan_sha256 must be a sha256');
    if (fields.row === 'result') {
        if (!('status' in fields) || (fields.status !== null && !Number.isInteger(fields.status))) throw new Error('a result row needs status: the HTTP status, or null when no answer came');
        if (!OUTCOMES.includes(fields.outcome)) throw new Error(`a result row's outcome must be ok, failed or stopped, not ${JSON.stringify(fields.outcome)}`);
        if (fields.after_sha256 !== undefined && fields.after_sha256 !== null && !HEX64.test(fields.after_sha256)) throw new Error('the log row\'s after_sha256 must be a sha256');
    }
    const row = {};
    for (const key of ORDER) {
        if (key === 'id') row.id = fields.id ?? null;
        else if (fields[key] !== undefined) row[key] = fields[key];
    }
    return row;
}

// Appends one row and flushes it to disk before returning, so the row exists before the request.
export function appendLogRow(root, row) {
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const fd = fs.openSync(path.join(root, LOG_NAME), 'a', 0o600);
    try {
        fs.writeSync(fd, `${JSON.stringify(row)}\n`);
        fs.fsyncSync(fd);
    } finally {
        fs.closeSync(fd);
    }
}

export function readLogRows(root) {
    let content;
    try {
        content = fs.readFileSync(path.join(root, LOG_NAME), 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
    }
    return content.split('\n').filter(Boolean).map(line => JSON.parse(line));
}

const cell = value => String(value ?? '–').replace(/\|/g, '\\|').replace(/\s+/g, ' ');
const when = date => `${date.slice(0, 10)} ${date.slice(11, 16)} UTC`;
const pairKey = row => [row.plan_sha256, row.request, row.action, row.channel].join('|');

// The intent rows no result row answers: a run that stopped mid-request (killed, or the Mac
// slept), so its write may have landed. A result row answers the latest open intent row of the
// same plan, request, action and channel, so a plan run again doesn't hide an earlier run's gap.
export function unfinishedWrites(rows) {
    const open = new Map();
    for (const row of rows) {
        const key = pairKey(row);
        if (row.row === 'intent') open.set(key, [...(open.get(key) || []), row]);
        else if (row.row === 'result' && open.has(key)) open.get(key).pop();
    }
    const left = new Set([...open.values()].flat());
    return rows.filter(row => left.has(row));
}

// plan.mjs and apply.mjs print these before they read the store: one WARN line per unfinished
// write. A lifted settings write that stopped mid-request has also left LOCKED (apply.mjs).
export function unfinishedWarnings(root) {
    let rows;
    try {
        rows = readLogRows(root);
    } catch (error) {
        return [`WARN     ${path.join(root, LOG_NAME)} can't be read (${error.message}), so an unfinished write can't be found`];
    }
    return unfinishedWrites(rows).map(row => `WARN     ${LOG_NAME} has an intent row with no result row: ${when(row.date)}, ${row.method} ${row.path} (${row.object} ${row.action}${row.id ? ` ${row.id}` : ''}), plan ${row.plan_sha256 ? row.plan_sha256.slice(0, 8) : '–'} request ${Number.isInteger(row.request) ? row.request + 1 : '–'}, ticket ${row.ticket}. That run stopped mid-request, so the write may have landed: check the object on the store before writing it again`);
}

// The rows for RELEASES.md's "Store writes" table: one per request, from its intent row, with its
// result's outcome, or a note that the run stopped before one was written.
export function formatStoreWrites(rows, { since } = {}) {
    const lines = [
        '| Date | Channel | Object | Id | Action | Outcome | Ticket | Operator | Snapshot | Plan |',
        '|---|---|---|---|---|---|---|---|---|---|',
    ];
    rows.forEach((row, index) => {
        if (row.row !== 'intent' || (since && row.date.slice(0, 10) < since)) return;
        const result = rows.slice(index + 1).find(other => other.row === 'result' && pairKey(other) === pairKey(row));
        const outcome = result
            ? `${result.outcome}${result.status ? ` (${result.status})` : ''}${result.message ? `: ${result.message}` : ''}`
            : 'no result row: the run stopped mid-request';
        lines.push(`| ${[when(row.date), row.channel, row.object, row.id, row.action, outcome, row.ticket, row.operator, row.snapshot_sha256.slice(0, 8), row.plan_sha256 ? row.plan_sha256.slice(0, 8) : '–'].map(cell).join(' | ')} |`);
    });
    return lines;
}

function main(argv) {
    const sinceIndex = argv.indexOf('--since');
    const since = sinceIndex >= 0 ? argv[sinceIndex + 1] : undefined;
    const unknown = argv.filter((arg, index) => index !== sinceIndex && !(sinceIndex >= 0 && index === sinceIndex + 1));
    if (unknown.length || (sinceIndex >= 0 && !/^\d{4}-\d{2}-\d{2}$/.test(since || ''))) {
        console.error('usage: node scripts/store/log.mjs [--since YYYY-MM-DD]');
        return 2;
    }
    try {
        console.log(formatStoreWrites(readLogRows(storeRoot()), { since }).join('\n'));
        return 0;
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        return 1;
    }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
