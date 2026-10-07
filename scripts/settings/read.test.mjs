// Tests scripts/settings/read.mjs (ticket 21): the read-only reads at four scopes (global, channel
// 1, 1855224 and 1895766), what they prove about each setting (parts 1 and 2 of the three-part
// test), and the report the settings checklist quotes. No token and no network: the reads answer
// from fixtures/reads.json.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANNEL_SETTINGS, NEVER } from '../store/allowlist.mjs';
import { FAKE_TOKEN, STORE_HASH, fixtureFetch } from '../store/fixtures/store.mjs';
import {
    SCOPES, SCOPED_SETTINGS, markdownReport, parseArgs, readList, readOnlyClient, settingsRows, takeReads,
} from './read.mjs';

const READ = fileURLToPath(new URL('./read.mjs', import.meta.url));
const fixtures = JSON.parse(fs.readFileSync(new URL('./fixtures/reads.json', import.meta.url), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-settings-read-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const scopeQuery = scope => (scope === 'global' ? '' : `?channel_id=${scope}`);
const answer = value => (value && value.status ? { status: value.status, body: value.body } : { body: value });

// Every read readList() makes, answered from the fixtures.
function allRoutes() {
    const routes = {};
    for (const scope of ['global', '1', '1855224', '1895766']) {
        for (const settings of ['inventory', 'storefront/search', 'storefront/security']) {
            routes[`GET /v3/settings/${settings}${scopeQuery(scope)}`] = answer(fixtures[settings][scope]);
        }
        routes[`GET /v3/settings/storefront/product${scopeQuery(scope)}`] = answer(fixtures['storefront/product_ignores_channel']);
        routes[`GET /v3/settings/storefront/category${scopeQuery(scope)}`] = answer(scope === 'global' ? fixtures['storefront/category_empty_channel'].global : fixtures['storefront/category_empty_channel'].channel);
        routes[`GET /v3/settings/search/filters/contexts${scopeQuery(scope)}`] = answer(fixtures['search/filters/contexts'][scope] || { data: [], meta: {} });
        routes[`GET /v3/settings/search/filters/available${scopeQuery(scope)}`] = answer(fixtures['search/filters/available']);
    }
    routes['GET /v3/settings/search/filters'] = answer(fixtures['search/filters']);
    for (const channel of ['1', '1855224', '1895766']) {
        routes[`GET /v3/channels/${channel}/currency-assignments`] = answer(fixtures['currency-assignments'][channel]);
    }
    routes['GET /v3/promotions?limit=50&page=1'] = answer(fixtures.promotions.page1);
    routes['GET /v3/promotions?limit=50&page=2'] = answer(fixtures.promotions.page2);
    return routes;
}

// The tests read through the same client factory the command uses.
const client = (routes, calls = []) => readOnlyClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes, { calls }) });

test('the reads are the four scopes of every channel-scoped setting the checklist depends on, plus the store-wide lists', () => {
    assert.deepEqual(SCOPES.map(item => item.scope), ['global', '1', '1855224', '1895766']);
    assert.deepEqual(SCOPES.map(item => item.channel), [null, 1, 1855224, 1895766]);
    // Each scoped settings endpoint is one the store helper may write per channel, so its proof is
    // the one plan.mjs repeats before a write.
    for (const settings of SCOPED_SETTINGS) assert.ok(CHANNEL_SETTINGS[settings], `${settings} is a channel setting in allowlist.mjs`);
    const keys = readList().map(spec => spec.key);
    for (const settings of SCOPED_SETTINGS) {
        assert.deepEqual(keys.filter(key => key.startsWith(`GET /v3/settings/${settings}`) && !key.slice(`GET /v3/settings/${settings}`.length).startsWith('/')), [
            `GET /v3/settings/${settings}`,
            `GET /v3/settings/${settings}?channel_id=1`,
            `GET /v3/settings/${settings}?channel_id=1855224`,
            `GET /v3/settings/${settings}?channel_id=1895766`,
        ]);
    }
    assert.ok(keys.includes('GET /v3/settings/search/filters'));
    assert.ok(keys.includes('GET /v3/settings/search/filters/contexts?channel_id=1895766'));
    assert.ok(keys.includes('GET /v3/channels/1895766/currency-assignments'));
    assert.ok(keys.includes('GET /v3/promotions'));
    assert.equal(new Set(keys).size, keys.length, 'each read once');
});

test('no read touches Customers, Orders, the catalogue, gift certificates, carts or payments', () => {
    // The read-only account has no Customers or Orders scope anyway (W0-12); gift certificates and
    // the customer settings carry names and emails, so they are never read, even where a scope allows.
    const forbidden = [
        ...NEVER.filter(rule => !['promotions', 'themes and channels (activation, deletion, uploads, channel status)'].includes(rule.what)).flatMap(rule => rule.prefixes),
    ];
    for (const spec of readList()) {
        const lower = spec.path.toLowerCase();
        assert.ok(!forbidden.some(prefix => lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}_`)), `${spec.key} is never read`);
    }
});

test('reads are GETs on a read-only client; a failed read is recorded and the others still run', async () => {
    const calls = [];
    const routes = allRoutes();
    routes['GET /v3/settings/storefront/security?channel_id=1855224'] = { status: 403, body: { status: 403, title: 'You don\'t have a required scope to access the endpoint' } };
    const { reads, sha256 } = await takeReads(client(routes, calls), readList());
    assert.ok(calls.length >= readList().length);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.match(sha256, /^[0-9a-f]{64}$/);
    const failed = reads.find(read => read.key === 'GET /v3/settings/storefront/security?channel_id=1855224');
    assert.equal(failed.data, undefined);
    assert.match(failed.error, /^403: You don't have a required scope/);
    assert.equal(reads.find(read => read.key === 'GET /v3/settings/inventory?channel_id=1895766').data.option_out_of_stock_behavior, null);
    // Every page of a paginated list is read.
    const promotions = reads.find(read => read.key === 'GET /v3/promotions');
    assert.deepEqual(promotions.data.map(item => item.id), [11, 12]);
});

test('the command\'s own client is read-only: it refuses a PUT, a POST or a DELETE before sending it', async () => {
    const calls = [];
    const own = client({ 'GET /v3/settings/inventory': { body: { data: {}, meta: {} } } }, calls);
    for (const method of ['PUT', 'POST', 'DELETE']) {
        // eslint-disable-next-line no-await-in-loop
        await assert.rejects(own.request({ method, path: '/v3/settings/inventory', body: {} }), new RegExp(`read-only: ${method}`));
    }
    assert.deepEqual(calls, []);
    await own.get('/v3/settings/inventory');
    assert.deepEqual(calls.map(call => call.method), ['GET']);
});

test('a key that 1895766 shows as null or overridden passes parts 1 and 2: a lifted write once part 3 holds', async () => {
    const { reads } = await takeReads(client(allRoutes()), readList());
    const rows = settingsRows(reads, 'inventory');
    const label = rows.find(row => row.key === 'option_out_of_stock_behavior');
    assert.equal(label.verdict, 'channel');
    assert.deepEqual(label.values, {
        global: 'do_nothing', 1: null, 1855224: null, 1895766: null,
    });
    assert.match(label.evidence, /null: 1895766 inherits the global value "do_nothing"/);
    const message = rows.find(row => row.key === 'default_out_of_stock_message');
    assert.equal(message.values['1855224'], 'Out of stock');
});

test('a global-only key, an endpoint that ignores channel_id, and a key the channel read lacks are store-wide', async () => {
    const { reads } = await takeReads(client(allRoutes()), readList());
    const filtering = settingsRows(reads, 'storefront/search').find(row => row.key === 'product_filtering_enabled');
    assert.equal(filtering.verdict, 'store-wide');
    assert.match(filtering.evidence, /global-only/);
    for (const row of settingsRows(reads, 'storefront/product')) {
        assert.equal(row.verdict, 'store-wide');
        assert.match(row.evidence, /may ignore channel_id/);
    }
    for (const row of settingsRows(reads, 'storefront/category')) {
        assert.equal(row.verdict, 'store-wide');
        assert.match(row.evidence, /shows no override field/);
    }
});

test('a setting whose 1895766 read failed is unknown, never channel-scoped', async () => {
    const routes = allRoutes();
    routes['GET /v3/settings/inventory?channel_id=1895766'] = { status: 500, body: { title: 'Internal error' } };
    const { reads } = await takeReads(client(routes), readList());
    for (const row of settingsRows(reads, 'inventory')) {
        assert.equal(row.verdict, 'unknown');
        assert.match(row.evidence, /the 1895766 read failed: 500/);
    }
});

test('the report quotes every scope, the proof, the filters, the currencies and the promotions, and never a coupon code', async () => {
    const { reads, sha256 } = await takeReads(client(allRoutes()), readList());
    const text = markdownReport(reads, { taken: '2026-10-06T21:00:00.000Z', sha256, files: [{ file: '/x/store-wide/settings-inventory/t-read-21.json' }] }).join('\n');
    assert.match(text, /\| `option_out_of_stock_behavior` \| "do_nothing" \| inherits \| inherits \| inherits \| channel: /);
    assert.match(text, /\| `default_out_of_stock_message` \| "Sold Out" \| inherits \| "Out of stock" \| inherits \|/);
    assert.match(text, /\| `product_filtering_enabled` \| true \| inherits \| inherits \| inherits \| store-wide: BigCommerce documents product_filtering_enabled as global-only \|/);
    assert.match(text, /\| 2 \| Fly Sizes \| product \| `Rmx5IFNpemVz` \| true \| true \| "10" \| "alpha" \|/);
    assert.match(text, /\| 1895766 \| read failed: 422: Contextual filters are only supported on channel 1 \|/);
    assert.match(text, /\| 1895766 \| CAD \| CAD \|/);
    assert.match(text, /\| 11 \| Test free shipping \| DISABLED \| AUTOMATIC \| \* \| all channels \| shipping \(free\) \|/);
    assert.match(text, /\| 12 \| Spring coupon \| ENABLED \| COUPON \| CAD \| 1 \| cart_value \|/);
    assert.doesNotMatch(text, /SECRETCODE10/);
    assert.match(text, /sha256 [0-9a-f]{64}/);
});

test('the report\'s headings are the levels the checklist quotes it at: ### for the run, #### for each table', async () => {
    const { reads, sha256 } = await takeReads(client(allRoutes()), readList());
    const headings = markdownReport(reads, { taken: '2026-10-06T21:00:00.000Z', sha256 }).filter(line => line.startsWith('#'));
    assert.equal(headings[0], '### Reads, 2026-10-06T21:00:00.000Z (read-only token, GET only)');
    assert.ok(headings.length > 1);
    for (const heading of headings.slice(1)) assert.match(heading, /^#### \S/, heading);
});

test('the command takes no arguments but --help', () => {
    assert.deepEqual(parseArgs([]), {});
    assert.throws(() => parseArgs(['--write']), /unknown argument --write/);
    assert.throws(() => parseArgs(['--out', '/tmp/x']), /unknown argument --out/);
});

test('the command reads with the read-only token, keeps the snapshot outside git and prints the report without the token', () => {
    const root = path.join(tmp, 'store-root');
    const routesFile = path.join(tmp, 'routes.json');
    const routes = allRoutes();
    // A response that echoes the token must not print it.
    routes['GET /v3/settings/storefront/security'] = { body: { data: { ...fixtures['storefront/security'].global.data, csp_header: { enabled: true, header_value: `report-uri https://x/${FAKE_TOKEN}` } }, meta: {} } };
    fs.writeFileSync(routesFile, JSON.stringify(routes));
    const run = spawnSync(process.execPath, [READ], {
        encoding: 'utf8',
        env: {
            ...process.env, RF_STORE_ROOT: root, RF_STORE_FIXTURES: routesFile, RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: STORE_HASH, RF_BC_WRITE_TOKEN: '',
        },
    });
    assert.equal(run.status, 0, run.stderr);
    assert.ok(!run.stdout.includes(FAKE_TOKEN) && !run.stderr.includes(FAKE_TOKEN), 'the token is never printed');
    assert.match(run.stdout, /Reading with \$RF_BC_READ_TOKEN \(GET only\)/);
    assert.match(run.stdout, /\| `option_out_of_stock_behavior` \|/);
    const calls = fs.readFileSync(path.join(root, 'fixture-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.ok(calls.every(call => call.method === 'GET'));
    const snapshots = fs.readdirSync(path.join(root, 'store-wide', 'settings-inventory'));
    assert.equal(snapshots.length, 1);
    assert.match(snapshots[0], /-read-21\.json$/);
    const saved = JSON.parse(fs.readFileSync(path.join(root, 'store-wide', 'settings-inventory', snapshots[0]), 'utf8'));
    assert.deepEqual(saved.reads.map(read => read.scope), ['global', '1', '1855224', '1895766']);
});

test('a run where every read fails stops non-zero, naming the first failure, and writes no snapshot', () => {
    const root = path.join(tmp, 'store-root-401');
    const routesFile = path.join(tmp, 'routes-401.json');
    const refused = { status: 401, body: { status: 401, title: 'Unauthorized' } };
    fs.writeFileSync(routesFile, JSON.stringify(Object.fromEntries(Object.keys(allRoutes()).map(key => [key, refused]))));
    const run = spawnSync(process.execPath, [READ], {
        encoding: 'utf8',
        env: {
            ...process.env, RF_STORE_ROOT: root, RF_STORE_FIXTURES: routesFile, RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: STORE_HASH,
        },
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /STOP +every read failed, the first with 401: Unauthorized/);
    assert.ok(!fs.existsSync(path.join(root, 'store-wide')));
});

test('outside node --test the fixture routes and a moved store root are refused', () => {
    const run = spawnSync(process.execPath, [READ], {
        encoding: 'utf8',
        env: {
            PATH: process.env.PATH, HOME: process.env.HOME, RF_STORE_ROOT: path.join(tmp, 'nope'), RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: STORE_HASH,
        },
    });
    assert.equal(run.status, 1);
    assert.match(run.stderr, /RF_STORE_ROOT is a test seam for node --test/);
});
