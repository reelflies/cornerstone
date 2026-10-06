// Playwright for the storefront gates (ticket 16): axe, screenshot diffs and the
// Quick view check. Run them through the npm scripts (scripts/qa/README.md):
//
//   npm run qa:axe
//   npm run qa:screens                       # add -- --update-snapshots to rewrite baselines
//   npm run qa:quick-view
//
// Specs are *.spec.mjs, which neither Jest nor `npm run test:scripts` picks up, and
// none of this runs in CI, which has no store credentials. Without QA_BASE_URL the
// run reuses the `stencil start` on port 3301, or starts one (scripts/qa/storefront.mjs).
// With QA_FRESH_SERVER=1 (release.sh) it never reuses one: it starts its own, and stops
// before that if anything already answers on 3300 or 3301.

import { defineConfig } from '@playwright/test';
import {
    BASE_URL, FRESH_SERVER, HEADERS, IS_LOCAL, READY_URL, ROOT, START_COMMAND, checkEnv, planLocalServer, previewCookies,
} from './storefront.mjs';

checkEnv();

// The webServer starts before globalSetup, so the ports are checked here, once, by the
// runner. Each worker loads this config again while the server is up, and skips the check
// through the RF_QA_PORTS_CHECKED it inherits.
if (IS_LOCAL && FRESH_SERVER && !process.env.RF_QA_PORTS_CHECKED) {
    await planLocalServer();
    process.env.RF_QA_PORTS_CHECKED = '1';
}

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.mjs',
    outputDir: 'results/output',
    // Baselines: scripts/qa/baselines/<channel>-<variation>/<template>-<width>-<platform>.png
    snapshotPathTemplate: '{testDir}/baselines/{arg}-{projectName}-{platform}{ext}',
    globalSetup: './global-setup.mjs',
    fullyParallel: true,
    workers: 3,
    retries: 0,
    timeout: 90000,
    // The manifest reporter writes results/manifest.json for the review pages (W0-10).
    reporter: [['list'], ['html', { outputFolder: 'results/report', open: 'never' }], ['./review/manifest-reporter.mjs']],
    // A missing baseline fails instead of being written, so no run can make one that every
    // later run then passes unreviewed. `-- --update-snapshots` writes them on purpose.
    updateSnapshots: 'none',
    expect: {
        timeout: 15000,
        toHaveScreenshot: {
            // A pixel counts as changed when its colour moves more than `threshold`
            // (0 to 1, Playwright's default). The run fails when more than
            // maxDiffPixelRatio of the image's pixels change: 0.2%, about an 88 px
            // square on a 1280 x 3000 page. screens-selftest.spec.mjs proves it.
            threshold: 0.2,
            maxDiffPixelRatio: 0.002,
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
        },
    },
    use: {
        baseURL: BASE_URL,
        locale: 'en-CA',
        timezoneId: 'America/Toronto',
        extraHTTPHeaders: HEADERS,
        // A trace records every request's headers, the Cookie header too, so a run that
        // sends the prelaunch preview cookie keeps none: it would sit in results/.
        trace: previewCookies().length ? 'off' : 'retain-on-failure',
    },
    projects: [
        { name: 'phone-375', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
        { name: 'desktop-1280', use: { viewport: { width: 1280, height: 800 } } },
    ],
    webServer: IS_LOCAL ? {
        command: START_COMMAND,
        url: READY_URL,
        cwd: ROOT,
        // Reused only when it renders QA_CHANNEL and QA_VARIATION (global-setup.mjs).
        reuseExistingServer: !FRESH_SERVER,
        timeout: 180000,
        stdout: 'ignore',
        stderr: 'pipe',
    } : undefined,
});
