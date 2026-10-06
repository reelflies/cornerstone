// Tests scripts/merge.sh as an agent runs it, offline, against a stubbed gh (W0-13). Each
// refusal must name its reason, merge nothing and leave the merge lock free.
//
// merge.sh judges every PR with origin/master's merge tooling, so each case runs a copy of
// that tooling in a scratch clone whose origin is a local bare repo holding the same files.

/* eslint-disable no-param-reassign -- each case edits a fresh copy of the passing fixture */

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGhStub } from './lib/gh-stub.mjs';

const SOURCE = fileURLToPath(new URL('..', import.meta.url));
const GUARDED = fs.readFileSync(new URL('./guarded-paths.txt', import.meta.url), 'utf8');
const TOOLING = [.../^TOOLING=\(([^)]*)\)/m.exec(fs.readFileSync(new URL('./merge.sh', import.meta.url), 'utf8'))[1].matchAll(/\S+/g)].map(([file]) => file);
const REPO = 'reelflies/reelflies-cornerstone';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const MASTER = 'fedcba9876543210fedcba9876543210fedcba98';
const HOME_PNG = 'scripts/qa/baselines/1895766-reelflies-ca/home-phone-375-darwin.png';
const FULL = ['rf/gates', 'rf/standards', 'rf/spec', 'rf/skeptic'];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-merge-test-'));
after(() => fs.rmSync(root, { recursive: true, force: true }));
const gh = makeGhStub(path.join(root, 'bin'));
const LOCKS = path.join(root, 'locks');
const LOCK = path.join(LOCKS, 'merge');

function git(cwd, ...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
}

const copyTooling = dir => {
    for (const file of TOOLING) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(SOURCE, file), path.join(dir, file));
    }
};

// A clone at <name> whose origin (<name>.git) has a master. With tooling: false, master has
// no merge tooling yet (the W0-13 bootstrap), and the clone has it on a branch.
function clone(name, { tooling = true } = {}) {
    const origin = path.join(root, `${name}.git`);
    const dir = path.join(root, name);
    git(root, 'init', '-q', '--bare', '-b', 'master', origin);
    fs.mkdirSync(dir);
    git(dir, 'init', '-q', '-b', 'master');
    git(dir, 'config', 'user.email', 'test@example.com');
    git(dir, 'config', 'user.name', 'test');
    git(dir, 'remote', 'add', 'origin', origin);
    if (tooling) copyTooling(dir);
    else fs.writeFileSync(path.join(dir, 'README.md'), 'master before W0-13\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'master');
    git(dir, 'push', '-q', 'origin', 'master');
    if (!tooling) {
        git(dir, 'checkout', '-q', '-b', 'w0/13-guardrails');
        copyTooling(dir);
        git(dir, 'add', '-A');
        git(dir, 'commit', '-q', '-m', 'merge tooling');
    }
    return dir;
}

const MAIN = clone('main');

const statuses = (contexts, state = 'success') => contexts.map(context => ({
    context, state, description: `${context} verdict`, target_url: `https://github.com/${REPO}/pull/12#issuecomment-1`,
}));

function good() {
    return {
        pr: {
            number: 12,
            state: 'OPEN',
            isDraft: false,
            baseRefName: 'master',
            headRefName: 't27/header',
            headRefOid: SHA,
            isCrossRepository: false,
            title: 'Header and shipping strip (ticket 27)',
            url: `https://github.com/${REPO}/pull/12`,
            reviewDecision: '',
            body: 'What and why.\n\nBaselines: home\n',
        },
        compare: {
            status: 'ahead', ahead_by: 3, behind_by: 0, base_commit: { sha: MASTER },
        },
        files: [
            { filename: 'assets/js/theme/reelflies/header.js', status: 'added' },
            { filename: HOME_PNG, status: 'modified' },
        ],
        checkRuns: [
            {
                name: 'checks', status: 'completed', conclusion: 'success', html_url: 'https://github.com/x/1',
            },
            {
                name: 'baseline-scope', status: 'completed', conclusion: 'success', html_url: 'https://github.com/x/2',
            },
        ],
        statuses: statuses(FULL),
        threads: [],
        masterGuarded: GUARDED,
    };
}

function run(args, fixture = good(), { checkout = MAIN, env: extra = {} } = {}) {
    if (fixture.pr && fixture.pr.changedFiles === undefined) fixture.pr.changedFiles = (fixture.files || []).length;
    gh.write(fixture);
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RF_')));
    const result = spawnSync('bash', [path.join(checkout, 'scripts', 'merge.sh'), ...args], {
        encoding: 'utf8',
        env: {
            ...env, ...gh.env, RF_LOCK_ROOT: LOCKS, PATH: `${gh.dir}${path.delimiter}${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, ...extra,
        },
        timeout: 30000,
    });
    return {
        status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`, calls: gh.calls(),
    };
}

const merged = calls => calls.some(call => call[0] === 'pr' && call[1] === 'merge');

function assertRefused(result, reason) {
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, reason);
    assert.match(result.stderr, /Nothing was merged/);
    assert.ok(!merged(result.calls), 'gh pr merge must not run');
    assert.ok(!fs.existsSync(LOCK), 'the merge lock must be released');
}

const mutate = change => {
    const fixture = good();
    change(fixture);
    return fixture;
};

// --- Merging ------------------------------------------------------------------------------

test('merge.sh merges a PR that passes every check, pinned to the head sha, and frees the lock', () => {
    const result = run(['12']);
    assert.equal(result.status, 0, result.output);
    const merge = result.calls.find(call => call[0] === 'pr' && call[1] === 'merge');
    assert.deepEqual(merge, ['pr', 'merge', '12', '-R', REPO, '--merge', '--delete-branch', '--match-head-commit', SHA]);
    assert.match(result.stdout, /Merged PR #12/);
    assert.ok(!fs.existsSync(LOCK));
});

test('every gh pr call names the repo, and every API call is for it', () => {
    const { calls } = run(['12']);
    assert.ok(calls.length >= 6, JSON.stringify(calls));
    for (const call of calls.filter(c => c[0] === 'pr')) assert.equal(call[call.indexOf('-R') + 1], REPO, call.join(' '));
    for (const call of calls.filter(c => c[0] === 'api')) {
        const endpoint = call.find(arg => arg.startsWith('repos/') || arg === 'graphql');
        assert.ok(endpoint === 'graphql' || endpoint.startsWith(`repos/${REPO}/`), call.join(' '));
    }
    const statusCall = calls.find(call => call.some(arg => /\/commits\/[0-9a-f]+\/status/.test(arg)));
    assert.ok(statusCall.some(arg => arg.includes(SHA)), 'the statuses are read on the head sha');
});

test('a docs-only PR merges with CI and rf/review alone', () => {
    const result = run(['12'], mutate(fixture => {
        fixture.files = [{ filename: 'docs/research/07-probes.md', status: 'added' }, { filename: 'README.md', status: 'modified' }];
        fixture.statuses = statuses(['rf/review']);
        fixture.pr.body = 'Research notes.\n\nBaselines: none\n';
    }));
    assert.equal(result.status, 0, result.output);
    assert.ok(merged(result.calls));
});

test('a release log changes RELEASES.md, which the release tooling reads, so it needs rf/safety beside rf/review', () => {
    const log = fixture => {
        fixture.files = [{ filename: 'RELEASES.md', status: 'modified' }];
        fixture.pr.body = 'Release log.\n\nBaselines: none\n';
    };
    assertRefused(run(['12'], mutate(fixture => {
        log(fixture);
        fixture.statuses = statuses(['rf/review']);
    })), /guarded paths \(RELEASES\.md\), so it needs rf\/safety too/);
    const result = run(['12'], mutate(fixture => {
        log(fixture);
        fixture.statuses = statuses(['rf/review', 'rf/safety']);
    }));
    assert.equal(result.status, 0, result.output);
    assert.ok(merged(result.calls));
});

test('a CLAUDE.md or AGENTS.md anywhere steers agents, so it is never docs-only', () => {
    assertRefused(run(['12'], mutate(fixture => {
        fixture.files = [{ filename: 'docs/qa/CLAUDE.md', status: 'added' }];
        fixture.statuses = statuses(['rf/review']);
    })), /rf\/gates has no status/);
    assertRefused(run(['12'], mutate(fixture => {
        fixture.files = [{ filename: 'AGENTS.md', status: 'added' }];
        fixture.statuses = statuses([...FULL]);
    })), /guarded paths \(AGENTS\.md\), so it needs rf\/safety too/);
});

test('a docs-only PR with no rf/review is refused', () => {
    assertRefused(run(['12'], mutate(fixture => {
        fixture.files = [{ filename: 'docs/x.md', status: 'added' }];
        fixture.statuses = [];
    })), /rf\/review has no status/);
});

test('a PR touching a guarded path merges once rf/safety passes too', () => {
    const result = run(['12'], mutate(fixture => {
        fixture.files.push({ filename: '.github/workflows/reelflies-checks.yml', status: 'modified' });
        fixture.statuses = statuses([...FULL, 'rf/safety']);
    }));
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /guarded/);
    assert.ok(merged(result.calls));
});

// --- Refusals -----------------------------------------------------------------------------

const refusals = [
    ['a closed PR', fixture => { fixture.pr.state = 'CLOSED'; }, /PR #12 is CLOSED, not open/],
    ['a draft', fixture => { fixture.pr.isDraft = true; }, /is a draft/],
    ['a PR that targets another branch', fixture => { fixture.pr.baseRefName = 'release/x'; }, /targets "release\/x", not master/],
    ['a PR from a fork', fixture => { fixture.pr.isCrossRepository = true; }, /comes from a fork/],
    ['a branch behind master', fixture => {
        fixture.compare = {
            status: 'diverged', ahead_by: 3, behind_by: 2, base_commit: { sha: MASTER },
        };
    }, /doesn't contain master's tip \(fedcba9\): 2 commits behind; rebase onto origin\/master/],
    ['a compare answer with no behind_by', fixture => { fixture.compare = { status: 'ahead', base_commit: { sha: MASTER } }; }, /couldn't tell whether the branch contains master's tip/],
    ['a head with no CI', fixture => { fixture.checkRuns = []; }, /no CI check ran on 0123456/],
    ['a failed CI check', fixture => { fixture.checkRuns[0].conclusion = 'failure'; }, /check "checks" is failure/],
    ['a CI check still running', fixture => { fixture.checkRuns[0].status = 'in_progress'; fixture.checkRuns[0].conclusion = null; }, /check "checks" hasn't finished/],
    ['no baseline-scope check', fixture => { fixture.checkRuns.pop(); }, /check "baseline-scope" didn't run on 0123456/],
    ['a skipped checks job', fixture => { fixture.checkRuns[0].conclusion = 'skipped'; }, /check "checks" is skipped on 0123456; merge\.sh needs it to succeed/],
    ['a neutral baseline-scope check', fixture => { fixture.checkRuns[1].conclusion = 'neutral'; }, /check "baseline-scope" is neutral on 0123456; merge\.sh needs it to succeed/],
    ['a file list GitHub cut short', fixture => { fixture.pr.changedFiles = 3; }, /GitHub lists 2 of the 3 files PR #12 changes/],
    ['a PR GitHub can\'t list in full', fixture => {
        fixture.files = Array.from({ length: 3000 }, (_, i) => ({ filename: `node_modules/x/${i}.js`, status: 'added' }));
        fixture.pr.body = 'Baselines: none';
    }, /PR #12 changes 3000 files.*at most 3000/],
    ['a PR view with no changedFiles', fixture => { fixture.pr.changedFiles = null; }, /couldn't tell how many files PR #12 changes/],
    ['a guarded folder spelled in another case', fixture => { fixture.files.push({ filename: '.Claude/settings.json', status: 'added' }); }, /guarded paths \(\.Claude\/settings\.json\), so it needs rf\/safety too/],
    ['a missing sign-off', fixture => { fixture.statuses = statuses(['rf/gates', 'rf/standards', 'rf/skeptic']); }, /rf\/spec has no status on 0123456/],
    ['a failed sign-off', fixture => { fixture.statuses[3].state = 'failure'; }, /rf\/skeptic is failure on 0123456: rf\/skeptic verdict/],
    ['a pending gate status', fixture => { fixture.statuses[0].state = 'pending'; }, /rf\/gates is pending/],
    ['any other failing status', fixture => { fixture.statuses.push(...statuses(['ci/other'], 'error')); }, /status "ci\/other" is error/],
    ['an unresolved review thread', fixture => { fixture.threads = [{ isResolved: false, path: 'a.js', comments: { nodes: [{ url: 'https://github.com/x#r1' }] } }, { isResolved: true }]; }, /1 review thread is unresolved: https:\/\/github\.com\/x#r1/],
    ['more threads than one page', fixture => { fixture.moreThreads = true; }, /more than 100 review threads/],
    ['changes requested', fixture => { fixture.pr.reviewDecision = 'CHANGES_REQUESTED'; }, /changes requested/],
    ['a guarded path without rf/safety', fixture => { fixture.files.push({ filename: 'scripts/release.sh', status: 'modified' }); }, /touches guarded paths \(scripts\/release\.sh\), so it needs rf\/safety too: rf\/safety has no status/],
    ['a guarded file renamed away', fixture => { fixture.files.push({ filename: 'scripts/old-merge.sh', previous_filename: 'scripts/merge.sh', status: 'renamed' }); }, /guarded paths \(scripts\/merge\.sh\)/],
    ['a baseline outside the Baselines line', fixture => { fixture.pr.body = 'Baselines: product'; }, /baseline scope: 1 changed baseline outside "Baselines: product": scripts\/qa\/baselines\/1895766-reelflies-ca\/home-phone-375-darwin\.png/],
    ['a baseline with no Baselines line', fixture => { fixture.pr.body = 'What and why.'; }, /baseline scope: .*no "Baselines:" line/],
    ['a path that only master\'s guarded list names', fixture => { fixture.masterGuarded = 'assets/js/theme/reelflies/\n'; }, /guarded paths \(assets\/js\/theme\/reelflies\/header\.js\)/],
    ['an unreadable guarded list on master', fixture => { fixture.masterGuarded = 500; }, /couldn't read scripts\/guarded-paths\.txt on master/],
    ['an unknown PR', fixture => { fixture.pr = null; }, /couldn't read PR #12/],
];

for (const [name, change, reason] of refusals) {
    test(`merge.sh refuses ${name}`, () => {
        assertRefused(run(['12'], mutate(change)), reason);
    });
}

test('a CI check other than the two required ones may be skipped or neutral', () => {
    const result = run(['12'], mutate(fixture => {
        fixture.checkRuns.push({
            name: 'optional', status: 'completed', conclusion: 'skipped', html_url: 'https://github.com/x/3',
        });
    }));
    assert.equal(result.status, 0, result.output);
});

// --- Master's rules, never the PR's -------------------------------------------------------

const MERGE_FROM_MAIN = /differs from origin\/master's .*run merge\.sh from the main clone/;

test('merge.sh refuses to run merge tooling that differs from origin/master\'s, before anything reaches GitHub', () => {
    const file = path.join(MAIN, 'scripts', 'merge.mjs');
    const before = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, before.replace('if (guarded.length) required.push(SAFETY);', ''));
    try {
        const result = run(['12'], mutate(fixture => {
            fixture.files.push({ filename: 'scripts/merge.mjs', status: 'modified' });
        }));
        assertRefused(result, MERGE_FROM_MAIN);
        assert.match(result.stderr, /scripts\/merge\.mjs/);
        assert.deepEqual(result.calls, [], 'nothing reaches GitHub');
    } finally {
        fs.writeFileSync(file, before);
    }
});

test('a PR branch that changes the guarded-path matcher can\'t merge itself from its own checkout', () => {
    git(MAIN, 'checkout', '-q', '-b', 'pr/unguard');
    try {
        const file = path.join(MAIN, 'scripts', 'lib', 'guarded-paths.mjs');
        fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('export function isGuarded(file, patterns) {', 'export function isGuarded(file, patterns) {\n    if (file) return false;'));
        git(MAIN, 'commit', '-q', '-am', 'unguard everything');
        const result = run(['12'], mutate(fixture => {
            fixture.files.push({ filename: 'scripts/lib/guarded-paths.mjs', status: 'modified' });
        }));
        assertRefused(result, MERGE_FROM_MAIN);
        assert.match(result.stderr, /scripts\/lib\/guarded-paths\.mjs/);
        for (const check of ['--check', '--lock-held']) {
            const other = run([check, '12']);
            assert.equal(other.status, 1, other.output);
            assert.match(other.stderr, MERGE_FROM_MAIN);
        }
    } finally {
        git(MAIN, 'checkout', '-q', 'master');
        git(MAIN, 'branch', '-q', '-D', 'pr/unguard');
    }
});

test('a checkout behind origin/master\'s merge tooling is refused, and told to pull', () => {
    const behind = clone('behind');
    const other = path.join(root, 'behind-other');
    git(root, 'clone', '-q', path.join(root, 'behind.git'), other);
    git(other, 'config', 'user.email', 'test@example.com');
    git(other, 'config', 'user.name', 'test');
    fs.appendFileSync(path.join(other, 'scripts', 'lib', 'lock.mjs'), '// a newer lock\n');
    git(other, 'commit', '-q', '-am', 'newer lock on master');
    git(other, 'push', '-q', 'origin', 'master');
    const result = run(['12'], good(), { checkout: behind });
    assertRefused(result, MERGE_FROM_MAIN);
    assert.match(result.stderr, /scripts\/lib\/lock\.mjs/);
    assert.match(result.stderr, /pull --ff-only/);
});

test('merge.sh refuses when it can\'t fetch origin/master to compare with', () => {
    const lost = clone('lost');
    git(lost, 'remote', 'set-url', 'origin', path.join(root, 'nowhere.git'));
    const result = run(['12'], good(), { checkout: lost });
    assertRefused(result, /couldn't fetch origin master/);
    assert.deepEqual(result.calls, []);
});

test('while origin/master has no merge tooling (the W0-13 bootstrap), the checkout\'s own applies', () => {
    const bootstrap = clone('bootstrap', { tooling: false });
    const result = run(['12'], good(), { checkout: bootstrap });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /origin\/master has no scripts\/merge\.mjs yet/);
    assert.ok(merged(result.calls));
});

test('RF_LOCK_ROOT is a test seam: outside node --test merge.sh refuses it and takes no lock', () => {
    const home = path.join(root, 'home');
    fs.mkdirSync(home, { recursive: true });
    const result = run(['12'], good(), { env: { NODE_TEST_CONTEXT: '', HOME: home } });
    assertRefused(result, /RF_LOCK_ROOT is a test seam/);
    assert.deepEqual(fs.readdirSync(home), [], 'nothing was made under HOME');
});

test('with no guarded list on master yet, this checkout\'s list applies', () => {
    const result = run(['12'], mutate(fixture => {
        fixture.masterGuarded = null;
        fixture.files.push({ filename: '.github/workflows/new.yml', status: 'added' });
    }));
    assertRefused(result, /needs rf\/safety/);
    assert.match(result.output, /master has no scripts\/guarded-paths\.txt yet/);
});

test('every reason is listed at once', () => {
    const result = run(['12'], mutate(fixture => {
        fixture.pr.isDraft = true;
        fixture.statuses = [];
        fixture.pr.body = 'nothing';
    }));
    assertRefused(result, /is a draft/);
    for (const reason of [/rf\/gates has no status/, /rf\/standards has no status/, /rf\/spec has no status/, /rf\/skeptic has no status/, /baseline scope/]) {
        assert.match(result.stderr, reason);
    }
});

test('merge.sh needs exactly one PR number', () => {
    for (const args of [[], ['abc'], ['12', '13'], ['--force', '12']]) {
        const result = run(args);
        assert.equal(result.status, 2, `${args.join(' ')}: ${result.output}`);
        assert.match(result.stderr, /usage: scripts\/merge\.sh/);
        assert.deepEqual(result.calls, [], 'nothing reaches GitHub');
    }
});

test('a failed gh pr merge fails the run and frees the lock', () => {
    const result = run(['12'], mutate(fixture => { fixture.mergeError = 'GraphQL: Head branch was modified. Review and try the merge again.'; }));
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /gh pr merge failed/);
    assert.ok(!fs.existsSync(LOCK));
});

// --- The merge lock -----------------------------------------------------------------------

const holdLock = (owner, minutesAgo = 0) => {
    fs.mkdirSync(LOCK, { recursive: true });
    fs.writeFileSync(path.join(LOCK, 'owner.txt'), `${owner}\n`);
    const then = new Date(Date.now() - minutesAgo * 60000);
    fs.utimesSync(path.join(LOCK, 'owner.txt'), then, then);
};
const freeLock = () => fs.rmSync(LOCK, { recursive: true, force: true });

test('a merge lock held by someone else stops merge.sh before it reads anything', () => {
    holdLock('W0-4 rebasing 2026-10-06T10:00');
    try {
        const result = run(['12']);
        assert.equal(result.status, 1, result.output);
        assert.match(result.stderr, /merge lock is held.*\n?.*W0-4 rebasing/);
        assert.deepEqual(result.calls, []);
        assert.ok(fs.existsSync(LOCK), 'someone else\'s lock is left alone');
    } finally {
        freeLock();
    }
});

test('a stale merge lock is broken with a note', () => {
    holdLock('W0-4 2026-10-06T08:00', 46);
    const result = run(['12']);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /STALE.*W0-4 2026-10-06T08:00/);
    assert.ok(!fs.existsSync(LOCK));
});

test('--check reports without merging and without taking the lock', () => {
    holdLock('W0-4 rebasing');
    try {
        const pass = run(['--check', '12']);
        assert.equal(pass.status, 0, pass.output);
        assert.match(pass.stdout, /would merge/);
        assert.ok(!merged(pass.calls));
        const fail = run(['--check', '12'], mutate(fixture => { fixture.pr.isDraft = true; }));
        assert.equal(fail.status, 1);
        assert.match(fail.stderr, /is a draft/);
        assert.ok(fs.existsSync(LOCK), 'the other holder\'s lock is untouched');
    } finally {
        freeLock();
    }
});

test('--lock-held merges under a lock the caller holds for this PR, and leaves it for the caller', () => {
    holdLock('W0-13 PR #12 rebasing');
    try {
        const result = run(['--lock-held', '12']);
        assert.equal(result.status, 0, result.output);
        assert.ok(merged(result.calls));
        assert.ok(fs.existsSync(LOCK), 'the caller releases its own lock');
    } finally {
        freeLock();
    }
});

test('--lock-held is refused when no lock is held, or the lock names another PR', () => {
    const none = run(['--lock-held', '12']);
    assert.equal(none.status, 1);
    assert.match(none.stderr, /--lock-held, but no merge lock is held/);
    assert.ok(!merged(none.calls));

    holdLock('W0-4 PR #13');
    try {
        const other = run(['--lock-held', '12']);
        assert.equal(other.status, 1);
        assert.match(other.stderr, /doesn't name PR #12/);
        assert.ok(!merged(other.calls));
    } finally {
        freeLock();
    }
});
