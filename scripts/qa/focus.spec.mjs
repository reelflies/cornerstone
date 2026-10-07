// The focus tab-through (ticket 54a; spec story 67): on the product page and the cart at 375, a
// keyboard user tabs from the top of the page to the end, and no element that takes focus is
// covered by a fixed or sticky box (the sticky header, the sticky bars of tickets 38 and 41, or
// the outside-Canada prompt card of ticket 52). Covered means elementFromPoint at the focused
// element's centre finds a fixed or sticky box that doesn't hold the element.
//
// - Every product and cart pin is checked, kind@name pins included. A channel that pins neither
//   kind (ReelFlies_CA has no product page until refactor 14) checks what it has.
// - What it sees but doesn't fail (a focused element with no visible box, one off screen, one
//   that another element lies over) is noted on the test, for ticket 55's keyboard pass.
// - With QA_OVERLAY every page renders with that overlay (W0-8), as the switch matrix runs it.
// - The prompt card shows only on a run with rf_region_prompt on, which opens each page with
//   ?rf_region=out and makes the first interaction (fixtures.mjs, storefrontPage; the runner's
//   Canadian time zone vetoes the card otherwise). It shows on the product page and never on the
//   cart, so it is checked here once ticket 52 lands, in the matrix's "rf_region_prompt on" row.
// page-checks.mjs has the check; page-checks.test.mjs proves it on a fixed header.
//
//   npm run qa:focus

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { focusNotes, focusProblems, tabThrough } from './page-checks.mjs';
import { pageKind } from './pages.mjs';
import { QA_OVERLAY } from './storefront.mjs';

export const FOCUS_KINDS = ['product', 'cart'];
export const FOCUS_PROJECT = 'phone-375';

for (const [key, pagePath] of Object.entries(PAGES).filter(([pin]) => FOCUS_KINDS.includes(pageKind(pin)))) {
    test(`${key} (${pagePath})${QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : ''}: no focused element is covered by a fixed or sticky box`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== FOCUS_PROJECT, `the tab-through runs at 375 (${FOCUS_PROJECT})`);
        // The tab-through presses Tab a few hundred times on a long page.
        test.setTimeout(180000);
        await storefrontPage(page, key);
        await dismissCookieBanner(page);
        const { steps, end } = await tabThrough(page);
        testInfo.annotations.push({ type: 'tab-through', description: `${steps.length} focused elements; ${end}` });
        focusNotes(steps).forEach(note => testInfo.annotations.push({ type: 'focus note', description: note }));
        expect(steps.length, `Tab reached no element on ${key}`).toBeGreaterThan(0);
        const problems = focusProblems(steps);
        expect(problems, `${key} at 375${problems.length ? `: ${problems.length} covered, first ${problems[0]}` : ''}`).toEqual([]);
    });
}
