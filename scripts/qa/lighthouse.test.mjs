// Ticket 17's Lighthouse runner, `npm run qa:lighthouse` (scripts/qa/lighthouse.mjs), with
// stand-ins for Lighthouse, the browser, the storefront and the store. The rules it applies are
// proved in lighthouse-rules.test.mjs; this file proves the run around them:
//
// - three mobile runs of every URL listed for the channel, with the analytics tags blocked
//   (W0-6), on a local stencil start or on QA_BASE_URL
// - the preview cookie only in the browser, only for the prelaunch host, and never printed
// - results filed by theme uuid on a host (or in the host batch's QA_RESULTS_DIR), and by commit
//   locally
// - the history read and written only by host runs with the tags blocked, and a baseline
//   recorded on request (ticket 11)
//
//   node --test scripts/qa/lighthouse.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRELAUNCH_URL, lighthouseBlockedUrlPatterns } from './analytics-hosts.mjs';
import { addToHistory, emptyHistory, lighthouseReleaseLines } from './lighthouse-rules.mjs';
import { RESULTS_ROOT, parseArgs, runLighthouseGate } from './lighthouse.mjs';

const fixture = name => JSON.parse(fs.readFileSync(new URL(`lighthouse-fixtures/${name}.json`, import.meta.url), 'utf8'));
const HOME = fixture('home');
const SEARCH = fixture('search');
const UUID = '174ad580-a42a-013f-3c01-06627e5707c7';
const OTHER_UUID = '58abad50-a3c0-013f-e2b6-2ec98cc9ce73';
const BUILD_SHA = 'a30586f5913f2ae391729c9fe0c05885e8712326';
const CHECKOUT_SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const COOKIE = 'STORESUITE_CP_TOKEN=rf-secret-cp-token; SHOP_SESSION_TOKEN=rf-secret-session';
const ROOT = '/checkout';
const CONFIG = { extends: 'lighthouse:default', settings: {} };
const RELEASES = `# Release log\n\n## Releases\n\n### 2026-10-07 03:07 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA\n\n- Theme: ReelFlies 6.22.0, uuid \`${UUID}\`\n- Commit: \`${BUILD_SHA}\` on \`master\`\n`;

// The medians of an accepted run, for a history.
function metricsLike(performance, extra = {}) {
    return {
        performance, accessibility: 100, lcpMs: 2000, cls: 0.01, tbtMs: 100, jsBytes: 474688, cssBytes: 93760, ...extra,
    };
}

// A result that passes every budget, with a performance score of `performance`.
const passing = (performance = 95) => ({
    ...HOME,
    categories: { ...HOME.categories, performance: { id: 'performance', score: performance / 100 } },
    audits: {
        ...HOME.audits,
        'largest-contentful-paint': { numericValue: 2100 },
        'total-blocking-time': { numericValue: 120 },
        'cumulative-layout-shift': { numericValue: 0.01 },
    },
});
const LIST = {
    version: 1,
    channels: {
        1895766: {
            urls: { home: { path: '/', budget: 'self' }, cart: { path: '/cart.php' }, search: { path: '/search.php?search_query=adams' } },
            notPinnedYet: { species: 'no tree 4 until refactor 13', 'fly-type': 'no tree 4 until refactor 13', product: 'no products until refactor 14' },
        },
        1: {
            urls: { home: { path: '/' } },
            notPinnedYet: {
                species: 'x', 'fly-type': 'x', product: 'x', cart: 'x', search: 'x',
            },
        },
    },
};

// Runs the gate with stand-ins. `results(url, n)` gives the lhr of run n (1-based) of a URL, or
// throws as Lighthouse would.
async function gate({
    env = {},
    args = [],
    list = LIST,
    history = emptyHistory(),
    results = () => passing(),
    themes = [{ themeUuid: UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }],
    captureError = null,
    blocked = true,
    launchError = null,
} = {}) {
    const calls = [];
    const lines = [];
    const files = {};
    const counts = {};
    let captures = 0;
    let written = null;
    const result = await runLighthouseGate({
        env,
        args,
        root: ROOT,
        urlList: list,
        history,
        config: CONFIG,
        analytics: () => ({ blocked }),
        now: () => new Date(Date.UTC(2026, 9, 20, 14, 0)),
        checkout: () => ({ sha: CHECKOUT_SHA, dirty: false }),
        readReleases: () => RELEASES,
        capture: async channel => {
            calls.push(['capture', channel]);
            if (captureError) throw new Error(captureError);
            const theme = themes[Math.min(captures, themes.length - 1)];
            captures += 1;
            return { capture: theme };
        },
        storefront: async () => {
            calls.push(['storefront']);
            return { baseUrl: env.QA_BASE_URL ? env.QA_BASE_URL.replace(/\/+$/, '') : 'http://localhost:4101', stop: async () => calls.push(['stop']) };
        },
        launchBrowser: async ({ cookies }) => {
            calls.push(['launch', cookies]);
            if (launchError) throw new Error(launchError);
            return { port: 9333, version: 'HeadlessChrome/147.0.7727.15', close: async () => calls.push(['close']) };
        },
        runLighthouse: async (url, flags, config) => {
            counts[url] = (counts[url] || 0) + 1;
            calls.push(['lighthouse', url, flags, config]);
            const lhr = results(url, counts[url]);
            return { lhr, report: [JSON.stringify(lhr), '<html>report</html>'] };
        },
        writeFile: (file, text) => { files[file] = text; },
        writeJson: (file, data) => { files[file] = data; },
        mkdir: dir => calls.push(['mkdir', dir]),
        writeHistory: next => { written = next; },
        log: line => lines.push(line),
        error: line => lines.push(line),
    });
    const runs = calls.filter(([kind]) => kind === 'lighthouse');
    return {
        ...result, calls, lines, text: lines.join('\n'), files, runs, written,
    };
}

const resultsFolder = (...parts) => path.join(ROOT, RESULTS_ROOT, ...parts);
const summaryOf = (run, folder) => run.files[path.join(folder, 'lighthouse', 'summary.json')];

describe('a local run (a stencil start of this checkout)', () => {
    it('runs mobile Lighthouse three times on each URL listed for the channel, with the analytics tags blocked', async () => {
        const run = await gate();
        assert.equal(run.code, 0, run.text);
        assert.deepEqual(run.runs.map(([, url]) => url), [
            ...Array(3).fill('http://localhost:4101/'),
            ...Array(3).fill('http://localhost:4101/cart.php'),
            ...Array(3).fill('http://localhost:4101/search.php?search_query=adams'),
        ]);
        for (const [, , flags, config] of run.runs) {
            assert.equal(config, CONFIG, 'the repo\'s lighthouse-config.js, mobile by default');
            assert.deepEqual(flags.blockedUrlPatterns, lighthouseBlockedUrlPatterns());
            assert.deepEqual(flags.output, ['json', 'html']);
            assert.equal(flags.port, 9333);
            assert.equal(flags.extraHeaders, undefined, 'headers would go to every host the page loads from');
            assert.equal(flags.formFactor, undefined, 'the config\'s own mobile settings stand');
        }
        assert.deepEqual(run.calls.find(([kind]) => kind === 'launch')[1], [], 'no cookie locally');
        assert.ok(run.calls.some(([kind]) => kind === 'stop') && run.calls.some(([kind]) => kind === 'close'));
        assert.ok(!run.calls.some(([kind]) => kind === 'capture'), 'a local run reads nothing from the store');
    });

    it('files its results by commit, and reports the kinds the channel can\'t pin yet', async () => {
        const run = await gate();
        const folder = resultsFolder('local', CHECKOUT_SHA.slice(0, 12));
        const summary = summaryOf(run, folder);
        assert.equal(summary.target, 'local');
        assert.equal(summary.analyticsBlocked, 'yes');
        assert.equal(summary.theme, null);
        assert.deepEqual(summary.checkout, { sha: CHECKOUT_SHA, dirty: false });
        assert.deepEqual(summary.urls.map(url => [url.key, url.runs.length, url.medians.performance]), [['home', 3, 95], ['cart', 3, 95], ['search', 3, 95]]);
        assert.equal(run.files[path.join(folder, 'lighthouse', 'cart-2.report.html')], '<html>report</html>');
        assert.ok(run.files[path.join(folder, 'lighthouse', 'cart-2.report.json')]);
        assert.match(run.text, /WARNING {2}not measured on channel 1895766: species \(no tree 4 until refactor 13\)/);
        assert.match(run.text, /WARNING {2}not measured on channel 1895766: product \(no products until refactor 14\)/);
    });

    it('judges only accessibility and CLS there, and never reads or writes the history', async () => {
        const history = addToHistory(emptyHistory(), '1895766', [{
            key: 'cart', at: '2026-10-06T14:30:00.000Z', source: 'run', theme: UUID, commit: BUILD_SHA, medians: metricsLike(99),
        }]);
        const run = await gate({ history, results: url => (url.endsWith('adams') ? SEARCH : HOME) });
        assert.equal(run.code, 1);
        assert.match(run.text, /FAIL {5}search `\/search\.php\?search_query=adams`: accessibility 99, below the budget of 100 \(heading-order\)/);
        assert.match(run.text, /FAIL {5}search `\/search\.php\?search_query=adams`: CLS 0\.096, over the budget of 0\.050/);
        assert.doesNotMatch(run.text, /FAIL .*cart/, 'the home fixture\'s performance 89 and LCP 3.08 s aren\'t judged locally');
        assert.equal(run.written, null);
        assert.equal(summaryOf(run, resultsFolder('local', CHECKOUT_SHA.slice(0, 12))).urls[1].comparison, null);
    });
});

describe('a run on the prelaunch host (the host batch, or Shaun\'s shell)', () => {
    const host = { QA_BASE_URL: PRELAUNCH_URL, QA_PREVIEW_COOKIE: COOKIE };

    it('stops before anything runs without the preview cookie, and says the push waits for the host batch', async () => {
        const run = await gate({ env: { QA_BASE_URL: PRELAUNCH_URL } });
        assert.equal(run.code, 2);
        assert.deepEqual(run.calls, []);
        assert.match(run.text, /STOP {5}QA_PREVIEW_COOKIE isn't set/);
        assert.match(run.text, /pending host batch/);
        const garbage = await gate({ env: { QA_BASE_URL: PRELAUNCH_URL, QA_PREVIEW_COOKIE: 'rf-secret-garbage' } });
        assert.equal(garbage.code, 2);
        assert.doesNotMatch(garbage.text, /rf-secret/);
    });

    it('gives the cookie to the browser for the prelaunch host only, and never prints it', async () => {
        const run = await gate({ env: host });
        assert.equal(run.code, 0, run.text);
        assert.deepEqual(run.calls.find(([kind]) => kind === 'launch')[1], [
            { name: 'STORESUITE_CP_TOKEN', value: 'rf-secret-cp-token', url: PRELAUNCH_URL },
            { name: 'SHOP_SESSION_TOKEN', value: 'rf-secret-session', url: PRELAUNCH_URL },
        ]);
        assert.doesNotMatch(run.text, /rf-secret/);
        assert.doesNotMatch(JSON.stringify(run.files), /rf-secret/);
        assert.doesNotMatch(JSON.stringify(run.runs.map(([, url, flags]) => [url, flags])), /rf-secret/);
    });

    it('files its results under the theme uuid it reads from the store, or in the host batch\'s QA_RESULTS_DIR', async () => {
        const run = await gate({ env: host });
        assert.deepEqual(run.calls.filter(([kind]) => kind === 'capture'), [['capture', '1895766'], ['capture', '1895766']], 'before and after the runs');
        const summary = summaryOf(run, resultsFolder('host', UUID));
        assert.deepEqual(summary.theme, {
            uuid: UUID, name: 'ReelFlies', variation: 'ReelFlies CA', commit: BUILD_SHA,
        });
        assert.equal(summary.target, 'host');

        const batch = await gate({ env: { ...host, QA_RESULTS_DIR: '/checkout/scripts/qa/results/host/x' } });
        assert.ok(summaryOf(batch, '/checkout/scripts/qa/results/host/x'));
    });

    it('accepts a run that passes, and records each URL as its new comparison point', async () => {
        const run = await gate({ env: host });
        assert.equal(run.code, 0);
        assert.match(run.text, /Accepted: each URL's medians are its new comparison point in scripts\/qa\/lighthouse-history\.json/);
        const cart = run.written.channels['1895766'].cart;
        assert.equal(cart.length, 1);
        assert.deepEqual(cart[0], {
            at: '2026-10-20T14:00:00.000Z', source: 'run', theme: UUID, commit: BUILD_SHA, medians: metricsLike(95, { lcpMs: 2100, tbtMs: 120, cls: 0.01 }),
        });
        assert.deepEqual(Object.keys(run.written.channels['1895766']), ['home', 'cart', 'search']);
        assert.equal(summaryOf(run, resultsFolder('host', UUID)).accepted, true);
    });

    it('fails a performance median 6 points below the last accepted run, and keeps that run as the comparison point', async () => {
        const history = addToHistory(emptyHistory(), '1895766', [{
            key: 'cart', at: '2026-10-06T14:30:00.000Z', source: 'ticket 11', theme: OTHER_UUID, commit: null, medians: metricsLike(97),
        }]);
        const failing = await gate({ env: host, history, results: () => passing(91) });
        assert.equal(failing.code, 1);
        assert.match(failing.text, /FAIL {5}cart `\/cart\.php`: performance 91, 6 points below the last accepted run \(97, ticket 11 of 2026-10-06 14:30 UTC on theme 58abad50\)/);
        assert.equal(failing.written, null, 'a failed run is never accepted');

        const five = await gate({ env: host, history, results: () => passing(92) });
        assert.equal(five.code, 0, five.text);
        assert.equal(five.written.channels['1895766'].cart.length, 2);
    });

    it('takes each URL\'s median of three: 88, 91 and 93 give 91', async () => {
        const scores = [88, 93, 91];
        const run = await gate({ env: host, results: (url, n) => passing(scores[n - 1]) });
        assert.deepEqual(summaryOf(run, resultsFolder('host', UUID)).urls.map(url => url.medians.performance), [91, 91, 91]);
    });

    it('runs with the tags loaded only as information: no drop rule, and never accepted', async () => {
        const history = addToHistory(emptyHistory(), '1895766', [{
            key: 'cart', at: '2026-10-06T14:30:00.000Z', source: 'run', theme: UUID, commit: null, medians: metricsLike(99),
        }]);
        const run = await gate({
            env: { ...host, QA_ANALYTICS: 'allow' }, blocked: false, history, results: () => passing(80),
        });
        for (const [, , flags] of run.runs) assert.deepEqual(flags.blockedUrlPatterns, []);
        assert.equal(run.written, null);
        assert.doesNotMatch(run.text, /points below the last accepted run/);
        const summary = summaryOf(run, resultsFolder('host', UUID));
        assert.equal(summary.analyticsBlocked, 'no');
        assert.equal(summary.accepted, false);
        assert.match(run.text, /FAIL {5}cart `\/cart\.php`: performance 80, below the budget of 90/, 'the budgets are still reported');
    });

    it('fails when an analytics request completed although the tags were blocked', async () => {
        const leaky = {
            ...passing(),
            audits: { ...passing().audits, 'network-requests': { details: { items: [{ url: 'https://region1.analytics.google.com/g/collect?v=2', statusCode: 204 }] } } },
        };
        const run = await gate({ env: host, results: url => (url.endsWith('/cart.php') ? leaky : passing()) });
        assert.equal(run.code, 1);
        assert.match(run.text, /FAIL {5}cart `\/cart\.php`: an analytics request completed although the tags were blocked: https:\/\/region1\.analytics\.google\.com\/g\/collect\?v=2/);
        assert.equal(run.written, null);
    });

    it('fails when the active theme changed while it ran, and stops when it can\'t read the theme', async () => {
        const changed = await gate({ env: host, themes: [{ themeUuid: UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }, { themeUuid: OTHER_UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }] });
        assert.equal(changed.code, 1);
        assert.match(changed.text, /the theme active on 1895766 changed while Lighthouse ran \(174ad580-a42a-013f-3c01-06627e5707c7 → 58abad50/);
        assert.equal(changed.written, null);

        const unreadable = await gate({ env: host, captureError: 'capture of channel 1895766 failed: 401' });
        assert.equal(unreadable.code, 2);
        assert.match(unreadable.text, /STOP {5}couldn't read the theme active on 1895766 \(capture of channel 1895766 failed: 401\)/);
        assert.ok(!unreadable.calls.some(([kind]) => kind === 'launch'));
    });
});

describe('ticket 11\'s baseline (--baseline)', () => {
    const host = { QA_BASE_URL: PRELAUNCH_URL, QA_PREVIEW_COOKIE: COOKIE };

    it('records each URL\'s medians as its comparison point whatever the budgets say, so the first run compares with it', async () => {
        const run = await gate({ env: host, args: ['--baseline', 'ticket 11'], results: () => passing(70) });
        assert.equal(run.code, 1, 'the budgets still fail the run');
        assert.equal(run.written.channels['1895766'].cart[0].source, 'ticket 11');
        assert.equal(run.written.channels['1895766'].cart[0].medians.performance, 70);
        assert.match(run.text, /Baseline: recorded each URL's medians as ticket 11's/);

        const first = await gate({ env: host, history: run.written, results: () => passing(95) });
        const cart = summaryOf(first, resultsFolder('host', UUID)).urls.find(url => url.key === 'cart');
        assert.equal(cart.comparison.source, 'ticket 11');
    });

    it('records nothing when the active theme changed meanwhile, and leaves out a URL whose runs sent an analytics request', async () => {
        const themes = [{ themeUuid: UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }, { themeUuid: OTHER_UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }];
        const changed = await gate({ env: host, args: ['--baseline', 'ticket 11'], themes });
        assert.equal(changed.written, null);
        assert.doesNotMatch(changed.text, /Baseline: recorded/);

        const leaky = {
            ...passing(),
            audits: { ...passing().audits, 'network-requests': { details: { items: [{ url: 'https://connect.facebook.net/en_US/fbevents.js', statusCode: 200 }] } } },
        };
        const leaked = await gate({ env: host, args: ['--baseline', 'ticket 11'], results: url => (url.endsWith('/cart.php') ? leaky : passing()) });
        assert.deepEqual(Object.keys(leaked.written.channels['1895766']), ['home', 'search']);
    });

    it('is refused locally and with the tags loaded, and needs a source', async () => {
        const local = await gate({ args: ['--baseline', 'ticket 11'] });
        assert.equal(local.code, 2);
        assert.match(local.text, /--baseline records a comparison point, which only a run on a host with the analytics tags blocked can be/);
        const loaded = await gate({ env: { ...host, QA_ANALYTICS: 'allow' }, blocked: false, args: ['--baseline', 'ticket 11'] });
        assert.equal(loaded.code, 2);
        assert.throws(() => parseArgs(['--baseline']), /--baseline needs the source it records, such as "ticket 11"/);
        assert.throws(() => parseArgs(['--runs', '5']), /unknown argument "--runs"/);
        assert.deepEqual(parseArgs([]), { baseline: null });
    });
});

describe('a run Lighthouse can\'t finish', () => {
    const error = {
        ...HOME, runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'Lighthouse was unable to reliably load the page you requested. (Status code: 500)' },
    };

    it('runs once more, as the gates ask a 5xx again (W0-4)', async () => {
        const run = await gate({ results: (url, n) => (url.endsWith('/cart.php') && n === 2 ? error : passing()) });
        assert.equal(run.code, 0, run.text);
        assert.match(run.text, /RETRY {4}cart `\/cart\.php` run 2: ERRORED_DOCUMENT_REQUEST/);
        assert.equal(run.runs.filter(([, url]) => url.endsWith('/cart.php')).length, 4);
    });

    it('fails the URL, naming the error, when it fails again, and measures the rest', async () => {
        const run = await gate({ results: url => (url.endsWith('/cart.php') ? error : passing()) });
        assert.equal(run.code, 1);
        assert.match(run.text, /FAIL {5}cart `\/cart\.php`: Lighthouse couldn't measure it: ERRORED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested\. \(Status code: 500\)/);
        assert.equal(run.runs.filter(([, url]) => url.endsWith('/cart.php')).length, 2);
        assert.equal(run.runs.filter(([, url]) => url.endsWith('adams')).length, 3);
        const thrown = await gate({ results: url => { if (url.endsWith('/cart.php')) throw new Error('Protocol error'); return passing(); } });
        assert.match(thrown.text, /cart `\/cart\.php`: Lighthouse couldn't measure it: Protocol error/);
    });
});

describe('before anything runs', () => {
    it('stops, and stops the storefront it started, when Chromium won\'t start', async () => {
        const run = await gate({ launchError: 'Executable doesn\'t exist at …/chromium-1217' });
        assert.equal(run.code, 2);
        assert.match(run.text, /STOP {5}couldn't start Chromium for Lighthouse \(Executable doesn't exist at …\/chromium-1217\): npx playwright install chromium/);
        assert.ok(run.calls.some(([kind]) => kind === 'stop'));
        assert.equal(run.runs.length, 0);
    });

    it('stops on a host it can\'t name the channel of, and never sends the cookie there', async () => {
        const unnamed = await gate({ env: { QA_BASE_URL: 'https://reelflies.ca', QA_PREVIEW_COOKIE: COOKIE } });
        assert.equal(unnamed.code, 2);
        assert.match(unnamed.text, /STOP {5}set QA_CHANNEL to the channel https:\/\/reelflies\.ca serves/);
        const named = await gate({ env: { QA_BASE_URL: 'https://reelflies.ca', QA_CHANNEL: '1', QA_PREVIEW_COOKIE: COOKIE } });
        assert.equal(named.code, 0, named.text);
        assert.deepEqual(named.calls.find(([kind]) => kind === 'launch')[1], [], 'the preview cookie is the prelaunch host\'s alone');
        assert.deepEqual(named.calls.filter(([kind]) => kind === 'capture'), [['capture', '1'], ['capture', '1']]);
        const wrong = await gate({ env: { ...{ QA_BASE_URL: PRELAUNCH_URL, QA_PREVIEW_COOKIE: COOKIE }, QA_CHANNEL: '1' } });
        assert.equal(wrong.code, 2);
        assert.match(wrong.text, /the prelaunch host is ReelFlies_CA \(1895766\), not QA_CHANNEL 1/);
    });

    it('stops on a channel with no list, a list or history it can\'t use, and fails a kind no pin covers', async () => {
        const unlisted = await gate({ env: { QA_CHANNEL: '1855224' } });
        assert.equal(unlisted.code, 2);
        assert.match(unlisted.text, /no Lighthouse URLs for channel 1855224/);
        const badHistory = await gate({ history: { version: 2, channels: {} } });
        assert.equal(badHistory.code, 2);
        assert.match(badHistory.text, /scripts\/qa\/lighthouse-history\.json can't be used: version must be 1/);
        const badList = await gate({ list: { version: 1, channels: { 1895766: { urls: { basket: { path: '/cart.php' } } } } } });
        assert.equal(badList.code, 2);
        assert.match(badList.text, /scripts\/qa\/lighthouse-urls\.json can't be used/);
        assert.deepEqual([...unlisted.calls, ...badHistory.calls, ...badList.calls], []);

        const gap = await gate({ list: { version: 1, channels: { 1895766: { urls: { cart: { path: '/cart.php' } } } } } });
        assert.equal(gap.code, 1);
        assert.match(gap.text, /FAIL {5}no home page is listed for channel 1895766: add one to scripts\/qa\/lighthouse-urls\.json, or say why not yet in its notPinnedYet/);
        assert.equal(gap.runs.length, 3, 'the URLs it has are still measured');
    });
});

describe('npm run qa:lighthouse', () => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_')));

    it('is the package script', () => {
        const { scripts } = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
        assert.equal(scripts['qa:lighthouse'], 'node scripts/qa/lighthouse.mjs');
    });

    it('stops at once on the prelaunch host without the cookie, before any request', () => {
        const { status, stdout, stderr } = spawnSync(process.execPath, ['scripts/qa/lighthouse.mjs'], {
            encoding: 'utf8', env: { ...env, QA_BASE_URL: PRELAUNCH_URL },
        });
        assert.equal(status, 2, stdout + stderr);
        assert.match(stderr, /QA_PREVIEW_COOKIE isn't set/);
    });

    it('refuses an unknown argument', () => {
        const { status, stderr } = spawnSync(process.execPath, ['scripts/qa/lighthouse.mjs', '--all-channels'], { encoding: 'utf8', env });
        assert.equal(status, 2);
        assert.match(stderr, /unknown argument "--all-channels"/);
    });
});

describe('the release\'s run after a push (ticket 17\'s release.sh hook, step 6b)', () => {
    const host = { QA_BASE_URL: PRELAUNCH_URL, QA_PREVIEW_COOKIE: COOKIE };
    const PUSHED_SHA = 'f00dfeed'.repeat(5);

    it('names the build by QA_RELEASE_COMMIT, because RELEASES.md records the push only at step 7', async () => {
        const fresh = await gate({ env: { ...host, QA_RELEASE_COMMIT: PUSHED_SHA }, themes: [{ themeUuid: OTHER_UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }] });
        assert.equal(fresh.code, 0, fresh.text);
        assert.equal(summaryOf(fresh, resultsFolder('host', OTHER_UUID)).theme.commit, PUSHED_SHA);
        assert.equal(fresh.written.channels['1895766'].cart[0].commit, PUSHED_SHA, 'the accepted run records the build\'s commit');
        assert.match(fresh.text, /58abad50-a3c0-013f-e2b6-2ec98cc9ce73, commit f00dfeed/);
        // A repeat push can keep the theme's uuid, which RELEASES.md then records with the older commit.
        const repeat = await gate({ env: { ...host, QA_RELEASE_COMMIT: PUSHED_SHA } });
        assert.equal(summaryOf(repeat, resultsFolder('host', UUID)).theme.commit, PUSHED_SHA);
    });

    it('takes RELEASES.md\'s commit without QA_RELEASE_COMMIT, or when it isn\'t a full commit sha', async () => {
        for (const value of [undefined, 'HEAD', PUSHED_SHA.slice(0, 7)]) {
            const run = await gate({ env: { ...host, ...(value ? { QA_RELEASE_COMMIT: value } : {}) } }); // eslint-disable-line no-await-in-loop
            assert.equal(summaryOf(run, resultsFolder('host', UUID)).theme.commit, BUILD_SHA, String(value));
        }
    });

    it('writes the lines a release entry records into summary.json, so the release reads them without importing this runner', async () => {
        const run = await gate({ env: host, results: url => (url.endsWith('adams') ? SEARCH : passing()) });
        const { releaseLines, ...summary } = summaryOf(run, resultsFolder('host', UUID));
        assert.deepEqual(releaseLines, lighthouseReleaseLines(summary));
        assert.match(releaseLines[0], /^ {2}- home `\/`: performance 95, /);
        assert.ok(releaseLines.some(line => /^ {2}- failed: search /.test(line)), 'each problem is a line too');
        assert.ok(releaseLines.some(line => /^ {2}- not measured yet: /.test(line)));
    });
});
