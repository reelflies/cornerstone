// Review renders (W0-10): pages shot as they render, with nothing masked or hidden, and no
// baseline to compare with. It is not a gate: no npm qa:* script runs it.
//
// - On ReelFlies_CA (1895766), the home page with its widgets, for section 6 of a checkpoint
//   page. Page baselines hide widget regions, so this is the one shot that shows them.
// - On reelflies.com (1855224), every page pinned for it in pages.mjs, for section 5: .com
//   has no baselines, so these are its renders. Run it once W0-6 has landed (cart writes
//   refused and analytics blocked on live channels):
//
//   npx playwright test --config scripts/qa/playwright.config.mjs review-live
//   QA_CHANNEL=1855224 QA_VARIATION='ReelFlies US' npx playwright test --config scripts/qa/playwright.config.mjs review-live
//
// Without QA_BASE_URL it renders this checkout's templates through stencil start, with the
// store's live data. With it (the prelaunch host, after W0-6; README "Review pages"), the
// build ReelFlies_CA runs. Shots go to scripts/qa/results/live/<channel>-<variation>/ and into
// the manifest. A channel with nothing to render (channel 1) is skipped.

import path from 'path';
import {
    BASELINE_SET, IS_LOCAL, QA_CHANNEL, QA_VARIATION, ROOT,
} from './storefront.mjs';
import {
    PAGES, dismissCookieBanner, storefrontPage, test,
} from './fixtures.mjs';
import { liveShot, reviewRenderPages, shotAnnotation } from './review/manifest.mjs';

const TEMPLATES = reviewRenderPages(QA_CHANNEL, PAGES);
const HOST_CHANNEL = '1895766';

if (!TEMPLATES.length) {
    test('review renders', () => {
        test.skip(true, `channel ${QA_CHANNEL} has no page to render for the review pages in scripts/qa/pages.mjs`);
    });
}

for (const template of TEMPLATES) {
    test(`${template} (${PAGES[template]}) as it renders, nothing masked`, async ({ page }, testInfo) => {
        test.skip(!IS_LOCAL && QA_CHANNEL !== HOST_CHANNEL, `QA_BASE_URL is the prelaunch host, which runs ReelFlies_CA (${HOST_CHANNEL}), not channel ${QA_CHANNEL}`);
        await storefrontPage(page, template);
        await dismissCookieBanner(page);
        const file = path.join(ROOT, 'scripts', 'qa', 'results', 'live', BASELINE_SET, `${template}-${testInfo.project.name}.png`);
        await page.screenshot({
            path: file, fullPage: true, animations: 'disabled', caret: 'hide',
        });
        testInfo.annotations.push(shotAnnotation(liveShot({
            template, pagePath: PAGES[template], image: file, testInfo, channel: QA_CHANNEL, variation: QA_VARIATION,
        })));
    });
}
