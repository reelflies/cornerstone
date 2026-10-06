// The Playwright reporter that writes scripts/qa/results/manifest.json after every run of
// the storefront gates (scripts/qa/review/manifest-reporter.mjs; W0-10).
//
//   node --test scripts/qa/review/manifest-reporter.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ManifestReporter from './manifest-reporter.mjs';
import { readManifest, shotAnnotation } from './manifest.mjs';

const entry = (page, extra = {}) => ({
    kind: 'theme',
    page,
    path: '/',
    project: 'phone-375',
    width: 375,
    channel: '1895766',
    variation: 'ReelFlies CA',
    overlay: null,
    state: null,
    baseline: `scripts/qa/baselines/1895766-reelflies-ca/${page}-phone-375-darwin.png`,
    reference: page,
    ...extra,
});
const result = (status, entries, attachments = []) => ({ status, annotations: entries.map(shotAnnotation), attachments });
const setup = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-reporter-'));
    const file = path.join(root, 'scripts/qa/results/manifest.json');
    const reporter = new ManifestReporter({
        root, file, now: () => '2026-10-06T12:00:00.000Z', head: () => ({ sha: 'e48d369a', dirty: false }), log: () => {},
    });
    return { root, file, reporter };
};

describe('the manifest reporter', () => {
    it('records every annotated shot once the run ends, with its status and commit', async () => {
        const { file, reporter } = setup();
        reporter.onTestEnd({}, result('passed', [entry('home')]));
        reporter.onTestEnd({}, result('passed', [entry('cart')]));
        reporter.onTestEnd({}, result('passed', []));
        await reporter.onEnd({ status: 'passed' });
        const { entries } = readManifest(file);
        assert.deepEqual(entries.map(({ page, status, commit }) => [page, status, commit]), [['cart', 'passed', 'e48d369a'], ['home', 'passed', 'e48d369a']]);
    });

    it('keeps the shots of earlier runs for other channels', async () => {
        const { file, root } = setup();
        const first = new ManifestReporter({
            root, file, now: () => 'a', head: () => ({ sha: 'x', dirty: false }), log: () => {},
        });
        first.onTestEnd({}, result('passed', [entry('product', { channel: '1' })]));
        await first.onEnd({ status: 'passed' });
        const second = new ManifestReporter({
            root, file, now: () => 'b', head: () => ({ sha: 'x', dirty: false }), log: () => {},
        });
        second.onTestEnd({}, result('passed', [entry('home')]));
        await second.onEnd({ status: 'passed' });
        assert.deepEqual(readManifest(file).entries.map(({ channel, page }) => `${channel} ${page}`).sort(), ['1 product', '1895766 home']);
    });

    it('keeps a copy of a failed shot\'s actual render, which the next run would delete', async () => {
        const { root, file, reporter } = setup();
        const actual = path.join(root, 'scripts/qa/results/output/home-actual.png');
        fs.mkdirSync(path.dirname(actual), { recursive: true });
        fs.writeFileSync(actual, 'png');
        reporter.onTestEnd({}, result('failed', [entry('home')], [{ name: 'home-actual.png', path: actual, contentType: 'image/png' }]));
        await reporter.onEnd({ status: 'failed' });
        const [recorded] = readManifest(file).entries;
        assert.equal(recorded.status, 'failed');
        assert.match(recorded.actual, /^scripts\/qa\/results\/manifest-actual\/.+\.png$/);
        assert.equal(fs.readFileSync(path.join(root, recorded.actual), 'utf8'), 'png');
    });

    it('writes nothing for a run that shot nothing for the review, such as axe', async () => {
        const { file, reporter } = setup();
        reporter.onTestEnd({}, result('passed', []));
        await reporter.onEnd({ status: 'passed' });
        assert.equal(fs.existsSync(file), false);
    });
});

describe('the gates\' Playwright config', () => {
    it('runs the manifest reporter beside the list and HTML reporters', () => {
        const config = pathToFileURL(path.resolve('scripts/qa/playwright.config.mjs')).href;
        const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_') && !name.startsWith('RF_QA_')));
        const { status, stdout, stderr } = spawnSync(process.execPath, [
            '--input-type=module', '-e', `const { default: c } = await import(${JSON.stringify(config)}); console.log(JSON.stringify(c.reporter));`,
        ], { encoding: 'utf8', env: clean });
        assert.equal(status, 0, stderr);
        const reporters = JSON.parse(stdout.trim().split('\n').pop()).map(([name]) => name);
        assert.deepEqual(reporters.slice(0, 2), ['list', 'html']);
        assert.ok(reporters.some(name => /review\/manifest-reporter\.mjs$/.test(name)), reporters.join(', '));
    });

    it('has the screenshot gate annotate each template shot for the manifest', () => {
        const spec = fs.readFileSync(path.resolve('scripts/qa/screens.spec.mjs'), 'utf8');
        assert.match(spec, /testInfo\.annotations\.push\(shotAnnotation\(themeShot\(/);
    });
});
