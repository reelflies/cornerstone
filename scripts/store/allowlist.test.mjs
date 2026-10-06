// Tests scripts/store/allowlist.mjs (W0-11): what the helper may write, in which mode, and what
// the release calendar refuses from T-14.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, phaseOn } from '../lib/release-calendar.mjs';
import {
    CHANNEL_SETTINGS, ENTITIES, calendarRefusal, classify, isUnpublish,
} from './allowlist.mjs';

const UUID = '2dfeb50e-5f8c-4df2-8525-a338091eed32';
const lifted = request => classify(request, { mode: 'lifted' });
const approved = request => classify(request, { mode: 'approved' });
const refusedWith = (fn, pattern) => assert.throws(fn, error => error.name === 'Refused' && pattern.test(error.message));

test('lifted now: widget templates, widgets and placements, created or updated', () => {
    for (const object of ['widget-templates', 'widgets', 'placements']) {
        const base = `/v3/content/${object}`;
        assert.deepEqual(
            { ...lifted({ method: 'POST', path: base, body: { channel_id: 1895766 } }), entity: undefined },
            {
                object, kind: 'widget', action: 'create', id: null, entity: undefined,
            },
        );
        const update = lifted({ method: 'PUT', path: `${base}/${UUID}`, body: { channel_id: 1895766 } });
        assert.equal(update.action, 'update');
        assert.equal(update.id, UUID);
        assert.equal(update.entity, ENTITIES[object]);
    }
});

test('lifted by decision 4: Web Pages, Script Manager scripts and custom template associations', () => {
    assert.equal(lifted({ method: 'POST', path: '/v3/content/pages', body: [{ channel_id: 1895766 }] }).kind, 'page');
    assert.equal(lifted({ method: 'PUT', path: '/v3/content/pages/42', body: { channel_id: 1895766 } }).id, '42');
    assert.equal(lifted({ method: 'POST', path: '/v3/content/scripts', body: { channel_id: 1895766, enabled: false } }).kind, 'script');
    const association = lifted({
        method: 'PUT',
        path: '/v3/storefront/custom-template-associations',
        body: [{
            channel_id: 1895766, entity_type: 'category', entity_id: 77, file_name: 'rf-noindex.html',
        }],
    });
    assert.equal(association.kind, 'template-association');
    assert.equal(association.action, 'upsert');
});

test('lifted: the channel settings that may pass ticket 21\'s test, with the fields BigCommerce keeps global', () => {
    const result = lifted({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: { option_out_of_stock_behavior: 'label_option' },
    });
    assert.deepEqual([result.kind, result.action, result.settingsPath], ['settings', 'settings', 'inventory']);
    assert.deepEqual(CHANNEL_SETTINGS['storefront/search'].globalOnly, ['product_filtering_enabled']);
    assert.deepEqual(CHANNEL_SETTINGS['store/profile'].globalOnly, ['store_address_type', 'store_country']);
});

test('never: Customers, Orders, the catalogue, promotions, theme activation or deletion, the storefront status', () => {
    const cases = [
        ['PUT', '/v3/customers', /Customers/],
        ['POST', '/v2/customers/5/addresses', /Customers/],
        ['PUT', '/v2/orders/100', /Orders/],
        ['POST', '/v3/orders/100/shipments', /Orders/],
        ['PUT', '/v3/catalog/products', /the catalogue/],
        ['POST', '/v3/catalog/trees/categories', /the catalogue/],
        ['PUT', '/v2/products/1', /the catalogue/],
        ['PUT', '/v3/settings/catalog', /the catalogue/],
        ['POST', '/v3/promotions', /promotions/],
        ['PUT', '/v2/coupons/3', /promotions/],
        ['POST', '/v3/themes/actions/activate', /themes/],
        ['POST', '/v3/themes', /themes/],
        ['PUT', '/v3/channels/1895766/active-theme', /channels/],
        ['PUT', '/v3/settings/storefront/status', /storefront's status/],
    ];
    for (const [method, path, what] of cases) {
        refusedWith(() => lifted({ method, path, body: {} }), new RegExp(`never.*${what.source}`));
    }
    // The never list wins in approved mode too, except for promotions.
    refusedWith(() => approved({ method: 'POST', path: '/v3/themes/actions/activate', body: {} }), /never/);
    refusedWith(() => approved({ method: 'PUT', path: '/v3/catalog/products/1', body: {} }), /never.*the catalogue/);
    // Case doesn't get round it.
    refusedWith(() => lifted({ method: 'PUT', path: '/V3/Customers', body: {} }), /never.*Customers|lower-case/);
});

test('anything not on the allowlist is refused, so the list is deny-by-default', () => {
    refusedWith(() => lifted({
        method: 'PUT', path: '/v3/settings/analytics/1', query: { channel_id: 1895766 }, body: { enabled: true },
    }), /isn't on the allowlist/);
    refusedWith(() => lifted({ method: 'POST', path: '/v3/content/widget-templates/extra/x', body: {} }), /isn't on the allowlist/);
    refusedWith(() => lifted({ method: 'PUT', path: '/v3/content/regions', body: {} }), /isn't on the allowlist/);
});

test('a plan holds writes only, and DELETE and PATCH aren\'t on the allowlist', () => {
    refusedWith(() => lifted({ method: 'GET', path: '/v3/content/widgets' }), /a plan holds writes \(POST or PUT\) only/);
    refusedWith(() => lifted({ method: 'DELETE', path: `/v3/content/placements/${UUID}` }), /DELETE isn't on the allowlist/);
    refusedWith(() => lifted({ method: 'PATCH', path: '/v3/content/widgets', body: {} }), /PATCH isn't on the allowlist/);
    refusedWith(() => lifted({ method: 'POST', path: `/v3/content/widgets/${UUID}`, body: {} }), /POST .* isn't on the allowlist: an update is PUT/);
    refusedWith(() => lifted({ method: 'PUT', path: '/v3/content/widgets', body: {} }), /PUT .* isn't on the allowlist: a create is POST/);
});

test('paths that climb, encode, repeat slashes or carry a query are refused', () => {
    for (const path of ['/v3/content/widgets/../../customers', '/v3/content//widgets', '/v3/content/widgets?channel_id=1', '/v3/content/%77idgets', 'v3/content/widgets', '/v3/content/widgets/', '/v3/content/widgets#x']) {
        refusedWith(() => lifted({ method: 'POST', path, body: {} }), /isn't a plain API path/);
    }
});

test('scripts are created disabled, and an update never enables one', () => {
    refusedWith(() => lifted({ method: 'POST', path: '/v3/content/scripts', body: { channel_id: 1895766 } }), /created disabled: "enabled": false/);
    refusedWith(() => lifted({ method: 'POST', path: '/v3/content/scripts', body: { channel_id: 1895766, enabled: true } }), /created disabled/);
    refusedWith(() => lifted({ method: 'PUT', path: `/v3/content/scripts/${UUID}`, body: { channel_id: 1895766, enabled: true } }), /enabling a script is Shaun's/);
    assert.equal(lifted({ method: 'PUT', path: `/v3/content/scripts/${UUID}`, body: { channel_id: 1895766, name: 'x' } }).action, 'update');
});

test('bodies have the shape each endpoint takes', () => {
    refusedWith(() => lifted({ method: 'POST', path: '/v3/content/widgets', body: [] }), /needs a JSON object body/);
    refusedWith(() => lifted({ method: 'PUT', path: '/v3/storefront/custom-template-associations', body: {} }), /a non-empty array/);
    refusedWith(() => lifted({
        method: 'PUT',
        path: '/v3/storefront/custom-template-associations',
        body: [{
            channel_id: 1895766, entity_type: 'customer', entity_id: 1, file_name: 'x.html',
        }],
    }), /entity_type "customer" isn't product, category, brand or page/);
    refusedWith(() => lifted({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: {},
    }), /at least one setting/);
    refusedWith(() => lifted({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: { channel_id: 1895766, x: 1 },
    }), /channel_id goes in the query/);
    refusedWith(() => lifted({
        method: 'POST', path: '/v3/content/widgets', query: { channel_id: 1895766 }, body: { channel_id: 1895766 },
    }), /takes no query/);
});

test('approved mode covers store-wide settings and promotions, and nothing lifted', () => {
    const settings = approved({ method: 'PUT', path: '/v3/settings/inventory', body: { option_out_of_stock_behavior: 'label_option' } });
    assert.deepEqual([settings.kind, settings.settingsPath], ['settings', 'inventory']);
    assert.equal(approved({ method: 'PUT', path: '/v3/settings/search/filters', body: [{ type: 'product', display_name: 'Fly Sizes' }] }).settingsPath, 'search/filters');
    assert.equal(approved({ method: 'POST', path: '/v3/promotions', body: { name: 'Free shipping on flies' } }).kind, 'promotion');
    assert.equal(approved({ method: 'PUT', path: '/v3/promotions/12', body: { status: 'DISABLED' } }).id, '12');
    refusedWith(() => approved({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1 }, body: { a: 1 },
    }), /store-wide: no query/);
    refusedWith(() => approved({ method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766 } }), /approved mode covers store-wide settings and promotions only/);
    refusedWith(() => classify({ method: 'POST', path: '/v3/content/widgets', body: {} }, { mode: 'other' }), /mode/);
});

// --- The release calendar (W0-13): from T-14, widgets may only be unpublished ---------------

const FLIP = '2027-03-01';
const calendar = parseCalendar({ flip: FLIP, status: 'set', source: 'ticket 10 comment' });
const before = phaseOn(calendar, '2027-02-14'); // T-21
const freeze = phaseOn(calendar, '2027-02-15'); // T-14
const after = phaseOn(calendar, '2027-03-05'); // T-0

const unpublish = { method: 'PUT', path: `/v3/content/placements/${UUID}`, body: { channel_id: 1895766, status: 'inactive' } };
const widgetWrites = [
    { method: 'POST', path: '/v3/content/widget-templates', body: { channel_id: 1895766 } },
    { method: 'PUT', path: `/v3/content/widget-templates/${UUID}`, body: { channel_id: 1895766, template: '<p>' } },
    { method: 'POST', path: '/v3/content/widgets', body: { channel_id: 1895766 } },
    { method: 'PUT', path: `/v3/content/widgets/${UUID}`, body: { channel_id: 1895766, widget_configuration: {} } },
    { method: 'POST', path: '/v3/content/placements', body: { channel_id: 1895766, status: 'inactive' } },
    { method: 'PUT', path: `/v3/content/placements/${UUID}`, body: { channel_id: 1895766, status: 'active' } },
    { method: 'PUT', path: `/v3/content/placements/${UUID}`, body: { channel_id: 1895766, status: 'inactive', sort_order: 3 } },
];

test('before T-14 the calendar refuses no widget write', () => {
    for (const request of [...widgetWrites, unpublish]) assert.equal(calendarRefusal(lifted(request), request, before), null);
});

test('from T-14, and after the Flip, new widgets, placements and widget content edits are refused; unpublishing is not', () => {
    for (const phase of [freeze, after]) {
        for (const request of widgetWrites) {
            const reason = calendarRefusal(lifted(request), request, phase);
            assert.match(reason, /from T-14 widgets may only be unpublished \(ticket 57\)/, JSON.stringify(request));
            assert.match(reason, new RegExp(`Release calendar: Flip ${FLIP}`));
        }
        assert.equal(calendarRefusal(lifted(unpublish), unpublish, phase), null);
        assert.ok(isUnpublish(lifted(unpublish), unpublish));
    }
});

test('the freeze names widgets only: pages, scripts, associations and settings follow their own rules', () => {
    const page = { method: 'PUT', path: '/v3/content/pages/42', body: { channel_id: 1895766, body: '<p>x</p>' } };
    assert.equal(calendarRefusal(lifted(page), page, freeze), null);
});
