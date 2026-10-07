// The built web-vitals script (ticket 23) in a real browser: a page with a stand-in gtag paints,
// shifts, takes a slow click and is hidden, and the script must send LCP, INP and CLS to it as
// GA4 events. Nothing leaves the Mac: every request the page makes is aborted.
//
//   node --test scripts/store-scripts/web-vitals-browser.test.mjs
//
// It needs Playwright's Chromium, so it is skipped in CI.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { buildHtml, readSources } from './build.mjs';

const hasChromium = (() => {
    try {
        return fs.existsSync(chromium.executablePath());
    } catch {
        return false;
    }
})();

const SCRIPT = buildHtml(readSources());

// The store's GA4 tag is stood in for in two ways, and window.rfSent() lists what reached it:
// - gtag: a global gtag that records its calls (the legacy UA snippet defines one today)
// - dataLayer: BigCommerce's GA4 snippet, which keeps its gtag in its own function scope and
//   leaves only window.dataLayer, where gtag.js reads commands pushed as arguments objects
// The built script goes last in the body, where Script Manager's footer location puts it.
const TAGS = {
    gtag: '<script>window.rfEvents = []; window.gtag = function () { window.rfEvents.push(Array.from(arguments)); }; window.rfSent = function () { return window.rfEvents; };</script>',
    dataLayer: `<script>(function () { window.dataLayer = window.dataLayer || []; function gtag() { dataLayer.push(arguments); } gtag('js', new Date()); }());
window.rfSent = function () { return window.dataLayer.filter(function (entry) { return Object.prototype.toString.call(entry) === '[object Arguments]' && entry[0] === 'event'; }).map(function (entry) { return Array.from(entry); }); };</script>`,
    none: '<script>window.rfSent = function () { return []; };</script>',
};

const page = tag => `<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><title>web-vitals test</title>
${TAGS[tag]}
<style>body { font: 18px/1.4 sans-serif; margin: 0; } #hero { height: 300px; background: #7b8e7a; color: #fff; padding: 24px; }</style>
</head><body>
<div id="slot"></div>
<div id="hero"><h1>Dry flies</h1><p>Hand-tied in small batches, sized from 6 to 24.</p></div>
<button id="slow" type="button">Add to cart</button>
${SCRIPT}
</body></html>`;

async function withPage(html, run) {
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext();
        const errors = [];
        const requests = [];
        await context.route('**/*', route => {
            requests.push(route.request().url());
            return route.abort();
        });
        const tab = await context.newPage();
        tab.on('pageerror', error => errors.push(error.message));
        await tab.setContent(html, { waitUntil: 'load' });
        await run(tab);
        return { errors, requests };
    } finally {
        await browser.close();
    }
}

// What a visit does: a late banner shifts the content (CLS), a click waits on a slow handler
// (INP, and it ends LCP), then the visitor leaves (the page is hidden, which reports INP and CLS).
// The library handles the click's timing entries when the browser is next idle (headless
// Chromium takes about a second), so the visitor stays that long: until LCP, which is reported
// the same way, has been sent. A page hidden sooner can lose that interaction's INP in the
// library itself (web-vitals 6.2.2), which isn't what this checks.
async function visit(tab, { tag = 'gtag' } = {}) {
    // Chromium marks a shift in the page's first half second as following input, which CLS
    // leaves out, so the banner arrives later, from the page's own timer.
    await tab.waitForTimeout(700);
    await tab.evaluate(() => new Promise(resolve => {
        setTimeout(() => {
            document.getElementById('slot').innerHTML = '<div style="height:120px;background:#eee">Free shipping across Canada</div>';
            resolve();
        }, 50);
    }));
    await tab.waitForTimeout(700);
    await tab.evaluate(() => {
        document.getElementById('slow').addEventListener('click', () => {
            const end = performance.now() + 150;
            while (performance.now() < end) { /* a slow handler */ }
        });
    });
    await tab.click('#slow');
    if (tag !== 'none') await tab.waitForFunction(() => window.rfSent().some(([, name]) => name === 'LCP'), null, { timeout: 10000 });
    else await tab.waitForTimeout(1500);
    await tab.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await tab.waitForTimeout(300);
}

describe('the built script in Chromium', { skip: !hasChromium && 'Playwright\'s Chromium isn\'t installed here (CI)' }, () => {
    async function eventsSent(tag) {
        let events;
        const { errors, requests } = await withPage(page(tag), async tab => {
            await visit(tab, { tag });
            events = await tab.evaluate(() => window.rfSent());
        });
        assert.deepEqual(errors, []);
        assert.deepEqual(requests, [], 'the page makes no request of its own');
        return events;
    }

    function checkEvents(events) {
        const byName = Object.fromEntries(events.map(([command, name, params]) => {
            assert.equal(command, 'event');
            return [name, params];
        }));
        assert.deepEqual(Object.keys(byName).sort(), ['CLS', 'INP', 'LCP']);
        assert.equal(events.length, 3, `one event per metric: ${JSON.stringify(events)}`);
        Object.entries(byName).forEach(([name, params]) => {
            assert.equal(typeof params.metric_value, 'number', name);
            assert.equal(params.value, params.metric_delta, name);
            assert.match(params.metric_id, /^v6-\d+-\d+$/, name);
            assert.ok(['good', 'needs-improvement', 'poor'].includes(params.metric_rating), name);
            assert.equal(params.metric_navigation_type, 'navigate', name);
        });
        assert.ok(byName.LCP.metric_value > 0);
        assert.ok(byName.INP.metric_value >= 150, `the slow click took ${byName.INP.metric_value} ms`);
        assert.ok(byName.CLS.metric_value > 0, 'the late banner shifted the content');
    }

    it('sends LCP, INP and CLS to a global gtag as GA4 events with values', async () => {
        checkEvents(await eventsSent('gtag'));
    });

    it('sends them through the GA4 data layer, as gtag would, when the page has no global gtag (BigCommerce\'s GA4 snippet)', async () => {
        checkEvents(await eventsSent('dataLayer'));
    });

    it('runs without errors on a page with no GA4 tag, and sends nothing', async () => {
        const { errors, requests } = await withPage(page('none'), tab => visit(tab, { tag: 'none' }));
        assert.deepEqual(errors, []);
        assert.deepEqual(requests, []);
    });
});
