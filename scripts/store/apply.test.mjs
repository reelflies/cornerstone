// Tests scripts/store/apply.mjs (W0-11) on fixture responses, with no token and no network:
// a fresh snapshot or a refusal, exactly the plan's requests, the log rows around each one,
// the re-reads, part 3 with its restore and lock, and approved mode.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { acquireLock, limitMinutes } from '../lib/lock.mjs';
import { parseCalendar, phaseOn } from '../lib/release-calendar.mjs';
import {
    SMOKE_TESTS, applyPlan, askApprovedToken, confirmPlanSha, lockedProblem, readPlan,
} from './apply.mjs';
import { Refused } from './allowlist.mjs';
import { createClient } from './client.mjs';
import { readLogRows } from './log.mjs';
import { buildPlan, checkRequests, planDigest } from './plan.mjs';
import { readsFor, sha256, takeSnapshot } from './snapshot.mjs';
import { storeCheckout } from './fixtures/checkout.mjs';
import {
    FAKE_TOKEN, STORE_HASH, fixtureFetch, loadFixture,
} from './fixtures/store.mjs';

const APPLY = fileURLToPath(new URL('./apply.mjs', import.meta.url));
const widgets = loadFixture('widgets.json');
const inventory = loadFixture('settings-inventory.json');
const PLACEMENT = 'e1e1e1e1-1234-4abc-8def-0123456789ab';
const TEMPLATE = 'c0ffee00-1234-4abc-8def-0123456789ab';
const WIDGET = 'd00dfeed-1234-4abc-8def-0123456789ab';
const NEW_PLACEMENT = 'a7a7a7a7-1234-4abc-8def-0123456789ab';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-store-apply-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let rootCount = 0;
const newRoot = () => path.join(tmp, `root-${++rootCount}`);

const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');
const freeze = phaseOn(parseCalendar({ flip: '2027-03-01', status: 'set', source: 'ticket 10' }), '2027-02-20');

function clock(start = '2026-10-06T21:00:00.000Z') {
    let time = Date.parse(start);
    return () => {
        time += 1000;
        return new Date(time);
    };
}

async function makePlan(requests, routes, { mode = 'lifted', phase = unset } = {}) {
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes), readOnly: true,
    });
    const { plan } = await buildPlan({
        requests, ticket: '46', mode, phase, client, storeHash: STORE_HASH, operator: 'rook on w0/11', now: new Date('2026-10-06T20:00:00.000Z'),
    });
    return { plan, text: `${JSON.stringify(plan, null, 2)}\n` };
}

async function apply(text, routes, {
    approved = false, phase = unset, root = newRoot(), confirm = approved ? async () => {} : undefined, dryRun = false,
} = {}) {
    const calls = [];
    const lines = [];
    const client = createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes, { calls }) });
    const run = applyPlan({
        planText: text, client, phase, root, operator: 'rook on w0/11', approved, confirm, dryRun, now: clock(), log: line => lines.push(line), wait: async () => {},
    });
    return {
        run, calls, lines, root,
    };
}

const unpublish = { method: 'PUT', path: `/v3/content/placements/${PLACEMENT}`, body: { channel_id: 1895766, status: 'inactive' } };
const placementGet = `GET /v3/content/placements/${PLACEMENT}`;
const placementPut = `PUT /v3/content/placements/${PLACEMENT}`;

const labelOption = {
    method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: { option_out_of_stock_behavior: 'label_option' },
};
const inventoryRoutes = (overrides = {}) => ({
    'GET /v3/settings/inventory?channel_id=1895766': { body: inventory.channel_1895766 },
    'GET /v3/settings/inventory': { body: inventory.global },
    'GET /v3/settings/inventory?channel_id=1': { body: inventory.channel_1 },
    'GET /v3/settings/inventory?channel_id=1855224': { body: inventory.channel_1855224 },
    ...overrides,
});

test('an unpublish is applied exactly as planned: fresh snapshot, intent row, the PUT, the re-read, the result row', async () => {
    const { plan, text } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const root = newRoot();
    let intentBeforeRequest = false;
    const { run, calls } = await apply(text, {
        [placementGet]: [{ body: widgets.placement_item }, { body: widgets.placement_item_inactive }],
        [placementPut]: () => {
            intentBeforeRequest = readLogRows(root).some(row => row.row === 'intent');
            return { body: widgets.placement_item_inactive };
        },
    }, { root });
    const result = await run;
    assert.equal(result.outcome, 'applied');
    assert.ok(intentBeforeRequest, 'the intent row is on disk before the request is sent');
    assert.deepEqual(calls.map(call => `${call.method} ${call.path}`), [placementGet, placementPut, placementGet]);
    assert.deepEqual(calls[1].body, { channel_id: 1895766, status: 'inactive' });
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => row.row), ['intent', 'result']);
    const planSha = sha256(text);
    for (const row of rows) {
        assert.equal(row.channel, 1895766);
        assert.equal(row.object, 'placements');
        assert.equal(row.id, PLACEMENT);
        assert.equal(row.action, 'update');
        assert.equal(row.snapshot_sha256, plan.snapshot.sha256);
        assert.equal(row.plan_sha256, planSha);
        assert.equal(row.ticket, '46');
        assert.equal(row.operator, 'rook on w0/11');
        assert.equal(row.mode, 'lifted');
    }
    assert.equal(rows[1].status, 200);
    assert.equal(rows[1].outcome, 'ok');
    assert.match(rows[1].after_sha256, /^[0-9a-f]{64}$/);
    const files = fs.readdirSync(path.join(root, '1895766', 'placements')).map(file => file.replace(/^.*Z-/, '')).sort();
    assert.deepEqual(files, [`after-${planSha.slice(0, 8)}.json`, `before-${planSha.slice(0, 8)}.json`]);
    assert.equal(lockedProblem(root), null);
});

test('a stale plan is refused: the fresh snapshot differs, and nothing is written or logged', async () => {
    const { text } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const moved = structuredClone(widgets.placement_item);
    moved.data.sort_order = 5;
    const { run, calls, root } = await apply(text, { [placementGet]: { body: moved } });
    await assert.rejects(run, error => {
        assert.equal(error.name, 'Refused');
        assert.match(error.message, new RegExp(`the plan is stale: ${placementGet} changed since the plan was made \\(2026-10-06T20:00:00.000Z\\): plan again`));
        return true;
    });
    assert.deepEqual(calls.map(call => call.method), ['GET']);
    assert.deepEqual(readLogRows(root), []);
});

test('a plan edited after it was made is refused before any read', async () => {
    const { plan } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const edited = structuredClone(plan);
    edited.requests[0].body.status = 'active';
    const { run, calls } = await apply(`${JSON.stringify(edited, null, 2)}\n`, {});
    await assert.rejects(run, /the plan's digest doesn't match its contents: it was edited after plan\.mjs made it/);
    assert.deepEqual(calls, []);
    await assert.rejects(apply('{"format": "something else"}', {}).then(started => started.run), /isn't a store plan/);
    await assert.rejects(apply('not json', {}).then(started => started.run), /isn't a store plan/);
});

test('a settings write is applied once its proof holds, and part 3 reads the global value and both live channels after it', async () => {
    const { plan, text } = await makePlan([labelOption], inventoryRoutes());
    assert.equal(plan.proofs[0].proved, true);
    const { run, calls, root } = await apply(text, inventoryRoutes({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, { body: inventory.channel_1895766_after }],
        'PUT /v3/settings/inventory?channel_id=1895766': { body: inventory.put_response },
    }));
    const result = await run;
    assert.equal(result.outcome, 'applied');
    const order = calls.map(call => `${call.method} ${call.path}`);
    const put = order.indexOf('PUT /v3/settings/inventory?channel_id=1895766');
    assert.ok(put > 0);
    assert.deepEqual(order.slice(put + 1), [
        'GET /v3/settings/inventory?channel_id=1895766',
        'GET /v3/settings/inventory',
        'GET /v3/settings/inventory?channel_id=1',
        'GET /v3/settings/inventory?channel_id=1855224',
    ]);
    assert.deepEqual(calls[put].body, { option_out_of_stock_behavior: 'label_option' });
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.action, row.outcome]), [['intent', 'settings', undefined], ['result', 'settings', 'ok']]);
    assert.equal(lockedProblem(root), null);
});

test('a settings write whose plan has no proof is refused, even when the digest was remade to match', async () => {
    const { plan } = await makePlan([labelOption], inventoryRoutes());
    const forged = { ...structuredClone(plan), proofs: [] };
    forged.digest = planDigest(forged);
    const { run, calls } = await apply(`${JSON.stringify(forged, null, 2)}\n`, inventoryRoutes());
    await assert.rejects(run, /request 1: the plan has no proof of parts 1 and 2 of ticket 21's test for settings\/inventory: plan it with plan\.mjs/);
    assert.ok(calls.every(call => call.method === 'GET'));
});

test('apply proves parts 1 and 2 again from its own reads, and never trusts a proof the plan claims', async () => {
    const { plan } = await makePlan([labelOption], inventoryRoutes());
    // A plan forged on reads that prove nothing (the channel read is the global one), claiming a proof.
    const unprovable = inventoryRoutes({ 'GET /v3/settings/inventory?channel_id=1895766': { body: inventory.global } });
    const reads = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(unprovable), readOnly: true,
    });
    const snapshot = await takeSnapshot(reads, readsFor(checkRequests([labelOption], { mode: 'lifted', phase: unset }), 'lifted'));
    const forged = {
        ...structuredClone(plan),
        snapshot: {
            sha256: snapshot.sha256,
            reads: snapshot.reads.map(({
                key, object, scope, sha256: hash,
            }) => ({
                key, object, scope, sha256: hash,
            })),
        },
    };
    forged.digest = planDigest(forged);
    const { run, calls } = await apply(`${JSON.stringify(forged, null, 2)}\n`, unprovable);
    await assert.rejects(run, /request 1: parts 1 and 2 of ticket 21's three-part test aren't proved for settings\/inventory \(part 1: /);
    assert.ok(calls.every(call => call.method === 'GET'));
});

test('a proof the fresh reads no longer hold is refused, as a stale plan', async () => {
    const { text } = await makePlan([labelOption], inventoryRoutes());
    const { run, calls } = await apply(text, inventoryRoutes({ 'GET /v3/settings/inventory?channel_id=1895766': { body: inventory.global } }));
    await assert.rejects(run, /the plan is stale/);
    assert.ok(calls.every(call => call.method === 'GET'));
});

test('a failed part 3 restores the snapshot\'s values at once, stops, and locks every later apply', async () => {
    const { text } = await makePlan([labelOption], inventoryRoutes());
    const leaked = structuredClone(inventory.global);
    leaked.data.option_out_of_stock_behavior = 'label_option';
    const { run, calls, root } = await apply(text, inventoryRoutes({
        // The fresh snapshot, then the re-read after the write, then the check after the restore.
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, { body: inventory.channel_1895766_after }, { body: inventory.channel_1895766 }],
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: leaked }, { body: inventory.global }],
        'PUT /v3/settings/inventory?channel_id=1895766': { body: inventory.put_response },
        'PUT /v3/settings/inventory': { body: inventory.global },
    }));
    const result = await run;
    assert.equal(result.outcome, 'locked');
    const puts = calls.filter(call => call.method === 'PUT');
    assert.deepEqual(puts.map(call => [call.path, call.body]), [
        ['/v3/settings/inventory?channel_id=1895766', { option_out_of_stock_behavior: 'label_option' }],
        // 1895766 is put back first, with its whole read: BigCommerce resets an override only
        // when every field is sent, null where the channel inherited. Its PUT is the kind that
        // just leaked, so the global value and the live channels are put back after it.
        ['/v3/settings/inventory?channel_id=1895766', inventory.channel_1895766.data],
        ['/v3/settings/inventory', { option_out_of_stock_behavior: 'do_nothing' }],
    ]);
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.action, row.channel, row.outcome]), [
        ['intent', 'settings', 1895766, undefined],
        ['intent', 'restore', 1895766, undefined],
        ['result', 'restore', 1895766, 'ok'],
        ['intent', 'restore', 'global', undefined],
        ['result', 'restore', 'global', 'ok'],
        ['result', 'settings', 1895766, 'stopped'],
    ]);
    assert.match(rows[5].message, /part 3 failed: global changed \(option_out_of_stock_behavior\); restored and locked/);
    const locked = JSON.parse(fs.readFileSync(path.join(root, 'LOCKED'), 'utf8'));
    assert.match(locked.reason, /part 3 of ticket 21's test failed for settings\/inventory/);
    assert.deepEqual(locked.changes, [{ scope: 'global', keys: ['option_out_of_stock_behavior'] }]);
    assert.equal(locked.restored, true);
    assert.match(locked.clear, /Shaun removes this file/);
    // Every later apply refuses, before it reads anything.
    const { text: next } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const later = await apply(next, {}, { root });
    await assert.rejects(later.run, /LOCKED exists: every apply refuses until Shaun removes it/);
    assert.deepEqual(later.calls, []);
    assert.match(lockedProblem(root), /part 3 of ticket 21's test failed/);
});

// --- Part 3 after a settings write that went wrong: proved, or locked ------------------------------

const leakedGlobal = () => {
    const leaked = structuredClone(inventory.global);
    leaked.data.option_out_of_stock_behavior = 'label_option';
    return leaked;
};
const busy = { status: 429, body: { status: 429, title: 'Too many requests' } };
const down = { status: 503, body: { status: 503, title: 'Service unavailable' } };

async function settingsRun(overrides) {
    const { text } = await makePlan([labelOption], inventoryRoutes());
    const started = await apply(text, inventoryRoutes(overrides));
    const result = await started.run;
    return {
        ...started, result, rows: readLogRows(started.root), locked: lockedProblem(started.root),
    };
}

const reads = calls => calls.filter(call => call.method === 'GET').map(call => call.path);

test('part 3 can\'t be read after a settings write (the global read answers 429): a stopped row and LOCKED, never a throw', async () => {
    const {
        result, rows, locked, calls, root,
    } = await settingsRun({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, { body: inventory.channel_1895766_after }],
        'GET /v3/settings/inventory': [{ body: inventory.global }, busy],
        'PUT /v3/settings/inventory?channel_id=1895766': { body: inventory.put_response },
    });
    assert.equal(result.outcome, 'locked');
    assert.deepEqual(rows.map(row => [row.row, row.outcome]), [['intent', undefined], ['result', 'stopped']]);
    assert.match(rows[1].message, /part 3 unproved: global couldn't be read \(GET \/v3\/settings\/inventory answered 429: Too many requests\)/);
    assert.match(locked, /part 3 of ticket 21's test is unproved for settings\/inventory/);
    // Channels 1 and 1855224 are still read, and nothing is put back blind.
    assert.ok(reads(calls).includes('/v3/settings/inventory?channel_id=1855224'));
    assert.deepEqual(calls.filter(call => call.method === 'PUT').length, 1);
    assert.ok(fs.readdirSync(path.join(root, '1895766', 'settings-inventory')).some(file => file.endsWith(`after-${rows[0].plan_sha256.slice(0, 8)}.json`)), 'what was read is kept');
});

test('the 1895766 re-read fails after a settings write: part 3 is still read, a leak is put back, and the helper locks', async () => {
    const {
        result, rows, calls, root,
    } = await settingsRun({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, down],
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: leakedGlobal() }, { body: inventory.global }],
        'PUT /v3/settings/inventory?channel_id=1895766': { body: inventory.put_response },
        'PUT /v3/settings/inventory': { body: inventory.global },
    });
    assert.equal(result.outcome, 'locked');
    const puts = calls.filter(call => call.method === 'PUT').map(call => [call.path, call.body]);
    // 1895766 couldn't be read, so it isn't put back blind; the global value is.
    assert.deepEqual(puts, [
        ['/v3/settings/inventory?channel_id=1895766', { option_out_of_stock_behavior: 'label_option' }],
        ['/v3/settings/inventory', { option_out_of_stock_behavior: 'do_nothing' }],
    ]);
    // 1895766 still can't be read after the restore, so the restore can't be confirmed.
    assert.match(rows.at(-1).message, /part 3 failed: global changed \(option_out_of_stock_behavior\); 1895766 couldn't be read \(.*503.*\); restore not confirmed: check the store by hand; locked$/);
    assert.equal(rows.at(-1).outcome, 'stopped');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'LOCKED'), 'utf8')).restored, false);
});

test('a 1895766 re-read that fails with nothing leaked still locks: part 3 is unproved', async () => {
    const { result, rows, locked } = await settingsRun({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, down],
        'PUT /v3/settings/inventory?channel_id=1895766': { body: inventory.put_response },
    });
    assert.equal(result.outcome, 'locked');
    assert.match(rows.at(-1).message, /part 3 unproved: 1895766 couldn't be read/);
    assert.match(locked, /unproved/);
});

test('a settings PUT that answers 504 but was applied store-wide is caught by part 3, put back and locked', async () => {
    const { result, rows, calls } = await settingsRun({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, { body: inventory.channel_1895766_after }, { body: inventory.channel_1895766 }],
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: leakedGlobal() }, { body: inventory.global }],
        'PUT /v3/settings/inventory?channel_id=1895766': { status: 504, body: { status: 504, title: 'Gateway timeout' } },
        'PUT /v3/settings/inventory': { body: inventory.global },
    });
    assert.equal(result.outcome, 'locked');
    assert.equal(rows.at(-1).status, 504);
    assert.match(rows.at(-1).message, /part 3 failed: global changed \(option_out_of_stock_behavior\); restored and locked; the write itself answered 504: Gateway timeout/);
    assert.deepEqual(calls.filter(call => call.method === 'PUT').map(call => call.path), [
        '/v3/settings/inventory?channel_id=1895766', '/v3/settings/inventory?channel_id=1895766', '/v3/settings/inventory',
    ]);
});

test('a settings PUT whose connection drops is checked by part 3 all the same', async () => {
    const { result, rows } = await settingsRun({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, { body: inventory.channel_1895766_after }, { body: inventory.channel_1895766 }],
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: leakedGlobal() }, { body: inventory.global }],
        'PUT /v3/settings/inventory?channel_id=1895766': () => { throw new Error('socket hang up'); },
        'PUT /v3/settings/inventory': { body: inventory.global },
    });
    assert.equal(result.outcome, 'locked');
    assert.equal(rows.at(-1).status, null);
    assert.match(rows.at(-1).message, /part 3 failed: global changed .*; the write itself got no answer: socket hang up/);
});

test('a settings PUT the store refuses, with part 3 holding, fails without a lock', async () => {
    const {
        result, rows, locked, calls,
    } = await settingsRun({
        'PUT /v3/settings/inventory?channel_id=1895766': { status: 422, body: { status: 422, title: 'Invalid', errors: { option_out_of_stock_behavior: 'unknown value' } } },
    });
    assert.equal(result.outcome, 'failed');
    assert.equal(locked, null);
    assert.deepEqual(rows.map(row => [row.row, row.outcome, row.status ?? null]), [['intent', undefined, null], ['result', 'failed', 422]]);
    assert.match(rows[1].message, /^422: Invalid \(option_out_of_stock_behavior: unknown value\); part 3 held: the global value and channels 1 and 1855224 read back unchanged$/);
    assert.deepEqual(reads(calls).slice(-4), [
        '/v3/settings/inventory?channel_id=1895766', '/v3/settings/inventory', '/v3/settings/inventory?channel_id=1', '/v3/settings/inventory?channel_id=1855224',
    ]);
});

test('a part-3 read that answers 429 once is read again, and the write goes through', async () => {
    const { result, rows, locked } = await settingsRun({
        'GET /v3/settings/inventory?channel_id=1895766': [{ body: inventory.channel_1895766 }, { body: inventory.channel_1895766_after }],
        'GET /v3/settings/inventory': [{ body: inventory.global }, busy, { body: inventory.global }],
        'PUT /v3/settings/inventory?channel_id=1895766': { body: inventory.put_response },
    });
    assert.equal(result.outcome, 'applied');
    assert.equal(locked, null);
    assert.equal(rows.at(-1).outcome, 'ok');
});

const template = {
    method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766, name: 'rf-home-lead', template: '<section></section>' },
};
const widget = {
    method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766, name: 'Home lead', widget_template_uuid: { $created: 0 } },
};
const placement = {
    method: 'POST',
    path: '/v3/content/placements',
    body: {
        channel_id: 1895766, widget_uuid: { $created: 1 }, template_file: 'pages/home', region: 'home_below_menu', status: 'inactive',
    },
};
const listRoutes = {
    'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=1': { body: widgets.templates_list },
    'GET /v3/content/widgets?channel_id:in=1895766&limit=250&page=1': { body: widgets.widgets_list },
    'GET /v3/content/placements?channel_id:in=1895766&limit=250&page=1': { body: widgets.placements_list },
};

test('creates run in order, each taking the uuid an earlier one created, and each is re-read by its new uuid', async () => {
    const { text } = await makePlan([template, widget, placement], listRoutes);
    const { run, calls, root } = await apply(text, {
        ...listRoutes,
        'POST /v3/content/widget-templates': { body: widgets.template_created },
        'POST /v3/content/widgets': { body: widgets.widget_created },
        'POST /v3/content/placements': { body: widgets.placement_created },
        [`GET /v3/content/widget-templates/${TEMPLATE}`]: { body: widgets.template_created },
        [`GET /v3/content/widgets/${WIDGET}`]: { body: widgets.widget_created },
        [`GET /v3/content/placements/${NEW_PLACEMENT}`]: { body: widgets.placement_created },
    });
    assert.equal((await run).outcome, 'applied');
    const posts = calls.filter(call => call.method === 'POST');
    assert.equal(posts[1].body.widget_template_uuid, TEMPLATE);
    assert.equal(posts[2].body.widget_uuid, WIDGET);
    const results = readLogRows(root).filter(row => row.row === 'result');
    assert.deepEqual(results.map(row => [row.object, row.id, row.outcome]), [['widget-templates', TEMPLATE, 'ok'], ['widgets', WIDGET, 'ok'], ['placements', NEW_PLACEMENT, 'ok']]);
});

test('a response that names another channel stops the run and locks the helper; nothing after it is sent', async () => {
    const { text } = await makePlan([template, widget], listRoutes);
    const { run, calls, root } = await apply(text, {
        ...listRoutes,
        'POST /v3/content/widget-templates': { body: widgets.template_created_on_channel_1 },
    });
    const result = await run;
    assert.equal(result.outcome, 'locked');
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.outcome]), [['intent', undefined], ['result', 'stopped']]);
    assert.match(rows[1].message, /the response names channel 1, not 1895766/);
    assert.match(lockedProblem(root), /a write's response named another channel/);
});

const content = loadFixture('content.json');
const SCRIPT = '5c5c5c5c-1234-4abc-8def-0123456789ab';
const scriptCreate = {
    method: 'POST',
    path: '/v3/content/scripts',
    body: {
        channel_id: 1895766, name: 'rf-web-vitals', html: '<script>/* vitals */</script>', kind: 'script_tag', location: 'footer', visibility: 'storefront', consent_category: 'analytics', enabled: false,
    },
};
const scriptsList = 'GET /v3/content/scripts?channel_id:in=1895766&limit=250&page=1';

test('a script that answers enabled after its create stops the run and locks the helper', async () => {
    const { text } = await makePlan([scriptCreate], { [scriptsList]: { body: content.scripts_list } });
    const { run, root } = await apply(text, {
        [scriptsList]: { body: content.scripts_list },
        'POST /v3/content/scripts': { body: content.script_item_enabled },
        [`GET /v3/content/scripts/${SCRIPT}`]: { body: content.script_item_enabled },
    });
    const result = await run;
    assert.equal(result.outcome, 'locked');
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.outcome]), [['intent', undefined], ['result', 'stopped']]);
    assert.match(rows[1].message, /script 5c5c5c5c-1234-4abc-8def-0123456789ab is enabled on the store: scripts stay disabled until Shaun enables one/);
    assert.match(lockedProblem(root), /a script read back enabled after a write/);
});

test('a script update whose re-read shows it enabled stops the run and locks the helper', async () => {
    const update = { method: 'PUT', path: `/v3/content/scripts/${SCRIPT}`, body: { channel_id: 1895766, html: '<script>/* vitals 2 */</script>' } };
    const scriptGet = `GET /v3/content/scripts/${SCRIPT}`;
    const { text } = await makePlan([update], { [scriptGet]: { body: content.script_item_disabled } });
    const { run, root } = await apply(text, {
        [scriptGet]: [{ body: content.script_item_disabled }, { body: content.script_item_enabled }],
        [`PUT /v3/content/scripts/${SCRIPT}`]: { body: content.script_item_disabled },
    });
    assert.equal((await run).outcome, 'locked');
    assert.match(lockedProblem(root), /a script read back enabled after a write/);
    assert.equal(readLogRows(root).at(-1).outcome, 'stopped');
});

test('a disabled script create is applied, and reads back disabled', async () => {
    const { text } = await makePlan([scriptCreate], { [scriptsList]: { body: content.scripts_list } });
    const { run, root } = await apply(text, {
        [scriptsList]: { body: content.scripts_list },
        'POST /v3/content/scripts': { body: content.script_item_disabled },
        [`GET /v3/content/scripts/${SCRIPT}`]: { body: content.script_item_disabled },
    });
    assert.equal((await run).outcome, 'applied');
    assert.equal(lockedProblem(root), null);
});

test('a create that answers without an id stops the run before a request that refers to it is sent', async () => {
    const { text } = await makePlan([template, widget], listRoutes);
    const noId = structuredClone(widgets.template_created);
    delete noId.data.uuid;
    const { run, calls, root } = await apply(text, { ...listRoutes, 'POST /v3/content/widget-templates': { body: noId } });
    const result = await run;
    assert.equal(result.outcome, 'failed');
    assert.match(result.message, /widget_template_uuid refers to request 1, which created nothing/);
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    assert.deepEqual(readLogRows(root).map(row => [row.row, row.object]), [['intent', 'widget-templates'], ['result', 'widget-templates']]);
});

test('a write the store refuses stops the run with a failed row; nothing after it is sent, and nothing is locked', async () => {
    const { text } = await makePlan([template, widget], listRoutes);
    const { run, calls, root } = await apply(text, {
        ...listRoutes,
        'POST /v3/content/widget-templates': { status: 422, body: { status: 422, title: 'Template is invalid', errors: { template: 'unclosed tag' } } },
    });
    const result = await run;
    assert.equal(result.outcome, 'failed');
    assert.equal(calls.filter(call => call.method === 'POST').length, 1);
    const [, row] = readLogRows(root);
    assert.deepEqual([row.outcome, row.status, row.message], ['failed', 422, '422: Template is invalid (template: unclosed tag)']);
    assert.equal(lockedProblem(root), null);
});

test('the calendar is read again at apply: a plan made before T-14 for a new widget is refused from T-14', async () => {
    const { text } = await makePlan([template], listRoutes);
    const { run, calls } = await apply(text, listRoutes, { phase: freeze });
    await assert.rejects(run, /from T-14 widgets may only be unpublished/);
    assert.deepEqual(calls, []);
    const { text: off } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const allowed = await apply(off, {
        [placementGet]: [{ body: widgets.placement_item }, { body: widgets.placement_item_inactive }],
        [placementPut]: { body: widgets.placement_item_inactive },
    }, { phase: freeze });
    assert.equal((await allowed.run).outcome, 'applied');
});

// --- Approved mode: Shaun's store-wide writes ------------------------------------------------

const storeWide = { method: 'PUT', path: '/v3/settings/inventory', body: { option_out_of_stock_behavior: 'label_option' } };
const stockStoreWide = { method: 'PUT', path: '/v3/settings/inventory', body: { update_stock_behavior: 'order_completed' } };

test('a plain apply refuses an approved plan, and --approved refuses a lifted one', async () => {
    const { text: approvedText } = await makePlan([storeWide], inventoryRoutes(), { mode: 'approved' });
    await assert.rejects((await apply(approvedText, {})).run, /an approved plan: only Shaun applies it, with apply\.mjs --approved at his own terminal/);
    const { text: liftedText } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    await assert.rejects((await apply(liftedText, {}, { approved: true })).run, /--approved applies an approved plan \(plan\.mjs --approved\) only/);
});

test('an approved write keeps the snapshot, the log and the re-reads, and reports part 3 without enforcing it', async () => {
    const { text } = await makePlan([storeWide], inventoryRoutes(), { mode: 'approved' });
    const changed = structuredClone(inventory.global);
    changed.data.option_out_of_stock_behavior = 'label_option';
    const {
        run, calls, lines, root,
    } = await apply(text, inventoryRoutes({
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: changed }],
        'PUT /v3/settings/inventory': { body: changed },
    }), { approved: true });
    const result = await run;
    assert.equal(result.outcome, 'applied');
    assert.deepEqual(calls.filter(call => call.method === 'PUT').map(call => call.path), ['/v3/settings/inventory']);
    assert.ok(lines.some(line => /part 3 \(reported, not enforced\): global changed \(option_out_of_stock_behavior\)/.test(line)), lines.join('\n'));
    assert.equal(lockedProblem(root), null);
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.channel, row.mode]), [['intent', 'store-wide', 'approved'], ['result', 'store-wide', 'approved']]);
    assert.ok(fs.existsSync(path.join(root, 'store-wide', 'settings-inventory')));
    assert.ok(SMOKE_TESTS.some(line => /reelflies\.com/.test(line)));
    assert.ok(SMOKE_TESTS.some(line => /channel 1/.test(line)));
});

test('an approved write whose part-3 report can\'t be read still gets its result row, and stops', async () => {
    const { text } = await makePlan([storeWide], inventoryRoutes(), { mode: 'approved' });
    const changed = structuredClone(inventory.global);
    changed.data.option_out_of_stock_behavior = 'label_option';
    const { run, root } = await apply(text, inventoryRoutes({
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: changed }],
        'GET /v3/settings/inventory?channel_id=1855224': [{ body: inventory.channel_1855224 }, down],
        'PUT /v3/settings/inventory': { body: changed },
    }), { approved: true });
    const result = await run;
    assert.equal(result.outcome, 'failed');
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.outcome, row.status ?? null]), [['intent', undefined, null], ['result', 'stopped', 200]]);
    assert.match(rows[1].message, /the write answered 200, but part 3's report couldn't be read: 1855224 couldn't be read/);
    assert.equal(lockedProblem(root), null, 'approved mode reports part 3, and never locks on it');
});

function terminal(isTTY = true) {
    const input = new PassThrough();
    const output = new PassThrough();
    input.isTTY = isTTY;
    output.isTTY = isTTY;
    let shown = '';
    output.on('data', chunk => { shown += chunk; });
    return { input, output, shown: () => shown };
}

test('approved mode needs a terminal: without one each prompt refuses before asking anything', async () => {
    const io = terminal(false);
    await assert.rejects(askApprovedToken(io), /apply --approved runs only at Shaun's terminal/);
    await assert.rejects(confirmPlanSha({ ...io, planSha: 'ab12cd34'.padEnd(64, '0') }), /apply --approved runs only at Shaun's terminal/);
    assert.equal(io.shown(), '');
});

test('approved mode asks for a token it never shows or keeps', async () => {
    const io = terminal();
    const asked = askApprovedToken(io);
    io.input.write(`${FAKE_TOKEN}\n`);
    assert.equal(await asked, FAKE_TOKEN);
    assert.match(io.shown(), /hidden/);
    assert.ok(!io.shown().includes(FAKE_TOKEN), 'the token is never echoed');

    const empty = terminal();
    const none = askApprovedToken(empty);
    empty.input.write('\n');
    await assert.rejects(none, /no token given: stopped/);

    const closed = terminal();
    const ended = askApprovedToken(closed);
    closed.input.end();
    await assert.rejects(ended, /no answer \(stdin closed\): stopped/);
});

test('the go-ahead is the plan sha256\'s first 8 characters, and a wrong answer isn\'t repeated back', async () => {
    const planSha = 'ab12cd34'.padEnd(64, '0');
    const io = terminal();
    const asked = confirmPlanSha({ ...io, planSha });
    io.input.write('AB12CD34\n');
    await asked;
    assert.match(io.shown(), /type the first 8 characters of the plan's sha256/);

    const wrong = terminal();
    const refused = confirmPlanSha({ ...wrong, planSha });
    wrong.input.write(`${FAKE_TOKEN}\n`);
    await assert.rejects(refused, error => {
        assert.match(error.message, /^what was typed isn't the start of this plan's sha256: stopped$/);
        assert.ok(!error.message.includes(FAKE_TOKEN), 'a token pasted at the wrong prompt is never printed again');
        return true;
    });

    const closed = terminal();
    const ended = confirmPlanSha({ ...closed, planSha });
    closed.input.end();
    await assert.rejects(ended, /no answer \(stdin closed\): stopped/);
});

test('approved mode applies nothing without a go-ahead', async () => {
    const { text } = await makePlan([stockStoreWide], inventoryRoutes(), { mode: 'approved' });
    const { run, calls } = await apply(text, inventoryRoutes(), { approved: true, confirm: null });
    await assert.rejects(run, /approved mode applies nothing without Shaun's go-ahead/);
    assert.ok(calls.every(call => call.method === 'GET'));
});

test('readPlan checks the format and the digest', async () => {
    const { plan, text } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    assert.deepEqual(readPlan(text), plan);
});

// --- The commands, end to end on fixture routes ---------------------------------------------

function cli(script, args, { root, routes, extraEnv = {} } = {}) {
    const routesFile = path.join(root, 'routes.json');
    if (routes) {
        fs.mkdirSync(root, { recursive: true });
        fs.writeFileSync(routesFile, JSON.stringify(routes));
    }
    const env = {
        ...process.env,
        RF_STORE_ROOT: root,
        RF_LOCK_ROOT: path.join(root, 'locks'),
        RF_BC_READ_TOKEN: FAKE_TOKEN,
        RF_BC_WRITE_TOKEN: FAKE_TOKEN,
        RF_BC_STORE_HASH: STORE_HASH,
        RF_OPERATOR: 'test operator',
        ...(routes ? { RF_STORE_FIXTURES: routesFile } : {}),
        ...extraEnv,
    };
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', env, stdio: ['pipe', 'pipe', 'pipe'] });
    return { ...result, output: `${result.stdout}\n${result.stderr}` };
}

test('apply --approved without a terminal stops first, naming why, whatever else is wrong', () => {
    const root = newRoot();
    const result = cli(APPLY, ['--approved', path.join(root, 'no-such-plan.json')], { root });
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /apply --approved runs only at Shaun's terminal/);
    assert.doesNotMatch(result.output, /no-such-plan/);
});

// apply.mjs runs only store tooling identical to origin/master's, so the commands that get as
// far as the writer token run from a scratch clone whose origin is a local bare repo.
const checkout = storeCheckout(path.join(tmp, 'checkout'));
const CHECKOUT_PLAN = path.join(checkout, 'scripts/store/plan.mjs');
const CHECKOUT_APPLY = path.join(checkout, 'scripts/store/apply.mjs');

test('plan.mjs then apply.mjs, on fixture routes: the plan file, the writes, the log', () => {
    const root = newRoot();
    const changes = path.join(root, 'changes.json');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(changes, JSON.stringify({ requests: [unpublish] }));
    const routes = {
        [placementGet]: [{ body: widgets.placement_item }, { body: widgets.placement_item }, { body: widgets.placement_item_inactive }],
        [placementPut]: { body: widgets.placement_item_inactive },
    };
    const planned = cli(CHECKOUT_PLAN, ['--ticket', '46', '--changes', changes, '--out', path.join(root, 'plan.json')], { root, routes });
    assert.equal(planned.status, 0, planned.output);
    assert.match(planned.stdout, /status: "active" -> "inactive"/);
    assert.match(planned.stdout, /sha256 {3}[0-9a-f]{64}/);
    assert.match(planned.stdout, /Next: review the diff, then node scripts\/store\/apply\.mjs/);
    assert.ok(!planned.output.includes(FAKE_TOKEN));
    // The routes file is read afresh by each command, so apply's snapshot sees the first answer again.
    fs.writeFileSync(path.join(root, 'routes.json'), JSON.stringify({
        [placementGet]: [{ body: widgets.placement_item }, { body: widgets.placement_item_inactive }],
        [placementPut]: { body: widgets.placement_item_inactive },
    }));
    const applied = cli(CHECKOUT_APPLY, [path.join(root, 'plan.json')], { root, routes: undefined, extraEnv: { RF_STORE_FIXTURES: path.join(root, 'routes.json') } });
    assert.equal(applied.status, 0, applied.output);
    assert.match(applied.stdout, /applied: 1 request/);
    const sent = fs.readFileSync(path.join(root, 'fixture-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(sent.map(call => call.method), ['GET', 'GET', 'PUT', 'GET']);
    assert.ok(sent.every(call => call.token === 'set'));
    assert.deepEqual(readLogRows(root).map(row => [row.row, row.operator]), [['intent', 'test operator'], ['result', 'test operator']]);
    assert.ok(!applied.output.includes(FAKE_TOKEN));
});

test('apply.mjs --dry-run runs every check with the writer token, shows the derived diff, and sends and logs nothing', () => {
    const root = newRoot();
    fs.mkdirSync(root, { recursive: true });
    const changes = path.join(root, 'changes.json');
    fs.writeFileSync(changes, JSON.stringify([unpublish]));
    const planned = cli(CHECKOUT_PLAN, ['--ticket', '46', '--changes', changes, '--out', path.join(root, 'plan.json')], { root, routes: { [placementGet]: { body: widgets.placement_item } } });
    assert.equal(planned.status, 0, planned.output);
    fs.rmSync(path.join(root, 'fixture-calls.jsonl'));
    const dry = cli(CHECKOUT_APPLY, ['--dry-run', path.join(root, 'plan.json')], { root, routes: { [placementGet]: { body: widgets.placement_item } } });
    assert.equal(dry.status, 0, dry.output);
    assert.match(dry.stdout, /diff, from a fresh read of the store/);
    assert.match(dry.stdout, /status: "active" -> "inactive"/);
    assert.match(dry.stdout, /dry run: 1 request checked against a fresh read of the store; nothing was sent or logged/);
    const sent = fs.readFileSync(path.join(root, 'fixture-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(sent.map(call => call.method), ['GET']);
    assert.deepEqual(readLogRows(root), []);
    assert.ok(!fs.existsSync(path.join(root, '1895766', 'placements')) || fs.readdirSync(path.join(root, '1895766', 'placements')).every(file => file.endsWith('-plan.json')), 'no before or after snapshot');
    assert.ok(!dry.output.includes(FAKE_TOKEN));
});

test('apply.mjs refuses to write from a checkout whose store tooling isn\'t origin/master\'s, before the writer token is read', async () => {
    const root = newRoot();
    fs.mkdirSync(root, { recursive: true });
    const { text } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    fs.writeFileSync(path.join(root, 'plan.json'), text);
    const edited = storeCheckout(path.join(tmp, 'checkout-edited'));
    fs.appendFileSync(path.join(edited, 'scripts/store/allowlist.mjs'), '\n// widened on a branch\n');
    const result = cli(path.join(edited, 'scripts/store/apply.mjs'), [path.join(root, 'plan.json')], {
        root, routes: { [placementGet]: { body: widgets.placement_item } },
    });
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /REFUSED +this checkout's store tooling differs from origin\/master's \(scripts\/store\/allowlist\.mjs\)/);
    assert.ok(!fs.existsSync(path.join(root, 'fixture-calls.jsonl')), 'nothing was read or written');
    assert.deepEqual(readLogRows(root), []);
});

test('one apply at a time: a held store-write lock refuses a second apply, naming its holder, before anything is read', () => {
    const root = newRoot();
    const held = acquireLock('store-write', 'scripts/store/apply.mjs other-plan.json', { root: path.join(root, 'locks'), ticket: '46' });
    try {
        const result = cli(APPLY, [path.join(root, 'no-such-plan.json')], { root });
        assert.equal(result.status, 1, result.output);
        assert.match(result.stderr, /REFUSED +the store-write lock is held by scripts\/store\/apply\.mjs other-plan\.json \(ticket 46\), pid \d+ on .*It isn't stale/);
        assert.doesNotMatch(result.output, /no-such-plan/);
    } finally {
        held.release();
    }
    // Its stale limit is the locks' default, as the registers say (scripts/lib/lock.mjs, the QA README).
    assert.equal(limitMinutes('store-write'), 45);
});

test('apply.mjs refuses while LOCKED exists, and plan.mjs warns of it', () => {
    const root = newRoot();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'LOCKED'), JSON.stringify({ reason: 'part 3 of ticket 21\'s test failed for settings/inventory' }));
    const result = cli(APPLY, [path.join(root, 'plan.json')], { root });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /LOCKED exists: every apply refuses until Shaun removes it \(part 3 of ticket 21's test failed/);
});

test('the test seams are refused outside node --test', () => {
    const root = newRoot();
    const result = cli(APPLY, [path.join(root, 'plan.json')], { root, extraEnv: { NODE_TEST_CONTEXT: '' } });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /RF_STORE_ROOT is a test seam/);
});

test('a plan whose mode was forged is refused, and the log channel never comes from the file', async () => {
    const { plan } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const forged = { ...structuredClone(plan), mode: 'admin' };
    forged.digest = planDigest(forged);
    await assert.rejects((await apply(`${JSON.stringify(forged, null, 2)}\n`, {})).run, /the plan's mode "admin" is neither lifted nor approved/);
    const elsewhere = { ...structuredClone(plan), channel: 1 };
    elsewhere.digest = planDigest(elsewhere);
    const { run, root } = await apply(`${JSON.stringify(elsewhere, null, 2)}\n`, {
        [placementGet]: [{ body: widgets.placement_item }, { body: widgets.placement_item_inactive }],
        [placementPut]: { body: widgets.placement_item_inactive },
    });
    assert.equal((await run).outcome, 'applied');
    assert.ok(readLogRows(root).every(row => row.channel === 1895766));
    assert.ok(!fs.existsSync(path.join(root, '1')));
});

// --- What the approver reads is derived again from a fresh read, never taken from the file --------

test('a plan whose diff was forged is refused before any write, even with its digest remade', async () => {
    const { plan } = await makePlan([stockStoreWide], inventoryRoutes(), { mode: 'approved' });
    const forged = { ...structuredClone(plan), diff: [plan.diff[0], '     (no change)'] };
    forged.digest = planDigest(forged);
    const { run, calls, root } = await apply(`${JSON.stringify(forged, null, 2)}\n`, inventoryRoutes(), { approved: true });
    await assert.rejects(run, error => {
        assert.equal(error.name, 'Refused');
        assert.match(error.message, /the plan's diff isn't what a fresh read of the store gives: it was edited after plan\.mjs made it\. Plan again/);
        return true;
    });
    assert.ok(calls.every(call => call.method === 'GET'), 'nothing is written');
    assert.deepEqual(readLogRows(root), []);

    // The same for a lifted plan, with a line dropped from its diff.
    const { plan: lifted } = await makePlan([unpublish], { [placementGet]: { body: widgets.placement_item } });
    const shortened = { ...structuredClone(lifted), diff: lifted.diff.slice(0, 1) };
    shortened.digest = planDigest(shortened);
    const second = await apply(`${JSON.stringify(shortened, null, 2)}\n`, { [placementGet]: { body: widgets.placement_item } });
    await assert.rejects(second.run, /the plan's diff isn't what a fresh read of the store gives/);
    assert.ok(second.calls.every(call => call.method === 'GET'));
});

test('a plan whose writes, proofs or ticket were forged is refused before any write', async () => {
    const { plan } = await makePlan([labelOption], inventoryRoutes());
    const writes = { ...structuredClone(plan), writes: [{ ...plan.writes[0], object: 'settings/storefront/seo' }] };
    writes.digest = planDigest(writes);
    const first = await apply(`${JSON.stringify(writes, null, 2)}\n`, inventoryRoutes());
    await assert.rejects(first.run, /the plan's list of writes isn't what its requests make: it was edited after plan\.mjs made it/);
    assert.ok(first.calls.every(call => call.method === 'GET'));

    const proofs = structuredClone(plan);
    proofs.proofs[0].part2[0].evidence = 'proved by a forger';
    proofs.digest = planDigest(proofs);
    const second = await apply(`${JSON.stringify(proofs, null, 2)}\n`, inventoryRoutes());
    await assert.rejects(second.run, /the plan's proofs aren't what a fresh read of the store proves/);
    assert.ok(second.calls.every(call => call.method === 'GET'));

    const ticket = { ...structuredClone(plan), ticket: '46 | 2026-10-06 | 1 |' };
    ticket.digest = planDigest(ticket);
    const third = await apply(`${JSON.stringify(ticket, null, 2)}\n`, inventoryRoutes());
    await assert.rejects(third.run, /the plan's ticket "46 \| 2026-10-06 \| 1 \|" isn't a ticket name/);
    assert.deepEqual(third.calls, []);
});

test('apply shows the diff it derived from its fresh read, then asks for the go-ahead, then writes', async () => {
    const { plan, text } = await makePlan([stockStoreWide], inventoryRoutes(), { mode: 'approved' });
    const changed = structuredClone(inventory.global);
    changed.data.update_stock_behavior = 'order_completed';
    const events = [];
    const routes = inventoryRoutes({
        'GET /v3/settings/inventory': [{ body: inventory.global }, { body: changed }],
        'PUT /v3/settings/inventory': () => {
            events.push('PUT');
            return { body: changed };
        },
    });
    const {
        run, lines,
    } = await apply(text, routes, {
        approved: true,
        confirm: async ({ planSha, diff, requests }) => {
            events.push('confirm');
            assert.equal(planSha, sha256(text));
            assert.deepEqual(diff, plan.diff);
            assert.deepEqual(requests, plan.requests);
            assert.ok(lines.some(line => line.includes('update_stock_behavior: global "order_placed" -> "order_completed"')), lines.join('\n'));
        },
    });
    assert.equal((await run).outcome, 'applied');
    assert.deepEqual(events, ['confirm', 'PUT']);
    const fresh = lines.findIndex(line => /^diff, from a fresh read/.test(line));
    assert.ok(fresh >= 0, lines.join('\n'));
    assert.deepEqual(lines.slice(fresh + 1, fresh + 1 + plan.diff.length), plan.diff);
});

test('a go-ahead that is refused stops apply before anything is written or logged', async () => {
    const { text } = await makePlan([stockStoreWide], inventoryRoutes(), { mode: 'approved' });
    const { run, calls, root } = await apply(text, inventoryRoutes(), {
        approved: true,
        confirm: async () => { throw new Refused('what was typed isn\'t the start of this plan\'s sha256: stopped'); },
    });
    await assert.rejects(run, /isn't the start of this plan's sha256: stopped/);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.deepEqual(readLogRows(root), []);
});
