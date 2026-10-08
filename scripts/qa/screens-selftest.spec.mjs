// Proves the screenshot gate fails on a real change (ticket 16, story 77). It runs
// with every `npm run qa:screens`, using the same threshold settings as the template
// diffs (playwright.config.mjs), on a fixed page of coloured blocks that renders the
// same everywhere, so it needs no storefront data.
//
// - The unchanged page matches its baseline.
// - A changed region above the threshold fails the comparison.
// - A changed region below the threshold passes, so the threshold is what decides.
//
// It also proves the stylesheet the template diffs apply (W0-5), on a page of its own,
// with no baseline: see "the screenshot stylesheet" below. And that the widgets are out of the
// layout from the first one (hideWidgetsFromLoad): see "widgets hidden from load".

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import { expect, test } from '@playwright/test';
import { CHANNELS } from './pages.mjs';
import { dismissCookieBanner, hideWidgetsFromLoad, screenshotStylePath } from './fixtures.mjs';

const BASELINE = ['selftest', 'blocks.png'];
const COLOURS = ['#7b8e7a', '#5d705c', '#f4f1ea', '#2b2b2b', '#c9a227', '#ffffff'];

async function renderBlocks(page, change) {
    const blocks = COLOURS.map(colour => `<div style="height:100px;background:${colour}"></div>`).join('');
    const patch = change
        ? `<div style="position:absolute;left:20px;top:150px;width:${change.width}px;height:${change.height}px;background:#e4007c"></div>`
        : '';
    await page.setContent(`<!doctype html><body style="margin:0;position:relative">${blocks}${patch}</body>`);
}

// While --update-snapshots is rewriting baselines, a changed page would overwrite the
// baseline instead of failing against it, so the change checks wait for a normal run.
const updating = testInfo => !['none', 'missing'].includes(testInfo.config.updateSnapshots);

test.describe('screenshot self-test', () => {
    test('an unchanged page matches its baseline', async ({ page }) => {
        await renderBlocks(page, null);
        await expect(page).toHaveScreenshot(BASELINE);
    });

    test('a changed region above the threshold fails', async ({ page }, testInfo) => {
        test.skip(updating(testInfo), 'baselines are being rewritten');
        expect(fs.existsSync(testInfo.snapshotPath(...BASELINE, { kind: 'screenshot' })), 'the self-test baseline exists').toBe(true);

        await renderBlocks(page, { width: 200, height: 100 }); // 20,000 px, over 0.2% of either width's viewport
        await expect(expect(page).toHaveScreenshot(BASELINE)).rejects.toThrow(/pixels \(ratio [\d.]+ of all image pixels\) are different/);
    });

    test('a changed region below the threshold passes', async ({ page }, testInfo) => {
        test.skip(updating(testInfo), 'baselines are being rewritten');
        await renderBlocks(page, { width: 10, height: 10 }); // 100 px, under 0.2% of either width's viewport
        await expect(page).toHaveScreenshot(BASELINE);
    });
});

// The stylesheet every page's screenshot applies (screenshotStyle in pages.mjs, written by
// screenshotStylePath in fixtures.mjs; W0-5), tried on a product page in miniature: a widget
// region, the description, the related products' tab with its carousel, and the store's
// cookie banner, whose "Reject all" leaves a 48 px bar at the end of the page a moment
// later. The test decides when the bar appears (window.showBar), so it needs no timer.
//
// - Nothing the stylesheet hides or holds changes the shot: not the widget's height, not
//   the related cards' heights, and not whether the bar has appeared yet. The bar is what
//   made the channel-1 product shot fail once at 375x4101 against its 375x4149 baseline.
// - What it leaves alone still does: the description and the related section's heading.
test.describe('the screenshot stylesheet', () => {
    const product = ({
        widget = 80, cardLines = 2, description = 'A realistic hopper.', heading = 'Related Products',
    } = {}) => {
        const card = `<article class="card" style="flex:1;background:#c9a227">${'Card title line<br>'.repeat(cardLines)}</article>`;
        // The viewport meta, as on the storefront: without it, phone-375 lays the page out
        // 980 px wide and scales it down.
        return `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1">
            <body style="margin:0;font:16px/24px sans-serif">
            <header style="height:55px;background:#f4f1ea">Header</header>
            <div data-content-region="header_bottom--global"><div data-widget-id="w1" style="height:${widget}px;background:#7b8e7a"></div></div>
            <div class="productView-description" style="padding:10px"><p>${description}</p></div>
            <ul class="tabs" style="margin:0;padding:10px;list-style:none"><li class="tab is-active">${heading}</li></ul>
            <div class="tabs-contents">
                <div id="tab-related" class="tab-content is-active" style="padding:10px;background:#ffffff">
                    <section class="productCarousel" style="display:flex;gap:8px">${card.repeat(3)}</section>
                </div>
            </div>
            <footer style="height:1000px;background:#2b2b2b"></footer><!-- taller than the viewport, so the page's height shows in a full-page shot -->
            <div id="consent-manager" style="position:fixed;left:0;right:0;bottom:0;padding:20px;background:#333">
                <button type="button" onclick="document.getElementById('consent-manager').style.display = 'none'">Reject all</button>
            </div>
            <script>
                window.showBar = () => {
                    const bar = document.createElement('div');
                    bar.id = 'consent-manager-update-banner';
                    bar.style.cssText = 'height:48px;background:#5d705c';
                    document.body.appendChild(bar);
                };
            </script>
        </body></html>`;
    };

    const heightOf = png => png.readUInt32BE(20); // the IHDR height
    let style;
    test.beforeEach(async ({ page }, testInfo) => {
        style = fs.readFileSync(screenshotStylePath(testInfo, '1', 'product'), 'utf8');
        await page.setContent(product());
        await dismissCookieBanner(page);
    });
    const shot = (page, options = { style }) => page.screenshot({
        fullPage: true, animations: 'disabled', caret: 'hide', scale: 'css', ...options,
    });

    test('a shot taken before the cookie bar appears matches one taken after it', async ({ page }) => {
        const [before, unstyledBefore] = [await shot(page), await shot(page, {})];
        await page.evaluate(() => window.showBar());
        const [after, unstyledAfter] = [await shot(page), await shot(page, {})];

        expect(heightOf(unstyledAfter), 'without the stylesheet the bar adds its 48 px').toBe(heightOf(unstyledBefore) + 48);
        expect(after.equals(before), 'the shots with the stylesheet are the same').toBe(true);
    });

    test('a taller widget and taller related cards leave the shot as it was', async ({ page }) => {
        const before = await shot(page);
        await page.setContent(product({ widget: 240, cardLines: 4 }));
        await dismissCookieBanner(page);
        await page.evaluate(() => window.showBar());

        expect(heightOf(await shot(page, {})), 'without the stylesheet the page is taller').toBeGreaterThan(heightOf(before));
        expect((await shot(page)).equals(before), 'the shots with the stylesheet are the same').toBe(true);
    });

    test('holds the related carousel at its fixed height and takes the widget out of the layout', async ({ page }) => {
        await page.addStyleTag({ content: style });
        const [carousel, widget] = await page.evaluate(() => [
            document.querySelector('#tab-related .productCarousel').getBoundingClientRect().height,
            getComputedStyle(document.querySelector('[data-widget-id]')).display,
        ]);
        expect(carousel).toBe(CHANNELS[1].hold.product['#tab-related .productCarousel']);
        expect(widget).toBe('none');
    });

    for (const [what, change] of [['the description', { description: 'A realistic hopper.<br>Now with a second line.' }], ['the related section\'s heading', { heading: 'Related patterns' }]]) {
        test(`still shows a change to ${what}`, async ({ page }) => {
            const before = await shot(page);
            await page.setContent(product(change));
            await dismissCookieBanner(page);
            expect((await shot(page)).equals(before)).toBe(false);
        });
    }
});

// Widgets are taken out of the layout from the first one, not only when the screenshot is taken
// (W0-5; #63's rf/skeptic): a page that lays out with a widget in it and then hides it can keep a
// sub-pixel offset further down, which moved eight of 1895766's footer lines by 1px once its home
// widgets went active. The page records what its widget looked like as its own parser reached it.
test.describe('widgets hidden from load', () => {
    const URL = 'https://selftest.invalid/widgets-from-load/';
    const html = `<!doctype html><html lang="en"><body style="margin:0">
        <div data-content-region="home_below_menu"><div data-widget-id="w1" style="height:690.344px;background:#7b8e7a"></div></div>
        <script>window.seen = { display: getComputedStyle(document.querySelector('[data-widget-id]')).display };</script>
        <footer style="height:100px;background:#2f382f">Footer</footer></body></html>`;

    test('a widget is already out of the layout when the page\'s own script first reads it', async ({ page }) => {
        await page.route(URL, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
        await hideWidgetsFromLoad(page);
        await page.goto(URL);
        expect(await page.evaluate(() => window.seen.display)).toBe('none');
        expect(await page.evaluate(() => document.querySelector('footer').getBoundingClientRect().top)).toBe(0);
    });

    test('without it, the same page lays the widget out first (what the shots used to start from)', async ({ page }) => {
        await page.route(URL, route => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
        await page.goto(URL);
        expect(await page.evaluate(() => window.seen.display)).toBe('block');
    });
});
