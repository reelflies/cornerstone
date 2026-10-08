// The test fixture every storefront spec imports instead of @playwright/test.
//
// - The preview cookie for QA_BASE_URL goes into the browser's cookie jar for that
//   host only, so it never reaches fonts, the CDN or any other host.
// - Every test's context goes through the network guard (network-guard.mjs, W0-6) before the
//   test opens a page. Requests to the analytics hosts are aborted unless QA_ANALYTICS=allow.
//   On a live channel (1, 1855224), and on every channel from the Flip, every write but the
//   read-only POSTs is refused, a GET that adds to the cart included, and fails the test at
//   teardown, naming its method and URL; so does an analytics request that was answered while
//   the tags are blocked. Playwright's request API (the `request` fixture, page.request,
//   context.request and route.fetch()) skips context.route, so the guard checks its calls
//   too, and a refused one throws. Each test records "analytics blocked" yes or no, and how
//   many analytics requests it blocked. Service workers are blocked, because a request one
//   answers never reaches context.route. A self-test can make the guard stricter with
//   test.use({ qaChannel: '1' }), never looser: on a live QA_CHANNEL every test stays live.
// - storefrontPage(page, template) opens the template's pinned page, fails unless it
//   answers with the template's status (404 for the 404 page, 200 for every other), and
//   waits until it stops moving: fonts loaded, lazy images in, network quiet, at the top.
//   A page that answers 5xx is opened once more after 2 s, and one that answers 429 up to
//   three times with backoff; the output says so each time (retry.mjs says why).
//   On a run with a switch on whose module waits for a QA override (switches.mjs, `query`:
//   ticket 52's prompt, which the runner's Canadian time zone vetoes), it opens the pin with
//   the override that shows the module (SWITCH_QUERY, such as ?rf_region=out), then makes the
//   visitor's first interaction and waits for the module (page-checks.mjs, firstInteraction).
//   Every other run opens and settles the page exactly as before.
// - dismissCookieBanner(page) closes the store's cookie banner without moving the pointer.
// - screenshotStylePath(testInfo, channel, template) writes the stylesheet a page's
//   screenshot applies (screenshotStyle in pages.mjs) and returns its path, for
//   toHaveScreenshot's stylePath.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import { test as base, expect } from '@playwright/test';
import {
    IS_LOCAL, QA_CHANNEL, QA_OVERLAY, QA_VARIATION, previewCookies,
} from './storefront.mjs';
import { analyticsMode, isAfterFlip } from './analytics-hosts.mjs';
import { guardChannel, guardRequestContext, installNetworkGuard } from './network-guard.mjs';
import { firstInteraction } from './page-checks.mjs';
import {
    expectedStatus, pageKind, pinnedPages, screenshotStyle,
} from './pages.mjs';
import { withRetries } from './retry.mjs';
import {
    expectedModules, queriedSwitches, readSwitchValues, switchQuery, withQuery,
} from './switches.mjs';

// Whether this run blocks the analytics tags. The config's checkEnv has already refused a
// QA_ANALYTICS the run may not use.
export const ANALYTICS = analyticsMode();
// Whether the Flip has passed (the release calendar, W0-13): from then on every channel is live.
const FLIPPED = isAfterFlip();

export const test = base.extend({
    serviceWorkers: 'block',
    qaChannel: [QA_CHANNEL, { option: true }],
    context: async ({ context }, use) => {
        const cookies = previewCookies();
        if (cookies.length) await context.addCookies(cookies);
        await use(context);
    },
    networkGuard: [async ({ context, qaChannel, baseURL }, use, testInfo) => {
        const guard = await installNetworkGuard(context, {
            channel: guardChannel(QA_CHANNEL, qaChannel), storefront: baseURL, local: IS_LOCAL, blockAnalytics: ANALYTICS.blocked, flipped: FLIPPED,
        });
        testInfo.annotations.push({ type: 'analytics blocked', description: guard.analyticsBlocked ? 'yes' : 'no' });
        if (guard.refusesWrites) testInfo.annotations.push({ type: 'writes refused', description: `channel ${guard.channel}, through ${baseURL}` });
        await use(guard);
        if (guard.blocked.length) testInfo.annotations.push({ type: 'analytics requests blocked', description: String(guard.blocked.length) });
        if (guard.answered.length) testInfo.annotations.push({ type: 'writes answered by the gates', description: guard.answered.join('; ') });
        guard.assertNoRefusedWrites();
        guard.assertNoAnalyticsCompleted();
    }, { auto: true }],
    // Playwright's own APIRequestContext for API calls, which no route sees: the same guard
    // checks each of its calls.
    request: async ({ request, networkGuard, baseURL }, use) => {
        guardRequestContext(request, networkGuard, { baseURL });
        await use(request);
    },
});

export { expect };

export const PAGES = pinnedPages(QA_CHANNEL);

// The run's module switches: config.json's for QA_VARIATION, with QA_OVERLAY's on top. Those that
// are on and whose module waits for a QA override (switches.mjs, `query`) open every pin with
// the override that shows it: SWITCH_QUERY is 'rf_region=out' on a run with rf_region_prompt on
// (the switch matrix's "rf_region_prompt on" row), and '' on every other.
export const SWITCH_VALUES = readSwitchValues({ variation: QA_VARIATION, overlay: QA_OVERLAY });
export const SWITCH_QUERY = switchQuery(SWITCH_VALUES);
const QUERIED = queriedSwitches(SWITCH_VALUES).length > 0;

// A pinned page's path as this run opens it.
export const pinPath = template => withQuery(PAGES[template], SWITCH_QUERY);

export async function storefrontPage(page, template, pagePath = pinPath(template)) {
    const response = await withRetries(() => page.goto(pagePath, { waitUntil: 'load' }), {
        what: `the ${template} page ${pagePath}`,
        verb: 'opening',
        read: answer => ({ status: answer?.status(), retryAfter: answer?.headers()['retry-after'] }),
    });
    // Anything else is an error page: checking it, or recording it as a baseline, would
    // pass the gate without looking at the template. Fix the pin in pages.mjs.
    const status = response?.status();
    if (status !== expectedStatus(template)) {
        throw new Error(`the ${template} page ${pagePath} returned HTTP ${status}, not ${expectedStatus(template)}; fix its pin in scripts/qa/pages.mjs`);
    }
    await page.evaluate(() => document.fonts.ready);
    // lazysizes loads images as they scroll into view; scroll once so every image is in.
    await page.evaluate(async () => {
        const pause = ms => new Promise(resolve => { setTimeout(resolve, ms); });
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight) {
            window.scrollTo(0, y);
            await pause(100); // eslint-disable-line no-await-in-loop
        }
        window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    // A lazy image with no box, such as a menu pane's banner while its pane or the panel is
    // closed (ticket 29), never loads, so it isn't waited for: the wait would run its full 10 s.
    await page.evaluate(() => Promise.race([
        Promise.all([...document.images].filter(image => !image.complete && !(image.loading === 'lazy' && !image.getClientRects().length))
            .map(image => new Promise(resolve => {
                image.addEventListener('load', resolve);
                image.addEventListener('error', resolve);
            }))),
        new Promise(resolve => { setTimeout(resolve, 10000); }),
    ]));
    // A module that shows only after the visitor's first interaction (switches.mjs, `query`).
    // Whether it showed is switch-query.spec.mjs's check, not this one's.
    if (QUERIED) await firstInteraction(page, expectedModules(SWITCH_VALUES, pagePath, pageKind(template)));
    return response;
}

// toHaveScreenshot reads a stylesheet only from a file, so each test writes its own into
// its output folder (scripts/qa/results/, ignored by git).
export function screenshotStylePath(testInfo, channel, template) {
    const file = testInfo.outputPath(`screenshot-${channel}-${template}.css`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, screenshotStyle(channel, template));
    return file;
}

// BigCommerce's cookie banner (a store setting) is fixed to the viewport, so in a
// full-page screenshot it covers the template. Dismiss it as a keyboard user would: a
// click would leave the pointer where the button was, over whatever the banner covered,
// which then shows its hover state (on the desktop product page, EasyZoom's flyout).
export async function dismissCookieBanner(page) {
    const banner = page.locator('#consent-manager');
    if (await banner.isVisible()) {
        await banner.getByRole('button', { name: 'Reject all' }).press('Enter');
        await banner.waitFor({ state: 'hidden' });
    }
}
