#!/usr/bin/env node
// The host batch (W0-6): the storefront gates against the prelaunch host, run once per
// checkpoint by the operator, with the preview cookie in their own shell.
//
//   read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE    # paste name=value; name2=value2
//   npm run qa:prelaunch
//
// 1. Without QA_PREVIEW_COOKIE it stops at once and says so: the prelaunch host answers every
//    page with a 503 without it. It never prints the cookie, and the gates keep no trace while
//    it is set (playwright.config.mjs).
// 2. It reads the theme active on ReelFlies_CA (1895766) through the store API, GET only
//    (release-capture.mjs, with the token from `stencil init`), and files every result under
//    that theme's uuid, in scripts/qa/results/host/<uuid>/: each gate's log, Playwright's
//    report and output, the screenshot manifest and summary.json. So each result belongs to
//    one build.
// 3. It runs axe, the raw-HTML check and the screenshots (qa:prepush's gates) on every page
//    pinned for 1895766, as the variation the host runs, with the analytics tags blocked
//    whatever QA_ANALYTICS says. Ticket 17's Lighthouse joins them once `npm run qa:lighthouse`
//    exists. Once ticket 08 records Shaun's GA4 hostname filter (GA4_HOSTNAME_FILTER_SINCE),
//    one more Lighthouse run loads the tags, as information only: it never fails the batch,
//    the budgets stay on the blocked runs, and its results go in a folder of their own
//    (tags-loaded/), so they never overwrite the blocked run's.
// 4. It reads the active theme again, and fails if it changed meanwhile.
// 5. It appends a row to RELEASES.md's "Host runs" section: date, uuid, the build's commit
//    (from the uuid's newest release entry), the gates, pass or fail, and "analytics blocked":
//    yes, or, when the tags-loaded run ran, yes in the gates it counts and where they loaded.
//    Once Lighthouse ran, it also fills in that entry's "Lighthouse: pending host batch", the
//    line a push made without the cookie records (ticket 17's release.sh hook). The orchestrator
//    commits the change through the next release-log PR (build pipeline, section 6.5).
//
// It exits 0 when every gate passed, 1 when one failed or the theme changed, and 2 when it
// stopped before the first gate.

import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import { captureLive } from '../release-capture.mjs';
import { RELEASES_TEMPLATE } from '../release-log.mjs';
import { PRELAUNCH_URL, analyticsRecord, isPrelaunchHost } from './analytics-hosts.mjs';
import { GATES } from './prepush.mjs';
import { ROOT, slug } from './storefront.mjs';

export const HOST_CHANNEL = '1895766';
// The line ticket 17's release.sh hook writes in a release entry when it pushed without the
// cookie, so its Lighthouse runs wait for the next host batch of that uuid.
export const LIGHTHOUSE_PENDING_LINE = '- Lighthouse: pending host batch';
// The date ticket 08 records Shaun's GA4 hostname filter (its point b). Set it then: each host
// batch adds one Lighthouse run with the tags loaded, which the filter keeps out of the reports.
export const GA4_HOSTNAME_FILTER_SINCE = null;

const PLAYWRIGHT_SCRIPTS = ['qa:axe', 'qa:screens'];
const RELEASES = path.join(ROOT, 'RELEASES.md');
const COOKIE_HOWTO = 'read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE';

export const resultsDir = (uuid, root = ROOT) => path.join(root, 'scripts', 'qa', 'results', 'host', uuid);

// Why QA_PREVIEW_COOKIE can't be used, or null. Never quotes it.
export function cookieProblem(value) {
    if (!value) return `QA_PREVIEW_COOKIE isn't set, so nothing ran: the prelaunch host answers every page with a 503 without it. Read it in your own shell first: ${COOKIE_HOWTO}`;
    const parts = value.split(';').map(part => part.trim()).filter(Boolean);
    if (!parts.length || parts.some(part => part.indexOf('=') < 1)) {
        return `QA_PREVIEW_COOKIE isn't in the form name=value; name2=value2 (its value isn't shown), so nothing ran. Read it again: ${COOKIE_HOWTO}`;
    }
    return null;
}

// Why the shell's QA_BASE_URL or QA_CHANNEL can't be used, or null.
function hostProblem(env) {
    if (env.QA_BASE_URL && !isPrelaunchHost(env.QA_BASE_URL)) return `the host batch runs against the prelaunch host (${PRELAUNCH_URL}), not QA_BASE_URL ${env.QA_BASE_URL}. Unset QA_BASE_URL.`;
    if (env.QA_CHANNEL && env.QA_CHANNEL !== HOST_CHANNEL) return `the prelaunch host is ReelFlies_CA (${HOST_CHANNEL}), not QA_CHANNEL ${env.QA_CHANNEL}. Unset QA_CHANNEL.`;
    return null;
}

// The gates a batch runs, in order: qa:prepush's, then Lighthouse once ticket 17 adds
// `npm run qa:lighthouse`, and its tags-loaded run once the GA4 filter exists.
export function batchGates({ scripts = {}, ga4FilterSince = GA4_HOSTNAME_FILTER_SINCE } = {}) {
    const gate = fields => ({
        playwright: false, analytics: 'block', informational: false, ...fields,
    });
    const gates = GATES.map(({ name, script }) => gate({
        name, script, slug: slug(name), playwright: PLAYWRIGHT_SCRIPTS.includes(script),
    }));
    if (Object.hasOwn(scripts, 'qa:lighthouse')) {
        gates.push(gate({ name: 'Lighthouse', script: 'qa:lighthouse', slug: 'lighthouse' }));
        if (ga4FilterSince) {
            gates.push(gate({
                name: 'Lighthouse with the tags loaded', script: 'qa:lighthouse', slug: 'lighthouse-tags', analytics: 'allow', informational: true,
            }));
        }
    }
    return gates;
}

// The folder a gate files its results in: the uuid's, or for a run that loads the tags a
// folder of its own inside it, so its results never overwrite the blocked run's.
const gateDir = (gate, dir) => (gate.analytics === 'allow' ? path.join(dir, 'tags-loaded') : dir);

// The environment one gate runs in: the shell's (the cookie with it), on the prelaunch host as
// the variation it runs, with its results in its folder. QA_ANALYTICS is the gate's own.
function hostGateEnv({
    env, gate, variation, dir,
}) {
    const inherited = Object.fromEntries(Object.entries(env).filter(([name]) => !['RF_QA_PORTS_CHECKED', 'QA_ANALYTICS'].includes(name)));
    const results = gateDir(gate, dir);
    return {
        ...inherited,
        QA_BASE_URL: PRELAUNCH_URL,
        QA_CHANNEL: HOST_CHANNEL,
        QA_VARIATION: variation,
        QA_MANIFEST: path.join(results, 'manifest.json'),
        QA_RESULTS_DIR: results,
        ...(gate.playwright ? { PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(dir, `${gate.slug}-report`) } : {}),
        ...(gate.analytics === 'allow' ? { QA_ANALYTICS: 'allow' } : {}),
    };
}

// What the row and summary.json record as "analytics blocked": yes, or, when a run loaded the
// tags for information, yes in the gates the batch counts, and where the tags loaded.
export function analyticsBlockedText(gates) {
    const loaded = gates.filter(gate => gate.analytics === 'allow');
    if (!loaded.length) return 'yes';
    return `yes, in the gates it counts; tags loaded in ${loaded.map(gate => `${gate.name}${gate.informational ? ' (information)' : ''}`).join(', ')}`;
}

const gateArgs = (gate, dir) => (gate.playwright ? ['--output', path.join(dir, `${gate.slug}-output`)] : []);

const utc = date => `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 16)} UTC`;
const short = sha => `\`${sha.slice(0, 8)}\``;

// The release entries of RELEASES.md, oldest first, each as its text.
const releaseEntries = markdown => (markdown || '').split(/\n(?=### )/).filter(block => block.startsWith('### '));
const isEntryOf = (block, uuid) => block.includes(`, uuid \`${uuid}\``);

// The commit of the newest release entry that pushed `uuid`, or null.
export function releaseCommitFor(markdown, uuid) {
    const block = releaseEntries(markdown).filter(item => isEntryOf(item, uuid)).pop();
    return block?.match(/^- Commit: `([0-9a-f]{7,40})`/m)?.[1] || null;
}

// Fills in the "Lighthouse: pending host batch" line of the newest release entry of `uuid`.
export function fillPendingLighthouse(markdown, uuid, text) {
    const block = releaseEntries(markdown).filter(item => isEntryOf(item, uuid)).pop();
    if (!block || !block.split('\n').includes(LIGHTHOUSE_PENDING_LINE)) return markdown;
    const filled = block.split('\n').map(line => (line === LIGHTHOUSE_PENDING_LINE ? `- Lighthouse: ${text}` : line)).join('\n');
    const at = markdown.lastIndexOf(block);
    return `${markdown.slice(0, at)}${filled}${markdown.slice(at + block.length)}`;
}

export const HOST_RUNS_SECTION = `## Host runs

Each \`npm run qa:prelaunch\` adds a row here: the storefront gates against the prelaunch host, for the build ReelFlies_CA ran then, named by its theme uuid (W0-6; [scripts/qa/README.md](scripts/qa/README.md), "Host batch"). Its results are in \`scripts/qa/results/host/<uuid>/\` on the Mac that ran it. Commit new rows through the next release-log PR.

| Date | Theme uuid | Commit | Gates | Result | Analytics blocked | Gates from |
|---|---|---|---|---|---|---|
`;

export function hostRunRow({
    date, uuid, commit, gates, problems, analytics, checkout,
}) {
    return [
        '',
        utc(date),
        `\`${uuid}\``,
        commit ? short(commit) : 'not in RELEASES.md',
        gates.join(', '),
        problems.length ? `fail: ${problems.join(', ')}` : 'pass',
        analytics,
        `${short(checkout.sha)}${checkout.dirty ? ' (uncommitted changes)' : ''}`,
        '',
    ].join(' | ').trim();
}

// Adds a row at the end of the "Host runs" section, which goes before "Switch toggles" (or at
// the end) the first time.
export function addHostRun(markdown, row) {
    const start = markdown.indexOf('\n## Host runs\n');
    if (start === -1) {
        const toggles = markdown.indexOf('\n## Switch toggles');
        if (toggles === -1) return `${markdown.replace(/\n*$/, '\n')}\n${HOST_RUNS_SECTION}${row}\n`;
        return `${markdown.slice(0, toggles + 1)}${HOST_RUNS_SECTION}${row}\n\n${markdown.slice(toggles + 1)}`;
    }
    const next = markdown.indexOf('\n## ', start + 1);
    const end = next === -1 ? markdown.length : next + 1;
    return `${markdown.slice(0, end).replace(/\n*$/, '\n')}${row}\n${next === -1 ? '' : `\n${markdown.slice(end)}`}`;
}

// The batch, with everything it touches passed in (main below gives the real ones):
//   capture(channel)   resolves to release-capture.mjs's { capture: { themeUuid, themeName, variationName } }
//   runGate({ gate, env, args, logFile })   resolves to the gate's problems, empty when it passed
//   checkout()         { sha, dirty } of the checkout the gates run from
//   readReleases(), writeReleases(text), writeJson(file, data), mkdir(dir), now(), log, error
// Resolves to { code }: 0 passed, 1 failed, 2 stopped before the first gate.
export async function runHostBatch({
    env, root = ROOT, scripts = {}, ga4FilterSince = GA4_HOSTNAME_FILTER_SINCE, now = () => new Date(), checkout, capture, runGate,
    readReleases, writeReleases, writeJson, mkdir, log = console.log, error = console.error,
}) {
    const stop = message => {
        error(`STOP     ${message}`);
        return { code: 2 };
    };
    const refused = cookieProblem(env.QA_PREVIEW_COOKIE) || hostProblem(env);
    if (refused) return stop(refused);

    let theme;
    try {
        ({ capture: theme } = await capture(HOST_CHANNEL));
    } catch (problem) {
        return stop(`couldn't read the theme active on ${HOST_CHANNEL} (${problem.message}), so no result could be filed under its uuid: nothing ran`);
    }
    const uuid = theme.themeUuid;
    const dir = resultsDir(uuid, root);
    mkdir(dir);
    const started = now();
    const releases = readReleases();
    const commit = releaseCommitFor(releases, uuid);
    const from = checkout();

    log(`Host batch on ${PRELAUNCH_URL} (channel ${HOST_CHANNEL}): ${theme.themeName} ${uuid}, variation "${theme.variationName}", ${commit ? `commit ${commit.slice(0, 8)}` : 'a build RELEASES.md doesn\'t record'}`);
    log(`Results: ${path.relative(root, dir)}/; ${analyticsRecord({ blocked: true })} in every gate it counts`);
    if (!commit) log(`WARNING  RELEASES.md records no push of ${uuid}, so its row can't name the build's commit. Was the theme pushed by hand?`);
    const gates = batchGates({ scripts, ga4FilterSince });
    if (!gates.some(gate => gate.script === 'qa:lighthouse')) log('Lighthouse: not run, ticket 17 adds npm run qa:lighthouse');

    const results = [];
    for (const gate of gates) {
        if (gateDir(gate, dir) !== dir) mkdir(gateDir(gate, dir));
        const problems = await runGate({ // eslint-disable-line no-await-in-loop
            gate,
            env: hostGateEnv({
                env, gate, variation: theme.variationName, dir,
            }),
            args: gateArgs(gate, dir),
            logFile: path.join(dir, `${gate.slug}.log`),
        });
        results.push({ ...gate, problems });
    }

    const problems = results.filter(gate => !gate.informational && gate.problems.length).map(gate => gate.name);
    try {
        const { capture: after } = await capture(HOST_CHANNEL);
        if (after.themeUuid !== uuid) {
            error(`FAIL     the theme active on ${HOST_CHANNEL} changed while the gates ran (${uuid} → ${after.themeUuid}), so the results mix two builds. Run the batch again.`);
            problems.push('the active theme changed during the run');
        }
    } catch (problem) {
        log(`WARNING  couldn't read the active theme again after the gates (${problem.message}), so the batch can't confirm they all ran on ${uuid}`);
    }
    const ok = !problems.length;
    const finished = now();
    const analytics = analyticsBlockedText(results);

    log(`\nHost batch on ${uuid}:`);
    const label = gate => {
        if (gate.informational) return 'info    ';
        return gate.problems.length ? 'FAIL    ' : 'ok      ';
    };
    results.forEach(gate => log(`${label(gate)} ${gate.name}${gate.problems.length ? `: ${gate.problems.join('; ')}` : ''}`));

    writeJson(path.join(dir, 'summary.json'), {
        host: PRELAUNCH_URL,
        channel: HOST_CHANNEL,
        theme: { uuid, name: theme.themeName, variation: theme.variationName },
        commit,
        checkout: from,
        startedAt: started.toISOString(),
        finishedAt: finished.toISOString(),
        analyticsBlocked: analytics,
        ok,
        problems,
        gates: results.map(gate => ({
            name: gate.name,
            script: gate.script,
            informational: gate.informational,
            analyticsBlocked: gate.analytics === 'block' ? 'yes' : 'no',
            ok: !gate.problems.length,
            problems: gate.problems,
            log: `${gate.slug}.log`,
        })),
    });

    let text = releases ?? RELEASES_TEMPLATE;
    const lighthouse = results.find(gate => gate.script === 'qa:lighthouse' && !gate.informational);
    if (lighthouse) {
        text = fillPendingLighthouse(text, uuid, `${lighthouse.problems.length ? 'fail' : 'pass'}, host batch of ${utc(started)} (analytics blocked: yes; results in scripts/qa/results/host/${uuid}/)`);
    }
    text = addHostRun(text, hostRunRow({
        date: started,
        uuid,
        commit,
        gates: results.map(gate => (gate.informational ? `${gate.name} (information)` : gate.name)),
        problems,
        analytics,
        checkout: from,
    }));
    writeReleases(text);
    log(`\n${ok ? 'Every gate passed' : `Failed: ${problems.join(', ')}`}. Added a Host runs row to RELEASES.md. Commit it through the next release-log PR (build pipeline, section 6.5).`);
    return { code: ok ? 0 : 1 };
}

function gitCheckout() {
    const git = args => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    return { sha: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '' };
}

// Runs one gate through npm, its output both on the terminal and in its log file.
function runNpmGate({
    gate, env, args, logFile,
}) {
    const allow = gate.analytics === 'allow' ? ', QA_ANALYTICS=allow' : '';
    console.log(`\n-- Host gate: ${gate.name} (npm run ${gate.script}${allow}; log ${path.relative(ROOT, logFile)})\n`);
    return new Promise(resolve => {
        const out = fs.createWriteStream(logFile);
        const child = spawn('npm', ['run', gate.script, ...(args.length ? ['--', ...args] : [])], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
        child.stdout.on('data', chunk => {
            process.stdout.write(chunk);
            out.write(chunk);
        });
        child.stderr.on('data', chunk => {
            process.stderr.write(chunk);
            out.write(chunk);
        });
        child.on('error', problem => {
            out.end();
            resolve([`npm run ${gate.script} couldn't start: ${problem.message}`]);
        });
        child.on('close', (status, signal) => {
            out.end();
            resolve(status === 0 ? [] : [`npm run ${gate.script} ${signal ? `stopped on ${signal}` : `exited ${status}`}`]);
        });
    });
}

async function main() {
    process.chdir(ROOT); // release-capture.mjs reads config.stencil.json from here
    const { scripts = {} } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const { code } = await runHostBatch({
        env: process.env,
        scripts,
        checkout: gitCheckout,
        capture: captureLive,
        runGate: runNpmGate,
        readReleases: () => (fs.existsSync(RELEASES) ? fs.readFileSync(RELEASES, 'utf8') : null),
        writeReleases: text => fs.writeFileSync(RELEASES, text),
        writeJson: (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`),
        mkdir: dir => fs.mkdirSync(dir, { recursive: true }),
    });
    process.exit(code);
}

if (isMain(import.meta.url)) main();
