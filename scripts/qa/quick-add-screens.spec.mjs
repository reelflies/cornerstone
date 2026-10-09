// Quick add's panel (ticket 43; spec module 14; stories 29, 30, 67 and 68), at 375 and 1280, on
// the fixture page render/pages/quick-add/: a real Fly Type page round six cards, with
// rf_quick_add on. The live listings' grids are held out of their shots (pages.mjs's `hold`), and
// quick add is off in channel 1's variation, so the panel's look and its keyboard are checked
// here, with the real script in the page.
//
// - The page loads no theme bundle, so quick-add-panel.js and the modules it imports run in it as
//   one script (render/theme-script.mjs, built with the bundle's Babel options), started with
//   stand-ins for the storefront: the product is quick-add-product.html rendered round
//   render/partials/quick-add/products.json's Royal Coachman Streamer (four sizes; stock's answer
//   leaves size 8 sold out), the cart holds 15 flies, and nothing is added.
// - The shot: the sheet over the page at 375, the popover under its card at 1280, each as the
//   viewport shows it. Its baselines are widget baselines,
//   scripts/qa/baselines/widgets/<variation>/quick-add-panel-<project>-<platform>.png, declared
//   on a PR's Baselines line as `widget quick-add`. The closed cards are category-page's and
//   card-grid's shots.
// - With it: the real <dialog>'s keyboard (the sheet modal, Tab kept inside it, Escape back to
//   "+ Add"; the popover closed by a Tab out, focus on the next card's control), and axe with the
//   panel open.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs quick-add-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
    QA_OVERLAY, QA_VARIATION, ROOT, slug,
} from './storefront.mjs';
import { renderPartial, widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';
import { themeScript } from './render/theme-script.mjs';

test.skip(Boolean(QA_OVERLAY), `the panel renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const PANEL = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'quick-add' && name === 'panel');
const { products: PRODUCTS, urls: URLS } = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/qa/render/partials/quick-add/products.json'), 'utf8'));
const MODULES = ['open-state', 'live-region', 'quick-add-route', 'size-pills', 'cart-events', 'quick-add-panel'].map(name => `reelflies/${name}`);
const CONTEXT = {
    rfQuickAdd: true, rfQuickAddClose: 'Close', rfQuickAddFailed: 'We couldn\'t load the sizes.', rfQuickAddPage: 'Go to the product page', rfFlyBrands: 'ReelFlies', urls: URLS,
};
const CART = [{ lineItems: { physicalItems: [{ productId: 4877, quantity: 15, brand: 'ReelFlies' }], digitalItems: [], giftCertificates: [] } }];
const ROYAL_COACHMAN = PRODUCTS.sizes;
const BLOCKING = ['serious', 'critical'];

// The fixture page with quick add started in it, and Royal Coachman Streamer's "+ Add" in view.
async function openPage(page) {
    const { problems } = await openWidget(page, PANEL, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    const markup = await renderPartial('components/reelflies/quick-add-product', {
        product: ROYAL_COACHMAN, urls: URLS, settings: {}, theme_settings: { rf_price_unit_exclude: PANEL.fixture.page_context.theme_settings.rf_price_unit_exclude },
    }, { variation: QA_VARIATION });
    const inStock = ROYAL_COACHMAN.options[0].values.map(({ id }) => id).filter(id => id !== 302); // size 8 sold out
    await page.addScriptTag({
        content: themeScript(MODULES, `window.rfQuickAddForTests = modules['reelflies/quick-add-panel'].startQuickAdd(document, ${JSON.stringify(CONTEXT)}, {
            loadProduct: function () { return Promise.resolve(${JSON.stringify(markup)}); },
            loadPills: function () { return Promise.resolve(modules['reelflies/size-pills']); },
            optionChange: function () { return Promise.resolve({ data: { in_stock_attributes: ${JSON.stringify(inStock)} } }); },
            addItem: function () { return Promise.reject(new Error('a fixture page adds nothing')); },
            doFetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve(${JSON.stringify(CART)}); } }); },
            navigate: function () {},
        });`),
    });
    // The phone header is sticky; static, it can't lie over the card in the shot.
    await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
    const button = page.locator(`[data-rf-quick-add="${ROYAL_COACHMAN.id}"]`);
    await expect(button).toHaveAttribute('role', 'button');
    await button.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
        const card = document.querySelector('[data-rf-quick-add]').closest('article');
        window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 16);
    });
    return button;
}

async function openPanel(page, button) {
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('[data-rf-qa-panel]');
    await expect(dialog).toHaveJSProperty('open', true);
    await expect(dialog.locator('[data-rf-qa-count]')).toHaveText('15 flies in your cart.');
    await expect(dialog.locator('[data-rf-sold-out-line]')).toHaveText('Size 8 is sold out.');
    return dialog;
}

test('the quick-add panel (ticket 43) matches its baseline: the sheet at 375, the popover at 1280', async ({ page }, testInfo) => {
    const button = await openPage(page);
    const dialog = await openPanel(page, button);
    const phone = testInfo.project.name === 'phone-375';
    expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(phone);
    // A shot with the focus ring on Close shows the focus where it lands.
    await expect(dialog.locator('[data-rf-qa-close]')).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'quick-add-panel.png']);
});

test('"+ Add" is the card\'s full width at 375 and as wide as its words, left-aligned, at 1280 (story 29)', async ({ page }, testInfo) => {
    const button = await openPage(page);
    const [buttonBox, bodyBox] = await Promise.all([button.boundingBox(), button.locator('xpath=ancestor::div[contains(@class, "card-body")]').boundingBox()]);
    expect(buttonBox.height).toBeGreaterThanOrEqual(40);
    expect(Math.abs(buttonBox.x - bodyBox.x)).toBeLessThan(1);
    if (testInfo.project.name === 'phone-375') expect(Math.abs(buttonBox.width - bodyBox.width)).toBeLessThan(1);
    else expect(buttonBox.width).toBeLessThan(bodyBox.width / 2);
    expect(await button.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(33, 39, 33)');
});

test('the sheet (375) is modal: Tab stays inside it, Escape closes it, focus goes back to "+ Add" (story 67)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone-375', 'the sheet is the phone\'s');
    const button = await openPage(page);
    const dialog = await openPanel(page, button);
    const controls = await dialog.evaluate(element => element.querySelectorAll('a[href], button, input:not([type="hidden"])').length);
    for (let step = 0; step < controls * 2 + 2; step += 1) {
        await page.keyboard.press(step % 3 === 2 ? 'Shift+Tab' : 'Tab'); // eslint-disable-line no-await-in-loop
        expect(await dialog.evaluate(element => element.contains(document.activeElement)), `focus inside the sheet after ${step + 1} presses`).toBe(true); // eslint-disable-line no-await-in-loop
    }
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-rf-open'))).toBe('quick-add');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-rf-qa-panel]')).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-rf-open'))).toBe(false);
});

test('the popover (1280) closes when Tab leaves it, with focus on the next control, never back on "+ Add"; Escape closes it onto "+ Add" (stories 67 and 68)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'the popover is the desktop\'s');
    const button = await openPage(page);
    let dialog = await openPanel(page, button);
    const lastId = await dialog.evaluate(element => {
        const controls = Array.from(element.querySelectorAll('a[href], button, input:not([type="hidden"])'));
        const last = controls[controls.length - 1];
        last.focus();
        return last.textContent.trim();
    });
    expect(lastId).toBe('View cart');
    await page.keyboard.press('Tab');
    await expect(page.locator('[data-rf-qa-panel]')).toHaveCount(0);
    const landed = await page.evaluate(() => ({
        isButton: document.activeElement.hasAttribute('data-rf-quick-add') && document.activeElement.getAttribute('data-rf-quick-add') === '4831',
        inNextCard: Boolean(document.activeElement.closest('article')) && document.activeElement.closest('article').getAttribute('data-entity-id') !== '4831',
    }));
    expect(landed).toEqual({ isButton: false, inNextCard: true });
    dialog = await openPanel(page, button);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-rf-qa-panel]')).toHaveCount(0);
    await expect(button).toBeFocused();
});

// In the panel and the cards' "+ Add": the fixture page's header has no store data (its logo
// link has no name), so the page outside them is the live pins' axe run's (qa:axe).
test('axe finds no serious or critical issue in the open panel or on "+ Add" (story 68)', async ({ page }) => {
    const button = await openPage(page);
    await openPanel(page, button);
    const { violations } = await new AxeBuilder({ page }).include('[data-rf-qa-panel]').include('[data-rf-quick-add]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
    const blocking = violations.filter(violation => BLOCKING.includes(violation.impact))
        .map(violation => `${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
    expect(blocking).toEqual([]);
});
