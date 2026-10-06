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

import fs from 'fs';
import os from 'os';
import path from 'path';

export const STALE_MINUTES = 45;

export class LockHeldError extends Error {}

export const lockRoot = (env = process.env) => env.RF_LOCK_ROOT || path.join(os.homedir(), 'reelflies', 'theme', '.locks');

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

export function acquireLock(name, owner, { root = lockRoot(), staleMinutes = STALE_MINUTES, now = Date.now() } = {}) {
    fs.mkdirSync(root, { recursive: true });
    const dir = path.join(root, name);
    let brokeStale = null;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            fs.mkdirSync(dir);
            fs.writeFileSync(path.join(dir, 'owner.txt'), `${owner}\nstarted ${new Date(now).toISOString()}\npid ${process.pid} on ${os.hostname()}\n`);
            let released = false;
            return {
                dir,
                brokeStale,
                release() {
                    if (released) return;
                    released = true;
                    fs.rmSync(dir, { recursive: true, force: true });
                },
            };
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
        const previous = readLockOwner(dir);
        const state = staleness(dir, staleMinutes, now);
        // A lock released between the mkdir and the read is simply tried again.
        if (state !== 'it vanished') {
            const who = previous === null ? '(no owner.txt)' : previous.split('\n').join(' | ');
            if (state.held || attempt > 0) {
                throw new LockHeldError(`the ${name} lock is held (${dir}): ${who}. ${state.held ? `It isn't stale: ${state.held}.` : ''} Wait for it, or break it only once it is stale (over ${staleMinutes} min old and its holder gone).`.replace(/\s+$/, ''));
            }
            fs.rmSync(dir, { recursive: true, force: true });
            brokeStale = `STALE    broke the ${name} lock (${state.stale}), held by: ${who}`;
        }
    }
    throw new LockHeldError(`the ${name} lock is held (${dir})`);
}
