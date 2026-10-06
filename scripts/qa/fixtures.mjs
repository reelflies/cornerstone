// The test fixture every storefront spec imports instead of @playwright/test.
//
// - The preview cookie for QA_BASE_URL goes into the browser's cookie jar for that
//   host only, so it never reaches fonts, the CDN or any other host.
// - storefrontPage(page, template) opens the template's pinned page, fails unless it
//   answers with the template's status (404 for the 404 page, 200 for every other), and
//   waits until it stops moving: fonts loaded, lazy images in, network quiet, at the top.
//   A page that answers 5xx is opened once more after 2 s, and the output says so
//   (RETRY_DELAY_MS in storefront.mjs says why).
// - dismissCookieBanner(page) closes the store's cookie banner without moving the pointer.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import { test as base, expect } from '@playwright/test';
import {
    QA_CHANNEL, RETRY_DELAY_MS, previewCookies, worthRetrying,
} from './storefront.mjs';
import { expectedStatus, pinnedPages } from './pages.mjs';

export const test = base.extend({
    context: async ({ context }, use) => {
        const cookies = previewCookies();
        if (cookies.length) await context.addCookies(cookies);
        await use(context);
    },
});

export { expect };

export const PAGES = pinnedPages(QA_CHANNEL);

export async function storefrontPage(page, template, pagePath = PAGES[template]) {
    let response = await page.goto(pagePath, { waitUntil: 'load' });
    if (worthRetrying(response?.status())) {
        console.log(`RETRY    the ${template} page ${pagePath} returned HTTP ${response.status()}; opening it once more in ${RETRY_DELAY_MS / 1000} s (stencil start's request to the store can drop)`);
        await page.waitForTimeout(RETRY_DELAY_MS);
        response = await page.goto(pagePath, { waitUntil: 'load' });
    }
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
