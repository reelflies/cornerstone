// Locks that runs and agents working in parallel on this Mac share (W0-7):
// ~/reelflies/theme/.locks/<name>, each one a folder taken with an atomic mkdir.
//
//   release      one release or dry run at a time (scripts/release.sh)              stale after 90 min
//   merge        one merge at a time (W0-13's scripts/merge.sh)                     15 min
//   stencil-<n>  a stencil start slot: at most three run on the Mac at once         30 min
//   port-<n>     one gate run at a time on the port pair n and n + 1 (scripts/qa)   30 min
//
// - Every lock folder holds owner.json (owner, ticket, pid, host and start time) and owner.txt,
//   the same facts as lines. Agents that take a lock by hand (wave 0's rule) write owner.txt.
// - A held lock refuses a second holder, naming the first and when it started.
// - A lock older than its limit whose pid isn't running is stale: it is broken, with a STALE
//   line naming the old holder. A lock whose holder still runs is never broken. The pid is
//   checked whatever host the lock names, because the folders are always on this Mac's own disk
//   and macOS can rename the host mid-run. A lock with no pid to check (taken by hand) goes
//   stale on age alone, after its limit or 45 minutes (wave 0's rule), whichever is longer.
// - Breaking happens under `<name>.breaking`, and only once the holder read again there is the
//   one judged stale, so two runs breaking the same stale lock can't remove a new holder's.
//   Only a lock folder is ever removed: its owner files, then the folder. Anything else at a
//   lock's path stays, and the run stops naming it.
// - A lock taken with releaseOnExit also goes when the process is stopped by SIGINT, SIGTERM or
//   SIGHUP (Ctrl-C, a kill, a tool's timeout, a closed terminal); the process then exits with
//   128 + the signal's number. Only SIGKILL leaves the lock to go stale.
//
//   import { acquireLock, acquireSlot, waitForLock } from './lib/lock.mjs';
//   const lock = acquireLock('release', 'scripts/release.sh ...');      // throws LockHeldError
//   try { ... } finally { lock.release(); }
//
// From bash (release.sh), for the script's own pid:
//
//   node scripts/lib/lock.mjs take release --pid $$ --owner "scripts/release.sh ..."   # 1 if held, 2 if it can't run
//   node scripts/lib/lock.mjs drop release --pid $$
//
// RF_LOCK_ROOT moves the folder for tests, and only under `node --test`: anywhere else it is
// refused, so a stray export can't give a real release, merge or gate run a private lock.

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setTimeout as pause } from 'timers/promises';
import { isMain } from './is-main.mjs';

export const STALE_MINUTES = 45;
export const LIMIT_MINUTES = {
    release: 90, merge: 15, slot: 30, port: 30,
};
export const STENCIL_SLOTS = 3;
// How long a run waits for a slot or a port: longer than their limit, so a lock whose holder
// died goes stale, and is broken, while the run waits.
export const WAIT_MINUTES = 40;

const MINUTE = 60000;
const BREAKER_MINUTES = 1;

export const slotName = number => `stencil-${number}`;
export const portLockName = port => `port-${port}`;

export function limitMinutes(name) {
    if (name === 'release' || name === 'merge') return LIMIT_MINUTES[name];
    if (/^stencil-\d+$/.test(name)) return LIMIT_MINUTES.slot;
    if (/^port-\d+$/.test(name)) return LIMIT_MINUTES.port;
    return STALE_MINUTES;
}

export class LockHeldError extends Error {
    constructor(message, holder) {
        super(message);
        this.name = 'LockHeldError';
        this.holder = holder;
    }
}

export function lockRoot(env = process.env) {
    if (env.RF_LOCK_ROOT) {
        if (!env.NODE_TEST_CONTEXT) throw new Error(`RF_LOCK_ROOT is a test seam for node --test, and a real run must share ~/reelflies/theme/.locks with every other agent: unset it (it is ${env.RF_LOCK_ROOT})`);
        return env.RF_LOCK_ROOT;
    }
    return path.join(os.homedir(), 'reelflies', 'theme', '.locks');
}

function checkName(name) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name))) throw new Error(`"${name}" isn't a lock name (lower-case letters, digits and hyphens)`);
}

// The ticket a lock is taken for: RF_TICKET, or else the branch checked out where it runs.
export function currentTicket(cwd = process.cwd()) {
    if (process.env.RF_TICKET) return process.env.RF_TICKET;
    const { status, stdout } = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' });
    return status === 0 ? stdout.trim() : '';
}

export function readLockOwner(dir) {
    try {
        return fs.readFileSync(path.join(dir, 'owner.txt'), 'utf8').trim();
    } catch {
        return null;
    }
}

const mtimeMs = file => {
    try {
        return fs.statSync(file).mtimeMs;
    } catch {
        return null;
    }
};

// Who holds the lock in `dir`, from owner.json, else owner.txt as written by hand, else the
// folder alone (just made, its owner files not written yet). null once the folder is gone.
export function readHolder(dir) {
    try {
        const record = JSON.parse(fs.readFileSync(path.join(dir, 'owner.json'), 'utf8'));
        return { ...record, startedMs: Date.parse(record.started) };
    } catch {
        // no owner.json: taken by hand, or not written yet
    }
    const text = readLockOwner(dir);
    const written = mtimeMs(path.join(dir, 'owner.txt'));
    if (text !== null && written !== null) {
        const pidLine = /^pid (\d+) on (.+)$/m.exec(text);
        return {
            owner: text.split('\n')[0], text, pid: pidLine ? Number(pidLine[1]) : null, host: pidLine ? pidLine[2].trim() : null, startedMs: written,
        };
    }
    const made = mtimeMs(dir);
    return made === null ? null : {
        owner: null, pid: null, host: null, startedMs: made,
    };
}

export function describeHolder(holder) {
    if (holder.token) {
        const ticket = holder.ticket ? ` (ticket ${holder.ticket})` : '';
        return `${holder.owner}${ticket}, pid ${holder.pid} on ${holder.host}, since ${holder.started}`;
    }
    const when = new Date(holder.startedMs).toISOString();
    if (holder.text) return `${holder.text.split('\n').join(' | ')} (owner.txt, written ${when})`;
    return `nobody yet (no owner.txt or owner.json; the folder was made ${when})`;
}

const shortName = holder => holder?.owner || 'a lock with no owner.txt';
const list = names => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join(''));

function isRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        return error.code === 'EPERM';
    }
}

// { held: why } or { stale: why } for a lock whose limit is `limit` minutes. The pid is checked
// whatever host the lock names: the lock folders are on this Mac's own disk, and os.hostname()
// follows the network on a Mac with no HostName set, so it can change while a run holds a lock.
function judge(holder, { limit, now }) {
    const age = now - holder.startedMs;
    const minutes = `${Math.floor(age / MINUTE)} min old`;
    if (holder.pid) {
        if (isRunning(holder.pid)) return { held: `its pid ${holder.pid} is still running` };
        if (age > limit * MINUTE) return { stale: `${minutes}, over its ${limit} min limit, and pid ${holder.pid} isn't running` };
        return { held: `its pid ${holder.pid} isn't running, but the lock is under ${limit} min old` };
    }
    const handLimit = Math.max(limit, STALE_MINUTES);
    if (age > handLimit * MINUTE) return { stale: `${minutes}, over ${handLimit} min, with no pid to check` };
    return { held: `it names no pid to check, and is under ${handLimit} min old` };
}

const sameHolder = (a, b) => (a.token ? a.token === b.token : a.startedMs === b.startedMs && a.pid === b.pid && a.owner === b.owner);

function tryMkdir(dir) {
    try {
        fs.mkdirSync(dir);
        return true;
    } catch (error) {
        if (error.code === 'EEXIST') return false;
        throw error;
    }
}

// What a lock folder may hold: its owner files, and owner.json's temporary copy while it is written.
const LOCK_FILES = /^(owner\.json|owner\.txt|owner\.json\.\d+\.tmp)$/;

// Removes the lock folder `dir`: its owner files, then the folder itself. Anything else at that
// path (a file, or a folder holding anything else) isn't a lock, so it is left and this throws.
function removeLockDir(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir);
    } catch (error) {
        if (error.code === 'ENOENT') return;
        if (error.code === 'ENOTDIR') throw new Error(`${dir} isn't a lock folder: it is a file. It was left alone; move it away by hand`);
        throw error;
    }
    const others = entries.filter(entry => !LOCK_FILES.test(entry)).sort();
    if (others.length) throw new Error(`${dir} isn't a lock folder: it also holds ${list(others)}. It was left alone; move it away by hand`);
    entries.forEach(entry => fs.rmSync(path.join(dir, entry), { force: true }));
    try {
        fs.rmdirSync(dir);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

// Removes the lock in `dir` if `stale` still holds it, under `<dir>.breaking`. Returns whether
// it did; false means someone else is breaking it, or already has.
function breakLock(dir, stale) {
    const breaker = `${dir}.breaking`;
    if (!tryMkdir(breaker)) {
        // A breaker left by a run that died mid-break is removed; the next attempt goes on.
        if (Date.now() - (mtimeMs(breaker) ?? Date.now()) > BREAKER_MINUTES * MINUTE) removeLockDir(breaker);
        return false;
    }
    try {
        const current = readHolder(dir);
        if (!current || !sameHolder(current, stale)) return false;
        removeLockDir(dir);
        return true;
    } finally {
        removeLockDir(breaker);
    }
}

function writeOwner(dir, record) {
    const json = path.join(dir, 'owner.json');
    const temporary = `${json}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
    fs.renameSync(temporary, json);
    const lines = [record.owner, record.ticket && `ticket ${record.ticket}`, `started ${record.started}`, `pid ${record.pid} on ${record.host}`];
    fs.writeFileSync(path.join(dir, 'owner.txt'), `${lines.filter(Boolean).join('\n')}\n`);
}

// The signals that stop a run that can still clean up: Ctrl-C, a kill or a tool's timeout, and a
// closed terminal. SIGKILL can't be caught.
const STOP_SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];
const CLEANUPS = Symbol.for('reelflies.lock.cleanupOnExit');

// The cleanups to run when this process stops, one list for the whole process even if a loader
// loads this module twice, so a stop signal is never left to two handlers that each wait for the
// other.
function exitHooks() {
    if (global[CLEANUPS]) return global[CLEANUPS];
    const hooks = { cleanups: [], hooked: false };
    // Runs every cleanup still registered, the newest first (a server before the locks it holds).
    hooks.run = () => {
        while (hooks.cleanups.length) {
            const cleanup = hooks.cleanups.pop();
            try {
                cleanup();
            } catch (error) {
                console.error(`cleanup on exit failed: ${error.message}`);
            }
        }
    };
    // A stop signal. When something else in the process handles it too (Playwright's runner
    // handles SIGINT, stops its webServer and exits), the cleanups wait for that exit.
    // Otherwise they run now, and the process exits as a shell reports the signal (128 + its
    // number). It exits rather than raising the signal again, so the process's other exit hooks
    // run too: Playwright's runner stops its webServer, a stencil start in a process group of its
    // own, in one.
    hooks.onSignal = signal => {
        if (process.listenerCount(signal) > 1) return;
        hooks.run();
        hooks.unhook();
        process.exit(128 + os.constants.signals[signal]);
    };
    hooks.hook = () => {
        if (hooks.hooked) return;
        hooks.hooked = true;
        process.on('exit', hooks.run);
        STOP_SIGNALS.forEach(signal => process.on(signal, hooks.onSignal));
    };
    hooks.unhook = () => {
        if (!hooks.hooked) return;
        hooks.hooked = false;
        process.off('exit', hooks.run);
        STOP_SIGNALS.forEach(signal => process.off(signal, hooks.onSignal));
    };
    global[CLEANUPS] = hooks;
    return hooks;
}

// Runs `cleanup` once, when this process exits or is stopped by SIGINT, SIGTERM or SIGHUP.
// Returns a function that drops it, for a cleanup done the ordinary way.
export function cleanupOnExit(cleanup) {
    const hooks = exitHooks();
    hooks.cleanups.push(cleanup);
    hooks.hook();
    return () => {
        const index = hooks.cleanups.indexOf(cleanup);
        if (index !== -1) hooks.cleanups.splice(index, 1);
        if (!hooks.cleanups.length) hooks.unhook();
    };
}

function holding(name, dir, record, brokeStale, releaseOnExit) {
    let released = false;
    let forget = () => {};
    const lock = {
        name,
        dir,
        brokeStale,
        // Removes the lock if it is still this one's: a lock broken and taken by another run stays.
        release() {
            if (released) return;
            released = true;
            forget();
            const current = readHolder(dir);
            if (current && current.token === record.token) removeLockDir(dir);
        },
    };
    if (releaseOnExit) forget = cleanupOnExit(lock.release);
    return lock;
}

// Takes the lock `name` for `owner` (who and what, in a few words), or throws LockHeldError.
// - pid: the process whose life the lock lasts (default this one; release.sh passes its own)
// - ticket: default RF_TICKET or the branch; details: more fields for owner.json
// - releaseOnExit: release it when this process exits or is stopped by a signal it can catch
//   (only SIGKILL leaves it to go stale)
// - now, staleMinutes and beforeBreak (run once a lock is judged stale, before it is broken): for tests
export function acquireLock(name, owner, {
    root = lockRoot(), staleMinutes, now = Date.now(), pid = process.pid, ticket, details = {}, releaseOnExit = false, beforeBreak = () => {},
} = {}) {
    checkName(name);
    fs.mkdirSync(root, { recursive: true });
    const dir = path.join(root, name);
    const limit = staleMinutes ?? limitMinutes(name);
    let brokeStale = null;
    for (let attempt = 0; attempt < 3; attempt++) {
        if (tryMkdir(dir)) {
            const record = {
                ...details, owner, ticket: ticket ?? currentTicket(), pid, host: os.hostname(), started: new Date(now).toISOString(), token: crypto.randomUUID(),
            };
            try {
                writeOwner(dir, record);
            } catch (error) {
                removeLockDir(dir);
                throw error;
            }
            return holding(name, dir, record, brokeStale, releaseOnExit);
        }
        const holder = readHolder(dir);
        if (holder) { // otherwise it was released between the mkdir and the read: try again
            const verdict = judge(holder, { limit, now });
            if (verdict.held) throw new LockHeldError(`the ${name} lock is held by ${describeHolder(holder)}. It isn't stale: ${verdict.held}`, holder);
            beforeBreak();
            if (breakLock(dir, holder)) brokeStale = `STALE    broke the ${name} lock (${verdict.stale}), held by ${describeHolder(holder)}`;
        }
    }
    const holder = readHolder(dir);
    throw new LockHeldError(`the ${name} lock is held by ${holder ? describeHolder(holder) : 'another run'}`, holder);
}

// The holder of the lock `name`, or null when it is free or stale.
export function heldBy(name, { root = lockRoot(), now = Date.now() } = {}) {
    const holder = readHolder(path.join(root, name));
    return holder && judge(holder, { limit: limitMinutes(name), now }).held ? holder : null;
}

// Takes the lock `name`, waiting while another run holds it: a WAIT line says so once, and a
// STALE line when a stale one is broken. Throws LockHeldError after `timeoutMs`.
export async function waitForLock(name, owner, {
    pollMs = 2000, timeoutMs = WAIT_MINUTES * MINUTE, log = console.log, ...options
} = {}) {
    const deadline = Date.now() + timeoutMs;
    let waiting = false;
    for (;;) {
        try {
            const lock = acquireLock(name, owner, options);
            if (lock.brokeStale) log(lock.brokeStale);
            return lock;
        } catch (error) {
            if (!(error instanceof LockHeldError)) throw error;
            if (Date.now() >= deadline) throw new LockHeldError(`gave up after ${Math.round(timeoutMs / MINUTE)} min: ${error.message}`, error.holder);
            if (!waiting) log(`WAIT     ${error.message}; waiting for it (up to ${Math.round(timeoutMs / MINUTE)} min)`);
            waiting = true;
        }
        await pause(pollMs); // eslint-disable-line no-await-in-loop
    }
}

// Takes the first free stencil start slot, stencil-1 to stencil-<slots>, waiting while all are
// taken. The lock it resolves to says which in `slot`.
export async function acquireSlot(owner, {
    slots = STENCIL_SLOTS, pollMs = 2000, timeoutMs = WAIT_MINUTES * MINUTE, log = console.log, ...options
} = {}) {
    const deadline = Date.now() + timeoutMs;
    let waiting = false;
    for (;;) {
        const holders = [];
        for (let slot = 1; slot <= slots; slot++) {
            try {
                const lock = acquireLock(slotName(slot), owner, options);
                if (lock.brokeStale) log(lock.brokeStale);
                return Object.assign(lock, { slot });
            } catch (error) {
                if (!(error instanceof LockHeldError)) throw error;
                holders.push(error.holder);
            }
        }
        const taken = `all ${slots} stencil start slots are taken (by ${list(holders.map(shortName))})`;
        if (Date.now() >= deadline) throw new LockHeldError(`gave up after ${Math.round(timeoutMs / MINUTE)} min: ${taken}`, holders);
        if (!waiting) log(`WAIT     ${taken}; waiting for one (up to ${Math.round(timeoutMs / MINUTE)} min)`);
        waiting = true;
        await pause(pollMs); // eslint-disable-line no-await-in-loop
    }
}

// Removes the lock `name` if its owner.json names `pid`; for release.sh's exit trap.
export function dropLock(name, { root = lockRoot(), pid }) {
    checkName(name);
    const dir = path.join(root, name);
    const holder = readHolder(dir);
    if (holder?.token && holder.pid === pid) removeLockDir(dir);
}

const USAGE = 'usage: node scripts/lib/lock.mjs take <name> --pid <pid> [--owner <text>]\n'
    + '       node scripts/lib/lock.mjs drop <name> --pid <pid>';

// The lock folder is always lockRoot()'s, never an option: a caller can't point it elsewhere.
export function parseCommand(argv) {
    const [action, name, ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 2) {
        const [flag, value] = [rest[index], rest[index + 1]];
        if (!['--pid', '--owner'].includes(flag) || value === undefined) throw new Error(`unknown or incomplete option ${flag}`);
        options[flag.slice(2)] = value;
    }
    if (!['take', 'drop'].includes(action)) throw new Error(`unknown action ${action}`);
    checkName(name);
    if (!/^[1-9]\d*$/.test(options.pid || '')) throw new Error('--pid must be the pid the lock lasts for');
    return {
        action, name, pid: Number(options.pid), owner: options.owner || `pid ${options.pid}`,
    };
}

// Exits 0 when it took or dropped the lock, 1 when another run holds it, and 2 when it can't
// run: a call it doesn't understand, RF_LOCK_ROOT outside a test, or a path that isn't a lock.
function main(argv) {
    let command;
    try {
        command = parseCommand(argv);
    } catch (error) {
        console.error(`${error.message}\n${USAGE}`);
        return 2;
    }
    const {
        action, name, pid, owner,
    } = command;
    try {
        const root = lockRoot();
        if (action === 'drop') {
            dropLock(name, { root, pid });
            return 0;
        }
        const lock = acquireLock(name, owner, { root, pid });
        if (lock.brokeStale) console.log(lock.brokeStale);
        return 0;
    } catch (error) {
        console.error(`STOP     ${error.message}.`);
        return error instanceof LockHeldError ? 1 : 2;
    }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
