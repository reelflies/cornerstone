#!/usr/bin/env node
// Ticket 17's Lighthouse gate: mobile Lighthouse, three runs of each URL listed for the channel,
// the median of each metric held to the budgets and the drop rule (lighthouse-rules.mjs).
//
//   QA_PORT=4100 npm run qa:lighthouse                        # a local stencil start of this checkout
//   npm run qa:prelaunch                                      # the host batch runs it on the prelaunch host
//   QA_BASE_URL=https://<prelaunch host> npm run qa:lighthouse # by hand, with QA_PREVIEW_COOKIE read first
//   QA_BASE_URL=… npm run qa:lighthouse -- --baseline 'ticket 11'   # record ticket 11's baseline
//
// - URLs: scripts/qa/lighthouse-urls.json, one list per channel (QA_CHANNEL, 1895766 by default),
//   covering home, a Species page, a Fly Type page, a product page with Fly Sizes, the cart and
//   search results. A kind the channel can't pin yet is reported with its reason.
// - Lighthouse: the repo's lighthouse-config.js (the official release's; mobile, simulated
//   throttling), in Playwright's Chromium (build 1217), with the analytics hosts blocked through
//   blockedUrlPatterns (analytics-hosts.mjs, W0-6). QA_ANALYTICS=allow loads them, on the
//   prelaunch host only, as information.
// - Where: a local stencil start (storefront.mjs, holding its port lock and a slot), or
//   QA_BASE_URL. On the prelaunch host the preview cookie, QA_PREVIEW_COOKIE, goes into the
//   browser's cookie jar for that host alone; it is never printed, and never sent to any other
//   host. Another host needs QA_CHANNEL to say which channel it serves.
// - Results: on a host, filed by the theme uuid it reads from the store before and after the runs
//   (results/host/<uuid>/lighthouse/, or the host batch's QA_RESULTS_DIR); locally, by commit
//   (results/local/<sha>/lighthouse/). Each run's JSON and HTML report, and summary.json.
// - History: a run on a host with the tags blocked is compared with each URL's last accepted run
//   in scripts/qa/lighthouse-history.json, and when it passes it is accepted: its medians become
//   the new comparison points. --baseline <source> records them whatever the budgets say.
//   A local run never reads or writes the history.
//
// Exits 0 when every judged budget and the drop rule passed, 1 when one failed or a URL couldn't be
// measured, and 2 when it stopped before measuring.

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { isMain } from '../lib/is-main.mjs';
import { cleanupOnExit } from '../lib/lock.mjs';
import {
    PRELAUNCH_URL, analyticsMode, analyticsRecord, isPrelaunchHost, lighthouseBlockedUrlPatterns,
} from './analytics-hosts.mjs';
import {
    RUNS_PER_URL, addToHistory, analyticsRequests, channelUrls, comparisonPoint, formatMetrics, historyProblems, judgeUrl, medianMetrics,
    metricsOf, urlListProblems,
} from './lighthouse-rules.mjs';
import {
    HOST_CHANNEL, cookieProblem, releaseCommitFor, resultsDir,
} from './prelaunch.mjs';
import { captureLive } from '../release-capture.mjs';
import { ROOT, slug, useStorefront } from './storefront.mjs';

export const RESULTS_ROOT = path.join('scripts', 'qa', 'results');
const URLS_FILE = path.join('scripts', 'qa', 'lighthouse-urls.json');
const HISTORY_FILE = path.join('scripts', 'qa', 'lighthouse-history.json');
const COMMIT_IT = 'Commit it through the next release-log PR (build pipeline, section 6.5).';

export function parseArgs(args) {
    const options = { baseline: null };
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--baseline') {
            const source = args[i + 1];
            if (!source || source.startsWith('--')) throw new Error('--baseline needs the source it records, such as "ticket 11"');
            options.baseline = source;
            i += 1;
        } else {
            throw new Error(`unknown argument "${args[i]}": qa:lighthouse takes only --baseline <source>`);
        }
    }
    return options;
}

// The cookies the browser gets: QA_PREVIEW_COOKIE's pairs, for the prelaunch host only.
const previewCookies = (value, baseUrl) => (isPrelaunchHost(baseUrl) && value ? value.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const at = part.indexOf('=');
    return { name: part.slice(0, at), value: part.slice(at + 1), url: PRELAUNCH_URL };
}) : []);

// Where the run happens, from the environment: { target, baseUrl, channel }, or a reason to stop.
function targetOf(env) {
    const base = env.QA_BASE_URL ? env.QA_BASE_URL.replace(/\/+$/, '') : null;
    if (!base) return { target: 'local', baseUrl: null, channel: env.QA_CHANNEL || HOST_CHANNEL };
    if (isPrelaunchHost(base)) {
        if (env.QA_CHANNEL && env.QA_CHANNEL !== HOST_CHANNEL) return { stop: `the prelaunch host is ReelFlies_CA (${HOST_CHANNEL}), not QA_CHANNEL ${env.QA_CHANNEL}. Unset QA_CHANNEL.` };
        const problem = cookieProblem(env.QA_PREVIEW_COOKIE);
        if (problem) return { stop: `${problem} An agent's push records "Lighthouse: pending host batch", and the next host batch (npm run qa:prelaunch, in Shaun's shell) measures that build.` };
        return { target: 'host', baseUrl: base, channel: HOST_CHANNEL };
    }
    if (!env.QA_CHANNEL) return { stop: `set QA_CHANNEL to the channel ${base} serves, so the run takes that channel's URLs and reads its theme uuid` };
    return { target: 'host', baseUrl: base, channel: env.QA_CHANNEL };
}

// The run, with everything it touches passed in (main below gives the real ones):
//   urlList, history, config      lighthouse-urls.json, lighthouse-history.json, lighthouse-config.js
//   analytics(env)                { blocked }, or throws (analyticsMode)
//   capture(channel)              release-capture.mjs's { capture: { themeUuid, themeName, variationName } }
//   storefront()                  { baseUrl, stop } (storefront.mjs, useStorefront)
//   launchBrowser({ cookies })    { port, version, close }
//   runLighthouse(url, flags, config)   { lhr, report: [json, html] }
//   checkout(), readReleases(), writeFile(file, text), writeJson(file, data), mkdir(dir),
//   writeHistory(history), now(), log, error
// Resolves to { code, summary }.
export async function runLighthouseGate({
    env, args = [], root = ROOT, urlList, history, config, analytics = value => analyticsMode({ env: value }), now = () => new Date(),
    checkout, readReleases, capture, storefront, launchBrowser, runLighthouse, writeFile, writeJson, mkdir, writeHistory,
    log = console.log, error = console.error,
}) {
    const stop = message => {
        error(`STOP     ${message}`);
        return { code: 2, summary: null };
    };
    let options;
    let blocked;
    try {
        options = parseArgs(args);
        ({ blocked } = analytics(env));
    } catch (problem) {
        return stop(problem.message);
    }
    const where = targetOf(env);
    if (where.stop) return stop(where.stop);
    const { target, channel } = where;
    if (options.baseline && (target !== 'host' || !blocked)) {
        return stop('--baseline records a comparison point, which only a run on a host with the analytics tags blocked can be: set QA_BASE_URL, and unset QA_ANALYTICS');
    }

    const listProblems = urlListProblems(urlList);
    if (listProblems.length) return stop(`${URLS_FILE} can't be used: ${listProblems.join('; ')}`);
    const pastProblems = historyProblems(history);
    if (pastProblems.length) return stop(`${HISTORY_FILE} can't be used: ${pastProblems.join('; ')}`);
    let listed;
    try {
        listed = channelUrls(urlList, channel);
    } catch (problem) {
        return stop(problem.message);
    }

    let theme = null;
    if (target === 'host') {
        try {
            const { capture: active } = await capture(channel);
            theme = {
                uuid: active.themeUuid, name: active.themeName, variation: active.variationName, commit: releaseCommitFor(readReleases(), active.themeUuid),
            };
        } catch (problem) {
            return stop(`couldn't read the theme active on ${channel} (${problem.message}), so the results couldn't be filed under its uuid: nothing ran`);
        }
    }

    let server;
    try {
        server = await storefront();
    } catch (problem) {
        return stop(problem.message);
    }

    const from = checkout();
    const started = now();
    let dir;
    if (env.QA_RESULTS_DIR) dir = path.resolve(root, env.QA_RESULTS_DIR);
    else if (theme) dir = resultsDir(theme.uuid, root);
    else dir = path.join(root, RESULTS_ROOT, 'local', `${from.sha.slice(0, 12)}${from.dirty ? '-dirty' : ''}${env.QA_OVERLAY ? `+${env.QA_OVERLAY}` : ''}`);
    const out = path.join(dir, 'lighthouse');
    mkdir(out);

    const compare = target === 'host' && blocked;
    const problems = [];
    log(`Lighthouse on ${server.baseUrl} (channel ${channel}): ${theme ? `${theme.name} ${theme.uuid}, ${theme.commit ? `commit ${theme.commit.slice(0, 8)}` : 'a build RELEASES.md doesn\'t record'}` : `a local stencil start of ${from.sha.slice(0, 8)}${from.dirty ? ' with uncommitted changes' : ''}`}`);
    log(`Mobile, the median of ${RUNS_PER_URL} runs per URL; ${analyticsRecord({ blocked })}. Results: ${path.relative(root, out)}/`);
    if (target === 'local') log('A local stencil start serves the dev build, so only accessibility and CLS are judged, and nothing is compared with or recorded in the history.');
    else if (!blocked) log('The analytics tags load in this run: it is information only, never compared with or recorded in the history.');
    listed.waiting.forEach(({ kind, reason }) => log(`WARNING  not measured on channel ${channel}: ${kind} (${reason})`));
    listed.stale.forEach(kind => log(`WARNING  channel ${channel} lists a ${kind} page now: delete its notPinnedYet entry in ${URLS_FILE}`));
    listed.missing.forEach(kind => problems.push(`no ${kind} page is listed for channel ${channel}: add one to ${URLS_FILE}, or say why not yet in its notPinnedYet`));

    const urls = [];
    let browser;
    try {
        browser = await launchBrowser({ cookies: previewCookies(env.QA_PREVIEW_COOKIE, server.baseUrl) });
    } catch (problem) {
        await server.stop();
        return stop(`couldn't start Chromium for Lighthouse (${problem.message}): npx playwright install chromium installs Playwright's build`);
    }
    let lighthouseVersion = null;
    try {
        const flags = {
            port: browser.port, output: ['json', 'html'], logLevel: 'error', blockedUrlPatterns: blocked ? lighthouseBlockedUrlPatterns() : [],
        };
        for (const entry of listed.urls) {
            const label = `${entry.key} \`${entry.path}\``;
            const result = {
                key: entry.key, path: entry.path, budget: entry.budget, note: entry.note, runs: [], medians: null, comparison: null, leaked: false, problems: [], notes: [],
            };
            for (let n = 1; n <= RUNS_PER_URL; n += 1) {
                let measured = null;
                for (let attempt = 1; attempt <= 2 && !measured; attempt += 1) {
                    const report = `${slug(entry.key)}-${n}.report`;
                    try {
                        const { lhr, report: [json, html] } = await runLighthouse(new URL(entry.path, `${server.baseUrl}/`).href, flags, config); // eslint-disable-line no-await-in-loop
                        writeFile(path.join(out, `${report}.json`), json);
                        writeFile(path.join(out, `${report}.html`), html);
                        lighthouseVersion = lighthouseVersion || lhr.lighthouseVersion;
                        measured = {
                            metrics: metricsOf(lhr), analytics: analyticsRequests(lhr), benchmarkIndex: lhr.environment?.benchmarkIndex ?? null, report: `${report}.json`, retried: attempt > 1,
                        };
                    } catch (problem) {
                        if (attempt === 1) log(`RETRY    ${label} run ${n}: ${problem.message}; running it once more`);
                        else result.problems.push(`${label}: Lighthouse couldn't measure it: ${problem.message}`);
                    }
                }
                if (!measured) break;
                if (blocked && measured.analytics.completed.length) {
                    result.leaked = true;
                    measured.analytics.completed.map(url => `${label}: an analytics request completed although the tags were blocked: ${url}`)
                        .filter(problem => !result.problems.includes(problem)).forEach(problem => result.problems.push(problem));
                }
                result.runs.push(measured);
            }
            if (result.runs.length === RUNS_PER_URL) {
                result.medians = medianMetrics(result.runs.map(run => run.metrics));
                if (compare) result.comparison = comparisonPoint(history, channel, entry.key);
                const verdict = judgeUrl({
                    entry, medians: result.medians, target, comparison: result.comparison, compare,
                });
                result.problems.push(...verdict.problems);
                result.notes.push(...verdict.notes);
            }
            urls.push(result);
        }
    } finally {
        await browser.close();
        await server.stop();
    }

    let themeChanged = false;
    if (theme) {
        try {
            const { capture: after } = await capture(channel);
            themeChanged = after.themeUuid !== theme.uuid;
            if (themeChanged) problems.push(`the theme active on ${channel} changed while Lighthouse ran (${theme.uuid} → ${after.themeUuid}), so the results mix two builds. Run it again.`);
        } catch (problem) {
            log(`WARNING  couldn't read the active theme again after the runs (${problem.message}), so the run can't confirm every result is of ${theme.uuid}`);
        }
    }

    const allProblems = [...problems, ...urls.flatMap(url => url.problems)];
    const ok = !allProblems.length;
    const accepted = ok && compare && !options.baseline;
    const point = url => ({
        key: url.key, at: started.toISOString(), source: options.baseline || 'run', theme: theme?.uuid ?? null, commit: theme?.commit ?? null, medians: url.medians,
    });
    // A baseline records whatever the budgets say, but only of one build, and only runs that
    // blocked the tags as every run it is compared with will.
    const measured = urls.filter(url => url.medians && !url.leaked);
    let recorded = null;
    if ((accepted || (options.baseline && !themeChanged)) && measured.length) {
        writeHistory(addToHistory(history, channel, measured.map(point)));
        recorded = options.baseline ? 'baseline' : 'run';
    }

    const summary = {
        target,
        baseUrl: server.baseUrl,
        channel,
        theme,
        checkout: from,
        startedAt: started.toISOString(),
        finishedAt: now().toISOString(),
        analyticsBlocked: blocked ? 'yes' : 'no',
        runsPerUrl: RUNS_PER_URL,
        lighthouseVersion,
        browser: browser.version ?? null,
        ok,
        accepted,
        recorded,
        urls,
        waiting: listed.waiting,
        problems,
    };
    writeJson(path.join(out, 'summary.json'), summary);

    log('');
    for (const url of urls) {
        if (url.medians) log(`${url.problems.length ? 'FAIL    ' : 'ok      '} ${url.key} \`${url.path}\`: ${formatMetrics(url.medians)}`);
        url.notes.forEach(note => log(`note     ${note}`));
    }
    allProblems.forEach(problem => error(`FAIL     ${problem}`));
    log(`\n${ok ? 'Every judged Lighthouse budget passed.' : `${allProblems.length} Lighthouse problem(s).`}`);
    if (recorded === 'baseline') log(`Baseline: recorded each URL's medians as ${options.baseline}'s, the comparison point the next run's drop rule uses, in ${HISTORY_FILE}. ${COMMIT_IT}`);
    else if (recorded) log(`Accepted: each URL's medians are its new comparison point in ${HISTORY_FILE}. ${COMMIT_IT}`);
    else if (compare) log(`Not accepted: the comparison points in ${HISTORY_FILE} stay as they were.`);
    return { code: ok ? 0 : 1, summary };
}

// --- The real browser, Lighthouse and files ----------------------------------------------------

// Playwright's Chromium (build 1217, the one the gates use), headless, with a DevTools port for
// Lighthouse. A persistent context is the browser's default context, so the tab Lighthouse opens
// shares its cookie jar. The profile is a temporary folder, removed when the run ends or is
// stopped, so the preview cookie never outlives it.
async function launchChromium({ cookies }) {
    const { chromium } = await import('@playwright/test');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-lighthouse-'));
    const remove = () => fs.rmSync(dir, { recursive: true, force: true });
    const forget = cleanupOnExit(remove);
    let context;
    try {
        context = await chromium.launchPersistentContext(dir, { channel: 'chromium', headless: true, args: ['--remote-debugging-port=0'] });
        if (cookies.length) await context.addCookies(cookies);
        const portFile = path.join(dir, 'DevToolsActivePort');
        for (let waited = 0; !fs.existsSync(portFile) && waited < 5000; waited += 100) await new Promise(resolve => { setTimeout(resolve, 100); }); // eslint-disable-line no-await-in-loop
        const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
        return {
            port,
            version: `Chromium ${context.browser()?.version() ?? ''}`.trim(),
            close: async () => {
                await context.close();
                forget();
                remove();
            },
        };
    } catch (problem) {
        await context?.close();
        forget();
        remove();
        throw problem;
    }
}

async function runLighthouseInProcess(url, flags, config) {
    const { default: lighthouse } = await import('lighthouse');
    const result = await lighthouse(url, flags, config);
    if (!result) throw new Error('Lighthouse returned no result');
    return { lhr: result.lhr, report: result.report };
}

function gitCheckout() {
    const git = args => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    return { sha: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']) !== '' };
}

const readJson = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

async function main() {
    process.chdir(ROOT); // release-capture.mjs reads config.stencil.json from here
    let options;
    try {
        options = { urlList: readJson(URLS_FILE), history: readJson(HISTORY_FILE), config: createRequire(import.meta.url)(path.join(ROOT, 'lighthouse-config.js')) };
    } catch (problem) {
        console.error(`STOP     ${problem.message}`);
        process.exit(2);
    }
    const releases = path.join(ROOT, 'RELEASES.md');
    const { code } = await runLighthouseGate({
        env: process.env,
        args: process.argv.slice(2),
        ...options,
        checkout: gitCheckout,
        readReleases: () => (fs.existsSync(releases) ? fs.readFileSync(releases, 'utf8') : null),
        capture: captureLive,
        storefront: () => useStorefront(),
        launchBrowser: launchChromium,
        runLighthouse: runLighthouseInProcess,
        writeFile: (file, text) => fs.writeFileSync(file, text),
        writeJson: (file, data) => fs.writeFileSync(file, `${JSON.stringify(data, null, 4)}\n`),
        mkdir: dir => fs.mkdirSync(dir, { recursive: true }),
        writeHistory: next => fs.writeFileSync(path.join(ROOT, HISTORY_FILE), `${JSON.stringify(next, null, 4)}\n`),
    });
    process.exit(code);
}

if (isMain(import.meta.url)) main();
