// Ticket 17's Lighthouse gate in the release: release.sh's step 6b, after verify and before the
// RELEASES.md entry, so the entry records the scores and pass or fail. Lighthouse needs the theme
// live on a host, so it can't run before the push; prelaunch (1895766) is the test bed until the
// Flip, and a build that fails there doesn't move on to channel 1 (ticket 56).
//
//   import { lighthousePlan, lighthouseEnv, lighthouseOutcome, lighthouseEntryLines } from './release-lighthouse.mjs';
//   const plan = lighthousePlan({ channel, phase, cookie: process.env.QA_PREVIEW_COOKIE, verify });
//   if (plan.result === 'run') { run `npm run qa:lighthouse` with lighthouseEnv(…), then lighthouseOutcome(…) }
//   lighthouseEntryLines(plan or outcome)   // the entry's "- Lighthouse:" line and the lines under it
//
// What the hook does after a push (lighthousePlan):
//   - on a channel other than prelaunch: nothing ("not run"). The gate runs on prelaunch, and ticket
//     56 reads the 1895766 entry of the commit it pushes to channel 1.
//   - from the Flip (calendar phase T-0 or T+30): "skipped". 1895766 is then live reelflies.ca, and
//     whether a P1 fix runs the gate is Shaun's open question (ticket 17); until he answers it is
//     skipped, so no run after the Flip is ever accepted (build pipeline, section 4).
//   - when verify found a problem, or read no theme uuid: "pending host batch". The build isn't
//     confirmed, so there is nothing to measure yet.
//   - without the preview cookie in the operator's shell, as on every agent's push (the cookie lives
//     only in Shaun's shell, W0-6), or with one that isn't name=value pairs: "pending host batch",
//     exactly LIGHTHOUSE_PENDING_LINE, which the next host batch of that uuid fills in
//     (scripts/qa/prelaunch.mjs).
//   - otherwise: run `npm run qa:lighthouse` on the prelaunch host (scripts/qa/lighthouse.mjs), and
//     record pass or fail with each URL's medians (lighthouseOutcome).
//
// The runner is QA code, which isn't guarded, so this module never imports it: it reads the
// runner's summary.json, checks that it is this run's, on the prelaunch host, of the pushed build,
// with the tags blocked, and keeps every line it copies into RELEASES.md an indented list item of
// one line (safeLines), so no line from the runner can read as one of the entry's own lines, which
// the prune and step 1 parse. Everything but runCommand is pure: no browser, no store, no files.
//
// The push is done when this step runs, and RELEASES.md has no entry yet, so the step never stops
// the release: runCommand gives the runner a time limit, takes Ctrl-C to stop the runner rather
// than the release (release.sh then goes on to step 7), and takes the secrets out of its output.

import { spawn } from 'child_process';
import { redact } from './release-redact.mjs';

export const PRELAUNCH_CHANNEL = 1895766;
// The same host as scripts/qa/analytics-hosts.mjs's PRELAUNCH_URL (a test keeps them equal).
export const PRELAUNCH_URL = 'https://reelflies_ca-1895766.mybigcommerce.com';
// The line an entry records when Lighthouse waits for the next host batch of its uuid.
export const LIGHTHOUSE_PENDING_LINE = '- Lighthouse: pending host batch';
// The release calendar's phases (scripts/lib/release-calendar.mjs) from the Flip on.
export const AFTER_FLIP_PHASES = ['T-0', 'T+30'];
export const BEFORE_FLIP_PHASES = ['unset', 'build', 'T-35', 'T-28', 'T-21', 'T-14'];
// Six URLs, three runs each and a retry take about 10 minutes; past this the runner is stopped.
export const LIGHTHOUSE_TIMEOUT_MS = 30 * 60000;
const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{40}$/;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_LINES = 40;
const MAX_LINE = 500;

const utc = iso => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const pending = reason => ({
    result: 'pending', at: null, uuid: null, accepted: false, lines: [], reason,
});

// Why a cookie can't be used, or null. Never quotes it. (The same test as the host batch's
// cookieProblem in scripts/qa/prelaunch.mjs, which this module doesn't import.)
function cookieProblem(cookie) {
    if (!cookie) return 'no QA_PREVIEW_COOKIE in this shell: the prelaunch host answers every page with a 503 without it, and it lives only in Shaun\'s shell (W0-6). The next host batch of this build (npm run qa:prelaunch) measures it and fills in the entry';
    const parts = cookie.split(';').map(part => part.trim()).filter(Boolean);
    if (!parts.length || parts.some(part => part.indexOf('=') < 1)) {
        return 'QA_PREVIEW_COOKIE isn\'t in the form name=value; name2=value2 (its value isn\'t shown), so it isn\'t sent. The next host batch of this build (npm run qa:prelaunch) measures it and fills in the entry';
    }
    return null;
}

// What the release does about Lighthouse after this push: { result, reason }, result one of
// 'run', 'pending', 'skipped' and 'not-run'. `verify` is step 6's { problems, themeUuid }, or
// absent before the push (the dry run and the push summary). Throws on a phase it doesn't know.
export function lighthousePlan({
    channel, phase, cookie, verify = null,
}) {
    if (!AFTER_FLIP_PHASES.includes(phase) && !BEFORE_FLIP_PHASES.includes(phase)) {
        throw new Error(`unknown release calendar phase "${phase}": the Lighthouse step can't tell whether the Flip has passed`);
    }
    if (Number(channel) !== PRELAUNCH_CHANNEL) {
        return { result: 'not-run', reason: `the gate runs on prelaunch (${PRELAUNCH_CHANNEL}), not channel ${channel}: ticket 56 reads the ${PRELAUNCH_CHANNEL} entry of the commit it pushes` };
    }
    if (AFTER_FLIP_PHASES.includes(phase)) {
        return { result: 'skipped', reason: `after the Flip ${PRELAUNCH_CHANNEL} is live reelflies.ca, and whether a P1 fix runs the gate is Shaun's open question (ticket 17); until he answers, it is skipped, so no run after the Flip is ever accepted` };
    }
    if (verify && verify.problems.length) {
        return { result: 'pending', reason: `verify found ${verify.problems.length} problem(s), so the build Lighthouse would measure isn't confirmed. The next host batch of this build measures it` };
    }
    if (verify && !UUID.test(verify.themeUuid || '')) {
        return { result: 'pending', reason: 'verify read no theme uuid after the push, so the results couldn\'t be filed under it. The next host batch of this build measures it' };
    }
    const problem = cookieProblem(cookie);
    if (problem) return { result: 'pending', reason: problem };
    return { result: 'run', reason: 'npm run qa:lighthouse on the prelaunch host, with the preview cookie: three mobile runs of each URL, analytics blocked, the medians held to the budgets and the drop rule' };
}

// The folder the run files its results in, relative to the checkout: the pushed theme's uuid, as
// the host batch files them (scripts/qa/results/host/<uuid>/).
export function resultsDirFor(uuid) {
    if (!UUID.test(uuid || '')) throw new Error(`"${uuid}" isn't a theme uuid`);
    return `scripts/qa/results/host/${uuid}`;
}

// The environment for `npm run qa:lighthouse` after the push: the shell's, without any of its own
// QA_ or RF_QA_ settings except the preview cookie, so an overlay, a results folder or
// QA_ANALYTICS=allow left in the shell can't change what is measured or where it is filed. It
// names the prelaunch host, its channel and variation, the uuid's folder, and the pushed commit,
// which RELEASES.md doesn't record until step 7.
export function lighthouseEnv({
    env, variation, uuid, commit,
}) {
    const kept = Object.fromEntries(Object.entries(env).filter(([name]) => name === 'QA_PREVIEW_COOKIE' || !/^(RF_)?QA_/.test(name)));
    return {
        ...kept,
        QA_BASE_URL: PRELAUNCH_URL,
        QA_CHANNEL: String(PRELAUNCH_CHANNEL),
        QA_VARIATION: variation,
        QA_PORT: '3300',
        QA_RESULTS_DIR: resultsDirFor(uuid),
        ...(SHA.test(commit || '') ? { QA_RELEASE_COMMIT: commit } : {}),
    };
}

// Each line the runner gives for the entry (summary.json's releaseLines), as an indented list item
// of one line: newlines folded, a leading "- " indented, cut at MAX_LINE characters, and at most
// MAX_LINES of them, so none can read as one of the entry's own lines.
export function safeLines(lines) {
    if (!Array.isArray(lines)) return [];
    const kept = lines.filter(line => typeof line === 'string').map(line => line.replace(/\s*[\r\n]+\s*/g, ' ').trim().replace(/^-\s*/, '')).filter(Boolean)
        .map(body => `  - ${body.length > MAX_LINE ? `${body.slice(0, MAX_LINE - 1)}…` : body}`);
    if (kept.length <= MAX_LINES) return kept;
    return [...kept.slice(0, MAX_LINES), `  - ${kept.length - MAX_LINES} more line(s) are in the run's summary.json`];
}

// Why the runner's summary isn't this run's, on the prelaunch host, of the pushed build, with the
// tags blocked, or null.
function summaryProblem({
    status, summary, startedAt, uuid,
}) {
    if (!summary || typeof summary !== 'object') return `npm run qa:lighthouse exited ${status} and left no summary, so nothing was measured`;
    if (status === 2) return 'npm run qa:lighthouse stopped before measuring (exit 2)';
    if (!ISO_TIME.test(summary.startedAt) || summary.startedAt < startedAt) return 'the only summary in the results folder is an earlier run\'s';
    if (summary.target !== 'host' || summary.baseUrl !== PRELAUNCH_URL || String(summary.channel) !== String(PRELAUNCH_CHANNEL)) return 'the summary isn\'t of the prelaunch host';
    const measured = summary.theme && summary.theme.uuid;
    if (measured !== uuid) return `the run measured theme ${measured || 'none'}, not ${uuid}, the theme the push made`;
    if (summary.analyticsBlocked !== 'yes') return 'the analytics tags weren\'t blocked, so the run can\'t be compared with the history';
    return null;
}

// How a run that didn't finish by itself stopped, from runCommand's result, or null.
function stoppedProblem({
    interrupted, timedOut, signal, error,
}) {
    if (error) return `npm run qa:lighthouse couldn't start: ${error.message}`;
    if (interrupted) return `npm run qa:lighthouse was stopped by ${interrupted}${interrupted === 'SIGINT' ? ' (Ctrl-C)' : ''}`;
    if (timedOut) return `npm run qa:lighthouse ran past its ${LIGHTHOUSE_TIMEOUT_MS / 60000}-minute limit and was stopped`;
    if (signal) return `npm run qa:lighthouse was stopped by ${signal}`;
    return null;
}

// What the entry records once `npm run qa:lighthouse` ended (runCommand's result: status,
// interrupted, timedOut, signal, error): { result: 'pass' | 'fail' | 'pending', at, uuid, accepted,
// lines, reason }. A pass needs both exit 0 and the summary's ok: true. A run that was stopped, or
// measured nothing usable, is pending, for the next host batch.
export function lighthouseOutcome({
    status, interrupted = null, timedOut = false, signal = null, error = null, summary, startedAt, uuid,
}) {
    const problem = stoppedProblem({
        interrupted, timedOut, signal, error,
    }) || summaryProblem({
        status, summary, startedAt, uuid,
    });
    if (problem) return pending(`${problem}. The next host batch of this build (npm run qa:prelaunch) measures it and fills in the entry`);
    const pass = status === 0 && summary.ok === true;
    return {
        result: pass ? 'pass' : 'fail',
        at: startedAt,
        uuid,
        accepted: pass && summary.accepted === true && Boolean(summary.recorded),
        lines: safeLines(summary.releaseLines),
        reason: null,
    };
}

// The entry's "- Lighthouse:" line and the lines under it, from a plan or an outcome. A planned
// run that never ran, or no record at all, is pending: the entry always says Lighthouse is owed.
export function lighthouseEntryLines(lighthouse, { dryRun = false } = {}) {
    const result = lighthouse ? lighthouse.result : 'pending';
    if (result === 'run' && dryRun) return ['- Lighthouse: measured on the prelaunch host after the push (a dry run pushes nothing, so it measures nothing)'];
    if (result === 'pass' || result === 'fail') {
        const accepted = lighthouse.accepted ? 'accepted: each URL\'s medians are its new comparison point' : 'not accepted';
        return [
            `- Lighthouse: ${result}, measured after the push, ${utc(lighthouse.at)} (analytics blocked: yes; ${accepted}; results in ${resultsDirFor(lighthouse.uuid)}/)`,
            ...safeLines(lighthouse.lines),
        ];
    }
    if (result === 'skipped') return [`- Lighthouse: skipped: ${lighthouse.reason}`];
    if (result === 'not-run') return [`- Lighthouse: not run: ${lighthouse.reason}`];
    return [LIGHTHOUSE_PENDING_LINE];
}

// One line for the push summary and the release's output.
export function describeLighthouse(lighthouse) {
    const { result, reason } = lighthouse;
    if (result === 'run') return `after the push: ${reason}`;
    if (result === 'pending') return `after the push: pending host batch (${reason})`;
    if (result === 'skipped' || result === 'not-run') return `${result === 'skipped' ? 'skipped' : 'not run'} (${reason})`;
    return lighthouseEntryLines(lighthouse)[0].replace(/^- Lighthouse: /, '');
}

// Why the release stops once step 7 has written its entry, or null: a failed gate. The theme is
// live on prelaunch by then, so the release can only report it; the entry's "fail" keeps the build
// from moving on to channel 1 (ticket 56), and the stop keeps the prune from running after it.
export function stopReason(lighthouse) {
    if (!lighthouse || lighthouse.result !== 'fail') return null;
    return 'Lighthouse failed on the prelaunch host (the entry lists each URL and the budget it missed), so this build doesn\'t move on to channel 1 (ticket 56). Fix forward, or roll back to the previous release\'s theme, which RELEASES.md records. The prune didn\'t run: commit RELEASES.md, then run scripts/release.sh --prune-only --dry-run and --prune-only from the main clone';
}

// --- The run (not pure) ----------------------------------------------------------------------------

// Writes `stream`'s output to `to` a line at a time, with every secret taken out (release-redact.mjs),
// so a secret split across two chunks is still found.
function pipeRedacted(stream, to, secrets) {
    let buffered = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
        buffered += chunk;
        const cut = buffered.lastIndexOf('\n');
        if (cut >= 0) {
            to.write(redact(buffered.slice(0, cut + 1), secrets));
            buffered = buffered.slice(cut + 1);
        }
    });
    return new Promise(resolve => {
        stream.on('end', () => {
            if (buffered) to.write(redact(buffered, secrets));
            resolve();
        });
    });
}

// Runs `command` and resolves, never rejects, to { status, signal, timedOut, interrupted, error }
// once it has exited and its output is written. While it runs, SIGINT, SIGTERM and SIGHUP sent to
// the release stop the child instead (`signals` is `process`, or a stand-in in a test), so
// release.sh goes on to write its entry; a terminal's Ctrl-C reaches the child itself too. Past
// `timeoutMs` the child gets SIGTERM.
export function runCommand({
    command, args, env, cwd, secrets, timeoutMs = LIGHTHOUSE_TIMEOUT_MS, signals = process, out = process.stdout, err = process.stderr,
}) {
    return new Promise(resolve => {
        let interrupted = null;
        let timedOut = false;
        const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        const handlers = SIGNALS.map(name => [name, () => {
            interrupted = interrupted || name;
            child.kill(name);
        }]);
        handlers.forEach(([name, handler]) => signals.on(name, handler));
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
        }, timeoutMs);
        let finished = false;
        const finish = result => {
            if (finished) return; // a child that can't start may send 'close' after 'error'
            finished = true;
            clearTimeout(timer);
            handlers.forEach(([name, handler]) => signals.removeListener(name, handler));
            resolve({
                status: null, signal: null, timedOut, interrupted, error: null, ...result,
            });
        };
        const written = Promise.all([pipeRedacted(child.stdout, out, secrets), pipeRedacted(child.stderr, err, secrets)]);
        child.on('error', error => finish({ error }));
        child.on('close', (status, signal) => written.then(() => finish({ status, signal })));
    });
}
