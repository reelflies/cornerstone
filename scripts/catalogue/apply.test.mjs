// Tests scripts/catalogue/apply.mjs (ticket 18): the writes run only at a terminal, refuse a
// stale plan, send exactly the plan in batches with a log row before and after each request,
// and a restore puts back what the snapshot read. No network and no token: the store is the
// in-memory fake in fixtures/catalogue-store.mjs.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { phaseOn } from '../lib/release-calendar.mjs';
import { createClient } from '../store/client.mjs';
import { FAKE_TOKEN, STORE_HASH } from '../store/fixtures/store.mjs';
import { appendLogRow, logRow, readLogRows } from '../store/log.mjs';
import { sha256 } from '../store/snapshot.mjs';
import {
    PLAN_FORMAT, SNAPSHOT_FORMAT, checkRequests, planDigest,
} from './apply-rules.mjs';
import {
    BATCH, catalogueRoot, confirmSourceSha, fileInside, loadSource, parseArgs, prepareWrite, runWrites, send, tapped,
} from './apply.mjs';
import { fakeCatalogue } from './fixtures/catalogue-store.mjs';

const APPLY = fileURLToPath(new URL('./apply.mjs', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-catalogue-apply-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let count = 0;
const freshRoot = () => {
    const root = path.join(tmp, `run-${++count}`);
    fs.mkdirSync(path.join(root, 'plans'), { recursive: true });
    return root;
};

const value = (id, label, sortOrder, isDefault = false) => ({
    id, label, sort_order: sortOrder, is_default: isDefault,
});
const PRODUCTS = [
    {
        id: 101,
        name: 'Adams Dry Fly',
        brand_id: 411,
        categories: [10],
        options: [{
            id: 50, display_name: 'Fly Sizes', type: 'rectangles', option_values: [value(1, '12', 0, true), value(2, '2-0', 1)],
        }],
        images: [{
            id: 6, is_thumbnail: true, description: '', sort_order: 0,
        }, {
            id: 7, is_thumbnail: false, description: 'On white', sort_order: 1,
        }],
    },
    {
        id: 102, name: 'Clouser Minnow', brand_id: 0, categories: [434], options: [], images: [],
    },
];
const BRANDS = [{
    id: 411, name: 'ReelFlies', page_title: '', meta_description: '',
}];
const REQUESTS = [
    {
        method: 'PUT', path: '/v3/catalog/products/101/options/50', body: { option_values: [value(2, '2/0', 0), value(1, '12', 1, true)] }, before: { display_name: 'Fly Sizes', option_values: [value(1, '12', 0, true), value(2, '2-0', 1)] }, product_id: 101,
    },
    {
        method: 'PUT', path: '/v3/catalog/products/101/images/7', body: { is_thumbnail: true }, before: { description: 'On white', is_thumbnail: false, thumbnail_id: 6 }, product_id: 101,
    },
    {
        method: 'PUT', path: '/v3/catalog/products/102', body: { brand_id: 411 }, before: { brand_id: 0, categories: [434] }, product_id: 102,
    },
];

function writePlan(root, requests = REQUESTS, job = 'mixed') {
    const plan = {
        format: PLAN_FORMAT, ticket: '18', job, store_hash: STORE_HASH, made_at: '2026-10-06T12:00:00.000Z', requests, digest: null,
    };
    plan.digest = planDigest(plan);
    const file = path.join(root, 'plans', `2026-10-06T12-00-00-18-${job}.json`);
    fs.writeFileSync(file, `${JSON.stringify(plan, null, 2)}\n`);
    return file;
}

// runWrites on the fake store, with a confirm that records how many writes it saw before it answered.
async function run({
    root, store, items, mode = 'apply', job = 'mixed', confirm, product = null, sourceFile = 'plan.json', sourceSha = 'a'.repeat(64),
}) {
    const lines = [];
    const seen = { putsAtConfirm: null };
    const { fetch, tap } = tapped(store.fetch);
    const waits = [];
    const result = await runWrites({
        items,
        client: createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch }),
        tap,
        mode,
        job,
        sourceFile,
        sourceSha,
        storeHash: STORE_HASH,
        root,
        logRoot: root,
        operator: 'test',
        say: line => lines.push(line),
        product,
        wait: async ms => { waits.push(ms); },
        confirm: confirm || (async () => { seen.putsAtConfirm = store.calls.filter(call => call.method === 'PUT').length; }),
    });
    return {
        result, lines, seen, waits,
    };
}

test('the arguments: a plan, --restore or --check, and --product', () => {
    assert.deepEqual(parseArgs(['p.json']), { mode: 'apply', file: 'p.json', product: null });
    assert.deepEqual(parseArgs(['p.json', '--product', '101']), { mode: 'apply', file: 'p.json', product: 101 });
    assert.deepEqual(parseArgs(['--restore', 's.json']), { mode: 'restore', file: 's.json', product: null });
    assert.deepEqual(parseArgs(['--check', 'p.json']), { mode: 'check', file: 'p.json', product: null });
    assert.throws(() => parseArgs([]), /no plan file/);
    assert.throws(() => parseArgs(['--restore', 's.json', '--check', 'p.json']), /give one of/);
    assert.throws(() => parseArgs(['p.json', '--product', 'x']), /needs a product id/);
    assert.throws(() => parseArgs(['p.json', '--yes']), /unknown option --yes/);
});

test('RF_CATALOGUE_ROOT is a test seam only', () => {
    assert.equal(catalogueRoot({ RF_CATALOGUE_ROOT: '/x', NODE_TEST_CONTEXT: 'child' }), '/x');
    assert.throws(() => catalogueRoot({ RF_CATALOGUE_ROOT: '/x' }), /test seam/);
    assert.equal(catalogueRoot({}), path.join(os.homedir(), 'reelflies', 'catalog'));
});

test('a plan is read only from the plans folder, and a restore only from the snapshots folder', () => {
    const root = freshRoot();
    const outside = path.join(tmp, `stray-${count}.json`);
    fs.copyFileSync(writePlan(root), outside);
    assert.throws(() => fileInside(outside, path.join(root, 'plans'), 'a plan'), /a plan is read only from .*plans/);
    assert.throws(() => loadSource({
        mode: 'restore', file: writePlan(root), product: null, root, logRoot: root,
    }), /a snapshot is read only from/);
});

test('without a terminal the command refuses before it reads or asks anything', () => {
    const root = freshRoot();
    const plan = writePlan(root);
    const { status, stderr } = spawnSync(process.execPath, [APPLY, plan], {
        encoding: 'utf8', env: { ...process.env, RF_CATALOGUE_ROOT: root, RF_STORE_ROOT: root }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    assert.equal(status, 1);
    assert.match(stderr, /^REFUSED {2}catalogue writes run only at Shaun's terminal/);
    assert.ok(!fs.existsSync(path.join(root, 'snapshots')), 'nothing was written');
    assert.ok(!fs.existsSync(path.join(root, 'log.jsonl')));
    const restore = spawnSync(process.execPath, [APPLY, '--restore', plan], { encoding: 'utf8', env: { ...process.env, RF_CATALOGUE_ROOT: root, RF_STORE_ROOT: root } });
    assert.match(restore.stderr, /only at Shaun's terminal/);
});

test('--check reads with GETs only and says which requests are written, pending or stale', () => {
    const root = freshRoot();
    const plan = writePlan(root, [REQUESTS[2]], 'brand');
    const routes = path.join(root, 'routes.json');
    fs.writeFileSync(routes, JSON.stringify({
        'GET /v3/catalog/products?id:in=102&include=options%2Cimages&include_fields=name%2Cbrand_id%2Ccategories&limit=10': { body: { data: [PRODUCTS[1]], meta: { pagination: { total_pages: 1 } } } },
    }));
    const { status, stdout, stderr } = spawnSync(process.execPath, [APPLY, '--check', plan], {
        encoding: 'utf8',
        env: {
            ...process.env, RF_CATALOGUE_ROOT: root, RF_STORE_ROOT: root, RF_STORE_FIXTURES: routes, RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: STORE_HASH,
        },
    });
    assert.equal(stderr, '');
    assert.equal(status, 0);
    assert.match(stdout, /brand: 1 requests: 0 read as planned, 1 not written yet, 0 changed since the plan/);
    const calls = fs.readFileSync(path.join(root, 'fixture-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(calls.map(call => call.method), ['GET']);
    assert.ok(!stdout.includes(FAKE_TOKEN));
});

test('an apply sends exactly the plan after the go-ahead, logging before and after each request', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS });
    const { items } = loadSource({
        mode: 'apply', file: writePlan(root), product: null, root,
    });
    const { result, lines, seen } = await run({ root, store, items });
    assert.equal(seen.putsAtConfirm, 0, 'nothing is written before the go-ahead');
    assert.deepEqual(result.written, 3);
    assert.deepEqual(store.calls.filter(call => call.method === 'PUT').map(call => [call.path, call.body]), REQUESTS.map(request => [request.path, request.body]));
    assert.deepEqual(store.product(101).options[0].option_values.map(item => item.label), ['2/0', '12']);
    assert.deepEqual(store.product(101).images.map(image => image.is_thumbnail), [false, true]);
    assert.equal(store.product(102).brand_id, 411);
    assert.ok(lines.includes('  product 101 "Adams Dry Fly", option 50: order 12 #1, 2-0 #2 -> 2/0 #2, 12 #1; value 2 "2-0" -> "2/0"'));
    assert.ok(lines.some(line => /^To put it back: node scripts\/catalogue\/apply\.mjs --restore .*-18-mixed-before\.json$/.test(line)));
    assert.ok(lines.some(line => /Same-day smoke tests/.test(line)));
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.id, row.outcome]), [
        ['intent', 'option 101/50', undefined], ['intent', 'image 101/7', undefined], ['intent', 'product 102', undefined],
        ['result', 'option 101/50', 'ok'], ['result', 'image 101/7', 'ok'], ['result', 'product 102', 'ok'],
    ]);
    assert.ok(rows.every(row => row.channel === 'store-wide' && row.mode === 'approved' && row.ticket === '18' && row.action === 'update'));
    const snapshot = JSON.parse(fs.readFileSync(result.snapshot, 'utf8'));
    assert.deepEqual(snapshot.items.map(item => item.before), REQUESTS.map(request => request.before));
    assert.equal(snapshot.store_hash, STORE_HASH, 'the before-snapshot names the store, so a restore can check it');
});

test('a stale plan is refused whole, before the go-ahead, and nothing is written', async () => {
    const root = freshRoot();
    const edited = structuredClone(PRODUCTS);
    edited[1].brand_id = 361;
    const store = fakeCatalogue({ products: edited, brands: BRANDS });
    let asked = false;
    await assert.rejects(run({
        root, store, items: checkRequests(REQUESTS), confirm: async () => { asked = true; },
    }), error => error.name === 'Refused' && /1 of 3 objects changed since the dry run, so the plan is stale and nothing was written\.[\s\S]*product 102 changed since the plan was made/.test(error.message));
    assert.equal(asked, false);
    assert.deepEqual(store.calls.filter(call => call.method !== 'GET'), []);
    assert.ok(!fs.existsSync(path.join(root, 'snapshots')));
});

test('a wrong go-ahead stops before any write or snapshot', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS });
    await assert.rejects(run({
        root, store, items: checkRequests(REQUESTS), confirm: async () => { throw Object.assign(new Error('what was typed isn\'t the start'), { name: 'Refused' }); },
    }), /what was typed/);
    assert.deepEqual(store.calls.filter(call => call.method !== 'GET'), []);
    assert.ok(!fs.existsSync(path.join(root, 'snapshots')));
});

test('a rerun skips what already reads as planned', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS });
    await run({ root, store, items: checkRequests(REQUESTS) });
    const again = await run({ root, store, items: checkRequests(REQUESTS) });
    assert.equal(again.result.written, 0);
    assert.ok(again.lines.includes('3 of 3 requests already read as planned (an earlier run): skipped'));
    assert.ok(again.lines.includes('Nothing to write.'));
});

test('a 429 is waited out as long as the store says, then sent again', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'PUT /v3/catalog/products/102': [{ status: 429, body: { title: 'Too many requests' }, headers: { 'X-Rate-Limit-Time-Reset-Ms': '1500' } }] } });
    const { result, waits } = await run({ root, store, items: checkRequests([REQUESTS[2]]) });
    assert.equal(result.written, 1);
    assert.deepEqual(waits, [1500]);
    assert.equal(store.calls.filter(call => call.method === 'PUT').length, 2);
});

test('send gives up after five 429s', async () => {
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'PUT /v3/catalog/products/102': Array(6).fill({ status: 429, body: {} }) } });
    const { fetch, tap } = tapped(store.fetch);
    const client = createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch });
    const waits = [];
    const response = await send(client, tap, REQUESTS[2], { wait: async ms => { waits.push(ms); } });
    assert.equal(response.status, 429);
    assert.deepEqual(waits, [2000, 4000, 8000, 16000]);
});

test('a write that doesn\'t read back as planned is logged as failed, and the run stops after its batch', async () => {
    const root = freshRoot();
    const images = Array.from({ length: BATCH + 1 }, (unused, index) => ({
        id: 1000 + index, is_thumbnail: index === 0, description: '', sort_order: index,
    }));
    const product = {
        id: 201, name: 'Many Images', brand_id: 411, categories: [10], options: [], images,
    };
    const requests = images.map(image => ({
        method: 'PUT', path: `/v3/catalog/products/201/images/${image.id}`, body: { description: 'Many Images' }, before: { description: '', is_thumbnail: image.is_thumbnail, thumbnail_id: 1000 }, product_id: 201,
    }));
    const store = fakeCatalogue({ products: [product], brands: BRANDS }, { answers: { 'PUT /v3/catalog/products/201/images/1000': [{ status: 200, body: {} }] } });
    const { result, lines } = await run({ root, store, items: checkRequests(requests) });
    assert.equal(result.failed, 1);
    assert.equal(result.written, BATCH - 1);
    assert.equal(store.calls.filter(call => call.method === 'PUT').length, BATCH, 'the second batch is never sent');
    assert.ok(lines.some(line => /^FAILED {3}image 201\/1000: image 201\/1000 reads back .*not as planned/.test(line)));
    const failed = readLogRows(root).filter(row => row.outcome === 'failed');
    assert.deepEqual(failed.map(row => [row.id, row.status]), [['image 201/1000', 200]]);
});

test('nothing more is sent after an answer that isn\'t a success, and what was sent is read back and logged', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'PUT /v3/catalog/products/101/options/50': [{ status: 422, body: { title: 'Invalid option value' } }] } });
    const { result, lines } = await run({ root, store, items: checkRequests(REQUESTS) });
    assert.equal(store.calls.filter(call => call.method === 'PUT').length, 1);
    assert.equal(result.failed, 1);
    assert.match(result.halted, /option 101\/50 got 422: Invalid option value/);
    assert.ok(lines.some(line => /the run stopped at the first answer that wasn't a success/.test(line)));
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.id, row.outcome]), [['intent', 'option 101/50', undefined], ['result', 'option 101/50', 'failed']]);
});

test('if the re-read after a batch fails, each write sent is logged as stopped, never left without a result row', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'GET /v3/catalog/products': [{ status: 200, body: { data: PRODUCTS, meta: { pagination: { total_pages: 1 } } } }, { status: 503, body: { title: 'Unavailable' } }] } });
    await assert.rejects(run({ root, store, items: checkRequests([REQUESTS[0], REQUESTS[2]]) }), /the re-read after 2 writes failed/);
    const rows = readLogRows(root);
    assert.deepEqual(rows.filter(row => row.row === 'result').map(row => [row.id, row.outcome]), [['option 101/50', 'stopped'], ['product 102', 'stopped']]);
});

test('a 5xx whose write landed anyway is ok: the re-read decides', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'PUT /v3/catalog/products/102': [{ status: 502, body: {} }] }, writeAnyway: true });
    const { result } = await run({ root, store, items: checkRequests([REQUESTS[2]]) });
    assert.equal(result.written, 1);
    assert.match(readLogRows(root).find(row => row.row === 'result').message, /answered 502, but reads back as planned/);
});

test('the restore trial: one product applied, then restored from its snapshot to exactly where it began', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS });
    const plan = writePlan(root);
    const applied = loadSource({
        mode: 'apply', file: plan, product: 101, root,
    });
    assert.equal(applied.items.length, 2);
    const first = await run({
        root, store, items: applied.items, product: 101, sourceFile: applied.file, sourceSha: applied.sourceSha,
    });
    assert.equal(first.result.written, 2);
    assert.equal(store.product(102).brand_id, 0, 'only product 101 was written');
    const restore = loadSource({
        mode: 'restore', file: first.result.snapshot, product: 101, root, logRoot: root,
    });
    const back = await run({
        root, store, items: restore.items, mode: 'restore', job: restore.job, sourceFile: restore.file, sourceSha: restore.sourceSha,
    });
    assert.equal(back.result.written, 2);
    assert.deepEqual(store.product(101), PRODUCTS[0]);
    assert.ok(readLogRows(root).filter(row => row.action === 'restore').length === 4);
    const full = loadSource({
        mode: 'apply', file: plan, product: null, root,
    });
    const rest = await run({ root, store, items: full.items });
    assert.equal(rest.result.written, 3, 'once restored, the whole plan is pending again, not stale');
});

// An apply of a real plan file, so a restore can find the plan its snapshot names.
async function applyPlan(root, store, requests = REQUESTS, job = 'mixed', product = null) {
    const source = loadSource({
        mode: 'apply', file: writePlan(root, requests, job), product, root,
    });
    return run({
        root, store, items: source.items, job, product, sourceFile: source.file, sourceSha: source.sourceSha,
    });
}

test('a restore is refused whole when someone changed one of its objects since the apply', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS });
    const first = await applyPlan(root, store, [REQUESTS[2]], 'brand');
    await store.fetch(`https://api.bigcommerce.com/stores/${STORE_HASH}/v3/catalog/products/102`, { method: 'PUT', body: JSON.stringify({ brand_id: 361 }) });
    const restore = loadSource({
        mode: 'restore', file: first.result.snapshot, product: null, root, logRoot: root,
    });
    await assert.rejects(run({
        root, store, items: restore.items, mode: 'restore', job: restore.job,
    }), /1 of 1 objects no longer read as the apply left them/);
    assert.equal(store.product(102).brand_id, 361);
});

test('a re-read the store answers in pages is refused, not taken as missing products', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'GET /v3/catalog/products': [{ status: 200, body: { data: [], meta: { pagination: { total_pages: 2 } } } }] } });
    await assert.rejects(run({ root, store, items: checkRequests(REQUESTS) }), /answered in 2 pages: the store's page size is now smaller than the read's 2 products/);
    assert.deepEqual(store.calls.filter(call => call.method !== 'GET'), []);
});

// --- Steps 1 to 4: prepareWrite, with every seam recorded --------------------------------------

const UNSET = phaseOn({ flip: null, status: 'provisional', source: 'ticket 10: Flip date after ticket 26' });

// `seams(events)` replaces any of the defaults below, and can record into the same events list.
let tick = 0;
function prepare(root, options, seams = () => ({})) {
    const events = [];
    const lines = [];
    const secrets = [];
    const attempt = prepareWrite({
        options,
        root,
        logRoot: root,
        say: line => lines.push(line),
        secrets,
        now: new Date(Date.UTC(2026, 9, 6, 12) + (++tick) * 1000),
        terminal: () => true,
        calendar: () => UNSET,
        toolingProblem: () => {
            events.push('tooling');
            return null;
        },
        storeHash: async () => {
            events.push('store hash');
            return STORE_HASH;
        },
        askToken: async () => {
            events.push('token');
            return FAKE_TOKEN;
        },
        takeLock: label => {
            events.push(`lock ${label}`);
            return { release() {} };
        },
        ...seams(events),
    });
    return {
        attempt, events, lines, secrets,
    };
}

const applyOptions = file => ({ mode: 'apply', file, product: null });

test('prepareWrite refuses without a terminal before it reads the plan or asks anything', async () => {
    const root = freshRoot();
    const { attempt, events } = prepare(root, applyOptions(writePlan(root)), () => ({ terminal: () => false }));
    await assert.rejects(attempt, error => error.name === 'Refused' && /^catalogue writes run only at Shaun's terminal/.test(error.message));
    assert.deepEqual(events, []);
    assert.ok(!fs.existsSync(path.join(root, 'snapshots')), 'not even the requests file is written');
});

test('prepareWrite refuses while LOCKED exists, before it reads the plan or asks anything', async () => {
    const root = freshRoot();
    fs.writeFileSync(path.join(root, 'LOCKED'), JSON.stringify({ reason: 'part 3 failed on inventory' }));
    const { attempt, events, lines } = prepare(root, applyOptions(writePlan(root)));
    await assert.rejects(attempt, error => error.name === 'Refused' && /LOCKED exists: every apply refuses until Shaun removes it \(part 3 failed on inventory\)/.test(error.message));
    assert.deepEqual(events, []);
    assert.deepEqual(lines, []);
    assert.ok(!fs.existsSync(path.join(root, 'snapshots')));
});

test('prepareWrite prints the exact requests and checks the tooling before it asks for a token; a tooling problem asks for none', async () => {
    const root = freshRoot();
    const plan = writePlan(root);
    const refused = prepare(root, applyOptions(plan), events => ({
        toolingProblem: () => {
            events.push('tooling');
            return 'this checkout\'s catalogue tooling differs from origin/master\'s (scripts/catalogue/apply-rules.mjs)';
        },
    }));
    await assert.rejects(refused.attempt, error => error.name === 'Refused' && /differs from origin\/master's \(scripts\/catalogue\/apply-rules\.mjs\)/.test(error.message));
    assert.deepEqual(refused.events, ['tooling'], 'no store hash looked up and no token asked for');
    assert.ok(refused.lines.includes('The exact requests (3):'));
    assert.ok(refused.lines.includes('  3. PUT /v3/catalog/products/102 {"brand_id":411}'));

    const ok = prepare(root, applyOptions(plan));
    const prepared = await ok.attempt;
    assert.deepEqual(ok.events, ['tooling', 'store hash', 'token', `lock scripts/catalogue/apply.mjs ${path.basename(plan)}`]);
    assert.equal(prepared.token, FAKE_TOKEN);
    assert.equal(prepared.storeHash, STORE_HASH);
    assert.equal(prepared.source.items.length, 3);
    assert.deepEqual(ok.secrets, [FAKE_TOKEN], 'the token is in the redaction list as soon as it is typed');
});

test('prepareWrite refuses a plan made for another store before it asks for a token', async () => {
    const root = freshRoot();
    const { attempt, events } = prepare(root, applyOptions(writePlan(root)), list => ({
        storeHash: async () => {
            list.push('store hash');
            return 'zz99yy88';
        },
    }));
    await assert.rejects(attempt, error => error.name === 'Refused' && new RegExp(`the plan was made for store ${STORE_HASH}, and this is zz99yy88`).test(error.message));
    assert.deepEqual(events, ['tooling', 'store hash']);
});

test('prepareWrite prints the release calendar, and from T-14 a freeze warning Shaun may go past', async () => {
    const root = freshRoot();
    const quiet = prepare(root, applyOptions(writePlan(root)));
    await quiet.attempt;
    assert.ok(quiet.lines.includes('Release calendar: no Flip date yet (provisional; ticket 10: Flip date after ticket 26), so nothing is limited.'));
    assert.ok(!quiet.lines.some(line => /^WARN/.test(line)));
    const frozen = prepare(root, applyOptions(writePlan(root, REQUESTS, 'frozen')), () => ({
        calendar: () => phaseOn({ flip: '2026-11-01', status: 'set', source: 'ticket 10' }, '2026-10-20'),
    }));
    await frozen.attempt;
    assert.ok(frozen.lines.some(line => /^Release calendar: Flip 2026-11-01 \(set; ticket 10\)\. 2026-10-20 is in T-14/.test(line)));
    assert.ok(frozen.lines.includes('WARN     the content and catalogue freeze began on 2026-10-18 (T-14), and ticket 18\'s jobs were meant to run before it. This run goes on only if Shaun types the sha256 below.'));
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

test('the go-ahead is the first 8 characters of the plan\'s sha256, and what was typed is never repeated back', async () => {
    const sha = 'ab12cd34'.padEnd(64, '0');
    const right = terminal();
    const asked = confirmSourceSha({ ...right, sha, what: 'plan' });
    right.input.write('AB12CD34\n');
    await asked;
    assert.match(right.shown(), /type the first 8 characters of the plan's sha256 \(as the approval page shows it\)/);

    const wrong = terminal();
    const refused = confirmSourceSha({ ...wrong, sha, what: 'plan' });
    wrong.input.write(`${FAKE_TOKEN}\n`);
    await assert.rejects(refused, error => {
        assert.equal(error.name, 'Refused');
        assert.equal(error.message, 'what was typed isn\'t the start of this plan\'s sha256: stopped, nothing written');
        return true;
    });

    const closed = terminal();
    const ended = confirmSourceSha({ ...closed, sha, what: 'snapshot' });
    closed.input.end();
    await assert.rejects(ended, /no answer \(stdin closed\): stopped/);

    const none = terminal(false);
    await assert.rejects(confirmSourceSha({ ...none, sha, what: 'plan' }), /runs only at Shaun's terminal/);
    assert.equal(none.shown(), '', 'nothing is asked without a terminal');

    const restore = terminal();
    const snapshot = confirmSourceSha({ ...restore, sha, what: 'snapshot' });
    restore.input.write('ab12cd34\n');
    await snapshot;
    assert.match(restore.shown(), /the snapshot's sha256 \(as the apply printed it\)/);
});

test('--check refuses a plan made for another store before it reads anything', () => {
    const root = freshRoot();
    const plan = writePlan(root, [REQUESTS[2]], 'brand');
    const routes = path.join(root, 'routes.json');
    fs.writeFileSync(routes, '{}');
    const { status, stdout, stderr } = spawnSync(process.execPath, [APPLY, '--check', plan], {
        encoding: 'utf8',
        env: {
            ...process.env, RF_CATALOGUE_ROOT: root, RF_STORE_ROOT: root, RF_STORE_FIXTURES: routes, RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: 'zz99yy88',
        },
    });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, new RegExp(`^REFUSED {2}the plan was made for store ${STORE_HASH}, and this is zz99yy88`));
    assert.ok(!fs.existsSync(path.join(root, 'fixture-calls.jsonl')), 'no request was sent');
});

// --- A plan planned on another plan's result -----------------------------------------------------

const ONE = {
    id: 103,
    name: 'Inferno Popper',
    brand_id: 411,
    categories: [10],
    options: [{
        id: 60, display_name: 'Fly Sizes', type: 'radio_buttons', option_values: [value(9, '2-0', 0)],
    }],
    images: [],
};
const RENAME = {
    method: 'PUT', path: '/v3/catalog/products/103/options/60', body: { option_values: [value(9, '2/0', 0)] }, before: { display_name: 'Fly Sizes', option_values: [value(9, '2-0', 0)] }, product_id: 103,
};
const DEFAULT_ON_TOP = {
    method: 'PUT', path: '/v3/catalog/products/103/options/60', body: { option_values: [value(9, '2/0', 0, true)] }, before: { display_name: 'Fly Sizes', option_values: [value(9, '2/0', 0)] }, prior: { job: 'fly-sizes', before: RENAME.before }, product_id: 103,
};

test('a plan planned on another plan\'s result waits, writing nothing, until that plan is applied; then it applies as approved', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: [ONE], brands: BRANDS });
    let asked = false;
    await assert.rejects(run({
        root, store, items: checkRequests([DEFAULT_ON_TOP]), job: 'single-size-defaults', confirm: async () => { asked = true; },
    }), error => error.name === 'Refused' && /^1 of 1 requests are planned on the fly-sizes plan's result, which isn't applied yet, so nothing was written\. Apply that plan first; this one stays valid as approved:\n {2}option 103\/60 is planned on the fly-sizes plan's result/.test(error.message));
    assert.equal(asked, false);
    assert.deepEqual(store.calls.filter(call => call.method !== 'GET'), []);
    await run({
        root, store, items: checkRequests([RENAME]), job: 'fly-sizes',
    });
    const { result, lines } = await run({
        root, store, items: checkRequests([DEFAULT_ON_TOP]), job: 'single-size-defaults',
    });
    assert.equal(result.written, 1);
    assert.ok(lines.includes('  product 103 "Inferno Popper", option 60: default none -> 2/0 #9'));
    assert.deepEqual(store.product(103).options[0].option_values, [value(9, '2/0', 0, true)]);
});

test('--check counts the requests that wait for another plan apart from the stale ones', () => {
    const root = freshRoot();
    const plan = writePlan(root, [DEFAULT_ON_TOP], 'single-size-defaults');
    const routes = path.join(root, 'routes.json');
    fs.writeFileSync(routes, JSON.stringify({
        'GET /v3/catalog/products?id:in=103&include=options%2Cimages&include_fields=name%2Cbrand_id%2Ccategories&limit=10': { body: { data: [ONE], meta: { pagination: { total_pages: 1 } } } },
    }));
    const { status, stdout, stderr } = spawnSync(process.execPath, [APPLY, '--check', plan], {
        encoding: 'utf8',
        env: {
            ...process.env, RF_CATALOGUE_ROOT: root, RF_STORE_ROOT: root, RF_STORE_FIXTURES: routes, RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: STORE_HASH,
        },
    });
    assert.equal(stderr, '');
    assert.equal(status, 0, 'waiting isn\'t stale: the plan stays valid');
    assert.match(stdout, /single-size-defaults: 1 requests: 0 read as planned, 0 not written yet, 1 waiting for the fly-sizes plan to be applied, 0 changed since the plan/);
});

// --- A restore is tied to a real apply: its snapshot's sha256 is in log.jsonl ------------------

function writeSnapshot(root, items, { storeHash = STORE_HASH, planSha = 'a'.repeat(64) } = {}) {
    const folder = path.join(root, 'snapshots');
    fs.mkdirSync(folder, { recursive: true });
    const file = path.join(folder, `2026-10-06T12-00-00-18-forged-${++count}-before.json`);
    const textContent = `${JSON.stringify({
        format: SNAPSHOT_FORMAT, ticket: '18', job: 'mixed', mode: 'apply', source_sha256: planSha, ...(storeHash === null ? {} : { store_hash: storeHash }), items,
    }, null, 2)}\n`;
    fs.writeFileSync(file, textContent);
    return { file, sha: sha256(textContent) };
}

// An intent row for `request`, as apply logs it before it sends.
function logIntent(root, request, { snapshotSha, planSha }) {
    appendLogRow(root, logRow({
        row: 'intent', date: '2026-10-06T12:00:00.000Z', channel: 'store-wide', object: 'catalog/product', id: 'x', action: 'update', snapshot_sha256: snapshotSha, ticket: '18', operator: 'test', mode: 'approved', plan_sha256: planSha, request: 0, method: request.method, path: request.path,
    }));
}

// A plan file on disk, and its sha256 as apply reads it.
function planOnDisk(root, requests, job, folder = 'plans') {
    const file = writePlan(root, requests, job);
    const moved = path.join(root, folder, path.basename(file));
    if (folder !== 'plans') {
        fs.mkdirSync(path.join(root, folder), { recursive: true });
        fs.renameSync(file, moved);
    }
    return sha256(fs.readFileSync(moved, 'utf8'));
}

test('a restore refuses a snapshot that names no store, and one taken on another store before it asks for a token', async () => {
    const root = freshRoot();
    const planSha = planOnDisk(root, [REQUESTS[2]], 'brand');
    const nameless = writeSnapshot(root, [{ request: REQUESTS[2], before: { brand_id: 0, categories: [434] } }], { storeHash: null, planSha });
    logIntent(root, REQUESTS[2], { snapshotSha: nameless.sha, planSha });
    assert.throws(() => loadSource({
        mode: 'restore', file: nameless.file, product: null, root, logRoot: root,
    }), error => error.name === 'Refused' && /this snapshot names no store \(store_hash\)/.test(error.message));
    const elsewhere = writeSnapshot(root, [{ request: REQUESTS[2], before: { brand_id: 0, categories: [434] } }], { storeHash: 'zz99yy88', planSha });
    logIntent(root, REQUESTS[2], { snapshotSha: elsewhere.sha, planSha });
    const { attempt, events } = prepare(root, { mode: 'restore', file: elsewhere.file, product: null });
    await assert.rejects(attempt, error => error.name === 'Refused' && new RegExp(`the snapshot was taken on store zz99yy88, and this is ${STORE_HASH}`).test(error.message));
    assert.deepEqual(events, ['tooling', 'store hash'], 'no token asked for');
});

test('a restore is tied to the plan its apply ran: the log rows name it, it is on disk, and it sent every request the snapshot holds', () => {
    const root = freshRoot();
    const planSha = planOnDisk(root, [{ ...REQUESTS[2], body: { categories: [434, 999] } }], 'uncategorised');
    const load = file => () => loadSource({
        mode: 'restore', file, product: null, root, logRoot: root,
    });
    // A planted snapshot whose request also writes brand_id, which the plan never wrote.
    const widened = { ...REQUESTS[2], body: { categories: [434, 999], brand_id: 411 } };
    const planted = writeSnapshot(root, [{ request: widened, before: { brand_id: 0, categories: [434] } }], { planSha });
    logIntent(root, widened, { snapshotSha: planted.sha, planSha });
    assert.throws(load(planted.file), error => error.name === 'Refused' && /the snapshot holds requests its plan doesn't send \(product 102\)/.test(error.message));
    // Log rows that name another plan than the snapshot does.
    const honest = { ...REQUESTS[2], body: { categories: [434, 999] } };
    const crossed = writeSnapshot(root, [{ request: honest, before: { brand_id: 0, categories: [434] } }], { planSha });
    logIntent(root, honest, { snapshotSha: crossed.sha, planSha: 'b'.repeat(64) });
    assert.throws(load(crossed.file), /log\.jsonl ties this snapshot's writes to plan bbbbbbbb…, not the plan it names \([0-9a-f]{8}…\)/);
    // A plan that isn't on disk.
    const lost = writeSnapshot(root, [{ request: honest, before: { brand_id: 0, categories: [434] } }], { planSha: 'c'.repeat(64) });
    logIntent(root, honest, { snapshotSha: lost.sha, planSha: 'c'.repeat(64) });
    assert.throws(load(lost.file), /the plan this snapshot was applied from \(sha256 cccccccc…\) isn't in .*plans or superseded/);
    // The real thing: the plan, moved to superseded/ since, is still found.
    const kept = planOnDisk(root, [honest], 'kept', 'superseded');
    const real = writeSnapshot(root, [{ request: honest, before: { brand_id: 0, categories: [434] } }], { planSha: kept });
    logIntent(root, honest, { snapshotSha: real.sha, planSha: kept });
    assert.deepEqual(load(real.file)().items.map(item => [item.what.key, item.request.body]), [['product 102', { categories: [434] }]]);
});

test('a restore refuses a snapshot no apply logged, so a planted one can\'t write', () => {
    const root = freshRoot();
    const { file } = writeSnapshot(root, [{ request: REQUESTS[2], before: { brand_id: 0, categories: [] } }]);
    assert.throws(() => loadSource({
        mode: 'restore', file, product: null, root, logRoot: root,
    }), error => error.name === 'Refused' && /^log\.jsonl has no ticket 18 write from this snapshot \(sha256 [0-9a-f]{8}…\): a restore puts back only what an apply wrote/.test(error.message));
});

test('a restore refuses a snapshot whose logged writes it doesn\'t hold', () => {
    const root = freshRoot();
    const { file, sha } = writeSnapshot(root, [{ request: REQUESTS[2], before: { brand_id: 0, categories: [434] } }]);
    appendLogRow(root, logRow({
        row: 'intent', date: '2026-10-06T12:00:00.000Z', channel: 'store-wide', object: 'catalog/image', id: 'image 101/7', action: 'update', snapshot_sha256: sha, ticket: '18', operator: 'test', mode: 'approved', plan_sha256: 'a'.repeat(64), request: 1, method: 'PUT', path: '/v3/catalog/products/101/images/7',
    }));
    assert.throws(() => loadSource({
        mode: 'restore', file, product: null, root, logRoot: root,
    }), /log\.jsonl names a write this snapshot doesn't hold \(PUT \/v3\/catalog\/products\/101\/images\/7\)/);
});

test('a restore puts back only what the apply sent; what it never sent is listed', async () => {
    const root = freshRoot();
    const store = fakeCatalogue({ products: PRODUCTS, brands: BRANDS }, { answers: { 'PUT /v3/catalog/products/101/images/7': [{ status: 422, body: { title: 'Invalid' } }] } });
    const first = await applyPlan(root, store);
    assert.match(first.result.halted, /image 101\/7 got 422/);
    const restore = loadSource({
        mode: 'restore', file: first.result.snapshot, product: null, root, logRoot: root,
    });
    assert.deepEqual(restore.items.map(item => item.what.key), ['option 101/50', 'image 101/6'], 'the old thumbnail is made the thumbnail again');
    assert.deepEqual(restore.skipped, ['product 102: the apply never sent it (no intent row in log.jsonl), so there is nothing to put back']);
});
