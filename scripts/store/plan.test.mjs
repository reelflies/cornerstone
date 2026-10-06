// Tests scripts/store/plan.mjs (W0-11) on fixture responses, with no token and no network:
// refusals before any read, the snapshot, the settings proof, the diff and the plan file.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCalendar, phaseOn } from '../lib/release-calendar.mjs';
import { createClient } from './client.mjs';
import {
    PLAN_FORMAT, buildPlan, checkRequests, commandStoreHash, planDigest, writePlan,
} from './plan.mjs';
import { sha256 } from './snapshot.mjs';
import {
    FAKE_TOKEN, STORE_HASH, fixtureFetch, loadFixture,
} from './fixtures/store.mjs';

const widgets = loadFixture('widgets.json');
const content = loadFixture('content.json');
const inventory = loadFixture('settings-inventory.json');
const PLACEMENT = 'e1e1e1e1-1234-4abc-8def-0123456789ab';
const NOW = new Date('2026-10-06T20:00:00.000Z');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-store-plan-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');
const freeze = phaseOn(parseCalendar({ flip: '2027-03-01', status: 'set', source: 'ticket 10' }), '2027-02-20');

const setup = routes => {
    const calls = [];
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch(routes, { calls }), readOnly: true,
    });
    return { client, calls };
};
const plan = (requests, routes, extra = {}) => {
    const { client, calls } = setup(routes);
    const result = buildPlan({
        requests, ticket: '46', mode: 'lifted', phase: unset, client, storeHash: STORE_HASH, operator: 'rook on w0/11', now: NOW, ...extra,
    });
    return { result, calls };
};

const unpublish = { method: 'PUT', path: `/v3/content/placements/${PLACEMENT}`, body: { channel_id: 1895766, status: 'inactive' } };
const inventoryRoutes = {
    'GET /v3/settings/inventory?channel_id=1895766': { body: inventory.channel_1895766 },
    'GET /v3/settings/inventory': { body: inventory.global },
    'GET /v3/settings/inventory?channel_id=1': { body: inventory.channel_1 },
    'GET /v3/settings/inventory?channel_id=1855224': { body: inventory.channel_1855224 },
};
const labelOption = {
    method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: { option_out_of_stock_behavior: 'label_option' },
};

test('a plan reads its snapshot with GETs only, and holds the exact requests, the snapshot\'s sha256 and a diff', async () => {
    const { result, calls } = plan([unpublish], { [`GET /v3/content/placements/${PLACEMENT}`]: { body: widgets.placement_item } });
    const { plan: made, snapshot } = await result;
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.equal(made.format, PLAN_FORMAT);
    assert.equal(made.mode, 'lifted');
    assert.equal(made.channel, 1895766);
    assert.equal(made.ticket, '46');
    assert.equal(made.store_hash, STORE_HASH);
    assert.deepEqual(made.requests, [{ ...unpublish, query: {} }]);
    assert.deepEqual(made.writes, [{
        index: 0, object: 'placements', action: 'update', id: PLACEMENT,
    }]);
    assert.equal(made.snapshot.sha256, snapshot.sha256);
    assert.deepEqual(made.snapshot.reads.map(read => read.key), [`GET /v3/content/placements/${PLACEMENT}`]);
    assert.match(made.calendar, /no Flip date yet/);
    assert.deepEqual(made.diff, [
        `1. PUT /v3/content/placements/${PLACEMENT} (placements update ${PLACEMENT})`,
        '     status: "active" -> "inactive"',
    ]);
    assert.equal(made.digest, planDigest(made));
});

test('refusals come before any read, and every problem is listed at once', async () => {
    const { result, calls } = plan([
        { method: 'PUT', path: '/v3/customers', body: [] },
        { method: 'POST', path: '/v3/content/widgets', body: { name: 'no channel' } },
        { method: 'PUT', path: '/v3/settings/inventory', body: { option_out_of_stock_behavior: 'label_option' } },
        { method: 'POST', path: '/v3/content/placements', body: { channel_id: 1, widget_uuid: 'x' } },
    ], {});
    await assert.rejects(result, error => {
        assert.equal(error.name, 'Refused');
        const lines = error.message.split('\n');
        assert.match(lines[0], /^request 1: .*never written by the helper: Customers/);
        assert.match(lines[1], /^request 2: .*has no channel_id/);
        assert.match(lines[2], /^request 3: .*no channel_id in the query/);
        assert.match(lines[3], /^request 4: .*channel_id 1 isn't 1895766/);
        return true;
    });
    assert.deepEqual(calls, []);
});

test('an empty plan, or one over 50 writes, is refused', () => {
    assert.throws(() => checkRequests([], { mode: 'lifted', phase: unset }), /a plan needs 1 to 50 requests/);
    assert.throws(() => checkRequests(Array(51).fill(unpublish), { mode: 'lifted', phase: unset }), /a plan needs 1 to 50 requests/);
});

test('from T-14 a plan for a new widget is refused before any read; unpublishing still plans', async () => {
    const create = { method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766, name: 'x', widget_template_uuid: 'c0ffee00-1234-4abc-8def-0123456789ab' } };
    const refused = plan([create], {}, { phase: freeze });
    await assert.rejects(refused.result, /request 1: POST \/v3\/content\/widgets: from T-14 widgets may only be unpublished/);
    assert.deepEqual(refused.calls, []);
    const allowed = plan([unpublish], { [`GET /v3/content/placements/${PLACEMENT}`]: { body: widgets.placement_item } }, { phase: freeze });
    assert.equal((await allowed.result).plan.writes[0].action, 'update');
});

test('an update whose object belongs to another channel stops the plan', async () => {
    const { result } = plan([unpublish], { [`GET /v3/content/placements/${PLACEMENT}`]: { body: widgets.placement_item_on_channel_1 } });
    await assert.rejects(result, error => error.name === 'Stopped' && /names channel 1, not 1895766/.test(error.message));
});

test('a list that names another channel stops the plan', async () => {
    const { result } = plan([{ method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766, name: 'rf-home-lead', template: '<p>' } }], {
        'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=1': { body: widgets.templates_list_with_channel_1 },
    });
    await assert.rejects(result, /the response names channel 1/);
});

test('an update to a script that is enabled on the store is refused: enabled scripts are Shaun\'s', async () => {
    const uuid = '5c5c5c5c-1234-4abc-8def-0123456789ab';
    const update = { method: 'PUT', path: `/v3/content/scripts/${uuid}`, body: { channel_id: 1895766, html: '<script>/* v2 */</script>' } };
    const refused = plan([update], { [`GET /v3/content/scripts/${uuid}`]: { body: content.script_item_enabled } });
    await assert.rejects(refused.result, /request 1: script 5c5c5c5c-1234-4abc-8def-0123456789ab is enabled on the store: an enabled script is Shaun's to change/);
    const allowed = plan([update], { [`GET /v3/content/scripts/${uuid}`]: { body: content.script_item_disabled } });
    assert.match((await allowed.result).plan.diff[1], /html: "<script>\/\* vitals \*\/<\/script>" -> "<script>\/\* v2 \*\/<\/script>"/);
});

test('a settings write records the proof of parts 1 and 2 of ticket 21\'s test, from its own reads', async () => {
    const { result } = plan([labelOption], inventoryRoutes);
    const { plan: made } = await result;
    assert.equal(made.proofs.length, 1);
    assert.equal(made.proofs[0].index, 0);
    assert.equal(made.proofs[0].proved, true);
    assert.equal(made.proofs[0].settings, 'inventory');
    assert.deepEqual(made.snapshot.reads.map(read => read.scope), ['1895766', 'global', '1', '1855224']);
    assert.deepEqual(made.diff, [
        '1. PUT /v3/settings/inventory?channel_id=1895766 (settings/inventory settings)',
        '     option_out_of_stock_behavior: 1895766 null (inherits the global "do_nothing") -> "label_option"',
    ]);
});

test('a settings write whose override field the reads can\'t show is refused: it goes in Shaun\'s batch', async () => {
    const { option_out_of_stock_behavior: dropped, ...partial } = inventory.channel_1895766.data;
    assert.equal(dropped, null);
    const { result } = plan([labelOption], { ...inventoryRoutes, 'GET /v3/settings/inventory?channel_id=1895766': { body: { data: partial, meta: {} } } });
    await assert.rejects(result, /request 1: parts 1 and 2 of ticket 21's three-part test aren't proved for settings\/inventory \(option_out_of_stock_behavior: the channel read shows no override field for option_out_of_stock_behavior\): it goes in Shaun's approval batch instead/);
    const global = plan([labelOption], { ...inventoryRoutes, 'GET /v3/settings/inventory?channel_id=1895766': { body: inventory.global } });
    await assert.rejects(global.result, /part 1: the GET with channel_id=1895766 returned exactly the global settings/);
});

test('one settings endpoint is written once per plan, so part 3 knows what it checks', () => {
    assert.throws(() => checkRequests([labelOption, labelOption], { mode: 'lifted', phase: unset }), /request 2: settings\/inventory is already written by request 1/);
});

test('a create may take the uuid of a template or widget created earlier in the same plan', async () => {
    const template = { method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766, name: 'rf-home-lead', template: '<section></section>' } };
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
    const items = checkRequests([template, widget, placement], { mode: 'lifted', phase: unset });
    assert.equal(items.length, 3);
    const { result } = plan([template, widget, placement], {
        'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=1': { body: widgets.templates_list },
        'GET /v3/content/widgets?channel_id:in=1895766&limit=250&page=1': { body: widgets.widgets_list },
        'GET /v3/content/placements?channel_id:in=1895766&limit=250&page=1': { body: widgets.placements_list },
    });
    const { plan: made } = await result;
    assert.match(made.diff.join('\n'), /widget_template_uuid: the uuid request 1 creates/);
    assert.match(made.diff.join('\n'), /widget_uuid: the uuid request 2 creates/);
});

test('a reference must point back to the right kind of create, and only where an id is taken', () => {
    const template = { method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766, name: 't' } };
    const check = requests => () => checkRequests(requests, { mode: 'lifted', phase: unset });
    assert.throws(check([{ method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766, widget_template_uuid: { $created: 0 } } }]), /request 1: widget_template_uuid refers to request 1, which isn't an earlier create/);
    assert.throws(check([template, { method: 'POST', path: '/v3/content/placements', body: { channel_id: 1895766, widget_uuid: { $created: 0 } } }]), /request 2: widget_uuid must refer to a widgets create, and request 1 creates widget-templates/);
    assert.throws(check([template, { method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766, name: { $created: 0 } } }]), /request 2: a \{"\$created": n\} reference may only be widget_template_uuid or widget_uuid, not name/);
});

test('a create warns when the channel already has one of the same name', async () => {
    const { result } = plan([{ method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766, name: 'rf-shipping-strip', template: '<p>' } }], {
        'GET /v3/content/widget-templates?channel_id:in=1895766&limit=250&page=1': { body: widgets.templates_list },
    });
    const { plan: made } = await result;
    assert.match(made.diff[1], /\+ new widget-templates "rf-shipping-strip"/);
    assert.match(made.diff[2], /! 1895766 already has a widget-templates named "rf-shipping-strip" \(6f1c7a2e-0d8b-4b1a-9a43-1e2f3a4b5c6d\)/);
});

test('a template association upsert shows each entity\'s template before and after', async () => {
    const { result } = plan([{
        method: 'PUT',
        path: '/v3/storefront/custom-template-associations',
        body: [{
            channel_id: 1895766, entity_type: 'category', entity_id: 77, file_name: 'rf-noindex.html',
        }, {
            channel_id: 1895766, entity_type: 'page', entity_id: 43, file_name: 'hook-size-chart.html',
        }],
    }], { 'GET /v3/storefront/custom-template-associations?channel_id=1895766&limit=250&page=1': { body: content.associations_list } });
    const { plan: made } = await result;
    assert.deepEqual(made.diff.slice(1), [
        '     category 77: "category.html" -> "rf-noindex.html"',
        '     page 43: (none) -> "hook-size-chart.html"',
    ]);
});

test('an approved plan is store-wide, and its diff shows the global value and the three channels', async () => {
    const { result } = plan([{ method: 'PUT', path: '/v3/settings/inventory', body: { option_out_of_stock_behavior: 'label_option' } }], inventoryRoutes, { mode: 'approved' });
    const { plan: made } = await result;
    assert.equal(made.mode, 'approved');
    assert.equal(made.channel, 'store-wide');
    assert.deepEqual(made.proofs, []);
    assert.equal(made.diff[1], '     option_out_of_stock_behavior: global "do_nothing" -> "label_option" (channel 1: inherits; 1855224: inherits; 1895766: inherits)');
});

test('long values and credential-like settings are shortened or hidden in the diff', async () => {
    const page = { method: 'PUT', path: '/v3/content/pages/42', body: { channel_id: 1895766, body: `<p>${'x'.repeat(300)}</p>`, meta_title: 'Shipping' } };
    const { result } = plan([page], { 'GET /v3/content/pages/42': { body: content.page_item } });
    const { plan: made } = await result;
    assert.match(made.diff[1], /body: "<p>Draft<\/p>" -> "<p>x{50,}…" \(307 characters, sha256 [0-9a-f]{8}\)/);
    assert.match(made.diff[2], /meta_title: "" -> "Shipping"/);
});

test('the plan file goes to <root>/plans/, never over another, and its sha256 is the one Shaun types', async () => {
    const { result } = plan([unpublish], { [`GET /v3/content/placements/${PLACEMENT}`]: { body: widgets.placement_item } });
    const { plan: made } = await result;
    const written = writePlan(tmp, made, { now: NOW });
    assert.equal(path.relative(tmp, written.file), path.join('plans', '2026-10-06T20-00-00.000Z-46.json'));
    const text = fs.readFileSync(written.file, 'utf8');
    assert.equal(written.sha256, sha256(text));
    assert.deepEqual(JSON.parse(text), made);
    assert.throws(() => writePlan(tmp, made, { now: NOW }), /EEXIST/);
});

test('the store hash comes from RF_BC_STORE_HASH, or from the store URL alone, never from the token file', async () => {
    assert.equal(await commandStoreHash({ RF_BC_STORE_HASH: STORE_HASH }), STORE_HASH);
    await assert.rejects(commandStoreHash({}, path.join(tmp, 'missing.json')), /can't read the store URL from .*missing\.json \(ENOENT\): run `npx stencil init`, or set RF_BC_STORE_HASH/);
    const noUrl = path.join(tmp, 'config.stencil.json');
    fs.writeFileSync(noUrl, JSON.stringify({ port: 3000 }));
    await assert.rejects(commandStoreHash({}, noUrl), /has no normalStoreUrl/);
    const source = fs.readFileSync(new URL('./plan.mjs', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /secrets\.stencil\.json'/, 'the helper never opens the Stencil-CLI token file');
});

test('a request field with a typo is refused, not dropped', () => {
    assert.throws(() => checkRequests([{ ...labelOption, qurey: { channel_id: 1895766 } }], { mode: 'lifted', phase: unset }), /request 1: PUT \/v3\/settings\/inventory: unknown field "qurey"/);
});

test('an approved plan takes no {"$created": n} references', () => {
    const promotion = { method: 'POST', path: '/v3/promotions', body: { name: 'x' } };
    assert.throws(() => checkRequests([promotion, { method: 'PUT', path: '/v3/promotions/12', body: { widget_uuid: { $created: 0 } } }], { mode: 'approved', phase: unset }), /request 2: widget_uuid must refer to a widgets create/);
});

test('the digest covers the whole plan, the diff a reviewer reads included', async () => {
    const { result } = plan([unpublish], { [`GET /v3/content/placements/${PLACEMENT}`]: { body: widgets.placement_item } });
    const { plan: made } = await result;
    const edits = [
        { ...made, diff: [made.diff[0], '     (no change)'] },
        { ...made, created: '2026-01-01T00:00:00.000Z' },
        { ...made, writes: [{ ...made.writes[0], id: 'x' }] },
    ];
    for (const edited of edits) assert.notEqual(planDigest(edited), made.digest);
});
