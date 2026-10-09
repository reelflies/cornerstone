// The size pills on live product pages (ticket 37; spec modules 15 and 16; O14, O15, UX-10, UX-21;
// stories 37, 38, 39, 67, 68 and 71), at 375 and 1280, on channel 1: Fat Albert (5663,
// /fat-albert/), which has six sizes and a Colour, and the product pin (6178), which has one size. ReelFlies_CA has no
// products until refactor 14. The live stock decides which sizes are sold out, so the checks hold
// the pills to stock's own marks rather than to a list; the looks are the screenshots' (the
// product pin, and the size-chosen and size-sold-out states in states.mjs).
//
// - No size is checked on a multi-size product, after scripts run (the raw HTML is the
//   size-pills assertion's); a single-size product opens with its size checked and named.
// - Each pill is 56x48 at 1280 and at least 44px tall at 375; a chosen pill has the ink outline,
//   the check and no solid fill.
// - Every pill stock marks unavailable is aria-disabled with "(sold out)" in its name, and the line
//   names exactly those; on 5663, changing the Colour keeps the marks and the line in step.
// - The arrow keys move through the sizes, with the focus ring on the pill.
// - "Hook size guide" links to the chart; nothing scrolls sideways at 320.
//
// It runs only when named:
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs size-pills

/* eslint-env browser */ // the evaluate callbacks run in the page

import {
    dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { QA_CHANNEL } from './storefront.mjs';
import { chunkLoaded } from './states.mjs';

const FAT_ALBERT = '/fat-albert/';
const SIZE_GROUP = '[data-rf-pills]:has(.rf-pills-guide)';
const phone = testInfo => testInfo.project.name === 'phone-375';

async function open(page, pagePath) {
    await storefrontPage(page, 'product', pagePath);
    await dismissCookieBanner(page);
    await chunkLoaded(page, 'rf-size-pills');
    await page.locator(SIZE_GROUP).first().scrollIntoViewIfNeeded();
}

// The pills stock marks unavailable, and what the page says about them.
const soldOut = group => group.evaluate(field => ({
    marked: [...field.querySelectorAll('.rf-pill.unavailable .form-option-variant')].map(span => span.textContent.trim()),
    disabled: [...field.querySelectorAll('input[aria-disabled="true"]')].map(radio => radio.labels[0].querySelector('.form-option-variant').textContent.trim()),
    named: [...field.querySelectorAll('.rf-pill.unavailable')].every(pill => !pill.querySelector('[data-rf-sold-out-tag]').hidden),
    line: field.querySelector('[data-rf-sold-out-line]').textContent,
}));

test.describe('the size pills (ticket 37)', () => {
    test.skip(QA_CHANNEL !== '1', 'ReelFlies_CA has no products until refactor 14: run with QA_CHANNEL=1');

    test('checks no size on a multi-size product, and keeps the stock marks and the line in step (stories 37 and 39)', async ({ page }) => {
        await open(page, FAT_ALBERT);
        const group = page.locator(SIZE_GROUP).first();
        expect(await group.locator('input[type="radio"]').count()).toBeGreaterThan(1);
        await expect(group.locator('input[type="radio"]:checked')).toHaveCount(0);
        await expect(group.locator('[data-option-value]')).toHaveText('choose one');
        const state = await soldOut(group);
        expect(state.disabled).toEqual(state.marked);
        expect(state.named).toBe(true);
        for (const size of state.marked) expect(state.line).toContain(size);
        if (!state.marked.length) expect(state.line).toBe('');
    });

    test('opens a single-size product with its size checked and named (story 37)', async ({ page }) => {
        await open(page, undefined);
        const group = page.locator(SIZE_GROUP).first();
        const radios = group.locator('input[type="radio"]');
        test.skip(await radios.count() !== 1, 'the product pin no longer has one size');
        await expect(radios.first()).toBeChecked();
        await expect(group.locator('[data-option-value]')).toHaveText(await group.locator('.form-option-variant').first().innerText());
    });

    test('sizes the pills 56x48 at 1280 and at least 44px at 375, and outlines a chosen one with the check and no solid fill (story 38)', async ({ page }, testInfo) => {
        await open(page, FAT_ALBERT);
        const group = page.locator(SIZE_GROUP).first();
        const boxes = await group.locator('.rf-pill[data-product-attribute-value]').evaluateAll(pills => pills.map(pill => pill.getBoundingClientRect()).map(box => [box.width, box.height]));
        for (const [width, height] of boxes) {
            if (phone(testInfo)) expect(height).toBeGreaterThanOrEqual(44);
            else {
                expect(width).toBeGreaterThanOrEqual(56);
                expect(height).toBeGreaterThanOrEqual(48);
            }
        }
        const pill = group.locator('.rf-pill[data-product-attribute-value]:not(.unavailable)').first();
        await pill.click();
        await expect(pill.locator('.rf-pill-check')).toBeVisible();
        // Stock's .form-option eases its border over 0.15s, so the look is read once it settles.
        const look = () => pill.evaluate(element => {
            const style = getComputedStyle(element);
            return `${style.borderTopWidth} ${style.backgroundColor}`;
        });
        await expect.poll(look, { message: 'a 2px outline on the tile, not a solid fill' }).toBe('2px rgb(241, 243, 240)');
        await expect(group.locator('[data-option-value]')).toHaveText(await pill.locator('.form-option-variant').innerText());
    });

    test('moves through the sizes with the arrow keys, the focus ring on the pill (story 67)', async ({ page }) => {
        await open(page, FAT_ALBERT);
        const group = page.locator(SIZE_GROUP).first();
        const radios = group.locator('input[type="radio"]');
        await radios.first().focus();
        await page.keyboard.press('ArrowRight');
        const checked = await group.locator('input[type="radio"]:checked').getAttribute('id');
        expect(checked).not.toBe(await radios.first().getAttribute('id'));
        const ring = await group.locator('.form-radio:focus-visible + .rf-pill').evaluate(pill => getComputedStyle(pill).outlineStyle);
        expect(ring).toBe('solid');
    });

    test('on 5663, changing the Colour keeps the sold-out marks, aria-disabled and the line in step (story 39)', async ({ page }) => {
        await open(page, FAT_ALBERT);
        const groups = page.locator('[data-rf-pills]');
        const colour = groups.filter({ hasNot: page.locator('.rf-pills-guide') }).first();
        const sizes = page.locator(SIZE_GROUP).first();
        test.skip(!(await colour.count()), 'Fat Albert has no second rectangle option on this run');
        const choices = colour.locator('.rf-pill[data-product-attribute-value]');
        for (let index = 0; index < Math.min(await choices.count(), 3); index += 1) { // eslint-disable-line no-await-in-loop
            const answer = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
            await choices.nth(index).click(); // eslint-disable-line no-await-in-loop
            await answer; // eslint-disable-line no-await-in-loop
            await expect.poll(async () => { // eslint-disable-line no-await-in-loop
                const state = await soldOut(sizes);
                return state.disabled.join() === state.marked.join() && state.marked.every(size => state.line.includes(size));
            }).toBe(true);
        }
    });

    test('links "Hook size guide" to the chart, and scrolls nothing sideways at 320 (stories 15 and 71)', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await open(page, undefined);
        await expect(page.locator(`${SIZE_GROUP} .rf-pills-guide`).first()).toHaveAttribute('href', '/fly-hook-size-chart/');
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
});
