// Test fixture for W0-1's origin check (release-origin.mjs): a bare "origin" whose master has one
// commit, and a clone of it on master at that tip, in a temp folder. Only the tests import this.
// Nothing here reaches a real remote.
//
//   import { originRepo } from './release-origin-fixture.mjs';
//   const repo = originRepo({ 'scripts/release-calendar.json': '{}\n' });
//   repo.git('switch', '-q', '-c', 't99/old-ticket');                  // git in the clone
//   repo.mergeOnOrigin({ 'README.md': 'later\n' });                    // origin's master moves on; the clone isn't told
//   repo.rewriteOrigin();                                              // origin's master is replaced by an unrelated commit
//   repo.remove();

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// A fixed identity, and none of the caller's GIT_* variables, so a hook's or a runner's
// environment can't point these commands at another repository.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
const IDENTITY = ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false'];

export function gitAt(cwd, ...args) {
    return execFileSync('git', [...IDENTITY, ...args], {
        cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
}

function commit(dir, files, message) {
    for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
    }
    gitAt(dir, 'add', '-A');
    gitAt(dir, 'commit', '-q', '--allow-empty', '-m', message);
    return gitAt(dir, 'rev-parse', 'HEAD');
}

export function originRepo(files = { 'README.md': 'test\n' }) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-origin-'));
    const origin = path.join(root, 'origin.git');
    const clone = path.join(root, 'clone');
    const other = path.join(root, 'other'); // where PRs "merge on GitHub"
    gitAt(root, 'init', '-q', '--bare', '--initial-branch=master', origin);
    gitAt(root, 'init', '-q', '--initial-branch=master', clone);
    gitAt(clone, 'remote', 'add', 'origin', origin);
    const head = commit(clone, files, 'first');
    gitAt(clone, 'push', '-q', 'origin', 'master');
    gitAt(clone, 'fetch', '-q', 'origin');
    const otherClone = () => {
        if (fs.existsSync(other)) gitAt(other, 'fetch', '-q', 'origin');
        else gitAt(root, 'clone', '-q', origin, other);
    };
    return {
        root,
        origin,
        clone,
        head,
        git: (...args) => gitAt(clone, ...args),
        // A commit pushed to origin's master from another clone, as a merge on GitHub is. Returns its sha.
        mergeOnOrigin(changes, message = 'merged on GitHub') {
            otherClone();
            gitAt(other, 'switch', '-q', '-C', 'master', 'origin/master');
            const sha = commit(other, changes, message);
            gitAt(other, 'push', '-q', 'origin', 'master');
            return sha;
        },
        // origin's master force-pushed to a commit that doesn't contain the clone's. Returns its sha.
        rewriteOrigin(changes = { 'README.md': 'rewritten\n' }) {
            otherClone();
            gitAt(other, 'switch', '-q', '--orphan', 'rewritten');
            const sha = commit(other, changes, 'rewritten');
            gitAt(other, 'push', '-q', '-f', 'origin', 'rewritten:master');
            return sha;
        },
        remove: () => fs.rmSync(root, { recursive: true, force: true }),
    };
}
