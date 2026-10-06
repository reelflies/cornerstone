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
import { HEADERS, QA_PORT } from './storefront.mjs';

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

it('reuses a running stencil start by default', () => {
    assert.equal(setting({}, 'config.webServer.reuseExistingServer'), true);
});

// RF_QA_PORTS_CHECKED is what a Playwright worker inherits once the runner has checked the
// ports, so this case doesn't depend on what is running on this machine.
it('never reuses a running stencil start with QA_FRESH_SERVER=1', () => {
    assert.equal(setting({ QA_FRESH_SERVER: '1', RF_QA_PORTS_CHECKED: '1' }, 'config.webServer.reuseExistingServer'), false);
});

it('refuses to load with QA_FRESH_SERVER=1 while anything answers on 3300', async () => {
    // Something that isn't a stencil start holds Browsersync's port; if a real server already
    // holds it, that does as well.
    const holder = net.createServer();
    await new Promise(resolve => {
        holder.once('error', resolve).listen(QA_PORT, '127.0.0.1', resolve);
    });
    try {
        const { status, stderr } = load({ QA_FRESH_SERVER: '1' }, 'config.webServer.reuseExistingServer');
        assert.notEqual(status, 0);
        assert.match(stderr, /already answers on port[s]? (3300|3300 and 3301)\. Stop that server first/);
    } finally {
        holder.close();
    }
});

// A port nothing answers on, below 65000 so the next one is a port too.
async function freePort() {
    const server = net.createServer();
    const port = await new Promise(resolve => { server.listen(0, '127.0.0.1', () => resolve(server.address().port)); });
    await new Promise(resolve => { server.close(resolve); });
    return port < 65000 ? port : freePort();
}

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
