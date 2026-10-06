// Screenshot diffs of every pinned template at 375 and 1280 (spec Testing Decisions,
// seam 1; ticket 16), against the baselines in
// scripts/qa/baselines/<channel>-<variation>/. Live data is masked (masksFor in
// pages.mjs: LIVE_DATA on every page, plus the channel's own masks for that page), so the
// diffs don't fail on prices, stock, cart counts or catalogue changes. Content that could
// change a page's height is hidden instead, through a stylesheet (screenshotStyle in
// pages.mjs; W0-5): widgets and the cookie banner and bar on every page, and the boxes a
// channel holds at a fixed height, such as channel 1's related products.
//
// A missing baseline fails the run: a plain run never writes one (updateSnapshots in
// playwright.config.mjs), so a release can't pass on a set nobody has reviewed.
//
//   npm run qa:screens
//   npm run qa:screens -- --update-snapshots      # after a reviewed, intended change

import fs from 'fs';
import path from 'path';
import { masksFor } from './pages.mjs';
import {
    BASELINE_SET, QA_CHANNEL, QA_VARIATION, ROOT,
} from './storefront.mjs';
import {
    PAGES, dismissCookieBanner, expect, screenshotStylePath, storefrontPage, test,
} from './fixtures.mjs';

for (const [template, pagePath] of Object.entries(PAGES)) {
    test(`${template} (${pagePath}) matches its baseline`, async ({ page }, testInfo) => {
        const baseline = testInfo.snapshotPath(BASELINE_SET, `${template}.png`, { kind: 'screenshot' });
        if (testInfo.config.updateSnapshots === 'none' && !fs.existsSync(baseline)) {
            throw new Error(`there is no ${template} baseline for channel ${QA_CHANNEL}, "${QA_VARIATION}" at ${testInfo.project.name}: ${path.relative(ROOT, baseline)} doesn't exist. `
                + `Make it with \`QA_CHANNEL=${QA_CHANNEL} QA_VARIATION="${QA_VARIATION}" npm run qa:screens -- --update-snapshots\`, then review the PNG and commit it.`);
        }

        await storefrontPage(page, template);
        await dismissCookieBanner(page);
        await expect(page).toHaveScreenshot([BASELINE_SET, `${template}.png`], {
            fullPage: true,
            mask: masksFor(QA_CHANNEL, template).map(selector => page.locator(selector)),
            stylePath: screenshotStylePath(testInfo, QA_CHANNEL, template),
        });
    });
}
