// The home page with its widgets and nothing masked, at 375 and 1280, for section 6 of the
// review pages (W0-10). Page baselines mask or hide widget regions, so this is the one shot
// that shows them. It is not a gate: nothing compares it with a baseline, and no npm qa:*
// script runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs review-live
//   QA_BASE_URL=https://<prelaunch host> QA_PREVIEW_COOKIE='…' npx playwright test --config scripts/qa/playwright.config.mjs review-live
//
// Without QA_BASE_URL it renders this checkout's templates through stencil start, with the
// store's live widgets; with it, the build the prelaunch host runs. Shots go to
// scripts/qa/results/live/<channel>-<variation>/ and into the manifest. A channel that pins
// no home page (channel 1) is skipped.

import path from 'path';
import {
    BASELINE_SET, QA_CHANNEL, QA_VARIATION, ROOT,
} from './storefront.mjs';
import {
    PAGES, dismissCookieBanner, storefrontPage, test,
} from './fixtures.mjs';
import { shotAnnotation } from './review/manifest.mjs';

test('the home page with its widgets and nothing masked', async ({ page }, testInfo) => {
    test.skip(!PAGES.home, `channel ${QA_CHANNEL} pins no home page in scripts/qa/pages.mjs`);
    await storefrontPage(page, 'home');
    await dismissCookieBanner(page);
    const file = path.join(ROOT, 'scripts', 'qa', 'results', 'live', BASELINE_SET, `home-${testInfo.project.name}.png`);
    await page.screenshot({
        path: file, fullPage: true, animations: 'disabled', caret: 'hide',
    });
    testInfo.annotations.push(shotAnnotation({
        kind: 'live',
        page: 'home',
        path: PAGES.home,
        project: testInfo.project.name,
        width: testInfo.project.use.viewport.width,
        channel: QA_CHANNEL,
        variation: QA_VARIATION,
        overlay: null,
        state: null,
        image: path.relative(ROOT, file).split(path.sep).join('/'),
    }));
});
