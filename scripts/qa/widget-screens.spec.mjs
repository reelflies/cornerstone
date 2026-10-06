// Element screenshots of every widget, rendered from its fixtures (W0-9; scripts/qa/README.md,
// "Fixture renders"), at 375 and 1280, against the baselines in
// scripts/qa/baselines/widgets/<variation>/. Page baselines hide widget regions, because a
// widget placed on the store would change every page's height; each widget is checked here
// instead, from its source. So a widget's baseline changes in the same commit as its template
// or the theme CSS it uses, and never with the store's state.
//
// Its name ends in "screens", so `npm run qa:screens`, and so `qa:prepush` and release.sh, run
// it with the page shots, with the same thresholds (playwright.config.mjs). It reads no store
// data: the page is rendered from the fixture and the theme CSS compiled from this checkout,
// for QA_VARIATION.
//
//   npm run qa:screens
//   npx playwright test --config scripts/qa/playwright.config.mjs widget-screens   # these only
//
// After a reviewed, intended change, rewrite the widget baselines only. `npm run qa:screens --
// --update-snapshots` would rewrite every drifted page baseline too (build pipeline 6.6):
//
//   npx playwright test --config scripts/qa/playwright.config.mjs widget-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { QA_VARIATION, ROOT, slug } from './storefront.mjs';
import { WIDGETS_DIR, themeConfig, widgetCases } from './render/render.mjs';
import { SELFTEST_WIDGETS, openWidget } from './render/widget-page.mjs';

const shotName = ({ widget, name }) => ['widgets', slug(QA_VARIATION), `${widget}-${name}.png`];
const baselinePath = (testInfo, widgetCase) => testInfo.snapshotPath(...shotName(widgetCase), { kind: 'screenshot' });

for (const widgetCase of widgetCases([WIDGETS_DIR, SELFTEST_WIDGETS]).filter(({ shot }) => shot)) {
    const { widget, name, file } = widgetCase;
    test(`widget ${widget} (${name}) matches its baseline`, async ({ page }, testInfo) => {
        const baseline = baselinePath(testInfo, widgetCase);
        if (testInfo.config.updateSnapshots === 'none' && !fs.existsSync(baseline)) {
            throw new Error(`there is no baseline for the widget ${widget}'s fixture ${path.relative(ROOT, file)} with "${QA_VARIATION}" at ${testInfo.project.name}: ${path.relative(ROOT, baseline)} doesn't exist. `
                + `Make it with \`QA_VARIATION="${QA_VARIATION}" npx playwright test --config scripts/qa/playwright.config.mjs widget-screens --update-snapshots\`, `
                + 'which rewrites widget baselines only, then review the PNG and commit it with the widget.');
        }

        const { widget: element, problems } = await openWidget(page, widgetCase, { variation: QA_VARIATION });
        expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and the theme\'s fonts').toEqual([]);
        await expect(element).toHaveScreenshot(shotName(widgetCase));
    });
}

// Proves the widget shots check what they claim. The self-test widget's own baseline is
// checked by the loop above, so an unchanged widget matching it is already proven.
// While --update-snapshots is rewriting baselines, a changed widget would overwrite the
// baseline instead of failing against it, so the change check waits for a normal run. With
// no baseline yet, --update-snapshots=missing would write the changed widget as the baseline,
// so the change check waits for one too (the loop above reports it missing).
const updating = testInfo => !['none', 'missing'].includes(testInfo.config.updateSnapshots);
const selftest = () => widgetCases([SELFTEST_WIDGETS]).find(({ name }) => name === 'default');
// The self-test widget with a different background or product photo URL.
const selftestWith = ({ background, image }) => {
    const widgetCase = structuredClone(selftest());
    if (background) widgetCase.fixture.configuration.background = background;
    if (image) widgetCase.fixture.data.site.product.defaultImage.url = image;
    return widgetCase;
};
const rgb = hex => `rgb(${hex.match(/[0-9a-f]{2}/gi).map(pair => parseInt(pair, 16)).join(', ')})`;

test.describe('widget shot self-test', () => {
    test('the theme CSS, with the variation\'s settings, styles the widget', async ({ page }) => {
        const { widget, problems } = await openWidget(page, selftest(), { variation: QA_VARIATION });
        expect(problems).toEqual([]);
        const expected = themeConfig(QA_VARIATION).settings['button--primary-backgroundColor'];
        await expect(widget.locator('.button--primary')).toHaveCSS('background-color', rgb(expected));
        const rules = await page.evaluate(() => [...document.styleSheets].find(sheet => sheet.href?.endsWith('/assets/css/theme.css'))?.cssRules.length ?? 0);
        expect(rules, 'theme.css loaded with its rules').toBeGreaterThan(1000);
    });

    test('a changed widget fails its baseline', async ({ page }, testInfo) => {
        test.skip(updating(testInfo), 'baselines are being rewritten');
        test.skip(!fs.existsSync(baselinePath(testInfo, selftest())), 'the self-test widget has no baseline yet for this variation');
        const { widget } = await openWidget(page, selftestWith({ background: '#e4007c' }), { variation: QA_VARIATION });
        await expect(expect(widget).toHaveScreenshot(shotName(selftest()))).rejects.toThrow(/pixels \(ratio [\d.]+ of all image pixels\) are different/);
    });

    test('a request outside the fixture is blocked and fails the shot', async ({ page }) => {
        const url = 'https://reelflies.ca/product_images/fly.svg';
        const { problems } = await openWidget(page, selftestWith({ image: url }), { variation: QA_VARIATION });
        expect(problems).toEqual([expect.stringMatching(new RegExp(`^blocked ${url.replace(/[.]/g, '\\.')}`))]);
    });

    test('a fixture file that isn\'t there fails the shot', async ({ page }) => {
        const url = 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/320w/products/5663/20001/no-such-photo.jpg';
        const { problems } = await openWidget(page, selftestWith({ image: url }), { variation: QA_VARIATION });
        expect(problems).toEqual([expect.stringMatching(/no-such-photo\.jpg answered 404: put the file in scripts\/qa\/render\/selftest\/widgets\/rf-selftest\/fixtures\/files\//)]);
    });
});
