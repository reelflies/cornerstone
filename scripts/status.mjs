#!/usr/bin/env node
// Posts a ReelFlies commit status on a PR's head sha (W0-13). The gates post rf/gates with
// their summary, and each review agent posts its verdict; scripts/merge.sh merges only when
// the statuses it needs are "success" on the head sha (docs/guardrails.md).
//
//   node scripts/status.mjs --pr 12 --sha <full sha> --context rf/spec --state success \
//     --description "Spec: 9 met, 2 waiting (refactor 14)" \
//     --url https://github.com/reelflies/reelflies-cornerstone/pull/12#issuecomment-123
//   … --dry-run                         prints the call and posts nothing
//
// Contexts: rf/gates (the gate summary), rf/standards, rf/spec and rf/skeptic (the three
// sign-offs), rf/review (the one sign-off a docs-only PR needs) and rf/safety (the extra
// sign-off for a PR that touches a guarded path). The link is the PR comment that holds the
// summary or the verdict. The sha must be the PR's head now: a status on an older sha would
// sign off code that is no longer the PR.

import {
    REPO, REPO_URL, ghApi, ghPr,
} from './lib/gh.mjs';
import { isMain } from './lib/is-main.mjs';

export const CONTEXTS = ['rf/gates', 'rf/standards', 'rf/spec', 'rf/skeptic', 'rf/review', 'rf/safety'];
export const STATES = ['success', 'failure', 'error', 'pending'];
export const MAX_DESCRIPTION = 140; // GitHub's limit

const USAGE = 'usage: node scripts/status.mjs --pr <n> --sha <sha> --context <rf/…> --state <state> --description <text> --url <PR comment link> [--dry-run]';
const FLAGS = ['--pr', '--sha', '--context', '--state', '--description', '--url'];

class UsageError extends Error {}

export function parseArgs(argv) {
    const options = { dryRun: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (FLAGS.includes(arg)) {
            if (i + 1 >= argv.length) throw new UsageError(`${arg} needs a value`);
            options[arg.slice(2)] = argv[++i];
        } else {
            throw new UsageError(`unknown argument ${arg}`);
        }
    }
    for (const flag of FLAGS) {
        if (options[flag.slice(2)] === undefined || options[flag.slice(2)] === '') throw new UsageError(`${flag} is required`);
    }
    if (!/^[1-9]\d*$/.test(options.pr)) throw new UsageError(`--pr must be a PR number, not "${options.pr}"`);
    if (!/^[0-9a-f]{40}$/.test(options.sha)) throw new UsageError(`--sha must be the full 40-character sha, not "${options.sha}"`);
    if (!CONTEXTS.includes(options.context)) throw new UsageError(`the context must be one of ${CONTEXTS.join(', ')}`);
    if (!STATES.includes(options.state)) throw new UsageError(`the state must be one of ${STATES.join(', ')}`);
    if (!options.url.startsWith(`${REPO_URL}/`)) throw new UsageError(`the link must be on ${REPO_URL}/, the PR comment with the summary or verdict`);
    return options;
}

// GitHub refuses a longer description, so it is cut, with an ellipsis, and the run says so.
export function fitDescription(text) {
    const chars = [...text.replace(/\s+/g, ' ').trim()];
    if (chars.length <= MAX_DESCRIPTION) return { description: chars.join(''), cut: false };
    return { description: `${chars.slice(0, MAX_DESCRIPTION - 1).join('')}…`, cut: true };
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
    const { description, cut } = fitDescription(options.description);
    if (cut) console.error(`note     the description was cut to ${MAX_DESCRIPTION} characters; the full text belongs in the PR comment`);
    const head = options.sha.slice(0, 7);
    try {
        const pr = ghPr(['view', options.pr, '--json', 'headRefOid,state']);
        if (pr.headRefOid !== options.sha) {
            console.error(`STOP     ${head} isn't the head of PR #${options.pr} (${pr.headRefOid.slice(0, 7)} is): review or gate the head, then post on it`);
            return 1;
        }
        const fields = {
            state: options.state, context: options.context, description, target_url: options.url,
        };
        if (options.dryRun) {
            console.log(`would post ${options.context} ${options.state} on ${head} in ${REPO}: ${description}\n  link: ${options.url}`);
            return 0;
        }
        ghApi(`statuses/${options.sha}`, ['--method', 'POST', ...Object.entries(fields).flatMap(([key, value]) => ['-f', `${key}=${value}`])]);
        console.log(`Posted ${options.context} ${options.state} on ${head}: ${description}`);
        return 0;
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        return 1;
    }
}

if (isMain(import.meta.url)) process.exitCode = main(process.argv.slice(2));
