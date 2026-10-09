// The add flow on a live product page (ticket 38; spec module 15; O14, UX-10, GEO-3; stories 34,
// 37, 39, 41, 42, 43, 67 and 68), at 375 and 1280, on channel 1: Fat Albert (5663, /fat-albert/),
// which has several sizes and a required Colour (stock swatches), and the product pin (6178),
// which has one size. ReelFlies_CA has no products until refactor 14. A cart on channel 1 is a
// live write, so the add and the cart's read are answered here (page.route: fulfilled or aborted,
// never sent), and the harness's guard fails any other write (network-guard.mjs).
//
// - On the pin, one size checked for the shopper (ticket 37): "Add 1 to cart" from the start.
// - "Choose a size" until a size is chosen; activating it says "Choose a fly size first." and
//   moves focus to the first in-stock pill, with no add.
// - Size chosen and plus twice: "Add 3 to cart".
// - An add: no modal; the line "Added 3 × size N. 15 flies in your cart." with View cart; the live
//   region changes once; focus stays on the button; the header's count shows 15.
// - A sold-out size chosen: no add, and "Size N is sold out. Choose another size." said.
// - An add the network drops: the button usable again, the error shown and announced.
// - An option change the network drops: the pills still usable, the error announced.
// - At 375 the sticky bar after scrolling past the button, --sticky-h its height (0 hidden); an
//   add from it confirms in the bar with focus kept there, and the bar rests again after about 4
//   seconds; tabbing never leaves focus under it. Its two looks are the product pin's
//   sticky-bar and sticky-bar-added states (states.mjs).
// - axe with the confirmation and the bar showing.
//
// It runs only when named:
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs add-flow.spec

/* eslint-env browser */ // the evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { QA_CHANNEL } from './storefront.mjs';
import { chunkLoaded } from './states.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const SIZE_GROUP = '[data-rf-pills="size"]';
const FAT_ALBERT = '/fat-albert/';
const FAT_ALBERT_ID = 5663;
const PIN = null;
// Fat Albert's Colour: stock swatches, required, none chosen.
const COLOUR = '[data-product-attribute="swatch"] .form-option';
const phone = testInfo => testInfo.project.name === 'phone-375';
const CART = units => [{ lineItems: { physicalItems: [{ productId: FAT_ALBERT_ID, quantity: units, brand: 'ReelFlies' }], digitalItems: [], giftCertificates: [] } }];

// The add and the cart's read, answered here. Returns the adds made.
async function answerAdds(page, { fail = false, units = 15 } = {}) {
    const adds = [];
    await page.route('**/remote/v1/cart/add**', route => {
        adds.push(route.request().url());
        if (fail) return route.abort('failed');
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { cart_id: 'qa-cart', cart_item: { id: 'qa-item', product_id: FAT_ALBERT_ID } } }) });
    });
    await page.route('**/api/storefront/carts**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(CART(units)) }));
    return adds;
}

// Fat Albert unless given the pin (PIN: the product pin's own path).
async function open(page, pagePath = FAT_ALBERT) {
    await storefrontPage(page, 'product', pagePath ?? undefined);
    await dismissCookieBanner(page);
    await chunkLoaded(page, 'rf-add-flow');
    await chunkLoaded(page, 'rf-size-pills');
}

// A click on a choice, then stock's option-change answer to it, which can change the sold-out
// marks; size-pills.js says that change in the live region (ticket 37).
async function chooseAndSettle(page, locator) {
    const answered = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
    await locator.click();
    await answered;
}

// A Colour, so stock's required-option check passes, then the first in-stock size, each answered.
async function choose(page) {
    await chooseAndSettle(page, page.locator(COLOUR).first());
    await chooseAndSettle(page, page.locator(`${SIZE_GROUP} .rf-pill[data-product-attribute-value]:not(.unavailable)`).first());
}

const regionChanges = page => page.evaluate(() => {
    const region = document.querySelector('[data-rf-live-region]');
    window.rfRegionTexts = [];
    new MutationObserver(() => {
        if (region.textContent) window.rfRegionTexts.push(region.textContent);
    }).observe(region, { childList: true, characterData: true, subtree: true });
});

test.describe('the add flow (ticket 38)', () => {
    test.skip(QA_CHANNEL !== '1', 'ReelFlies_CA has no products until refactor 14: run with QA_CHANNEL=1');

    test('starts at "Add 1 to cart" on the pin, whose one size is checked for the shopper', async ({ page }) => {
        await answerAdds(page);
        await open(page, PIN);
        await expect(page.locator('#form-action-addToCart')).toHaveValue('Add 1 to cart');
    });

    test('says "Choose a size", and with none chosen says so, moves focus to the first in-stock size, and adds nothing (story 37)', async ({ page }) => {
        const adds = await answerAdds(page);
        await open(page);
        await page.locator(COLOUR).first().click();
        const button = page.locator('#form-action-addToCart');
        await expect(button).toHaveValue('Choose a size');
        await button.click();
        await expect(page.locator('[data-rf-add-status]')).toHaveText('Choose a fly size first.');
        const focused = await page.evaluate(() => document.activeElement.matches('[data-rf-pills] input[type="radio"]:not([aria-disabled="true"])'));
        expect(focused).toBe(true);
        expect(adds).toEqual([]);
    });

    test('follows the stepper once a size is chosen: "Add 3 to cart" (story 41)', async ({ page }) => {
        await answerAdds(page);
        await open(page);
        await choose(page);
        await page.locator('[data-quantity-change] [data-action="inc"]').click();
        await page.locator('[data-quantity-change] [data-action="inc"]').click();
        await expect(page.locator('#form-action-addToCart')).toHaveValue('Add 3 to cart');
    });

    test('adds with no modal: the line with View cart, announced once, focus kept, the header told (stories 34, 42 and 68)', async ({ page }) => {
        const adds = await answerAdds(page);
        await open(page);
        const pill = page.locator(`${SIZE_GROUP} .rf-pill[data-product-attribute-value]:not(.unavailable)`).first();
        const size = (await pill.locator('.form-option-variant').innerText()).trim();
        await chooseAndSettle(page, page.locator(COLOUR).first());
        await chooseAndSettle(page, pill);
        await page.locator('[data-quantity-change] [data-action="inc"]').click();
        await page.locator('[data-quantity-change] [data-action="inc"]').click();
        await regionChanges(page);
        const button = page.locator('#form-action-addToCart');
        await button.focus();
        await page.keyboard.press('Enter');
        const status = page.locator('[data-rf-add-status]');
        await expect(status).toHaveText(new RegExp(`^Added 3 × size ${size}, .+\\. 15 flies in your cart\\. View cart$`));
        await expect(status.getByRole('link', { name: 'View cart' })).toHaveAttribute('href', /cart\.php/);
        await expect(page.locator('#previewModal')).not.toHaveClass(/open/);
        await expect(button).toBeFocused();
        await expect(page.locator('.countPill').first()).toHaveText('15');
        expect(adds).toHaveLength(1);
        await page.waitForTimeout(300);
        const spoken = await page.evaluate(() => window.rfRegionTexts);
        expect(spoken).toHaveLength(1);
        expect(spoken[0]).toMatch(new RegExp(`^Added 3 × size ${size}, .+\\. 15 flies in your cart\\.$`));
    });

    test('adds nothing for a sold-out size, and says so (story 39)', async ({ page }) => {
        const adds = await answerAdds(page);
        await open(page);
        // A Colour and a size, each answered by stock's option change, which redraws the marks.
        const changed = () => page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
        let answer = changed();
        await page.locator(COLOUR).first().click();
        await answer;
        const pill = page.locator(`${SIZE_GROUP} .rf-pill[data-product-attribute-value]:not(.unavailable)`).first();
        const size = (await pill.locator('.form-option-variant').innerText()).trim();
        answer = changed();
        await pill.click();
        await answer;
        // Then stock marks the chosen size as one it can't sell; size-pills.js follows (ticket 37).
        await pill.evaluate(label => label.classList.add('unavailable'));
        await expect(page.locator(`${SIZE_GROUP} input:checked`)).toHaveAttribute('aria-disabled', 'true');
        await page.locator('#form-action-addToCart').click();
        await expect(page.locator('[data-rf-add-status]')).toHaveText(`Size ${size} is sold out. Choose another size.`);
        expect(adds).toEqual([]);
    });

    test('with the add dropped: the button usable again, the error shown and announced (story 68)', async ({ page }) => {
        await answerAdds(page, { fail: true });
        await open(page);
        await choose(page);
        await regionChanges(page);
        const button = page.locator('#form-action-addToCart');
        await button.click();
        await expect(page.locator('[data-rf-add-status]')).toHaveText('That didn\'t go in your cart. Try again.');
        await expect(button).toBeEnabled();
        await expect.poll(() => page.evaluate(() => window.rfRegionTexts)).toEqual(['That didn\'t go in your cart. Try again.']);
    });

    test('with an option change dropped: the pills still usable, the error announced', async ({ page }) => {
        await answerAdds(page);
        await open(page);
        await page.route('**/remote/v1/product-attributes/**', route => route.abort('failed'));
        const pills = page.locator(`${SIZE_GROUP} .rf-pill[data-product-attribute-value]:not(.unavailable)`);
        await pills.first().click();
        await expect(page.locator('[data-rf-add-status]')).toHaveText('That didn\'t go in your cart. Try again.');
        await pills.nth(1).click();
        await expect(page.locator(`${SIZE_GROUP} input:checked`)).toHaveCount(1);
    });

    test('on phones: the sticky bar past the button, its height in --sticky-h, an add from it confirming in place, focus never under it (stories 43 and 67)', async ({ page }, testInfo) => {
        test.skip(!phone(testInfo), 'the bar is the phone layout');
        await answerAdds(page);
        await open(page);
        const bar = page.locator('[data-rf-sticky-add]');
        await expect(bar).toBeHidden();
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sticky-h').trim())).toBe('0px');
        await choose(page);
        await page.evaluate(() => window.scrollTo(0, document.querySelector('#form-action-addToCart').getBoundingClientRect().bottom + window.scrollY + 200));
        await expect(bar).toBeVisible();
        const height = await bar.evaluate(element => element.offsetHeight);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sticky-h').trim())).toBe(`${height}px`);

        await bar.locator('[data-rf-sticky-button]').click();
        await expect(bar.locator('[data-rf-sticky-text]')).toHaveText(/^Added 1 × size /);
        await expect(bar.locator('[data-rf-sticky-view]')).toBeFocused();
        await expect(bar.locator('[data-rf-sticky-button]')).toBeVisible({ timeout: 6000 });
        await expect(bar.locator('[data-rf-sticky-text]')).toHaveText(/^Size .+, 1 fly$/);

        const barTop = await bar.evaluate(element => element.getBoundingClientRect().top);
        await page.evaluate(() => window.scrollTo(0, 0));
        const under = [];
        for (let step = 0; step < 60; step += 1) {
            await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
            const focus = await page.evaluate(() => { // eslint-disable-line no-await-in-loop
                const element = document.activeElement;
                if (!element || element === document.body || element.closest('[data-rf-sticky-add]')) return null;
                return { bottom: element.getBoundingClientRect().bottom, label: element.outerHTML.slice(0, 60), bar: !document.querySelector('[data-rf-sticky-add]').hidden };
            });
            if (focus && focus.bar && focus.bottom > barTop + 1) under.push(focus.label);
        }
        expect(under, 'focused elements under the bar').toEqual([]);
    });

    test('has no serious or critical axe issues with the confirmation showing', async ({ page }) => {
        await answerAdds(page);
        await open(page);
        await choose(page);
        await page.locator('#form-action-addToCart').click();
        await expect(page.locator('[data-rf-add-status]')).toContainText('Added');
        const { violations } = await new AxeBuilder({ page }).include('.productView').withTags(TAGS).analyze();
        expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
});
