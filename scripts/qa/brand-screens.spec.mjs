// The ReelFlies brand listing (ticket 36; spec module 12; O10, O20, UX-7; stories 17, 23, 25, 26,
// 70 and 71), at 375 and 1280, on the fixture page: the real brand page rendered round channel 1's
// brand context (render/pages/brand-page/), with nine of the brand's own patterns and their
// photos, the brand's own 16:7 image, and the Fly Sizes facet with items, which stencil start
// doesn't send for a brand. The live pins hold their grids out of the shots and 1895766's brand
// has no products until refactor 14, so the page's look is checked here; brand.spec.mjs checks the
// live pins.
//
// - Each case matches its baseline (widget baselines, declared as `widget brand-page`): `banner`
//   (the brand's image), `plain` (no image) and `empty` (filters that match nothing).
// - The banner: eager with fetchpriority="high", 220px tall from 801px with the H1 on it at 4.5:1
//   or better over its lightest pixel; on phones the photo first, then the H1. Without an image,
//   the plain header, and the first card holds the page's one fetchpriority="high".
// - Ticket 33's pills in hook order once size-filter.js has run, from the API's order; Filter on
//   phones; the empty state's message and Clear filters, with focus left alone.
// - The first row of products starts within the first screen at 375x667 and shows whole at
//   1366x768; nothing scrolls sideways at 320; axe finds no serious or critical issue.
//
// The fixture page loads no theme bundle, so the spec runs ticket 33's size-filter.js in the page
// through render/theme-script.mjs. Its name ends in "screens", so `npm run qa:screens` (and so
// qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs brand-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';
import { themeScript } from './render/theme-script.mjs';

test.skip(Boolean(QA_OVERLAY), `the brand page renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const CASES = widgetCases([PAGE_FIXTURES]).filter(({ widget, shot }) => widget === 'brand-page' && shot);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const phone = testInfo => testInfo.project.name === 'phone-375';
const byName = name => CASES.find(fixture => fixture.name === name);
const SIZE_FILTER = ['reelflies/live-region', 'reelflies/hook-order', 'reelflies/facet-order', 'reelflies/size-filter'];
const runSizeFilter = page => page.addScriptTag({ content: themeScript(SIZE_FILTER, "modules['reelflies/size-filter'].default.load({}, document);") });
const pillSizes = page => page.locator('#facetedSearch [data-facet="Fly Sizes"] .rf-size-pill').allInnerTexts();
const hookRank = size => (size.includes('/') ? -Number(size.split('/')[0]) : Number(size));

async function open(page, fixture, { sizes = true } = {}) {
    const { problems } = await openWidget(page, fixture, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    if (sizes) await runSizeFilter(page);
    for (const img of await page.locator('#main-content img:not([loading="lazy"])').all()) {
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    await page.evaluate(() => window.scrollTo(0, 0));
}

test('has its three cases: the banner, the plain header and filters that match nothing', () => {
    expect(CASES.map(fixture => fixture.name).sort()).toEqual(['banner', 'empty', 'plain']);
});

for (const fixture of CASES) {
    test.describe(`the brand listing: ${fixture.name} (ticket 36)`, () => {
        test('matches its baseline', async ({ page }) => {
            await open(page, fixture);
            for (const img of await page.locator('.card-image').all()) {
                await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
                await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
            }
            // The phone header is sticky, and would cover the page's top in an element shot.
            await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
            await page.evaluate(() => window.scrollTo(0, 0));
            await expect(page.locator('#main-content')).toHaveScreenshot(['widgets', slug(QA_VARIATION), `brand-page-${fixture.name}.png`]);
        });

        test('has one H1, the brand\'s name, in the listing header, and no stock brand heading', async ({ page }) => {
            await open(page, fixture);
            await expect(page.locator('h1')).toHaveCount(1);
            await expect(page.locator('.rf-listing-header h1')).toHaveText(fixture.fixture.page_context.brand.name);
            await expect(page.locator('.brand-image-container')).toHaveCount(0);
        });

        test('scrolls nothing sideways at 320 (story 71)', async ({ page }) => {
            await page.setViewportSize({ width: 320, height: 800 });
            await open(page, fixture);
            expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
        });

        test('shows the first row of products within the first screen (story 70)', async ({ page }, testInfo) => {
            test.skip(!fixture.fixture.page_context.brand.products.length, 'filters that match nothing show no products');
            const size = phone(testInfo) ? { width: 375, height: 667 } : { width: 1366, height: 768 };
            await page.setViewportSize(size);
            await open(page, fixture);
            const photo = await page.locator('.productGrid .card-image').first().boundingBox();
            if (phone(testInfo)) expect(photo.y, 'the first row starts on the first screen').toBeLessThan(size.height);
            else expect(photo.y + photo.height, 'the first row\'s photos show whole on the first screen').toBeLessThanOrEqual(size.height);
        });

        test('has no serious or critical axe issues', async ({ page }) => {
            await open(page, fixture);
            const { violations } = await new AxeBuilder({ page }).include('#main-content').withTags(TAGS).analyze();
            expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
        });
    });
}

test('the banner: eager and high priority, 220px tall from 801px with the H1 on it; on phones the H1 under the photo (O10; story 70)', async ({ page }, testInfo) => {
    await open(page, byName('banner'));
    const banner = page.locator('.rf-listing-banner');
    await expect(banner).toHaveAttribute('fetchpriority', 'high');
    expect(await banner.getAttribute('loading')).toBeNull();
    expect(await page.locator('img[fetchpriority="high"]').count(), 'the banner holds the page\'s one').toBe(1);
    const box = await banner.boundingBox();
    const copy = await page.locator('.rf-listing-header .rf-listing-copy').boundingBox();
    if (phone(testInfo)) {
        expect(copy.y, 'the H1 under the photo').toBeGreaterThanOrEqual(box.y + box.height - 1);
        return;
    }
    expect(Math.round(box.height)).toBe(220);
    expect(copy.y + copy.height, 'the H1 on the photo').toBeLessThanOrEqual(box.y + box.height + 1);
    expect((await worstContrastOverPhoto(page, '.rf-listing-title')).ratio, 'the H1 over the banner').toBeGreaterThanOrEqual(4.5);
});

test('without an image: the plain header, and the first card holds the page\'s one fetchpriority="high" (ticket 31; story 70)', async ({ page }) => {
    await open(page, byName('plain'));
    await expect(page.locator('.rf-listing-banner')).toHaveCount(0);
    await expect(page.locator('.rf-listing-header--plain')).toHaveCount(1);
    const high = page.locator('img[fetchpriority="high"]');
    await expect(high).toHaveCount(1);
    expect(await high.evaluate(img => img === document.querySelector('.productGrid .card-image'))).toBe(true);
});

test('puts the Fly Sizes pills in hook order, from the API\'s order, with Filter on phones (story 23)', async ({ page }, testInfo) => {
    await open(page, byName('banner'), { sizes: false });
    const before = await pillSizes(page);
    await runSizeFilter(page);
    const after = await pillSizes(page);
    expect([...after].sort((a, b) => hookRank(a) - hookRank(b)), `${after.join(', ')} in hook order`).toEqual(after);
    expect([...after].sort()).toEqual([...before].sort());
    expect(after).not.toEqual(before);
    await expect(page.locator('.rf-size-help a')).toHaveAttribute('href', '/fly-hook-size-chart/');
    if (phone(testInfo)) {
        await expect(page.locator('[data-rf-filter-button]')).toBeVisible();
        await expect(page.locator('.facetedSearch-toggle')).toBeHidden();
    } else {
        await expect(page.locator('[data-rf-filter-button]')).toBeHidden();
    }
});

test('when filters match nothing: the message, Clear filters, and the pills still there, with focus left alone (story 25)', async ({ page }, testInfo) => {
    await open(page, byName('empty'));
    await expect(page.locator('[data-rf-list-count]')).toHaveText('No flies match these filters');
    await expect(page.locator('.rf-listing-empty a')).toHaveText('Clear filters');
    expect(await page.evaluate(() => document.activeElement === document.body), 'nothing took focus').toBe(true);
    if (phone(testInfo)) await expect(page.locator('[data-rf-filter-button]')).toBeVisible();
    else await expect(page.locator('#facetedSearch [data-facet="Fly Sizes"]')).toBeVisible();
});
