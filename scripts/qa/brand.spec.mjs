// The ReelFlies brand listing on its live pins (ticket 36; spec module 12; O10, UX-7; stories 17,
// 23, 26, 70 and 71), at 375 and 1280. Its markup is render/partials/brand.test.mjs's, its server
// HTML the brand-page, card-images, size-filter and facet-links assertions', and its look on fixed
// data brand-screens.spec.mjs's. The pins (pages.mjs) are /brands/ReelFlies.html, which the store
// answers as brand 411, whose own URL is /reelflies-2/:
//
// - channel 1: the brand's 2,167 products, 24 a page (2026-10-09). The brand has an image, so the
//   banner: eager with fetchpriority="high", 220px tall from 801px with the H1 on it at 4.5:1 or
//   better over its lightest pixel, and on phones under the photo. Without one, the plain header.
// - 1895766: the same brand with no products until refactor 14, so stock's message, no grid and
//   no pager.
// - On both: one H1, the brand's name; a full page of brandpage_products_per_page (24) cards when
//   the brand has a next page, and the stock numbered pager of <a href> links, which leads to page
//   2 (story 26), with focus then on the row, which names the page (story 68); nothing scrolling
//   sideways at 320; the first row of products within the first screen at 1366x768.
// - Browsing as a regular Chrome, since BigCommerce sends headless Chromium no facet items (below):
//   the Fly Sizes pills in hook order once size-filter.js has run, every facet link on the page
//   passing facet-links' own check, and, at 1280, a size picked refreshing the listing in place
//   through stock brand.js and ticket 36's listing, and the row's page announced (stories 23 and
//   68). Where the brand's facet has no items (1895766, with no products) they skip; the fixture
//   page checks the pills.
//
// It runs only when named, like category.spec.mjs: no npm script's filter matches it.
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs brand.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { HEADERS, QA_CHANNEL } from './storefront.mjs';
import { withQuery } from './switches.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';
import { SIZE_FACET } from './raw-html/assertions/size-filter.mjs';
import facetLinks, { facetAnchors } from './raw-html/assertions/facet-links.mjs';

const KEY = 'brand';
// A regular desktop Chrome's User-Agent and client hint (below, "the Fly Sizes pills").
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
const BROWSER_HINT = '"Chromium";v="145", "Google Chrome";v="145", "Not.A/Brand";v="99"';
const phone = testInfo => testInfo.project.name === 'phone-375';
const hookRank = size => (size.includes('/') ? -Number(size.split('/')[0]) : Number(size));

// The page's store data, asked as the page is asked: with the browser's User-Agent where a test
// sets one, since BigCommerce answers a request it takes for a bot's without facet items.
async function context(request, userAgent = null) {
    const response = await request.get(withQuery(PAGES[KEY], 'debug=context'), { headers: { ...HEADERS, ...(userAgent ? { 'User-Agent': userAgent } : {}) } });
    expect(response.status(), `?debug=context on ${PAGES[KEY]}`).toBe(200);
    return response.json();
}

async function open(page) {
    await storefrontPage(page, KEY);
    await dismissCookieBanner(page);
}

test.skip(!PAGES[KEY], `no brand page is pinned for channel ${QA_CHANNEL}`);

test('one H1, the brand\'s name, in the listing header: the banner when the brand has an image, else the plain header (O10; story 70)', async ({ page, request }, testInfo) => {
    const { brand } = await context(request);
    await open(page);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.rf-listing-header h1')).toHaveText(brand.name);
    await expect(page.locator('.brand-image-container')).toHaveCount(0);
    const banner = page.locator('.rf-listing-banner');
    if (!brand.image?.data) {
        await expect(banner).toHaveCount(0);
        await expect(page.locator('.rf-listing-header--plain')).toHaveCount(1);
        return;
    }
    await expect(banner).toHaveAttribute('fetchpriority', 'high');
    expect(await banner.getAttribute('loading')).toBeNull();
    const box = await banner.boundingBox();
    const copy = await page.locator('.rf-listing-header .rf-listing-copy').boundingBox();
    if (phone(testInfo)) {
        expect(copy.y, 'on phones the H1 sits under the photo').toBeGreaterThanOrEqual(box.y + box.height - 1);
        return;
    }
    expect(Math.round(box.height)).toBe(220);
    expect(copy.y + copy.height, 'the H1 on the photo').toBeLessThanOrEqual(box.y + box.height + 1);
    expect((await worstContrastOverPhoto(page, '.rf-listing-title')).ratio, 'the H1 over the banner').toBeGreaterThanOrEqual(4.5);
});

test('a full page of 24 cards and the stock numbered pager of <a href> links, which leads to page 2, with focus on the row (UX-7; stories 26 and 68)', async ({ page, request }) => {
    const data = await context(request);
    const { brand, pagination } = data;
    await open(page);
    if (!brand.products.length) {
        await expect(page.locator('#product-listing-container .rf-listing-empty')).toHaveText('There are no products listed under this brand.');
        await expect(page.locator('#product-listing-container .productGrid')).toHaveCount(0);
        await expect(page.locator('#product-listing-container .pagination')).toHaveCount(0);
        return;
    }
    const perPage = data.theme_settings.brandpage_products_per_page;
    expect(perPage, 'config.json\'s brandpage_products_per_page').toBe(24);
    const cards = page.locator('#product-listing-container .productGrid .card');
    if (!pagination.brand.next) {
        expect(await cards.count()).toBeLessThanOrEqual(perPage);
        return;
    }
    await expect(cards).toHaveCount(perPage);
    const pager = page.locator('#product-listing-container nav.pagination');
    // By path: stencil start serves the store's links as paths, and the context's carry ?debug=context.
    const linkPath = url => { const link = new URL(url, 'http://localhost'); link.searchParams.delete('debug'); return `${link.pathname}${link.search}`; };
    const hrefs = await pager.locator('a[href]').evaluateAll(anchors => anchors.map(anchor => `${anchor.pathname}${anchor.search}`));
    for (const link of pagination.brand.links) expect(hrefs, `page ${link.number}`).toContain(linkPath(link.url));
    await expect(pager.locator('.pagination-item--current')).toHaveText(/1/);
    const second = pager.locator('a[href]', { hasText: /^\s*2\s*$/ });
    await second.click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(page.locator('.rf-listing-header h1')).toHaveText(brand.name);
    await expect(page.locator('#product-listing-container nav.pagination .pagination-item--current')).toHaveText(/2/);
    expect(await page.locator('#product-listing-container .productGrid .card').count()).toBeGreaterThan(0);
    // The link used is gone with the refresh, so size-filter.js puts focus on the row, which a
    // brand's names by its page, having no total (story 68).
    await expect(page.locator('[data-rf-list-count]')).toHaveText('Page 2');
    await expect.poll(() => page.evaluate(() => document.activeElement?.matches('[data-rf-list-count]')), 'focus on the row').toBe(true);
});

// BigCommerce sends no facet items to a client it takes for a bot: curl's User-Agent, and headless
// Chromium's, by its User-Agent or by its Sec-CH-UA client hint, which both name HeadlessChrome.
// On channel 1 on 2026-10-09, those got the brand's facets with no items, where a regular Chrome,
// Node's default fetch and the raw-HTML gate's own (raw-html.mjs's ReelFliesQA User-Agent) got its
// ten Fly Sizes. So the page shots, in headless Chromium, show an empty sidebar, which keeps them
// still, while the raw-HTML gate's facet-links and size-filter check the server HTML's pills
// (brand-page fails the pin if they ever come without items). This block browses as a regular
// Chrome to check the pills after JavaScript and a live refresh.
test.describe('the Fly Sizes pills, as a regular browser sees them (story 23)', () => {
    test.use({ userAgent: BROWSER_UA, extraHTTPHeaders: { ...HEADERS, 'Sec-CH-UA': BROWSER_HINT } });

    test('the pills in hook order, every facet link with _bc_fsnf=1 and rel="nofollow" (facet-links\' own check), and "What do sizes mean?" (SEO-6, SEO-12)', async ({ page, request, userAgent }) => {
        const { brand } = await context(request, userAgent);
        const sizes = (brand.facets || []).find(facet => facet.facet === SIZE_FACET);
        test.skip(!sizes?.items?.length, `the brand's ${SIZE_FACET} facet has no items on channel ${QA_CHANNEL}; brand-screens.spec.mjs checks the pills on the fixture page`);
        await open(page);
        const pills = page.locator(`#facetedSearch [data-facet="${SIZE_FACET}"] .rf-size-pill`);
        const labels = (await pills.allTextContents()).map(text => text.trim());
        expect(labels.length).toBe(sizes.items.length);
        expect([...labels].sort((a, b) => hookRank(a) - hookRank(b)), `${labels.join(', ')} in hook order`).toEqual(labels);
        // Every facet's links, not only the pills (criterion 2), as this browser has the page.
        const html = await page.content();
        expect(facetAnchors(html, page.url()).length, 'facet links with a filter, the pills among them').toBeGreaterThanOrEqual(labels.length);
        expect(facetLinks.check({ html, url: page.url() }), 'facet-links on the page').toEqual([]);
        await expect(page.locator('.rf-size-help a')).toHaveAttribute('href', '/fly-hook-size-chart/');
    });

    test('a size picked refreshes the listing in place: that pill current, the pills still in hook order, cards and the row, focus on the size, and the row\'s page announced', async ({ page, request, userAgent }, testInfo) => {
        test.skip(phone(testInfo), 'the facets are behind Filter on phones; the fixture page checks Filter');
        const { brand } = await context(request, userAgent);
        const sizes = (brand.facets || []).find(facet => facet.facet === SIZE_FACET);
        test.skip(!sizes?.items?.length, `the brand's ${SIZE_FACET} facet has no items on channel ${QA_CHANNEL}`);
        await open(page);
        const pills = page.locator(`#facetedSearch [data-facet="${SIZE_FACET}"] .rf-size-pill`);
        const first = pills.first();
        const size = (await first.textContent()).trim();
        await first.click();
        await expect(page).toHaveURL(/Fly(\+|%20)Sizes=/);
        await expect(page.locator('.rf-size-pill[aria-current="true"]')).toHaveText(size);
        await expect(page.locator('.rf-size-pill[aria-current="true"]')).toBeFocused();
        const labels = (await pills.allTextContents()).map(text => text.trim());
        expect([...labels].sort((a, b) => hookRank(a) - hookRank(b)), `${labels.join(', ')} in hook order after the refresh`).toEqual(labels);
        await expect(page.locator('.rf-listing-header h1')).toHaveText(brand.name);
        await expect(page.locator('#product-listing-container .rf-list-top')).toHaveCount(1);
        await expect(page.locator('[data-rf-live-region]')).toHaveText('Page 1');
        const cards = await page.locator('#product-listing-container .productGrid .card').count();
        expect(cards).toBeGreaterThan(0);
        expect(cards).toBeLessThanOrEqual(24);
    });
});

test('nothing scrolls sideways at 320 (story 71)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

// At 1366x768 only, as category.spec.mjs: on phones channel 1's own header_bottom--global widget,
// a 108px announcement bar, sits above the page, so the phone fold is brand-screens.spec.mjs's.
test('the first row of products starts within the first screen at 1366x768 (story 70)', async ({ page, request }, testInfo) => {
    test.skip(phone(testInfo), 'the phone check is on the fixture page');
    const { brand } = await context(request);
    test.skip(!brand.products.length, 'the brand has no products on this channel');
    await page.setViewportSize({ width: 1366, height: 768 });
    await open(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    const card = await page.locator('.productGrid .card').first().boundingBox();
    expect(card.y, 'the first row starts on the first screen').toBeLessThan(768);
});
