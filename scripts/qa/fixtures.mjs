// The test fixture every storefront spec imports instead of @playwright/test.
//
// - The preview cookie for QA_BASE_URL goes into the browser's cookie jar for that
//   host only, so it never reaches fonts, the CDN or any other host.
// - storefrontPage(page, path) opens a page and waits until it stops moving: fonts
//   loaded, lazy images in, network quiet, back at the top.
// - dismissCookieBanner(page) closes the store's cookie banner.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import { test as base, expect } from '@playwright/test';
import { QA_CHANNEL, previewCookies } from './storefront.mjs';
import { pinnedPages } from './pages.mjs';

export const test = base.extend({
    context: async ({ context }, use) => {
        const cookies = previewCookies();
        if (cookies.length) await context.addCookies(cookies);
        await use(context);
    },
});

export { expect };

export const PAGES = pinnedPages(QA_CHANNEL);

export async function storefrontPage(page, pagePath) {
    const response = await page.goto(pagePath, { waitUntil: 'load' });
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
// full-page screenshot it covers the template. Dismiss it as a shopper would.
export async function dismissCookieBanner(page) {
    const banner = page.locator('#consent-manager');
    if (await banner.isVisible()) {
        await banner.getByRole('button', { name: 'Reject all' }).click();
        await banner.waitFor({ state: 'hidden' });
    }
}
