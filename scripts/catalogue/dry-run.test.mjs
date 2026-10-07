// Tests scripts/catalogue/dry-run.mjs (ticket 18): the dry runs from the export and from an API
// read, with GETs only, and the plans they make are ones apply accepts.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FAKE_TOKEN, STORE_HASH } from '../store/fixtures/store.mjs';
import { readPlan } from './apply-rules.mjs';
import { loadSource } from './apply.mjs';
import { PRODUCT_FIELDS } from './api-read.mjs';
import { dryRun, parseArgs, readSales } from './dry-run.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/export.csv', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-catalogue-dry-run-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let count = 0;

test('the arguments', () => {
    assert.deepEqual(parseArgs(['--csv', 'x.csv', '--images', 'skip']), {
        csv: 'x.csv', api: false, out: null, images: 'skip', sales: null, brandCopy: null, sizeFixes: null, jobs: null,
    });
    assert.deepEqual(parseArgs(['--api', '--jobs', 'brand,alt-text']).jobs, ['brand', 'alt-text']);
    assert.throws(() => parseArgs([]), /give --csv/);
    assert.throws(() => parseArgs(['--api', '--jobs', 'everything']), /unknown jobs everything/);
    assert.throws(() => parseArgs(['--csv']), /--csv needs a value/);
    assert.throws(() => parseArgs(['--api', '--images', 'all']), /fetch or skip/);
});

test('sales are read as units per product, and nothing else', () => {
    const sales = readSales('id,name,units_365,rev_365\n101,Adams,12.0,99\n102,"Clouser, olive",0.0,0\n');
    assert.deepEqual([...sales], [[101, 12], [102, 0]]);
    assert.throws(() => readSales('id,name\n1,x\n'), /id and units_365/);
});

test('from the export alone: every job\'s diff, the reports, and no plan', async () => {
    const root = path.join(tmp, `root-${++count}`);
    const out = path.join(root, 'out');
    const lines = [];
    const { results, plans } = await dryRun(parseArgs(['--csv', FIXTURE, '--images', 'skip', '--out', out]), { say: line => lines.push(line), env: { ...process.env, RF_CATALOGUE_ROOT: root } });
    assert.equal(results.length, 9);
    assert.deepEqual(plans, {});
    assert.ok(!fs.existsSync(path.join(root, 'plans')));
    const files = fs.readdirSync(out).sort();
    assert.ok(files.includes('18-catalogue-batch.md'));
    assert.ok(files.includes('18-fly-sizes.md') && files.includes('18-fly-sizes.csv'));
    assert.ok(files.includes('18-reexport-for-14.csv'));
    const page = fs.readFileSync(path.join(out, '18-fly-sizes.md'), 'utf8');
    assert.match(page, /# 18 · Fly Sizes: 1\/0 to 6\/0, and hook order/);
    assert.match(page, /\| 101 Adams Dry Fly \| yes \| Fly Sizes values \| 16, 12, 14, 10 \| 10, 12, 14, 16 \| reordered \|/);
    assert.match(fs.readFileSync(path.join(out, '18-fly-sizes.csv'), 'utf8'), /^product_id,product,live,what,before,after,note\n101,Adams Dry Fly,true,Fly Sizes values,"16, 12, 14, 10","10, 12, 14, 16",reordered\n/);
    assert.match(fs.readFileSync(path.join(out, '18-catalogue-batch.md'), 'utf8'), /\*\*Nothing has been written to the store\.\*\*/);
});

const page = data => ({ body: { data, meta: { pagination: { total_pages: 1 } } } });
const API_PRODUCTS = [
    {
        id: 101,
        name: 'Adams Dry Fly',
        sku: 'RF-101',
        is_visible: true,
        categories: [10],
        brand_id: 411,
        sort_order: 0,
        options: [{
            id: 50,
            display_name: 'Fly Sizes',
            type: 'rectangles',
            option_values: [{
                id: 1, label: '12', sort_order: 0, is_default: true, value_data: null,
            }, {
                id: 2, label: '2-0', sort_order: 1, is_default: false, value_data: null,
            }],
        }],
        images: [{
            id: 6, is_thumbnail: true, description: '', sort_order: 0, url_standard: 'https://cdn.example/6.386.513.jpg', url_tiny: 'https://cdn.example/black/6.44.58.jpg',
        }, {
            id: 7, is_thumbnail: false, description: 'On white', sort_order: 1, url_standard: 'https://cdn.example/7.386.513.jpg', url_tiny: 'https://cdn.example/white/7.44.58.jpg',
        }],
    },
    {
        id: 102, name: 'Clouser Minnow', sku: 'RF-102', is_visible: true, categories: [434], brand_id: 0, sort_order: 0, options: [], images: [],
    },
];

test('from the API: GETs only, the read kept as a snapshot, and plans that apply accepts', async () => {
    const root = path.join(tmp, `root-${++count}`);
    fs.mkdirSync(root, { recursive: true });
    const routes = path.join(root, 'routes.json');
    fs.writeFileSync(routes, JSON.stringify({
        [`GET /v3/catalog/products?include=options%2Cimages&include_fields=${encodeURIComponent(PRODUCT_FIELDS)}&limit=250&page=1`]: page(API_PRODUCTS),
        'GET /v3/catalog/products/channel-assignments?limit=250&page=1': page([{ product_id: 101, channel_id: 1 }, { product_id: 102, channel_id: 1 }]),
        'GET /v3/catalog/brands?limit=250&page=1': page([{
            id: 411, name: 'ReelFlies', page_title: '', meta_description: '',
        }]),
        'GET /v3/catalog/trees/categories?limit=250&page=1&tree_id:in=1': page([{
            category_id: 10, parent_id: 0, name: 'Flies', tree_id: 1,
        }]),
    }));
    const env = {
        ...process.env, RF_CATALOGUE_ROOT: root, RF_STORE_ROOT: root, RF_STORE_FIXTURES: routes, RF_BC_READ_TOKEN: FAKE_TOKEN, RF_BC_STORE_HASH: STORE_HASH,
    };
    const fetchImages = async url => {
        const { default: jpeg } = await import('jpeg-js'); // eslint-disable-line import/no-extraneous-dependencies
        const ground = url.includes('white') ? 252 : 5;
        const data = new Uint8Array(44 * 58 * 4).fill(255);
        for (let at = 0; at < data.length; at += 4) data.set([ground, ground, ground], at);
        return new Response(Buffer.from(jpeg.encode({ width: 44, height: 58, data }, 90).data), { headers: { 'Content-Type': 'image/jpeg' } });
    };
    const lines = [];
    const { results, plans } = await dryRun(parseArgs(['--api', '--out', path.join(root, 'out')]), {
        say: line => lines.push(line), env, fetchImages, now: new Date('2026-10-06T12:00:00Z'),
    });
    const calls = fs.readFileSync(path.join(root, 'fixture-calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual([...new Set(calls.map(call => call.method))], ['GET']);
    assert.ok(lines.every(line => !line.includes(FAKE_TOKEN)));
    assert.deepEqual(Object.keys(plans).sort(), ['alt-text', 'brand', 'default-sizes', 'fly-sizes', 'thumbnails']);
    assert.deepEqual(results.find(result => result.id === 'thumbnails').rows.map(row => [row.product_id, row.before, row.after]), [[101, 'image 6 (black)', 'image 7 (white)'], [102, '(none)', '']]);
    for (const [job, { file, sha256 }] of Object.entries(plans)) {
        const { plan, items } = readPlan(fs.readFileSync(file, 'utf8'));
        assert.equal(plan.job, job);
        assert.equal(plan.store_hash, STORE_HASH);
        assert.match(plan.read.file, /2026-10-06T12-00-00\.000Z-18-dry-run-read\.json$/);
        assert.ok(items.length > 0);
        assert.equal(loadSource({
            mode: 'apply', file, product: null, root,
        }).sourceSha, sha256);
    }
    const flySizes = readPlan(fs.readFileSync(plans['fly-sizes'].file, 'utf8')).plan;
    assert.deepEqual(flySizes.requests[0].body.option_values.map(value => [value.label, value.sort_order, value.is_default]), [['2/0', 0, false], ['12', 1, true]]);
    const index = fs.readFileSync(path.join(root, 'out', '18-catalogue-batch.md'), 'utf8');
    assert.match(index, new RegExp(`\`${plans['fly-sizes'].sha256.slice(0, 8)}\``));
});
