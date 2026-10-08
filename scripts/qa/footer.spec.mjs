// The footer in a browser (ticket 50; spec module 20; stories 67, 68 and 71), on every page pinned
// for QA_CHANNEL:
// - it sits on the forest ground, and a footer link takes the gold bead ring from the keyboard
// - at 375 its columns stack, one under another, and at 1280 they sit side by side
// - at 320px wide the page doesn't scroll sideways, and every footer column fits the viewport
// - axe finds no serious or critical issue inside the footer, and nothing in it is content
//   outside a landmark (axe region): the footer is the contentinfo landmark
//
//   QA_PORT=<yours> npx playwright test --config scripts/qa/playwright.config.mjs footer.spec
//   QA_PORT=<yours> QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs footer.spec
//
// It isn't a gate: `npm run qa:prepush` doesn't run it, as with skin.spec. The page screenshots
// hold the footer's look, the raw-HTML assertion rf-footer its links and copy.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';

const FOREST = 'rgb(47, 56, 47)'; // #2F382F, footer-backgroundColor
const BEAD = 'rgb(242, 193, 78)'; // #F2C14E, the ring on forest grounds (.rf-on-dark)

const columnBoxes = page => page.locator('[data-rf-footer] .rf-footer__col').evaluateAll(columns => columns.map(column => {
    const { x, y, width } = column.getBoundingClientRect();
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width) };
}));

for (const [key, pagePath] of Object.entries(PAGES)) {
    test.describe(`${key} (${pagePath})`, () => {
        test('the footer is on the forest ground, and a link in it takes the gold ring from the keyboard', async ({ page }) => {
            await storefrontPage(page, key);
            await dismissCookieBanner(page);
            const footer = page.locator('footer[data-rf-footer]');
            await expect(footer).toHaveCount(1);
            expect(await footer.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(FOREST);

            const link = footer.locator('.rf-footer__list a').first();
            await page.keyboard.press('Tab');
            await link.evaluate(element => element.focus());
            await expect.poll(() => link.evaluate(element => {
                const style = getComputedStyle(element);
                return `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`;
            }), { timeout: 3000 }).toBe(`2px solid ${BEAD}`);
        });

        test('the columns stack on phones and sit side by side on desktops', async ({ page }, testInfo) => {
            await storefrontPage(page, key);
            const boxes = await columnBoxes(page);
            expect(boxes.length).toBeGreaterThanOrEqual(3);
            if (testInfo.project.name === 'phone-375') {
                expect(new Set(boxes.map(box => box.x)).size, `one column: ${JSON.stringify(boxes)}`).toBe(1);
                boxes.slice(1).forEach((box, i) => expect(box.y).toBeGreaterThan(boxes[i].y));
            } else {
                expect(new Set(boxes.map(box => box.y)).size, `one row: ${JSON.stringify(boxes)}`).toBe(1);
            }
        });

        test('nothing scrolls sideways at 320px wide, and every footer column fits', async ({ page }, testInfo) => {
            test.skip(testInfo.project.name !== 'phone-375', 'the viewport is set here, once');
            await page.setViewportSize({ width: 320, height: 640 });
            await storefrontPage(page, key);
            await dismissCookieBanner(page);
            const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
            expect(widths.scroll, `the page is ${widths.scroll}px wide in a ${widths.client}px viewport`).toBeLessThanOrEqual(widths.client);
            for (const box of await columnBoxes(page)) expect(box.x + box.width).toBeLessThanOrEqual(320);
        });

        test('axe finds no serious or critical issue in the footer', async ({ page }) => {
            await storefrontPage(page, key);
            await dismissCookieBanner(page);
            const { violations } = await new AxeBuilder({ page }).include('footer[data-rf-footer]')
                .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
            const serious = violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
            expect(serious.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(' ')).join('; ')})`)).toEqual([]);
        });

        test('nothing in the footer is content outside a landmark (axe region)', async ({ page }) => {
            await storefrontPage(page, key);
            await dismissCookieBanner(page);
            const { violations } = await new AxeBuilder({ page }).withRules(['region']).analyze();
            const nodes = violations.flatMap(violation => violation.nodes.map(node => node.target.join(' ')));
            const inFooter = await page.evaluate(targets => targets.filter(target => {
                const element = document.querySelector(target);
                return element && Boolean(element.closest('footer[data-rf-footer]'));
            }), nodes);
            expect(inFooter).toEqual([]);
        });
    });
}
