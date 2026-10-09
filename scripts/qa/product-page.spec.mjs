// The product page's layout on live product pages (ticket 39; spec module 15; O14, O23, R6, SEO-8,
// UX-11, UX-12, UX-20; stories 36, 44 to 49, 68, 70 and 71), at 375 and 1280, on channel 1: the
// product pin (6178) and Fat Albert (5663, product@sizes). ReelFlies_CA has no products until
// refactor 14. The looks are the screenshots' (the pins' page shots, and the fixture page's in
// product-page-screens.spec.mjs); this checks what a shot can't:
//
// - The order: at 1280 the photos on the left with the details under them and the buy box on the
//   right; at 375 the photos, the buy box, then the details, in one column, left-aligned.
// - At 1280 the buy box held at the top of the window as the page scrolls past the details, all of
//   it in view (story 36); the test attaches the window at the top and after scrolling.
// - The main image: the page's only fetchpriority="high", loaded from its srcset (story 70).
// - The thumbnails of a product with more than five photos (/realistic-hopper-assortment/, 15):
//   the row keeps its height when stock's carousel starts, so nothing below moves.
// - The details: "About this fly" open; the other two open and close with Enter and Space (story
//   46). "Hooks and tying" links to the hook size chart.
// - The shipping line under the price (story 44), the promise line under Add to cart (story 45),
//   and "Save to wish list": a guest who uses it is sent to sign in (story 49). The store's answer
//   to the add is mocked here (a POST on channel 1 is a live write); that the store sends a guest
//   from its wish lists to sign in is read from wishlist.php itself.
// - No weight row, no wallet buttons, and no share links in the buy box.
// - Related patterns: four cards in one row at 1280 and two across at 375, no carousel or tab, and
//   their photos lazy with no fetchpriority (story 48; O23).
// - Quick view, opened from a related card, keeps stock's product view.
// - Nothing scrolls sideways at 320, and axe finds no serious or critical issue with every section
//   open (stories 68 and 71).
//
// It runs only when named:
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs product-page.spec

/* eslint-env browser */ // the evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { QA_CHANNEL } from './storefront.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const FAT_ALBERT = '/fat-albert/';
const MANY_PHOTOS = '/realistic-hopper-assortment/'; // 15 photos (the 2026-09-07 export)
const STICKY_TOP = 24; // _product.scss's $rf-product-sticky-top
const FREE_LINE = 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.';
const phone = testInfo => testInfo.project.name === 'phone-375';

async function open(page, pagePath) {
    await storefrontPage(page, 'product', pagePath);
    await dismissCookieBanner(page);
}

// Each element's box, in page coordinates.
const boxes = (page, selectors) => page.evaluate(list => Object.fromEntries(list.map(selector => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return [selector, {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right, width: rect.width,
    }];
})), selectors);

const GALLERY = '.productView-images';
const BUY = '[data-rf-product-buy]';
const DETAILS = '[data-rf-product-details]';

test.describe('the product page layout (ticket 39)', () => {
    test.skip(QA_CHANNEL !== '1', 'ReelFlies_CA has no products until refactor 14: run with QA_CHANNEL=1');

    for (const pin of [null, FAT_ALBERT]) {
        test(`lays out the photos, the buy box and the details (story 46): ${pin || 'the product pin'}`, async ({ page }, testInfo) => {
            await open(page, pin ?? undefined);
            const at = await boxes(page, [GALLERY, BUY, DETAILS, '[data-rf-related]']);
            if (phone(testInfo)) {
                expect(at[BUY].top, 'the buy box under the photos').toBeGreaterThanOrEqual(at[GALLERY].bottom);
                expect(at[DETAILS].top, 'the details under the buy box').toBeGreaterThanOrEqual(at[BUY].bottom);
                for (const selector of [BUY, DETAILS]) expect(Math.round(at[selector].left)).toBe(Math.round(at[GALLERY].left));
                // Left-aligned throughout: stock centred the options below 551px (#75's note).
                const centred = await page.locator(`${BUY} .productView-options, ${BUY} .form-field`).evaluateAll(all => all.filter(element => getComputedStyle(element).textAlign === 'center').length);
                expect(centred, 'nothing in the buy box centred').toBe(0);
            } else {
                expect(at[BUY].left, 'the buy box right of the photos').toBeGreaterThanOrEqual(at[GALLERY].right);
                expect(Math.round(at[BUY].top), 'the buy box level with the photos').toBe(Math.round(at[GALLERY].top));
                expect(at[DETAILS].top, 'the details under the photos').toBeGreaterThanOrEqual(at[GALLERY].bottom);
                expect(Math.round(at[DETAILS].left), 'in the photos\' column').toBe(Math.round(at[GALLERY].left));
                expect(at[DETAILS].right).toBeLessThanOrEqual(at[BUY].left);
            }
            expect(at['[data-rf-related]'].top, 'related patterns after the details').toBeGreaterThanOrEqual(at[DETAILS].bottom);
        });
    }

    test('holds the buy box in view at 1280 as the page scrolls past the details (story 36)', async ({ page }, testInfo) => {
        test.skip(phone(testInfo), 'the buy box is a column of its own from 801px');
        await open(page);
        await testInfo.attach('top', { body: await page.screenshot(), contentType: 'image/png' });
        const before = await boxes(page, [BUY, DETAILS, '.productView']);
        const height = before[BUY].bottom - before[BUY].top;
        const target = Math.min(before[DETAILS].bottom - page.viewportSize().height + 40, before['.productView'].bottom - height - STICKY_TOP);
        expect(target - before[BUY].top, 'the page scrolls well past where the buy box starts').toBeGreaterThan(300);
        await page.evaluate(y => window.scrollTo(0, y), target);
        const rect = await page.locator(BUY).evaluate(element => element.getBoundingClientRect().toJSON());
        expect(Math.round(rect.top), 'held at the top of the window').toBe(STICKY_TOP);
        expect(rect.bottom, 'all of it in view').toBeLessThanOrEqual(page.viewportSize().height);
        await expect(page.locator(`${BUY} #form-action-addToCart`)).toBeInViewport();
        await expect(page.locator(DETAILS)).toBeInViewport();
        await testInfo.attach('scrolled past the details', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('loads the main image first: the only fetchpriority="high", from its srcset (story 70; SEO-8)', async ({ page }) => {
        await open(page);
        await expect(page.locator('[fetchpriority="high"]')).toHaveCount(1);
        const main = page.locator('img[data-main-image]');
        await expect(main).toHaveAttribute('fetchpriority', 'high');
        await expect(main).not.toHaveClass(/(^|\s)lazyload(\s|$)/);
        const loaded = await main.evaluate(img => ({ complete: img.complete, current: img.currentSrc, width: img.naturalWidth }));
        expect(loaded.complete && loaded.width > 0).toBe(true);
        expect(loaded.current).toMatch(/\/images\/stencil\/\d+w\/products\/6178\//);
    });

    test('keeps the thumbnail row\'s height when stock\'s carousel starts, so nothing below moves (story 70)', async ({ page }, testInfo) => {
        const measure = () => page.evaluate(selector => {
            const list = document.querySelector('.productView-thumbnails');
            return {
                slick: list.classList.contains('slick-initialized'),
                height: list.getBoundingClientRect().height,
                next: document.querySelector(selector).getBoundingClientRect().top + window.scrollY,
            };
        }, phone(testInfo) ? BUY : DETAILS);
        // Before: the theme's scripts never run, so the carousel never starts.
        const bundle = /\/theme-bundle\.(main|head_async)\.js/;
        await page.route(bundle, route => route.abort());
        await open(page, MANY_PHOTOS);
        const before = await measure();
        await page.unroute(bundle);
        await open(page, MANY_PHOTOS);
        await expect.poll(() => page.locator('.productView-thumbnails.slick-initialized').count()).toBe(1);
        const after = await measure();
        expect(before.slick).toBe(false);
        expect(after.height, 'the row\'s height').toBe(before.height);
        expect(after.next, 'what follows the photos').toBe(before.next);
        expect(await page.locator('.productView-thumbnails .productView-thumbnail').count()).toBeGreaterThan(5);
    });

    test('opens "About this fly" with the description, and the other sections with Enter and Space (story 46)', async ({ page }) => {
        await open(page);
        const section = name => page.locator(`[data-rf-details="${name}"]`);
        const isOpen = name => section(name).evaluate(details => details.open);
        expect(await isOpen('about')).toBe(true);
        await expect(section('about').locator('.rf-details-description')).toBeVisible();
        for (const name of ['shipping', 'hooks']) {
            expect(await isOpen(name)).toBe(false); // eslint-disable-line no-await-in-loop
            const summary = section(name).locator('summary');
            await summary.focus(); // eslint-disable-line no-await-in-loop
            await page.keyboard.press('Enter'); // eslint-disable-line no-await-in-loop
            expect(await isOpen(name), `${name} opens with Enter`).toBe(true); // eslint-disable-line no-await-in-loop
            await page.keyboard.press('Space'); // eslint-disable-line no-await-in-loop
            expect(await isOpen(name), `${name} closes with Space`).toBe(false); // eslint-disable-line no-await-in-loop
            await page.keyboard.press('Space'); // eslint-disable-line no-await-in-loop
            expect(await isOpen(name), `${name} opens with Space`).toBe(true); // eslint-disable-line no-await-in-loop
        }
        await expect(section('shipping')).toContainText('Free standard shipping in Canada on fly orders over $60');
        await expect(section('hooks').getByRole('link', { name: 'See the hook size chart' })).toHaveAttribute('href', '/fly-hook-size-chart/');
    });

    test('says the shipping line under the price and the promise under Add to cart (stories 44 and 45)', async ({ page }) => {
        await open(page);
        const line = page.locator(`${BUY} [data-rf-ship-line]`);
        await expect(line).toHaveText(FREE_LINE);
        const at = await boxes(page, [`${BUY} .productView-price`, `${BUY} [data-rf-ship-line]`, '#form-action-addToCart', `${BUY} [data-rf-promise]`]);
        const gap = (above, below) => at[below].top - at[above].bottom;
        expect(gap(`${BUY} .productView-price`, `${BUY} [data-rf-ship-line]`), 'the shipping line just under the price').toBeLessThanOrEqual(24);
        expect(gap(`${BUY} .productView-price`, `${BUY} [data-rf-ship-line]`)).toBeGreaterThanOrEqual(0);
        expect(gap('#form-action-addToCart', `${BUY} [data-rf-promise]`), 'the promise just under Add to cart').toBeLessThanOrEqual(24);
        expect(gap('#form-action-addToCart', `${BUY} [data-rf-promise]`)).toBeGreaterThanOrEqual(0);
        await expect(page.locator(`${BUY} [data-rf-promise]`)).toHaveText('We stand behind every fly we sell.');
    });

    test('sends a guest who saves to a wish list to sign in (story 49; UX-20)', async ({ page }) => {
        await open(page);
        // The store itself sends a guest from its wish lists to sign in (a read, so it reaches the store).
        const lists = await page.request.get('/wishlist.php', { maxRedirects: 0 });
        expect(lists.status()).toBe(302);
        expect(lists.headers().location).toMatch(/\/login\.php/);
        // Saving is a POST, a live write on channel 1: answered here as the store answers a guest.
        const posts = [];
        await page.route(/\/wishlist\.php\?action=add/, route => {
            posts.push(`${route.request().method()} ${new URL(route.request().url()).pathname}${new URL(route.request().url()).search}`);
            return route.fulfill({ status: 302, headers: { location: lists.headers().location } });
        });
        await page.getByRole('button', { name: 'Save to wish list' }).click();
        await page.waitForURL(/\/login\.php/);
        expect(posts).toEqual(['POST /wishlist.php?action=add&product_id=6178']);
        await expect(page.locator('form.login-form, form[action*="login.php"]').first()).toBeVisible();
    });

    test('shows no weight row, no wallet buttons and no share links in the buy box', async ({ page }) => {
        await open(page);
        await expect(page.locator('[data-product-weight]')).toHaveCount(0);
        await expect(page.locator('[data-add-to-cart-wallet-buttons] *')).toHaveCount(0);
        await expect(page.locator('.productView .socialLinks')).toHaveCount(0);
    });

    test('shows related patterns as a grid of cards: one row of four at 1280, two across at 375, lazy photos (story 48; O23)', async ({ page }, testInfo) => {
        await open(page);
        const related = page.locator('[data-rf-related]');
        await expect(related.getByRole('heading', { level: 2 })).toHaveText('Related patterns');
        const cards = related.locator('.card');
        await expect(cards).toHaveCount(4);
        await expect(page.locator('.productCarousel, #tab-related, #tab-similar, [data-rf-related] [role="tablist"]')).toHaveCount(0);
        const lefts = await cards.evaluateAll(all => all.map(card => [Math.round(card.getBoundingClientRect().top + window.scrollY), Math.round(card.getBoundingClientRect().left)]));
        const rows = new Set(lefts.map(([top]) => top)).size;
        expect(rows, 'rows of cards').toBe(phone(testInfo) ? 2 : 1);
        expect(new Set(lefts.map(([, left]) => left)).size, 'cards across').toBe(phone(testInfo) ? 2 : 4);
        for (const img of await related.locator('img').all()) {
            await expect(img).toHaveAttribute('loading', 'lazy'); // eslint-disable-line no-await-in-loop
            expect(await img.getAttribute('fetchpriority')).toBeNull(); // eslint-disable-line no-await-in-loop
        }
    });

    test('keeps stock\'s product view in Quick view, opened from a related card', async ({ page }, testInfo) => {
        test.skip(phone(testInfo), 'the card\'s Quick view is checked on desktop, as quick-view.spec.mjs does');
        await open(page);
        const card = page.locator('[data-rf-related] .card').filter({ has: page.locator('.quickview') }).first();
        await card.scrollIntoViewIfNeeded();
        await card.locator('.quickview').click();
        const modal = page.locator('#modal');
        await expect(modal.locator('.productView-title')).toBeVisible();
        await expect(modal.locator('.productView')).not.toHaveClass(/rf-product-view/);
        await expect(modal.locator('[data-rf-product-buy], [data-rf-product-details], [data-rf-ship-line]')).toHaveCount(0);
        await expect(modal.locator('img[data-main-image]')).not.toHaveAttribute('fetchpriority', 'high');
    });

    test('scrolls nothing sideways at 320, and axe finds no serious or critical issue with every section open (stories 68 and 71)', async ({ page }) => {
        for (const pin of [null, FAT_ALBERT]) {
            await page.setViewportSize({ width: 320, height: 640 }); // eslint-disable-line no-await-in-loop
            await open(page, pin ?? undefined); // eslint-disable-line no-await-in-loop
            await page.locator(`${DETAILS} details`).evaluateAll(all => all.forEach(section => section.setAttribute('open', ''))); // eslint-disable-line no-await-in-loop
            const width = await page.evaluate(() => document.scrollingElement.scrollWidth); // eslint-disable-line no-await-in-loop
            expect(width, `${pin || 'the product pin'} at 320`).toBeLessThanOrEqual(320);
        }
        const results = await new AxeBuilder({ page }).include('.productView').include('[data-rf-related]').withTags(TAGS).analyze();
        const serious = results.violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
        expect(serious.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
    });
});
