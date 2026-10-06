// Playwright for the storefront gates (ticket 16): axe, screenshot diffs and the
// Quick view check. Run them through the npm scripts (scripts/qa/README.md):
//
//   npm run qa:axe
//   npm run qa:screens                       # add -- --update-snapshots to rewrite baselines
//   npm run qa:quick-view
//
// Specs are *.spec.mjs, which neither Jest nor `npm run test:scripts` picks up, and
// none of this runs in CI, which has no store credentials. Without QA_BASE_URL the
// run reuses the `stencil start` on port QA_PORT + 1 (3301 by default), or starts one on
// QA_PORT (scripts/qa/storefront.mjs). With QA_FRESH_SERVER=1 (release.sh) it never reuses
// one: it starts its own, and stops before that if anything already answers on either port.

import { defineConfig } from '@playwright/test';
import {
    BASE_URL, FRESH_SERVER, HEADERS, IS_LOCAL, QA_OVERLAY, READY_URL, START_COMMAND, checkEnv, claimLocalServer, previewCookies, startOverlayCheckout, themeDir,
} from './storefront.mjs';

checkEnv();

// The webServer starts before globalSetup, so the runner claims the server here, once: it
// waits for its port pair's lock, checks the ports (QA_FRESH_SERVER=1 stops while anything
// answers on them), and takes a stencil start slot when it will start a server. It holds
// both until it exits (W0-7). With QA_OVERLAY it then makes the overlay's throwaway worktree,
// which the webServer starts in and which goes when the runner exits (W0-8). Each worker loads
// this config again while the server is up, and skips this through the RF_QA_PORTS_CHECKED
// and RF_QA_THEME_DIR it inherits.
if (IS_LOCAL && !process.env.RF_QA_PORTS_CHECKED) {
    await claimLocalServer();
    if (QA_OVERLAY) process.env.RF_QA_THEME_DIR = startOverlayCheckout().dir;
    process.env.RF_QA_PORTS_CHECKED = '1';
}

export default defineConfig({
    testDir: '.',
    testMatch: '*.spec.mjs',
    outputDir: 'results/output',
    // Baselines: scripts/qa/baselines/<channel>-<variation>/<key>[~<state>][+<overlay>]-<project>-<platform>.png
    // (baselineName in pages.mjs names the part before the project, W0-8).
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
        // This checkout, or the overlay's worktree.
        cwd: themeDir(),
        // Reused only when it renders QA_CHANNEL, QA_VARIATION and no overlay
        // (global-setup.mjs); never for a release or an overlay run.
        reuseExistingServer: !FRESH_SERVER && !QA_OVERLAY,
        timeout: 180000,
        stdout: 'ignore',
        stderr: 'pipe',
    } : undefined,
});
