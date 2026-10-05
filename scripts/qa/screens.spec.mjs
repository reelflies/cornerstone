// Screenshot diffs of every pinned template at 375 and 1280 (spec Testing Decisions,
// seam 1; ticket 16), against the baselines in
// scripts/qa/baselines/<channel>-<variation>/. Live data is masked (masksFor in
// pages.mjs: LIVE_DATA on every page, plus the channel's own masks for that page), so the
// diffs don't fail on prices, stock, cart counts or catalogue changes.
//
//   npm run qa:screens
//   npm run qa:screens -- --update-snapshots      # after a reviewed, intended change

import { masksFor } from './pages.mjs';
import { BASELINE_SET, QA_CHANNEL } from './storefront.mjs';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';

for (const [template, pagePath] of Object.entries(PAGES)) {
    test(`${template} (${pagePath}) matches its baseline`, async ({ page }) => {
        await storefrontPage(page, pagePath);
        await dismissCookieBanner(page);
        await expect(page).toHaveScreenshot([BASELINE_SET, `${template}.png`], {
            fullPage: true,
            mask: masksFor(QA_CHANNEL, template).map(selector => page.locator(selector)),
        });
    });
}
