// The hook size chart page (ticket 35; spec module 22; stories 15, 16 and 71), at 375 and 1280,
// on the fixture page: the real chart page (pages/custom/page/hook-size-chart.html) round a draft
// of its copy and the rows scripts/hook-chart/rows.mjs writes from its fixtures
// (render/pages/hook-chart-page/), because the Web Page doesn't exist on ReelFlies_CA yet.
//
// - The page matches its baseline (widget baselines, declared as `widget hook-chart-page`).
// - One <main> and one <h1>; the gauge between the copy and the rows, every size a link to its
//   row, and following one lands on that row, tinted and clear of the sticky phone bar.
// - Each hook is drawn to one scale: a bigger hook is never drawn smaller than a smaller one.
// - Nothing scrolls sideways at 320 (story 71).
// - axe finds no serious or critical issue in the page's body.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs hook-chart-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the chart page renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const CHART = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'hook-chart-page' && name === 'chart');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

async function open(page) {
    const { problems } = await openWidget(page, CHART, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
}

test.describe('the hook size chart page (ticket 35)', () => {
    test('matches its baseline', async ({ page }) => {
        await open(page);
        await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
        await expect(page.locator('#main-content')).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'hook-chart-page-chart.png']);
    });

    test('has one <main> and one <h1>, and the gauge between the copy and the rows', async ({ page }) => {
        await open(page);
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveText('Fly Hook Size Chart');
        const [copy, gauge, rows] = await Promise.all(['.rf-chart-copy', '.rf-chart-gauge', '.rf-chart-rows'].map(selector => page.locator(selector).boundingBox()));
        expect(gauge.y).toBeGreaterThanOrEqual(copy.y + copy.height - 1);
        expect(rows.y).toBeGreaterThanOrEqual(gauge.y + gauge.height - 1);
    });

    test('draws each hook to one scale: a bigger hook is never drawn smaller (story 15)', async ({ page }) => {
        await open(page);
        const widths = await page.locator('.rf-hook-gauge__hook').evaluateAll(hooks => hooks.map(hook => hook.getBoundingClientRect().width));
        expect(widths).toHaveLength(19);
        widths.slice(1).forEach((width, index) => expect(width, `size ${index + 2} of 19`).toBeLessThanOrEqual(widths[index] + 0.5));
    });

    test('takes a gauge size to its row, tinted and clear of the header (story 16)', async ({ page }) => {
        await open(page);
        await page.locator('.rf-hook-gauge__link[href="#size-14"]').click();
        const row = page.locator('#size-14');
        await expect(row).toBeInViewport();
        const top = await row.evaluate(element => element.getBoundingClientRect().top);
        const header = await page.locator('[data-rf-header]').evaluate(element => element.getBoundingClientRect().bottom);
        expect(top, 'the row is below the sticky header').toBeGreaterThanOrEqual(Math.max(0, header) - 1);
        expect(await row.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    });

    test('scrolls nothing sideways at 320 (story 71)', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await open(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test('has no serious or critical axe issues', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('#main-content').withTags(TAGS).analyze();
        expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
});
