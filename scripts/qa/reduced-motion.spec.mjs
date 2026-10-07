// Reduced motion (ticket 54a; spec story 69): with prefers-reduced-motion: reduce emulated, no
// animation runs and no transition would, on every pinned template at 375 and 1280, even when the
// cart count goes up, which is when the rise ring plays (ticket 27; spec module 19).
//
// - After the page loads, it sends what an add sends (bumpCart in page-checks.mjs: the stock
//   cart-quantity-update and rf:cart-changed, build pipeline 6.9), then checks that no animation
//   longer than MOTION_LIMIT_MS is running: CSS animations and transitions, and script animations.
// - Then that no element, ::before or ::after declares a transition or an animation longer than
//   that, and that nothing scrolls smoothly. That is how a global reduced-motion reset (ticket
//   25, spec module 1) shows, and it covers the hover and focus transitions no test triggers.
//
// Stock Cornerstone has no reset, so this fails on every page until ticket 25's skin adds it.
// With QA_OVERLAY every page renders with that overlay (W0-8), as the switch matrix runs it.
//
//   npm run qa:motion

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import {
    MOTION_LIMIT_MS, inPage, motionProblems, settle,
} from './page-checks.mjs';
import { QA_OVERLAY } from './storefront.mjs';

test.use({ reducedMotion: 'reduce' });

for (const [key, pagePath] of Object.entries(PAGES)) {
    test(`${key} (${pagePath})${QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : ''} runs and declares no motion under reduced motion`, async ({ page }, testInfo) => {
        await storefrontPage(page, key);
        await dismissCookieBanner(page);
        const bump = await page.evaluate(inPage, { check: 'bumpCart' });
        testInfo.annotations.push({ type: 'cart count', description: `${bump.from} to ${bump.to}, ${bump.stock ? 'with' : 'without'} the stock cart-quantity-update` });
        await settle(page);
        const running = await page.evaluate(inPage, { check: 'animations', limitMs: MOTION_LIMIT_MS });
        const declared = await page.evaluate(inPage, { check: 'motion', limitMs: MOTION_LIMIT_MS });
        expect(motionProblems({ running, declared }), `${key} under reduced motion (${testInfo.project.name})`).toEqual([]);
    });
}
