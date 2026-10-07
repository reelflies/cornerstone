// Ticket 17's release.sh hook: what the release does about Lighthouse after a push, and what the
// RELEASES.md entry records (release-lighthouse.mjs). Pure: no browser, no store, no files.

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MILESTONES } from './lib/release-calendar.mjs';
import {
    AFTER_FLIP_PHASES, BEFORE_FLIP_PHASES, describeLighthouse, LIGHTHOUSE_PENDING_LINE, LIGHTHOUSE_TIMEOUT_MS, lighthouseEntryLines, lighthouseEnv, lighthouseOutcome,
    lighthousePlan, PRELAUNCH_CHANNEL, PRELAUNCH_URL, resultsDirFor, runCommand, safeLines, stopReason,
} from './release-lighthouse.mjs';
import { PRELAUNCH_URL as QA_PRELAUNCH_URL } from './qa/analytics-hosts.mjs';
import { HOST_CHANNEL, LIGHTHOUSE_PENDING_LINE as HOST_BATCH_LINE, fillPendingLighthouse } from './qa/prelaunch.mjs';

const UUID = '174ad580-a42a-013f-3c01-06627e5707c7';
const SHA = 'a30586f5913f2ae391729c9fe0c05885e8712326';
const COOKIE = 'STORESUITE_CP_TOKEN=rf-secret-cp-token; SHOP_SESSION_TOKEN=rf-secret-session';
const VERIFIED = { problems: [], themeUuid: UUID };
const STARTED = '2026-10-20T14:00:00.000Z';

// A summary.json as scripts/qa/lighthouse.mjs writes it after a run on the prelaunch host.
const summary = (fields = {}) => ({
    target: 'host',
    baseUrl: PRELAUNCH_URL,
    channel: '1895766',
    theme: {
        uuid: UUID, name: 'ReelFlies', variation: 'ReelFlies CA', commit: SHA,
    },
    startedAt: '2026-10-20T14:00:05.000Z',
    analyticsBlocked: 'yes',
    ok: true,
    accepted: true,
    recorded: 'run',
    releaseLines: [
        '  - home `/`: performance 95, LCP 2.10 s, CLS 0.010, TBT 120 ms, accessibility 100; JS 474,688 B, CSS 93,760 B; compared only with itself (SEO-8)',
        '  - not measured yet: species (no tree 4 until refactor 13)',
    ],
    ...fields,
});

test('the release and the host batch share one prelaunch host, channel and pending line', () => {
    assert.equal(PRELAUNCH_URL, QA_PRELAUNCH_URL);
    assert.equal(String(PRELAUNCH_CHANNEL), HOST_CHANNEL);
    assert.equal(LIGHTHOUSE_PENDING_LINE, '- Lighthouse: pending host batch');
    assert.equal(HOST_BATCH_LINE, LIGHTHOUSE_PENDING_LINE, 'the host batch fills in exactly the line the release writes');
    assert.deepEqual(AFTER_FLIP_PHASES, ['T-0', 'T+30']);
});

test('the hook knows every phase the release calendar has, and which come from the Flip on', () => {
    const phases = ['unset', 'build', ...MILESTONES.map(([name]) => name)];
    assert.deepEqual([...BEFORE_FLIP_PHASES, ...AFTER_FLIP_PHASES].sort(), [...phases].sort());
    for (const [name, days] of MILESTONES) assert.equal(AFTER_FLIP_PHASES.includes(name), days >= 0, name);
});

// --- The plan: what the release does after the push ---------------------------------------------

test('with the preview cookie, a push to prelaunch runs the gate on the prelaunch host', () => {
    const plan = lighthousePlan({ channel: 1895766, phase: 'build', cookie: COOKIE });
    assert.equal(plan.result, 'run');
    assert.match(plan.reason, /npm run qa:lighthouse on the prelaunch host/);
    assert.equal(lighthousePlan({
        channel: 1895766, phase: 'T-28', cookie: COOKIE, verify: VERIFIED,
    }).result, 'run');
});

test('an agent\'s push has no cookie, so the entry records "pending host batch" and the next host batch measures that build (W0-6)', () => {
    for (const cookie of [undefined, '']) {
        const plan = lighthousePlan({ channel: 1895766, phase: 'build', cookie });
        assert.equal(plan.result, 'pending');
        assert.match(plan.reason, /no QA_PREVIEW_COOKIE in this shell/);
        assert.match(plan.reason, /npm run qa:prelaunch/);
    }
});

test('a cookie that isn\'t name=value pairs is never sent, and never shown: the entry records "pending host batch"', () => {
    const plan = lighthousePlan({ channel: 1895766, phase: 'build', cookie: 'rf-secret-garbage' });
    assert.equal(plan.result, 'pending');
    assert.match(plan.reason, /isn't in the form name=value/);
    assert.doesNotMatch(plan.reason, /rf-secret/);
});

test('from the Flip, 1895766 is live reelflies.ca, and the gate is skipped: the P1 question is still Shaun\'s (interim: skipped, never accepted)', () => {
    for (const phase of AFTER_FLIP_PHASES) {
        const plan = lighthousePlan({ channel: 1895766, phase, cookie: COOKIE });
        assert.equal(plan.result, 'skipped', phase);
        assert.match(plan.reason, /after the Flip/);
        assert.match(plan.reason, /no run after the Flip is ever accepted/);
    }
    for (const phase of ['unset', 'build', 'T-35', 'T-28', 'T-21', 'T-14']) {
        assert.equal(lighthousePlan({ channel: 1895766, phase, cookie: COOKIE }).result, 'run', phase);
    }
});

test('a phase the hook doesn\'t know is refused, so a renamed calendar phase can\'t pass the Flip unnoticed', () => {
    assert.throws(() => lighthousePlan({ channel: 1895766, phase: 'T-7', cookie: COOKIE }), /unknown release calendar phase "T-7"/);
    assert.throws(() => lighthousePlan({ channel: 1895766, phase: undefined, cookie: COOKIE }), /unknown release calendar phase/);
});

test('on any other channel the gate doesn\'t run: it runs on prelaunch, and ticket 56 reads that entry', () => {
    const plan = lighthousePlan({ channel: 1, phase: 'T-28', cookie: COOKIE });
    assert.equal(plan.result, 'not-run');
    assert.match(plan.reason, /runs on prelaunch \(1895766\)/);
    assert.equal(lighthousePlan({ channel: '1895766', phase: 'build', cookie: COOKIE }).result, 'run', 'a channel id may come as a string');
});

test('after a push whose verify found problems, or read no theme uuid, nothing is measured: "pending host batch"', () => {
    const problems = lighthousePlan({
        channel: 1895766, phase: 'build', cookie: COOKIE, verify: { problems: ['the channel runs theme x, not the new one'], themeUuid: UUID },
    });
    assert.equal(problems.result, 'pending');
    assert.match(problems.reason, /verify found 1 problem/);
    for (const themeUuid of [null, 'unknown', '../../etc', `${UUID}/x`]) {
        const plan = lighthousePlan({
            channel: 1895766, phase: 'build', cookie: COOKIE, verify: { problems: [], themeUuid },
        });
        assert.equal(plan.result, 'pending', String(themeUuid));
        assert.match(plan.reason, /theme uuid/);
    }
});

// --- The run ------------------------------------------------------------------------------------

test('the run\'s results are filed under the pushed theme\'s uuid, which must be a uuid', () => {
    assert.equal(resultsDirFor(UUID), `scripts/qa/results/host/${UUID}`);
    assert.throws(() => resultsDirFor('../x'), /isn't a theme uuid/);
});

test('the run gets the prelaunch host, the channel, the variation, the folder and the commit, and the cookie, and none of the shell\'s other QA_ settings', () => {
    const env = lighthouseEnv({
        env: {
            PATH: '/bin',
            HOME: '/Users/x',
            QA_PREVIEW_COOKIE: COOKIE,
            QA_ANALYTICS: 'allow',
            QA_OVERLAY: 'rf_rise-off',
            QA_BASE_URL: 'https://reelflies.ca',
            QA_CHANNEL: '1',
            QA_RESULTS_DIR: '/tmp/elsewhere',
            QA_MANIFEST: '/tmp/manifest.json',
            QA_FRESH_SERVER: '1',
            RF_QA_PORTS_CHECKED: '1',
            RF_QA_THEME_DIR: '/tmp/overlay',
        },
        variation: 'ReelFlies CA',
        uuid: UUID,
        commit: SHA,
    });
    assert.deepEqual(env, {
        PATH: '/bin',
        HOME: '/Users/x',
        QA_PREVIEW_COOKIE: COOKIE,
        QA_BASE_URL: PRELAUNCH_URL,
        QA_CHANNEL: '1895766',
        QA_VARIATION: 'ReelFlies CA',
        QA_PORT: '3300',
        QA_RESULTS_DIR: `scripts/qa/results/host/${UUID}`,
        QA_RELEASE_COMMIT: SHA,
    });
});

// --- The outcome: what the entry records once the run ended --------------------------------------

test('a run that passed every budget and the drop rule records pass, with each URL\'s medians under it', () => {
    const outcome = lighthouseOutcome({
        status: 0, summary: summary(), startedAt: STARTED, uuid: UUID,
    });
    assert.deepEqual(outcome, {
        result: 'pass',
        at: STARTED,
        uuid: UUID,
        accepted: true,
        lines: summary().releaseLines,
        reason: null,
    });
});

test('a run that failed a budget records fail, and isn\'t accepted', () => {
    const failed = summary({ ok: false, accepted: false, recorded: null });
    const outcome = lighthouseOutcome({
        status: 1, summary: failed, startedAt: STARTED, uuid: UUID,
    });
    assert.equal(outcome.result, 'fail');
    assert.equal(outcome.accepted, false);
    // The exit code and the summary must agree on a pass; either one failing is a fail.
    assert.equal(lighthouseOutcome({
        status: 1, summary: summary(), startedAt: STARTED, uuid: UUID,
    }).result, 'fail');
    assert.equal(lighthouseOutcome({
        status: 0, summary: failed, startedAt: STARTED, uuid: UUID,
    }).result, 'fail');
    assert.equal(lighthouseOutcome({
        status: 0, summary: summary({ ok: 'yes' }), startedAt: STARTED, uuid: UUID,
    }).result, 'fail', 'only ok: true is a pass');
});

test('a run that measured nothing, or a summary that isn\'t this run\'s on the prelaunch host of the pushed build, records "pending host batch"', () => {
    const pending = (status, value, why) => {
        const outcome = lighthouseOutcome({
            status, summary: value, startedAt: STARTED, uuid: UUID,
        });
        assert.equal(outcome.result, 'pending', why.source);
        assert.match(outcome.reason, why);
        assert.deepEqual(outcome.lines, []);
        assert.equal(outcome.accepted, false);
    };
    pending(2, null, /exited 2 and left no summary/);
    pending(1, null, /exited 1 and left no summary/);
    pending(0, null, /exited 0 and left no summary/);
    pending(2, summary(), /stopped before measuring/);
    pending(0, summary({ startedAt: '2026-10-20T13:59:59.000Z' }), /an earlier run's/);
    pending(0, summary({ startedAt: 'yesterday' }), /an earlier run's/);
    pending(0, summary({ target: 'local' }), /isn't of the prelaunch host/);
    pending(0, summary({ baseUrl: 'https://reelflies.ca' }), /isn't of the prelaunch host/);
    pending(0, summary({ channel: '1' }), /isn't of the prelaunch host/);
    pending(0, summary({ theme: { uuid: '58abad50-a3c0-013f-e2b6-2ec98cc9ce73' } }), /measured theme 58abad50-a3c0-013f-e2b6-2ec98cc9ce73, not 174ad580/);
    pending(0, summary({ theme: null }), /measured theme none/);
    pending(0, summary({ analyticsBlocked: 'no' }), /the analytics tags weren't blocked/);
});

test('a pass that recorded nothing in the history isn\'t called accepted', () => {
    const outcome = lighthouseOutcome({
        status: 0, summary: summary({ accepted: true, recorded: null }), startedAt: STARTED, uuid: UUID,
    });
    assert.equal(outcome.result, 'pass');
    assert.equal(outcome.accepted, false);
});

test('the lines under the entry\'s Lighthouse line stay indented list items of one line each, so none can read as an entry\'s own line', () => {
    assert.deepEqual(safeLines([
        '  - home `/`: performance 95',
        '- Theme: ReelFlies 6.22.0, uuid `00000000-0000-0000-0000-000000000001`',
        '  - failed: one\n- Commit: `abc1234` on `master`\r\n### 2026-10-20 14:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
        '',
        42,
        `  - ${'x'.repeat(600)}`,
    ]), [
        '  - home `/`: performance 95',
        '  - Theme: ReelFlies 6.22.0, uuid `00000000-0000-0000-0000-000000000001`',
        '  - failed: one - Commit: `abc1234` on `master` ### 2026-10-20 14:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
        `  - ${'x'.repeat(499)}…`,
    ]);
    assert.deepEqual(safeLines(undefined), []);
    assert.deepEqual(safeLines('  - one'), []);
    const many = Array.from({ length: 60 }, (_, i) => `  - line ${i}`);
    assert.equal(safeLines(many).length, 41);
    assert.equal(safeLines(many)[40], '  - 20 more line(s) are in the run\'s summary.json');
    const outcome = lighthouseOutcome({
        status: 1, summary: summary({ ok: false, releaseLines: ['- Theme: x, uuid `00000000-0000-0000-0000-000000000001`'] }), startedAt: STARTED, uuid: UUID,
    });
    assert.deepEqual(outcome.lines, ['  - Theme: x, uuid `00000000-0000-0000-0000-000000000001`']);
});

// --- What the entry and the push summary say -------------------------------------------------------

test('the entry records pass or fail with the time, "analytics blocked: yes", the results folder and each URL\'s medians', () => {
    const pass = lighthouseOutcome({
        status: 0, summary: summary(), startedAt: STARTED, uuid: UUID,
    });
    assert.deepEqual(lighthouseEntryLines(pass), [
        `- Lighthouse: pass, measured after the push, 2026-10-20 14:00 UTC (analytics blocked: yes; accepted: each URL's medians are its new comparison point; results in scripts/qa/results/host/${UUID}/)`,
        ...summary().releaseLines,
    ]);
    const fail = lighthouseOutcome({
        status: 1, summary: summary({ ok: false, accepted: false, releaseLines: ['  - failed: search `/search.php?search_query=adams`: CLS 0.096, over the budget of 0.050'] }), startedAt: STARTED, uuid: UUID,
    });
    assert.deepEqual(lighthouseEntryLines(fail), [
        `- Lighthouse: fail, measured after the push, 2026-10-20 14:00 UTC (analytics blocked: yes; not accepted; results in scripts/qa/results/host/${UUID}/)`,
        '  - failed: search `/search.php?search_query=adams`: CLS 0.096, over the budget of 0.050',
    ]);
});

test('a pending entry is exactly the line the host batch fills in, with nothing under it', () => {
    const plan = lighthousePlan({ channel: 1895766, phase: 'build', cookie: undefined });
    assert.deepEqual(lighthouseEntryLines(plan), [LIGHTHOUSE_PENDING_LINE]);
    const entry = [
        '### 2026-10-20 14:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
        '',
        `- Theme: ReelFlies 6.22.0, uuid \`${UUID}\``,
        '- Verify: the live saved settings match config.json',
        ...lighthouseEntryLines(plan),
        '- Operator: Shaun Bathgate',
        '',
    ].join('\n');
    const filled = fillPendingLighthouse(`# Release log\n\n## Releases\n\n${entry}`, UUID, 'pass, host batch of 2026-10-21 09:00 UTC (analytics blocked: yes)\n  - home `/`: performance 95');
    assert.match(filled, /\n- Verify: the live saved settings match config\.json\n- Lighthouse: pass, host batch of 2026-10-21 09:00 UTC \(analytics blocked: yes\)\n {2}- home `\/`: performance 95\n- Operator: Shaun Bathgate\n/);
});

test('the entry says when the gate was skipped or doesn\'t run on the channel, and a dry run says what a real release would do', () => {
    assert.deepEqual(lighthouseEntryLines(lighthousePlan({ channel: 1895766, phase: 'T-0', cookie: COOKIE })), [
        '- Lighthouse: skipped: after the Flip 1895766 is live reelflies.ca, and whether a P1 fix runs the gate is Shaun\'s open question (ticket 17); until he answers, it is skipped, so no run after the Flip is ever accepted',
    ]);
    assert.match(lighthouseEntryLines(lighthousePlan({ channel: 1, phase: 'build', cookie: COOKIE }))[0], /^- Lighthouse: not run: /);
    assert.deepEqual(lighthouseEntryLines(lighthousePlan({ channel: 1895766, phase: 'build', cookie: COOKIE }), { dryRun: true }), [
        '- Lighthouse: measured on the prelaunch host after the push (a dry run pushes nothing, so it measures nothing)',
    ]);
    assert.deepEqual(lighthouseEntryLines(lighthousePlan({ channel: 1895766, phase: 'build', cookie: COOKIE })), [LIGHTHOUSE_PENDING_LINE], 'a planned run that never ran is pending');
    assert.deepEqual(lighthouseEntryLines(null), [LIGHTHOUSE_PENDING_LINE], 'no record at all is pending too');
});

test('the push summary says what happens after the push, and why', () => {
    assert.match(describeLighthouse(lighthousePlan({ channel: 1895766, phase: 'build', cookie: COOKIE })), /^after the push: npm run qa:lighthouse on the prelaunch host/);
    assert.match(describeLighthouse(lighthousePlan({ channel: 1895766, phase: 'build', cookie: '' })), /^after the push: pending host batch \(no QA_PREVIEW_COOKIE in this shell/);
    assert.match(describeLighthouse(lighthousePlan({ channel: 1895766, phase: 'T+30', cookie: COOKIE })), /^skipped \(after the Flip/);
    assert.match(describeLighthouse(lighthousePlan({ channel: 1, phase: 'build', cookie: COOKIE })), /^not run \(/);
    assert.match(describeLighthouse(lighthouseOutcome({
        status: 0, summary: summary(), startedAt: STARTED, uuid: UUID,
    })), /^pass, measured after the push/);
});

test('a failed gate stops the release once its entry is written, so the build moves on to neither channel 1 nor the prune', () => {
    const fail = lighthouseOutcome({
        status: 1, summary: summary({ ok: false, accepted: false }), startedAt: STARTED, uuid: UUID,
    });
    assert.match(stopReason(fail), /Lighthouse failed on the prelaunch host/);
    assert.match(stopReason(fail), /ticket 56/);
    for (const other of [
        lighthouseOutcome({
            status: 0, summary: summary(), startedAt: STARTED, uuid: UUID,
        }),
        lighthousePlan({ channel: 1895766, phase: 'build', cookie: '' }),
        lighthousePlan({ channel: 1895766, phase: 'T-0', cookie: COOKIE }),
        null,
    ]) {
        assert.equal(stopReason(other), null);
    }
});

// --- The run: npm run qa:lighthouse as a child process ------------------------------------------

// A writable that keeps what it was given.
const sink = () => {
    const chunks = [];
    return { write: chunk => { chunks.push(String(chunk)); return true; }, text: () => chunks.join('') };
};
const nodeChild = (script, options = {}) => {
    const out = sink();
    const err = sink();
    const signals = new EventEmitter();
    const done = runCommand({
        command: process.execPath, args: ['-e', script], env: { ...process.env, ...options.env }, cwd: process.cwd(), secrets: options.secrets || [], timeoutMs: options.timeoutMs ?? 20000, signals, out, err,
    });
    return {
        done, out, err, signals,
    };
};

test('runCommand gives the child\'s exit status, and its output with every secret taken out, line by line', async () => {
    const child = nodeChild('console.log("cookie " + process.env.SECRET); process.stdout.write("half a li"); setTimeout(() => { console.log("ne " + process.env.SECRET); console.error("err " + process.env.SECRET); process.exit(1); }, 50);', {
        env: { SECRET: 'rf-secret-session-value' }, secrets: ['rf-secret-session-value'],
    });
    const result = await child.done;
    assert.deepEqual(result, {
        status: 1, signal: null, timedOut: false, interrupted: null, error: null,
    });
    assert.equal(child.out.text(), 'cookie [redacted]\nhalf a line [redacted]\n');
    assert.equal(child.err.text(), 'err [redacted]\n');
});

test('runCommand stops a child that runs past its time limit', async () => {
    const child = nodeChild('setTimeout(() => {}, 60000);', { timeoutMs: 200 });
    const result = await child.done;
    assert.equal(result.timedOut, true);
    assert.equal(result.signal, 'SIGTERM');
    assert.ok(LIGHTHOUSE_TIMEOUT_MS >= 20 * 60000, 'the real limit leaves room for six URLs, three runs each, and a retry');
});

test('Ctrl-C during the run stops the child, not the release, which goes on to write its entry', async () => {
    const child = nodeChild('console.log("started"); setTimeout(() => {}, 60000);');
    await new Promise(resolve => { setTimeout(resolve, 300); });
    assert.equal(child.signals.listenerCount('SIGINT'), 1, 'the release listens for Ctrl-C while the child runs');
    child.signals.emit('SIGINT');
    const result = await child.done;
    assert.equal(result.interrupted, 'SIGINT');
    assert.equal(result.signal, 'SIGINT');
    for (const name of ['SIGINT', 'SIGTERM', 'SIGHUP']) assert.equal(child.signals.listenerCount(name), 0, `${name} is let go once the child exits`);
});

test('a command that can\'t start resolves with its error, and throws nothing', async () => {
    const result = await runCommand({
        command: '/nonexistent/npm', args: [], env: {}, cwd: process.cwd(), secrets: [], timeoutMs: 1000, signals: new EventEmitter(), out: sink(), err: sink(),
    });
    assert.equal(result.status, null);
    assert.match(result.error.message, /ENOENT/);
});

test('a run that was stopped records "pending host batch", saying how it stopped', () => {
    for (const [stopped, why] of [
        [{ interrupted: 'SIGINT' }, /was stopped by SIGINT \(Ctrl-C\)/],
        [{ timedOut: true }, /ran past its \d+-minute limit/],
        [{ signal: 'SIGKILL' }, /was stopped by SIGKILL/],
        [{ error: new Error('spawn npm ENOENT') }, /couldn't start: spawn npm ENOENT/],
    ]) {
        const outcome = lighthouseOutcome({
            status: null, ...stopped, summary: summary(), startedAt: STARTED, uuid: UUID,
        });
        assert.equal(outcome.result, 'pending', why.source);
        assert.match(outcome.reason, why);
    }
});
