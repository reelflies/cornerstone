// Screenshot diffs of every pinned template at 375 and 1280 (spec Testing Decisions,
// seam 1; ticket 16), against the baselines in
// scripts/qa/baselines/<channel>-<variation>/. Live data (LIVE_DATA in pages.mjs) is
// masked, so the diffs don't fail on prices, stock, cart counts or catalogue changes.
//
//   npm run qa:screens
//   npm run qa:screens -- --update-snapshots      # after a reviewed, intended change

import { LIVE_DATA } from './pages.mjs';
import { BASELINE_SET } from './storefront.mjs';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';

for (const [template, pagePath] of Object.entries(PAGES)) {
    test(`${template} (${pagePath}) matches its baseline`, async ({ page }) => {
        await storefrontPage(page, pagePath);
        await dismissCookieBanner(page);
        await expect(page).toHaveScreenshot([BASELINE_SET, `${template}.png`], {
            fullPage: true,
            mask: LIVE_DATA.map(selector => page.locator(selector)),
        });
    });
}
