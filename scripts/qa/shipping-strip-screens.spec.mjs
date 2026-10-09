// The shipping strip's place and behaviour (ticket 27; spec module 2, O04; stories 67 and 68),
// checked on the widget's fixture page (W0-9), which renders widgets/shipping-strip from the
// fixture ReelFlies_CA gets, in header_bottom--global under the theme's own header ("chrome"),
// with this checkout's theme CSS. The store's copy is hidden in page baselines (W0-5's HIDDEN,
// in pages.mjs), so its place is checked here, from its source, and its look by
// widget-screens.spec.mjs's element shots.
//
// - It sits after the header, inside the "Shipping and prices" region landmark.
// - It shows one line at a time: the long one from 801px, the short one on phones.
// - It holds no link.
// - On phones it scrolls away under the 56px sticky bar, which stays at the top.
// - axe finds no serious or critical issue in it, and nothing in it is outside a landmark.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs shipping-strip-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { WIDGETS_DIR, widgetCases } from './render/render.mjs';
import { openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the strip renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const STRIP = widgetCases([WIDGETS_DIR]).find(({ widget, name }) => widget === 'shipping-strip' && name === 'default');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const PHONE_BAR = 56;
const desktop = testInfo => testInfo.project.name === 'desktop-1280';
const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
});

async function open(page) {
    const { widget, problems } = await openWidget(page, STRIP, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but the fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    return widget;
}

test.describe('the shipping strip (widgets/shipping-strip)', () => {
    test('sits after the header, inside the "Shipping and prices" region landmark', async ({ page }) => {
        const widget = await open(page);
        const landmark = page.getByRole('region', { name: 'Shipping and prices' });
        await expect(landmark).toHaveCount(1);
        expect(await landmark.evaluate((element, strip) => element.contains(strip), await widget.elementHandle())).toBe(true);
        expect(await widget.evaluate(element => element.closest('header'))).toBe(null);
        const order = await page.evaluate(() => {
            const header = document.querySelector('[data-rf-header]');
            const strip = document.querySelector('[data-rf-strip]');
            return Boolean(header.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING); // eslint-disable-line no-bitwise
        });
        expect(order, 'the strip follows the header').toBe(true);
    });

    test('shows the long line from 801px and the short one on phones, one at a time', async ({ page }, testInfo) => {
        await open(page);
        const long = page.locator('.rf-strip-line--long');
        const short = page.locator('.rf-strip-line--short');
        if (desktop(testInfo)) {
            await expect(long).toBeVisible();
            await expect(short).toBeHidden();
            await expect(long).toHaveText(STRIP.fixture.configuration.long_text);
        } else {
            await expect(short).toBeVisible();
            await expect(long).toBeHidden();
            await expect(short).toHaveText(STRIP.fixture.configuration.short_text);
        }
        const landmark = page.getByRole('region', { name: 'Shipping and prices' });
        await expect(landmark.getByRole('link')).toHaveCount(0);
    });

    test('scrolls away under the 56px phone bar, which stays at the top', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'from 801px the header scrolls away with the page too');
        const widget = await open(page);
        // The fixture page is short: give it room to scroll.
        await page.addStyleTag({ content: 'body { min-height: 3000px; }' });
        await page.evaluate(() => window.scrollTo(0, 0));
        const header = page.locator('[data-rf-header]');
        const before = await box(widget);
        expect((await box(header)).height).toBe(PHONE_BAR);
        expect(before.top, 'below the bar, not inside it').toBeGreaterThanOrEqual(PHONE_BAR - 1);
        await page.evaluate(() => window.scrollTo(0, 120));
        expect((await box(header)).top, 'the bar stays at the top').toBe(0);
        const after = await box(widget);
        expect(after.bottom, 'the strip has gone up under the bar').toBeLessThanOrEqual(PHONE_BAR);
        const topmost = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-rf-header]') !== null, { x: 187, y: Math.max(1, Math.floor(after.bottom) - 1) });
        expect(topmost, 'the bar covers it, not the other way round').toBe(true);
    });

    test('has no serious or critical axe issues, and nothing outside a landmark', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('[data-rf-strip-region]').withTags(TAGS).analyze();
        expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => violation.id)).toEqual([]);
        const region = await new AxeBuilder({ page }).withRules(['region']).analyze();
        const targets = region.violations.flatMap(violation => violation.nodes.map(node => node.target.join(' ')));
        const inStrip = await page.evaluate(list => list.filter(target => document.querySelector(target)?.closest('[data-rf-strip-region]')), targets);
        expect(inStrip).toEqual([]);
    });
});
