// Tests scripts/widgets/sync.mjs (ticket 46): the requests a sync makes from the repo and a
// snapshot of the channel's widget templates, widgets and placements, the channel check on
// every request and every object read, unpublishing, and recording the uuids. No network: the
// store's side is built here, shaped as the Widgets API answers (scripts/store/fixtures/widgets.json).
//
//   node --test scripts/widgets/sync.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCalendar, phaseOn } from '../lib/release-calendar.mjs';
import { checkRequests } from '../store/plan.mjs';
import { entriesFor } from './source.mjs';
import {
    PATHS, buildRequest, planSync, recordUuids, storeChannelProblems,
} from './sync.mjs';

const CH = 1895766;
const T = 'c0ffee00-1234-4abc-8def-0123456789ab';
const W = 'd00dfeed-1234-4abc-8def-0123456789ab';
const P = 'e1e1e1e1-1234-4abc-8def-0123456789ab';
const OTHER = 'f2f2f2f2-1234-4abc-8def-0123456789ab';

// The hero as the repo has it, with uuids recorded or not. Its placement status is pinned to
// "inactive" unless a test asks for another, because activation, --unpublish and publishing again
// change the channel file's status, and these tests mustn't follow it.
const hero = (uuids = { template: null, widget: null, placement: null }, placement = {}) => {
    const [entry] = entriesFor(CH, { names: ['home-lead'] });
    return {
        ...entry,
        channelFile: {
            ...entry.channelFile, uuids, placement: { ...entry.channelFile.placement, status: 'inactive', ...placement },
        },
    };
};
const recorded = { template: T, widget: W, placement: P };

// The store's objects, in the shape the first --record after an apply read (2026-10-07): the store
// adds "_": { "id": <the widget's uuid> } to a widget_configuration, a template_engine to a
// template and an empty entity_id to a placement.
const storeTemplate = ({ widget }, over = {}) => ({
    uuid: T, name: widget.templateName, schema: widget.schema, template: widget.template, storefront_api_query: widget.query, kind: 'custom', channel_id: CH, current_version_uuid: OTHER, icon_name: 'default', template_engine: 'handlebars_v3', client_rerender: false, schema_translations: {}, ...over,
});
const storeWidget = ({ widget, channelFile }, over = {}) => ({
    uuid: W,
    name: widget.widgetName,
    description: '',
    widget_configuration: { ...channelFile.configuration, _: { id: W } },
    widget_template: {
        uuid: T, name: widget.templateName, kind: 'custom', channel_id: CH,
    },
    channel_id: CH,
    version_uuid: OTHER,
    ...over,
});
const storePlacement = ({ widget, channelFile }, over = {}) => ({
    uuid: P,
    ...channelFile.placement,
    entity_id: '',
    channel_id: CH,
    widget: { uuid: W, name: widget.widgetName, channel_id: CH },
    ...over,
});
const synced = entry => ({ templates: [storeTemplate(entry)], widgets: [storeWidget(entry)], placements: [storePlacement(entry)] });
const empty = { templates: [], widgets: [], placements: [] };

const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');
const contentFreeze = phaseOn(parseCalendar({ flip: '2027-03-01', status: 'set', source: 'ticket 10' }), '2027-02-20');

test('a request is never built without the channel, and always carries it', () => {
    assert.throws(() => buildRequest({ object: 'widgets', body: { name: 'x' } }), /no channel: every widget request names its channel_id/);
    assert.throws(() => buildRequest({ object: 'widgets', body: { name: 'x' }, channel: '1895766' }), /channel "1895766" isn't a channel id/);
    assert.throws(() => buildRequest({ object: 'widgets', body: { name: 'x' }, channel: 0 }), /isn't a channel id/);
    assert.throws(() => buildRequest({ object: 'widgets', body: { name: 'x', channel_id: 1 }, channel: CH }), /names channel 1, not 1895766/);
    assert.throws(() => buildRequest({ object: 'widgets', body: { widget_configuration: { channel_id: 1 } }, channel: CH }), /names channel 1, not 1895766/);
    assert.throws(() => buildRequest({ object: 'scripts', body: {}, channel: CH }), /"scripts" isn't a widget object/);
    assert.deepEqual(buildRequest({ object: 'widgets', body: { name: 'x' }, channel: CH }), {
        method: 'POST', path: '/v3/content/widgets', query: {}, body: { name: 'x', channel_id: CH },
    });
    assert.deepEqual(buildRequest({
        object: 'placements', id: P, body: { status: 'inactive' }, channel: CH,
    }), {
        method: 'PUT', path: `/v3/content/placements/${P}`, query: {}, body: { status: 'inactive', channel_id: CH },
    });
});

test('the first sync creates the template, the widget and the placement, each with channel_id 1895766', () => {
    const entry = hero();
    const { requests, problems, lines } = planSync({ channel: CH, entries: [entry], store: empty });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests.map(request => `${request.method} ${request.path}`), [
        `POST ${PATHS['widget-templates']}`, `POST ${PATHS.widgets}`, `POST ${PATHS.placements}`,
    ]);
    const [template, widget, placement] = requests.map(request => request.body);
    assert.deepEqual(template, {
        name: 'rf-home-lead', template: entry.widget.template, schema: entry.widget.schema, storefront_api_query: '', channel_id: CH,
    });
    assert.deepEqual(widget, {
        name: 'rf-home-lead', widget_configuration: entry.channelFile.configuration, widget_template_uuid: { $created: 0 }, channel_id: CH,
    });
    assert.deepEqual(placement, {
        widget_uuid: { $created: 1 }, template_file: 'pages/home', region: 'home_below_menu', sort_order: 0, status: 'inactive', channel_id: CH,
    });
    assert.ok(lines.some(line => /template rf-home-lead: create/.test(line)), lines.join('\n'));
    assert.ok(lines.some(line => /placement pages\/home home_below_menu: create/.test(line)), lines.join('\n'));
});

// The created placement takes the channel file's status, whichever it is (#62's rf/skeptic).
test('a first sync of a file recorded active creates the placement active', () => {
    const entry = hero(undefined, { status: 'active' });
    const { requests, problems } = planSync({ channel: CH, entries: [entry], store: empty });
    assert.deepEqual(problems, []);
    const placement = requests.find(request => request.path === PATHS.placements).body;
    assert.equal(placement.status, 'active');
});

test('every request a sync makes passes the store-write helper\'s own checks (W0-11)', () => {
    const entry = hero(recorded, { status: 'active' });
    const changed = {
        templates: [storeTemplate(entry, { template: '<p>old</p>' })],
        widgets: [storeWidget(entry, { widget_configuration: { ...entry.channelFile.configuration, heading: 'Old' } })],
        placements: [storePlacement(entry, { status: 'inactive', sort_order: 3 })],
    };
    for (const [store, current] of [[empty, hero()], [changed, entry]]) {
        const { requests } = planSync({ channel: CH, entries: [current], store });
        assert.ok(requests.length > 0);
        assert.ok(requests.every(request => request.body.channel_id === CH));
        assert.doesNotThrow(() => checkRequests(requests, { mode: 'lifted', phase: unset }));
    }
});

test('--only content creates the template and the widget, and places nothing (ticket 53 places later)', () => {
    const { requests } = planSync({
        channel: CH, entries: [hero()], store: empty, only: 'content',
    });
    assert.deepEqual(requests.map(request => request.path), [PATHS['widget-templates'], PATHS.widgets]);
});

test('--only placement places a recorded widget, and refuses one that isn\'t recorded yet', () => {
    const entry = hero({ template: T, widget: W, placement: null });
    const store = { templates: [storeTemplate(entry)], widgets: [storeWidget(entry)], placements: [] };
    const { requests, problems } = planSync({
        channel: CH, entries: [entry], store, only: 'placement',
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests, [{
        method: 'POST',
        path: PATHS.placements,
        query: {},
        body: {
            widget_uuid: W, template_file: 'pages/home', region: 'home_below_menu', sort_order: 0, status: 'inactive', channel_id: CH,
        },
    }]);
    const notYet = planSync({
        channel: CH, entries: [hero()], store: empty, only: 'placement',
    });
    assert.deepEqual(notYet.requests, []);
    assert.match(notYet.problems.join('\n'), /home-lead: the widget isn't recorded in .*channels\/1895766\.json yet/);
});

test('a channel in step with the repo needs no request', () => {
    const entry = hero(recorded);
    const { requests, problems, lines } = planSync({ channel: CH, entries: [entry], store: synced(entry) });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests, []);
    assert.equal(lines.filter(line => /no change/.test(line)).length, 3, lines.join('\n'));
});

test('the "_" the store adds to a widget_configuration isn\'t drift; any other "_" is', () => {
    const entry = hero(recorded);
    // The store's own "_": { "id": <this widget's uuid> } (storeWidget adds it, as the store did).
    assert.deepEqual(storeWidget(entry).widget_configuration._, { id: W });
    const own = planSync({ channel: CH, entries: [entry], store: synced(entry) });
    assert.deepEqual(own.requests, []);
    assert.ok(own.lines.some(line => /widget rf-home-lead \(d00dfeed\): no change/.test(line)), own.lines.join('\n'));
    const other = planSync({
        channel: CH, entries: [entry], store: { ...synced(entry), widgets: [storeWidget(entry, { widget_configuration: { ...entry.channelFile.configuration, _: { id: 'someone-else' } } })] },
    });
    assert.equal(other.requests.length, 1);
    assert.equal(other.requests[0].body.widget_configuration._, undefined, 'the update sends the repo\'s configuration, with no "_"');
    // The key the update leaves out reads as (none), not as a null it would send.
    assert.ok(other.lines.includes('     widget_configuration._: {"id":"someone-else"} -> (none)'), other.lines.join('\n'));
});

test('a recorded template the store saves with another engine stops the sync, but not an unpublish', () => {
    const entry = hero(recorded, { status: 'active' });
    for (const engine of ['handlebars_v4', undefined]) {
        const store = { ...synced(entry), templates: [storeTemplate(entry, { template_engine: engine })] };
        const { requests, problems } = planSync({ channel: CH, entries: [entry], store });
        assert.deepEqual(requests, []);
        assert.match(problems.join('\n'), new RegExp(`home-lead: template c0ffee00 on channel 1895766 is saved with template_engine ${engine === undefined ? '\\(none\\)' : `"${engine}"`}, not "handlebars_v3"`));
        const unpublish = planSync({
            channel: CH, entries: [entry], store, unpublish: 'home-lead',
        });
        assert.deepEqual(unpublish.problems, []);
        assert.equal(unpublish.requests.length, 1);
    }
});

test('an update sends only the fields that changed, with the channel', () => {
    const entry = hero(recorded, { status: 'active' });
    const store = {
        templates: [storeTemplate(entry, { template: '<p>old</p>' })],
        widgets: [storeWidget(entry, { widget_configuration: { ...entry.channelFile.configuration, heading: 'Old' } })],
        placements: [storePlacement(entry, { status: 'inactive' })],
    };
    const { requests, lines } = planSync({ channel: CH, entries: [entry], store });
    assert.deepEqual(requests, [
        {
            method: 'PUT', path: `${PATHS['widget-templates']}/${T}`, query: {}, body: { template: entry.widget.template, channel_id: CH },
        },
        {
            method: 'PUT', path: `${PATHS.widgets}/${W}`, query: {}, body: { widget_configuration: entry.channelFile.configuration, channel_id: CH },
        },
        {
            method: 'PUT', path: `${PATHS.placements}/${P}`, query: {}, body: { status: 'active', channel_id: CH },
        },
    ]);
    assert.ok(lines.some(line => /status: "inactive" -> "active"/.test(line)), lines.join('\n'));
    assert.ok(lines.some(line => /widget_configuration\.heading: "Old" -> "Hand-tied/.test(line)), lines.join('\n'));
});

test('a widget pointing at another template is pointed back at the recorded one', () => {
    const entry = hero(recorded);
    const store = synced(entry);
    store.widgets = [storeWidget(entry, { widget_template: { uuid: OTHER, channel_id: CH } })];
    const { requests } = planSync({ channel: CH, entries: [entry], store });
    assert.deepEqual(requests.map(request => request.body), [{ widget_template_uuid: T, channel_id: CH }]);
});

test('unpublishing sends only the placement\'s status, which the content freeze still allows', () => {
    const entry = hero(recorded);
    const store = {
        templates: [storeTemplate(entry, { template: '<p>old</p>' })],
        widgets: [storeWidget(entry)],
        placements: [storePlacement(entry, { status: 'active', sort_order: 4 })],
    };
    const { requests, problems } = planSync({
        channel: CH, entries: [entry], store, unpublish: 'home-lead',
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests, [{
        method: 'PUT', path: `${PATHS.placements}/${P}`, query: {}, body: { status: 'inactive', channel_id: CH },
    }]);
    assert.doesNotThrow(() => checkRequests(requests, { mode: 'lifted', phase: contentFreeze }));
    const already = planSync({
        channel: CH, entries: [entry], store: { ...store, placements: [storePlacement(entry, { status: 'inactive' })] }, unpublish: 'home-lead',
    });
    assert.deepEqual(already.requests, []);
    assert.ok(already.lines.some(line => /already inactive/.test(line)), already.lines.join('\n'));
    const unplaced = planSync({
        channel: CH, entries: [hero()], store: empty, unpublish: 'home-lead',
    });
    assert.match(unplaced.problems.join('\n'), /home-lead: no placement is recorded, so there is nothing to unpublish/);
});

test('a recorded uuid the channel doesn\'t have stops the sync', () => {
    const entry = hero(recorded);
    for (const object of ['templates', 'widgets', 'placements']) {
        const store = { ...synced(entry), [object]: [] };
        const { requests, problems } = planSync({ channel: CH, entries: [entry], store });
        assert.deepEqual(requests, []);
        assert.match(problems.join('\n'), /is recorded in .*channels\/1895766\.json, but channel 1895766 has no such/);
    }
});

test('an object the repo hasn\'t recorded but the channel already has stops the sync, so nothing is made twice', () => {
    const entry = hero();
    const twins = [
        { ...empty, templates: [storeTemplate(entry)] },
        { ...empty, widgets: [storeWidget(entry)] },
    ];
    for (const store of twins) {
        const { requests, problems } = planSync({ channel: CH, entries: [entry], store });
        assert.deepEqual(requests, []);
        assert.match(problems.join('\n'), /already has .* named rf-home-lead .*: run with --record first/);
    }
    const placed = hero({ template: T, widget: W, placement: null });
    const { problems } = planSync({ channel: CH, entries: [placed], store: synced(placed) });
    assert.match(problems.join('\n'), /already has a placement of widget d00dfeed.* in pages\/home home_below_menu .*: run with --record first/);
});

test('any object read that names another channel is a problem', () => {
    const entry = hero(recorded);
    assert.deepEqual(storeChannelProblems(synced(entry), CH), []);
    const cases = [
        { ...synced(entry), templates: [storeTemplate(entry, { channel_id: 1 })] },
        { ...synced(entry), widgets: [storeWidget(entry, { widget_template: { uuid: T, channel_id: 1855224 } })] },
        { ...synced(entry), placements: [storePlacement(entry, { widget: { uuid: W, channel_id: 1 } })] },
        { ...synced(entry), templates: [{ ...storeTemplate(entry), channel_id: undefined }] },
    ];
    for (const store of cases) assert.equal(storeChannelProblems(store, CH).length, 1, JSON.stringify(store));
    assert.match(storeChannelProblems(cases[0], CH)[0], /widget-templates c0ffee00.* names channel 1, not 1895766/);
    assert.match(storeChannelProblems(cases[3], CH)[0], /doesn't name its channel/);
});

test('--record finds the template, widget and placement the apply made, by name and by link', () => {
    const entry = hero();
    const { uuids, problems } = recordUuids({ channel: CH, entries: [entry], store: synced(entry) })[0];
    assert.deepEqual(problems, []);
    assert.deepEqual(uuids, recorded);
    const [none] = recordUuids({ channel: CH, entries: [entry], store: empty });
    assert.deepEqual(none.uuids, { template: null, widget: null, placement: null });
});

test('--record refuses two candidates, or a uuid other than the one recorded', () => {
    const entry = hero();
    const store = synced(entry);
    store.templates.push(storeTemplate(entry, { uuid: OTHER }));
    assert.match(recordUuids({ channel: CH, entries: [entry], store })[0].problems.join('\n'), /2 widget-templates named rf-home-lead/);
    const changed = hero({ template: OTHER, widget: null, placement: null });
    assert.match(recordUuids({ channel: CH, entries: [changed], store: synced(changed) })[0].problems.join('\n'), /records template f2f2f2f2.*, but the channel's is c0ffee00/);
});

// Ticket 27's follow-up: the store shows a global region's placement on its own template file's
// page alone (#62's rf/skeptic), so the strip is placed once per template file. These widgets name
// `template_files` and record `uuids.placements`, one uuid per template file.
const FILES = ['pages/home', 'pages/cart', 'pages/search'];
const P2 = 'e2e2e2e2-1234-4abc-8def-0123456789ab';
const P3 = 'e3e3e3e3-1234-4abc-8def-0123456789ab';
const several = (uuids = { template: null, widget: null, placements: {} }, placement = {}) => {
    const entry = hero();
    return {
        ...entry,
        channelFile: {
            ...entry.channelFile,
            placement: {
                template_files: FILES, region: 'header_bottom--global', sort_order: 0, status: 'active', ...placement,
            },
            uuids,
        },
    };
};
const placedOn = (templateFile, uuid, over = {}) => ({
    uuid,
    template_file: templateFile,
    region: 'header_bottom--global',
    sort_order: 0,
    status: 'active',
    entity_id: '',
    channel_id: CH,
    widget: { uuid: W, name: 'rf-home-lead', channel_id: CH },
    ...over,
});

test('a widget on several template files gets one placement on each, all with the channel', () => {
    const { requests, problems, lines } = planSync({ channel: CH, entries: [several()], store: empty });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests.slice(2).map(request => request.body), FILES.map(templateFile => ({
        widget_uuid: { $created: 1 }, template_file: templateFile, region: 'header_bottom--global', sort_order: 0, status: 'active', channel_id: CH,
    })));
    for (const templateFile of FILES) {
        assert.ok(lines.includes(`  placement ${templateFile} header_bottom--global: create`), lines.join('\n'));
    }
    assert.doesNotThrow(() => checkRequests(requests, { mode: 'lifted', phase: unset }));
});

test('a template file added to the list gets its placement; the recorded ones are left or updated', () => {
    const entry = several({ template: T, widget: W, placements: { 'pages/home': P, 'pages/cart': P2 } });
    const store = {
        templates: [storeTemplate(entry)],
        widgets: [storeWidget(entry)],
        placements: [placedOn('pages/home', P), placedOn('pages/cart', P2, { status: 'inactive' })],
    };
    const { requests, problems, lines } = planSync({ channel: CH, entries: [entry], store });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests, [
        {
            method: 'PUT', path: `${PATHS.placements}/${P2}`, query: {}, body: { status: 'active', channel_id: CH },
        },
        {
            method: 'POST',
            path: PATHS.placements,
            query: {},
            body: {
                widget_uuid: W, template_file: 'pages/search', region: 'header_bottom--global', sort_order: 0, status: 'active', channel_id: CH,
            },
        },
    ]);
    assert.ok(lines.includes('  placement pages/home header_bottom--global (e1e1e1e1): no change'), lines.join('\n'));
    const inStep = planSync({ channel: CH, entries: [entry], store: { ...store, placements: [...store.placements.slice(0, 1), placedOn('pages/cart', P2), placedOn('pages/search', P3)] } });
    assert.match(inStep.problems.join('\n'), /already has a placement of widget d00dfeed.* in pages\/search header_bottom--global \(e3e3e3e3.*\), which .* doesn't record: run with --record first/);
});

test('unpublishing a widget on several template files sets every recorded placement inactive', () => {
    const entry = several({ template: T, widget: W, placements: { 'pages/home': P, 'pages/cart': P2, 'pages/search': P3 } });
    const store = {
        templates: [storeTemplate(entry)],
        widgets: [storeWidget(entry)],
        placements: [placedOn('pages/home', P), placedOn('pages/cart', P2, { status: 'inactive' }), placedOn('pages/search', P3)],
    };
    const { requests, problems, lines } = planSync({
        channel: CH, entries: [entry], store, unpublish: 'home-lead',
    });
    assert.deepEqual(problems, []);
    assert.deepEqual(requests.map(request => `${request.method} ${request.path} ${JSON.stringify(request.body)}`), [P, P3].map(uuid => `PUT ${PATHS.placements}/${uuid} {"status":"inactive","channel_id":${CH}}`));
    assert.ok(lines.includes('  placement pages/cart header_bottom--global (e2e2e2e2): already inactive'), lines.join('\n'));
    assert.doesNotThrow(() => checkRequests(requests, { mode: 'lifted', phase: contentFreeze }));
    const partly = several({ template: T, widget: W, placements: { 'pages/home': P } });
    assert.match(planSync({
        channel: CH, entries: [partly], store, unpublish: 'home-lead',
    }).problems.join('\n'), /home-lead: no placement is recorded for pages\/cart, pages\/search: record them \(--record\) before unpublishing, so none is left on/);
});

test('--record finds each template file\'s placement and records them as a map', () => {
    const entry = several();
    const store = {
        templates: [storeTemplate(entry)],
        widgets: [storeWidget(entry)],
        placements: [placedOn('pages/home', P), placedOn('pages/cart', P2), placedOn('pages/product', OTHER)],
    };
    const [result] = recordUuids({ channel: CH, entries: [entry], store });
    assert.deepEqual(result.problems, []);
    assert.deepEqual(result.uuids, { template: T, widget: W, placements: { 'pages/home': P, 'pages/cart': P2, 'pages/search': null } });
    assert.equal(result.changed, true);
    const moved = several({ template: T, widget: W, placements: { 'pages/cart': OTHER } });
    assert.match(recordUuids({ channel: CH, entries: [moved], store })[0].problems.join('\n'), /records placement pages\/cart f2f2f2f2.*, but the channel's is e2e2e2e2/);
});
