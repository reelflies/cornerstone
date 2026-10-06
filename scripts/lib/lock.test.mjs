import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    LockHeldError, STALE_MINUTES, acquireLock, lockRoot, readLockOwner,
} from './lock.mjs';

const roots = [];
after(() => roots.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const tempRoot = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-lock-'));
    roots.push(dir);
    return path.join(dir, 'locks'); // not created yet: acquireLock makes it
};

// A pid that is certainly not running.
const DEAD_PID = 2 ** 22 + 12345;

const age = (dir, minutes) => {
    const then = new Date(Date.now() - minutes * 60000);
    fs.utimesSync(path.join(dir, 'owner.txt'), then, then);
};

test('the locks live in ~/reelflies/theme/.locks, and RF_LOCK_ROOT moves them only under node --test', () => {
    assert.equal(lockRoot({}), path.join(os.homedir(), 'reelflies', 'theme', '.locks'));
    assert.equal(lockRoot({ RF_LOCK_ROOT: '/tmp/x', NODE_TEST_CONTEXT: 'child-v8' }), '/tmp/x');
    assert.throws(() => lockRoot({ RF_LOCK_ROOT: '/tmp/x' }), /RF_LOCK_ROOT is a test seam.*unset it/);
    assert.equal(STALE_MINUTES, 45);
});

test('acquiring makes the lock folder with an owner.txt, and release removes it', () => {
    const root = tempRoot();
    const lock = acquireLock('merge', 'scripts/merge.sh PR #12', { root });
    assert.equal(lock.dir, path.join(root, 'merge'));
    const owner = fs.readFileSync(path.join(lock.dir, 'owner.txt'), 'utf8');
    assert.match(owner, /^scripts\/merge\.sh PR #12$/m);
    assert.match(owner, /^started \d{4}-\d\d-\d\dT/m);
    assert.match(owner, new RegExp(`^pid ${process.pid} on `, 'm'));
    assert.equal(lock.brokeStale, null);
    lock.release();
    assert.ok(!fs.existsSync(lock.dir));
    lock.release(); // twice is harmless
});

test('a held lock refuses a second holder and names the first', () => {
    const root = tempRoot();
    const first = acquireLock('merge', 'W0-13 rebasing', { root });
    assert.throws(() => acquireLock('merge', 'scripts/merge.sh PR #13', { root }), error => {
        assert.ok(error instanceof LockHeldError);
        assert.match(error.message, /merge lock is held/);
        assert.match(error.message, /W0-13 rebasing/);
        return true;
    });
    first.release();
    acquireLock('merge', 'scripts/merge.sh PR #13', { root }).release();
});

test(`a lock older than ${STALE_MINUTES} minutes whose holder isn't running is broken, with a note`, () => {
    const root = tempRoot();
    const dir = path.join(root, 'merge');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'owner.txt'), `W0-4 2026-10-06T08:00\npid ${DEAD_PID} on ${os.hostname()}\n`);
    age(dir, STALE_MINUTES + 1);
    const lock = acquireLock('merge', 'scripts/merge.sh PR #14', { root });
    assert.match(lock.brokeStale, /STALE/);
    assert.match(lock.brokeStale, /W0-4 2026-10-06T08:00/);
    assert.match(readLockOwner(dir), /PR #14/);
    lock.release();
});

test('a hand-written owner.txt with no pid goes stale on age alone', () => {
    const root = tempRoot();
    const dir = path.join(root, 'merge');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'owner.txt'), 'W0-5 2026-10-06T08:00\n');
    age(dir, STALE_MINUTES + 5);
    acquireLock('merge', 'scripts/merge.sh PR #15', { root }).release();
});

test('a young lock, or an old one whose holder still runs, is never broken', () => {
    const root = tempRoot();
    const dir = path.join(root, 'merge');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'owner.txt'), `W0-6\npid ${DEAD_PID} on ${os.hostname()}\n`);
    age(dir, STALE_MINUTES - 1);
    assert.throws(() => acquireLock('merge', 'x', { root }), LockHeldError);

    fs.writeFileSync(path.join(dir, 'owner.txt'), `W0-6\npid ${process.pid} on ${os.hostname()}\n`);
    age(dir, STALE_MINUTES * 3);
    assert.throws(() => acquireLock('merge', 'x', { root }), /still running/);
});

test('a lock folder with no owner.txt goes stale by the folder\'s own age', () => {
    const root = tempRoot();
    const dir = path.join(root, 'merge');
    fs.mkdirSync(dir, { recursive: true });
    assert.throws(() => acquireLock('merge', 'x', { root }), /no owner\.txt/);
    const then = new Date(Date.now() - (STALE_MINUTES + 1) * 60000);
    fs.utimesSync(dir, then, then);
    acquireLock('merge', 'x', { root }).release();
});

test('of two processes breaking the same stale lock, only one holds it, and the other leaves it alone', () => {
    const root = tempRoot();
    const dir = path.join(root, 'merge');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'owner.txt'), `W0-4 2026-10-06T08:00\npid ${DEAD_PID} on ${os.hostname()}\n`);
    age(dir, STALE_MINUTES + 1);
    let first;
    // The second process judges the lock stale; before it breaks it, the first breaks it and takes it.
    const breakFirst = () => { first = acquireLock('merge', 'first PR #1', { root }); };
    assert.throws(() => acquireLock('merge', 'second PR #2', { root, beforeBreak: breakFirst }), error => {
        assert.ok(error instanceof LockHeldError, error.message);
        assert.match(error.message, /merge lock/);
        return true;
    });
    assert.ok(first, 'the first process took the lock');
    assert.match(readLockOwner(dir), /^first PR #1$/m, 'the first holder\'s lock is untouched');
    assert.deepEqual(fs.readdirSync(root), ['merge'], 'no tombstone is left behind');
    first.release();
    assert.ok(!fs.existsSync(dir));
});

test('release removes only the lock it took', () => {
    const root = tempRoot();
    const lock = acquireLock('merge', 'mine', { root });
    fs.rmSync(lock.dir, { recursive: true, force: true }); // someone broke it by hand
    const other = acquireLock('merge', 'theirs', { root });
    lock.release();
    assert.match(readLockOwner(other.dir), /^theirs$/m, 'the new holder keeps its lock');
    other.release();
    assert.ok(!fs.existsSync(other.dir));
});
