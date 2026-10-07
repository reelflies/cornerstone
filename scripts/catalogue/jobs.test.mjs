// Tests scripts/catalogue/jobs.mjs (ticket 18): each job's diff from the export, and its exact
// requests from an API read.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { modelFromExport } from './csv.mjs';
import { runJobs } from './jobs.mjs';

const FIXTURE = fileURLToPath(new URL('./fixtures/export.csv', import.meta.url));
const csvModel = () => modelFromExport(fs.readFileSync(FIXTURE, 'utf8'));

/* eslint-disable no-param-reassign -- apiModel fills ids into a fresh copy of the export's model */
// The same catalogue as the API reads it: ids on every option and value, default flags, brand
// names and tree 1. Product 101's size 12 is its default.
export function apiModel() {
    const model = csvModel();
    model.source = 'api';
    for (const product of model.products) {
        product.options.forEach((option, k) => {
            option.id = product.id * 10 + k;
            option.values.forEach((value, v) => {
                value.id = option.id * 10 + v;
                value.isDefault = product.id === 101 && value.label === '12';
            });
        });
        for (const image of product.images) image.urlTiny = `https://cdn.example/${image.id}.44.58.jpg`;
    }
    model.brands = [{
        id: 411, name: 'ReelFlies', page_title: '', meta_description: '',
    }, {
        id: 361, name: 'Mustad', page_title: '', meta_description: null,
    }];
    model.categories = [[1, 0, 'Flies'], [10, 1, 'Dry Flies'], [30, 1, 'Streamers & Buggers'], [434, 30, 'ReelFlies Signature Flies'], [342, 434, 'Signature Articulated Flies'], [20, 0, 'Fly Tying']]
        .map(([id, parentId, name]) => ({
            id, parentId, name, treeId: 1,
        }));
    return model;
}

const job = (results, id) => results.find(result => result.id === id);
const after = (result, productId) => result.rows.filter(row => row.product_id === productId).map(row => [row.before, row.after]);

test('Fly Sizes from the export: renamed to n/0 and put in hook order, with no plan', () => {
    const result = job(runJobs(csvModel()), 'fly-sizes');
    assert.deepEqual(after(result, 101), [['16, 12, 14, 10', '10, 12, 14, 16']]);
    assert.deepEqual(after(result, 102), [['2-0, 1-0, 2, 4', '2/0, 1/0, 2, 4']]);
    assert.deepEqual(after(result, 108), [['1-0, 2, 1', '1/0, 1, 2']]);
    assert.deepEqual(after(result, 109), [['8, 6', '6, 8']]);
    assert.deepEqual(after(result, 103), [['32, 33', '(unchanged)']]);
    assert.match(result.rows.find(row => row.product_id === 103).note, /needs a person: 32, 33 aren't a hook size/);
    assert.deepEqual(after(result, 107), [], 'one size, already right: no row');
    assert.deepEqual(result.counts, {
        options: 8, live: 6, renamed: 4, reordered: 3, unchanged: 1, attention: 1,
    });
    assert.deepEqual(result.requests, []);
    assert.deepEqual(result.extra.radio.map(row => row.product_id), [104]);
    assert.deepEqual(result.extra.sizeOptions.map(row => [row.product_id, row.what]), [[105, 'option "Size"']]);
});

test('Fly Sizes from the API: one PUT per option with its whole value list, defaults untouched', () => {
    const result = job(runJobs(apiModel()), 'fly-sizes');
    const adams = result.requests.find(request => request.product_id === 101);
    assert.deepEqual(adams, {
        method: 'PUT',
        path: '/v3/catalog/products/101/options/1010',
        body: {
            option_values: [
                {
                    id: 10103, label: '10', sort_order: 0, is_default: false,
                },
                {
                    id: 10101, label: '12', sort_order: 1, is_default: true,
                },
                {
                    id: 10102, label: '14', sort_order: 2, is_default: false,
                },
                {
                    id: 10100, label: '16', sort_order: 3, is_default: false,
                },
            ],
        },
        before: {
            display_name: 'Fly Sizes',
            option_values: [
                {
                    id: 10100, label: '16', sort_order: 0, is_default: false,
                },
                {
                    id: 10101, label: '12', sort_order: 1, is_default: true,
                },
                {
                    id: 10102, label: '14', sort_order: 2, is_default: false,
                },
                {
                    id: 10103, label: '10', sort_order: 3, is_default: false,
                },
            ],
        },
        product_id: 101,
    });
    assert.equal(result.requests.length, 6);
    assert.ok(!result.requests.some(request => request.product_id === 103));
});

test('a Selection with suspect sizes gets a proposal from what the other Selections do', () => {
    const model = apiModel();
    model.products.push({
        ...model.products[0], id: 120, name: 'Dry Fly Selection - 12 Flies', options: [], images: [],
    });
    const notes = job(runJobs(model), 'fly-sizes').notes.join('\n');
    assert.match(notes, /Proposal for 103 "Cray Fish Selection - 8 Flies" \(values 32, 33\): 1 of the other 1 Live "Selection" products have no option at all/);
    assert.match(notes, /Recommended: Shaun removes this option in the control panel/);
});

test('Shaun\'s fix for a product with suspect sizes is applied, and then it is planned', () => {
    const result = job(runJobs(apiModel(), { sizeFixes: { 103: { 32: '4', 33: '6' } } }), 'fly-sizes');
    assert.deepEqual(after(result, 103), [['32, 33', '4, 6']]);
    assert.match(result.rows.find(row => row.product_id === 103).note, /with Shaun's fix/);
    assert.deepEqual(result.requests.find(request => request.product_id === 103).body.option_values.map(value => value.label), ['4', '6']);
});

test('default sizes: the flag is cleared on multi-size products; the export can\'t say', () => {
    const fromApi = job(runJobs(apiModel()), 'default-sizes');
    assert.deepEqual(after(fromApi, 101), [['default: 12', 'no default']]);
    assert.deepEqual(fromApi.requests.map(request => [request.path, request.body.option_values.map(value => [value.label, value.sort_order, value.is_default])]), [
        ['/v3/catalog/products/101/options/1010', [['16', 0, false], ['12', 1, false], ['14', 2, false], ['10', 3, false]]],
    ]);
    const fromCsv = job(runJobs(csvModel()), 'default-sizes');
    assert.equal(fromCsv.rows.length, 0);
    assert.equal(fromCsv.counts.unknown, 6);
});

test('single-size Live products get their only size preselected, for Shaun to decide', () => {
    const result = job(runJobs(apiModel()), 'single-size-defaults');
    assert.deepEqual(result.rows.map(row => row.product_id), [104, 107]);
    assert.deepEqual(result.requests.map(request => request.body.option_values), [
        [{
            id: 10400, label: '2-0', sort_order: 0, is_default: true,
        }],
        [{
            id: 10700, label: '4', sort_order: 0, is_default: true,
        }],
    ]);
    assert.match(result.decision, /Shaun decides/);
});

test('option names: Color becomes Colour, a Size of hook sizes becomes Fly Sizes, and only the name is sent', () => {
    const result = job(runJobs(apiModel()), 'option-names');
    assert.deepEqual(result.rows.map(row => [row.product_id, row.before, row.after]), [[105, 'Color', 'Colour'], [105, 'Size', 'Fly Sizes']]);
    assert.deepEqual(result.requests.map(request => [request.path, request.body]), [
        ['/v3/catalog/products/105/options/1050', { display_name: 'Colour' }],
        ['/v3/catalog/products/105/options/1051', { display_name: 'Fly Sizes' }],
    ]);
});

test('the Live product with no category gets its namesakes\' tree-1 categories as a proposal', () => {
    const model = apiModel();
    assert.deepEqual(after(job(runJobs(model), 'uncategorised'), 105), [['(none)', '(Shaun names one)']]);
    model.products.push({
        ...model.products[0], id: 110, name: 'Black Muddler', categories: [10, 99], options: [], images: [],
    });
    const result = job(runJobs(model), 'uncategorised');
    assert.deepEqual(after(result, 105), [['(none)', '10 Dry Flies']]);
    assert.deepEqual(result.requests.map(request => [request.path, request.body, request.before]), [['/v3/catalog/products/105', { categories: [10] }, { brand_id: 411, categories: [] }]]);
});

test('the brand job assigns ReelFlies to the Signature set and reports who carries it already', () => {
    const result = job(runJobs(apiModel()), 'brand');
    assert.deepEqual(result.counts, {
        live: 7, signature: 2, alreadyBranded: 1, toAssign: 1, brandedOutside: 4,
    });
    assert.deepEqual(after(result, 102), [['(no brand)', 'ReelFlies']]);
    assert.deepEqual(result.requests.map(request => [request.path, request.body]), [['/v3/catalog/products/102', { brand_id: 411 }]]);
    assert.match(result.notes.join('\n'), /already on 5 of 7 Live products/);
    assert.match(result.notes.join('\n'), /A\. Recommended/);
});

test('from the export, which names no brand, the brand job only counts the Signature set', () => {
    const result = job(runJobs(csvModel()), 'brand');
    assert.deepEqual(result.rows, []);
    assert.equal(result.counts.signature, 2);
    assert.match(result.notes[0], /the export has brand ids only/);
});

test('the brand listing\'s fields wait for ticket 14\'s copy, and the dry run says there is no intro field', () => {
    const waiting = job(runJobs(apiModel()), 'brand-fields');
    assert.match(waiting.decision, /waiting/);
    assert.deepEqual(waiting.requests, []);
    assert.deepEqual(waiting.rows.map(row => [row.what, row.before, row.after]), [['page_title', '(empty)', '(ticket 14\'s copy)'], ['meta_description', '(empty)', '(ticket 14\'s copy)']]);
    assert.match(waiting.notes[0], /no field for an intro/);
    const ready = job(runJobs(apiModel(), { brandCopy: { page_title: 'ReelFlies flies', meta_description: 'Flies tied for ReelFlies.' } }), 'brand-fields');
    assert.deepEqual(ready.requests.map(request => [request.path, request.body, request.before]), [['/v3/catalog/brands/411', { page_title: 'ReelFlies flies', meta_description: 'Flies tied for ReelFlies.' }, { page_title: '', meta_description: '' }]]);
});

test('thumbnails: a white image becomes the thumbnail, and the rest go on a ranked re-export list', () => {
    const grounds = new Map(Object.entries({
        1001: 'black', 1002: 'white', 1003: 'white', 1004: 'black', 1005: 'other', 1007: 'white', 1008: 'white', 1009: 'black',
    }).map(([id, ground]) => [Number(id), { ground }]));
    grounds.set(1006, { ground: 'unknown', reason: 'HTTP 404' });
    const sales = new Map([[104, 50], [103, 10]]);
    const result = job(runJobs(apiModel(), { grounds, sales }), 'thumbnails');
    assert.deepEqual(after(result, 101), [['image 1001 (black)', 'image 1002 (white)']]);
    assert.deepEqual(result.requests.map(request => [request.path, request.body, request.before]), [['/v3/catalog/products/101/images/1002', { is_thumbnail: true }, { description: 'Adams Dry Fly on white', is_thumbnail: false, thumbnail_id: 1001 }]]);
    assert.deepEqual(result.extra.reexport.map(item => [item.rank, item.product_id, item.tier, item.thumbnail_ground]), [[1, 104, 'top 200 seller', 'other'], [2, 103, 'top 200 seller', 'black']]);
    assert.match(after(result, 105)[0][0], /unread/);
    assert.deepEqual(result.counts, {
        live: 7, white: 3, swapped: 1, reexport: 2, unknown: 1, noThumbnail: 0,
    });
});

test('alt text: every empty image description gets the product\'s name', () => {
    const result = job(runJobs(apiModel()), 'alt-text');
    assert.deepEqual(result.rows.map(row => [row.product_id, row.what, row.after]), [[101, 'image 1001 description', 'Adams Dry Fly'], [104, 'image 1005 description', 'Inferno Popper'], [108, 'image 1008 description', 'Mustad Hook [100/pack]']]);
    assert.deepEqual(result.requests[0], {
        method: 'PUT',
        path: '/v3/catalog/products/101/images/1001',
        body: { description: 'Adams Dry Fly' },
        before: { description: '', is_thumbnail: true, thumbnail_id: 1001 },
        product_id: 101,
    });
    assert.deepEqual(result.counts, { images: 9, empty: 3, live: 3 });
});

test('runJobs runs only the jobs asked for', () => {
    assert.deepEqual(runJobs(csvModel(), {}, ['brand', 'alt-text']).map(result => result.id), ['brand', 'alt-text']);
});
