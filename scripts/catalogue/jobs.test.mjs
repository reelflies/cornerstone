// Tests scripts/catalogue/jobs.mjs (ticket 18): each job's diff from the export, and its exact
// requests from an API read.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { checkRequests, judge } from './apply-rules.mjs';
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
        options: 9, live: 7, renamed: 4, reordered: 3, unchanged: 2, attention: 1,
    }, '105\'s "Size" of hook sizes counts as Fly Sizes');
    assert.deepEqual(result.requests, []);
    assert.deepEqual(result.extra.radio.map(row => row.product_id), [104]);
    assert.deepEqual(result.extra.sizeOptions.map(row => [row.product_id, row.what, row.note]), [[105, 'option "Size"', 'hook sizes under another name: this job orders them, and the option-names job renames the option (they write different fields, so either may run first)']]);
    assert.match(result.notes.join('\n'), /variant-row order/);
});

test('the Fly Sizes page always says which "reordered" count is the real one', () => {
    const notes = job(runJobs(apiModel()), 'fly-sizes').notes.join('\n');
    assert.match(notes, /The API read counts 3 options out of hook order by sort_order, the order the storefront shows: that is the real figure\. An export \(its counts are shown beside these when the dry run is given one\) lists values in variant-row order instead/);
    assert.match(notes, /357 of 1,937/);
});

test('a "Size" option of hook sizes gets the rename and hook order too, whichever of it and option-names runs first', () => {
    const model = apiModel();
    const muddler = model.products.find(product => product.id === 105);
    muddler.options[1].values = [{
        id: 10510, label: '8', sortOrder: 0, isDefault: false,
    }, {
        id: 10511, label: '2-0', sortOrder: 1, isDefault: false,
    }];
    const results = runJobs(model);
    const sizes = job(results, 'fly-sizes').requests.find(request => request.product_id === 105);
    assert.equal(sizes.path, '/v3/catalog/products/105/options/1051');
    assert.deepEqual(sizes.body.option_values.map(value => [value.label, value.sort_order]), [['2/0', 0], ['8', 1]]);
    const rename = job(results, 'option-names').requests.find(request => request.path === sizes.path);
    assert.deepEqual(Object.keys(rename.body), ['display_name']);
    assert.deepEqual(Object.keys(sizes.body), ['option_values'], 'the two jobs write different fields of the option');
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

test('default sizes: the flag is cleared on multi-size products, planned on the Fly Sizes job\'s result; the export can\'t say', () => {
    const fromApi = job(runJobs(apiModel()), 'default-sizes');
    assert.deepEqual(after(fromApi, 101), [['default: 12', 'no default']]);
    assert.deepEqual(fromApi.requests.map(request => [request.path, request.body.option_values.map(value => [value.label, value.sort_order, value.is_default])]), [
        ['/v3/catalog/products/101/options/1010', [['10', 0, false], ['12', 1, false], ['14', 2, false], ['16', 3, false]]],
    ]);
    const [request] = fromApi.requests;
    assert.deepEqual(request.before.option_values.map(value => [value.label, value.is_default]), [['10', false], ['12', true], ['14', false], ['16', false]], 'its before is the Fly Sizes job\'s result');
    assert.equal(request.prior.job, 'fly-sizes');
    assert.deepEqual(request.prior.before.option_values.map(value => value.label), ['16', '12', '14', '10']);
    const fromCsv = job(runJobs(csvModel()), 'default-sizes');
    assert.equal(fromCsv.rows.length, 0);
    assert.equal(fromCsv.counts.unknown, 7, '105\'s "Size" of hook sizes is one of them');
});

test('single-size Live products get their only size preselected, for Shaun to decide; a size Fly Sizes renames is planned on its result', () => {
    const result = job(runJobs(apiModel()), 'single-size-defaults');
    assert.deepEqual(result.rows.map(row => [row.product_id, row.before, row.after]), [[104, '2/0, not preselected', '2/0, preselected'], [107, '4, not preselected', '4, preselected']]);
    assert.match(result.rows[0].note, /planned on the Fly Sizes job's result \(2-0 is renamed there\): apply it after that job/);
    assert.deepEqual(result.requests.map(request => request.body.option_values), [
        [{
            id: 10400, label: '2/0', sort_order: 0, is_default: true,
        }],
        [{
            id: 10700, label: '4', sort_order: 0, is_default: true,
        }],
    ]);
    assert.deepEqual(result.requests[0].before, {
        display_name: 'Fly Sizes',
        option_values: [{
            id: 10400, label: '2/0', sort_order: 0, is_default: false,
        }],
    });
    assert.deepEqual(result.requests[0].prior, {
        job: 'fly-sizes',
        before: {
            display_name: 'Fly Sizes',
            option_values: [{
                id: 10400, label: '2-0', sort_order: 0, is_default: false,
            }],
        },
    });
    assert.ok(!('prior' in result.requests[1]), 'Fly Sizes doesn\'t write 107\'s option');
    assert.match(result.decision, /Shaun decides/);
});

// The store as the API reads it, from the model, for judging plans against.
function storeOf(model) {
    const products = new Map(model.products.map(product => [product.id, {
        id: product.id,
        name: product.name,
        brand_id: product.brandId,
        categories: product.categories,
        options: product.options.map(option => ({
            id: option.id,
            display_name: option.displayName,
            option_values: option.values.map(value => ({
                id: value.id, label: value.label, sort_order: value.sortOrder, is_default: value.isDefault,
            })),
        })),
        images: product.images.map(image => ({
            id: image.id, is_thumbnail: image.isThumbnail, description: image.description, sort_order: image.sortOrder,
        })),
    }]));
    return { products, brands: new Map() };
}

// What a PUT of an option's option_values leaves in the store.
function putOptions(store, requests) {
    for (const request of requests) {
        const option = store.products.get(request.product_id).options.find(candidate => request.path.endsWith(`/options/${candidate.id}`));
        option.option_values = request.body.option_values.map(value => ({ ...value }));
    }
}

test('the batch\'s plans apply as approved in their order: the jobs that build on Fly Sizes wait for it, then are pending, never stale', () => {
    const model = apiModel();
    const results = runJobs(model);
    const plan = id => checkRequests(job(results, id).requests);
    const store = storeOf(model);
    const statuses = id => judge(plan(id), store).map(item => item.status);
    assert.deepEqual(statuses('single-size-defaults'), ['waiting', 'pending']);
    assert.deepEqual(statuses('default-sizes'), ['waiting']);
    assert.ok(statuses('fly-sizes').every(status => status === 'pending'));
    putOptions(store, job(results, 'fly-sizes').requests);
    assert.deepEqual(statuses('single-size-defaults'), ['pending', 'pending']);
    assert.deepEqual(statuses('default-sizes'), ['pending']);
    assert.ok(statuses('option-names').every(status => status === 'pending'), 'option-names writes display_name only, so Fly Sizes leaves it pending');
    putOptions(store, [...job(results, 'single-size-defaults').requests, ...job(results, 'default-sizes').requests]);
    assert.ok(statuses('fly-sizes').every(status => status === 'done'), 'and the defaults leave Fly Sizes done, not stale');
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

test('the brand job assigns ReelFlies to the Signature set, reports who carries it already, and leaves the choice to Shaun', () => {
    const result = job(runJobs(apiModel()), 'brand');
    assert.deepEqual(result.counts, {
        live: 7, signature: 2, alreadyBranded: 1, toAssign: 1, brandedOutside: 4,
    });
    assert.deepEqual(after(result, 102), [['(no brand)', 'ReelFlies']]);
    assert.deepEqual(result.requests.map(request => [request.path, request.body]), [['/v3/catalog/products/102', { brand_id: 411 }]]);
    const notes = result.notes.join('\n');
    assert.match(notes, /already on 5 of 7 Live products/);
    assert.match(result.decision, /Shaun first picks A, B or C/);
    assert.match(result.decision, /no agent default/);
    assert.match(notes, /spec module 12/i);
    assert.match(notes, /tree 4 on 1895766 has no Signature category/);
    assert.match(notes, /A\. No more brand writes\. \/brands\/ReelFlies\.html stays a listing of every ReelFlies product \(5 Live today\), not a Signature page/);
    assert.match(notes, /B\. The agent's recommendation: a new brand/);
    assert.match(notes, /a new brand URL/);
    assert.match(notes, /2 products' brand changes in the Google and Meta feeds/);
    assert.doesNotMatch(notes, /gather the Signature patterns from the Signature categories/);
});

test('option B: once Shaun has made the Signature brand, the dry run plans it on the Signature set', () => {
    const model = apiModel();
    model.brands.push({
        id: 500, name: 'ReelFlies Signature', page_title: '', meta_description: '',
    });
    const result = job(runJobs(model, { signatureBrand: 'ReelFlies Signature' }), 'brand');
    assert.deepEqual(result.requests.map(request => [request.path, request.body, request.before]), [
        ['/v3/catalog/products/102', { brand_id: 500 }, { brand_id: 0, categories: [434] }],
        ['/v3/catalog/products/107', { brand_id: 500 }, { brand_id: 411, categories: [342, 10] }],
    ]);
    assert.deepEqual(after(result, 107), [['ReelFlies', 'ReelFlies Signature']]);
    assert.match(result.decision, /option B/);
    const missing = job(runJobs(apiModel(), { signatureBrand: 'ReelFlies Signature' }), 'brand');
    assert.deepEqual(missing.requests, []);
    assert.match(missing.notes.join('\n'), /No brand named "ReelFlies Signature" in this read: Shaun creates it in the control panel first/);
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
        live: 7, white: 3, swapped: 1, reexport: 2, unknown: 1, noThumbnail: 0, noImages: 0,
    });
});

test('a Live product with no photo at all goes on ticket 14\'s re-export list, as ground "none"', () => {
    const model = apiModel();
    model.products.push({
        ...model.products[0], id: 111, name: 'Mustad 9479 Salmon Egg Fly Hook', options: [], images: [],
    });
    const result = job(runJobs(model, { grounds: new Map(), sales: new Map([[111, 3]]) }), 'thumbnails');
    assert.deepEqual(result.extra.reexport.find(item => item.product_id === 111), {
        rank: 1, tier: 'top 200 seller', product_id: 111, product: 'Mustad 9479 Salmon Egg Fly Hook', sku: 'RF-101', thumbnail_image_id: '', thumbnail_ground: 'none', thumbnail_url: '',
    });
    assert.deepEqual(after(result, 111), [['(none)', '']]);
    assert.match(result.rows.find(row => row.product_id === 111).note, /no images: on the re-export list for ticket 14/);
    assert.equal(result.counts.noImages, 1);
    assert.equal(result.counts.reexport, 1);
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
