// Screenshot diffs of every pinned template at 375 and 1280 (spec Testing Decisions,
// seam 1; ticket 16), against the baselines in
// scripts/qa/baselines/<channel>-<variation>/. Live data is masked (masksFor in
// pages.mjs: LIVE_DATA on every page, plus the channel's own masks for that page), so the
// diffs don't fail on prices, stock, cart counts or catalogue changes. Content that could
// change a page's height is hidden instead, through a stylesheet (screenshotStyle in
// pages.mjs; W0-5): widgets and the cookie banner and bar on every page, and the boxes a
// channel holds at a fixed height, such as channel 1's related products.
//
// W0-8's render modes:
// - Every pin is shot, kind@name pins included (pages.mjs), each under its own key.
// - Each UI state in states.mjs is shot on the pins it names, at its projects, after it is
//   opened: as the viewport shows it, unless the state asks for the full page.
// - With QA_OVERLAY, every shot renders with that overlay (overlays.mjs), against baselines
//   carrying its name.
// A baseline is <key>[~<state>][+<overlay>]-<project>-<platform>.png (baselineName in pages.mjs).
//
// A missing baseline fails the run: a plain run never writes one (updateSnapshots in
// playwright.config.mjs), so a release can't pass on a set nobody has reviewed.
//
//   npm run qa:screens
//   npm run qa:screens -- --update-snapshots      # after a reviewed, intended change
//   QA_OVERLAY=rf_rise-off npm run qa:screens     # the overlay's shots, on QA_PORT + 10

import fs from 'fs';
import path from 'path';
import { baselineName, masksFor } from './pages.mjs';
import { UI_STATES, openState, statesFor } from './states.mjs';
import {
    BASELINE_SET, QA_CHANNEL, QA_OVERLAY, QA_VARIATION, ROOT,
} from './storefront.mjs';
import {
    PAGES, dismissCookieBanner, expect, hideWidgetsFromLoad, screenshotStylePath, storefrontPage, test,
} from './fixtures.mjs';
import { shotAnnotation, themeShot } from './review/manifest.mjs';

const OVERLAY = QA_OVERLAY || null;
const RUN = `QA_CHANNEL=${QA_CHANNEL} QA_VARIATION="${QA_VARIATION}"${OVERLAY ? ` QA_OVERLAY=${OVERLAY}` : ''}`;

function shot(template, pagePath, state = null) {
    const title = `${template} (${pagePath})${state ? ` with ${UI_STATES[state].description}` : ''}${OVERLAY ? ` under the overlay ${OVERLAY}` : ''} matches its baseline`;
    test(title, async ({ page }, testInfo) => {
        if (state) test.skip(!UI_STATES[state].projects.includes(testInfo.project.name), `${state} is shot at ${UI_STATES[state].projects.join(' and ')}`);
        const name = baselineName({ key: template, state, overlay: OVERLAY });
        const baseline = testInfo.snapshotPath(BASELINE_SET, name, { kind: 'screenshot' });
        // The review pages read every shot from scripts/qa/results/manifest.json (W0-10).
        testInfo.annotations.push(shotAnnotation(themeShot({
            template, pagePath, baseline, testInfo, channel: QA_CHANNEL, variation: QA_VARIATION, overlay: OVERLAY, state,
        })));
        if (testInfo.config.updateSnapshots === 'none' && !fs.existsSync(baseline)) {
            throw new Error(`there is no ${name.replace(/\.png$/, '')} baseline for channel ${QA_CHANNEL}, "${QA_VARIATION}" at ${testInfo.project.name}: ${path.relative(ROOT, baseline)} doesn't exist. `
                + `Make it with \`${RUN} npm run qa:screens -- --update-snapshots\`, then review the PNG and commit it.`);
        }

        await hideWidgetsFromLoad(page); // widgets never lay out, so they can't leave an offset (W0-5)
        await storefrontPage(page, template);
        await dismissCookieBanner(page);
        if (state) await openState(page, state);
        await expect(page).toHaveScreenshot([BASELINE_SET, name], {
            fullPage: state ? Boolean(UI_STATES[state].fullPage) : true,
            mask: masksFor(QA_CHANNEL, template).map(selector => page.locator(selector)),
            stylePath: screenshotStylePath(testInfo, QA_CHANNEL, template),
        });
    });
}

for (const [template, pagePath] of Object.entries(PAGES)) {
    shot(template, pagePath);
    for (const [state] of statesFor(template)) shot(template, pagePath, state);
}
