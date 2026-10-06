// The reference shots (scripts/qa/screens-reference.spec.mjs; W0-10) run inside every `npm
// run qa:screens`, the release's screenshot gate included. This runs the spec itself, in
// Playwright, against reference pages that are broken in the ways the real one can break,
// and proves the run still passes and the manifest says what went wrong. Its own config
// holds only this spec, so no stencil server starts.
//
//   node --test scripts/qa/review/reference-run.test.mjs
//
// It needs Playwright's Chromium, so it is skipped in CI.

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readManifest } from './manifest.mjs';
import { REFERENCE_ANCHORS, ROOT } from './reference.mjs';

const hasChromium = (() => {
    try {
        return fs.existsSync(chromium.executablePath());
    } catch {
        return false;
    }
})();

const CLI = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

function runSpec(referenceHtml) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-reference-run-'));
    const manifest = path.join(dir, 'scripts', 'qa', 'results', 'manifest.json');
    const config = path.join(dir, 'playwright.config.mjs');
    fs.writeFileSync(config, `export default ${JSON.stringify({
        testDir: path.join(ROOT, 'scripts', 'qa'),
        testMatch: 'screens-reference.spec.mjs',
        outputDir: path.join(dir, 'output'),
        reporter: [['list'], [path.join(ROOT, 'scripts', 'qa', 'review', 'manifest-reporter.mjs'), { file: manifest }]],
        projects: [{ name: 'phone-375', use: { viewport: { width: 375, height: 812 } } }],
        workers: 1,
    })};\n`);
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_')));
    const run = spawnSync(process.execPath, [CLI, 'test', '--config', config], {
        cwd: ROOT, encoding: 'utf8', env: { ...env, QA_REFERENCE_HTML: referenceHtml }, timeout: 120000,
    });
    return { run, entries: fs.existsSync(manifest) ? readManifest(manifest).entries : [] };
}

describe('the reference shots in a screenshot run', { skip: !hasChromium && 'Playwright\'s Chromium isn\'t installed here (CI)' }, () => {
    it('pass, and record every screen as not shot, when the reference page lost one of its Options', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-reference-page-'));
        const page = path.join(dir, 'reference.html');
        // The Options start with "Heading face"; the fly-type links toggle is gone.
        fs.writeFileSync(page, '<select id="headFace"><option value="onest">Onest</option></select><div id="frame"><section data-screen="home">Home</section></div>');
        const { run, entries } = runSpec(page);
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.equal(entries.length, REFERENCE_ANCHORS.length);
        for (const entry of entries) {
            assert.equal(entry.kind, 'reference');
            assert.equal(entry.image, null);
            assert.match(entry.problem, /no #linksToggle control any more/);
        }
    });

    it('pass, and say why, when QA_REFERENCE_HTML names a file that isn\'t there', () => {
        const { run, entries } = runSpec(path.join(os.tmpdir(), 'rf-no-such-reference.html'));
        assert.equal(run.status, 0, run.stdout + run.stderr);
        assert.equal(entries.length, REFERENCE_ANCHORS.length);
        assert.ok(entries.every(entry => /QA_REFERENCE_HTML is .*doesn't exist/.test(entry.problem)), JSON.stringify(entries.map(({ problem }) => problem)));
    });
});
