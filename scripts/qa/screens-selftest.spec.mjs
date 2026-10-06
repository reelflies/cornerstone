// Proves the screenshot gate fails on a real change (ticket 16, story 77). It runs
// with every `npm run qa:screens`, using the same threshold settings as the template
// diffs (playwright.config.mjs), on a fixed page of coloured blocks that renders the
// same everywhere, so it needs no storefront data.
//
// - The unchanged page matches its baseline.
// - A changed region above the threshold fails the comparison.
// - A changed region below the threshold passes, so the threshold is what decides.

import fs from 'fs';
import { expect, test } from '@playwright/test';

const BASELINE = ['selftest', 'blocks.png'];
const COLOURS = ['#7b8e7a', '#5d705c', '#f4f1ea', '#2b2b2b', '#c9a227', '#ffffff'];

async function renderBlocks(page, change) {
    const blocks = COLOURS.map(colour => `<div style="height:100px;background:${colour}"></div>`).join('');
    const patch = change
        ? `<div style="position:absolute;left:20px;top:150px;width:${change.width}px;height:${change.height}px;background:#e4007c"></div>`
        : '';
    await page.setContent(`<!doctype html><body style="margin:0;position:relative">${blocks}${patch}</body>`);
}

// While --update-snapshots is rewriting baselines, a changed page would overwrite the
// baseline instead of failing against it, so the change checks wait for a normal run.
const updating = testInfo => !['none', 'missing'].includes(testInfo.config.updateSnapshots);

test.describe('screenshot self-test', () => {
    test('an unchanged page matches its baseline', async ({ page }) => {
        await renderBlocks(page, null);
        await expect(page).toHaveScreenshot(BASELINE);
    });

    test('a changed region above the threshold fails', async ({ page }, testInfo) => {
        test.skip(updating(testInfo), 'baselines are being rewritten');
        expect(fs.existsSync(testInfo.snapshotPath(...BASELINE, { kind: 'screenshot' })), 'the self-test baseline exists').toBe(true);

        await renderBlocks(page, { width: 200, height: 100 }); // 20,000 px, over 0.2% of either width's viewport
        await expect(expect(page).toHaveScreenshot(BASELINE)).rejects.toThrow(/pixels \(ratio [\d.]+ of all image pixels\) are different/);
    });

    test('a changed region below the threshold passes', async ({ page }, testInfo) => {
        test.skip(updating(testInfo), 'baselines are being rewritten');
        await renderBlocks(page, { width: 10, height: 10 }); // 100 px, under 0.2% of either width's viewport
        await expect(page).toHaveScreenshot(BASELINE);
    });
});
