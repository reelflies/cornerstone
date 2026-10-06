// Shoots the reference design's storefront screens at 375 and 1280, for the review pages
// (W0-10), in the same run as the theme's screenshots: its name matches `npm run
// qa:screens`'s filter. Nothing here is a baseline or a gate. The shots go to
// scripts/qa/results/reference/<anchor>-<project>.png and into the manifest.
//
// - The page is plan/design/reelflies-reference.html (review/reference.mjs finds it), opened
//   from a local file inside the document claude.ai publishes it in.
// - Before any shot, its Options are set as REFERENCE_SETTINGS says: "Heading face" Onest and
//   the fly-type links row off (reference.src.html:1995-1996), sage buy buttons, a visitor in
//   Canada and no build notes. The review bar above the store is hidden.
// - Each screen is the store frame alone (#frame): 1280 px wide on desktop, 375 on a phone.
// - Where the page isn't (CI, another machine), the test is skipped. QA_REFERENCE_HTML points
//   at another copy.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { test } from '@playwright/test';
import { shotAnnotation } from './review/manifest.mjs';
import {
    REFERENCE_ANCHORS, REFERENCE_SETTINGS, ROOT, findReferenceHtml, referenceViewport, wrapReference,
} from './review/reference.mjs';

const SOURCE = findReferenceHtml();
const OUT = path.join(ROOT, 'scripts', 'qa', 'results', 'reference');
const relative = file => path.relative(ROOT, file).split(path.sep).join('/');

// Waits for the screen's rendering, fonts and images. Lazy images are loaded at once, and
// only images that render count: those in the hidden screens never load.
async function settle(page) {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); }));
    await page.evaluate(() => Promise.race([
        Promise.all([...document.querySelectorAll('#frame img')]
            .filter(image => image.getClientRects().length)
            .map(image => {
                image.loading = 'eager'; // eslint-disable-line no-param-reassign
                return image;
            })
            .filter(image => !image.complete)
            .map(image => new Promise(resolve => {
                image.addEventListener('load', resolve);
                image.addEventListener('error', resolve);
            }))),
        new Promise(resolve => { setTimeout(resolve, 10000); }),
    ]));
    await page.waitForTimeout(300);
}

test.describe('reference screens for the review pages', () => {
    test.skip(!SOURCE, 'the reference page (plan/design/reelflies-reference.html) isn\'t on this machine; QA_REFERENCE_HTML can point at a copy');

    test('shoots every storefront screen of the reference design', async ({ page }, testInfo) => {
        const { width } = testInfo.project.use.viewport;
        const project = testInfo.project.name;
        const body = fs.readFileSync(SOURCE, 'utf8');
        const sourceSha256 = crypto.createHash('sha256').update(body).digest('hex');
        fs.mkdirSync(OUT, { recursive: true });
        // One copy per project, since the projects run in parallel workers.
        const wrapped = path.join(OUT, `reference-${project}.html`);
        fs.writeFileSync(wrapped, wrapReference(body));

        await page.setViewportSize(referenceViewport(width));
        await page.goto(`${pathToFileURL(wrapped).href}#home`, { waitUntil: 'load' });
        await page.addStyleTag({ content: '.rb{display:none!important}' });
        await page.evaluate(({ settings, frameWidth }) => {
            for (const [id, value] of Object.entries(settings)) {
                const control = document.getElementById(id);
                if (!control) throw new Error(`the reference page has no #${id} control any more; update REFERENCE_SETTINGS in scripts/qa/review/reference.mjs`);
                if (control.type === 'checkbox') control.checked = value;
                else control.value = value;
                control.dispatchEvent(new Event('change', { bubbles: true }));
            }
            if (typeof window.setWidth === 'function') window.setWidth(String(frameWidth));
        }, { settings: REFERENCE_SETTINGS, frameWidth: width > 640 ? 1280 : 375 });

        for (const anchor of REFERENCE_ANCHORS) {
            await page.evaluate(hash => { window.location.hash = hash; }, anchor.hash); // eslint-disable-line no-await-in-loop
            await page.locator(`#frame [data-screen="${anchor.screen}"]`).waitFor({ state: 'visible' }); // eslint-disable-line no-await-in-loop
            await settle(page); // eslint-disable-line no-await-in-loop
            const file = path.join(OUT, `${anchor.id}-${project}.png`);
            await page.locator('#frame').screenshot({ path: file, animations: 'disabled', caret: 'hide' }); // eslint-disable-line no-await-in-loop
            testInfo.annotations.push(shotAnnotation({
                kind: 'reference',
                anchor: anchor.id,
                screen: anchor.screen,
                hash: anchor.hash,
                project,
                width,
                image: relative(file),
                source: SOURCE,
                sourceSha256,
                settings: REFERENCE_SETTINGS,
            }));
        }
    });
});
