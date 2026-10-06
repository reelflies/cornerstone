// Which rules a store write runs by (W0-11): only origin/master's. The allowlist, the channel
// check, the release calendar and the writer token's loader all come from the checkout that
// runs them, so a worktree made before the calendar was set, or a ticket branch's unreviewed
// allowlist, would otherwise write with the real writer token.
//
//   import { storeToolingProblem } from './tooling.mjs';
//   const problem = storeToolingProblem();   // null, or why this checkout may not write
//
// It fetches origin/master, then compares every file under scripts/store/ (on disk, committed or
// not, tracked or not) and every module the commands import from outside it, with the release
// calendar, against origin/master's copy, byte for byte. Any difference refuses, naming the
// files. merge.sh holds merges to master's rules the same way (its TOOLING list).
//
// The writer token's loader (scripts/lib/store-token.mjs) runs this before it reads the token,
// and apply.mjs --approved before it asks for one. plan.mjs with the read-only token sends GETs
// only, so it runs anywhere.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const STORE_FOLDER = 'scripts/store';
// Every module the store commands import from outside scripts/store/, and the calendar they read.
// A test keeps this in step with their imports (tooling.test.mjs), and every one is guarded.
export const STORE_TOOLING = [
    'scripts/lib/is-main.mjs',
    'scripts/lib/lock.mjs',
    'scripts/lib/release-calendar.mjs',
    'scripts/lib/store-token.mjs',
    'scripts/release-calendar.json',
    'scripts/release-redact.mjs',
];

const MASTER = 'refs/remotes/origin/master';
const SKIP = new Set(['.DS_Store']);
const SHOWN = 8;

function runGit(repo, args) {
    const { status, stdout, stderr } = spawnSync('git', ['-C', repo, ...args], {
        encoding: 'utf8', timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    return { status, stdout: stdout || '', stderr: stderr || '' };
}

// Every file under `folder` on disk, as repo-relative paths with forward slashes.
export function filesUnder(repo, folder) {
    const found = [];
    const walk = relative => {
        let entries;
        try {
            entries = fs.readdirSync(path.join(repo, relative), { withFileTypes: true });
        } catch (error) {
            if (error.code === 'ENOENT') return;
            throw error;
        }
        for (const entry of entries) {
            const child = `${relative}/${entry.name}`;
            if (entry.isDirectory()) walk(child);
            else if (!SKIP.has(entry.name)) found.push(child);
        }
    };
    walk(folder);
    return found.sort();
}

const firstLine = text => text.split('\n').map(line => line.trim()).find(Boolean) || '';

// null when this checkout's store tooling is byte-identical to origin/master's; otherwise why
// not, as one line. `git(args)` runs git in the repo (a stub in tests).
export function storeToolingProblem({ repo = REPO_ROOT, git = args => runGit(repo, args) } = {}) {
    const fetched = git(['fetch', '-q', 'origin', `+refs/heads/master:${MASTER}`]);
    if (fetched.status !== 0) return `couldn't fetch origin master, so the store helper can't check that it runs master's rules: ${firstLine(fetched.stderr) || `git exited ${fetched.status}`}`;
    const listed = git(['ls-tree', '-r', MASTER, '--', STORE_FOLDER, ...STORE_TOOLING]);
    if (listed.status !== 0) return `couldn't list origin/master's store tooling: ${firstLine(listed.stderr) || `git exited ${listed.status}`}`;
    const want = new Map();
    for (const line of listed.stdout.split('\n').filter(Boolean)) {
        const [meta, file] = line.split('\t');
        want.set(file, meta.split(' ')[2]);
    }
    const onDisk = [...filesUnder(repo, STORE_FOLDER), ...STORE_TOOLING.filter(file => fs.existsSync(path.join(repo, file)))];
    const have = new Map();
    if (onDisk.length) {
        // --no-filters: the bytes on disk, never what a clean filter (say one in the untracked
        // .git/info/attributes) makes of them.
        const hashed = git(['hash-object', '--no-filters', '--', ...onDisk]);
        const hashes = hashed.stdout.split('\n').filter(Boolean);
        if (hashed.status !== 0 || hashes.length !== onDisk.length) return `couldn't hash this checkout's store tooling: ${firstLine(hashed.stderr) || `git exited ${hashed.status}`}`;
        onDisk.forEach((file, index) => have.set(file, hashes[index]));
    }
    const files = [...new Set([...want.keys(), ...have.keys(), ...STORE_TOOLING])].sort();
    const differ = files.filter(file => (want.get(file) || 'missing') !== (have.get(file) || 'missing'));
    if (!differ.length) return null;
    const shown = differ.length > SHOWN ? `${differ.slice(0, SHOWN).join(', ')} and ${differ.length - SHOWN} more` : differ.join(', ');
    return `this checkout's store tooling differs from origin/master's (${shown}), and a store write runs only master's reviewed rules: write from the main clone at origin/master (git -C ~/reelflies/theme/cornerstone pull --ff-only origin master, then node ~/reelflies/theme/cornerstone/scripts/store/…)`;
}
