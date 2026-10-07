// W0-1: an agent push (--confirm-nonprod) runs only from master at origin/master's tip. The flag is
// judged by the release calendar and the targets in the checkout that runs the release, so without
// this a stale checkout (a main clone that hasn't pulled the calendar PR, or a worktree made before
// it) would push past the T-21 freeze or the Flip with no one typing (rf/safety and rf/skeptic on
// PR #18). merge.sh keeps the same rule for merges: a PR is judged by master's rules, never its own.
//
//   import { checkoutProblems, gitIn, readCheckout, stepFiveOrigin } from './release-origin.mjs';
//   checkoutProblems(readCheckout({ git: gitIn(), fetch: true }))   // before step 1: [] or one line per problem
//   stepFiveOrigin({ git: gitIn(), sha })                            // step 5: { problems, note }
//
// A typed push isn't checked: the person at the terminal decides what goes out (docs/releasing.md).

import { execFileSync } from 'child_process';

export const ORIGIN_MASTER = 'refs/remotes/origin/master';

// What decides whether --confirm-nonprod is taken, and what is pushed: release.sh, the release
// calendar, release.mjs and every module it imports. origin/master may move on while a release
// builds; step 5 lets the push go on only if none of these changed. A test keeps the list in step
// with release.mjs's imports (release-origin.test.mjs).
export const RELEASE_TOOLING = [
    'scripts/check-contrast.mjs',
    'scripts/lib/format.mjs',
    'scripts/lib/is-main.mjs',
    'scripts/lib/release-calendar.mjs',
    'scripts/lib/store-token.mjs',
    'scripts/release-args.mjs',
    'scripts/release-calendar.json',
    'scripts/release-capture.mjs',
    'scripts/release-checks.mjs',
    'scripts/release-diff.mjs',
    'scripts/release-guard.mjs',
    'scripts/release-lighthouse.mjs',
    'scripts/release-log.mjs',
    'scripts/release-origin.mjs',
    'scripts/release-prune.mjs',
    'scripts/release-redact.mjs',
    'scripts/release-schema.mjs',
    'scripts/release-targets.mjs',
    'scripts/release-themes.mjs',
    'scripts/release-tree-ids.mjs',
    'scripts/release.mjs',
    'scripts/release.sh',
    'scripts/store/tooling.mjs',
];

const short = sha => sha.slice(0, 7);
const firstLine = text => String(text || '').trim().split('\n')[0];

// git in `cwd`: by default the folder release.sh runs in, the checkout's root. Throws on a failure.
export function gitIn(cwd = process.cwd()) {
    return (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

// { out } or { error: git's first line of stderr }.
function tryGit(git, ...args) {
    try {
        return { out: git(...args) };
    } catch (error) {
        return { error: firstLine(error.stderr) || firstLine(error.message) };
    }
}

// Fetches origin's master into origin/master (only that ref, as merge.sh does), then reads the
// checkout: { fetchError, branch, head, originMaster }. branch is 'HEAD' on a detached HEAD; a value
// git can't read is null.
export function readCheckout({ git, fetch }) {
    const fetched = fetch ? tryGit(git, 'fetch', '-q', 'origin', `+refs/heads/master:${ORIGIN_MASTER}`) : {};
    return {
        fetchError: fetched.error || null,
        branch: tryGit(git, 'rev-parse', '--abbrev-ref', 'HEAD').out || null,
        head: tryGit(git, 'rev-parse', 'HEAD').out || null,
        originMaster: tryGit(git, 'rev-parse', '-q', '--verify', `${ORIGIN_MASTER}^{commit}`).out || null,
    };
}

// Before step 1: why this checkout can't send an agent push, or []. It must be master at
// origin/master's tip, so it sends only merged code and is judged by origin/master's calendar.
export function checkoutProblems({
    fetchError, branch, head, originMaster,
}) {
    if (fetchError) return [`couldn't fetch origin's master (${fetchError}), so this release can't check that it runs origin/master's calendar and targets`];
    const problems = [];
    const onMaster = 'run the release from the main clone, on master';
    if (branch === 'HEAD') problems.push(`this checkout is on a detached HEAD, not master: ${onMaster}`);
    else if (branch !== 'master') problems.push(`this checkout is on ${branch ? `branch ${branch}` : 'no branch git can read'}, not master: ${onMaster}`);
    if (!originMaster) problems.push('there is no origin/master to compare with');
    else if (!head) problems.push('git can\'t read this checkout\'s HEAD');
    else if (head !== originMaster) problems.push(`HEAD ${short(head)} isn't origin/master's tip ${short(originMaster)}: git pull --ff-only origin master, then rerun`);
    return problems;
}

const isAncestor = (git, sha, tip) => !('error' in tryGit(git, 'merge-base', '--is-ancestor', sha, tip));

// Step 5: fetches again. origin/master may have moved on while the release built and ran its gates
// (another PR merged). The push still sends `sha`, the commit prepare checked at origin/master's tip,
// as long as it is still in origin/master's history and no file of RELEASE_TOOLING changed since:
// the calendar and targets that judged the flag are still origin/master's. A calendar or target
// change merged meanwhile stops the push. Returns { problems, note }.
export function stepFiveOrigin({ git, sha }) {
    const now = readCheckout({ git, fetch: true });
    const stop = problem => ({ problems: [problem], note: null });
    if (now.fetchError) return stop(`couldn't fetch origin's master again (${now.fetchError})`);
    if (!now.originMaster) return stop('there is no origin/master to compare with');
    if (now.originMaster === sha) return { problems: [], note: `${short(sha)} is still origin/master's tip` };
    if (!isAncestor(git, sha, now.originMaster)) return stop(`${short(sha)} is no longer in origin/master's history (its tip is ${short(now.originMaster)})`);
    const changed = tryGit(git, 'diff', '--name-only', sha, now.originMaster, '--', ...RELEASE_TOOLING);
    if ('error' in changed) return stop(`can't compare ${short(sha)} with origin/master's tip ${short(now.originMaster)}: ${changed.error}`);
    const files = changed.out.split('\n').filter(Boolean);
    if (files.length) {
        return stop(`origin/master moved on to ${short(now.originMaster)} while this release ran, and changed the release tooling or the calendar since ${short(sha)} (${files.join(', ')}): pull and rerun the release`);
    }
    return {
        problems: [],
        note: `origin/master moved on to ${short(now.originMaster)} while this release ran, but changed none of the release tooling or the calendar, so the push sends ${short(sha)} as checked`,
    };
}
