// The product page's reviews in a browser (ticket 40; spec module 15; R11, SEO-5; stories 47, 68
// and 71), at 375 and 1280, on channel 1: product@reviews (/beadhead-copper-john-copper/, a best
// seller with ten reviews) and the product pin (6178, none). ReelFlies_CA has no products until
// refactor 14. The looks are the screenshots' (the pins' page shots, with product@reviews's live
// review list held, and the fixture page's three sample reviews in product-page-screens.spec.mjs);
// this checks what a shot can't:
//
// - The star summary sits under the price, in the buy box, and its link takes the window to the
//   reviews section, "Reviews (N)", with the same N (story 47).
// - The section lists at most five reviews, each an <h3> title with its stars, and stock's pager
//   when there are more, under the details, beside the buy box from 801px.
// - "Write a review" opens stock's review form, and Escape closes it with focus back on the
//   button. Nothing is submitted: a review is a live write on channel 1.
// - A product with no reviews has no section and no summary, and its "Write a review" opens the
//   same form.
// - Nothing scrolls sideways at 320, and axe finds no serious or critical issue in the summary, the
//   section or the no-reviews block, nor in stock's form once open (stories 68 and 71).
//
// It runs only when named:
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs reviews.spec

/* eslint-env browser */ // the evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { QA_CHANNEL } from './storefront.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const MAX_LISTED = 5; // productpage_reviews_count (config.json)
const BUY = '[data-rf-product-buy]';
const SECTION = '[data-rf-reviews]';
const EMPTY = '[data-rf-reviews-empty]';
const SUMMARY = `${BUY} [data-rf-review-summary]`;
const FORM = '#modal-review-form';
const WRITE = '[data-rf-review-write]';
const phone = testInfo => testInfo.project.name === 'phone-375';

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
}

// Each element's box, in page coordinates.
const box = (page, selector) => page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right,
    };
});
const count = text => Number((/\d+/.exec(text) || [])[0]);

async function seriousIssues(page, selectors) {
    let builder = new AxeBuilder({ page }).withTags(TAGS);
    for (const selector of selectors) builder = builder.include(selector);
    const results = await builder.analyze();
    return results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
        .map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`);
}

// "Write a review" opens stock's form (Foundation's reveal), and Escape closes it, with focus back
// on the button. Nothing is submitted.
async function opensTheForm(page) {
    const write = page.locator(WRITE);
    await expect(write).toHaveCount(1);
    await expect(write).toHaveText('Write a review');
    await write.click();
    const form = page.locator(FORM);
    await expect(form).toBeVisible();
    await expect(form.locator('form.writeReview-form [name="revrating"]')).toBeVisible();
    await expect.poll(() => page.evaluate(id => document.querySelector(id).contains(document.activeElement), FORM), 'focus inside the form').toBe(true);
    const issues = await seriousIssues(page, [FORM]);
    await page.keyboard.press('Escape');
    await expect(form).toBeHidden();
    return issues;
}

test.describe('the product page\'s reviews (ticket 40)', () => {
    test.skip(QA_CHANNEL !== '1', 'ReelFlies_CA has no products until refactor 14: run with QA_CHANNEL=1');

    test('shows the star summary under the price, and its link takes the window to "Reviews (N)" (story 47)', async ({ page }) => {
        await open(page, 'product@reviews');
        const summary = page.locator(SUMMARY);
        await expect(summary).toHaveCount(1);
        const price = await box(page, `${BUY} .productView-price`);
        const line = await box(page, SUMMARY);
        const shipping = await box(page, `${BUY} [data-rf-ship-line]`);
        expect(line.top, 'under the price').toBeGreaterThanOrEqual(price.bottom - 1);
        expect(line.top - price.bottom, 'right under it').toBeLessThanOrEqual(16);
        expect(shipping.top, 'the shipping line after it').toBeGreaterThanOrEqual(line.bottom);
        await expect(summary.getByRole('img')).toHaveAttribute('aria-label', /^Rated [0-5] out of 5$/);
        const said = count(await summary.locator('[data-rf-review-count]').innerText());
        const heading = page.locator(`${SECTION} h2`);
        expect(count(await heading.innerText()), 'the section\'s N').toBe(said);
        await expect(heading).not.toBeInViewport();
        await summary.getByRole('link').click();
        await expect(page).toHaveURL(/#product-reviews$/);
        await expect(heading).toBeInViewport();
    });

    test('lists at most five reviews under the details, each titled, with stock\'s pager when there are more', async ({ page }, testInfo) => {
        await open(page, 'product@reviews');
        const section = page.locator(SECTION);
        await expect(section).toHaveAttribute('id', 'product-reviews');
        const total = count(await section.locator('h2').innerText());
        const reviews = section.locator('[data-rf-review]');
        const listed = await reviews.count();
        expect(listed).toBeGreaterThan(0);
        expect(listed).toBeLessThanOrEqual(Math.min(MAX_LISTED, total));
        await expect(reviews.locator('h3')).toHaveCount(listed);
        await expect(reviews.getByRole('img')).toHaveCount(listed);
        await expect(section.locator('.pagination')).toHaveCount(total > MAX_LISTED ? 1 : 0);
        const details = await box(page, '[data-rf-product-details]');
        const at = await box(page, SECTION);
        expect(at.top, 'under the details').toBeGreaterThanOrEqual(details.bottom);
        if (!phone(testInfo)) {
            const buy = await box(page, BUY);
            expect(at.right, 'beside the buy box, in the photos\' column').toBeLessThanOrEqual(buy.left);
        }
        await expect(page.locator(EMPTY)).toHaveCount(0);
    });

    test('opens stock\'s review form from "Write a review", and closes it with Escape (story 47)', async ({ page }) => {
        await open(page, 'product@reviews');
        await expect(page.locator(`${SECTION} ${WRITE}`)).toHaveCount(1);
        expect(await opensTheForm(page), 'axe in the open form').toEqual([]);
        await expect(page.locator(WRITE)).toBeFocused();
    });

    test('offers "Write a review" on a product with no reviews, with no section and no summary (stories 47 and 75)', async ({ page }) => {
        await open(page, 'product');
        await expect(page.locator(SECTION)).toHaveCount(0);
        await expect(page.locator('[data-rf-review-summary]')).toHaveCount(0);
        await expect(page.locator('#product-reviews')).toHaveCount(0);
        const empty = page.locator(EMPTY);
        await expect(empty).toBeVisible();
        await expect(empty).toContainText('No reviews yet for this fly.');
        const details = await box(page, '[data-rf-product-details]');
        expect((await box(page, EMPTY)).top, 'under the details').toBeGreaterThanOrEqual(details.bottom);
        expect(await opensTheForm(page), 'axe in the open form').toEqual([]);
    });

    test('scrolls nothing sideways at 320, and axe finds no serious or critical issue in the reviews (stories 68 and 71)', async ({ page }, testInfo) => {
        test.skip(!phone(testInfo), 'both projects set the window to 320: once is enough');
        for (const [key, selectors] of [['product@reviews', [SUMMARY, SECTION]], ['product', [EMPTY]]]) {
            await page.setViewportSize({ width: 320, height: 640 }); // eslint-disable-line no-await-in-loop
            await open(page, key); // eslint-disable-line no-await-in-loop
            const width = await page.evaluate(() => document.scrollingElement.scrollWidth); // eslint-disable-line no-await-in-loop
            expect(width, `${key} at 320`).toBeLessThanOrEqual(320);
            expect(await seriousIssues(page, selectors), key).toEqual([]); // eslint-disable-line no-await-in-loop
        }
    });
});
