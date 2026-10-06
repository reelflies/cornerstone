// The host batch, `npm run qa:prelaunch` (scripts/qa/prelaunch.mjs, W0-6): the gates against
// the prelaunch host, with the preview cookie from the operator's shell, once per checkpoint.
//
// - Without the cookie it stops at once and says so, before any request. It never prints it.
// - It reads the active theme's uuid first, and writes every result to
//   scripts/qa/results/host/<uuid>/, so each result belongs to one build.
// - It runs axe, the raw-HTML check and the screenshots for every pinned page kind, with the
//   analytics tags blocked, and ticket 17's Lighthouse once `npm run qa:lighthouse` exists.
//   Once ticket 08 records Shaun's GA4 hostname filter, one more Lighthouse run loads the
//   tags, as information only.
// - It appends a "Host runs" row to RELEASES.md, and fills in a release entry's
//   "Lighthouse: pending host batch" once its Lighthouse ran.
//
//   node --test scripts/qa/prelaunch.test.mjs

import { spawnSync } from 'child_process';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRELAUNCH_URL } from './analytics-hosts.mjs';
import { RELEASES_TEMPLATE } from '../release-log.mjs';
import {
    LIGHTHOUSE_PENDING_LINE, addHostRun, batchGates, cookieProblem, fillPendingLighthouse, hostRunRow, releaseCommitFor, resultsDir,
    runHostBatch,
} from './prelaunch.mjs';

const UUID = '58abad50-a3c0-013f-e2b6-2ec98cc9ce73';
const OTHER_UUID = '11111111-2222-3333-4444-555555555555';
const SHA = '5d0d0cb8ca42405d8555de6a84f20843060d7cde';
const COOKIE = 'STORESUITE_CP_TOKEN=rf-secret-cp-token; SHOP_SESSION_TOKEN=rf-secret-session';
const ROOT = '/checkout';

const entry = (uuid, sha, extra = []) => [
    '### 2026-10-06 14:30 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
    '',
    `- Theme: ReelFlies 6.22.0, uuid \`${uuid}\``,
    `- Commit: \`${sha}\` on \`master\``,
    '- Operator: Shaun Bathgate',
    ...extra,
    '',
].join('\n');
const releases = (...entries) => entries.reduce((text, item) => {
    const at = text.indexOf('\n## Switch toggles');
    return `${text.slice(0, at)}\n${item}${text.slice(at)}`;
}, RELEASES_TEMPLATE);

// Runs the batch with stand-ins for the store, the gates, git and the files.
async function batch({
    env = { QA_PREVIEW_COOKIE: COOKIE },
    themes = [{ themeUuid: UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' }],
    failing = [],
    scripts = { 'qa:axe': '', 'qa:raw-html': '', 'qa:screens': '' },
    ga4FilterSince = null,
    log = releases(entry(UUID, SHA)),
    captureError = null,
} = {}) {
    const calls = [];
    const lines = [];
    const files = {};
    let captures = 0;
    const result = await runHostBatch({
        env,
        root: ROOT,
        scripts,
        ga4FilterSince,
        now: () => new Date(Date.UTC(2026, 9, 7, 15, 4)),
        checkout: () => ({ sha: 'abcdef1234567890abcdef1234567890abcdef12', dirty: false }),
        capture: async channel => {
            calls.push(['capture', channel]);
            if (captureError) throw new Error(captureError);
            const theme = themes[Math.min(captures, themes.length - 1)];
            captures += 1;
            return { capture: theme };
        },
        runGate: async ({ gate, env: gateEnv, args }) => {
            calls.push(['gate', gate.script, gateEnv, args, gate]);
            return failing.includes(gate.script) || failing.includes(gate.slug) ? [`npm run ${gate.script} exited 1`] : [];
        },
        readReleases: () => log,
        writeReleases: text => { files['RELEASES.md'] = text; },
        writeJson: (file, data) => { files[file] = JSON.stringify(data, null, 2); },
        mkdir: dir => calls.push(['mkdir', dir]),
        log: line => lines.push(line),
        error: line => lines.push(line),
    });
    return {
        ...result, calls, lines, files, gates: calls.filter(([kind]) => kind === 'gate'),
    };
}

describe('before anything runs', () => {
    it('stops at once without the preview cookie, and says how to set it', async () => {
        const run = await batch({ env: {} });
        assert.equal(run.code, 2);
        assert.deepEqual(run.calls, []);
        assert.deepEqual(run.files, {});
        assert.match(run.lines.join('\n'), /STOP {5}QA_PREVIEW_COOKIE isn't set, so nothing ran: the prelaunch host answers every page with a 503 without it\. Read it in your own shell first: read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE/);
    });

    it('stops on a cookie that isn\'t name=value pairs, without printing it', async () => {
        const runs = await Promise.all(['rf-secret-garbage', '=rf-secret-value', 'A=1; rf-secret-garbage'].map(cookie => batch({ env: { QA_PREVIEW_COOKIE: cookie } })));
        for (const run of runs) {
            assert.equal(run.code, 2);
            assert.deepEqual(run.calls, []);
            assert.match(run.lines.join('\n'), /QA_PREVIEW_COOKIE isn't in the form name=value; name2=value2/);
            assert.doesNotMatch(run.lines.join('\n'), /rf-secret/);
        }
        assert.equal(cookieProblem(COOKIE), null);
    });

    it('runs only against the prelaunch host, as ReelFlies_CA', async () => {
        const otherHost = await batch({ env: { QA_PREVIEW_COOKIE: COOKIE, QA_BASE_URL: 'https://reelflies.ca' } });
        assert.equal(otherHost.code, 2);
        assert.match(otherHost.lines.join('\n'), /STOP {5}the host batch runs against the prelaunch host \(https:\/\/reelflies_ca-1895766\.mybigcommerce\.com\), not QA_BASE_URL https:\/\/reelflies\.ca/);
        const otherChannel = await batch({ env: { QA_PREVIEW_COOKIE: COOKIE, QA_CHANNEL: '1' } });
        assert.equal(otherChannel.code, 2);
        assert.match(otherChannel.lines.join('\n'), /STOP {5}the prelaunch host is ReelFlies_CA \(1895766\), not QA_CHANNEL 1/);
        assert.deepEqual([...otherHost.calls, ...otherChannel.calls], []);
        const sameHost = await batch({ env: { QA_PREVIEW_COOKIE: COOKIE, QA_BASE_URL: `${PRELAUNCH_URL}/`, QA_CHANNEL: '1895766' } });
        assert.equal(sameHost.code, 0);
    });

    it('stops before any gate when it can\'t read the active theme', async () => {
        const run = await batch({ captureError: 'capture of channel 1895766 failed: 401' });
        assert.equal(run.code, 2);
        assert.deepEqual(run.gates, []);
        assert.deepEqual(run.files, {});
        assert.match(run.lines.join('\n'), /STOP {5}couldn't read the theme active on 1895766 \(capture of channel 1895766 failed: 401\), so no result could be filed under its uuid: nothing ran/);
    });
});

describe('a host batch', () => {
    it('reads the active theme\'s uuid before the first gate, and files every result under it', async () => {
        const run = await batch();
        assert.equal(run.code, 0);
        assert.deepEqual(run.calls[0], ['capture', '1895766']);
        const dir = resultsDir(UUID, ROOT);
        assert.equal(dir, path.join(ROOT, 'scripts', 'qa', 'results', 'host', UUID));
        assert.deepEqual(run.calls[1], ['mkdir', dir]);
        const summary = JSON.parse(run.files[path.join(dir, 'summary.json')]);
        assert.equal(summary.analyticsBlocked, 'yes');
        assert.deepEqual(summary.gates.map(gate => gate.analyticsBlocked), ['yes', 'yes', 'yes']);
    });

    it('runs axe, the raw-HTML check and the screenshots on the prelaunch host, with the tags blocked', async () => {
        const run = await batch({ env: { QA_PREVIEW_COOKIE: COOKIE, QA_ANALYTICS: 'allow', RF_QA_PORTS_CHECKED: '1' } });
        assert.deepEqual(run.gates.map(([, script]) => script), ['qa:axe', 'qa:raw-html', 'qa:screens']);
        const dir = resultsDir(UUID, ROOT);
        for (const [, script, env, args, gate] of run.gates) {
            assert.equal(env.QA_BASE_URL, PRELAUNCH_URL, script);
            assert.equal(env.QA_CHANNEL, '1895766', script);
            assert.equal(env.QA_VARIATION, 'ReelFlies CA', script);
            assert.equal(env.QA_PREVIEW_COOKIE, COOKIE, `${script} gets the cookie from the shell`);
            assert.equal(env.QA_ANALYTICS, undefined, `${script} blocks the tags, whatever the shell says`);
            assert.equal(env.RF_QA_PORTS_CHECKED, undefined, script);
            assert.equal(env.QA_MANIFEST, path.join(dir, 'manifest.json'), script);
            assert.equal(env.QA_RESULTS_DIR, dir, script);
            if (gate.playwright) {
                assert.equal(env.PLAYWRIGHT_HTML_OUTPUT_DIR, path.join(dir, `${gate.slug}-report`), script);
                assert.deepEqual(args, ['--output', path.join(dir, `${gate.slug}-output`)], script);
            } else {
                assert.deepEqual(args, [], script);
            }
        }
        assert.match(run.lines.join('\n'), /analytics blocked: yes/);
    });

    it('checks the variation the host runs', async () => {
        const run = await batch({ themes: [{ themeUuid: UUID, themeName: 'ReelFlies', variationName: 'ReelFlies US' }] });
        assert.ok(run.gates.every(([, , env]) => env.QA_VARIATION === 'ReelFlies US'));
    });

    it('fails when a gate failed, and still records the run', async () => {
        const run = await batch({ failing: ['qa:screens'] });
        assert.equal(run.code, 1);
        assert.deepEqual(run.gates.map(([, script]) => script), ['qa:axe', 'qa:raw-html', 'qa:screens']);
        assert.match(run.files['RELEASES.md'], /\| fail: screenshots \|/);
        const summary = JSON.parse(run.files[path.join(resultsDir(UUID, ROOT), 'summary.json')]);
        assert.equal(summary.ok, false);
        assert.deepEqual(summary.gates.map(({ name, ok }) => [name, ok]), [['axe', true], ['raw HTML', true], ['screenshots', false]]);
    });

    it('fails when the active theme changed while it ran, since its results then mix two builds', async () => {
        const run = await batch({
            themes: [
                { themeUuid: UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' },
                { themeUuid: OTHER_UUID, themeName: 'ReelFlies', variationName: 'ReelFlies CA' },
            ],
        });
        assert.equal(run.code, 1);
        assert.match(run.lines.join('\n'), new RegExp(`FAIL {5}the theme active on 1895766 changed while the gates ran \\(${UUID} → ${OTHER_UUID}\\)`));
        assert.match(run.files['RELEASES.md'], /\| fail: the active theme changed during the run \|/);
    });

    it('never prints or files the preview cookie', async () => {
        const run = await batch({ failing: ['qa:axe'] });
        const everything = [...run.lines, ...Object.values(run.files)].join('\n');
        assert.doesNotMatch(everything, /rf-secret/);
        assert.doesNotMatch(everything, /STORESUITE_CP_TOKEN|SHOP_SESSION_TOKEN/);
    });
});

describe('the Host runs row in RELEASES.md', () => {
    it('records the date, the uuid, the build\'s commit, the gates, the result and the analytics', async () => {
        const run = await batch();
        assert.match(run.files['RELEASES.md'], /\n## Host runs\n[\s\S]*\| Date \| Theme uuid \| Commit \| Gates \| Result \| Analytics blocked \| Gates from \|\n\|---\|---\|---\|---\|---\|---\|---\|\n/);
        assert.ok(run.files['RELEASES.md'].includes(`| 2026-10-07 15:04 UTC | \`${UUID}\` | \`5d0d0cb8\` | axe, raw HTML, screenshots | pass | yes | \`abcdef12\` |\n`));
        assert.match(run.lines.join('\n'), /Commit it through the next release-log PR/);
    });

    it('says when RELEASES.md records no push of the uuid', async () => {
        const run = await batch({ log: releases(entry(OTHER_UUID, SHA)) });
        assert.ok(run.files['RELEASES.md'].includes(`| \`${UUID}\` | not in RELEASES.md |`));
        assert.match(run.lines.join('\n'), new RegExp(`WARNING {2}RELEASES\\.md records no push of ${UUID}`));
    });

    it('takes the commit of the uuid\'s newest release entry', () => {
        const newer = 'fedcba9876543210fedcba9876543210fedcba98';
        assert.equal(releaseCommitFor(releases(entry(UUID, SHA), entry(OTHER_UUID, newer), entry(UUID, newer)), UUID), newer);
        assert.equal(releaseCommitFor(releases(entry(UUID, SHA)), OTHER_UUID), null);
        assert.equal(releaseCommitFor(null, UUID), null);
    });

    it('goes in a section of its own before the Switch toggles, made the first time', () => {
        const row = hostRunRow({
            date: new Date(Date.UTC(2026, 9, 7, 15, 4)),
            uuid: UUID,
            commit: SHA,
            gates: ['axe'],
            problems: [],
            analytics: 'yes',
            checkout: { sha: SHA, dirty: true },
        });
        assert.equal(row, `| 2026-10-07 15:04 UTC | \`${UUID}\` | \`5d0d0cb8\` | axe | pass | yes | \`5d0d0cb8\` (uncommitted changes) |`);
        const once = addHostRun(RELEASES_TEMPLATE, row);
        assert.ok(once.indexOf('\n## Host runs\n') < once.indexOf('\n## Switch toggles\n'));
        assert.ok(once.indexOf('\n## Releases\n') < once.indexOf('\n## Host runs\n'));
        const twice = addHostRun(once, row.replace('axe', 'axe, raw HTML'));
        assert.equal(twice.split('\n## Host runs\n').length, 2);
        assert.ok(twice.includes(`${row}\n${row.replace('axe', 'axe, raw HTML')}\n`));
        assert.ok(twice.endsWith(RELEASES_TEMPLATE.slice(RELEASES_TEMPLATE.indexOf('## Switch toggles'))));
    });

    it('goes at the end of a log with no Switch toggles section', () => {
        const text = addHostRun('# Release log\n\n## Releases\n', '| row |');
        assert.match(text, /## Releases\n\n## Host runs\n[\s\S]*\|---\|---\|---\|---\|---\|---\|---\|\n\| row \|\n$/);
    });
});

describe('Lighthouse (ticket 17)', () => {
    const withLighthouse = {
        'qa:axe': '', 'qa:raw-html': '', 'qa:screens': '', 'qa:lighthouse': '',
    };

    it('waits for ticket 17 while there is no npm run qa:lighthouse', async () => {
        assert.deepEqual(batchGates({ scripts: {} }).map(gate => gate.script), ['qa:axe', 'qa:raw-html', 'qa:screens']);
        const run = await batch();
        assert.match(run.lines.join('\n'), /Lighthouse: not run, ticket 17 adds npm run qa:lighthouse/);
    });

    it('runs it with the tags blocked once 17 adds it, and counts it', async () => {
        assert.deepEqual(batchGates({ scripts: withLighthouse }).map(gate => [gate.script, gate.analytics, gate.informational]), [
            ['qa:axe', 'block', false], ['qa:raw-html', 'block', false], ['qa:screens', 'block', false], ['qa:lighthouse', 'block', false],
        ]);
        const run = await batch({ scripts: withLighthouse, failing: ['qa:lighthouse'] });
        assert.equal(run.code, 1);
    });

    it('adds one run with the tags loaded, as information, once ticket 08 records the GA4 hostname filter', async () => {
        const gates = batchGates({ scripts: withLighthouse, ga4FilterSince: '2026-10-20' });
        assert.deepEqual(gates.map(gate => [gate.name, gate.analytics, gate.informational]).slice(3), [
            ['Lighthouse', 'block', false], ['Lighthouse with the tags loaded', 'allow', true],
        ]);
        assert.deepEqual(batchGates({ scripts: {}, ga4FilterSince: '2026-10-20' }).map(gate => gate.script), ['qa:axe', 'qa:raw-html', 'qa:screens']);

        const run = await batch({ scripts: withLighthouse, ga4FilterSince: '2026-10-20', failing: ['lighthouse-tags'] });
        const tags = run.gates.find(([, , , , gate]) => gate.informational);
        assert.equal(tags[2].QA_ANALYTICS, 'allow');
        assert.equal(tags[1], 'qa:lighthouse');
        assert.equal(run.code, 0, 'the tags-loaded run is information: it never fails the batch');
        const loaded = 'yes, in the gates it counts; tags loaded in Lighthouse with the tags loaded (information)';
        assert.ok(run.files['RELEASES.md'].includes(`| axe, raw HTML, screenshots, Lighthouse, Lighthouse with the tags loaded (information) | pass | ${loaded} |`));
        const summary = JSON.parse(run.files[path.join(resultsDir(UUID, ROOT), 'summary.json')]);
        assert.equal(summary.analyticsBlocked, loaded);
        assert.deepEqual(summary.gates.map(gate => gate.analyticsBlocked), ['yes', 'yes', 'yes', 'yes', 'no']);
    });

    it('files the tags-loaded run\'s results apart, so they never overwrite the blocked run\'s', async () => {
        const run = await batch({ scripts: withLighthouse, ga4FilterSince: '2026-10-20' });
        const dir = resultsDir(UUID, ROOT);
        const [blocked, loaded] = run.gates.filter(([, script]) => script === 'qa:lighthouse').map(([, , env]) => env);
        assert.equal(blocked.QA_RESULTS_DIR, dir);
        assert.equal(loaded.QA_RESULTS_DIR, path.join(dir, 'tags-loaded'));
        assert.equal(loaded.QA_MANIFEST, path.join(dir, 'tags-loaded', 'manifest.json'));
        assert.ok(run.calls.some(([kind, folder]) => kind === 'mkdir' && folder === path.join(dir, 'tags-loaded')), 'its folder is made before it runs');
    });

    it('fills in the uuid\'s pending Lighthouse line once its Lighthouse ran', async () => {
        const pending = releases(entry(UUID, SHA, [LIGHTHOUSE_PENDING_LINE]));
        const run = await batch({ scripts: withLighthouse, log: pending });
        assert.ok(run.files['RELEASES.md'].includes('- Lighthouse: pass, host batch of 2026-10-07 15:04 UTC (analytics blocked: yes; results in scripts/qa/results/host/58abad50-a3c0-013f-e2b6-2ec98cc9ce73/)'));
        assert.ok(!run.files['RELEASES.md'].includes(LIGHTHOUSE_PENDING_LINE));

        const without = await batch({ log: pending });
        assert.ok(without.files['RELEASES.md'].includes(LIGHTHOUSE_PENDING_LINE), 'no Lighthouse ran, so it stays pending');
    });

    it('fills in only the newest entry of that uuid', () => {
        const text = releases(entry(OTHER_UUID, SHA, [LIGHTHOUSE_PENDING_LINE]), entry(UUID, SHA, [LIGHTHOUSE_PENDING_LINE]));
        const filled = fillPendingLighthouse(text, UUID, 'fail, host batch of today');
        assert.equal(filled.split(LIGHTHOUSE_PENDING_LINE).length, 2, 'the other uuid stays pending');
        assert.ok(filled.includes('- Lighthouse: fail, host batch of today'));
        assert.equal(fillPendingLighthouse(text, '00000000-0000-0000-0000-000000000000', 'x'), text);
    });
});

describe('npm run qa:prelaunch', () => {
    it('stops at once without the cookie, before reading anything from the store', () => {
        const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_')));
        const { status, stdout, stderr } = spawnSync(process.execPath, ['scripts/qa/prelaunch.mjs'], { encoding: 'utf8', env });
        assert.equal(status, 2, stdout + stderr);
        assert.match(stderr, /QA_PREVIEW_COOKIE isn't set, so nothing ran/);
        assert.doesNotMatch(stdout + stderr, /capture|Reading the theme/i);
    });
});
