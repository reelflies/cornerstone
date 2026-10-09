// The cart page (ticket 41; spec module 18; stories 50, 55, 56, 67, 68 and 71), at 375 and 1280,
// on the fixture page: the real cart page rendered round a 12-pattern cart
// (render/pages/cart-page/fixtures/twelve.json), with the products' own photos. A cart on
// channel 1 would be a live write (W0-6), and ReelFlies_CA has no products until refactor 14, so
// the cart's look and behaviour are checked here. The fixture page loads no theme bundle, so the
// spec runs the real cart-groups.js in the page (render/theme-script.mjs).
//
// - The page at both widths matches its baseline (widget baselines, declared as `widget cart-page`).
// - Each pattern is one group from the server, its sizes in hook order once sorted; until then a
//   group of several sizes keeps them out of view, so sorting moves nothing on the page.
// - A pattern whose sizes are priced differently shows each size's unit price, and the lines add
//   up to the subtotal.
// - Every group keeps its 64px photo, linked to the product, at 320, 375 and 1280.
// - Nothing scrolls sideways at 320.
// - At 375 the phone bar shows the total for the flies and Check out, and tabbing to Check out
//   never leaves the focused element under it; without the page's scroll padding it would.
// - axe finds no serious or critical issue in the cart.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs cart-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { themeScript } from './render/theme-script.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the cart renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const CART = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'cart-page' && name === 'twelve');
if (!CART) throw new Error('render/pages/cart-page/fixtures/twelve.json is missing');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const SORT = "modules['reelflies/cart-groups'].sortCartRows(document);";
const phone = testInfo => testInfo.project.name === 'phone-375';

async function sortRows(page) {
    await page.addScriptTag({ content: themeScript(['reelflies/hook-order', 'reelflies/cart-groups'], SORT) });
    await expect(page.locator('[data-rf-cart-group]:not([data-rf-cart-sorted])')).toHaveCount(0);
}

async function open(page, { sort = true } = {}) {
    const { problems } = await openWidget(page, CART, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    for (const img of await page.locator('.rf-cart-group > .rf-cart-photo img').all()) {
        await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (sort) await sortRows(page);
}

// Tabs from the top of the page to the summary's Check out, and lists every focused element whose
// bottom is under the phone bar's top.
async function focusUnderBar(page) {
    const barTop = await page.locator('[data-rf-cart-bar]').evaluate(element => element.getBoundingClientRect().top);
    const under = [];
    for (let step = 0; step < 200; step += 1) {
        await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
        const focus = await page.evaluate(() => { // eslint-disable-line no-await-in-loop
            const element = document.activeElement;
            if (!element || element === document.body || element.closest('[data-rf-cart-bar]')) return null;
            return { bottom: element.getBoundingClientRect().bottom, label: element.outerHTML.slice(0, 80), last: element.matches('.rf-cart-checkout') };
        });
        if (focus && focus.bottom > barTop + 1) under.push(focus.label);
        if (focus && focus.last) return { under, reached: true };
    }
    return { under, reached: false };
}

test.describe('the cart (ticket 41)', () => {
    test('matches its baseline', async ({ page }, testInfo) => {
        await open(page);
        // The phone bar is fixed to the viewport, so a shot of the whole page would draw it over the
        // lines wherever the viewport was: the page is shot without it, and the bar on its own.
        // The phone header is sticky too, and would cover the cart's top in an element shot.
        await page.addStyleTag({ content: '[data-rf-cart-bar] { visibility: hidden !important; } [data-rf-header] { position: static !important; }' });
        await expect(page.locator('[data-cart]')).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'cart-page-twelve.png']);
        if (phone(testInfo)) {
            await page.addStyleTag({ content: '[data-rf-cart-bar] { visibility: visible !important; }' });
            await expect(page.locator('[data-rf-cart-bar]')).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'cart-page-twelve-bar.png']);
        }
    });

    test('groups each pattern once, its sizes in hook order (story 50)', async ({ page }) => {
        await open(page);
        const groups = await page.locator('[data-rf-cart-group]').evaluateAll(found => found.map(group => ({
            name: group.querySelector('.rf-cart-name').textContent.trim(),
            sizes: [...group.querySelectorAll('[data-rf-cart-row]')].map(row => row.dataset.rfSize),
        })));
        expect(groups).toHaveLength(12);
        expect(new Set(groups.map(group => group.name)).size, 'one group per pattern').toBe(12);
        const sized = groups.find(group => group.sizes.length === 3);
        const numbers = sized.sizes.map(size => (size.includes('/') ? -Number(size.split('/')[0]) : Number(size)));
        expect([...numbers].sort((a, b) => a - b), `${sized.sizes.join(', ')} in hook order`).toEqual(numbers);
    });

    test('keeps a group of several sizes out of view until they are sorted, so sorting moves nothing (CLS)', async ({ page }) => {
        await open(page, { sort: false });
        const multi = page.locator('[data-rf-cart-multi]').first();
        await expect(multi.locator('.rf-cart-rows')).toHaveCSS('visibility', 'hidden');
        const boxes = () => page.locator('[data-rf-cart-group], [data-cart-totals]').evaluateAll(found => found.map(element => {
            const box = element.getBoundingClientRect();
            return [Math.round(box.top), Math.round(box.height)];
        }));
        const before = await boxes();
        await sortRows(page);
        await expect(multi.locator('.rf-cart-rows')).toHaveCSS('visibility', 'visible');
        expect(await boxes(), 'every group and the summary where they were').toEqual(before);
    });

    test('shows each size\'s own unit price where a pattern\'s sizes are priced differently, and the lines add up to the subtotal', async ({ page }) => {
        await open(page);
        const varying = page.locator('[data-rf-prices-vary]');
        await expect(varying).toHaveCount(1);
        for (const group of await varying.all()) {
            for (const unit of await group.locator('.rf-cart-row-unit').all()) await expect(unit).toBeVisible(); // eslint-disable-line no-await-in-loop
            await expect(group.locator('.rf-cart-unit')).toBeHidden(); // eslint-disable-line no-await-in-loop
        }
        const cents = text => Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);
        const totals = await page.locator('.rf-cart-total .cart-item-value').allInnerTexts();
        const subtotal = await page.locator('.cart-total').first().locator('.cart-total-value').innerText();
        expect(totals.reduce((sum, total) => sum + cents(total), 0)).toBe(cents(subtotal));
    });

    for (const width of [320, 360, 375, 414, 1280]) {
        test(`keeps each group's 64px photo, linked to the product, at ${width} (story 56)`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await open(page);
            const photos = await page.locator('.rf-cart-group > .rf-cart-photo').evaluateAll(links => links.map(link => ({
                width: Math.round(link.querySelector('img').getBoundingClientRect().width),
                href: link.getAttribute('href'),
                name: link.closest('[data-rf-cart-group]').querySelector('.rf-cart-name a').getAttribute('href'),
            })));
            expect(photos).toHaveLength(12);
            for (const photo of photos) {
                expect(photo.width).toBe(64);
                expect(photo.href).toBe(photo.name);
            }
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, 'nothing scrolls sideways').toBeLessThanOrEqual(0);
            const past = await page.locator('[data-rf-cart-row]').evaluateAll(rows => rows.filter(row => {
                const group = row.closest('[data-rf-cart-group]').getBoundingClientRect();
                return [row, ...row.children].some(element => element.getBoundingClientRect().right > group.right + 0.5);
            }).map(row => row.dataset.rfSize));
            expect(past, 'rows whose controls run past their group').toEqual([]);
            // A total's text can outgrow its box while the box stays inside the group.
            const cramped = await page.locator('.rf-cart-total').evaluateAll(totals => totals.filter(total => total.scrollWidth > total.clientWidth + 0.5)
                .map(total => total.textContent.trim()));
            expect(cramped, 'line totals wider than their column').toEqual([]);
        });
    }

    test('on phones, the bar shows the total for the flies and Check out (story 55)', async ({ page }, testInfo) => {
        test.skip(!phone(testInfo), 'the bar is the phone layout');
        await open(page);
        const bar = page.locator('[data-rf-cart-bar]');
        await expect(bar).toBeVisible();
        const total = (await bar.locator('.rf-cart-bar-total').innerText()).replace(/\s+/g, ' ').trim();
        expect(total).toMatch(/^\$[\d,.]+ for [\d,]+ (flies|items)$/);
        await expect(bar.getByRole('link', { name: 'Check out' })).toBeVisible();
    });

    test('on phones, tabbing to Check out never leaves the focused element under the bar (story 67)', async ({ page }, testInfo) => {
        test.skip(!phone(testInfo), 'the bar is the phone layout');
        await open(page);
        const { under, reached } = await focusUnderBar(page);
        expect(reached, 'Tab reaches the summary\'s Check out').toBe(true);
        expect(under, 'focused elements under the bar').toEqual([]);
    });

    test('the check above bites: without the page\'s scroll padding, focus would go under the bar', async ({ page }, testInfo) => {
        test.skip(!phone(testInfo), 'the bar is the phone layout');
        await open(page);
        await page.addStyleTag({ content: 'html { scroll-padding-bottom: 0 !important; }' });
        const { under } = await focusUnderBar(page);
        expect(under.length).toBeGreaterThan(0);
    });

    test('has no serious or critical axe issues', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('[data-cart]').withTags(TAGS).analyze();
        expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
});
