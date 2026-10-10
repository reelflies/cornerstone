// The product page's look (ticket 39; spec module 15; O14, R6; stories 36, 44 to 49), at 375 and
// 1280, on the fixture page: the real product page, with the theme's header and footer, rendered
// round the reference's Adams Parachute Dry Fly (render/pages/product-page/fixtures/adams.json:
// two photos, seven sizes, a weight the page mustn't show, and four related patterns), with their
// own photos (render/pages/product-page/fixtures/files/). Channel 1's product pins hold their live
// related grids out of their shots (pages.mjs's `hold`), so this is where the related grid and the
// details sections are shot from fixed data, beside the reference's own product.
//
// - The whole page at 375 and 1280: photos, buy box, details on phones; the details under the
//   photos and the buy box on the right from 801px; related patterns as a grid of cards.
// - At 1280, scrolled past the photos: the buy box held in view beside the details (story 36),
//   shot as the window shows it.
//
// The page loads no theme script, so stock's carousel and the size pills' script don't run: the
// layout is the server's and the stylesheet's, as a shopper first sees it.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
// Its baselines are widget baselines, scripts/qa/baselines/widgets/<variation>/product-page-adams-
// <project>-<platform>.png and product-page-adams-scrolled-desktop-1280-<platform>.png, declared on
// a PR's Baselines line as `widget product-page`:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs product-page-screens --update-snapshots

/* eslint-env browser */ // the evaluate callbacks run in the page

import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the product page renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const ADAMS = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'product-page' && name === 'adams');
const STICKY_TOP = 24; // _product.scss's $rf-product-sticky-top

async function open(page) {
    const { problems } = await openWidget(page, ADAMS, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    for (const img of await page.locator('.productView-images img, .rf-related img').all()) {
        await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    // The phone header is sticky, so it would lie over the page wherever the shot is scrolled to.
    await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
    await page.evaluate(() => window.scrollTo(0, 0));
}

test('the product page (ticket 39) matches its baseline', async ({ page }) => {
    await open(page);
    await expect(page.locator('.rf-related .card')).toHaveCount(4);
    await expect(page).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'product-page-adams.png'], { fullPage: true });
});

test('at 1280 the buy box stays in view beside the details as the page scrolls (story 36)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'the buy box is a column of its own from 801px');
    await open(page);
    // All three sections open, so the column of photos and details runs well past the buy box.
    await page.locator('[data-rf-product-details] details').evaluateAll(all => all.forEach(section => section.setAttribute('open', '')));
    const box = page.locator('[data-rf-product-buy]');
    const at = () => box.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const view = element.closest('.productView').getBoundingClientRect();
        const details = document.querySelector('[data-rf-product-details]').getBoundingClientRect();
        return {
            top: rect.top, bottom: rect.bottom, pageTop: rect.top + window.scrollY, height: rect.height, end: view.bottom + window.scrollY, details: details.top + window.scrollY,
        };
    });
    const before = await at();
    // As far down as the buy box can stay held: until the details reach the top, or the column ends.
    const target = Math.min(before.details - 40, before.end - before.height - STICKY_TOP);
    expect(target - before.pageTop, 'the page scrolls well past where the buy box starts').toBeGreaterThan(150);
    await page.evaluate(y => window.scrollTo(0, y), target);
    const after = await at();
    expect(Math.round(after.top), 'the buy box held at the top of the window').toBe(STICKY_TOP);
    expect(after.pageTop, 'the buy box moved down the page with the window').toBeGreaterThan(before.pageTop + 150);
    expect(after.bottom, 'the whole buy box in view').toBeLessThanOrEqual(page.viewportSize().height);
    await expect(page.locator('[data-rf-product-details]'), 'beside the details').toBeInViewport();
    await expect(page).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'product-page-adams-scrolled.png']);
});
