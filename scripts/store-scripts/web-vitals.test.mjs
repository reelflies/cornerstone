// The web-vitals field-data script for Script Manager on ReelFlies_CA (ticket 23): the GA4
// glue, the vendored library, the one inline <script> the Scripts API takes, and the changes
// file W0-11's helper plans from. scripts/store-scripts/web-vitals-browser.test.mjs runs the
// built script in Chromium.
//
//   node --test scripts/store-scripts/web-vitals.test.mjs

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { spawnSync } from 'child_process';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHANGES_FILE, GLUE_FILE, GZIP_BUDGET, HTML_LIMIT, ROOT, SCRIPT, VENDOR, buildChanges, buildHtml, checkChanges, readSources, serialize,
} from './build.mjs';
import { checkRequests } from '../store/plan.mjs';
import { phaseOn } from '../lib/release-calendar.mjs';

const BUILD = path.join(ROOT, 'scripts', 'store-scripts', 'build.mjs');
const UNSET = phaseOn({ flip: null, status: 'provisional', source: 'test' }, '2026-10-06');

// The glue on its own, evaluated as the browser would see it, with a stand-in for the library.
function loadGlue() {
    const source = fs.readFileSync(path.join(ROOT, GLUE_FILE), 'utf8');
    return vm.runInNewContext(`${source}\nrfWebVitals;`, {});
}

function fakeLibrary() {
    const reporters = {};
    const library = {};
    ['onLCP', 'onINP', 'onCLS', 'onFCP', 'onTTFB'].forEach(name => {
        library[name] = callback => {
            reporters[name] = [...(reporters[name] || []), callback];
        };
    });
    return { library, reporters };
}

const metric = (name, extra = {}) => ({
    name, value: 1234.5, delta: 1234.5, id: `v6-${name}-1`, rating: 'needs-improvement', navigationType: 'navigate', entries: [{}], ...extra,
});

describe('the GA4 glue', () => {
    it('registers one reporter each for LCP, INP and CLS, and nothing else', () => {
        const { library, reporters } = fakeLibrary();
        loadGlue()(library, {});
        assert.deepEqual(Object.keys(reporters).sort(), ['onCLS', 'onINP', 'onLCP']);
        Object.values(reporters).forEach(list => assert.equal(list.length, 1));
    });

    it('sends each report to GA4 as one event named for the metric, with the documented parameters', () => {
        const { library, reporters } = fakeLibrary();
        const calls = [];
        loadGlue()(library, { gtag: (...args) => calls.push(args) });
        reporters.onLCP[0](metric('LCP', { value: 2100.2, delta: 2100.2, rating: 'good' }));
        reporters.onINP[0](metric('INP', { value: 312, delta: 312, rating: 'needs-improvement' }));
        reporters.onCLS[0](metric('CLS', {
            value: 0.12, delta: 0.02, rating: 'needs-improvement', navigationType: 'back-forward-cache',
        }));
        assert.deepEqual(JSON.parse(JSON.stringify(calls)), [
            ['event', 'LCP', {
                value: 2100.2, metric_id: 'v6-LCP-1', metric_value: 2100.2, metric_delta: 2100.2, metric_rating: 'good', metric_navigation_type: 'navigate',
            }],
            ['event', 'INP', {
                value: 312, metric_id: 'v6-INP-1', metric_value: 312, metric_delta: 312, metric_rating: 'needs-improvement', metric_navigation_type: 'navigate',
            }],
            // value is the delta, so a page's reports sum to its final value (web-vitals README).
            ['event', 'CLS', {
                value: 0.02, metric_id: 'v6-CLS-1', metric_value: 0.12, metric_delta: 0.02, metric_rating: 'needs-improvement', metric_navigation_type: 'back-forward-cache',
            }],
        ]);
    });

    it('sends nothing, and throws nothing, while the page has neither gtag nor the GA4 data layer', () => {
        const { library, reporters } = fakeLibrary();
        const win = {};
        loadGlue()(library, win);
        assert.doesNotThrow(() => reporters.onLCP[0](metric('LCP')));
        win.gtag = 'not a function';
        win.dataLayer = 'not an array';
        assert.doesNotThrow(() => reporters.onCLS[0](metric('CLS')));
    });

    // BigCommerce's GA4 snippet keeps its gtag inside its own function and leaves only
    // window.dataLayer; window.gtag comes from the legacy UA snippet, which ticket 08 removes.
    it('without a global gtag, pushes the command onto the GA4 data layer as gtag does: an arguments object', () => {
        const { library, reporters } = fakeLibrary();
        const win = { dataLayer: [] };
        loadGlue()(library, win);
        reporters.onCLS[0](metric('CLS', { value: 0.05, delta: 0.05, rating: 'good' }));
        assert.equal(win.dataLayer.length, 1);
        const [entry] = win.dataLayer;
        assert.equal(Object.prototype.toString.call(entry), '[object Arguments]', 'gtag.js reads only arguments objects, not arrays');
        assert.deepEqual(JSON.parse(JSON.stringify(Array.from(entry))), ['event', 'CLS', {
            value: 0.05, metric_id: 'v6-CLS-1', metric_value: 0.05, metric_delta: 0.05, metric_rating: 'good', metric_navigation_type: 'navigate',
        }]);
    });

    it('prefers a global gtag to the data layer, so nothing is sent twice', () => {
        const { library, reporters } = fakeLibrary();
        const calls = [];
        const win = { dataLayer: [], gtag: (...args) => calls.push(args) };
        loadGlue()(library, win);
        reporters.onINP[0](metric('INP'));
        assert.equal(calls.length, 1);
        assert.equal(win.dataLayer.length, 0);
    });

    it('looks gtag up when it reports, so a tag that loads after this script still gets the event', () => {
        const { library, reporters } = fakeLibrary();
        const win = {};
        loadGlue()(library, win);
        const calls = [];
        win.gtag = (...args) => calls.push(args);
        reporters.onINP[0](metric('INP'));
        assert.equal(calls.length, 1);
        assert.equal(calls[0][1], 'INP');
    });

    it('never lets a failing gtag break the page', () => {
        const { library, reporters } = fakeLibrary();
        loadGlue()(library, {
            gtag: () => {
                throw new Error('blocked');
            },
        });
        assert.doesNotThrow(() => reporters.onLCP[0](metric('LCP')));
    });
});

describe('the vendored web-vitals library', () => {
    it('is the pinned release, byte for byte, with its licence beside it', () => {
        const file = path.join(ROOT, VENDOR.file);
        const sha256 = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
        assert.equal(sha256, VENDOR.sha256, `${VENDOR.file} changed: re-vendor it from npm (store-scripts/README.md) and update VENDOR`);
        assert.match(VENDOR.file, new RegExp(`web-vitals-${VENDOR.version.replace(/\./g, '\\.')}\\.iife\\.js$`));
        assert.match(fs.readFileSync(path.join(path.dirname(file), 'LICENSE'), 'utf8'), /Apache License\s+Version 2\.0/);
    });

    it('is refused when it doesn\'t match the pinned hash', t => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-web-vitals-'));
        t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
        fs.mkdirSync(path.join(dir, path.dirname(VENDOR.file)), { recursive: true });
        fs.mkdirSync(path.join(dir, path.dirname(GLUE_FILE)), { recursive: true });
        fs.writeFileSync(path.join(dir, VENDOR.file), 'var webVitals={};\n');
        fs.copyFileSync(path.join(ROOT, GLUE_FILE), path.join(dir, GLUE_FILE));
        assert.throws(() => readSources(dir), /doesn't match the pinned web-vitals 6\.2\.2/);
    });
});

describe('the inline script', () => {
    const html = buildHtml(readSources());

    it('is exactly one inline <script> tag, as the Scripts API requires for script_tag', () => {
        assert.match(html, /^<script>[\s\S]*<\/script>$/);
        assert.equal(html.match(/<script\b/gi).length, 1);
        assert.equal(html.match(/<\/script/gi).length, 1);
        assert.doesNotMatch(html, /<script[^>]*\ssrc=/i);
        assert.doesNotMatch(html.slice('<script>'.length, -'</script>'.length), /<!--/);
    });

    it('holds the library and the glue in one function scope, so it adds no globals', () => {
        const { vendor, glue } = readSources();
        assert.ok(html.includes(vendor.trim()), 'the vendored build is inlined verbatim');
        assert.match(html, /^<script>\/\*! web-vitals 6\.2\.2 \| Apache-2\.0 \|/);
        assert.match(html, /\(function \(\) \{\n[\s\S]*\nrfWebVitals\(webVitals, window\);\n\}\(\)\);\n<\/script>$/);
        // Whole-line comments in the glue stay in the repo, not in every visitor's page.
        glue.split('\n').filter(line => /^\s*\/\//.test(line)).forEach(line => assert.ok(!html.includes(line), `comment line shipped: ${line}`));
        const sandbox = { window: {} };
        vm.runInNewContext(html.slice('<script>'.length, -'</script>'.length).replace('rfWebVitals(webVitals, window);', ''), sandbox);
        assert.deepEqual(Object.keys(sandbox), ['window']);
    });

    it('stays under the Scripts API limit and inside its own share of the 150 KB third-party budget', () => {
        assert.ok(html.length < HTML_LIMIT, `${html.length} characters, the API takes ${HTML_LIMIT}`);
        const gzip = zlib.gzipSync(html, { level: 9 }).length;
        assert.ok(gzip <= GZIP_BUDGET, `${gzip} B gzip, its budget is ${GZIP_BUDGET} B`);
    });

    it('carries no measurement id, pixel id or host of its own: it reports through the store\'s GA4 tag', () => {
        assert.doesNotMatch(html, /\bG-[A-Z0-9]{6,}\b|\bUA-\d+-\d+\b|\bAW-\d+\b/);
        assert.doesNotMatch(html, /https?:\/\//);
        assert.doesNotMatch(html, /fbq\(|omnisend/i);
    });
});

describe('the changes file for W0-11', () => {
    const changes = JSON.parse(fs.readFileSync(path.join(ROOT, CHANGES_FILE), 'utf8'));

    it('is what build.mjs makes from the sources (rebuild with node scripts/store-scripts/build.mjs)', () => {
        assert.equal(fs.readFileSync(path.join(ROOT, CHANGES_FILE), 'utf8'), serialize(buildChanges(readSources())));
    });

    it('creates one script on 1895766, disabled, in the footer, consent-tagged as analytics, on storefront pages only', () => {
        assert.match(changes._about, /created disabled/);
        assert.equal(changes.requests.length, 1);
        const [request] = changes.requests;
        assert.equal(request.method, 'POST');
        assert.equal(request.path, '/v3/content/scripts');
        assert.equal(request.query, undefined);
        assert.deepEqual({ ...request.body, html: undefined, description: undefined }, {
            channel_id: 1895766,
            name: SCRIPT.name,
            html: undefined,
            description: undefined,
            kind: 'script_tag',
            load_method: 'default',
            location: 'footer',
            visibility: 'storefront',
            consent_category: 'analytics',
            auto_uninstall: false,
            enabled: false,
        });
        assert.equal(request.body.html, buildHtml(readSources()));
        assert.ok(request.body.name.length <= 255);
        assert.ok(request.body.description.length <= 255);
    });

    it('passes W0-11\'s checks as a lifted write, and the same script created enabled is refused', () => {
        const items = checkRequests(changes.requests, { mode: 'lifted', phase: UNSET });
        assert.equal(items.length, 1);
        assert.equal(items[0].what.object, 'scripts');
        assert.equal(items[0].what.action, 'create');
        const enabled = [{ ...changes.requests[0], body: { ...changes.requests[0].body, enabled: true } }];
        assert.throws(() => checkRequests(enabled, { mode: 'lifted', phase: UNSET }), /scripts are created disabled/);
        const elsewhere = [{ ...changes.requests[0], body: { ...changes.requests[0].body, channel_id: 1 } }];
        assert.throws(() => checkRequests(elsewhere, { mode: 'lifted', phase: UNSET }), /1895766/);
    });
});

describe('build.mjs', () => {
    it('--check passes on the committed file, and names a stale one', t => {
        const ok = spawnSync(process.execPath, [BUILD, '--check'], { encoding: 'utf8' });
        assert.equal(ok.status, 0, ok.stderr);
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-web-vitals-'));
        t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
        const stale = path.join(dir, 'web-vitals.json');
        fs.writeFileSync(stale, '{}\n');
        assert.match(checkChanges(stale, readSources()), /is stale: run node scripts\/store-scripts\/build\.mjs/);
        assert.equal(checkChanges(path.join(ROOT, CHANGES_FILE), readSources()), null);
    });

    it('refuses an unknown argument', () => {
        const result = spawnSync(process.execPath, [BUILD, '--push'], { encoding: 'utf8' });
        assert.equal(result.status, 2);
        assert.match(result.stderr, /usage: node scripts\/store-scripts\/build\.mjs \[--check\]/);
    });
});
