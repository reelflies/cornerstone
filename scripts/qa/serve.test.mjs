// A stencil start run by hand (scripts/qa/serve.mjs) counts toward the same cap as the gates
// (W0-7): it takes its port pair's lock and a stencil start slot before the server starts, and
// releases both once the server has stopped.
//
//   node --test scripts/qa/serve.test.mjs

import { spawn } from 'node:child_process';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

// A server that exits by itself with `code`, as stencil start does when it fails.
const exiting = code => spawn(process.execPath, ['-e', `setTimeout(() => process.exit(${code}), 50)`], { stdio: 'ignore' });
const quiet = () => {};

it('takes the locks before it starts the server, and releases them once the server has stopped, ending with its exit code', async () => {
    const order = [];
    const code = await serve({
        claim: async () => {
            order.push('claimed');
            return { plan: 'start', release: () => order.push('released') };
        },
        start: () => {
            order.push('started');
            return exiting(3);
        },
        stop: async () => { order.push('stopped'); },
        log: quiet,
    });
    assert.equal(code, 3);
    assert.deepEqual(order, ['claimed', 'started', 'stopped', 'released']);
});

it('starts nothing when the claim refuses, for example on a busy port, and passes the refusal on', async () => {
    let started = false;
    await assert.rejects(serve({
        claim: async () => { throw new Error('QA_FRESH_SERVER=1, and something already answers on port 3401.'); },
        start: () => { started = true; return exiting(0); },
        log: quiet,
    }), /already answers on port 3401/);
    assert.equal(started, false);
});

it('releases the locks when the server can\'t be started at all', async () => {
    let released = false;
    await assert.rejects(serve({
        claim: async () => ({ plan: 'start', release: () => { released = true; } }),
        start: () => { throw new Error('spawn sh ENOENT'); },
        log: quiet,
    }), /ENOENT/);
    assert.equal(released, true);
});
