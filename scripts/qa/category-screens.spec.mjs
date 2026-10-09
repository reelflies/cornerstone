// The Fly Type and Species pages (ticket 32; spec module 8; O10, UX-5, CD-6, CD-10; stories 20,
// 21, 22, 27, 70 and 71), at 375 and 1280, on the fixture page: the real category page rendered
// round tree-4-shaped data (render/pages/category-page/), a Fly Type page and a Species page,
// with the theme's header and footer and channel 1's own category images. ReelFlies_CA has no
// tree-4 categories until refactor 13, and the live category pins mask their grids, so the
// templates' look is checked here; category.spec.mjs checks the live channel-1 pins.
//
// - Each page matches its baseline (widget baselines, declared as `widget category-page`).
// - The banner: eager with fetchpriority="high", no taller than 220px from 801px, with the H1 and
//   the intro on it; on phones the photo first, then the H1 and the intro. Every line of text on
//   it holds 4.5:1 against its lightest pixel (photo-contrast.mjs).
// - The chips: at most two rows, with "+N more" at 1280 and "Show all N" at 375 when some are
//   hidden; every chip's link in the page; the "more" chip shows them all. A chip has a
//   thumbnail only where its subcategory has an image. Nothing scrolls sideways at 320.
// - The first row of products: its photos whole at 1366x768, and starting within the first
//   screen at 375x667 (stories 20 and 21).
// - axe finds no serious or critical issue in the page's body.
//
// The fixture page loads no theme bundle, so the spec runs the real category-chips.js in the
// page: it has no imports, so its source goes in as a classic script, its exports dropped.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs category-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { THEME_DIR, widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';

test.skip(Boolean(QA_OVERLAY), `the category page renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const CASES = widgetCases([PAGE_FIXTURES]).filter(({ widget, shot }) => widget === 'category-page' && shot);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const CHIPS_SOURCE = fs.readFileSync(path.join(THEME_DIR, 'assets/js/theme/reelflies/category-chips.js'), 'utf8')
    .replace(/^export default /m, 'const chipsModule = ')
    .replace(/^export /gm, '');
const phone = testInfo => testInfo.project.name === 'phone-375';

async function open(page, fixture) {
    const { problems } = await openWidget(page, fixture, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    await page.addScriptTag({ content: `${CHIPS_SOURCE}\nchipsModule.load({}, document);` });
    await expect(page.locator('[data-rf-chips]')).toHaveAttribute('data-rf-chips-ready', '');
    for (const img of await page.locator('#main-content img:not([loading="lazy"]), .rf-chip-image').all()) {
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    await page.evaluate(() => window.scrollTo(0, 0));
}

for (const fixture of CASES) {
    test.describe(`the category page: ${fixture.name} (ticket 32)`, () => {
        test('matches its baseline', async ({ page }) => {
            await open(page, fixture);
            for (const img of await page.locator('.card-image').all()) {
                await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
                await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
            }
            // The phone header is sticky, and would cover the page's top in an element shot.
            await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
            await page.evaluate(() => window.scrollTo(0, 0));
            await expect(page.locator('#main-content')).toHaveScreenshot(['widgets', slug(QA_VARIATION), `category-page-${fixture.name}.png`]);
        });

        test('shows the banner: eager and high priority, at most 220px tall from 801px, with the H1 and the intro on it (story 21)', async ({ page }, testInfo) => {
            await open(page, fixture);
            const banner = page.locator('.rf-listing-banner');
            await expect(banner).toHaveAttribute('fetchpriority', 'high');
            expect(await banner.getAttribute('loading')).toBeNull();
            const box = await banner.boundingBox();
            const copy = await page.locator('.rf-listing-header .rf-listing-copy').boundingBox();
            if (phone(testInfo)) {
                expect(copy.y, 'the H1 and the intro under the photo').toBeGreaterThanOrEqual(box.y + box.height - 1);
            } else {
                expect(Math.round(box.height)).toBe(220);
                expect(copy.y, 'the copy on the photo').toBeGreaterThanOrEqual(box.y - 1);
                expect(copy.y + copy.height).toBeLessThanOrEqual(box.y + box.height + 1);
                for (const selector of ['.rf-listing-title', '.rf-listing-intro']) {
                    expect((await worstContrastOverPhoto(page, selector)).ratio, `${selector} over the banner`).toBeGreaterThanOrEqual(4.5); // eslint-disable-line no-await-in-loop
                }
            }
        });

        test('keeps the chips to two rows, with every link in the page, and "more" shows them all (stories 22 and 71)', async ({ page }, testInfo) => {
            await open(page, fixture);
            const list = page.locator('[data-rf-chips]');
            const { subcategories } = fixture.fixture.page_context.category;
            await expect(list.locator('a.rf-chip')).toHaveCount(subcategories.length);
            const rows = () => list.evaluate(element => new Set([...element.children].filter(item => !item.hidden).map(item => Math.round(item.getBoundingClientRect().top))).size);
            expect(await rows()).toBeLessThanOrEqual(2);
            const thumbs = await list.locator('a.rf-chip').evaluateAll(links => links.map(link => Boolean(link.querySelector('img'))));
            expect(thumbs, 'a thumbnail only where the subcategory has an image').toEqual(subcategories.map(sub => Boolean(sub.image)));
            const more = list.locator('[data-rf-chips-more]');
            const hidden = await list.locator('li[hidden]:not([data-rf-chips-more])').count();
            if (!hidden) {
                await expect(more).toBeHidden();
                return;
            }
            const button = more.getByRole('button');
            await expect(button).toHaveAccessibleName(phone(testInfo) ? `Show all ${subcategories.length}` : `+${hidden} more`);
            await button.click();
            await expect(list.locator('li[hidden]')).toHaveCount(1); // the "more" chip
            await expect(page.locator(':focus')).toHaveAttribute('href', subcategories[subcategories.length - hidden].url);
        });

        test('scrolls nothing sideways at 320', async ({ page }) => {
            await page.setViewportSize({ width: 320, height: 800 });
            await open(page, fixture);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        });

        test('shows the first row of products within the first screen (stories 20 and 21)', async ({ page }, testInfo) => {
            const size = phone(testInfo) ? { width: 375, height: 667 } : { width: 1366, height: 768 };
            await page.setViewportSize(size);
            await open(page, fixture);
            const photo = await page.locator('.productGrid .card-image').first().boundingBox();
            if (phone(testInfo)) expect(photo.y, 'the first row starts on the first screen').toBeLessThan(size.height);
            else expect(photo.y + photo.height, 'the first row\'s photos show whole on the first screen').toBeLessThanOrEqual(size.height);
        });

        test('has no serious or critical axe issues', async ({ page }) => {
            await open(page, fixture);
            const { violations } = await new AxeBuilder({ page }).include('#main-content').withTags(TAGS).analyze();
            expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
        });
    });
}
