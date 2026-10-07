// Stock markup with a switch off (ticket 54a; spec stories 35 and 73, "Server-side switches"): on
// every pinned page, at 375 and 1280, nothing of a module whose switch is off in this run is on
// the page once it has loaded. No element carries one of the module's markers, and the page
// loaded none of its chunks. And the stock markup the module replaces or guards is there: each
// selector its entry names for the page's kind matches (SWITCHES in switches.mjs, which each
// module ticket fills in: markers, chunks and stock).
//
// A run's switches are config.json's for QA_VARIATION, with QA_OVERLAY's on top, so the plain run
// checks the switches its variation turns off (rf_region_prompt in ReelFlies CA), and each row of
// the switch matrix (switch-matrix.mjs) checks the one its overlay turns off, such as
// QA_OVERLAY=rf_quick_add-off. With the switch on, the module's own specs check what it shows.
//
//   QA_OVERLAY=rf_quick_add-off npx playwright test --config scripts/qa/playwright.config.mjs switch-stock
//   npm run qa:matrix      # every switch, on and off

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { pageKind } from './pages.mjs';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import {
    chunkRequested, describeValues, offSwitches, readSwitchValues, stockSelectors,
} from './switches.mjs';

const VALUES = readSwitchValues({ variation: QA_VARIATION, overlay: QA_OVERLAY });
const OFF = offSwitches(VALUES);
const CHECKED = OFF.filter(({ markers, chunks, stock }) => markers.length || chunks.length || Object.keys(stock).length);

for (const [key, pagePath] of Object.entries(PAGES)) {
    test(`${key} (${pagePath})${QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : ''} shows nothing of a module whose switch is off`, async ({ page }, testInfo) => {
        testInfo.annotations.push({ type: 'switches', description: describeValues(VALUES) });
        test.skip(!CHECKED.length, `no switch that is off here names its markers, chunks or stock markup yet (${OFF.map(({ key: name }) => name).join(', ') || 'none is off'}; scripts/qa/switches.mjs)`);
        const requested = [];
        page.on('request', request => requested.push(request.url()));
        await storefrontPage(page, key);
        await dismissCookieBanner(page);

        const problems = [];
        for (const entry of CHECKED) {
            const {
                key: name, ticket, module, markers, chunks,
            } = entry;
            for (const marker of markers) {
                const found = await page.locator(`[${marker}]`).count(); // eslint-disable-line no-await-in-loop
                if (found) problems.push(`${name} is off, and ${found} element(s) carry ${marker}: ${module} must leave the stock markup with its switch off (ticket ${ticket})`);
            }
            for (const chunk of chunks) {
                const url = requested.find(requestUrl => chunkRequested(chunk, requestUrl));
                if (url) problems.push(`${name} is off, and the page loaded ${module}'s script ${new URL(url).pathname} (ticket ${ticket})`);
            }
            for (const selector of stockSelectors(entry, pageKind(key))) {
                const found = await page.locator(selector).count(); // eslint-disable-line no-await-in-loop
                if (!found) problems.push(`${name} is off, and nothing on the page matches ${selector}, the stock markup ${module} must leave on a ${pageKind(key)} page with its switch off (ticket ${ticket})`);
            }
        }
        expect(problems, `${key} with ${OFF.map(({ key: name }) => name).join(', ')} off (${testInfo.project.name})${problems.length ? `: ${problems[0]}` : ''}`).toEqual([]);
    });
}
