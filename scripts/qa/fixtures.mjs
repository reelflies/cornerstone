// The test fixture every storefront spec imports instead of @playwright/test.
//
// - The preview cookie for QA_BASE_URL goes into the browser's cookie jar for that
//   host only, so it never reaches fonts, the CDN or any other host.
// - Every test's context goes through the network guard (network-guard.mjs, W0-6) before the
//   test opens a page. Requests to the analytics hosts are aborted unless QA_ANALYTICS=allow.
//   On a live channel (1, 1855224) every write but the read-only POSTs is refused, and fails
//   the test at teardown, naming its method and URL; so does an analytics request that was
//   answered while the tags are blocked. Each test records "analytics blocked" yes or no, and
//   how many analytics requests it blocked. Service workers are blocked, because a request
//   one answers never reaches context.route. A self-test sets the channel the guard sees with
//   test.use({ qaChannel }).
// - storefrontPage(page, template) opens the template's pinned page, fails unless it
//   answers with the template's status (404 for the 404 page, 200 for every other), and
//   waits until it stops moving: fonts loaded, lazy images in, network quiet, at the top.
//   A page that answers 5xx is opened once more after 2 s, and one that answers 429 up to
//   three times with backoff; the output says so each time (retry.mjs says why).
// - dismissCookieBanner(page) closes the store's cookie banner without moving the pointer.
// - screenshotStylePath(testInfo, channel, template) writes the stylesheet a page's
//   screenshot applies (screenshotStyle in pages.mjs) and returns its path, for
//   toHaveScreenshot's stylePath.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import { test as base, expect } from '@playwright/test';
import { IS_LOCAL, QA_CHANNEL, previewCookies } from './storefront.mjs';
import { analyticsMode } from './analytics-hosts.mjs';
import { installNetworkGuard } from './network-guard.mjs';
import { expectedStatus, pinnedPages, screenshotStyle } from './pages.mjs';
import { withRetries } from './retry.mjs';

// Whether this run blocks the analytics tags. The config's checkEnv has already refused a
// QA_ANALYTICS the run may not use.
export const ANALYTICS = analyticsMode();

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
            channel: qaChannel, storefront: baseURL, local: IS_LOCAL, blockAnalytics: ANALYTICS.blocked,
        });
        testInfo.annotations.push({ type: 'analytics blocked', description: guard.analyticsBlocked ? 'yes' : 'no' });
        if (guard.refusesWrites) testInfo.annotations.push({ type: 'writes refused', description: `channel ${guard.channel}, through ${baseURL}` });
        await use(guard);
        if (guard.blocked.length) testInfo.annotations.push({ type: 'analytics requests blocked', description: String(guard.blocked.length) });
        if (guard.answered.length) testInfo.annotations.push({ type: 'writes answered by the gates', description: guard.answered.join('; ') });
        guard.assertNoRefusedWrites();
        guard.assertNoAnalyticsCompleted();
    }, { auto: true }],
});

export { expect };

export const PAGES = pinnedPages(QA_CHANNEL);

export async function storefrontPage(page, template, pagePath = PAGES[template]) {
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
    await page.evaluate(() => Promise.race([
        Promise.all([...document.images].filter(image => !image.complete)
            .map(image => new Promise(resolve => {
                image.addEventListener('load', resolve);
                image.addEventListener('error', resolve);
            }))),
        new Promise(resolve => { setTimeout(resolve, 10000); }),
    ]));
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
