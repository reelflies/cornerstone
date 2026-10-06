// Tests scripts/store/snapshot.mjs (W0-11): which GETs make a write's snapshot, how they are
// taken and checked, and where they are kept.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify } from './allowlist.mjs';
import { createClient } from './client.mjs';
import {
    canonicalJson, readsFor, sha256, storeRoot, takeSnapshot, timeStamp, writeSnapshotFiles,
} from './snapshot.mjs';
import {
    FAKE_TOKEN, STORE_HASH, fixtureFetch, loadFixture,
} from './fixtures/store.mjs';

const widgets = loadFixture('widgets.json');
const inventory = loadFixture('settings-inventory.json');
const UUID = 'e1e1e1e1-1234-4abc-8def-0123456789ab';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-store-snapshot-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const item = (request, mode = 'lifted') => ({ request, what: classify(request, { mode }) });
const client = routes => createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes) });

test('snapshots live outside git, in ~/reelflies/store-snapshots; RF_STORE_ROOT moves them only under node --test', () => {
    assert.equal(storeRoot({}), path.join(os.homedir(), 'reelflies', 'store-snapshots'));
    assert.equal(storeRoot({ RF_STORE_ROOT: '/tmp/x', NODE_TEST_CONTEXT: 'child-v8' }), '/tmp/x');
    assert.throws(() => storeRoot({ RF_STORE_ROOT: '/tmp/x' }), /RF_STORE_ROOT is a test seam for node --test/);
});

test('canonical JSON sorts object keys at every depth, so the sha256 doesn\'t depend on key order', () => {
    assert.equal(canonicalJson({ b: 1, a: [{ d: 1, c: 2 }] }), '{"a":[{"c":2,"d":1}],"b":1}');
    assert.equal(sha256(canonicalJson({ a: 1, b: 2 })), sha256(canonicalJson({ b: 2, a: 1 })));
    assert.match(sha256('x'), /^[0-9a-f]{64}$/);
});

test('a create reads the channel\'s list; an update reads its item; repeated reads are taken once', () => {
    const reads = readsFor([
        item({ method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766 } }),
        item({ method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766, name: 'second' } }),
        item({ method: 'PUT', path: `/v3/content/placements/${UUID}`, body: { channel_id: 1895766, status: 'inactive' } }),
        item({ method: 'POST', path: '/v3/content/pages', body: { channel_id: 1895766 } }),
        item({
            method: 'PUT',
            path: '/v3/storefront/custom-template-associations',
            body: [{
                channel_id: 1895766, entity_type: 'page', entity_id: 1, file_name: 'x.html',
            }],
        }),
    ], 'lifted');
    assert.deepEqual(reads.map(read => [read.key, read.object, read.check, read.paginate]), [
        ['GET /v3/content/widget-templates?channel_id:in=1895766', 'widget-templates', 'channel', true],
        [`GET /v3/content/placements/${UUID}`, 'placements', 'item', false],
        ['GET /v3/content/pages?channel_id=1895766', 'pages', 'channel', true],
        ['GET /v3/storefront/custom-template-associations?channel_id=1895766', 'custom-template-associations', 'channel', true],
    ]);
    assert.equal(reads[3].token, 'write');
});

test('a lifted settings write reads the channel, the global value, and channels 1 and 1855224', () => {
    const reads = readsFor([item({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: { option_out_of_stock_behavior: 'label_option' },
    })], 'lifted');
    assert.deepEqual(reads.map(read => [read.key, read.scope, read.check]), [
        ['GET /v3/settings/inventory?channel_id=1895766', '1895766', 'channel'],
        ['GET /v3/settings/inventory', 'global', 'none'],
        ['GET /v3/settings/inventory?channel_id=1', '1', 'none'],
        ['GET /v3/settings/inventory?channel_id=1855224', '1855224', 'none'],
    ]);
});

test('an approved write reads the global value, the three channels, or the promotion', () => {
    const settings = readsFor([item({ method: 'PUT', path: '/v3/settings/inventory', body: { option_out_of_stock_behavior: 'label_option' } }, 'approved')], 'approved');
    assert.deepEqual(settings.map(read => read.scope), ['global', '1', '1855224', '1895766']);
    const filters = readsFor([item({ method: 'PUT', path: '/v3/settings/search/filters', body: [{ display_name: 'Fly Sizes' }] }, 'approved')], 'approved');
    assert.deepEqual(filters.map(read => read.scope), ['global']);
    const promotion = readsFor([item({ method: 'PUT', path: '/v3/promotions/12', body: { status: 'DISABLED' } }, 'approved')], 'approved');
    assert.deepEqual(promotion.map(read => [read.key, read.check]), [['GET /v3/promotions/12', 'none']]);
});

test('a snapshot follows every page of a list and hashes what it read', async () => {
    const reads = readsFor([item({ method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766 } })], 'lifted');
    const snapshot = await takeSnapshot(client({
        'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=1': { body: widgets.templates_list_page_1_of_2 },
        'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=2': { body: widgets.templates_list_page_2_of_2 },
    }), reads);
    assert.deepEqual(snapshot.reads[0].data.map(template => template.name), ['rf-one', 'rf-two']);
    assert.equal(snapshot.sha256, sha256(canonicalJson(snapshot.reads)));
    assert.match(snapshot.reads[0].sha256, /^[0-9a-f]{64}$/);
});

test('a read that names another channel stops the snapshot, and so the plan', async () => {
    const reads = readsFor([item({ method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766 } })], 'lifted');
    await assert.rejects(takeSnapshot(client({
        'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=1': { body: widgets.templates_list_with_channel_1 },
    }), reads), /GET \/v3\/content\/widget-templates\?channel_id:in=1895766: the response names channel 1, not 1895766/);
    const update = readsFor([item({ method: 'PUT', path: `/v3/content/placements/${UUID}`, body: { channel_id: 1895766, status: 'inactive' } })], 'lifted');
    await assert.rejects(takeSnapshot(client({ [`GET /v3/content/placements/${UUID}`]: { body: widgets.placement_item_on_channel_1 } }), update), /names channel 1/);
});

test('a read that fails stops the snapshot with its status', async () => {
    const update = readsFor([item({ method: 'PUT', path: `/v3/content/placements/${UUID}`, body: { channel_id: 1895766, status: 'inactive' } })], 'lifted');
    await assert.rejects(takeSnapshot(client({ [`GET /v3/content/placements/${UUID}`]: { status: 404, body: { title: 'Not found' } } }), update), /GET \/v3\/content\/placements\/e1e1.* answered 404: Not found/);
});

test('settings reads of other channels are kept, not channel-checked', async () => {
    const reads = readsFor([item({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: { option_out_of_stock_behavior: 'label_option' },
    })], 'lifted');
    const snapshot = await takeSnapshot(client({
        'GET /v3/settings/inventory?channel_id=1895766': { body: inventory.channel_1895766 },
        'GET /v3/settings/inventory': { body: inventory.global },
        'GET /v3/settings/inventory?channel_id=1': { body: inventory.channel_1 },
        'GET /v3/settings/inventory?channel_id=1855224': { body: inventory.channel_1855224 },
    }), reads);
    assert.deepEqual(snapshot.reads.map(read => read.scope), ['1895766', 'global', '1', '1855224']);
    assert.equal(snapshot.reads[3].data.out_of_stock_message, 'Out of stock');
});

test('snapshot files go to <root>/<channel>/<object>/<time>.json, one per object', () => {
    assert.equal(timeStamp(new Date('2026-10-06T19:15:44.123Z')), '2026-10-06T19-15-44.123Z');
    const snapshot = {
        sha256: 'f'.repeat(64),
        reads: [
            {
                key: 'GET /v3/settings/inventory?channel_id=1895766', object: 'settings/inventory', scope: '1895766', data: { a: 1 }, sha256: 'a'.repeat(64),
            },
            {
                key: 'GET /v3/content/pages?channel_id=1895766', object: 'pages', scope: 'channel', data: [], sha256: 'b'.repeat(64),
            },
        ],
    };
    const files = writeSnapshotFiles(tmp, { channel: 1895766, label: 'before', now: new Date('2026-10-06T19:15:44.123Z') }, snapshot);
    assert.deepEqual(files.map(file => path.relative(tmp, file.file)), [
        path.join('1895766', 'settings-inventory', '2026-10-06T19-15-44.123Z-before.json'),
        path.join('1895766', 'pages', '2026-10-06T19-15-44.123Z-before.json'),
    ]);
    const written = JSON.parse(fs.readFileSync(files[0].file, 'utf8'));
    assert.equal(written.snapshot_sha256, 'f'.repeat(64));
    assert.deepEqual(written.reads.map(read => read.key), ['GET /v3/settings/inventory?channel_id=1895766']);
    assert.equal(fs.statSync(path.join(tmp, '1895766')).mode.toString(8).slice(-3), '700');
});
