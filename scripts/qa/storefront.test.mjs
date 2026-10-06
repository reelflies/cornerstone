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
// - Each worktree's gates can have their own ports: QA_PORT for Browsersync, QA_PORT + 1 for
//   the stencil server, 3300 by default (W0-7). The start log is named by the port.
// - Before it uses a local server, a gate takes its port pair's lock, so two runs on one port
//   wait for each other; before it starts one, it also takes one of three stencil start slots.
//   It checks the ports again once it has the slot, because the wait can last minutes.
// - A gate trusts only the server it started: if that one has exited, whatever else answers on
//   its port fails the run. Stopping the gate with a signal stops that server too.
//
//   node --test scripts/qa/storefront.test.mjs

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { acquireLock, readHolder } from '../lib/lock.mjs';
import {
    assertServer, busyPorts, busyServerMessage, claimLocalServer, portWarning, qaPort, qaPortProblem, serverPlan, serverProblems,
    startCommand, startLogPath, stopProcessGroup, waitForFreePorts, waitForOwnServer,
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

    for (const signal of ['SIGINT', 'SIGTERM']) {
        it(`stops the server's whole group when the gate itself is stopped with ${signal}`, async () => {
            const port = await freePort();
            const storefront = fileURLToPath(new URL('./storefront.mjs', import.meta.url));
            const command = `${JSON.stringify(process.execPath)} -e "require('http').createServer().listen(${port}, '127.0.0.1')"`;
            const gate = spawn(process.execPath, ['--input-type=module', '-e', `
                import { startProcessGroup } from ${JSON.stringify(storefront)};
                const server = startProcessGroup(${JSON.stringify(command)});
                console.log(server.pid);
                setInterval(() => {}, 1000);
            `], { stdio: ['ignore', 'pipe', 'inherit'] });
            const group = await new Promise(resolve => { gate.stdout.once('data', chunk => resolve(Number(String(chunk).trim()))); });
            assert.deepEqual(await untilBusy(port), [port], 'the server came up');

            const deadline = setTimeout(() => gate.kill('SIGKILL'), 5000);
            gate.kill(signal);
            const exitCode = await new Promise(resolve => { gate.on('exit', code => resolve(code)); });
            clearTimeout(deadline);
            assert.equal(exitCode, 128 + os.constants.signals[signal], 'the gate still stops on the signal');
            assert.deepEqual(await waitForFreePorts({ ports: [port], timeout: 3000 }), [], 'its server is gone');
            assert.throws(() => process.kill(-group, 0), { code: 'ESRCH' }, 'no process of the group is left');
        });
    }
});

describe('a port pair per worktree', () => {
    it('uses QA_PORT for Browsersync, and 3300 when it isn\'t set', () => {
        assert.equal(qaPort({}), 3300);
        assert.equal(qaPort({ QA_PORT: '' }), 3300);
        assert.equal(qaPort({ QA_PORT: '3400' }), 3400);
    });

    it('accepts a port from 1024 to 65534, because the stencil server takes the next one', () => {
        assert.equal(qaPortProblem(undefined), null);
        assert.equal(qaPortProblem('3500'), null);
        for (const value of ['abc', '80', '65535', '3400.5', '-3400', '3400 ']) {
            assert.match(qaPortProblem(value), /QA_PORT must be a port from 1024 to 65534/, value);
        }
    });

    it('starts stencil start on the port, so its server answers on the next one, after merging the custom layouts (W0-8)', () => {
        assert.equal(
            startCommand({ channel: '1895766', variation: 'ReelFlies CA', port: 3400 }),
            'node scripts/qa/custom-layouts.mjs && rm -rf assets/dist && npx stencil start -c 1895766 -v "ReelFlies CA" -p 3400',
        );
    });

    it('names the start log by the port, so two runs never write the same log', () => {
        assert.equal(path.basename(startLogPath(3400)), 'rf-qa-stencil-start-3400.log');
        assert.notEqual(startLogPath(3400), startLogPath(3500));
    });

    it('warns a worktree whose gates would use the release\'s 3300 because QA_PORT isn\'t set', () => {
        const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-worktree-'));
        fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n'); // a linked worktree's .git is a file
        const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-clone-'));
        fs.mkdirSync(path.join(clone, '.git'));
        try {
            assert.match(portWarning({ env: {}, checkout: worktree }), /^WARNING {2}QA_PORT isn't set/);
            assert.equal(portWarning({ env: { QA_PORT: '3400' }, checkout: worktree }), null);
            assert.equal(portWarning({ env: {}, checkout: clone }), null, 'the main clone keeps 3300');
        } finally {
            fs.rmSync(worktree, { recursive: true, force: true });
            fs.rmSync(clone, { recursive: true, force: true });
        }
    });
});

describe('the locks a gate holds while it uses a local server', () => {
    const roots = [];
    after(() => roots.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
    const tempRoot = () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-claim-'));
        roots.push(dir);
        return dir;
    };
    const held = root => fs.readdirSync(root).sort();
    const claim = (root, plan, extra = {}) => claimLocalServer({
        port: 3400, plan: async () => plan, root, checkout: '/worktrees/w0-7', log: () => {}, pollMs: 20, ...extra,
    });

    it('holds the port pair\'s lock and a stencil start slot while it starts its own server, and releases both', async () => {
        const root = tempRoot();
        const claimed = await claim(root, 'start');
        assert.equal(claimed.plan, 'start');
        assert.deepEqual(held(root), ['port-3400', 'stencil-1']);
        const holder = readHolder(path.join(root, 'port-3400'));
        assert.equal(holder.port, 3400);
        assert.equal(holder.checkout, '/worktrees/w0-7');
        assert.equal(holder.pid, process.pid);
        claimed.release();
        assert.deepEqual(held(root), []);
    });

    it('takes no slot when it reuses a running server, only the port', async () => {
        const root = tempRoot();
        const claimed = await claim(root, 'reuse');
        assert.equal(claimed.plan, 'reuse');
        assert.deepEqual(held(root), ['port-3400']);
        claimed.release();
    });

    it('holds nothing when the plan refuses, and passes the refusal on', async () => {
        const root = tempRoot();
        await assert.rejects(claimLocalServer({
            port: 3400, root, checkout: '/w', log: () => {}, plan: async () => { throw new Error('QA_FRESH_SERVER=1, and something already answers on port 3400'); },
        }), /already answers on port 3400/);
        assert.deepEqual(held(root), []);
    });

    it('waits while another run uses the same port, then plans once the port is its own', async () => {
        const root = tempRoot();
        const other = acquireLock('port-3400', 'the gates on port 3400 in /worktrees/w0-5', { root });
        const order = [];
        setTimeout(() => {
            order.push('other run done');
            other.release();
        }, 200);
        const lines = [];
        const claimed = await claim(root, 'start', {
            plan: async () => {
                order.push('planned');
                return 'start';
            },
            log: line => lines.push(line),
        });
        assert.deepEqual(order, ['other run done', 'planned', 'planned'], 'it plans once the port is its own, and again once it has a slot');
        assert.match(lines[0], /^WAIT {5}the port-3400 lock is held by the gates on port 3400 in \/worktrees\/w0-5/);
        claimed.release();
    });

    it('waits for a slot while three stencil starts run', async () => {
        const root = tempRoot();
        const others = [1, 2, 3].map(slot => acquireLock(`stencil-${slot}`, `the gates on port ${3400 + slot * 100}`, { root }));
        setTimeout(() => others[1].release(), 200);
        const lines = [];
        const claimed = await claim(root, 'start', { log: line => lines.push(line) });
        assert.deepEqual(held(root), ['port-3400', 'stencil-1', 'stencil-2', 'stencil-3']);
        assert.match(lines.join('\n'), /WAIT {5}all 3 stencil start slots are taken/);
        assert.match(lines.join('\n'), /SLOT {5}stencil start slot 2 of 3, for port 3400/);
        claimed.release();
        others.forEach(lock => lock.release());
    });

    // A plan that answers `first` before the wait for a slot, then `second` (a value, or an
    // error to throw) once the slot is taken.
    const plans = (first, second) => {
        let calls = 0;
        return async () => {
            calls += 1;
            if (calls === 1) return first;
            if (second instanceof Error) throw second;
            return second;
        };
    };

    it('checks the ports again once it has a slot, and refuses a server that came up on them while it waited', async () => {
        const root = tempRoot();
        const others = [1, 2, 3].map(slot => acquireLock(`stencil-${slot}`, `the gates on port ${3400 + slot * 100}`, { root }));
        setTimeout(() => others[1].release(), 200);
        const busy = new Error('QA_FRESH_SERVER=1, and something already answers on ports 3400 and 3401');
        await assert.rejects(claim(root, null, { plan: plans('start', busy) }), /already answers on ports 3400 and 3401/);
        assert.deepEqual(held(root), ['stencil-1', 'stencil-3'], 'its port lock and the slot it took are released');
        others.forEach(lock => lock.release());
    });

    it('gives the slot back when a server that renders the run came up while it waited, and reuses it', async () => {
        const root = tempRoot();
        const others = [1, 2, 3].map(slot => acquireLock(`stencil-${slot}`, `the gates on port ${3400 + slot * 100}`, { root }));
        setTimeout(() => others[0].release(), 200);
        const claimed = await claim(root, null, { plan: plans('start', 'reuse') });
        assert.equal(claimed.plan, 'reuse');
        assert.deepEqual(held(root), ['port-3400', 'stencil-2', 'stencil-3']);
        claimed.release();
        assert.deepEqual(held(root), ['stencil-2', 'stencil-3']);
        others.forEach(lock => lock.release());
    });
});

describe('trusting only the server a gate started', () => {
    const exited = async () => {
        const child = spawn(process.execPath, ['-e', 'process.exit(3)'], { stdio: 'ignore' });
        await new Promise(resolve => { child.on('exit', resolve); });
        return child;
    };

    it('fails at once when the server it started has exited, even though something else answers on its port', async () => {
        const server = await exited();
        let asked = 0;
        await assert.rejects(waitForOwnServer(server, {
            ready: async () => { asked += 1; return true; }, timeout: 5000, pollMs: 10,
        }), /stencil start exited \(code 3\) before it was ready/);
        assert.equal(asked, 0, 'whatever answers is never trusted');
    });

    it('fails when its server exits while another one answers its ready check', async () => {
        const server = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(4), 100)'], { stdio: 'ignore' });
        // The answer comes from elsewhere, and arrives just after this run's server has gone.
        const ready = () => new Promise(resolve => { server.on('exit', () => resolve(true)); });
        await assert.rejects(waitForOwnServer(server, { ready, timeout: 5000, pollMs: 10 }), /exited \(code 4\)/);
    });

    it('resolves once its own server is ready, and fails after the timeout if it never is', async () => {
        const server = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' });
        try {
            let calls = 0;
            await waitForOwnServer(server, { ready: async () => { calls += 1; return calls > 2; }, timeout: 5000, pollMs: 10 });
            assert.equal(calls, 3);
            await assert.rejects(waitForOwnServer(server, { ready: async () => false, timeout: 100, pollMs: 10 }), /didn't come up within/);
        } finally {
            server.kill('SIGKILL');
        }
    });
});

describe('an overlay run (W0-8)', () => {
    it('takes its own port pair, QA_PORT + 10, so it never shares a server with the worktree\'s plain runs', () => {
        assert.equal(qaPort({ QA_PORT: '3400', QA_OVERLAY: 'rf_rise-off' }), 3410);
        assert.equal(qaPort({ QA_OVERLAY: 'rf_rise-off' }), 3310);
        assert.equal(qaPort({ QA_PORT: '3400', QA_OVERLAY: '' }), 3400);
    });

    it('refuses a QA_PORT whose overlay pair isn\'t a port', () => {
        assert.equal(qaPortProblem('65524', { overlay: true }), null);
        assert.match(qaPortProblem('65525', { overlay: true }), /an overlay run takes QA_PORT \+ 10 and the port after it/);
        assert.equal(qaPortProblem('65525'), null);
    });

    // What `?debug=context` shows of an overlay: the marker setting the overlay writes into
    // config.json (overlays.mjs), among theme_settings.
    const marked = (overlay, context = served(1895766, 1)) => ({ ...context, theme_settings: { rf_qa_overlay: overlay } });

    it('trusts a server only when it renders the run\'s overlay', () => {
        assert.deepEqual(serverProblems(marked('rf_rise-off'), {
            channel: '1895766', variation: 'ReelFlies CA', config, overlay: 'rf_rise-off',
        }), []);
        assert.deepEqual(serverProblems(served(1895766, 1), {
            channel: '1895766', variation: 'ReelFlies CA', config, overlay: 'rf_rise-off',
        }), ['renders no overlay, not QA_OVERLAY "rf_rise-off"']);
        assert.deepEqual(serverProblems(marked('menu-ids-empty'), {
            channel: '1895766', variation: 'ReelFlies CA', config, overlay: 'rf_rise-off',
        }), ['renders the overlay "menu-ids-empty", not QA_OVERLAY "rf_rise-off"']);
    });

    it('keeps a plain run off a server that renders an overlay, so an overlay\'s render never becomes a plain baseline', () => {
        assert.deepEqual(serverProblems(marked('rf_rise-off'), {
            channel: '1895766', variation: 'ReelFlies CA', config, overlay: '',
        }), ['renders the overlay "rf_rise-off", and this run has none']);
    });

    it('says why it refuses a busy port: it starts its own server, as a release does', () => {
        assert.match(busyServerMessage([3410], { overlay: 'rf_rise-off' }), /^The overlay rf_rise-off renders on a stencil start of its own, and something already answers on port 3410\. Stop that server first/);
        assert.match(busyServerMessage([3300]), /^QA_FRESH_SERVER=1, and something already answers on port 3300/);
    });
});
