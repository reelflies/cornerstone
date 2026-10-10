// Cart state on the product page and the cards (ticket 42; spec module 17; R4, O13, O15, UX-10,
// UX-18; stories 33, 40, 68, 70 and 73), on channel 1's live pins: Fat Albert (product@sizes,
// 5663, several sizes and a Colour) and the category pin (a Fly Type page). ReelFlies_CA has no
// products until refactor 14. A cart on channel 1 would be a live write (W0-6, decision 1), so the
// Cart API's read and the add are answered by the cart route fixtures (fixtures/cart/routes.mjs),
// never passed on; the sizes' option value ids and a card's product are read from the page.
//
// With rf_cart_state on (the plain run):
// - 3 × a size in the cart: the corner check on that size and none on the others, "(3 in cart)" in
//   its radio's accessible name, and "In your cart: 3 × size N." under the pills (stories 40, 68).
// - Adding 2 more through ticket 38's add flow makes it 5, without a reload (rf:cart-changed).
// - 6 of a pattern across two sizes: its card on the Fly Type page says "6 in cart", a link to its
//   product page (story 33).
// - The read moves nothing: answered only after the page has settled, it adds no layout shift, and
//   the page's CLS stays at 0.05 or less (story 70; ticket 17's Lighthouse run with items in the
//   cart waits for real carts, decision 1).
// With it off (QA_OVERLAY=rf_cart_state-off): no read of /api/storefront/carts as the page loads,
// and none of the module's markup or chunk (story 73).
//
// It runs only when named:
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs cart-state.spec
//   QA_CHANNEL=1 QA_OVERLAY=rf_cart_state-off npx playwright test --config scripts/qa/playwright.config.mjs cart-state.spec

/* eslint-env browser */ // the evaluate callbacks run in the page

import {
    SWITCH_VALUES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { QA_CHANNEL } from './storefront.mjs';
import { chunkLoaded } from './states.mjs';
import { answerCartAdds, answerCartRead, cartOf } from './fixtures/cart/routes.mjs';

const ON = SWITCH_VALUES.rf_cart_state;
const FAT_ALBERT_ID = 5663;
const SIZE_GROUP = '[data-rf-pills="size"]';
const COLOUR = '[data-product-attribute="swatch"] .form-option';
const CART_API = /\/api\/storefront\/carts/;
const MARKERS = '[data-rf-cart-line], [data-rf-cart-tag], [data-rf-cart-dot], [data-rf-cart-card]';

// The size group's values as the page gives them: the option's id from the radios' name
// (attribute[<id>]), and each value's id and label.
const sizesOf = page => page.locator(`${SIZE_GROUP} input[type="radio"]`).evaluateAll(radios => radios.filter(radio => radio.value).map(radio => ({
    nameId: Number(/\[(\d+)\]/.exec(radio.name)[1]),
    valueId: Number(radio.value),
    label: radio.labels[0].querySelector('.form-option-variant').textContent.trim(),
})));
const sizeOption = ({ nameId, valueId, label }) => ({
    name: 'Fly Sizes', nameId, valueId, value: label,
});
// Size 14 if the product has it (the criterion's), else its first size.
const fourteen = sizes => sizes.find(({ label }) => label === '14') || sizes[0];

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    if (ON) await chunkLoaded(page, 'rf-cart-state');
}

const cartReads = page => {
    const reads = [];
    page.on('request', request => {
        if (CART_API.test(request.url()) && request.method() === 'GET') reads.push(request.url());
    });
    return reads;
};

test.describe('cart state (ticket 42)', () => {
    test.skip(QA_CHANNEL !== '1', 'ReelFlies_CA has no products or Fly Type pages until refactor 14: run with QA_CHANNEL=1');

    test.describe('with rf_cart_state on', () => {
        test.skip(!ON, 'rf_cart_state is off in this run (QA_OVERLAY)');

        test('marks the sizes in the cart and names them under the pills, "(3 in cart)" in the size\'s name (stories 40 and 68)', async ({ page }) => {
            let body = [];
            await answerCartRead(page, () => body);
            await open(page, 'product@sizes');
            const sizes = await sizesOf(page);
            expect(sizes.length, 'Fat Albert has several sizes').toBeGreaterThan(1);
            const size = fourteen(sizes);
            body = cartOf([{ productId: FAT_ALBERT_ID, quantity: 3, options: [sizeOption(size)] }]);
            await page.reload();
            await dismissCookieBanner(page);
            await chunkLoaded(page, 'rf-cart-state');
            const line = page.locator('[data-rf-cart-line]');
            await expect(line).toHaveText(`In your cart: 3 × size ${size.label}.`);
            const pill = page.locator(`${SIZE_GROUP} [data-product-attribute-value="${size.valueId}"]`);
            await expect(pill.locator('[data-rf-cart-dot]')).toBeVisible();
            await expect(page.locator(`${SIZE_GROUP} [data-rf-cart-dot]:visible`)).toHaveCount(1);
            const radio = page.locator(`${SIZE_GROUP} input[value="${size.valueId}"]`);
            await expect(radio).toHaveAccessibleName(new RegExp(`^${size.label}( \\(sold out\\))? \\(3 in cart\\)$`));
            const other = sizes.find(({ valueId }) => valueId !== size.valueId);
            await expect(page.locator(`${SIZE_GROUP} input[value="${other.valueId}"]`)).not.toHaveAccessibleName(/in cart/);
            // The dot sits on the pill's corner, past its edge: 7px above and 6px past the inside of its
            // 1px border, as the reference's .cdot, so 6px and 5px past the border's outside.
            await pill.scrollIntoViewIfNeeded();
            const [pillBox, dotBox] = await Promise.all([pill.boundingBox(), pill.locator('[data-rf-cart-dot]').boundingBox()]);
            expect(dotBox.width).toBe(20);
            expect(Math.round(dotBox.y - pillBox.y)).toBe(-6);
            expect(Math.round(dotBox.x + dotBox.width - (pillBox.x + pillBox.width))).toBe(5);
            // And it is painted there: the pill clips what overflows it unless it is marked.
            const hit = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('[data-rf-cart-dot]')), [dotBox.x + dotBox.width / 2, dotBox.y + 3]);
            expect(hit, 'the corner check shows past the pill\'s edge').toBe(true);
        });

        test('updates to 5 after adding 2 more, without a reload (story 40; build pipeline 6.9)', async ({ page }) => {
            let body = [];
            await answerCartRead(page, () => body);
            const adds = await answerCartAdds(page, { productId: FAT_ALBERT_ID });
            // A Colour, then a size stock can sell in it (ticket 38's guard holds a sold-out one),
            // each answered by stock.
            const choose = async label => {
                for (const choice of [page.locator(COLOUR).first(), label]) {
                    const answered = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
                    await choice.click(); // eslint-disable-line no-await-in-loop
                    await answered; // eslint-disable-line no-await-in-loop
                }
            };
            await open(page, 'product@sizes');
            await chunkLoaded(page, 'rf-add-flow');
            const sizes = await sizesOf(page);
            const answered = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
            await page.locator(COLOUR).first().click();
            await answered;
            const inStock = await page.locator(`${SIZE_GROUP} .rf-pill[data-product-attribute-value]:not(.unavailable)`).first().getAttribute('data-product-attribute-value');
            const size = sizes.find(({ valueId }) => valueId === Number(inStock));
            body = cartOf([{ productId: FAT_ALBERT_ID, quantity: 3, options: [sizeOption(size)] }]);
            await page.reload();
            await dismissCookieBanner(page);
            await chunkLoaded(page, 'rf-cart-state');
            await chunkLoaded(page, 'rf-add-flow');
            const line = page.locator('[data-rf-cart-line]');
            await expect(line).toHaveText(`In your cart: 3 × size ${size.label}.`);
            await page.evaluate(() => { window.rfNoReload = true; });
            await choose(page.locator(`${SIZE_GROUP} [data-product-attribute-value="${size.valueId}"]`));
            await page.locator('[data-quantity-change] [data-action="inc"]').click();
            await expect(page.locator('#form-action-addToCart')).toHaveValue('Add 2 to cart');
            body = cartOf([{ productId: FAT_ALBERT_ID, quantity: 5, options: [sizeOption(size)] }]);
            await page.locator('#form-action-addToCart').click();
            await expect(page.locator('[data-rf-add-status-text]')).toHaveText(new RegExp(`^Added 2 × size ${size.label}`));
            await expect(line).toHaveText(`In your cart: 5 × size ${size.label}.`);
            await expect(page.locator(`${SIZE_GROUP} input[value="${size.valueId}"]`)).toHaveAccessibleName(/\(5 in cart\)$/);
            expect(adds.length).toBe(1);
            expect(await page.evaluate(() => window.rfNoReload)).toBe(true);
        });

        test('says "6 in cart" on a pattern\'s card on a Fly Type page, a link to its product page (story 33)', async ({ page }) => {
            let body = [];
            await answerCartRead(page, () => body);
            await open(page, 'category');
            const card = page.locator('#product-listing-container .productGrid article.card').first();
            const id = Number(await card.getAttribute('data-entity-id'));
            const url = await card.locator('.card-title a').getAttribute('href');
            body = cartOf([
                { productId: id, quantity: 4, options: [{ nameId: 1, valueId: 11 }] },
                { productId: id, quantity: 2, options: [{ nameId: 1, valueId: 12 }] },
            ]);
            await page.reload();
            await dismissCookieBanner(page);
            await chunkLoaded(page, 'rf-cart-state');
            const link = page.locator(`[data-rf-cart-card="${id}"] a`);
            await expect(link).toBeVisible();
            await expect(link.locator('[data-rf-cart-count]')).toHaveText('6 in cart');
            await expect(link).toHaveAttribute('href', url);
            await expect(link).toHaveAccessibleName(/^6 in cart of .+/);
            // Every other card's line stays empty.
            await expect(page.locator('[data-rf-cart-card] a:visible')).toHaveCount(1);
        });

        for (const key of ['product@sizes', 'category']) {
            test(`reads the cart once as ${key} loads, and the answer moves nothing: no layout shift, CLS 0.05 or less (story 70)`, async ({ page }) => {
                // The page's ids first, with an empty cart; then the cart, held until the page settles.
                let body = [];
                let release = () => {};
                let held = Promise.resolve();
                await page.route('**/api/storefront/carts**', async route => {
                    if (route.request().method() !== 'GET') return route.fallback();
                    await held;
                    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
                });
                await open(page, key);
                if (key === 'category') {
                    const ids = await page.locator('#product-listing-container .productGrid article.card').evaluateAll(cards => cards.map(card => Number(card.getAttribute('data-entity-id'))));
                    body = cartOf(ids.slice(0, 3).map((productId, index) => ({ productId, quantity: index + 1 })));
                } else {
                    const sizes = await sizesOf(page);
                    body = cartOf(sizes.slice(0, 2).map((size, index) => ({ productId: FAT_ALBERT_ID, quantity: 3 - index, options: [sizeOption(size)] })));
                }
                held = new Promise(resolve => { release = resolve; });
                await page.addInitScript(() => {
                    window.rfShifts = [];
                    new PerformanceObserver(list => {
                        list.getEntries().forEach(entry => { if (!entry.hadRecentInput) window.rfShifts.push(entry.value); });
                    }).observe({ type: 'layout-shift', buffered: true });
                });
                const reads = cartReads(page);
                await page.reload();
                await dismissCookieBanner(page);
                await chunkLoaded(page, 'rf-cart-state');
                await page.waitForTimeout(1000);
                const watched = key === 'category' ? '#product-listing-container .productGrid article.card .rf-card-actions' : '#form-action-addToCart';
                const boxes = () => page.locator(watched).evaluateAll(elements => elements.map(element => {
                    const { x, y } = element.getBoundingClientRect();
                    return [Math.round(x), Math.round(y + window.scrollY)];
                }));
                const before = await boxes();
                const shiftBefore = await page.evaluate(() => window.rfShifts.reduce((sum, value) => sum + value, 0));
                release();
                await expect(page.locator(key === 'category' ? '[data-rf-cart-card] a:visible' : '[data-rf-cart-line]')).not.toHaveCount(0);
                if (key !== 'category') await expect(page.locator('[data-rf-cart-line]')).toHaveText(/^In your cart: 3 × size .+ and 2 × size .+\.$/);
                await page.waitForTimeout(500);
                const shiftAfter = await page.evaluate(() => window.rfShifts.reduce((sum, value) => sum + value, 0));
                expect(await boxes(), 'nothing below the line or the slot moved').toEqual(before);
                expect(shiftAfter - shiftBefore, 'the read added no layout shift').toBeLessThan(0.001);
                expect(shiftAfter, 'the page\'s CLS').toBeLessThanOrEqual(0.05);
                expect(reads.length, 'one read of the Cart API as the page loaded').toBe(1);
            });
        }
    });

    test.describe('with rf_cart_state off (story 73)', () => {
        test.skip(ON, 'rf_cart_state is on in this run: run with QA_OVERLAY=rf_cart_state-off');

        for (const key of ['product@sizes', 'category']) {
            test(`${key}: the stock markup, no cart-state script, and no read of the Cart API as the page loads`, async ({ page }) => {
                await answerCartRead(page, []);
                const reads = cartReads(page);
                await open(page, key);
                await page.waitForTimeout(1000);
                expect(reads).toEqual([]);
                await expect(page.locator(MARKERS)).toHaveCount(0);
                const chunks = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name).filter(name => /rf-cart-state/.test(name)));
                expect(chunks).toEqual([]);
            });
        }
    });
});
