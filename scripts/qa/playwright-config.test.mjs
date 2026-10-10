// The Playwright config for the storefront gates (scripts/qa/playwright.config.mjs):
//
// - A prelaunch run with the preview cookie writes no trace, because a trace records every
//   request's headers, the Cookie header too, into scripts/qa/results/.
// - A plain run never writes a missing screenshot baseline; only --update-snapshots does.
// - With QA_FRESH_SERVER=1 (release.sh) the webServer never reuses a running server, and the
//   config refuses to load while anything answers on QA_PORT or QA_PORT + 1.
// - It reads QA_PORT as storefront.mjs does: the webServer starts on it, and the tests talk to
//   the stencil server on the next port (W0-7).
// - The runner holds the port pair's lock, and a stencil start slot when it starts a server,
//   until it exits; a worker takes neither.
// - W0-8's render modes: every stencil start merges the committed custom layouts into
//   config.stencil.json first. An overlay run starts its own stencil start in its throwaway
//   worktree, on QA_PORT + 10, and is refused with QA_FRESH_SERVER=1, on QA_BASE_URL, and for
//   an overlay that isn't in scripts/qa/overlays/ or changes a setting config.json doesn't have.
//   A plain run's stencil start runs in this checkout whatever RF_QA_THEME_DIR the shell has.
//
//   node --test scripts/qa/playwright-config.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS } from './storefront.mjs';

const CONFIG = pathToFileURL(path.resolve('scripts/qa/playwright.config.mjs')).href;

// Each case's locks go in a folder of its own, never ~/reelflies/theme/.locks.
const roots = [];
after(() => roots.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const tempRoot = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-config-locks-'));
    roots.push(dir);
    return dir;
};

// The config reads its environment once, when it loads, so each case loads it afresh and
// prints `expression` of it.
function load(env, expression) {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_') && !name.startsWith('RF_QA_')));
    return spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(${expression}));`,
    ], { encoding: 'utf8', env: { ...clean, RF_LOCK_ROOT: tempRoot(), ...env } });
}
function setting(env, expression) {
    const { status, stdout, stderr } = load(env, expression);
    assert.equal(status, 0, stderr);
    return JSON.parse(stdout.trim().split('\n').pop());
}
const traceSetting = env => setting(env, 'config.use.trace');

it('keeps no trace on a prelaunch run that sends the preview cookie', () => {
    assert.equal(traceSetting({ QA_BASE_URL: 'https://prelaunch.example', QA_PREVIEW_COOKIE: 'SHOP_SESSION_TOKEN=secret-value' }), 'off');
});

it('keeps the trace of a failed test on a local run, which sends no cookie', () => {
    assert.equal(traceSetting({}), 'retain-on-failure');
});

it('keeps the trace of a failed test on another host when no cookie is given', () => {
    assert.equal(traceSetting({ QA_BASE_URL: 'https://prelaunch.example' }), 'retain-on-failure');
});

it('sends the Accept-Language header stencil start needs, from storefront.mjs', () => {
    assert.deepEqual(setting({}, 'config.use.extraHTTPHeaders'), HEADERS);
});

it('never writes a missing baseline on a plain run', () => {
    assert.equal(setting({}, 'config.updateSnapshots'), 'none');
});

it('adds a JSON report only where RF_QA_JSON_REPORT names, for the switch matrix, and keeps its own reporters', () => {
    assert.deepEqual(setting({}, 'config.reporter.map(([name]) => name)'), ['list', 'html', './review/manifest-reporter.mjs']);
    const file = path.join(os.tmpdir(), 'rf-matrix-plain.json');
    assert.deepEqual(setting({ RF_QA_JSON_REPORT: file }, 'config.reporter.slice(3)'), [['json', { outputFile: file }]]);
    assert.deepEqual(setting({ RF_QA_JSON_REPORT: file }, 'config.reporter.slice(0, 3).map(([name]) => name)'), ['list', 'html', './review/manifest-reporter.mjs']);
});

it('reuses a running stencil start by default', () => {
    assert.equal(setting({}, 'config.webServer.reuseExistingServer'), true);
});

// RF_QA_PORTS_CHECKED is what a Playwright worker inherits once the runner has checked the
// ports, so this case doesn't depend on what is running on this machine.
it('never reuses a running stencil start with QA_FRESH_SERVER=1', () => {
    assert.equal(setting({ QA_FRESH_SERVER: '1', RF_QA_PORTS_CHECKED: '1' }, 'config.webServer.reuseExistingServer'), false);
});

// A port nothing answers on whose next port is free too, since the config reads both. It comes
// from below the system's own range for port 0 (macOS hands out 49152 and up, in sequence; Linux
// 32768 and up), so another test file in the same run, binding port 0 for a server of its own,
// can't take the next port between this pick and the config's look: it did, under wave 4's
// parallel gate runs, and the case then saw a server to reuse and took no slot. Each file starts
// its scan at its own pid, never at 3300 or the worktrees' 3400 and up. A port counts as free
// when nothing accepts on it on 127.0.0.1 or ::1, as the config checks (busyPorts), and it binds.
const accepts = (port, host) => new Promise(resolve => {
    const socket = net.connect({ port, host });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
});
const bindable = port => new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => { server.close(() => resolve(true)); });
});
const free = async port => !(await accepts(port, '127.0.0.1')) && !(await accepts(port, '::1')) && bindable(port);
const [FIRST_PORT, LAST_PORT] = [20000, 32000];
let nextPort = FIRST_PORT + (process.pid % ((LAST_PORT - FIRST_PORT) / 2)) * 2;
async function freePort() {
    for (let tries = 0; tries < 200; tries += 1) {
        const port = nextPort;
        nextPort = nextPort + 2 >= LAST_PORT ? FIRST_PORT : nextPort + 2;
        if (await free(port) && await free(port + 1)) return port; // eslint-disable-line no-await-in-loop
    }
    throw new Error(`no free port pair between ${FIRST_PORT} and ${LAST_PORT}`);
}

it('picks a port pair that a server on port 0 can\'t take, as another test file\'s can', async () => {
    const port = await freePort();
    const server = net.createServer();
    await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
    try {
        const taken = server.address().port;
        assert.ok(taken !== port && taken !== port + 1, `a port-0 server got ${taken}, one of the pair ${port} and ${port + 1}`);
    } finally {
        await new Promise(resolve => { server.close(resolve); });
    }
});

it('refuses to load with QA_FRESH_SERVER=1 while anything answers on QA_PORT, whatever QA_PORT the shell has', async () => {
    // Something that isn't a stencil start holds Browsersync's port.
    const port = await freePort();
    const holder = net.createServer();
    await new Promise(resolve => { holder.listen(port, '127.0.0.1', resolve); });
    try {
        const { status, stderr } = load({ QA_FRESH_SERVER: '1', QA_PORT: String(port) }, 'config.webServer.reuseExistingServer');
        assert.notEqual(status, 0);
        // The next port is free when freePort picks this one, but a test file running beside this
        // one may bind it before the config looks, and the message then names both.
        assert.match(stderr, new RegExp(`already answers on ports? ${port}(?: and ${port + 1})?\\. Stop that server first`));
    } finally {
        holder.close();
    }
});

it('starts stencil start on QA_PORT and tests the stencil server on the next port', () => {
    const env = { QA_PORT: '3400', RF_QA_PORTS_CHECKED: '1' };
    assert.match(setting(env, 'config.webServer.command'), / -p 3400$/);
    assert.match(setting(env, 'config.webServer.url'), /^http:\/\/localhost:3401\/stencil\//);
    assert.equal(setting(env, 'config.use.baseURL'), 'http://localhost:3401');
});

it('keeps 3300 and 3301 when QA_PORT isn\'t set', () => {
    assert.match(setting({ RF_QA_PORTS_CHECKED: '1' }, 'config.webServer.command'), / -p 3300$/);
    assert.equal(setting({ RF_QA_PORTS_CHECKED: '1' }, 'config.use.baseURL'), 'http://localhost:3301');
});

it('refuses a QA_PORT that isn\'t a port', () => {
    const { status, stderr } = load({ QA_PORT: 'next' }, 'config.webServer.command');
    assert.notEqual(status, 0);
    assert.match(stderr, /QA_PORT must be a port from 1024 to 65534/);
});

it('holds the port pair\'s lock and a stencil start slot while the runner runs, and releases them when it exits', async () => {
    const root = tempRoot();
    const port = await freePort();
    const listing = `(await import('node:fs')).readdirSync(${JSON.stringify(root)}).sort()`;
    assert.deepEqual(setting({ QA_PORT: String(port), RF_LOCK_ROOT: root }, listing), [`port-${port}`, 'stencil-1']);
    assert.deepEqual(fs.readdirSync(root), [], 'released when the runner exited');
});

it('takes no lock in a worker, which inherits RF_QA_PORTS_CHECKED from the runner', async () => {
    const root = tempRoot();
    const port = await freePort();
    const listing = `(await import('node:fs')).existsSync(${JSON.stringify(root)}) ? (await import('node:fs')).readdirSync(${JSON.stringify(root)}) : []`;
    assert.deepEqual(setting({ QA_PORT: String(port), RF_LOCK_ROOT: root, RF_QA_PORTS_CHECKED: '1' }, listing), []);
});

it('holds no lock after refusing to load with QA_FRESH_SERVER=1 on a busy port', async () => {
    const root = tempRoot();
    const port = await freePort();
    const holder = net.createServer();
    await new Promise(resolve => { holder.listen(port, '127.0.0.1', resolve); });
    try {
        const { status, stderr } = load({ QA_FRESH_SERVER: '1', QA_PORT: String(port), RF_LOCK_ROOT: root }, 'config.webServer.reuseExistingServer');
        assert.notEqual(status, 0);
        assert.match(stderr, new RegExp(`already answers on port ${port}\\b`));
        assert.deepEqual(fs.readdirSync(root), []);
    } finally {
        holder.close();
    }
});

// W0-8's render modes.

it('merges the committed custom layouts into config.stencil.json before every stencil start it makes', () => {
    assert.match(setting({ RF_QA_PORTS_CHECKED: '1' }, 'config.webServer.command'), /^node scripts\/qa\/custom-layouts\.mjs && rm -rf assets\/dist && npx stencil start /);
});

it('runs a plain run\'s stencil start in this checkout', () => {
    assert.equal(setting({ RF_QA_PORTS_CHECKED: '1' }, 'config.webServer.cwd'), path.resolve('.') + path.sep);
});

// RF_QA_THEME_DIR is the runner's message to its workers on an overlay run. One exported in
// the shell must never move a plain run's stencil start, a release's included, into another
// folder, whose server would then pass for this checkout's.
it('runs a plain run\'s stencil start in this checkout whatever RF_QA_THEME_DIR the shell has, and passes none on to the workers', async () => {
    const checkout = path.resolve('.') + path.sep;
    for (const stray of [path.resolve('..'), '/tmp/rf-qa-overlay-3310-powered-by-off-x']) {
        assert.equal(setting({ RF_QA_PORTS_CHECKED: '1', RF_QA_THEME_DIR: stray }, 'config.webServer.cwd'), checkout, `a worker, ${stray}`);
        assert.equal(setting({
            RF_QA_PORTS_CHECKED: '1', QA_FRESH_SERVER: '1', QA_PORT: '3300', RF_QA_THEME_DIR: stray,
        }, 'config.webServer.cwd'), checkout, `a release's worker, ${stray}`);
        const port = await freePort(); // eslint-disable-line no-await-in-loop
        assert.deepEqual(
            setting({ QA_PORT: String(port), RF_QA_THEME_DIR: stray }, '[config.webServer.cwd, process.env.RF_QA_THEME_DIR ?? null]'),
            [checkout, null],
            `the runner, ${stray}`,
        );
    }
});

// Overlays for these cases, in a folder of their own (RF_QA_OVERLAYS_DIR, read only under
// node --test): one that changes a stock setting, and one that changes a setting config.json
// doesn't declare.
const overlaysDir = (() => {
    const dir = tempRoot();
    fs.writeFileSync(path.join(dir, 'powered-by-off.json'), JSON.stringify({ description: 'The footer without "Powered by BigCommerce"', settings: { show_powered_by: false } }));
    fs.writeFileSync(path.join(dir, 'undeclared.json'), JSON.stringify({ description: 'A switch no module declares', settings: { rf_not_a_setting: false } }));
    return dir;
})();

it('runs an overlay\'s stencil start in its throwaway worktree, on QA_PORT + 10, and never reuses a running server', () => {
    // What a worker sees: the runner has made the worktree and passed its folder on.
    const env = {
        QA_PORT: '3400', QA_OVERLAY: 'powered-by-off', RF_QA_OVERLAYS_DIR: overlaysDir, RF_QA_PORTS_CHECKED: '1', RF_QA_THEME_DIR: '/tmp/rf-qa-overlay-3410-powered-by-off-x',
    };
    assert.match(setting(env, 'config.webServer.command'), / -p 3410$/);
    assert.equal(setting(env, 'config.webServer.cwd'), '/tmp/rf-qa-overlay-3410-powered-by-off-x');
    assert.match(setting(env, 'config.webServer.url'), /^http:\/\/localhost:3411\/stencil\//);
    assert.equal(setting(env, 'config.use.baseURL'), 'http://localhost:3411');
    assert.equal(setting(env, 'config.webServer.reuseExistingServer'), false);
});

const refusal = env => {
    const { status, stderr } = load({ RF_QA_OVERLAYS_DIR: overlaysDir, RF_QA_PORTS_CHECKED: '1', ...env }, 'config.webServer.command');
    assert.notEqual(status, 0);
    return stderr;
};

it('refuses an overlay with QA_FRESH_SERVER=1, so a release never renders one', () => {
    assert.match(refusal({ QA_OVERLAY: 'powered-by-off', QA_FRESH_SERVER: '1' }), /QA_FRESH_SERVER=1.*release never renders an overlay/);
});

it('refuses an overlay on QA_BASE_URL, which renders the host\'s own config.json', () => {
    assert.match(refusal({ QA_OVERLAY: 'powered-by-off', QA_BASE_URL: 'https://prelaunch.example' }), /only a local stencil start/);
});

it('refuses an overlay that isn\'t in the overlays folder, or that changes a setting config.json doesn\'t declare', () => {
    assert.match(refusal({ QA_OVERLAY: 'powered-by-of' }), /QA_OVERLAY "powered-by-of" isn't an overlay in .*\(powered-by-off, undeclared\)/);
    assert.match(refusal({ QA_OVERLAY: 'undeclared' }), /config\.json declares no "rf_not_a_setting" setting/);
});
