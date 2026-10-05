// The Playwright config for the storefront gates (scripts/qa/playwright.config.mjs):
// a prelaunch run with the preview cookie writes no trace, because a trace records every
// request's headers, the Cookie header too, into scripts/qa/results/.
//
//   node --test scripts/qa/playwright-config.test.mjs

import { spawnSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';
import { it } from 'node:test';
import assert from 'node:assert/strict';

const CONFIG = pathToFileURL(path.resolve('scripts/qa/playwright.config.mjs')).href;

// The config reads its environment once, when it loads, so each case loads it afresh.
function traceSetting(env) {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_')));
    const { status, stdout, stderr } = spawnSync(process.execPath, [
        '--input-type=module',
        '-e',
        `const { default: config } = await import(${JSON.stringify(CONFIG)}); console.log(JSON.stringify(config.use.trace));`,
    ], { encoding: 'utf8', env: { ...clean, ...env } });
    assert.equal(status, 0, stderr);
    return JSON.parse(stdout.trim().split('\n').pop());
}

it('keeps no trace on a prelaunch run that sends the preview cookie', () => {
    assert.equal(traceSetting({ QA_BASE_URL: 'https://prelaunch.example', QA_PREVIEW_COOKIE: 'SHOP_SESSION_TOKEN=secret-value' }), 'off');
});

it('keeps the trace of a failed test on a local run, which sends no cookie', () => {
    assert.equal(traceSetting({}), 'retain-on-failure');
});

it('keeps the trace of a failed test on another host when no cookie is given', () => {
    assert.equal(traceSetting({ QA_BASE_URL: 'https://prelaunch.example' }), 'retain-on-failure');
});
