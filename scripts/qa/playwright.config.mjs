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

import { defineConfig } from '@playwright/test';
import {
    BASE_URL, IS_LOCAL, READY_URL, ROOT, START_COMMAND, checkEnv, previewCookies,
} from './storefront.mjs';

checkEnv();

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
    reporter: [['list'], ['html', { outputFolder: 'results/report', open: 'never' }]],
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
        extraHTTPHeaders: { 'Accept-Language': 'en-CA,en;q=0.9' },
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
        reuseExistingServer: true,
        timeout: 180000,
        stdout: 'ignore',
        stderr: 'pipe',
    } : undefined,
});
