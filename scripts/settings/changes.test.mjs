// Ticket 21's changes files under store-settings/, run through the store-write helper (W0-11,
// scripts/store/) on the store's own answers, recorded by scripts/settings/read.mjs on
// 2026-10-06 (fixtures/recorded-2026-10-06.json). No token and no network.
//
// - store-settings/1895766/: lifted writes. Each passes the allowlist and the channel rule, plans
//   with parts 1 and 2 of the three-part test proved, and applies with part 3 holding; a leak to
//   the global value is put back and locks the helper.
// - store-settings/store-wide/: Shaun's approval batch. Each is refused as a lifted write and
//   plans only in approved mode, and carries exactly the change the checklist describes.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCalendar, phaseOn } from '../lib/release-calendar.mjs';
import { classify } from '../store/allowlist.mjs';
import { applyPlan, lockedProblem } from '../store/apply.mjs';
import { createClient } from '../store/client.mjs';
import { FAKE_TOKEN, STORE_HASH, fixtureFetch } from '../store/fixtures/store.mjs';
import { readLogRows } from '../store/log.mjs';
import { buildPlan, checkRequests } from '../store/plan.mjs';

const DIR = new URL('../../store-settings/', import.meta.url);
const recorded = JSON.parse(fs.readFileSync(new URL('./fixtures/recorded-2026-10-06.json', import.meta.url), 'utf8'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-settings-changes-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let roots = 0;
const newRoot = () => path.join(tmp, `root-${++roots}`);

const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');
const contentFreeze = phaseOn(parseCalendar({ flip: '2027-03-01', status: 'set', source: 'ticket 10' }), '2027-02-20');
const flipped = phaseOn(parseCalendar({ flip: '2027-03-01', status: 'set', source: 'ticket 10' }), '2027-03-02');

const changesFiles = folder => fs.readdirSync(new URL(`${folder}/`, DIR)).filter(name => name.endsWith('.json')).sort();
const loadChanges = (folder, name) => JSON.parse(fs.readFileSync(new URL(`${folder}/${name}`, DIR), 'utf8'));
const requestsOf = (folder, name) => loadChanges(folder, name).requests;

const SCOPE_QUERY = {
    global: '', 1: '?channel_id=1', 1855224: '?channel_id=1855224', 1895766: '?channel_id=1895766',
};
// The four GETs of one settings endpoint, answered from the recorded reads. An override replaces
// a scope's answer with a list of answers given in turn.
function settingsRoutes(settings, overrides = {}) {
    return Object.fromEntries(Object.entries(SCOPE_QUERY).map(([scope, query]) => [
        `GET /v3/settings/${settings}${query}`, overrides[scope] || { body: recorded[settings][scope] },
    ]));
}

async function plan(requests, routes, { mode = 'lifted', phase = unset } = {}) {
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes), readOnly: true,
    });
    const { plan: made } = await buildPlan({
        requests, ticket: '21', mode, phase, client, storeHash: STORE_HASH, operator: 'rook on t21/settings-plan', now: new Date('2026-10-07T04:00:00.000Z'),
    });
    return { plan: made, text: `${JSON.stringify(made, null, 2)}\n` };
}

function clock() {
    let time = Date.parse('2026-10-07T04:10:00.000Z');
    return () => {
        time += 1000;
        return new Date(time);
    };
}

async function apply(text, routes) {
    const calls = [];
    const lines = [];
    const root = newRoot();
    const client = createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes, { calls }) });
    const result = await applyPlan({
        planText: text, client, phase: unset, root, operator: 'rook on t21/settings-plan', approved: false, dryRun: false, now: clock(), log: line => lines.push(line), wait: async () => {},
    });
    return {
        result, calls, lines, root,
    };
}

const withData = (answer, data) => ({ ...answer, data: { ...answer.data, ...data } });

// --- What the recorded reads say, which the checklist relies on -------------------------------

test('the recorded reads: sold-out sizes are already labelled store-wide, and Product Filtering is already on', () => {
    // option_out_of_stock_behavior is label_option globally and 1895766 inherits it, so ticket 21's
    // label_option needs no write; product_out_of_stock_behavior keeps sold-out products listed.
    assert.equal(recorded.inventory.global.data.option_out_of_stock_behavior, 'label_option');
    assert.equal(recorded.inventory['1895766'].data.option_out_of_stock_behavior, null);
    assert.equal(recorded.inventory.global.data.product_out_of_stock_behavior, 'do_nothing');
    assert.equal(recorded.inventory.global.data.default_out_of_stock_message, 'Out of stock');
    assert.equal(recorded['storefront/search'].global.data.product_filtering_enabled, true);
    // Channels 1 and 1855224 have their own channel-wide filter contexts; 1895766 has none, so the
    // store's default list is what it shows.
    const contexts = recorded['search/filters/contexts'].global.data.map(item => item.context);
    assert.deepEqual(contexts, [{ channel_id: 1, category_id: 0 }, { channel_id: 1855224, category_id: 0 }]);
    assert.deepEqual(recorded['search/filters/contexts']['1895766'].data, []);
    // 1895766 has USD enabled beside CAD: the checklist's CAD-only item is a control-panel change.
    assert.deepEqual(recorded['currency-assignments']['1895766'].data.enabled_currencies, ['CAD', 'USD']);
});

// --- The lifted writes on 1895766 ----------------------------------------------------------

test('every 1895766 changes file is a lifted settings write that names only 1895766, in its query', () => {
    const names = changesFiles('1895766');
    assert.deepEqual(names, ['inventory.json', 'security.json']);
    for (const name of names) {
        const file = loadChanges('1895766', name);
        assert.equal(typeof file._about, 'string', `${name} says what it is for`);
        const items = checkRequests(file.requests, { mode: 'lifted', phase: unset });
        for (const { request, what } of items) {
            assert.equal(what.kind, 'settings', `${name} writes settings`);
            assert.deepEqual(request.query, { channel_id: 1895766 }, `${name} names 1895766 in its query and nothing else`);
            assert.ok(!JSON.stringify(request.body).includes('channel'), `${name} names no channel in its body`);
        }
    }
});

test('the calendar: the 1895766 settings writes are allowed through the content freeze, and refused from the Flip', () => {
    for (const name of changesFiles('1895766')) {
        assert.doesNotThrow(() => checkRequests(requestsOf('1895766', name), { mode: 'lifted', phase: contentFreeze }));
        assert.throws(() => checkRequests(requestsOf('1895766', name), { mode: 'lifted', phase: flipped }), /after the Flip 1895766 is live reelflies\.ca/);
    }
});

// Ticket 21 sets label_option on 1895766 itself, and decision 1's do_nothing with it: both are
// the global values today, which 1895766 only inherits, so a later store-wide change would reach
// the size pills (37) and quick add's sold-out rows (43). Writing them on 1895766 pins them there.
const INVENTORY = {
    product_out_of_stock_behavior: 'do_nothing',
    option_out_of_stock_behavior: 'label_option',
    stock_level_display: 'show_when_low',
};

test('inventory pins sold-out products listed and sold-out sizes labelled on 1895766, and shows stock only when low', () => {
    const [request] = requestsOf('1895766', 'inventory.json');
    assert.deepEqual(request.body, INVENTORY);
});

test('inventory plans with parts 1 and 2 proved on the store\'s own reads, at all four scopes', async () => {
    const { plan: made } = await plan(requestsOf('1895766', 'inventory.json'), settingsRoutes('inventory'));
    assert.equal(made.channel, 1895766);
    assert.deepEqual(made.snapshot.reads.map(read => read.scope), ['1895766', 'global', '1', '1855224']);
    assert.equal(made.proofs.length, 1);
    assert.equal(made.proofs[0].proved, true);
    assert.deepEqual(made.proofs[0].part2.map(item => item.key), Object.keys(INVENTORY));
    assert.deepEqual(made.diff, [
        '1. PUT /v3/settings/inventory?channel_id=1895766 (settings/inventory settings)',
        '     product_out_of_stock_behavior: 1895766 null (inherits the global "do_nothing") -> "do_nothing"',
        '     option_out_of_stock_behavior: 1895766 null (inherits the global "label_option") -> "label_option"',
        '     stock_level_display: 1895766 null (inherits the global "dont_show") -> "show_when_low"',
    ]);
});

test('inventory applies on 1895766 alone: part 3 reads the global value and both live channels unchanged', async () => {
    const { text } = await plan(requestsOf('1895766', 'inventory.json'), settingsRoutes('inventory'));
    const before = recorded.inventory['1895766'];
    const { result, calls, root } = await apply(text, {
        ...settingsRoutes('inventory', { 1895766: [{ body: before }, { body: withData(before, INVENTORY) }] }),
        'PUT /v3/settings/inventory?channel_id=1895766': { body: { data: INVENTORY, meta: {} } },
    });
    assert.equal(result.outcome, 'applied');
    const puts = calls.filter(call => call.method === 'PUT');
    assert.deepEqual(puts.map(call => [call.path, call.body]), [['/v3/settings/inventory?channel_id=1895766', INVENTORY]]);
    const rows = readLogRows(root);
    assert.deepEqual(rows.map(row => [row.row, row.ticket, row.channel, row.outcome]), [['intent', '21', 1895766, undefined], ['result', '21', 1895766, 'ok']]);
    assert.equal(lockedProblem(root), null);
});

test('inventory that leaks to the global value is put back at once, and the helper locks', async () => {
    const { text } = await plan(requestsOf('1895766', 'inventory.json'), settingsRoutes('inventory'));
    const before = recorded.inventory['1895766'];
    const global = recorded.inventory.global;
    const { result, calls, root } = await apply(text, {
        ...settingsRoutes('inventory', {
            1895766: [{ body: before }, { body: withData(before, INVENTORY) }, { body: before }],
            global: [{ body: global }, { body: withData(global, { stock_level_display: 'show_when_low' }) }, { body: global }],
        }),
        'PUT /v3/settings/inventory?channel_id=1895766': { body: { data: INVENTORY, meta: {} } },
        'PUT /v3/settings/inventory': { body: global },
    });
    assert.equal(result.outcome, 'locked');
    const puts = calls.filter(call => call.method === 'PUT').map(call => [call.path, call.body]);
    assert.deepEqual(puts, [
        ['/v3/settings/inventory?channel_id=1895766', INVENTORY],
        ['/v3/settings/inventory?channel_id=1895766', before.data],
        ['/v3/settings/inventory', { stock_level_display: 'dont_show' }],
    ]);
    assert.match(lockedProblem(root), /part 3 of ticket 21's test failed for settings\/inventory/);
});

test('security plans with all four fields, X-Frame-Options on and HSTS left inherited for the Flip', async () => {
    const [request] = requestsOf('1895766', 'security.json');
    // BigCommerce takes no partial update of a channel's security settings.
    assert.deepEqual(Object.keys(request.body).sort(), Object.keys(recorded['storefront/security'].global.data).sort());
    assert.deepEqual(request.body.x_frame_options_header, { enabled: true, setting: 'same_origin', allowed_url: '' });
    assert.ok(Object.values(request.body.hsts).every(value => value === null), 'HSTS waits for the certificate at the Flip (ticket 57)');
    assert.ok(Object.values(request.body.csp_header).every(value => value === null));
    assert.equal(request.body.sitewide_https_enabled, null);
    const { plan: made } = await plan([request], settingsRoutes('storefront/security'));
    assert.equal(made.proofs[0].proved, true);
    assert.ok(made.diff.some(line => /x_frame_options_header: 1895766 .* -> \{"enabled":true,"setting":"same_origin","allowed_url":""\}/.test(line)), made.diff.join('\n'));
});

test('security applies on 1895766 alone, and reads back as planned with the nulls inherited', async () => {
    const [request] = requestsOf('1895766', 'security.json');
    const { text } = await plan([request], settingsRoutes('storefront/security'));
    const before = recorded['storefront/security']['1895766'];
    const { result, calls } = await apply(text, {
        ...settingsRoutes('storefront/security', { 1895766: [{ body: before }, { body: withData(before, { x_frame_options_header: request.body.x_frame_options_header }) }] }),
        'PUT /v3/settings/storefront/security?channel_id=1895766': { body: { data: withData(before, { x_frame_options_header: request.body.x_frame_options_header }).data, meta: {} } },
    });
    assert.equal(result.outcome, 'applied');
    assert.deepEqual(calls.filter(call => call.method === 'PUT').map(call => call.body), [request.body]);
});

test('Product Filtering\'s switch is global-only: a lifted write of it is refused before anything is written', async () => {
    const request = {
        method: 'PUT', path: '/v3/settings/storefront/search', query: { channel_id: 1895766 }, body: { product_filtering_enabled: true },
    };
    await assert.rejects(plan([request], settingsRoutes('storefront/search')), /product_filtering_enabled: BigCommerce documents product_filtering_enabled as global-only.*Shaun's approval batch/s);
});

test('CAD only and channel 1\'s logins aren\'t helper writes in either mode: they are control-panel items', () => {
    const currencies = { method: 'PUT', path: '/v3/channels/1895766/currency-assignments', body: { enabled_currencies: ['CAD'], default_currency: 'CAD' } };
    const logins = { method: 'PUT', path: '/v3/customers/settings/channels/1895766', body: { allow_global_logins: true } };
    for (const mode of ['lifted', 'approved']) {
        assert.throws(() => classify(currencies, { mode }), /never written by the helper: themes and channels/);
        assert.throws(() => classify(logins, { mode }), /never written by the helper: Customers/);
    }
});

// --- Shaun's approval batch (store-wide) --------------------------------------------------------

test('every store-wide changes file is refused as a lifted write and plans only in approved mode', () => {
    const names = changesFiles('store-wide');
    assert.deepEqual(names, ['free-shipping-promotion.json', 'product-filtering.json']);
    for (const name of names) {
        const { requests } = loadChanges('store-wide', name);
        assert.throws(() => checkRequests(requests, { mode: 'lifted', phase: unset }), error => error.name === 'Refused', name);
        assert.doesNotThrow(() => checkRequests(requests, { mode: 'approved', phase: unset }), name);
    }
});

const readFilters = recorded['search/filters'].data;
const writable = item => Object.fromEntries(Object.entries(item).filter(([key]) => !/facet/.test(key)));

test('Product Filtering: Fly Sizes first and open, 15 values by option value; Category, Price and Brand hidden; the rest as read', () => {
    const [request] = requestsOf('store-wide', 'product-filtering.json');
    assert.equal(request.path, '/v3/settings/search/filters');
    assert.equal(request.query, undefined, 'the default list takes no channel_id');
    const list = request.body;
    assert.deepEqual(list.map(item => item.id).sort(), readFilters.map(item => item.id).sort(), 'no filter added or dropped');
    const [first] = list;
    assert.equal(first.display_name, 'Fly Sizes');
    assert.equal(first.is_enabled, true);
    assert.equal(first.collapsed_by_default, false);
    assert.equal(first.items_to_show, 15, 'the most the setting allows, as a number as the store reads it');
    assert.equal(first.sort_by, 'option_values');
    for (const type of ['category', 'price', 'brand']) assert.equal(list.find(item => item.type === type).is_enabled, false, `${type} hidden`);
    const intended = {
        'Fly Sizes': ['collapsed_by_default', 'items_to_show', 'sort_by', 'is_enabled'], Category: ['is_enabled'], Brand: ['is_enabled'], Price: ['is_enabled'],
    };
    for (const item of list) {
        const read = writable(readFilters.find(old => old.id === item.id));
        assert.deepEqual(Object.keys(item).sort(), Object.keys(read).sort(), `${item.display_name} keeps the read's writable fields, and no read-only facet field`);
        const changed = Object.keys(item).filter(key => JSON.stringify(item[key]) !== JSON.stringify(read[key]));
        assert.deepEqual(changed.sort(), (intended[item.display_name] || []).filter(key => JSON.stringify(item[key]) !== JSON.stringify(read[key])).sort(), `${item.display_name} changes only what the checklist says`);
    }
});

test('Product Filtering plans in approved mode from the global read alone, with a diff Shaun reads', async () => {
    const { requests } = loadChanges('store-wide', 'product-filtering.json');
    const { plan: made } = await plan(requests, { 'GET /v3/settings/search/filters': { body: recorded['search/filters'] } }, { mode: 'approved' });
    assert.equal(made.mode, 'approved');
    assert.equal(made.channel, 'store-wide');
    assert.deepEqual(made.snapshot.reads.map(read => read.key), ['GET /v3/settings/search/filters']);
    assert.match(made.diff[0], /^1\. PUT \/v3\/settings\/search\/filters \(settings\/search\/filters settings\)$/);
    assert.match(made.diff[1], /global: .* -> /);
});

test('the free-shipping promotion is scoped to 1895766 and CAD, with ticket 13\'s wording, and waits for its ids', () => {
    const file = loadChanges('store-wide', 'free-shipping-promotion.json');
    const [request] = file.requests;
    assert.equal(request.method, 'POST');
    assert.equal(request.path, '/v3/promotions');
    const promotion = request.body;
    // An empty channels list reaches every channel, and currency '*' also discounts .com.
    assert.deepEqual(promotion.channels, [{ id: 1895766 }]);
    assert.equal(promotion.currency_code, 'CAD');
    assert.equal(promotion.redemption_type, 'AUTOMATIC');
    assert.equal(promotion.rules.length, 1);
    const [rule] = promotion.rules;
    assert.equal(rule.action.shipping.free_shipping, true);
    assert.equal(rule.condition.cart.minimum_spend, 60);
    const notice = type => promotion.notifications.find(item => item.type === type);
    assert.equal(notice('UPSELL').content, 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.');
    for (const type of ['UPSELL', 'ELIGIBLE', 'APPLIED']) assert.ok(notice(type).locations.includes('CART_PAGE'), `${type} shows on the cart`);
    assert.ok(notice('UPSELL').locations.includes('PRODUCT_PAGE'));
    const categories = rule.condition.cart.items.categories;
    const zones = rule.action.shipping.zone_ids;
    if (!categories.length || !Array.isArray(zones) || !zones.length) {
        assert.match(file._waiting, /tree-4 Fly Type ids \(refactor 13\)/, 'an unfilled promotion says what it waits for');
    } else {
        assert.equal(file._waiting, undefined, 'a filled promotion is ready to plan');
        assert.ok(categories.every(Number.isInteger) && zones.every(Number.isInteger));
    }
});
