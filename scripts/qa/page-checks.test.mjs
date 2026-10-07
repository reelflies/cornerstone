// The in-page checks behind ticket 54a's reflow, reduced-motion and focus specs
// (scripts/qa/page-checks.mjs), on fixture pages in Playwright's Chromium, with a failing
// fixture beside each passing one so a check can't quietly stop working. The browser cases are
// skipped where Playwright's Chromium isn't installed (CI); the report helpers run everywhere.
//
//   node --test scripts/qa/page-checks.test.mjs

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import {
    after, before, describe, it,
} from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import {
    MOTION_LIMIT_MS, focusNotes, focusProblems, inPage, motionProblems, overflowProblems, tabThrough,
} from './page-checks.mjs';

const hasChromium = (() => {
    try {
        return fs.existsSync(chromium.executablePath());
    } catch {
        return false;
    }
})();
const SKIP = !hasChromium && 'Playwright\'s Chromium isn\'t installed here (CI)';

const page320 = body => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body { margin: 0; font: 16px sans-serif; }</style></head><body>${body}</body></html>`;

// The reset ticket 25's skin is to add (spec module 1, "a global reduced-motion reset").
const RESET = `@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
}`;

describe('the page checks in a browser', { skip: SKIP }, () => {
    let browser;
    before(async () => {
        if (hasChromium) browser = await chromium.launch();
    });
    after(async () => browser?.close());

    // A fresh page in a context of its own, with `options` (viewport, isMobile, reducedMotion).
    async function open(html, options = {}) {
        const context = await browser.newContext({ viewport: { width: 320, height: 568 }, ...options });
        const page = await context.newPage();
        await page.setContent(html);
        return page;
    }

    describe('reflow at 320', () => {
        it('passes a page that fits', async () => {
            const page = await open(page320('<header><a href="#">ReelFlies</a></header><main><p>Flies tied by hand.</p></main>'), { isMobile: true, hasTouch: true });
            const result = await page.evaluate(inPage, { check: 'overflow' });
            assert.equal(result.width, 320);
            assert.deepEqual(overflowProblems(result), []);
        });

        it('fails a page that scrolls sideways, and names the box past the edge', async () => {
            const page = await open(page320('<main><div class="strip"><div class="pills" style="width: 410px">Size 12</div></div></main>'), { isMobile: true, hasTouch: true });
            const result = await page.evaluate(inPage, { check: 'overflow' });
            assert.ok(result.scrollWidth > result.width, JSON.stringify(result));
            const [problem] = overflowProblems(result);
            assert.match(problem, /410 px wide at 320 px, so it scrolls sideways/);
            assert.match(problem, /div\.pills "Size 12" \(right edge at 410 px\)/);
        });

        it('passes a box that overflows inside a container that clips it, such as a carousel', async () => {
            const page = await open(page320('<div class="carousel" style="overflow: hidden"><div class="track" style="width: 1200px">slides</div></div>'));
            assert.deepEqual(overflowProblems(await page.evaluate(inPage, { check: 'overflow' })), []);
        });

        it('fails the same box without the clip, at 320 without phone emulation too', async () => {
            const page = await open(page320('<div class="carousel"><div class="track" style="width: 1200px">slides</div></div>'));
            const result = await page.evaluate(inPage, { check: 'overflow' });
            assert.match(overflowProblems(result)[0], /div\.track "slides"/);
        });
    });

    describe('reduced motion', () => {
        const STOCK = `<style>
            a.button { display: inline-block; transition: background-color 0.15s ease; }
            .ring::after { content: ''; transition: transform 200ms; }
            .spinner { animation: spin 2s linear infinite; }
            html { scroll-behavior: smooth; }
            @keyframes spin { to { transform: rotate(1turn); } }
        </style>`;
        const BODY = '<a class="button" href="#">Add</a><span class="ring"></span><span class="nothing"></span><div class="spinner">.</div>';

        it('finds the transitions, animations and smooth scrolling a page declares under reduced motion', async () => {
            const page = await open(page320(`${STOCK}${BODY}`), { reducedMotion: 'reduce' });
            const declared = await page.evaluate(inPage, { check: 'motion', limitMs: MOTION_LIMIT_MS });
            const found = declared.map(({ element, kind, what }) => `${element} ${kind} ${what}`);
            assert.ok(found.includes('a.button transition background-color'), found.join('\n'));
            assert.ok(found.includes('span.ring::after transition transform'), found.join('\n'));
            assert.ok(found.includes('div.spinner animation spin'), found.join('\n'));
            assert.ok(found.includes('html scroll-behavior smooth'), found.join('\n'));
            assert.ok(!found.some(line => line.startsWith('span.nothing')), 'a pseudo-element with no content isn\'t there to move');
            const running = await page.evaluate(inPage, { check: 'animations', limitMs: MOTION_LIMIT_MS });
            assert.deepEqual(running.map(({ what }) => what), ['spin']);
            const problems = motionProblems({ running, declared });
            assert.match(problems[0], /1 animation runs under reduced motion: div\.spinner "\." CSSAnimation spin \(infinite\)/);
            assert.match(problems[1], /4 declarations would move under reduced motion/);
        });

        it('passes the same page with a global reduced-motion reset', async () => {
            const page = await open(page320(`${STOCK}<style>${RESET}</style>${BODY}`), { reducedMotion: 'reduce' });
            const declared = await page.evaluate(inPage, { check: 'motion', limitMs: MOTION_LIMIT_MS });
            const running = await page.evaluate(inPage, { check: 'animations', limitMs: MOTION_LIMIT_MS });
            assert.deepEqual(motionProblems({ running, declared }), []);
        });

        // The rise ring (ticket 27) plays when the cart count goes up. bumpCart sends the two
        // events an add sends (build pipeline 6.9): the stock cart-quantity-update on <body>, through
        // jQuery, and rf:cart-changed on document.
        const RING = `<span class="cart-quantity">2</span><span class="ring"></span><script>
            window.$ = selector => ({ trigger: (name, value) => { window.triggered = [selector, name, value]; } });
            document.addEventListener('rf:cart-changed', event => {
                window.changed = event.detail;
                if (!window.respectsReducedMotion || !matchMedia('(prefers-reduced-motion: reduce)').matches) {
                    document.querySelector('.ring').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.6)' }], { duration: 600 });
                }
            });
        </script>`;

        it('sends a cart count change the way an add does, and sees a ring that plays anyway', async () => {
            const page = await open(page320(RING), { reducedMotion: 'reduce' });
            assert.deepEqual(await page.evaluate(inPage, { check: 'bumpCart' }), { from: 2, to: 3, stock: true });
            assert.deepEqual(await page.evaluate(() => window.triggered), ['body', 'cart-quantity-update', 3]);
            assert.deepEqual(await page.evaluate(() => window.changed), { source: 'qa', productId: 0 });
            const running = await page.evaluate(inPage, { check: 'animations', limitMs: MOTION_LIMIT_MS });
            assert.match(motionProblems({ running, declared: [] })[0], /span\.ring Animation a script animation \(600 ms\)/);
        });

        it('passes a ring that checks prefers-reduced-motion first', async () => {
            const page = await open(page320(`<script>window.respectsReducedMotion = true;</script>${RING}`), { reducedMotion: 'reduce' });
            await page.evaluate(inPage, { check: 'bumpCart' });
            assert.deepEqual(await page.evaluate(inPage, { check: 'animations', limitMs: MOTION_LIMIT_MS }), []);
        });

        it('sends the event on a page without jQuery, or without a count, too', async () => {
            const page = await open(page320('<script>document.addEventListener("rf:cart-changed", () => { window.changed = true; });</script>'));
            assert.deepEqual(await page.evaluate(inPage, { check: 'bumpCart' }), { from: 0, to: 1, stock: false });
            assert.equal(await page.evaluate(() => window.changed), true);
        });
    });

    describe('the focus tab-through', () => {
        const HEADER = '<header style="position: fixed; top: 0; left: 0; right: 0; height: 60px; background: #fff; z-index: 10"><a href="#home">Home</a></header>';
        const CONTENT = '<a id="first" href="#first" style="display: block; margin-top: 20px">Shop dry flies</a><div style="height: 2000px"></div><a href="#last">Contact us</a>';

        it('finds a focused link under the fixed header', async () => {
            const page = await open(page320(`${HEADER}<main>${CONTENT}</main>`), { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
            const { steps, end } = await tabThrough(page);
            assert.deepEqual(steps.map(({ kind }) => kind), ['ok', 'covered', 'ok']);
            assert.match(end, /focus (left the page|came back to a "Home") after 3 Tab\(s\)/);
            assert.deepEqual(focusProblems(steps), ['Tab 2: a#first "Shop dry flies" is covered by header "Home" (elementFromPoint at its centre hit header "Home")']);
        });

        it('passes the same page when the content starts below the header', async () => {
            const page = await open(page320(`${HEADER}<main style="padding-top: 60px">${CONTENT}</main>`), { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });
            const { steps } = await tabThrough(page);
            assert.equal(steps.length, 3);
            assert.deepEqual(focusProblems(steps), []);
        });

        it('starts from the top of the page, whatever had focus before', async () => {
            const page = await open(page320(`${HEADER}<main style="padding-top: 60px">${CONTENT}<button id="banner">Reject all</button></main>`), { viewport: { width: 375, height: 667 } });
            await page.focus('#banner');
            const { steps } = await tabThrough(page);
            assert.equal(steps[0].element, 'a "Home"');
        });

        it('notes a focused element it can\'t see, and one something else lies over, without failing them', async () => {
            const page = await open(page320(`<main style="padding-top: 10px">
                <a href="#skip" style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)">Skip to main content</a>
                <span style="position: relative; display: inline-block"><input id="size" type="radio" name="size"><label for="size" style="position: absolute; inset: 0; background: #eee">12</label></span>
            </main>`));
            const { steps } = await tabThrough(page);
            assert.deepEqual(steps.map(({ kind }) => kind), ['hidden', 'other']);
            assert.deepEqual(focusProblems(steps), []);
            assert.deepEqual(focusNotes(steps), [
                '1 focused element had no visible box: a "Skip to main content"',
                '1 focused element had another element over its centre (not fixed or sticky): input#size under label "12"',
            ]);
        });

        it('stops at its limit on a page that never runs out of focusable elements', async () => {
            const links = Array.from({ length: 30 }, (unused, index) => `<a href="#${index}">${index}</a>`).join(' ');
            const page = await open(page320(links));
            const { steps, end } = await tabThrough(page, { maxTabs: 5 });
            assert.equal(steps.length, 5);
            assert.equal(end, 'stopped after 5 Tabs');
        });
    });
});

describe('the report helpers', () => {
    it('cap the motion they list, and group what repeats', () => {
        const declared = Array.from({ length: 30 }, (unused, index) => ({
            element: index < 20 ? 'a.navPages-action' : `span.x${index}`, kind: 'transition', what: 'all', durationMs: 150,
        }));
        const [line] = motionProblems({ running: [], declared }, { max: 3 });
        assert.match(line, /^30 declarations would move under reduced motion, in 11 groups \(ticket 25's global reduced-motion reset turns them off\): a\.navPages-action transition all \(150 ms\) ×20; span\.x20 transition all \(150 ms\); span\.x21 transition all \(150 ms\); and 8 more groups$/);
    });

    it('say nothing about a page that fits, moves nothing and covers no focus', () => {
        assert.deepEqual(overflowProblems({ width: 320, scrollWidth: 320, offenders: [] }), []);
        assert.deepEqual(motionProblems({ running: [], declared: [] }), []);
        assert.deepEqual(focusProblems([{ step: 1, kind: 'ok', element: 'a' }]), []);
        assert.deepEqual(focusNotes([{ step: 1, kind: 'ok', element: 'a' }]), []);
    });
});
