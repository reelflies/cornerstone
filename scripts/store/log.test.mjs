// Tests scripts/store/log.mjs (W0-11): the write log outside git, and its mirror for RELEASES.md.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    LOG_NAME, appendLogRow, formatStoreWrites, logRow, readLogRows, unfinishedWarnings, unfinishedWrites,
} from './log.mjs';

const SCRIPT = fileURLToPath(new URL('./log.mjs', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-store-log-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const SHA = 'a'.repeat(64);
const PLAN = 'b'.repeat(64);
const base = {
    date: '2026-10-06T20:00:00.000Z',
    channel: 1895766,
    object: 'placements',
    id: 'e1e1e1e1-1234-4abc-8def-0123456789ab',
    action: 'update',
    snapshot_sha256: SHA,
    ticket: '46',
    operator: 'rook on t46/hero',
    mode: 'lifted',
    plan_sha256: PLAN,
    request: 0,
    method: 'PUT',
    path: '/v3/content/placements/e1e1e1e1-1234-4abc-8def-0123456789ab',
};

test('an intent row holds the date, channel, object, id, action, snapshot sha256, ticket and operator', () => {
    const row = logRow({ row: 'intent', ...base });
    assert.deepEqual(Object.keys(row).slice(0, 9), ['row', 'date', 'channel', 'object', 'id', 'action', 'snapshot_sha256', 'ticket', 'operator']);
    assert.equal(row.row, 'intent');
});

test('a result row adds the status, the outcome and the re-read\'s sha256', () => {
    const row = logRow({
        row: 'result', ...base, status: 200, outcome: 'ok', after_sha256: 'c'.repeat(64), message: '',
    });
    assert.equal(row.outcome, 'ok');
    assert.throws(() => logRow({ row: 'result', ...base, outcome: 'ok' }), /a result row needs status/);
    assert.throws(() => logRow({
        row: 'result', ...base, status: 200, outcome: 'maybe',
    }), /outcome must be ok, failed or stopped/);
});

test('a row missing a field, or with a field in the wrong shape, is refused before anything is written', () => {
    for (const field of ['date', 'channel', 'object', 'action', 'snapshot_sha256', 'ticket', 'operator', 'mode']) {
        const { [field]: dropped, ...rest } = base;
        assert.ok(dropped !== undefined);
        assert.throws(() => logRow({ row: 'intent', ...rest }), new RegExp(field));
    }
    assert.throws(() => logRow({ row: 'intent', ...base, snapshot_sha256: 'abc' }), /snapshot_sha256/);
    assert.throws(() => logRow({ row: 'intent', ...base, action: 'delete' }), /action/);
    assert.throws(() => logRow({ row: 'intent', ...base, channel: 1 }), /channel/);
    assert.throws(() => logRow({ row: 'maybe', ...base }), /row must be intent or result/);
    // A restore after a failed part 3 names the scope it put back.
    assert.equal(logRow({
        row: 'intent', ...base, action: 'restore', channel: 'global',
    }).channel, 'global');
    assert.equal(logRow({
        row: 'intent', ...base, action: 'restore', channel: 1855224,
    }).channel, 1855224);
});

test('rows are appended to log.jsonl, one JSON object a line, and read back in order', () => {
    const root = path.join(tmp, 'append');
    appendLogRow(root, logRow({ row: 'intent', ...base }));
    appendLogRow(root, logRow({
        row: 'result', ...base, status: 200, outcome: 'ok', after_sha256: 'c'.repeat(64),
    }));
    const lines = fs.readFileSync(path.join(root, LOG_NAME), 'utf8').split('\n');
    assert.equal(lines.length, 3);
    assert.equal(lines[2], '');
    assert.equal(JSON.parse(lines[0]).row, 'intent');
    assert.deepEqual(readLogRows(root).map(row => row.row), ['intent', 'result']);
    assert.deepEqual(readLogRows(path.join(tmp, 'none')), []);
});

test('the RELEASES.md mirror has one line per request, its outcome, and a missing result says so', () => {
    const rows = [
        logRow({ row: 'intent', ...base }),
        logRow({
            row: 'result', ...base, date: '2026-10-06T20:00:01.000Z', status: 200, outcome: 'ok', after_sha256: 'c'.repeat(64),
        }),
        logRow({
            row: 'intent', ...base, request: 1, object: 'settings/inventory', id: null, action: 'settings', path: '/v3/settings/inventory',
        }),
    ];
    const lines = formatStoreWrites(rows);
    assert.equal(lines[0], '| Date | Channel | Object | Id | Action | Outcome | Ticket | Operator | Snapshot | Plan |');
    assert.match(lines[2], /^\| 2026-10-06 20:00 UTC \| 1895766 \| placements \| e1e1e1e1-1234-4abc-8def-0123456789ab \| update \| ok \(200\) \| 46 \| rook on t46\/hero \| aaaaaaaa \| bbbbbbbb \|$/);
    assert.match(lines[3], /\| settings\/inventory \| – \| settings \| no result row: the run stopped mid-request \|/);
    assert.deepEqual(formatStoreWrites(rows, { since: '2026-10-07' }).length, 2);
});

test('an intent row with no result row of its own is an unfinished write, even when the same plan ran again', () => {
    const ok = { status: 200, outcome: 'ok' };
    const rows = [
        logRow({ row: 'intent', ...base }),
        logRow({ row: 'result', ...base, ...ok }),
        logRow({ row: 'intent', ...base, request: 1 }),
        // The same plan run again: its own result row doesn't finish the first run's intent.
        logRow({
            row: 'intent', ...base, date: '2026-10-06T21:00:00.000Z', request: 2,
        }),
        logRow({
            row: 'intent', ...base, date: '2026-10-06T21:30:00.000Z', request: 2,
        }),
        logRow({
            row: 'result', ...base, date: '2026-10-06T21:30:01.000Z', request: 2, ...ok,
        }),
    ];
    assert.deepEqual(unfinishedWrites(rows).map(row => [row.request, row.date]), [[1, base.date], [2, '2026-10-06T21:00:00.000Z']]);
    assert.deepEqual(unfinishedWrites(rows.slice(0, 2)), []);
});

test('plan and apply warn of each unfinished write, naming what to check before writing it again', () => {
    const root = path.join(tmp, 'unfinished');
    assert.deepEqual(unfinishedWarnings(root), [], 'no log yet');
    appendLogRow(root, logRow({ row: 'intent', ...base }));
    const [line, ...rest] = unfinishedWarnings(root);
    assert.deepEqual(rest, []);
    assert.equal(line, `WARN     log.jsonl has an intent row with no result row: 2026-10-06 20:00 UTC, PUT ${base.path} (placements update ${base.id}), plan bbbbbbbb request 1, ticket 46. That run stopped mid-request, so the write may have landed: check the object on the store before writing it again`);
});

test('the CLI prints the mirror for the orchestrator, and only under node --test may RF_STORE_ROOT move it', () => {
    const root = path.join(tmp, 'cli');
    appendLogRow(root, logRow({ row: 'intent', ...base }));
    const result = spawnSync(process.execPath, [SCRIPT, '--since', '2026-10-06'], { encoding: 'utf8', env: { ...process.env, RF_STORE_ROOT: root } });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\| placements \|/);
    const usage = spawnSync(process.execPath, [SCRIPT, '--since'], { encoding: 'utf8', env: { ...process.env, RF_STORE_ROOT: root } });
    assert.equal(usage.status, 2);
    // A date without --since is a mistake, not "every row": a mirror built from it would repeat
    // rows RELEASES.md already has.
    for (const args of [['2026-10-06'], ['2026-10-06', '--since', '2026-10-06'], ['--since', '2026-10-06', 'extra']]) {
        const wrong = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, RF_STORE_ROOT: root } });
        assert.equal(wrong.status, 2, `${args.join(' ')}: ${wrong.stdout}`);
        assert.match(wrong.stderr, /^usage: node scripts\/store\/log\.mjs \[--since YYYY-MM-DD\]/);
    }
    const outside = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', env: { ...process.env, RF_STORE_ROOT: root, NODE_TEST_CONTEXT: '' } });
    assert.equal(outside.status, 1);
    assert.match(outside.stderr, /RF_STORE_ROOT is a test seam/);
});

test('RELEASES.md merges as a union, so release-log PRs and the store-write mirror keep both sides', () => {
    const attributes = fs.readFileSync(fileURLToPath(new URL('../../.gitattributes', import.meta.url)), 'utf8');
    assert.match(attributes, /^RELEASES\.md merge=union$/m);
    const checked = spawnSync('git', ['check-attr', 'merge', '--', 'RELEASES.md'], { encoding: 'utf8', cwd: fileURLToPath(new URL('../../', import.meta.url)) });
    assert.equal(checked.stdout.trim(), 'RELEASES.md: merge: union');
});
