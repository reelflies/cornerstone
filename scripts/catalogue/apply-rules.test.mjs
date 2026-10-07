// Tests scripts/catalogue/apply-rules.mjs (ticket 18): the catalogue allowlist, plan files, the
// stale check, the derived diff, the read-back and the restore.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PLAN_FORMAT, checkRequests, classify, diffLine, judge, planDigest, readBackProblem, readPlan, readsFor, restoreRequests,
} from './apply-rules.mjs';

const value = (id, label, sortOrder, isDefault = false) => ({
    id, label, sort_order: sortOrder, is_default: isDefault,
});
const OPTION_BEFORE = { display_name: 'Fly Sizes', option_values: [value(1, '12', 0, true), value(2, '2-0', 1)] };
const optionRequest = (values = [value(2, '2/0', 0), value(1, '12', 1, true)]) => ({
    method: 'PUT', path: '/v3/catalog/products/101/options/50', body: { option_values: values }, before: OPTION_BEFORE, product_id: 101,
});
const imageRequest = {
    method: 'PUT', path: '/v3/catalog/products/101/images/7', body: { is_thumbnail: true }, before: { description: 'On white', is_thumbnail: false, thumbnail_id: 6 }, product_id: 101,
};
const altRequest = {
    method: 'PUT', path: '/v3/catalog/products/101/images/6', body: { description: 'Adams Dry Fly' }, before: { description: '', is_thumbnail: true, thumbnail_id: 6 }, product_id: 101,
};
const brandRequest = {
    method: 'PUT', path: '/v3/catalog/products/102', body: { brand_id: 411 }, before: { brand_id: 0, categories: [434] }, product_id: 102,
};
const brandFields = {
    method: 'PUT', path: '/v3/catalog/brands/411', body: { page_title: 'ReelFlies flies' }, before: { page_title: '', meta_description: '' },
};

// The store as a batched products read and a brand read answer it.
function store({
    values = OPTION_BEFORE.option_values, thumbnail = 6, description = '', brandId = 0, pageTitle = '',
} = {}) {
    return {
        products: new Map([
            [101, {
                id: 101,
                name: 'Adams Dry Fly',
                brand_id: 411,
                categories: [10],
                options: [{ id: 50, display_name: 'Fly Sizes', option_values: values.map(item => ({ ...item, value_data: null })) }],
                images: [{
                    id: 6, is_thumbnail: thumbnail === 6, description, sort_order: 0,
                }, {
                    id: 7, is_thumbnail: thumbnail === 7, description: 'On white', sort_order: 1,
                }],
            }],
            [102, {
                id: 102, name: 'Clouser', brand_id: brandId, categories: [434], options: [], images: [],
            }],
        ]),
        brands: new Map([[411, {
            id: 411, name: 'ReelFlies', page_title: pageTitle, meta_description: '',
        }]]),
    };
}

test('the allowlist: four PUTs, each with its own fields', () => {
    assert.equal(classify(optionRequest()).key, 'option 101/50');
    assert.equal(classify(imageRequest).key, 'image 101/7');
    assert.equal(classify(brandRequest).key, 'product 102');
    assert.equal(classify(brandFields).key, 'brand 411');
    const refused = (request, pattern) => assert.throws(() => classify(request), error => error.name === 'Refused' && pattern.test(error.message));
    refused({ ...brandRequest, method: 'POST' }, /PUTs only/);
    refused({ ...brandRequest, method: 'DELETE' }, /PUTs only/);
    refused({ ...brandRequest, path: '/v3/catalog/products/102/variants/3' }, /isn't on the catalogue allowlist/);
    refused({ ...brandRequest, path: '/v3/catalog/categories/5' }, /isn't on the catalogue allowlist/);
    refused({ ...brandRequest, path: '/v3/catalog/products?id:in=1' }, /isn't on the catalogue allowlist/);
    refused({ ...brandRequest, body: { price: 1 } }, /may write only brand_id, categories, not price/);
    refused({ ...brandRequest, body: { brand_id: 0 } }, /brand_id must be a brand id/);
    refused({ ...brandRequest, body: { categories: [] } }, /at least one/);
    refused({ ...brandRequest, body: {} }, /must write at least one/);
    refused({ ...brandRequest, query: { channel_id: 1 } }, /may hold only/);
    refused({ ...brandRequest, before: undefined }, /no "before" read/);
    refused({ ...brandRequest, product_id: 103 }, /isn't the product in its path/);
    refused({ ...imageRequest, body: { is_thumbnail: false } }, /only be set to true/);
    refused({ ...altRequest, body: { description: '  ' } }, /description must be 1 to 1000/);
    refused({ ...altRequest, body: { description: 'x', sort_order: 2 } }, /not sort_order/);
    refused(optionRequest([value(2, '2/0', 0)].map(item => ({ ...item, value_data: null }))), /exactly id, is_default, label, sort_order/);
    refused(optionRequest([value(2, '2/0', 0, true), value(1, '12', 1, true)]), /more than one default/);
    refused(optionRequest([value(2, '2/0', 0), value(2, '12', 1)]), /names a value id twice/);
    refused(optionRequest([]), /whole, non-empty list/);
    refused({ ...optionRequest(), body: { option_values: [value(2, '', 0)] } }, /label must be 1 to 255/);
});

test('a restore may write back empty values; a plan may not', () => {
    assert.equal(classify({ ...altRequest, body: { description: '' } }, { mode: 'restore' }).key, 'image 101/6');
    assert.equal(classify({ ...brandRequest, body: { brand_id: 0 } }, { mode: 'restore' }).key, 'product 102');
    assert.equal(classify({ ...brandRequest, body: { categories: [] } }, { mode: 'restore' }).key, 'product 102');
    assert.throws(() => classify({ ...imageRequest, body: { is_thumbnail: false } }, { mode: 'restore' }), /only be set to true/);
});

test('a plan writes each object once, and every problem is named at once', () => {
    assert.equal(checkRequests([optionRequest(), imageRequest]).length, 2);
    assert.throws(() => checkRequests([brandRequest, brandRequest]), /request 2: product 102 is already written by request 1/);
    assert.throws(() => checkRequests([{ ...brandRequest, method: 'POST' }, { ...imageRequest, body: {} }]), error => /request 1:.*\nrequest 2:/s.test(error.message));
    assert.throws(() => checkRequests([]), /1 to 3000 requests/);
});

test('a plan file is read only with its format, ticket, job and an untouched digest', () => {
    const plan = {
        format: PLAN_FORMAT, ticket: '18', job: 'fly-sizes', requests: [optionRequest()], digest: null,
    };
    plan.digest = planDigest(plan);
    assert.equal(readPlan(JSON.stringify(plan)).items.length, 1);
    assert.throws(() => readPlan('{'), /isn't JSON/);
    assert.throws(() => readPlan(JSON.stringify({ ...plan, format: 'reelflies-store-plan/1' })), /isn't a catalogue plan/);
    assert.throws(() => readPlan(JSON.stringify({ ...plan, requests: [brandRequest] })), /digest doesn't match/);
    const other = { ...plan, ticket: '21' };
    other.digest = planDigest(other);
    assert.throws(() => readPlan(JSON.stringify(other)), /ticket is "21"/);
});

test('the store is read in batches of products with their options and images, and brand by brand', () => {
    const reads = readsFor(checkRequests([optionRequest(), imageRequest, brandRequest, brandFields]));
    assert.deepEqual(reads, [
        {
            kind: 'products',
            ids: [101, 102],
            path: '/v3/catalog/products',
            query: {
                'id:in': '101,102', include: 'options,images', include_fields: 'name,brand_id,categories', limit: 10,
            },
        },
        {
            kind: 'brand', ids: [411], path: '/v3/catalog/brands/411', query: {},
        },
    ]);
});

test('each request is pending, already done, or stale against the store as read now', () => {
    const items = checkRequests([optionRequest(), imageRequest, altRequest, brandRequest, brandFields]);
    assert.deepEqual(judge(items, store()).map(item => item.status), ['pending', 'pending', 'pending', 'pending', 'pending']);
    const applied = store({
        values: [value(2, '2/0', 0), value(1, '12', 1, true)], thumbnail: 7, description: 'Adams Dry Fly', brandId: 411, pageTitle: 'ReelFlies flies',
    });
    assert.deepEqual(judge(items, applied).map(item => item.status), ['done', 'done', 'done', 'done', 'done']);
    const edited = judge(items, store({ values: [value(1, '12', 0, false), value(2, '2-0', 1)], description: 'By hand', brandId: 361 }));
    assert.deepEqual(edited.map(item => item.status), ['stale', 'pending', 'stale', 'stale', 'pending']);
    assert.match(edited[0].reason, /changed since the plan was made/);
});

test('an option whose values were added or removed is stale, so a write can never drop a value', () => {
    const added = judge(checkRequests([optionRequest()]), store({ values: [...OPTION_BEFORE.option_values, value(3, '4', 2)] }));
    assert.equal(added[0].status, 'stale');
    assert.match(added[0].reason, /value ids are now 1, 2, 3, and the plan sends 1, 2; sending it would delete or miss a value/);
    const gone = judge(checkRequests([{ ...imageRequest, path: '/v3/catalog/products/101/images/9' }]), store());
    assert.equal(gone[0].status, 'stale');
    assert.match(gone[0].reason, /isn't in the store's answer/);
});

test('the diff is derived from the store as read, one line per object', () => {
    const items = judge(checkRequests([optionRequest(), imageRequest, altRequest, brandRequest, brandFields]), store());
    assert.deepEqual(items.map(item => diffLine(item, item.now, 'Adams Dry Fly')), [
        'product 101 "Adams Dry Fly", option 50: values 12, 2-0 -> 2/0, 12',
        'product 101 "Adams Dry Fly", image 7: thumbnail image 6 -> 7',
        'product 101 "Adams Dry Fly", image 6: description "" -> "Adams Dry Fly"',
        'product 102 "Adams Dry Fly": brand_id 0 -> 411',
        'brand 411: page_title "" -> "ReelFlies flies"',
    ]);
    const defaults = judge(checkRequests([optionRequest([value(1, '12', 0, false), value(2, '2-0', 1)])]), store());
    assert.equal(diffLine(defaults[0], defaults[0].now), 'product 101, option 50: default 12 -> none');
});

test('after a write, the re-read must show what was planned', () => {
    const items = checkRequests([optionRequest(), imageRequest]);
    assert.equal(readBackProblem(items[0], store({ values: [value(2, '2/0', 0), value(1, '12', 1, true)] })), null);
    assert.match(readBackProblem(items[0], store()), /option 101\/50 reads back .*not as planned/);
    assert.equal(readBackProblem(items[1], store({ thumbnail: 7 })), null);
    assert.match(readBackProblem(items[1], store({ thumbnail: 6 })), /image 101\/7 reads back/);
});

test('a restore puts back what the snapshot read, and expects the state the plan left', () => {
    const snapshot = {
        items: [
            { request: optionRequest(), before: OPTION_BEFORE },
            { request: imageRequest, before: { description: 'On white', is_thumbnail: false, thumbnail_id: 6 } },
            { request: brandFields, before: { page_title: '', meta_description: '' } },
            { request: { ...imageRequest, path: '/v3/catalog/products/102/images/8', product_id: 102 }, before: { description: '', is_thumbnail: false, thumbnail_id: null } },
        ],
    };
    const { requests, skipped } = restoreRequests(snapshot);
    assert.deepEqual(requests, [
        {
            method: 'PUT', path: '/v3/catalog/products/101/options/50', body: { option_values: OPTION_BEFORE.option_values }, before: { ...OPTION_BEFORE, option_values: optionRequest().body.option_values }, product_id: 101,
        },
        {
            method: 'PUT', path: '/v3/catalog/products/101/images/6', body: { is_thumbnail: true }, before: { is_thumbnail: false, thumbnail_id: 7 }, product_id: 101,
        },
        {
            method: 'PUT', path: '/v3/catalog/brands/411', body: { page_title: '' }, before: { page_title: 'ReelFlies flies', meta_description: '' },
        },
    ]);
    assert.deepEqual(skipped, ['image 102/8: the product had no thumbnail before, so there is none to put back']);
    assert.deepEqual(restoreRequests(snapshot, { productId: 101 }).requests.length, 2);
    const alt = restoreRequests({ items: [{ request: altRequest, before: { description: '', is_thumbnail: true, thumbnail_id: 6 } }] });
    assert.deepEqual(alt.requests, [{
        method: 'PUT', path: '/v3/catalog/products/101/images/6', body: { description: '' }, before: { description: 'Adams Dry Fly', is_thumbnail: true, thumbnail_id: 6 }, product_id: 101,
    }]);
    assert.equal(checkRequests(alt.requests, { mode: 'restore' }).length, 1);
});

test('the diff lists the values in the order the write leaves them, so a reorder is never "no change"', () => {
    const now = [value(1, '6/0', 0), value(2, '2', 1), value(3, '4', 2)];
    // The same array order, with the sort_order numbers turned: the store then shows 4, 6/0, 2.
    const turned = [value(1, '6/0', 1), value(2, '2', 2), value(3, '4', 0)];
    const request = { ...optionRequest(turned), before: { display_name: 'Fly Sizes', option_values: now } };
    const [item] = judge(checkRequests([request]), store({ values: now }));
    assert.equal(item.status, 'pending');
    assert.equal(diffLine(item, item.now), 'product 101, option 50: values 6/0, 2, 4 -> 4, 6/0, 2');
});

test('a plan may not give two values the same sort_order; a restore may put back what it read', () => {
    const tied = optionRequest([value(2, '2/0', 0), value(1, '12', 0, true)]);
    assert.throws(() => classify(tied), error => error.name === 'Refused' && /option_values gives two values the same sort_order \(0\), so their order is unclear/.test(error.message));
    assert.equal(classify(tied, { mode: 'restore' }).key, 'option 101/50');
});

test('a plan may only add categories, never drop one; a restore may put back any list', () => {
    assert.equal(classify({ ...brandRequest, body: { categories: [434, 999] } }).key, 'product 102');
    assert.throws(() => classify({ ...brandRequest, body: { categories: [999] } }), error => error.name === 'Refused' && /a plan may only add categories, and this drops 434/.test(error.message));
    assert.throws(() => classify({ ...brandRequest, body: { categories: [999] }, before: { brand_id: 0 } }), /the "before" read has no categories list/);
    assert.equal(classify({ ...brandRequest, body: { categories: [999] } }, { mode: 'restore' }).key, 'product 102');
});

// A single-size default planned on the Fly Sizes job's result: 2-0 is renamed to 2/0 there, and
// this request then sets it as the default. It waits until the Fly Sizes plan is applied.
const ONE_BEFORE = { display_name: 'Fly Sizes', option_values: [value(2, '2-0', 0)] };
const ONE_RENAMED = { display_name: 'Fly Sizes', option_values: [value(2, '2/0', 0)] };
const onTop = {
    method: 'PUT', path: '/v3/catalog/products/101/options/50', body: { option_values: [value(2, '2/0', 0, true)] }, before: ONE_RENAMED, prior: { job: 'fly-sizes', before: ONE_BEFORE }, product_id: 101,
};

test('a request planned on another plan\'s result waits until that plan is applied, then is pending', () => {
    assert.equal(classify(onTop).key, 'option 101/50');
    const [waiting] = judge(checkRequests([onTop]), store({ values: ONE_BEFORE.option_values }));
    assert.equal(waiting.status, 'waiting');
    assert.equal(waiting.reason, 'option 101/50 is planned on the fly-sizes plan\'s result, and that plan isn\'t applied yet');
    assert.equal(judge(checkRequests([onTop]), store({ values: ONE_RENAMED.option_values }))[0].status, 'pending');
    assert.equal(judge(checkRequests([onTop]), store({ values: [value(2, '2/0', 0, true)] }))[0].status, 'done');
    assert.equal(judge(checkRequests([onTop]), store({ values: [value(2, '3-0', 0)] }))[0].status, 'stale');
    const refused = (prior, pattern) => assert.throws(() => classify({ ...onTop, prior }), error => error.name === 'Refused' && pattern.test(error.message));
    refused({ job: 'Fly Sizes', before: ONE_BEFORE }, /prior must be \{ job, before \}/);
    refused({ job: 'fly-sizes' }, /prior must be \{ job, before \}/);
    refused({ job: 'fly-sizes', before: ONE_BEFORE, body: {} }, /prior must be \{ job, before \}/);
    const { requests } = restoreRequests({ items: [{ request: onTop, before: ONE_RENAMED }] });
    assert.deepEqual(requests, [{
        method: 'PUT', path: '/v3/catalog/products/101/options/50', body: { option_values: ONE_RENAMED.option_values }, before: { ...ONE_RENAMED, option_values: onTop.body.option_values }, product_id: 101,
    }], 'a restore puts back the state the request was planned on, and carries no prior');
});

test('a request is done once what it changes reads as planned, even if a later plan changed a field it leaves alone', () => {
    // The Fly Sizes request renames 2-0 and reorders; a later plan cleared 12's default.
    const later = store({ values: [value(2, '2/0', 0), value(1, '12', 1, false)] });
    assert.equal(judge(checkRequests([optionRequest()]), later)[0].status, 'done');
    // Only half of its own change in place: not done, and not pending either.
    const half = store({ values: [value(2, '2/0', 1), value(1, '12', 0, true)] });
    assert.equal(judge(checkRequests([optionRequest()]), half)[0].status, 'stale');
    assert.match(readBackProblem(checkRequests([optionRequest()])[0], later), /reads back .*not as planned/, 'the re-read after a write still wants every field');
});
