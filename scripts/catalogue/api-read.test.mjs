// Tests scripts/catalogue/api-read.mjs (ticket 18) against the store helper's fixture fetch: no
// network and no token.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '../store/client.mjs';
import { FAKE_TOKEN, STORE_HASH, fixtureFetch } from '../store/fixtures/store.mjs';
import {
    PRODUCT_FIELDS, modelFromReads, readCatalogue,
} from './api-read.mjs';

const page = (data, current, total) => ({ body: { data, meta: { pagination: { current_page: current, total_pages: total } } } });
const products = n => `GET /v3/catalog/products?include=options%2Cimages&include_fields=${encodeURIComponent(PRODUCT_FIELDS)}&limit=250&page=${n}`;

const API_PRODUCTS = [
    {
        id: 101,
        name: 'Adams Dry Fly',
        sku: 'RF-101',
        is_visible: true,
        categories: [10, 20],
        brand_id: 411,
        sort_order: 0,
        options: [{
            id: 501,
            product_id: 101,
            display_name: 'Fly Sizes',
            type: 'rectangles',
            option_values: [
                {
                    id: 9001, label: '16', sort_order: 0, is_default: false, value_data: null,
                },
                {
                    id: 9002, label: '12', sort_order: 1, is_default: true, value_data: null,
                },
            ],
        }],
        images: [{
            id: 1001, product_id: 101, is_thumbnail: true, sort_order: 0, description: '', url_standard: 'https://cdn.example/1001.386.513.jpg', url_tiny: 'https://cdn.example/1001.44.58.jpg',
        }],
    },
];

test('the catalogue is read page by page with GETs only, and becomes the jobs\' model', async () => {
    const calls = [];
    const routes = {
        [products(1)]: page(API_PRODUCTS, 1, 2),
        [products(2)]: page([{
            ...API_PRODUCTS[0], id: 102, name: 'Hidden', is_visible: false, options: [], images: [],
        }], 2, 2),
        'GET /v3/catalog/products/channel-assignments?limit=250&page=1': page([{ product_id: 101, channel_id: 1855224 }, { product_id: 101, channel_id: 1 }, { product_id: 102, channel_id: 1 }], 1, 1),
        'GET /v3/catalog/brands?limit=250&page=1': page([{
            id: 411, name: 'ReelFlies', page_title: '', meta_description: '',
        }], 1, 1),
        'GET /v3/catalog/trees/categories?limit=250&page=1&tree_id:in=1': page([{
            category_id: 10, parent_id: 0, name: 'Flies', tree_id: 1,
        }], 1, 1),
    };
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes, { calls }), readOnly: true,
    });
    const reads = await readCatalogue(client, { now: new Date('2026-10-06T12:00:00Z') });
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.equal(calls.length, 5);
    assert.equal(reads.read_at, '2026-10-06T12:00:00.000Z');
    const model = modelFromReads(reads);
    assert.equal(model.source, 'api');
    assert.deepEqual(model.products[0], {
        id: 101,
        name: 'Adams Dry Fly',
        sku: 'RF-101',
        isVisible: true,
        channels: [1, 1855224],
        categories: [10, 20],
        brandId: 411,
        sortOrder: 0,
        options: [{
            id: 501,
            displayName: 'Fly Sizes',
            type: 'rectangles',
            values: [
                {
                    id: 9001, label: '16', sortOrder: 0, isDefault: false,
                },
                {
                    id: 9002, label: '12', sortOrder: 1, isDefault: true,
                },
            ],
        }],
        images: [{
            id: 1001, isThumbnail: true, description: '', sortOrder: 0, url: 'https://cdn.example/1001.386.513.jpg', urlTiny: 'https://cdn.example/1001.44.58.jpg',
        }],
    });
    assert.deepEqual(model.products[1].channels, [1]);
    assert.deepEqual(model.brands, [{
        id: 411, name: 'ReelFlies', page_title: '', meta_description: '',
    }]);
    assert.deepEqual(model.categories, [{
        id: 10, parentId: 0, name: 'Flies', treeId: 1,
    }]);
});

test('a failed read stops the dry run, naming the request and the status', async () => {
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch({ [products(1)]: { status: 403, body: { title: 'You don\'t have a required scope' } } }), readOnly: true,
    });
    await assert.rejects(readCatalogue(client), /GET \/v3\/catalog\/products.* answered 403: You don't have a required scope/);
});

test('a page that doesn\'t say how many pages there are stops the read', async () => {
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch({ [products(1)]: { body: { data: [] } } }), readOnly: true,
    });
    await assert.rejects(readCatalogue(client), /no pagination/);
});

test('a 429 on a page is waited out and the page asked for again', async () => {
    const calls = [];
    const routes = {
        [products(1)]: [{ status: 429, body: { title: 'Too many requests' } }, page([], 1, 1)],
        'GET /v3/catalog/products/channel-assignments?limit=250&page=1': page([], 1, 1),
        'GET /v3/catalog/brands?limit=250&page=1': page([], 1, 1),
        'GET /v3/catalog/trees/categories?limit=250&page=1&tree_id:in=1': page([], 1, 1),
    };
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes, { calls }), readOnly: true,
    });
    const waits = [];
    await readCatalogue(client, { wait: async ms => { waits.push(ms); } });
    assert.deepEqual(waits, [2000]);
    assert.equal(calls.length, 5);
});
