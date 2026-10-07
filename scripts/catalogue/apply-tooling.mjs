// Which rules a catalogue write runs by (ticket 18): only origin/master's, as for the store
// helper (scripts/store/tooling.mjs). apply.mjs asks this before it asks Shaun for a token, so a
// ticket branch's unreviewed allowlist, or a stale worktree, can't write.
//
//   import { catalogueToolingProblem } from './apply-tooling.mjs';
//   const problem = catalogueToolingProblem();   // null, or why this checkout may not write
//
// It runs the store helper's own check (which fetches origin/master and compares scripts/store/
// and every module it imports from outside it, byte for byte), then compares every
// scripts/catalogue/apply* file, on disk or in origin/master, the same way. apply.mjs imports
// nothing else: apply-tooling.test.mjs keeps it so.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { REPO_ROOT, storeToolingProblem } from '../store/tooling.mjs';

export const CATALOGUE_FOLDER = 'scripts/catalogue';
const MASTER = 'refs/remotes/origin/master';
export const isApplyFile = name => /^apply[^/]*$/i.test(name);

function runGit(repo, args) {
    const { status, stdout, stderr } = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 60000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return { status, stdout: stdout || '', stderr: stderr || '' };
}

const firstLine = textContent => textContent.split('\n').map(line => line.trim()).find(Boolean) || '';

export function catalogueToolingProblem({ repo = REPO_ROOT, git = args => runGit(repo, args), storeProblem = storeToolingProblem } = {}) {
    const store = storeProblem({ repo, git });
    if (store) return store;
    const listed = git(['ls-tree', MASTER, '--', `${CATALOGUE_FOLDER}/`]);
    if (listed.status !== 0) return `couldn't list origin/master's catalogue tooling: ${firstLine(listed.stderr) || `git exited ${listed.status}`}`;
    const want = new Map();
    for (const line of listed.stdout.split('\n').filter(Boolean)) {
        const [meta, file] = line.split('\t');
        if (isApplyFile(path.basename(file)) && meta.split(' ')[1] === 'blob') want.set(file, meta.split(' ')[2]);
    }
    let names = [];
    try {
        names = fs.readdirSync(path.join(repo, CATALOGUE_FOLDER)).filter(isApplyFile);
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    const onDisk = names.map(name => `${CATALOGUE_FOLDER}/${name}`).sort();
    const have = new Map();
    if (onDisk.length) {
        const hashed = git(['hash-object', '--no-filters', '--', ...onDisk]);
        const hashes = hashed.stdout.split('\n').filter(Boolean);
        if (hashed.status !== 0 || hashes.length !== onDisk.length) return `couldn't hash this checkout's catalogue tooling: ${firstLine(hashed.stderr) || `git exited ${hashed.status}`}`;
        onDisk.forEach((file, index) => have.set(file, hashes[index]));
    }
    const files = [...new Set([...want.keys(), ...have.keys()])].sort();
    const differ = files.filter(file => (want.get(file) || 'missing') !== (have.get(file) || 'missing'));
    if (!files.length) return 'origin/master has no catalogue apply tooling yet (scripts/catalogue/apply*): it writes only once its PR has merged';
    if (!differ.length) return null;
    return `this checkout's catalogue tooling differs from origin/master's (${differ.join(', ')}), and a catalogue write runs only master's reviewed rules: run it from the main clone at origin/master (git -C ~/reelflies/theme/cornerstone pull --ff-only origin master, then node scripts/catalogue/apply.mjs …)`;
}
