// Which local stencil start the gates use (scripts/qa/storefront.mjs):
//
// - A server that is already running is reused only when it renders the channel and the
//   variation the run is for, so one set's screenshots are never compared with, or written
//   as, another's.
// - With QA_FRESH_SERVER=1 (release.sh) nothing is reused: a server already answering on
//   3300 or 3301 could be another checkout's, worktree's or branch's, so the run stops.
// - A server a gate started is stopped with its whole process group, and its ports are
//   free again before the next gate starts.
// - The check of what a server renders (`?debug=context`) asks a 5xx once more and backs
//   off a 429, as the pinned pages do (W0-4), and fails naming the status it ends on. A
//   wrong channel or variation fails at once.
//
//   node --test scripts/qa/storefront.test.mjs

import { spawn } from 'node:child_process';
import http from 'node:http';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    assertServer, busyPorts, busyServerMessage, serverPlan, serverProblems, stopProcessGroup, waitForFreePorts,
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

describe('checking what a running server renders', () => {
    // A stand-in for stencil start that answers `?debug=context` with each of `answers` in
    // turn: a status alone, or { status, body, headers }. It records each request's path.
    async function contextServer(...answers) {
        const requests = [];
        const server = http.createServer((request, response) => {
            requests.push(request.url);
            const answer = answers.shift() ?? 404;
            const { status, body = '', headers = {} } = typeof answer === 'number' ? { status: answer } : answer;
            response.writeHead(status, headers).end(typeof body === 'string' ? body : JSON.stringify(body));
        });
        const baseUrl = `http://127.0.0.1:${await listen(server)}`;
        return { baseUrl, requests, close: () => close(server) };
    }
    const context = (channel, position) => ({ status: 200, body: served(channel, position), headers: { 'Content-Type': 'application/json' } });
    // The stencil start renders 1895766 "ReelFlies CA"; nothing is really waited for.
    const run = (baseUrl, waits = [], lines = []) => assertServer(baseUrl, {
        channel: '1895766',
        variation: 'ReelFlies CA',
        config,
        wait: async ms => { waits.push(ms); },
        log: line => { lines.push(line); },
    });
    // stencil-cli's renderer answers 500 when its request to the store drops.
    const dropped = { status: 500, body: 'AxiosError: stream has been aborted' };

    it('passes when it renders the run\'s channel and variation', async () => {
        const stencil = await contextServer(context(1895766, 1));
        try {
            const waits = [];
            await run(stencil.baseUrl, waits);
            assert.deepEqual(stencil.requests, ['/?debug=context']);
            assert.deepEqual(waits, []);
        } finally {
            await stencil.close();
        }
    });

    it('asks once more after a 500, saying so, and passes on a valid context', async () => {
        const stencil = await contextServer(dropped, context(1895766, 1));
        try {
            const waits = [];
            const lines = [];
            await run(stencil.baseUrl, waits, lines);
            assert.equal(stencil.requests.length, 2);
            assert.deepEqual(waits, [2000], 'after RETRY_DELAY_MS');
            assert.deepEqual(lines, ['RETRY    the page context /?debug=context returned HTTP 500; fetching it once more in 2 s (stencil start\'s request to the store can drop)']);
        } finally {
            await stencil.close();
        }
    });

    it('fails on a second 500, naming the status, not a channel it can\'t read', async () => {
        const stencil = await contextServer(dropped, dropped, context(1895766, 1));
        try {
            await assert.rejects(run(stencil.baseUrl), error => {
                assert.match(error.message, /answered HTTP 500 to \/\?debug=context/);
                assert.doesNotMatch(error.message, /renders channel/);
                return true;
            });
            assert.equal(stencil.requests.length, 2, 'only once more');
        } finally {
            await stencil.close();
        }
    });

    it('backs off after a 429 and passes on the 200 that follows', async () => {
        const stencil = await contextServer(429, context(1895766, 1));
        try {
            const waits = [];
            const lines = [];
            await run(stencil.baseUrl, waits, lines);
            assert.equal(stencil.requests.length, 2);
            assert.deepEqual(waits, [2000]);
            assert.match(lines[0], /^RETRY {4}the page context \/\?debug=context returned HTTP 429; fetching it again in 2 s \(retry 1 of 3; the store is limiting requests\)$/);
        } finally {
            await stencil.close();
        }
    });

    it('waits for a 429\'s Retry-After when it sends one', async () => {
        const stencil = await contextServer({ status: 429, headers: { 'Retry-After': '7' } }, context(1895766, 1));
        try {
            const waits = [];
            await run(stencil.baseUrl, waits);
            assert.deepEqual(waits, [7000]);
        } finally {
            await stencil.close();
        }
    });

    it('fails after a 429 has been asked again three times, naming the status', async () => {
        const stencil = await contextServer(429, 429, 429, 429, context(1895766, 1));
        try {
            const waits = [];
            await assert.rejects(run(stencil.baseUrl, waits), /answered HTTP 429 to \/\?debug=context/);
            assert.equal(stencil.requests.length, 4);
            assert.deepEqual(waits, [2000, 4000, 8000]);
        } finally {
            await stencil.close();
        }
    });

    it('fails at once, with no retry, when it renders another channel', async () => {
        const stencil = await contextServer(context(1, 1), context(1895766, 1));
        try {
            const waits = [];
            const lines = [];
            await assert.rejects(run(stencil.baseUrl, waits, lines), /renders channel 1, not QA_CHANNEL 1895766\. Stop it, or set QA_CHANNEL and QA_VARIATION to match it\./);
            assert.equal(stencil.requests.length, 1);
            assert.deepEqual([waits, lines], [[], []]);
        } finally {
            await stencil.close();
        }
    });

    it('fails at once, with no retry, when it renders another variation', async () => {
        const stencil = await contextServer(context(1895766, 2), context(1895766, 1));
        try {
            await assert.rejects(run(stencil.baseUrl), /renders the variation "ReelFlies US", not QA_VARIATION "ReelFlies CA"/);
            assert.equal(stencil.requests.length, 1);
        } finally {
            await stencil.close();
        }
    });

    it('fails at once on a 4xx, naming the status', async () => {
        const stencil = await contextServer(404, context(1895766, 1));
        try {
            await assert.rejects(run(stencil.baseUrl), /answered HTTP 404 to \/\?debug=context/);
            assert.equal(stencil.requests.length, 1);
        } finally {
            await stencil.close();
        }
    });

    it('fails, saying so, when the context isn\'t JSON', async () => {
        const stencil = await contextServer({ status: 200, body: '<html>Coming soon</html>' });
        try {
            await assert.rejects(run(stencil.baseUrl), /answered \/\?debug=context with something that isn't JSON/);
        } finally {
            await stencil.close();
        }
    });
});

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
