// The checks behind scripts/merge.sh (W0-13), the only way agents merge a PR into master.
// Run it through merge.sh; docs/guardrails.md explains each check and refusal.
//
// GitHub Free can't protect master on a private repo, so this script is the protection: it
// merges only when every check below passes on the PR's head sha, and pins the merge to that
// sha. Every refusal names its reason, and all of them are listed at once. merge.sh runs it
// only when this file and everything it imports match origin/master's, so a PR is judged by
// master's rules, never by its own.
//
//   1 the PR is open, not a draft, targets master and comes from this repo
//   2 its branch contains master's tip
//   3 every CI check on the head sha passed, and "checks" and "baseline-scope" succeeded
//   4 the sign-off statuses are "success" on the head sha: rf/gates, rf/standards, rf/spec
//     and rf/skeptic, or rf/review alone for a docs-only PR; and no other status failed
//   5 a PR that touches a guarded path (scripts/guarded-paths.txt, master's copy and this
//     checkout's) also has rf/safety
//   6 no review thread is unresolved, and no reviewer asked for changes
//   7 GitHub listed every file the PR changes, so no path goes unseen
//   8 the PR body's "Baselines:" line covers every changed baseline (check-baseline-scope.mjs)

import fs from 'fs';
import path from 'path';
import { checkScope, summarizeScope } from './check-baseline-scope.mjs';
import {
    REPO, ghApi, ghGraphql, ghPr,
} from './lib/gh.mjs';
import { GUARDED_PATHS_FILE, guardedFiles, parseGuardedPaths } from './lib/guarded-paths.mjs';
import { isMain } from './lib/is-main.mjs';
import { acquireLock, lockRoot, readLockOwner } from './lib/lock.mjs';

export const SIGN_OFFS = ['rf/gates', 'rf/standards', 'rf/spec', 'rf/skeptic'];
export const DOCS_SIGN_OFF = 'rf/review';
export const SAFETY = 'rf/safety';
// These two must succeed. Any other check may also finish neutral or skipped.
export const REQUIRED_CHECKS = ['checks', 'baseline-scope'];
const PASSING_CONCLUSIONS = ['success', 'neutral', 'skipped'];
// GitHub's pulls/<n>/files lists at most this many files.
export const FILES_API_LIMIT = 3000;

const USAGE = 'usage: scripts/merge.sh [--check | --lock-held] <pr number>';

class UsageError extends Error {}

export function parseArgs(argv) {
    const options = { check: false, lockHeld: false };
    const rest = [];
    for (const arg of argv) {
        if (arg === '--check') options.check = true;
        else if (arg === '--lock-held') options.lockHeld = true;
        else if (arg.startsWith('-')) throw new UsageError(`unknown flag ${arg}`);
        else rest.push(arg);
    }
    if (rest.length !== 1 || !/^[1-9]\d*$/.test(rest[0])) throw new UsageError('name exactly one PR number');
    if (options.check && options.lockHeld) throw new UsageError('--check takes no lock, so --lock-held means nothing with it');
    return { ...options, pr: Number(rest[0]) };
}

// Markdown anywhere, or anything under docs/: research notes, the spike doc, release logs.
// A CLAUDE.md or AGENTS.md steers agents, so it is never docs, wherever it is.
const AGENT_INSTRUCTIONS = /(^|\/)(claude|claude\.local|agents)\.md$/i;
export const isDocsOnly = files => files.length > 0 && files.every(file => !AGENT_INSTRUCTIONS.test(file) && (file.endsWith('.md') || file.startsWith('docs/')));

const short = sha => String(sha || '').slice(0, 7);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const THREADS = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes { isResolved path comments(first: 1) { nodes { url } } }
        pageInfo { hasNextPage }
      }
    }
  }
}`;

// What GitHub says about the PR. A read that fails becomes a refusal, never a pass.
export function gather(number) {
    const facts = { notes: [], errors: [] };
    const read = (what, fn) => {
        try {
            return fn();
        } catch (error) {
            facts.errors.push(`couldn't read ${what}: ${error.message}`);
            return undefined;
        }
    };
    facts.pr = read(`PR #${number}`, () => ghPr(['view', String(number), '--json', 'number,state,isDraft,baseRefName,headRefName,headRefOid,isCrossRepository,title,url,body,reviewDecision,changedFiles']));
    if (!facts.pr) return facts;
    const sha = facts.pr.headRefOid;
    facts.compare = read(`how ${short(sha)} compares with master`, () => ghApi(`compare/master...${sha}`));
    const listed = read(`PR #${number}'s files`, () => ghApi(`pulls/${number}/files?per_page=100`, ['--paginate', '--slurp']).flat());
    if (listed) {
        facts.listedFiles = listed.length;
        facts.files = listed.flatMap(file => [file.filename, file.previous_filename].filter(Boolean));
    }
    facts.checkRuns = read(`the CI checks on ${short(sha)}`, () => {
        const answer = ghApi(`commits/${sha}/check-runs?per_page=100`);
        if (answer.total_count > answer.check_runs.length) throw new Error(`${answer.total_count} check runs, more than one page of 100`);
        return answer.check_runs;
    });
    facts.statuses = read(`the statuses on ${short(sha)}`, () => ghApi(`commits/${sha}/status?per_page=100`).statuses);
    const threads = read(`PR #${number}'s review threads`, () => ghGraphql(THREADS, { owner: REPO.split('/')[0], name: REPO.split('/')[1], number }).data.repository.pullRequest.reviewThreads);
    if (threads) {
        facts.threads = threads.nodes;
        facts.moreThreads = threads.pageInfo.hasNextPage;
    }

    // Master's list is the authority, so a PR can't unguard a path by editing its own copy.
    let master = null;
    try {
        master = parseGuardedPaths(ghApi('contents/scripts/guarded-paths.txt?ref=master', ['-H', 'Accept: application/vnd.github.raw+json'], { json: false }));
    } catch (error) {
        if (/HTTP 404/.test(error.message)) facts.notes.push('master has no scripts/guarded-paths.txt yet, so this checkout\'s list applies');
        else facts.errors.push(`couldn't read scripts/guarded-paths.txt on master: ${error.message}`);
    }
    const local = fs.existsSync(GUARDED_PATHS_FILE) ? parseGuardedPaths(fs.readFileSync(GUARDED_PATHS_FILE, 'utf8')) : null;
    if (!master && !local) facts.errors.push('there is no scripts/guarded-paths.txt on master or in this checkout');
    facts.guardedPatterns = [...new Set([...(master || []), ...(local || [])])];
    return facts;
}

export function evaluate(facts) {
    const refusals = [...facts.errors];
    const oks = [];
    const { pr } = facts;
    if (!pr) return { refusals, oks };
    const head = short(pr.headRefOid);

    const before = refusals.length;
    if (pr.state !== 'OPEN') refusals.push(`PR #${pr.number} is ${pr.state}, not open`);
    if (pr.isDraft) refusals.push(`PR #${pr.number} is a draft`);
    if (pr.baseRefName !== 'master') refusals.push(`PR #${pr.number} targets "${pr.baseRefName}", not master`);
    if (pr.isCrossRepository) refusals.push(`PR #${pr.number} comes from a fork; agents push their branches to ${REPO}`);
    if (refusals.length === before) oks.push('open, not a draft, targets master, from this repo');

    if (facts.compare) {
        const tip = short(facts.compare.base_commit?.sha);
        if (typeof facts.compare.behind_by !== 'number') {
            refusals.push('couldn\'t tell whether the branch contains master\'s tip: GitHub\'s compare answer has no behind_by');
        } else if (facts.compare.behind_by > 0) {
            refusals.push(`the branch doesn't contain master's tip (${tip}): ${plural(facts.compare.behind_by, 'commit')} behind; rebase onto origin/master, rerun the gates and get the sign-offs again on the new head`);
        } else {
            oks.push(`contains master's tip (${tip})`);
        }
    }

    if (facts.checkRuns) {
        const ciBefore = refusals.length;
        if (!facts.checkRuns.length) refusals.push(`no CI check ran on ${head}`);
        for (const check of facts.checkRuns) {
            if (check.status !== 'completed') refusals.push(`check "${check.name}" hasn't finished on ${head} (${check.status})`);
            else if (!PASSING_CONCLUSIONS.includes(check.conclusion)) refusals.push(`check "${check.name}" is ${check.conclusion} on ${head}: ${check.html_url}`);
        }
        if (facts.checkRuns.length) {
            for (const name of REQUIRED_CHECKS) {
                const runs = facts.checkRuns.filter(check => check.name === name);
                if (!runs.length) refusals.push(`check "${name}" didn't run on ${head}`);
                for (const check of runs) {
                    if (check.status === 'completed' && check.conclusion !== 'success' && PASSING_CONCLUSIONS.includes(check.conclusion)) {
                        refusals.push(`check "${name}" is ${check.conclusion} on ${head}; merge.sh needs it to succeed: ${check.html_url}`);
                    }
                }
            }
        }
        if (refusals.length === ciBefore) oks.push(`CI passed on ${head} (${facts.checkRuns.map(check => check.name).join(', ')})`);
    }

    if (facts.files) {
        // The files API stops at 3000, so a path past that would go unseen: no rf/safety for a
        // guarded file, no scope check for a baseline.
        if (!Number.isInteger(pr.changedFiles)) {
            refusals.push(`couldn't tell how many files PR #${pr.number} changes: GitHub's answer has no changedFiles`);
        } else if (pr.changedFiles >= FILES_API_LIMIT) {
            refusals.push(`PR #${pr.number} changes ${pr.changedFiles} files, and GitHub lists at most ${FILES_API_LIMIT}, so merge.sh can't be sure it sees every path: split the PR`);
        } else if (facts.listedFiles !== pr.changedFiles) {
            refusals.push(`GitHub lists ${facts.listedFiles} of the ${pr.changedFiles} files PR #${pr.number} changes, so merge.sh can't see every path: run it again, or split the PR`);
        }
    }

    const files = facts.files || [];
    const docsOnly = isDocsOnly(files);
    const guarded = guardedFiles(files, facts.guardedPatterns || []);
    if (facts.statuses) {
        const byContext = new Map(facts.statuses.map(status => [status.context, status]));
        const passed = context => byContext.get(context)?.state === 'success';
        let required = [...SIGN_OFFS];
        if (docsOnly && (passed(DOCS_SIGN_OFF) || !SIGN_OFFS.every(passed))) required = [DOCS_SIGN_OFF];
        if (guarded.length) required.push(SAFETY);
        const statusBefore = refusals.length;
        for (const context of required) {
            const status = byContext.get(context);
            const prefix = context === SAFETY ? `it touches guarded paths (${guarded.join(', ')}), so it needs rf/safety too: ` : '';
            if (!status) refusals.push(`${prefix}${context} has no status on ${head}`);
            else if (status.state !== 'success') refusals.push(`${prefix}${context} is ${status.state} on ${head}: ${status.description || '(no description)'}`);
        }
        for (const status of facts.statuses) {
            if (!required.includes(status.context) && status.state !== 'success') {
                refusals.push(`status "${status.context}" is ${status.state} on ${head}: ${status.description || '(no description)'}`);
            }
        }
        if (refusals.length === statusBefore) {
            const why = [docsOnly ? 'a docs-only PR' : '', guarded.length ? `guarded paths: ${guarded.join(', ')}` : ''].filter(Boolean).join('; ');
            oks.push(`${required.join(', ')} passed on ${head}${why ? ` (${why})` : ''}`);
        }
    }

    if (facts.threads) {
        const open = facts.threads.filter(thread => !thread.isResolved);
        if (open.length) {
            refusals.push(`${open.length} review thread${open.length === 1 ? ' is' : 's are'} unresolved: ${open.map(thread => thread.comments?.nodes?.[0]?.url || thread.path).join(', ')}`);
        }
        if (facts.moreThreads) refusals.push('the PR has more than 100 review threads, and merge.sh reads only the first 100: resolve them, or merge by hand with Shaun');
        if (!open.length && !facts.moreThreads) oks.push('no unresolved review thread');
    }
    if (pr.reviewDecision === 'CHANGES_REQUESTED') refusals.push('a reviewer has changes requested on the PR');

    if (facts.files) {
        const scope = checkScope({ body: pr.body, files });
        (scope.ok ? oks : refusals).push(summarizeScope(scope));
    }
    return { refusals, oks };
}

function holdsLock(number) {
    let root;
    try {
        root = lockRoot();
    } catch (error) {
        return error.message;
    }
    const dir = path.join(root, 'merge');
    if (!fs.existsSync(dir)) return `--lock-held, but no merge lock is held (${dir})`;
    const owner = readLockOwner(dir) || '';
    if (!new RegExp(`PR #${number}(?!\\d)`).test(owner)) return `--lock-held, but the merge lock's owner.txt doesn't name PR #${number} (it says: ${owner.split('\n').join(' | ') || 'nothing'}); write "PR #${number}" in it when you take the lock`;
    return null;
}

function refuse(reasons) {
    for (const reason of reasons) console.error(`REFUSED  ${reason}`);
    console.error(`Refused: ${plural(reasons.length, 'reason')}. Nothing was merged.`);
}

function run(options) {
    const facts = gather(options.pr);
    const { refusals, oks } = evaluate(facts);
    if (facts.pr) console.log(`PR #${facts.pr.number} · ${facts.pr.title} · ${facts.pr.headRefName} at ${short(facts.pr.headRefOid)}`);
    for (const note of facts.notes) console.log(`  note     ${note}`);
    for (const ok of oks) console.log(`  ok       ${ok}`);
    if (refusals.length) {
        refuse(refusals);
        return 1;
    }
    if (options.check) {
        console.log(`Every check passes on ${short(facts.pr.headRefOid)}: merge.sh would merge PR #${options.pr}.`);
        return 0;
    }
    try {
        ghPr(['merge', String(options.pr), '--merge', '--delete-branch', '--match-head-commit', facts.pr.headRefOid], { inherit: true });
    } catch (error) {
        console.error(`STOP     gh pr merge failed: ${error.message}. The PR isn't merged unless gh said so above.`);
        return 1;
    }
    console.log(`Merged PR #${options.pr} (${short(facts.pr.headRefOid)}) into master and deleted ${facts.pr.headRefName}.`);
    return 0;
}

function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        console.error(`${USAGE}\n  ${error.message}`);
        return 2;
    }
    if (options.check) return run(options);
    if (options.lockHeld) {
        const problem = holdsLock(options.pr);
        if (problem) {
            refuse([problem]);
            return 1;
        }
        return run(options);
    }

    let lock;
    try {
        lock = acquireLock('merge', `scripts/merge.sh PR #${options.pr}`);
    } catch (error) {
        // Held by someone else, RF_LOCK_ROOT outside a test, or a lock folder it can't write.
        refuse([error.message]);
        return 1;
    }
    if (lock.brokeStale) console.log(lock.brokeStale);
    const onSignal = (signal, code) => () => {
        lock.release();
        console.error(`STOP     ${signal}: released the merge lock.`);
        process.exit(code);
    };
    process.once('SIGINT', onSignal('SIGINT', 130));
    process.once('SIGTERM', onSignal('SIGTERM', 143));
    process.once('SIGHUP', onSignal('SIGHUP', 129));
    try {
        return run(options);
    } finally {
        lock.release();
    }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
