// The card line with items in the cart (ticket 42; spec module 17; UX-18; stories 33 and 70), at
// 375 and 1280, on the fixture page render/pages/cart-state/: ticket 31's six cards on the real
// search page, with rf_cart_state on. Channel 1's listing pins hold their live grids out of their
// shots (pages.mjs's `hold`), so the line's look is checked here, with the real script in the page.
//
// - The page loads no theme bundle, so cart-marks.js and the modules it imports run in it as one
//   script (render/theme-script.mjs, built with the bundle's Babel options), started with a
//   stand-in for the Cart API's read: 6 Royal Coachman Streamers (4831) across two sizes, and 1
//   Monster Streamer Shad Pike Fly (5234).
// - The shot: .productGrid with "6 in cart" and "1 in cart" under those cards' prices and the
//   other lines empty, each line kept. Its baselines are widget baselines,
//   scripts/qa/baselines/widgets/<variation>/cart-state-cards-<project>-<platform>.png, declared on
//   a PR's Baselines line as `widget cart-state`. The cards with an empty cart are card-grid's shot.
// - With it: no card moves when the read's lines fill in (story 70), and axe on the grid.
// - The same grid with the switch off (story 73; fixture `off`, rf_cart_state false in its
//   page_context's theme_settings): the stock card, with no line and no space kept for one, shot as
//   cart-state-off-<project>-<platform>.png. Widget shots skip under an overlay, and the live
//   listing pins hold their grids, so this is the switch-off card's picture.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs cart-state-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';
import { themeScript } from './render/theme-script.mjs';
import { cartOf } from './fixtures/cart/routes.mjs';

test.skip(Boolean(QA_OVERLAY), `the card line renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const fixtureCase = name => widgetCases([PAGE_FIXTURES]).find(({ widget, name: caseName }) => widget === 'cart-state' && caseName === name);
const CARDS = fixtureCase('cards');
const OFF = fixtureCase('off');
const MODULES = ['cart-events', 'cart-state', 'cart-marks'].map(name => `reelflies/${name}`);
const CART = cartOf([
    { productId: 4831, quantity: 4, options: [{ nameId: 1, valueId: 11 }] },
    { productId: 4831, quantity: 2, options: [{ nameId: 1, valueId: 12 }] },
    { productId: 5234, quantity: 1 },
]);
const BLOCKING = ['serious', 'critical'];

// A fixture case's page, its six cards' photos loaded and the phone header static.
async function openGrid(page, widgetCase) {
    const { problems } = await openWidget(page, widgetCase, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    const grid = page.locator('.productGrid');
    await expect(grid.locator('.card')).toHaveCount(6);
    for (const img of await grid.locator('.card-image').all()) {
        await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
    await page.evaluate(() => window.scrollTo(0, 0));
    return grid;
}

// The switch-on page with the cards' places noted before the cart is read, then cart-marks.js
// started with the cart.
async function openPage(page) {
    const grid = await openGrid(page, CARDS);
    await expect(grid.locator('[data-rf-cart-card]')).toHaveCount(6);
    const places = () => grid.locator('.card').evaluateAll(cards => cards.map(card => {
        const box = card.getBoundingClientRect();
        const actions = card.querySelector('.rf-card-actions').getBoundingClientRect();
        return [Math.round(box.top), Math.round(box.height), Math.round(actions.top)];
    }));
    const before = await places();
    await page.addScriptTag({
        content: themeScript(MODULES, `window.rfCartMarksForTests = modules['reelflies/cart-marks'].startCartMarks(document, {
            doFetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve(${JSON.stringify(CART)}); } }); },
        });`),
    });
    await expect(page.locator('[data-rf-cart-card="4831"] [data-rf-cart-count]')).toHaveText('6 in cart');
    return { grid, before, after: await places() };
}

test('the card line (ticket 42) matches its baseline: "6 in cart" and "1 in cart" under their prices, the other lines kept empty', async ({ page }) => {
    const { grid } = await openPage(page);
    await expect(page.locator('[data-rf-cart-card="5234"] [data-rf-cart-count]')).toHaveText('1 in cart');
    await expect(grid.locator('[data-rf-cart-card] a:visible')).toHaveCount(2);
    await page.mouse.move(0, 0);
    await expect(grid).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'cart-state-cards.png']);
});

test('moves no card when the lines fill in: each line was kept for it (story 70)', async ({ page }) => {
    const { before, after } = await openPage(page);
    expect(after).toEqual(before);
});

test('the line is a link to the product page, named for its product, 24px tall, its check sage and its words ink at 14px (UX-18; story 33)', async ({ page }) => {
    await openPage(page);
    const link = page.locator('[data-rf-cart-card="4831"] a');
    await expect(link).toHaveAttribute('href', 'https://reelflies.ca/royal-coachman-streamer/');
    await expect(link).toHaveAccessibleName('6 in cart of Royal Coachman Streamer');
    const look = await link.evaluate(element => {
        const style = getComputedStyle(element);
        const check = getComputedStyle(element.querySelector('svg'));
        return {
            height: element.getBoundingClientRect().height, size: style.fontSize, colour: style.color, check: check.color, line: style.textDecorationLine,
        };
    });
    expect(look).toEqual({
        height: 24, size: '14px', colour: 'rgb(33, 39, 33)', check: 'rgb(123, 142, 122)', line: 'underline',
    });
});

test('axe finds no serious or critical issue in the grid with the lines showing', async ({ page }) => {
    await openPage(page);
    const { violations } = await new AxeBuilder({ page }).include('.productGrid')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    expect(violations.filter(({ impact }) => BLOCKING.includes(impact)).map(({ id, nodes }) => `${id}: ${nodes.map(node => node.target).join(', ')}`)).toEqual([]);
});

test('with rf_cart_state off, the cards are the stock card and match their baseline: no line and no space kept for one (story 73)', async ({ page }) => {
    const grid = await openGrid(page, OFF);
    await expect(grid.locator('[data-rf-cart-card], .rf-card-cart')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await expect(grid).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'cart-state-off.png']);
});
