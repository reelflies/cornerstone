// The locks parallel runs and agents share on this Mac (scripts/lib/lock.mjs, W0-7):
//
// - A lock is a folder taken with an atomic mkdir. It holds owner.json (pid, host, ticket,
//   start time) and owner.txt, the same facts as lines, as agents write it by hand.
// - A held lock refuses a second holder, naming the first and when it started.
// - A lock older than its limit (release 90 minutes, merge 15, a stencil start slot or a
//   port 30) whose pid is no longer running is broken, with a STALE line naming the old
//   holder. A lock whose holder still runs is never broken. One with no pid to check (taken
//   by hand) goes stale on age alone, after its limit or 45 minutes, whichever is longer.
// - At most three stencil starts run at once: each takes a slot, stencil-<1..3>, and waits
//   for a free one.
// - RF_LOCK_ROOT moves the locks only under node --test, so no real run can take a private
//   lock. Breaking a stale lock removes only a lock folder, never anything else.
//
//   node --test scripts/lib/lock.test.mjs

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    LIMIT_MINUTES, LockHeldError, STALE_MINUTES, STENCIL_SLOTS, acquireLock, acquireSlot, heldBy, limitMinutes, lockRoot,
    readHolder, readLockOwner, waitForLock,
} from './lock.mjs';

const LOCK_MODULE = fileURLToPath(new URL('./lock.mjs', import.meta.url));
const MINUTE = 60000;
// A pid no process can have (above the pid limit on macOS and Linux), so it is never running.
const DEAD_PID = 2 ** 22 + 12345;

const roots = [];
after(() => roots.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
// A lock root of its own for each case; not made yet, because taking a lock makes it.
const tempRoot = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-lock-'));
    roots.push(dir);
    return path.join(dir, 'locks');
};
const ageFile = (file, minutes) => {
    const then = new Date(Date.now() - minutes * MINUTE);
    fs.utimesSync(file, then, then);
};
// A lock as an agent takes it by hand under wave 0's rule: a folder with owner.txt, no pid.
function handLock(root, name, text, minutes) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'owner.txt'), `${text}\n`);
    ageFile(path.join(dir, 'owner.txt'), minutes);
    return dir;
}
// A lock taken `minutes` ago by a process that has gone.
const deadLock = (root, name, minutes, owner = 'W0-5 gate on port 3400') => acquireLock(name, owner, {
    root, pid: DEAD_PID, now: Date.now() - minutes * MINUTE, ticket: 'w0/5-stable-ch1-phone-shot',
});
const quiet = { log: () => {} };

describe('where the locks live and how long they last', () => {
    it('lives in ~/reelflies/theme/.locks, and RF_LOCK_ROOT moves it only under node --test', () => {
        assert.equal(lockRoot({}), path.join(os.homedir(), 'reelflies', 'theme', '.locks'));
        assert.equal(lockRoot({ RF_LOCK_ROOT: '/tmp/rf-locks', NODE_TEST_CONTEXT: 'child-v8' }), '/tmp/rf-locks');
        // A stray export would give a real release or gate run a lock, and slots, nobody else sees.
        assert.throws(() => lockRoot({ RF_LOCK_ROOT: '/tmp/rf-locks' }), /RF_LOCK_ROOT is a test seam.*unset it/);
        assert.throws(() => lockRoot({ RF_LOCK_ROOT: '/tmp/rf-locks', NODE_TEST_CONTEXT: '' }), /RF_LOCK_ROOT is a test seam/);
    });

    it('gives the release 90 minutes, a merge 15, a slot or a port 30, and anything else 45', () => {
        assert.deepEqual(LIMIT_MINUTES, {
            release: 90, merge: 15, slot: 30, port: 30,
        });
        assert.equal(limitMinutes('release'), 90);
        assert.equal(limitMinutes('merge'), 15);
        assert.equal(limitMinutes('stencil-2'), 30);
        assert.equal(limitMinutes('port-3400'), 30);
        assert.equal(limitMinutes('stencil'), STALE_MINUTES); // wave 0's lock, taken by hand
        assert.equal(STALE_MINUTES, 45);
        assert.equal(STENCIL_SLOTS, 3);
    });
});

describe('taking and releasing a lock', () => {
    it('makes the folder with owner.json and owner.txt, and release removes it', () => {
        const root = tempRoot();
        const lock = acquireLock('release', 'scripts/release.sh --channel 1895766', { root, ticket: 'W0-7', details: { checkout: '/tmp/x' } });
        assert.equal(lock.dir, path.join(root, 'release'));
        assert.equal(lock.brokeStale, null);

        const owner = JSON.parse(fs.readFileSync(path.join(lock.dir, 'owner.json'), 'utf8'));
        assert.equal(owner.pid, process.pid);
        assert.equal(owner.host, os.hostname());
        assert.equal(owner.ticket, 'W0-7');
        assert.equal(owner.owner, 'scripts/release.sh --channel 1895766');
        assert.equal(owner.checkout, '/tmp/x');
        assert.match(owner.started, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);

        const text = readLockOwner(lock.dir);
        assert.match(text, /^scripts\/release\.sh --channel 1895766$/m);
        assert.match(text, /^ticket W0-7$/m);
        assert.match(text, /^started \d{4}-\d\d-\d\dT/m);
        assert.match(text, new RegExp(`^pid ${process.pid} on ${os.hostname()}$`, 'm'));

        lock.release();
        assert.ok(!fs.existsSync(lock.dir));
        lock.release(); // twice is harmless
    });

    it('refuses a second holder, naming the first and when it started', () => {
        const root = tempRoot();
        const first = acquireLock('release', 'scripts/release.sh --channel 1895766 --dry-run', { root, ticket: 'orchestrator' });
        const { started } = JSON.parse(fs.readFileSync(path.join(first.dir, 'owner.json'), 'utf8'));
        assert.throws(() => acquireLock('release', 'scripts/release.sh --channel 1895766', { root }), error => {
            assert.ok(error instanceof LockHeldError);
            assert.match(error.message, /the release lock is held by scripts\/release\.sh --channel 1895766 --dry-run/);
            assert.match(error.message, /ticket orchestrator/);
            assert.ok(error.message.includes(`since ${started}`), error.message);
            assert.match(error.message, /still running/);
            assert.equal(error.holder.pid, process.pid);
            return true;
        });
        first.release();
        acquireLock('release', 'next', { root }).release();
    });

    it('leaves alone a lock that someone else holds now', () => {
        const root = tempRoot();
        const mine = acquireLock('stencil-1', 'mine', { root });
        fs.rmSync(mine.dir, { recursive: true }); // broken by someone, then taken again
        const theirs = acquireLock('stencil-1', 'theirs', { root });
        mine.release();
        assert.ok(fs.existsSync(theirs.dir));
        assert.equal(readHolder(theirs.dir).owner, 'theirs');
        theirs.release();
    });
});

describe('stale locks', () => {
    for (const [name, limit] of [['release', 90], ['merge', 15], ['stencil-1', 30], ['port-3400', 30]]) {
        it(`breaks a ${name} lock over ${limit} minutes old whose pid is gone, with a STALE line naming the old holder`, () => {
            const root = tempRoot();
            deadLock(root, name, limit + 1);
            const lock = acquireLock(name, 'the next run', { root });
            assert.match(lock.brokeStale, new RegExp(`^STALE {4}broke the ${name} lock`));
            assert.match(lock.brokeStale, /W0-5 gate on port 3400/);
            assert.match(lock.brokeStale, /ticket w0\/5-stable-ch1-phone-shot/);
            assert.match(lock.brokeStale, new RegExp(`pid ${DEAD_PID} .*isn't running`));
            assert.equal(readHolder(lock.dir).owner, 'the next run');
            lock.release();
        });

        it(`keeps a ${name} lock under ${limit} minutes old, even with its pid gone`, () => {
            const root = tempRoot();
            deadLock(root, name, limit - 1);
            assert.throws(() => acquireLock(name, 'the next run', { root }), LockHeldError);
        });
    }

    it('never breaks a lock whose holder is still running, however old', () => {
        const root = tempRoot();
        acquireLock('release', 'a long release', { root, now: Date.now() - 600 * MINUTE });
        assert.throws(() => acquireLock('release', 'x', { root }), /still running/);
    });

    it('checks the pid whatever host owner.json names, because the locks are always on this Mac\'s own disk', () => {
        // macOS names the host from the network when no HostName is set, so the name can change
        // while a release runs.
        const root = tempRoot();
        const lock = acquireLock('release', 'a release that outlived its host name', { root, now: Date.now() - 100 * MINUTE });
        const file = path.join(lock.dir, 'owner.json');
        fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), host: 'some-other-name.local' }));
        assert.throws(() => acquireLock('release', 'x', { root }), /still running/);

        const gone = acquireLock('merge', 'a merge on a renamed host', { root, pid: DEAD_PID, now: Date.now() - 16 * MINUTE });
        const json = path.join(gone.dir, 'owner.json');
        fs.writeFileSync(json, JSON.stringify({ ...JSON.parse(fs.readFileSync(json, 'utf8')), host: 'some-other-name.local' }));
        const merge = acquireLock('merge', 'x', { root });
        assert.match(merge.brokeStale, /over its 15 min limit, and pid \d+ isn't running/, 'broken at its own limit, not 45 minutes');
        merge.release();
    });

    it('breaks a lock taken by hand (owner.txt, no pid) only after its limit or 45 minutes, whichever is longer', () => {
        const root = tempRoot();
        handLock(root, 'merge', 'W0-4 2026-10-06T08:00', 20);
        assert.throws(() => acquireLock('merge', 'x', { root }), /W0-4 2026-10-06T08:00/);
        handLock(root, 'merge', 'W0-4 2026-10-06T08:00', 46);
        const merge = acquireLock('merge', 'x', { root });
        assert.match(merge.brokeStale, /STALE.*W0-4 2026-10-06T08:00/);
        merge.release();

        handLock(root, 'release', 'orchestrator 2026-10-06T08:00', 60);
        assert.throws(() => acquireLock('release', 'x', { root }), LockHeldError);
        handLock(root, 'release', 'orchestrator 2026-10-06T08:00', 91);
        acquireLock('release', 'x', { root }).release();
    });

    it('reads the pid of a hand-written owner.txt that names one, as W0-13\'s merge lock writes it', () => {
        const root = tempRoot();
        handLock(root, 'merge', `scripts/merge.sh PR #12\npid ${process.pid} on ${os.hostname()}`, 600);
        assert.throws(() => acquireLock('merge', 'x', { root }), /still running/);
        handLock(root, 'merge', `scripts/merge.sh PR #12\npid ${DEAD_PID} on ${os.hostname()}`, 16);
        acquireLock('merge', 'x', { root }).release();
    });

    it('treats a folder with no owner file yet as held, and as stale only by the folder\'s age', () => {
        const root = tempRoot();
        const dir = path.join(root, 'stencil-1');
        fs.mkdirSync(dir, { recursive: true });
        assert.throws(() => acquireLock('stencil-1', 'x', { root }), /no owner\.txt or owner\.json/);
        ageFile(dir, 46);
        acquireLock('stencil-1', 'x', { root }).release();
    });

    it('never removes something at a lock\'s path that isn\'t a lock folder, however old', () => {
        const root = tempRoot();
        fs.mkdirSync(root, { recursive: true });
        const file = path.join(root, 'stencil-1');
        fs.writeFileSync(file, 'not a lock\n');
        ageFile(file, 600);
        assert.throws(() => acquireLock('stencil-1', 'x', { root }), /stencil-1 isn't a lock folder/);
        assert.equal(fs.readFileSync(file, 'utf8'), 'not a lock\n');

        const dir = path.join(root, 'stencil-2');
        fs.mkdirSync(path.join(dir, 'work'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'owner.txt'), 'W0-4 2026-10-06T08:00\n');
        fs.writeFileSync(path.join(dir, 'notes.md'), 'keep me\n');
        ageFile(path.join(dir, 'owner.txt'), 600);
        assert.throws(() => acquireLock('stencil-2', 'x', { root }), /stencil-2 isn't a lock folder: it also holds notes\.md and work/);
        assert.deepEqual(fs.readdirSync(dir).sort(), ['notes.md', 'owner.txt', 'work']);
    });

    it('of two runs breaking the same stale lock, only one holds it, and the other leaves it alone', () => {
        const root = tempRoot();
        handLock(root, 'merge', `W0-4 2026-10-06T08:00\npid ${DEAD_PID} on ${os.hostname()}`, 46);
        let first;
        // The second run judges the lock stale; before it breaks it, the first breaks it and takes it.
        const breakFirst = () => { first = acquireLock('merge', 'first PR #1', { root }); };
        assert.throws(() => acquireLock('merge', 'second PR #2', { root, beforeBreak: breakFirst }), error => {
            assert.ok(error instanceof LockHeldError, error.message);
            assert.match(error.message, /the merge lock is held by first PR #1/);
            return true;
        });
        assert.match(first.brokeStale, /STALE.*W0-4 2026-10-06T08:00/);
        assert.equal(readHolder(first.dir).owner, 'first PR #1', 'the first holder\'s lock is untouched');
        assert.deepEqual(fs.readdirSync(root), ['merge'], 'nothing is left beside it');
        first.release();
    });

    it('says who holds a lock, or null when it is free or stale', () => {
        const root = tempRoot();
        assert.equal(heldBy('port-3400', { root }), null);
        const lock = acquireLock('port-3400', 'gate on port 3400', { root });
        assert.equal(heldBy('port-3400', { root }).owner, 'gate on port 3400');
        lock.release();
        deadLock(root, 'port-3400', 31);
        assert.equal(heldBy('port-3400', { root }), null);
    });
});

describe('waiting for a lock', () => {
    it('waits while a running holder has it, says so once, and takes it when it is released', async () => {
        const root = tempRoot();
        const first = acquireLock('port-3400', 'W0-5 gate on port 3400', { root });
        setTimeout(() => first.release(), 300);
        const lines = [];
        const lock = await waitForLock('port-3400', 'W0-7 gate on port 3400', { root, pollMs: 20, log: line => lines.push(line) });
        assert.equal(readHolder(lock.dir).owner, 'W0-7 gate on port 3400');
        assert.equal(lines.length, 1, lines.join('\n'));
        assert.match(lines[0], /^WAIT {5}the port-3400 lock is held by W0-5 gate on port 3400/);
        lock.release();
    });

    it('gives up after its timeout, naming the holder', async () => {
        const root = tempRoot();
        acquireLock('port-3400', 'W0-5 gate on port 3400', { root });
        await assert.rejects(waitForLock('port-3400', 'x', {
            root, pollMs: 20, timeoutMs: 200, ...quiet,
        }), error => {
            assert.ok(error instanceof LockHeldError);
            assert.match(error.message, /W0-5 gate on port 3400/);
            return true;
        });
    });
});

describe('the stencil start slots', () => {
    it('takes the first free slot of three, and a fourth run waits until one is free', async () => {
        const root = tempRoot();
        const slots = [acquireSlot('a', { root, ...quiet }), acquireSlot('b', { root, ...quiet }), acquireSlot('c', { root, ...quiet })];
        const taken = await Promise.all(slots);
        assert.deepEqual(taken.map(lock => lock.slot), [1, 2, 3]);
        assert.deepEqual(fs.readdirSync(root).sort(), ['stencil-1', 'stencil-2', 'stencil-3']);

        const lines = [];
        let fourth = null;
        const waiting = acquireSlot('d', { root, pollMs: 20, log: line => lines.push(line) }).then(lock => { fourth = lock; });
        await new Promise(resolve => { setTimeout(resolve, 150); });
        assert.equal(fourth, null, 'all three slots are taken');
        assert.match(lines[0], /^WAIT {5}all 3 stencil start slots are taken \(by a, b and c\)/);

        taken[1].release();
        await waiting;
        assert.equal(fourth.slot, 2);
        [taken[0], taken[2], fourth].forEach(lock => lock.release());
    });

    it('breaks a stale slot instead of waiting for it', async () => {
        const root = tempRoot();
        deadLock(root, 'stencil-1', 31);
        acquireLock('stencil-2', 'b', { root });
        acquireLock('stencil-3', 'c', { root });
        const lines = [];
        const lock = await acquireSlot('d', { root, pollMs: 20, log: line => lines.push(line) });
        assert.equal(lock.slot, 1);
        assert.match(lines.join('\n'), /STALE {4}broke the stencil-1 lock/);
    });

    it('lets no more than three processes hold a slot at once', async () => {
        const root = tempRoot();
        const log = path.join(path.dirname(root), 'held.log');
        // Each process takes a slot, notes when it held it, holds it 400 ms, and releases it.
        const holder = name => spawn(process.execPath, ['--input-type=module', '-e', `
            import fs from 'node:fs';
            import { acquireSlot } from ${JSON.stringify(LOCK_MODULE)};
            const lock = await acquireSlot(${JSON.stringify(name)}, { root: ${JSON.stringify(root)}, pollMs: 25, log: () => {} });
            const start = Date.now();
            await new Promise(resolve => setTimeout(resolve, 400));
            fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ slot: lock.slot, start, end: Date.now() }) + '\\n');
            lock.release();
        `], { stdio: 'inherit' });
        const exits = ['p1', 'p2', 'p3', 'p4', 'p5'].map(name => new Promise(resolve => { holder(name).on('exit', resolve); }));
        assert.deepEqual(await Promise.all(exits), [0, 0, 0, 0, 0]);

        const spans = fs.readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
        assert.equal(spans.length, 5);
        const most = Math.max(...spans.map(({ start }) => spans.filter(other => other.start <= start && start < other.end).length));
        assert.ok(most <= 3, `${most} held a slot at once`);
        assert.deepEqual(fs.readdirSync(root), [], 'every slot was released');
    });
});

describe('a lock held for the life of a process', () => {
    const child = (root, code) => spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { acquireLock } from ${JSON.stringify(LOCK_MODULE)};
        acquireLock('stencil-1', 'child', { root: ${JSON.stringify(root)}, releaseOnExit: true });
        ${code}
    `], { encoding: 'utf8' });

    it('is released when the process exits, even through process.exit', () => {
        const root = tempRoot();
        assert.equal(child(root, 'process.exit(3);').status, 3);
        assert.deepEqual(fs.readdirSync(root), []);
    });

    it('stays when the process is killed with SIGKILL, which can\'t be caught, until it is stale', () => {
        const root = tempRoot();
        assert.equal(child(root, 'process.kill(process.pid, "SIGKILL");').signal, 'SIGKILL');
        assert.throws(() => acquireLock('stencil-1', 'x', { root }), /isn't running.*under 30 min old|under 30 min old.*isn't running/);
    });

    // A process that holds a slot and a port lock until it is stopped, as a gate does, with
    // `code` run after it takes them. It prints "ready" once it holds both.
    const holder = (root, code = '') => spawn(process.execPath, ['--input-type=module', '-e', `
        import { acquireLock } from ${JSON.stringify(LOCK_MODULE)};
        acquireLock('port-3400', 'gate', { root: ${JSON.stringify(root)}, releaseOnExit: true });
        acquireLock('stencil-1', 'gate', { root: ${JSON.stringify(root)}, releaseOnExit: true });
        ${code}
        setInterval(() => {}, 1000);
        console.log('ready');
    `], { stdio: ['ignore', 'pipe', 'inherit'] });
    // Sends `signal` once the process holds its locks. A process still running 5 s later is
    // killed, so a run that never stops fails the case instead of hanging the suite.
    const stopWith = (run, signal) => new Promise(resolve => {
        let out = '';
        const deadline = setTimeout(() => run.kill('SIGKILL'), 5000);
        run.stdout.on('data', chunk => {
            out += chunk;
            if (out.includes('ready')) run.kill(signal);
        });
        run.on('exit', (code, exitSignal) => {
            clearTimeout(deadline);
            resolve({ code, signal: exitSignal, out });
        });
    });

    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        it(`is released when the process is stopped with ${signal} (Ctrl-C, a kill, a tool's timeout or a closed terminal), and the process still stops`, async () => {
            const root = tempRoot();
            const result = await stopWith(holder(root), signal);
            assert.equal(result.code, 128 + os.constants.signals[signal], `it exits as a shell reports ${signal}`);
            assert.deepEqual(fs.readdirSync(root), []);
        });
    }

    it('lets the process\'s other exit hooks run when a signal stops it (Playwright\'s runner stops its webServer in one)', async () => {
        const root = tempRoot();
        const marker = path.join(path.dirname(root), 'webserver-stopped');
        const result = await stopWith(holder(root, `
            import fs from 'node:fs';
            process.on('exit', () => fs.writeFileSync(${JSON.stringify(marker)}, 'stopped'));
        `), 'SIGTERM');
        assert.equal(result.code, 143);
        assert.ok(fs.existsSync(marker), 'the other exit hook ran');
        assert.deepEqual(fs.readdirSync(root), []);
    });

    it('is released on a signal even when a loader has loaded the lock module twice', async () => {
        const root = tempRoot();
        const twice = `import { acquireLock as again } from ${JSON.stringify(`${pathToFileURL(LOCK_MODULE).href}?again`)};
            again('stencil-2', 'gate', { root: ${JSON.stringify(root)}, releaseOnExit: true });`;
        const result = await stopWith(holder(root, twice), 'SIGTERM');
        assert.equal(result.code, 143, 'the process still stops');
        assert.deepEqual(fs.readdirSync(root), []);
    });

    it('leaves the release to the exit, when something else in the process handles the signal and exits (Playwright\'s runner)', async () => {
        const root = tempRoot();
        const slot = JSON.stringify(path.join(root, 'stencil-1'));
        const result = await stopWith(holder(root, `
            import fs from 'node:fs';
            process.on('SIGINT', () => {
                console.log(fs.existsSync(${slot}) ? 'held while stopping' : 'released too soon');
                setTimeout(() => process.exit(130), 50);
            });
        `), 'SIGINT');
        assert.equal(result.code, 130);
        assert.match(result.out, /held while stopping/);
        assert.deepEqual(fs.readdirSync(root), []);
    });
});

describe('the command line, for bash scripts', () => {
    const cliIn = (root, env, ...args) => spawnSync(process.execPath, [LOCK_MODULE, ...args], { encoding: 'utf8', env: { ...process.env, RF_LOCK_ROOT: root, ...env } });

    it('takes a lock for a given pid and drops it only for that pid', () => {
        const root = tempRoot();
        const cli = (...args) => cliIn(root, {}, ...args);
        const take = cli('take', 'release', '--pid', String(process.pid), '--owner', 'scripts/release.sh --channel 1895766 --dry-run');
        assert.equal(take.status, 0, take.stderr);
        assert.equal(readHolder(path.join(root, 'release')).pid, process.pid);

        const second = cli('take', 'release', '--pid', String(process.pid), '--owner', 'another release');
        assert.equal(second.status, 1);
        assert.match(second.stderr, /^STOP {5}the release lock is held by scripts\/release\.sh --channel 1895766 --dry-run/m);
        assert.match(second.stderr, /since \d{4}-\d\d-\d\dT/);

        assert.equal(cli('drop', 'release', '--pid', '1').status, 0);
        assert.ok(fs.existsSync(path.join(root, 'release')), 'another pid\'s drop leaves it');
        assert.equal(cli('drop', 'release', '--pid', String(process.pid)).status, 0);
        assert.ok(!fs.existsSync(path.join(root, 'release')));
    });

    it('breaks a stale lock and says so', () => {
        const root = tempRoot();
        deadLock(root, 'release', 91, 'scripts/release.sh --channel 1895766');
        const take = cliIn(root, {}, 'take', 'release', '--pid', String(process.pid), '--owner', 'next');
        assert.equal(take.status, 0, take.stderr);
        assert.match(take.stdout, /^STALE {4}broke the release lock/m);
    });

    it('refuses RF_LOCK_ROOT outside node --test, and takes no lock', () => {
        const root = tempRoot();
        const take = cliIn(root, { NODE_TEST_CONTEXT: '' }, 'take', 'release', '--pid', String(process.pid), '--owner', 'a real release');
        assert.equal(take.status, 2);
        assert.match(take.stderr, /^STOP {5}RF_LOCK_ROOT is a test seam/m);
        assert.ok(!fs.existsSync(root));
    });

    it('refuses a call it doesn\'t understand', () => {
        const root = tempRoot();
        assert.equal(cliIn(root, {}, 'take', 'release').status, 2);
        assert.equal(cliIn(root, {}, 'grab', 'release', '--pid', '1').status, 2);
        assert.equal(cliIn(root, {}, 'take', '../x', '--pid', '1').status, 2);
        // The folder is RF_LOCK_ROOT's (tests only), never an option a caller can point anywhere.
        assert.equal(cliIn(root, {}, 'take', 'release', '--pid', '1', '--root', '/tmp').status, 2);
    });
});
