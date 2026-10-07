// Tests the widget sync command, scripts/widgets-sync.mjs (ticket 46), end to end on fixture
// responses: no token, no network and no store write. The store's answers come from
// scripts/widgets/fixtures/, through the store helper's fixture fetch (RF_STORE_FIXTURES), and
// the snapshots and changes files go to a scratch store root (RF_STORE_ROOT). Both seams work
// only under node --test.
//
//   node --test scripts/widgets-sync.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCalendar, phaseOn } from './lib/release-calendar.mjs';
import { checkRequests, readChanges } from './store/plan.mjs';
import { FAKE_TOKEN, STORE_HASH } from './store/fixtures/store.mjs';
import { USAGE, main, parseArgs } from './widgets-sync.mjs';
import { readChannelFile, readWidget } from './widgets/source.mjs';
import * as FIXTURES from './widgets/fixtures/widgets-api.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widgets-sync-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const CH = 1895766;
const T = 'c0ffee00-1234-4abc-8def-0123456789ab';
const W = 'd00dfeed-1234-4abc-8def-0123456789ab';
const P = 'e1e1e1e1-1234-4abc-8def-0123456789ab';
const unset = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10' }), '2026-10-06');

const LIST = {
    templates: '/v3/content/widget-templates',
    widgets: '/v3/content/widgets',
    placements: '/v3/content/placements',
};
const listKey = object => `GET ${LIST[object]}?channel_id:in=${CH}&limit=250&page=1`;
const routesFor = ({ templates, widgets, placements }) => ({
    [listKey('templates')]: { body: templates },
    [listKey('widgets')]: { body: widgets },
    [listKey('placements')]: { body: placements },
});

// A scratch widgets folder holding a copy of the hero as it was before its first apply (no uuids
// recorded; the real file records the store's since 2026-10-07), so a test can edit its channel file.
function copyHero() {
    const root = fs.mkdtempSync(path.join(tmp, 'widgets-'));
    fs.cpSync(path.resolve('widgets/home-lead'), path.join(root, 'home-lead'), { recursive: true });
    const file = path.join(root, 'home-lead', 'channels', '1895766.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, `${JSON.stringify({ ...data, uuids: { template: null, widget: null, placement: null } }, null, 4)}\n`);
    return root;
}

// Runs the command in-process, with the test seams in its environment. Returns its exit code,
// what it printed, every request the fixture fetch answered, and the scratch store root.
async function run(args, { routes = routesFor(FIXTURES.empty), widgetsRoot = copyHero() } = {}) {
    const root = fs.mkdtempSync(path.join(tmp, 'store-'));
    const routeFile = path.join(root, 'routes.json');
    fs.writeFileSync(routeFile, JSON.stringify(routes));
    const out = [];
    const code = await main(args, {
        env: {
            NODE_TEST_CONTEXT: process.env.NODE_TEST_CONTEXT || 'child-v8',
            RF_STORE_ROOT: root,
            RF_STORE_FIXTURES: routeFile,
            RF_BC_READ_TOKEN: FAKE_TOKEN,
            RF_BC_STORE_HASH: STORE_HASH,
            RF_OPERATOR: 'test',
        },
        widgetsRoot,
        say: line => out.push(line),
        now: new Date('2026-10-06T21:00:00.000Z'),
    });
    const callsFile = path.join(root, 'fixture-calls.jsonl');
    const calls = fs.existsSync(callsFile) ? fs.readFileSync(callsFile, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : [];
    return {
        code, text: out.join('\n'), calls, root, widgetsRoot,
    };
}

const changesFiles = root => {
    const dir = path.join(root, 'changes');
    return fs.existsSync(dir) ? fs.readdirSync(dir).map(name => path.join(dir, name)) : [];
};

test('it refuses to run without a channel id, and takes no default', async () => {
    assert.throws(() => parseArgs(['--ticket', '46']), /--channel is required: one channel id per run, with no default/);
    assert.throws(() => parseArgs(['--channel']), /--channel needs a channel id/);
    const { code, text, calls } = await run(['--ticket', '46']);
    assert.equal(code, 2);
    assert.match(text, /--channel is required/);
    assert.ok(text.includes(USAGE));
    assert.deepEqual(calls, [], 'nothing was read');
});

test('it takes one channel per run, and only ReelFlies_CA until ticket 53 adds channel 1', () => {
    assert.throws(() => parseArgs(['--channel', '1895766,1', '--ticket', '46']), /one channel id per run/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--channel', '1895766', '--ticket', '46']), /--channel is given twice/);
    assert.throws(() => parseArgs(['--channel', 'all', '--ticket', '46']), /one channel id per run/);
    assert.throws(() => parseArgs(['--channel', '1', '--ticket', '46']), /channel 1 isn't a sync target \(1895766\): ticket 53 adds channel 1/);
    assert.throws(() => parseArgs(['--channel', '1855224', '--ticket', '46']), /isn't a sync target/);
    assert.deepEqual(parseArgs(['--channel', '1895766', '--ticket', '46']), {
        channel: CH, ticket: '46', widgets: [], only: 'all', unpublish: null, record: false, verify: false,
    });
});

test('its options are checked before anything is read', () => {
    assert.throws(() => parseArgs(['--channel', '1895766']), /--ticket is required/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--ticket', '46', '--only', 'widgets']), /--only takes content or placement/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--ticket', '46', '--only', 'content', '--unpublish', 'home-lead']), /--unpublish can't be combined with --only/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--record', '--unpublish', 'home-lead']), /--record only reads/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--ticket', '46', '--apply']), /unknown argument --apply/);
    assert.deepEqual(parseArgs(['--channel', '1895766', '--record']).record, true);
    assert.deepEqual(parseArgs(['--channel', '1895766', '--verify']).verify, true, '--verify only reads, so it takes no --ticket');
    assert.throws(() => parseArgs(['--channel', '1895766', '--verify', '--record']), /--verify only reads/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--verify', '--only', 'content']), /--verify only reads/);
    assert.throws(() => parseArgs(['--channel', '1895766', '--verify', '--unpublish', 'home-lead']), /--verify only reads/);
    assert.deepEqual(parseArgs(['--channel', '1895766', '--ticket', '47', '--widget', 'home-lead', '--widget', 'home-tiles']).widgets, ['home-lead', 'home-tiles']);
});

test('a dry run reads the channel with GETs only, prints the snapshot and the diff, and writes a changes file the store helper accepts', async () => {
    const {
        code, text, calls, root,
    } = await run(['--channel', '1895766', '--ticket', '46']);
    assert.equal(code, 0, text);
    assert.deepEqual(calls.map(call => `${call.method} ${call.path}`).sort(), [listKey('placements'), listKey('templates'), listKey('widgets')].sort());
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.match(text, /snapshot .*1895766\/widget-templates\/2026-10-06T21-00-00\.000Z-widgets-sync\.json/);
    assert.match(text, /widget-templates: 0 on channel 1895766/);
    assert.match(text, /template rf-home-lead: create/);
    assert.match(text, /Nothing was written to the store/);
    const [file] = changesFiles(root);
    assert.ok(file, text);
    assert.match(text, new RegExp(`Next: .*scripts/store/plan\\.mjs --ticket 46 --changes ${file.replace(/[.]/g, '\\.')}`));
    const requests = readChanges(file, { root });
    assert.equal(requests.length, 3);
    assert.ok(requests.every(request => request.body.channel_id === CH));
    assert.doesNotThrow(() => checkRequests(requests, { mode: 'lifted', phase: unset }));
    assert.ok(!text.includes(FAKE_TOKEN));
});

test('a channel in step with the repo writes no changes file', async () => {
    const widgetsRoot = copyHero();
    const widget = readWidget('home-lead', { root: widgetsRoot });
    const channelFile = readChannelFile(widget, CH);
    const file = JSON.parse(fs.readFileSync(channelFile.file, 'utf8'));
    fs.writeFileSync(channelFile.file, JSON.stringify({ ...file, uuids: { template: T, widget: W, placement: P } }));
    const routes = routesFor(FIXTURES.placed(widget, channelFile.configuration, file.placement));
    const { code, text, root } = await run(['--channel', '1895766', '--ticket', '46'], { routes, widgetsRoot });
    assert.equal(code, 0, text);
    assert.match(text, /in step with the repo: nothing to write/);
    assert.deepEqual(changesFiles(root), []);
});

test('it stops when a response names another channel, and writes no changes file', async () => {
    const routes = routesFor({ ...FIXTURES.empty, templates: FIXTURES.templatesWithChannel1 });
    const { code, text, root } = await run(['--channel', '1895766', '--ticket', '46'], { routes });
    assert.equal(code, 1);
    assert.match(text, /STOP .*names channel 1, not 1895766/);
    assert.deepEqual(changesFiles(root), []);
});

test('it stops when the store refuses a read', async () => {
    const routes = { ...routesFor(FIXTURES.empty), [listKey('widgets')]: { status: 403, body: { status: 403, title: 'You don\'t have a required scope to access the endpoint' } } };
    const { code, text } = await run(['--channel', '1895766', '--ticket', '46'], { routes });
    assert.equal(code, 1);
    assert.match(text, /STOP .*widgets.* answered 403/);
});

test('--record writes the uuids the apply made into the channel file', async () => {
    const widgetsRoot = copyHero();
    const widget = readWidget('home-lead', { root: widgetsRoot });
    const channelFile = readChannelFile(widget, CH);
    const routes = routesFor(FIXTURES.placed(widget, channelFile.configuration, channelFile.placement));
    const { code, text, calls } = await run(['--channel', '1895766', '--record'], { routes, widgetsRoot });
    assert.equal(code, 0, text);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.deepEqual(readChannelFile(widget, CH).uuids, { template: T, widget: W, placement: P });
    assert.match(text, /recorded .*home-lead\/channels\/1895766\.json/);
});

test('--unpublish sets the placement inactive in the channel file and plans only that', async () => {
    const widgetsRoot = copyHero();
    const widget = readWidget('home-lead', { root: widgetsRoot });
    const channelFile = readChannelFile(widget, CH);
    const file = JSON.parse(fs.readFileSync(channelFile.file, 'utf8'));
    fs.writeFileSync(channelFile.file, JSON.stringify({ ...file, placement: { ...file.placement, status: 'active' }, uuids: { template: T, widget: W, placement: P } }));
    const routes = routesFor(FIXTURES.placed(widget, channelFile.configuration, { ...file.placement, status: 'active' }));
    const { code, text, root } = await run(['--channel', '1895766', '--ticket', '57', '--unpublish', 'home-lead'], { routes, widgetsRoot });
    assert.equal(code, 0, text);
    assert.equal(readChannelFile(widget, CH).placement.status, 'inactive');
    const [changes] = changesFiles(root);
    assert.deepEqual(readChanges(changes, { root }), [{
        method: 'PUT', path: `/v3/content/placements/${P}`, query: {}, body: { status: 'inactive', channel_id: CH },
    }]);
});

// The hero as recorded on the channel (uuids set), with its placement at `fileStatus` in the
// repo and `storeStatus` on the store.
function recordedHero({ fileStatus, storeStatus }) {
    const widgetsRoot = copyHero();
    const widget = readWidget('home-lead', { root: widgetsRoot });
    const channelFile = readChannelFile(widget, CH);
    const file = JSON.parse(fs.readFileSync(channelFile.file, 'utf8'));
    fs.writeFileSync(channelFile.file, JSON.stringify({ ...file, placement: { ...file.placement, status: fileStatus }, uuids: { template: T, widget: W, placement: P } }));
    const routes = routesFor(FIXTURES.placed(widget, channelFile.configuration, { ...file.placement, status: storeStatus }));
    return { widgetsRoot, routes };
}

test('--verify passes when the channel holds what the repo records, reading with GETs only', async () => {
    const { widgetsRoot, routes } = recordedHero({ fileStatus: 'active', storeStatus: 'active' });
    const {
        code, text, calls, root,
    } = await run(['--channel', '1895766', '--verify'], { routes, widgetsRoot });
    assert.equal(code, 0, text);
    assert.ok(calls.every(call => call.method === 'GET'));
    assert.match(text, /Channel 1895766 is in step with the repo/);
    assert.deepEqual(changesFiles(root), []);
});

test('--verify fails, naming each difference, when the store and the repo disagree, and writes nothing', async () => {
    const { widgetsRoot, routes } = recordedHero({ fileStatus: 'inactive', storeStatus: 'active' });
    const before = fs.readFileSync(path.join(widgetsRoot, 'home-lead', 'channels', '1895766.json'), 'utf8');
    const { code, text, root } = await run(['--channel', '1895766', '--verify'], { routes, widgetsRoot });
    assert.equal(code, 1, text);
    assert.match(text, /placement pages\/home home_below_menu \(e1e1e1e1\): update/);
    assert.match(text, /status: "active" -> "inactive"/);
    assert.match(text, /NOT IN STEP +channel 1895766 differs from the repo: 1 request would close it/);
    assert.deepEqual(changesFiles(root), [], 'no changes file');
    assert.equal(fs.readFileSync(path.join(widgetsRoot, 'home-lead', 'channels', '1895766.json'), 'utf8'), before, 'the channel file is left as it was');
});

test('--verify fails on a channel the hero was never applied to', async () => {
    const { code, text, root } = await run(['--channel', '1895766', '--verify']);
    assert.equal(code, 1, text);
    assert.match(text, /template rf-home-lead: create/);
    assert.match(text, /NOT IN STEP +channel 1895766 differs from the repo: 3 requests would close it/);
    assert.deepEqual(changesFiles(root), []);
});
