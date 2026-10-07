// A module that waits for a QA override (ticket 54a; SWITCHES' `query` in switches.mjs). Ticket
// 52's outside-Canada prompt shows only outside Canada, after the visitor's first interaction,
// and the runner's time zone (America/Toronto, playwright.config.mjs) vetoes it. So on a run with
// its switch on, such as the switch matrix's "rf_region_prompt on" row, every pinned page opens
// with the override that shows it (?rf_region=out) and gets that first interaction
// (fixtures.mjs, storefrontPage), and the row's screenshots, axe, reflow, motion and focus see
// the card. This spec checks both overrides on every pin, at 375 and 1280:
// - show: after the first interaction the module is on the page, and on a kind it never shows on
//   (the prompt: the cart) it isn't
// - hide (?rf_region=in): after the first interaction and HIDE_WAIT_MS more, no element carries
//   one of its markers, though its switch is on
// A run with no such switch on skips it, with the reason: every run until ticket 52 lands, and
// then every run but the one with rf_region_prompt on.
//
//   npm run qa:matrix
//   QA_OVERLAY=rf_region_prompt-on npx playwright test --config scripts/qa/playwright.config.mjs switch-query

import {
    PAGES, SWITCH_QUERY, SWITCH_VALUES, expect, pinPath, storefrontPage, test,
} from './fixtures.mjs';
import { MODULE_WAIT_MS } from './page-checks.mjs';
import { pageKind } from './pages.mjs';
import { QA_OVERLAY } from './storefront.mjs';
import {
    describeValues, queriedSwitches, switchQuery, withQuery,
} from './switches.mjs';

// How long a page opened with a hide override, or of a kind the module never shows on, is
// watched after the first interaction. The overrides replace the prompt's one lookup, so a card
// that wrongly shows does so at once (the lookup's own timeout is 1.5 s).
export const HIDE_WAIT_MS = 2000;

const QUERIED = queriedSwitches(SWITCH_VALUES);
const SKIP = `no switch that is on here waits for a QA override (${describeValues(SWITCH_VALUES)}; scripts/qa/switches.mjs, query)`;
const UNDER = QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : '';
const markersOn = (page, markers) => page.locator(markers.map(marker => `[${marker}]`).join(', ')).count();

for (const key of Object.keys(PAGES)) {
    const kind = pageKind(key);

    test(`${key} (${pinPath(key)})${UNDER}: a switched-on module that waits for a QA override shows with it`, async ({ page }, testInfo) => {
        test.skip(!QUERIED.length, SKIP);
        testInfo.annotations.push({ type: 'switch query', description: `?${SWITCH_QUERY} (${describeValues(SWITCH_VALUES)})` });
        await storefrontPage(page, key);
        if (QUERIED.some(({ notOn }) => notOn.includes(kind))) await page.waitForTimeout(HIDE_WAIT_MS);
        const problems = [];
        for (const {
            key: name, ticket, module, markers, notOn,
        } of QUERIED) {
            const found = await markersOn(page, markers); // eslint-disable-line no-await-in-loop
            if (notOn.includes(kind) && found) {
                problems.push(`${name} is on, and ${module} shows on the ${kind} page, where it never shows: ${found} element(s) carry ${markers.join(' or ')} (ticket ${ticket})`);
            } else if (!notOn.includes(kind) && !found) {
                problems.push(`${name} is on, and ${pinPath(key)} shows nothing of ${module}: no element carries ${markers[0]} within ${MODULE_WAIT_MS} ms of the first interaction (a Shift press), so this run's screenshots, axe, reflow, motion and focus never saw it (ticket ${ticket})`);
            }
        }
        expect(problems, `${key} with ?${SWITCH_QUERY} (${testInfo.project.name})${problems.length ? `: ${problems[0]}` : ''}`).toEqual([]);
    });

    test(`${key} (${PAGES[key]})${UNDER}: a switched-on module that waits for a QA override shows nothing with the one that hides it`, async ({ page }, testInfo) => {
        test.skip(!QUERIED.length, SKIP);
        const problems = [];
        for (const {
            key: name, ticket, module, markers, query,
        } of QUERIED) {
            const hidePath = withQuery(PAGES[key], switchQuery(SWITCH_VALUES, { hide: name }));
            testInfo.annotations.push({ type: 'switch query', description: hidePath });
            await storefrontPage(page, key, hidePath); // eslint-disable-line no-await-in-loop
            await page.waitForTimeout(HIDE_WAIT_MS); // eslint-disable-line no-await-in-loop
            const found = await markersOn(page, markers); // eslint-disable-line no-await-in-loop
            if (found) problems.push(`${name} is on, and ${hidePath} shows ${module}, which ?${query.hide} hides: ${found} element(s) carry ${markers.join(' or ')} (ticket ${ticket})`);
        }
        expect(problems, `${key} with each hide override (${testInfo.project.name})${problems.length ? `: ${problems[0]}` : ''}`).toEqual([]);
    });
}
