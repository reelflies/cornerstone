// Reflow at 320 (ticket 54a; spec story 71): no pinned template scrolls sideways at 320 CSS px,
// as a phone (phone-375, with its touch and mobile emulation) and as a desktop browser zoomed to
// 400% (desktop-1280), which is WCAG 1.4.10's case. Every pin is checked, kind@name pins
// included, and with QA_OVERLAY every page renders with that overlay (W0-8), as the switch
// matrix runs it (switch-matrix.mjs). page-checks.mjs has the check; page-checks.test.mjs proves
// it fails a page that scrolls sideways and passes one whose wide box a carousel clips.
//
//   npm run qa:reflow

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { inPage, overflowProblems } from './page-checks.mjs';
import { QA_OVERLAY } from './storefront.mjs';

export const REFLOW_VIEWPORT = { width: 320, height: 568 };

test.use({ viewport: REFLOW_VIEWPORT });

for (const [key, pagePath] of Object.entries(PAGES)) {
    test(`${key} (${pagePath})${QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : ''} doesn't scroll sideways at 320 wide`, async ({ page }, testInfo) => {
        await storefrontPage(page, key);
        await dismissCookieBanner(page);
        const result = await page.evaluate(inPage, { check: 'overflow' });
        testInfo.annotations.push({ type: 'reflow', description: `${result.scrollWidth} px of content at ${result.width} px` });
        expect(overflowProblems(result), `${key} at 320 wide (${testInfo.project.name})`).toEqual([]);
    });
}
