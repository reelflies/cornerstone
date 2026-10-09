// Quick add on live listings (ticket 43; spec module 14; UX-8, SCOPE-3; stories 29, 30, 32, 34,
// 35, 67, 68 and 70), at 375 and 1280. It checks whichever way the run renders rf_quick_add:
//
// - On (QA_CHANNEL=1 QA_OVERLAY=rf_quick_add-on, since channel 1's variation has it off; 1895766
//   has it on, and no listing with products until refactor 14, so its tests skip there):
//   - "+ Add" on exactly the cards quick-add-gate.html gives it, by the store's own
//     ?debug=context (options, not sold out in every size, not a pre-order, a cart action), and
//     no Quick view on any card; the card's full width at 375, its words' at 1280 (story 29).
//   - Royal Coachman Streamer (4831, several Fly Sizes, on the search pin): the panel with every
//     size in the store's order and the sizes stock's answer leaves out marked sold out in words
//     (story 30); the sheet modal at 375 (Tab kept in, Escape back on "+ Add"), the popover at
//     1280 closed by a Tab out, focus on the next control; axe on the page with it open (story 68).
//   - Monster Streamer Rainbow Pike Fly (5142, one size, 2/0, on the search pin): one fly added,
//     answered here (fixtures/cart/routes.mjs: never sent), "Added 1 × size 2-0. 15 flies in your
//     cart." under the button and once in the live region, the header's count, rf:cart-changed
//     (stories 32 and 34).
//   - Fat Albert (5663, Colour and Fly Sizes): the product page.
//   - After the listing is rendered again, and on page 2, "+ Add" still works.
//   - With scripts off, "+ Add" is a link to the product page (SCOPE-3).
//   - The chunk loads on the category, noindex-category and search pins, and never on the home
//     page, a product page or the cart (story 70).
// - Off (channel 1's plain run): the stock card, with Quick view, no "+ Add" anywhere, and no
//   rf-quick-add chunk (story 35).
//
// It runs only when named:
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs quick-add.spec
//   QA_CHANNEL=1 QA_OVERLAY=rf_quick_add-on npx playwright test --config scripts/qa/playwright.config.mjs quick-add.spec

/* eslint-env browser */ // the evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, SWITCH_VALUES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { HEADERS, QA_CHANNEL, QA_OVERLAY } from './storefront.mjs';
import { chunkLoaded } from './states.mjs';
import { chunkRequested, withQuery } from './switches.mjs';
import { knownIssue } from './axe-known-issues.mjs';
import { answerCartAdds, answerCartRead, cartLines } from './fixtures/cart/routes.mjs';

const ON = SWITCH_VALUES.rf_quick_add === true;
const OVERLAY = QA_OVERLAY || null;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BUTTON = '[data-rf-quick-add]';
const LISTINGS = ['category', 'search'].filter(key => PAGES[key]);
const SEVERAL = 4831; // Royal Coachman Streamer, on the search pin: several Fly Sizes
const ONE = 5142; // Monster Streamer Rainbow Pike Fly, on the search pin: one Fly Size, 2/0
const phone = testInfo => testInfo.project.name === 'phone-375';

async function context(request, pagePath) {
    const response = await request.get(withQuery(pagePath, 'debug=context'), { headers: HEADERS });
    expect(response.status(), `?debug=context on ${pagePath}`).toBe(200);
    return response.json();
}

// The cards quick-add-gate.html gives "+ Add", by the store's own data for the page.
const gets = product => Boolean(product.has_options && product.show_cart_action && !product.pre_order && product.stock_level !== 0);
const listed = data => (data.category && data.category.products) || (data.product_results && data.product_results.products) || [];

// Every request for an rf-quick-add chunk the page makes, from now on.
function chunkRequests(page) {
    const requests = [];
    page.on('request', request => {
        if (chunkRequested('rf-quick-add', request.url())) requests.push(request.url());
    });
    return requests;
}

async function openListing(page, key = 'search') {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    await chunkLoaded(page, 'rf-quick-add');
    await expect(page.locator(BUTTON).first()).toHaveAttribute('role', 'button');
}

// Taps a card's "+ Add" from the keyboard, after stock's option-change answer to the tap.
async function tap(page, productId) {
    const button = page.locator(`${BUTTON}[data-rf-quick-add="${productId}"]`);
    await button.scrollIntoViewIfNeeded();
    const answered = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
    await button.focus();
    await page.keyboard.press('Enter');
    return { button, answer: await (await answered).json() };
}

test.describe('with rf_quick_add off', () => {
    test.skip(ON, `this run renders rf_quick_add on${OVERLAY ? ` (QA_OVERLAY=${OVERLAY})` : ''}`);

    test('the listings keep the stock card, with Quick view, no "+ Add", and no quick-add chunk (story 35)', async ({ page }) => {
        test.skip(!LISTINGS.length, `channel ${QA_CHANNEL} pins no listing with products; try QA_CHANNEL=1`);
        const requests = chunkRequests(page);
        for (const key of LISTINGS) {
            await storefrontPage(page, key); // eslint-disable-line no-await-in-loop
            await expect(page.locator(BUTTON)).toHaveCount(0); // eslint-disable-line no-await-in-loop
            expect(await page.locator('.productGrid .card .quickview').count(), `${key}: Quick view on the cards`).toBeGreaterThan(0); // eslint-disable-line no-await-in-loop
        }
        expect(requests).toEqual([]);
    });
});

test.describe('with rf_quick_add on', () => {
    test.skip(!ON, 'this run renders rf_quick_add off: run it with QA_OVERLAY=rf_quick_add-on on channel 1');
    test.skip(!PAGES.search, `channel ${QA_CHANNEL} pins no listing with products until refactor 14; try QA_CHANNEL=1 QA_OVERLAY=rf_quick_add-on`);

    test('"+ Add" is on exactly the cards that get it, with no Quick view, at the card\'s width on phones and its words\' on desktop (story 29)', async ({ page, request }, testInfo) => {
        for (const key of LISTINGS) {
            const data = await context(request, PAGES[key]); // eslint-disable-line no-await-in-loop
            const expected = listed(data).filter(gets).map(product => String(product.id)).sort();
            expect(expected.length, `${key} lists cards that get "+ Add"`).toBeGreaterThan(0);
            await storefrontPage(page, key); // eslint-disable-line no-await-in-loop
            const shown = (await page.locator(`.productGrid ${BUTTON}`).evaluateAll(list => list.map(link => link.getAttribute('data-rf-quick-add')))).sort(); // eslint-disable-line no-await-in-loop
            expect(shown, key).toEqual(expected);
            await expect(page.locator('.productGrid .quickview')).toHaveCount(0); // eslint-disable-line no-await-in-loop
            const sizes = await page.locator(`.productGrid ${BUTTON}`).evaluateAll(list => list.map(link => { // eslint-disable-line no-await-in-loop
                const own = link.getBoundingClientRect();
                const body = link.closest('.card-body').getBoundingClientRect();
                return {
                    height: own.height, width: own.width, body: body.width, left: own.left - body.left,
                };
            }));
            for (const size of sizes) {
                expect(size.height).toBeGreaterThanOrEqual(40);
                expect(Math.abs(size.left)).toBeLessThan(1);
                if (phone(testInfo)) expect(Math.abs(size.width - size.body)).toBeLessThan(1);
                else expect(size.width).toBeLessThan(size.body);
            }
        }
    });

    test('several sizes: the panel, every size in the store\'s order, the sold-out ones said; a sheet at 375 and a popover at 1280 (stories 30, 67 and 68)', async ({ page, request }, testInfo) => {
        const product = (await context(request, '/royal-coachman-streamer/')).product;
        const sizes = product.options.find(option => option.display_name === 'Fly Sizes').values;
        await openListing(page);
        const { button, answer } = await tap(page, SEVERAL);
        const dialog = page.locator('[data-rf-qa-panel]');
        await expect(dialog).toHaveJSProperty('open', true);
        expect(await dialog.evaluate(element => element.matches(':modal'))).toBe(phone(testInfo));
        await expect(dialog.locator('.rf-qa-title')).toHaveText(product.title);
        await expect(dialog.locator('[data-rf-pills="size"] .form-option-variant')).toHaveText(sizes.map(value => value.label));
        const inStock = new Set((answer.data.in_stock_attributes || []).map(Number));
        const out = sizes.filter(value => !inStock.has(Number(value.id))).map(value => value.label);
        const marked = await dialog.locator('[data-rf-pills="size"] input[aria-disabled="true"] + label .form-option-variant').allTextContents();
        expect(marked.map(text => text.trim())).toEqual(out);
        if (out.length) await expect(dialog.locator('[data-rf-sold-out-line]')).toContainText(out[0]);
        await expect(dialog.locator('[data-rf-qa-close]')).toBeFocused();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        expect(await page.evaluate(() => document.documentElement.getAttribute('data-rf-open'))).toContain('quick-add');

        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact) && !knownIssue(violation.id, 'search', { overlay: OVERLAY }));
        expect(blocking.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);

        if (phone(testInfo)) {
            for (let step = 0; step < 12; step += 1) {
                await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
                expect(await dialog.evaluate(element => element.contains(document.activeElement)), `Tab ${step + 1} stays in the sheet`).toBe(true); // eslint-disable-line no-await-in-loop
            }
            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            await expect(button).toBeFocused();
        } else {
            await dialog.evaluate(element => {
                const controls = element.querySelectorAll('a[href], button, input:not([type="hidden"])');
                controls[controls.length - 1].focus();
            });
            await page.keyboard.press('Tab');
            await expect(dialog).toHaveCount(0);
            expect(await page.evaluate(id => document.activeElement.getAttribute('data-rf-quick-add') !== String(id) && document.activeElement !== document.body, SEVERAL)).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.hasAttribute('data-rf-open'))).toBe(false);
    });

    test('one size: one fly added, said once, the header told (stories 32 and 34)', async ({ page }) => {
        const adds = await answerCartAdds(page, { productId: ONE });
        await answerCartRead(page, cartLines(ONE, 15));
        await openListing(page);
        await page.evaluate(() => {
            window.rfSaid = [];
            const region = document.querySelector('[data-rf-live-region]');
            new MutationObserver(() => { if (region.textContent) window.rfSaid.push(region.textContent); }).observe(region, { childList: true, characterData: true, subtree: true });
            window.rfChanged = [];
            document.addEventListener('rf:cart-changed', event => window.rfChanged.push(event.detail));
        });
        const { button } = await tap(page, ONE);
        const status = button.locator('xpath=ancestor::div[@data-rf-qa-wrap]').locator('[data-rf-qa-status]');
        await expect(status).toHaveText('Added 1 × size 2-0. 15 flies in your cart. View cart');
        await expect(page.locator('[data-rf-qa-panel]')).toHaveCount(0);
        expect(adds).toHaveLength(1);
        await expect.poll(() => page.evaluate(() => window.rfSaid)).toEqual(['Added 1 × size 2-0. 15 flies in your cart.']);
        await expect.poll(() => page.evaluate(() => window.rfChanged)).toEqual([{ source: 'quick-add', productId: ONE }]);
        await expect(page.locator('.cart-quantity').first()).toHaveText('15');
        await expect(button).toBeFocused();
        await expect(button).not.toHaveAttribute('aria-disabled', 'true');
    });

    test('Colour and Fly Sizes (5663): the product page', async ({ page }) => {
        await storefrontPage(page, 'search', '/search.php?search_query=fat+albert&section=product');
        await dismissCookieBanner(page);
        await chunkLoaded(page, 'rf-quick-add');
        const button = page.locator(`${BUTTON}[data-rf-quick-add="5663"]`);
        await button.scrollIntoViewIfNeeded();
        await Promise.all([page.waitForURL(/\/fat-albert\/$/), button.click()]);
    });

    test('after the listing renders again, and on page 2, "+ Add" still works (delegated)', async ({ page }) => {
        await openListing(page);
        // Stock's refresh replaces the listing's markup; the same here, from the page's own HTML.
        await page.evaluate(async () => {
            const html = await (await fetch(window.location.href, { credentials: 'same-origin' })).text();
            const fresh = new DOMParser().parseFromString(html, 'text/html').querySelector('#product-listing-container');
            document.querySelector('#product-listing-container').innerHTML = fresh.innerHTML;
        });
        await expect(page.locator(`${BUTTON}[data-rf-quick-add="${SEVERAL}"]`)).toHaveAttribute('role', 'button');
        await tap(page, SEVERAL);
        await expect(page.locator('[data-rf-qa-panel]')).toHaveJSProperty('open', true);

        // Page 2 of whichever listing pin has one with "+ Add" on it.
        let found = false;
        for (const key of LISTINGS) {
            await storefrontPage(page, key, withQuery(PAGES[key], 'page=2')); // eslint-disable-line no-await-in-loop
            if (await page.locator(BUTTON).count()) { // eslint-disable-line no-await-in-loop
                found = true;
                break;
            }
        }
        expect(found, 'a listing pin has a page 2 with "+ Add" on it').toBe(true);
        await dismissCookieBanner(page);
        await chunkLoaded(page, 'rf-quick-add');
        const first = page.locator(BUTTON).first();
        const id = await first.getAttribute('data-rf-quick-add');
        const loaded = page.waitForRequest(request => request.url().includes(`/products.php?productId=${id}`));
        await first.focus();
        await page.keyboard.press('Enter');
        await loaded;
    });

    test('the quick-add chunk loads on the listing pins only: never on the home page, a product page or the cart (story 70)', async ({ page }) => {
        const requests = chunkRequests(page);
        for (const key of ['category', 'category@noindex', 'search'].filter(name => PAGES[name])) {
            requests.length = 0;
            await storefrontPage(page, key); // eslint-disable-line no-await-in-loop
            await chunkLoaded(page, 'rf-quick-add'); // eslint-disable-line no-await-in-loop
            expect(requests.length, key).toBe(1);
        }
        for (const [key, pagePath] of [['product', PAGES.product], ['home', '/'], ['cart', '/cart.php']]) {
            requests.length = 0;
            await storefrontPage(page, key, pagePath); // eslint-disable-line no-await-in-loop
            await page.waitForTimeout(500); // eslint-disable-line no-await-in-loop
            expect(requests, key).toEqual([]);
            await expect(page.locator(BUTTON)).toHaveCount(0); // eslint-disable-line no-await-in-loop
        }
    });
});

test.describe('with scripts off', () => {
    test.use({ javaScriptEnabled: false });
    test.skip(!ON, 'this run renders rf_quick_add off');
    test.skip(!PAGES.search, `channel ${QA_CHANNEL} pins no listing with products`);

    test('"+ Add" goes to the product page (SCOPE-3)', async ({ page }) => {
        await page.goto(PAGES.search);
        const button = page.locator(`${BUTTON}[data-rf-quick-add="${SEVERAL}"]`);
        await expect(button).not.toHaveAttribute('role', 'button');
        await Promise.all([page.waitForURL(/\/royal-coachman-streamer\/$/), button.click()]);
    });
});
