// The category page on live channel-1 pins (ticket 32; spec module 8; O10, UX-5, CD-6; stories
// 20, 21, 22 and 71), at 375 and 1280. Its markup is render/partials/category.test.mjs's, its
// server HTML the category-page and category-robots assertions', and its look on tree-4 data
// category-screens.spec.mjs's. The pins (pages.mjs) are tree 1's:
//
// - category: Realistic Trout Flies, one of channel 1's rf_menu_type_ids, so it has the banner:
//   eager with fetchpriority="high", 220px tall from 801px (taller only when a long name wraps)
//   with the H1 and the intro on it, every line of that text at 4.5:1 or better over its
//   lightest pixel. Under the menu-ids-empty overlay it has the plain header.
// - category@more (Fly Gear, a More from ReelFlies category) and category@noindex (a sub-type on
//   the noindex template): the plain header, though both categories have images.
// - On every category pin: the chips are the store's subcategories, from ?debug=context, each a
//   link, in at most two rows, with a thumbnail where the subcategory has an image; nothing
//   scrolls sideways at 320; the first row of products starts within the first screen at
//   1366x768 (the phone fold is category-screens.spec.mjs's, on the fixture page).
//
// It runs only when named, like header.spec.mjs: no npm script's filter matches it.
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs category.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { pageKind } from './pages.mjs';
import { HEADERS, QA_CHANNEL, QA_OVERLAY } from './storefront.mjs';
import { withQuery } from './switches.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';

const CATEGORY_PINS = Object.keys(PAGES).filter(key => pageKind(key) === 'category');
const BANNER_PIN = 'category';
const PLAIN_PINS = ['category@more', 'category@noindex'];
const phone = testInfo => testInfo.project.name === 'phone-375';

async function context(request, key) {
    const response = await request.get(withQuery(PAGES[key], 'debug=context'), { headers: HEADERS });
    expect(response.status(), `?debug=context on ${key}`).toBe(200);
    return response.json();
}

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    // A page with chips waits for category-chips.js to lay them out; one with none has nothing to
    // wait for.
    if (await page.locator('[data-rf-chips]').count()) await expect(page.locator('[data-rf-chips]')).toHaveAttribute('data-rf-chips-ready', '');
}

test.skip(!CATEGORY_PINS.length, `no category page is pinned for channel ${QA_CHANNEL}; try QA_CHANNEL=1`);

test(`${BANNER_PIN}: the banner is eager and high priority, 220px tall from 801px, with the H1 and the intro on it (story 21)`, async ({ page }, testInfo) => {
    test.skip(!PAGES[BANNER_PIN], `no ${BANNER_PIN} pin on channel ${QA_CHANNEL}`);
    await open(page, BANNER_PIN);
    const banner = page.locator('.rf-listing-banner');
    if (QA_OVERLAY === 'menu-ids-empty') {
        await expect(banner, 'with no menu ids, no page gets the banner').toHaveCount(0);
        return;
    }
    await expect(banner).toHaveAttribute('fetchpriority', 'high');
    expect(await banner.getAttribute('loading')).toBeNull();
    const box = await banner.boundingBox();
    const copy = await page.locator('.rf-listing-header .rf-listing-copy').boundingBox();
    if (phone(testInfo)) {
        expect(copy.y, 'on phones the H1 and the intro sit under the photo').toBeGreaterThanOrEqual(box.y + box.height - 1);
        return;
    }
    expect(Math.round(box.height)).toBe(220);
    expect(copy.y + copy.height, 'the copy on the photo').toBeLessThanOrEqual(box.y + box.height + 1);
    for (const selector of ['.rf-listing-title', '.rf-listing-intro']) {
        if (await page.locator(selector).count()) expect((await worstContrastOverPhoto(page, selector)).ratio, `${selector} over the banner`).toBeGreaterThanOrEqual(4.5); // eslint-disable-line no-await-in-loop
    }
});

for (const key of PLAIN_PINS) {
    test(`${key}: the plain header, with no banner, though the category has an image (O10)`, async ({ page, request }) => {
        test.skip(!PAGES[key], `no ${key} pin on channel ${QA_CHANNEL}`);
        const data = await context(request, key);
        expect(data.category.image?.data, 'the category has an image of its own').toBeTruthy();
        await open(page, key);
        await expect(page.locator('.rf-listing-header--plain h1')).toHaveText(data.category.name);
        await expect(page.locator('.rf-listing-banner')).toHaveCount(0);
    });
}

for (const key of CATEGORY_PINS) {
    test(`${key}: the chips are its subcategories, in two rows at most, each a link (stories 22 and 71)`, async ({ page, request }) => {
        const { category } = await context(request, key);
        const subs = category.subcategories || [];
        await open(page, key);
        const list = page.locator('[data-rf-chips]');
        if (!subs.length) {
            await expect(list).toHaveCount(0);
            return;
        }
        // By path: stencil start serves the store's links as paths.
        const links = await list.locator('a.rf-chip').evaluateAll(anchors => anchors.map(anchor => ({ path: anchor.pathname, thumb: Boolean(anchor.querySelector('img')) })));
        expect(links.map(link => link.path)).toEqual(subs.map(sub => new URL(sub.url).pathname));
        expect(links.map(link => link.thumb), 'a thumbnail where the subcategory has an image').toEqual(subs.map(sub => Boolean(sub.image?.data)));
        const rows = await list.evaluate(element => new Set([...element.children].filter(item => !item.hidden).map(item => Math.round(item.getBoundingClientRect().top))).size);
        expect(rows).toBeLessThanOrEqual(2);
    });

    test(`${key}: nothing scrolls sideways at 320`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await open(page, key);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    // At 1366x768 only. On phones channel 1's own header_bottom--global widget, a 108px
    // announcement bar (ticket 53 replaces it), sits above the page, so the phone check is
    // category-screens.spec.mjs's on the fixture page, and ticket 32's comment records the live
    // figure until ticket 33's filter button joins the sort row.
    test(`${key}: the first row of products starts within the first screen at 1366x768 (stories 20 and 21)`, async ({ page }, testInfo) => {
        test.skip(phone(testInfo), 'the phone check is on the fixture page');
        await page.setViewportSize({ width: 1366, height: 768 });
        await open(page, key);
        await page.evaluate(() => window.scrollTo(0, 0));
        const card = await page.locator('.productGrid .card').first().boundingBox();
        expect(card.y, 'the first row starts on the first screen').toBeLessThan(768);
    });
}
