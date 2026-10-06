// Which local stencil start the gates use (scripts/qa/storefront.mjs):
//
// - A server that is already running is reused only when it renders the channel and the
//   variation the run is for, so one set's screenshots are never compared with, or written
//   as, another's.
// - With QA_FRESH_SERVER=1 (release.sh) nothing is reused: a server already answering on
//   3300 or 3301 could be another checkout's, worktree's or branch's, so the run stops.
// - A server a gate started is stopped with its whole process group, and its ports are
//   free again before the next gate starts.
//
//   node --test scripts/qa/storefront.test.mjs

import { spawn } from 'node:child_process';
import http from 'node:http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    busyPorts, busyServerMessage, serverPlan, serverProblems, stopProcessGroup, waitForFreePorts,
} from './storefront.mjs';

const config = { variations: [{ name: 'ReelFlies CA' }, { name: 'ReelFlies US' }] };
// What `?debug=context` shows: stencil start sets settings.theme_config_id to a uuid of the
// variation's position in config.json, counted from 1.
const served = (channel, position) => ({
    settings: { channel_id: channel, theme_config_id: `00000000-0000-0000-0000-${String(position).padStart(12, '0')}` },
});

describe('reusing a running stencil start', () => {
    it('is allowed when it renders the run\'s channel and variation', () => {
        assert.deepEqual(serverProblems(served(1895766, 1), { channel: '1895766', variation: 'ReelFlies CA', config }), []);
        assert.deepEqual(serverProblems(served(1, 2), { channel: '1', variation: 'ReelFlies US', config }), []);
    });

    it('is refused when it renders another channel', () => {
        const problems = serverProblems(served(1, 1), { channel: '1895766', variation: 'ReelFlies CA', config });
        assert.deepEqual(problems, ['renders channel 1, not QA_CHANNEL 1895766']);
    });

    it('is refused when it renders another variation of the same channel', () => {
        const problems = serverProblems(served(1895766, 2), { channel: '1895766', variation: 'ReelFlies CA', config });
        assert.deepEqual(problems, ['renders the variation "ReelFlies US", not QA_VARIATION "ReelFlies CA"']);
    });

    it('is refused when it doesn\'t say which variation it renders', () => {
        const problems = serverProblems({ settings: { channel_id: 1895766 } }, { channel: '1895766', variation: 'ReelFlies CA', config });
        assert.deepEqual(problems, ['renders an unknown variation (theme_config_id undefined), not QA_VARIATION "ReelFlies CA"']);
    });
});

describe('choosing the server a gate uses', () => {
    it('reuses a server that already serves a dev build, by default', () => {
        assert.equal(serverPlan({ fresh: false, busyPorts: [3300, 3301], ready: true }), 'reuse');
    });

    it('starts one when none is ready, by default', () => {
        assert.equal(serverPlan({ fresh: false, busyPorts: [], ready: false }), 'start');
    });

    it('starts its own with QA_FRESH_SERVER=1 when both ports are free', () => {
        assert.equal(serverPlan({ fresh: true, busyPorts: [], ready: false }), 'start');
    });

    it('refuses with QA_FRESH_SERVER=1 while a server is ready, even one for the run\'s channel and variation', () => {
        assert.equal(serverPlan({ fresh: true, busyPorts: [3300, 3301], ready: true }), 'refuse');
    });

    it('refuses with QA_FRESH_SERVER=1 while anything answers on 3300 or 3301', () => {
        assert.equal(serverPlan({ fresh: true, busyPorts: [3300], ready: false }), 'refuse');
        assert.equal(serverPlan({ fresh: true, busyPorts: [3301], ready: false }), 'refuse');
    });

    it('tells the operator to stop that server first', () => {
        const message = busyServerMessage([3300, 3301]);
        assert.match(message, /already answers on ports 3300 and 3301/);
        assert.match(message, /Stop that server first/);
        assert.match(message, /lsof -nP -iTCP:3300 -iTCP:3301 -sTCP:LISTEN/);
    });
});

const listen = (server, port = 0) => new Promise(resolve => { server.listen(port, '127.0.0.1', () => resolve(server.address().port)); });
const close = server => new Promise(resolve => { server.close(resolve); });
async function freePort() {
    const server = http.createServer();
    const port = await listen(server);
    await close(server);
    return port;
}

describe('the QA ports', () => {
    it('lists the ports something answers on', async () => {
        const server = http.createServer((request, response) => response.end());
        const busy = await listen(server);
        const free = await freePort();
        try {
            assert.deepEqual(await busyPorts([busy, free]), [busy]);
        } finally {
            await close(server);
        }
    });

    it('waits until they are free, and lists the ones still busy at the deadline', async () => {
        const leaving = http.createServer();
        const staying = http.createServer();
        const [gone, kept] = [await listen(leaving), await listen(staying)];
        setTimeout(() => leaving.close(), 300);
        try {
            assert.deepEqual(await waitForFreePorts({ ports: [gone], timeout: 3000 }), []);
            assert.deepEqual(await waitForFreePorts({ ports: [kept], timeout: 500 }), [kept]);
        } finally {
            await close(staying);
        }
    });
});

describe('stopping a server a gate started', () => {
    // Like START_COMMAND: a detached shell whose child process holds the port. `ignoreTerm`
    // makes both of them ignore SIGTERM.
    const startGroup = (port, ignoreTerm = false) => spawn('sh', ['-c', [
        ignoreTerm ? "trap '' TERM;" : '',
        JSON.stringify(process.execPath),
        `-e "${ignoreTerm ? "process.on('SIGTERM', () => {});" : ''} require('http').createServer().listen(${port}, '127.0.0.1')"`,
    ].join(' ')], { detached: true, stdio: 'ignore' });
    const untilBusy = async (port, tries = 50) => {
        if ((await busyPorts([port])).length || !tries) return busyPorts([port]);
        await new Promise(resolve => { setTimeout(resolve, 100); });
        return untilBusy(port, tries - 1);
    };

    it('stops the whole process group and frees its port', async () => {
        const port = await freePort();
        const child = startGroup(port);
        assert.deepEqual(await untilBusy(port), [port], 'the server came up');

        assert.deepEqual(await stopProcessGroup(child, { ports: [port] }), []);
        assert.throws(() => process.kill(-child.pid, 0), { code: 'ESRCH' }, 'no process of the group is left');
        assert.deepEqual(await busyPorts([port]), []);
    });

    it('kills a group that ignores SIGTERM', async () => {
        const port = await freePort();
        const child = startGroup(port, true);
        assert.deepEqual(await untilBusy(port), [port], 'the server came up');

        assert.deepEqual(await stopProcessGroup(child, { ports: [port], timeout: 500 }), []);
        assert.throws(() => process.kill(-child.pid, 0), { code: 'ESRCH' }, 'no process of the group is left');
    });
});
