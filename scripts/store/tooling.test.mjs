// Tests scripts/store/tooling.mjs (W0-11): a store write runs only store tooling byte-identical
// to origin/master's. Each case runs in a scratch clone whose origin is a local bare repo, so
// nothing reaches GitHub.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isGuarded, readGuardedPaths } from '../lib/guarded-paths.mjs';
import { git, storeCheckout } from './fixtures/checkout.mjs';
import { STORE_FOLDER, STORE_TOOLING, storeToolingProblem } from './tooling.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-store-tooling-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let count = 0;
const fresh = options => storeCheckout(path.join(tmp, `clone-${++count}`), options);

test('a checkout whose store tooling is origin/master\'s passes', () => {
    assert.equal(storeToolingProblem({ repo: fresh() }), null);
});

test('an uncommitted edit to the allowlist is refused, naming the file', () => {
    const dir = fresh();
    fs.appendFileSync(path.join(dir, 'scripts/store/allowlist.mjs'), '\n// widened\n');
    const problem = storeToolingProblem({ repo: dir });
    assert.match(problem, /^this checkout's store tooling differs from origin\/master's \(scripts\/store\/allowlist\.mjs\)/);
    assert.match(problem, /git -C ~\/reelflies\/theme\/cornerstone pull --ff-only origin master/);
});

test('a committed change on a ticket branch is refused too: only master\'s reviewed rules write', () => {
    const dir = fresh();
    git(dir, 'checkout', '-q', '-b', 't46/widget-sync');
    fs.writeFileSync(path.join(dir, 'scripts/store/widgets-sync.mjs'), 'export {};\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'sync');
    assert.match(storeToolingProblem({ repo: dir }), /\(scripts\/store\/widgets-sync\.mjs\)/);
});

test('an untracked file in scripts/store/ is refused: it could be run with the writer token', () => {
    const dir = fresh();
    fs.writeFileSync(path.join(dir, 'scripts/store/anything.mjs'), 'export {};\n');
    assert.match(storeToolingProblem({ repo: dir }), /\(scripts\/store\/anything\.mjs\)/);
});

test('a file deleted from scripts/store/ is refused', () => {
    const dir = fresh();
    fs.rmSync(path.join(dir, 'scripts/store/settings-proof.mjs'));
    assert.match(storeToolingProblem({ repo: dir }), /\(scripts\/store\/settings-proof\.mjs\)/);
});

test('a checkout behind origin/master is refused: a stale calendar would miss the freeze', () => {
    const dir = fresh();
    const other = path.join(tmp, `other-${count}`);
    git(tmp, 'clone', '-q', `${dir}.git`, other);
    git(other, 'config', 'user.email', 'test@example.com');
    git(other, 'config', 'user.name', 'test');
    fs.writeFileSync(path.join(other, 'scripts/release-calendar.json'), `${JSON.stringify({ flip: '2027-03-01', status: 'provisional', source: 'ticket 10' })}\n`);
    git(other, 'commit', '-q', '-am', 'set the Flip');
    git(other, 'push', '-q', 'origin', 'master');
    assert.match(storeToolingProblem({ repo: dir }), /\(scripts\/release-calendar\.json\)/);
    git(dir, 'pull', '-q', '--ff-only', 'origin', 'master');
    assert.equal(storeToolingProblem({ repo: dir }), null);
});

test('before origin/master has the store tooling, nothing may write', () => {
    const dir = fresh({ onMaster: false });
    assert.match(storeToolingProblem({ repo: dir }), /differs from origin\/master's \(scripts\/lib\/is-main\.mjs, /);
});

test('a fetch that fails refuses: the check needs origin/master', () => {
    const dir = fresh();
    fs.rmSync(`${dir}.git`, { recursive: true, force: true });
    assert.match(storeToolingProblem({ repo: dir }), /^couldn't fetch origin master, so the store helper can't check that it runs master's rules: /);
});

test('the git it runs is the one given: fetch, then the tree, then the hashes', () => {
    const calls = [];
    const stub = args => {
        calls.push(args.join(' '));
        if (args[0] === 'fetch') return { status: 0, stdout: '', stderr: '' };
        if (args[0] === 'ls-tree') return { status: 0, stdout: '', stderr: '' };
        return { status: 128, stdout: '', stderr: 'fatal: no' };
    };
    assert.match(storeToolingProblem({ repo: fresh(), git: stub }), /couldn't hash this checkout's store tooling/);
    assert.deepEqual(calls.map(call => call.split(' ')[0]), ['fetch', 'ls-tree', 'hash-object']);
    assert.match(calls[0], /^fetch -q origin \+refs\/heads\/master:refs\/remotes\/origin\/master$/);
});

// The local modules a script imports, and theirs, as repo-relative paths.
function importClosure(entries) {
    const seen = new Set();
    const visit = file => {
        if (seen.has(file)) return;
        seen.add(file);
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const [, spec] of text.matchAll(/^[ \t]*(?:import|export)\b[^;]*?\bfrom\s*['"](\.\.?\/[^'"]+)['"]/gm)) {
            visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
        }
    };
    entries.forEach(visit);
    return [...seen].sort();
}

test('STORE_TOOLING is every module the commands import outside scripts/store/, plus the calendar, and all of it is guarded', () => {
    const commands = fs.readdirSync(path.join(ROOT, STORE_FOLDER)).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')).map(name => `${STORE_FOLDER}/${name}`);
    const outside = importClosure(commands).filter(file => !file.startsWith(`${STORE_FOLDER}/`));
    assert.deepEqual([...STORE_TOOLING].sort(), [...outside, 'scripts/release-calendar.json'].sort());
    const patterns = readGuardedPaths();
    for (const file of [...STORE_TOOLING, `${STORE_FOLDER}/tooling.mjs`]) assert.ok(isGuarded(file, patterns), `${file} should be guarded`);
});
