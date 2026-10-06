// Locks shared by agents working in parallel on this Mac (W0-13; W0-7 builds on it):
// ~/reelflies/theme/.locks/<name>, taken with an atomic mkdir.
//
//   import { acquireLock } from './lib/lock.mjs';
//   const lock = acquireLock('merge', 'scripts/merge.sh PR #12');   // throws LockHeldError
//   if (lock.brokeStale) console.log(lock.brokeStale);
//   try { ... } finally { lock.release(); }
//
// The holder is named in <lock>/owner.txt: its first line says who, then when and which pid.
// Agents taking a lock by hand write their item id and the time there. A lock is stale when
// owner.txt (or the folder, if it has none) is older than STALE_MINUTES and the pid it names,
// if any, isn't running on this Mac; a stale lock is broken with a STALE note. A lock whose
// holder still runs is never broken.
//
// RF_LOCK_ROOT moves the locks for tests, and only under `node --test`: anywhere else it is
// refused, so a stray export can't give a real merge a private lock.

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

export const STALE_MINUTES = 45;

export class LockHeldError extends Error {}

export function lockRoot(env = process.env) {
    if (env.RF_LOCK_ROOT) {
        if (!env.NODE_TEST_CONTEXT) throw new Error(`RF_LOCK_ROOT is a test seam for node --test, and a real run must share ~/reelflies/theme/.locks with every other agent: unset it (it is ${env.RF_LOCK_ROOT})`);
        return env.RF_LOCK_ROOT;
    }
    return path.join(os.homedir(), 'reelflies', 'theme', '.locks');
}

export function readLockOwner(dir) {
    try {
        return fs.readFileSync(path.join(dir, 'owner.txt'), 'utf8').trim();
    } catch {
        return null;
    }
}

function running(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

// Why the lock in `dir` may be broken, or null if it may not.
function staleness(dir, staleMinutes, now) {
    const owner = readLockOwner(dir);
    let stat;
    try {
        stat = fs.statSync(owner === null ? dir : path.join(dir, 'owner.txt'));
    } catch {
        return 'it vanished';
    }
    const minutes = (now - stat.mtimeMs) / 60000;
    const holder = /^pid (\d+) on (.+)$/m.exec(owner || '');
    if (holder && holder[2].trim() === os.hostname() && running(Number(holder[1]))) {
        return { held: `its holder (pid ${holder[1]}) is still running` };
    }
    if (minutes <= staleMinutes) return { held: `it was taken ${Math.floor(minutes)} min ago` };
    return { stale: `${Math.floor(minutes)} min old` };
}

// Which lock folder `dir` is now (its device and inode) and who holds it, or null if there is
// none. A lock taken after another was judged stale differs in one or the other.
function identity(dir) {
    try {
        const stat = fs.statSync(dir);
        return `${stat.dev}:${stat.ino}:${readLockOwner(dir)}`;
    } catch {
        return null;
    }
}

// Breaks the stale lock at `dir`, but only if it is still the one judged stale. The lock is
// renamed aside first, which is atomic, so of two processes breaking it only one moves it; a
// process that finds it moved a newer lock puts it back. Returns 'broken', 'gone' (someone
// else moved it first), or 'taken' (someone took it since it was judged stale).
function breakStale(dir, judged) {
    const tomb = `${dir}.stale-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    try {
        fs.renameSync(dir, tomb);
    } catch (error) {
        if (error.code === 'ENOENT') return 'gone'; // released or broken already: try mkdir again
        throw error;
    }
    if (identity(tomb) === judged) {
        fs.rmSync(tomb, { recursive: true, force: true });
        return 'broken';
    }
    if (!fs.existsSync(dir)) fs.renameSync(tomb, dir);
    return 'taken';
}

// mkdir, which is atomic: true if this call made the lock folder, false if it exists.
function makeDir(dir) {
    try {
        fs.mkdirSync(dir);
        return true;
    } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        return false;
    }
}

function hold(dir, owner, now, brokeStale) {
    fs.writeFileSync(path.join(dir, 'owner.txt'), `${owner}\nstarted ${new Date(now).toISOString()}\npid ${process.pid} on ${os.hostname()}\n`);
    const mine = identity(dir);
    let released = false;
    return {
        dir,
        brokeStale,
        release() {
            if (released) return;
            released = true;
            // Only the lock this call took: if it was broken and taken again, that one stays.
            if (identity(dir) === mine) fs.rmSync(dir, { recursive: true, force: true });
        },
    };
}

// beforeBreak is for tests: it runs after a lock is judged stale, before it is broken.
export function acquireLock(name, owner, {
    root = lockRoot(), staleMinutes = STALE_MINUTES, now = Date.now(), beforeBreak = () => {},
} = {}) {
    fs.mkdirSync(root, { recursive: true });
    const dir = path.join(root, name);
    let brokeStale = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        if (makeDir(dir)) return hold(dir, owner, now, brokeStale);
        const judged = identity(dir);
        const previous = readLockOwner(dir);
        const state = staleness(dir, staleMinutes, now);
        // A lock released between the mkdir and the read is simply tried again.
        if (state !== 'it vanished' && judged !== null) {
            const who = previous === null ? '(no owner.txt)' : previous.split('\n').join(' | ');
            if (state.held || attempt > 0) {
                throw new LockHeldError(`the ${name} lock is held (${dir}): ${who}. ${state.held ? `It isn't stale: ${state.held}.` : ''} Wait for it, or break it only once it is stale (over ${staleMinutes} min old and its holder gone).`.replace(/\s+$/, ''));
            }
            beforeBreak();
            const broke = breakStale(dir, judged);
            if (broke === 'taken') {
                throw new LockHeldError(`the ${name} lock is held (${dir}): someone took it while this run was breaking the stale one (${who}). Wait for it.`);
            }
            if (broke === 'broken') brokeStale = `STALE    broke the ${name} lock (${state.stale}), held by: ${who}`;
        }
    }
    throw new LockHeldError(`the ${name} lock is held (${dir})`);
}
