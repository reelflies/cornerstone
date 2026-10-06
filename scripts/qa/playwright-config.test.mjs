// The Playwright config for the storefront gates (scripts/qa/playwright.config.mjs):
//
// - A prelaunch run with the preview cookie writes no trace, because a trace records every
//   request's headers, the Cookie header too, into scripts/qa/results/.
// - A plain run never writes a missing screenshot baseline; only --update-snapshots does.
// - With QA_FRESH_SERVER=1 (release.sh) the webServer never reuses a running server, and the
//   config refuses to load while anything answers on 3300 or 3301.
//
//   node --test scripts/qa/playwright-config.test.mjs

import { spawnSync } from 'child_process';
import net from 'net';
import path from 'path';
import { pathToFileURL } from 'url';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { HEADERS, QA_PORT } from './storefront.mjs';

const CONFIG = pathToFileURL(path.resolve('scripts/qa/playwright.config.mjs')).href;

// The config reads its environment once, when it loads, so each case loads it afresh and
// prints `expression` of it.
function load(env, expression) {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_') && !name.startsWith('RF_QA_')));
    return spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(${expression}));`,
    ], { encoding: 'utf8', env: { ...clean, ...env } });
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
