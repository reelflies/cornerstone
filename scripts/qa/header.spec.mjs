// The header in a browser (ticket 27; spec modules 2, 4 and 19; stories 4, 9, 57, 67 and 68), on
// the pinned pages of QA_CHANNEL, at 375 and 1280. The look is the page baselines'
// (screens.spec.mjs); the server HTML is the raw-HTML assertions rf-header, max-one-h1 and
// strip-region; the shipping strip's own place is shipping-strip-screens.spec.mjs's.
//
// - At 1280: one row holding the logo, "Shop flies", a visible search field, Account and Cart,
//   and no Saved, Compare or Gift Certificates link. "Shop flies" opens the stock menu as a panel
//   until ticket 28, and Escape closes it with focus back on the button.
// - At 375: a 56px bar that stays at the top as the page scrolls. Menu is a <button> reading
//   "Menu" with aria-expanded; open, it reads "Close" and <html data-rf-open> holds "drawer";
//   Escape closes the drawer with focus back on the button.
// - Tabbing through a category page (or the channel's first pin, where it has none) never leaves
//   the focused element under the sticky bar (WCAG 2.4.11).
// - axe finds no serious or critical issue in the header or the strip's landmark, with the
//   drawer or the panel open and closed, and no content outside a landmark there (axe region).
// - With rf_rise on, the ring plays once when the count goes up and not under reduced motion;
//   with it off (QA_OVERLAY=rf_rise-off), there is no ring and rise.js never loads.
//
// It isn't a gate in qa:prepush; ticket 27 runs it, and any ticket that changes the header:
//
//   QA_PORT=3500 npx playwright test --config scripts/qa/playwright.config.mjs header.spec
//   QA_PORT=3500 QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs header.spec
//   QA_PORT=3500 QA_OVERLAY=rf_rise-off npx playwright test --config scripts/qa/playwright.config.mjs header.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, SWITCH_VALUES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import {
    focusNotes, focusProblems, inPage, tabThrough,
} from './page-checks.mjs';
import { pageKind } from './pages.mjs';
import { chunkRequested } from './switches.mjs';
import { QA_OVERLAY } from './storefront.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = ['serious', 'critical'];
const PHONE_BAR = 56;
const STOCK_ONLY = /(^|\/)(compare(\/|$|\?)|giftcertificates\.php|wishlist\.php)/i;
const desktop = testInfo => testInfo.project.name === 'desktop-1280';
const label = overlay => (overlay ? ` under the overlay ${overlay}` : '');

// The pins the header is checked on: every pin of the channel (the header is on every page),
// and for the tab-through, the category pins, or home where the channel has none.
const PINS = Object.keys(PAGES);
const CATEGORY_PINS = PINS.filter(key => pageKind(key) === 'category');
// Object keys put 404 first, so the fallback names home where the channel pins it.
const MAIN_PIN = PINS.includes('home') ? 'home' : PINS[0];
const TAB_PINS = CATEGORY_PINS.length ? CATEGORY_PINS : [MAIN_PIN];

const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height,
    };
});

// Waits for header.js, which loads as its own chunk (rf-header) after the stock globals.
const headerReady = page => page.waitForFunction(() => performance.getEntriesByType('resource')
    .some(entry => new URL(entry.name).pathname.endsWith('/theme-bundle.chunk.rf-header.js')));

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    await headerReady(page);
}

function axeProblems(violations) {
    return violations.filter(violation => BLOCKING.includes(violation.impact))
        .map(violation => `${violation.id} (${violation.impact}) on ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
}

const headerAxe = page => new AxeBuilder({ page }).include('[data-rf-header]').include('[data-rf-strip-region]').withTags(TAGS)
    .analyze();

for (const key of PINS) {
    test(`${key}: one row at 1280, with the logo, Shop flies, the search field, Account and Cart${label(QA_OVERLAY)}`, async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the one-row header is the desktop layout');
        await open(page, key);
        const row = page.locator('[data-rf-header-row]');
        const rowBox = await box(row);
        expect(rowBox.height, 'the row is one row: 12px, the 56px logo, 12px').toBeLessThanOrEqual(81);
        const parts = {
            logo: page.locator('[data-rf-logo] a'),
            'Shop flies': page.getByRole('button', { name: 'Shop flies' }),
            search: page.getByRole('searchbox', { name: 'Search flies' }),
            Account: page.locator('[data-rf-header-row]').getByRole('link', { name: 'Account' }),
            Cart: page.locator('[data-rf-header-row]').getByRole('link', { name: /^Cart\b/ }),
        };
        const centres = {};
        for (const [name, locator] of Object.entries(parts)) {
            await expect(locator, `${name} is on screen`).toBeVisible(); // eslint-disable-line no-await-in-loop
            const part = await box(locator); // eslint-disable-line no-await-in-loop
            centres[name] = (part.top + part.bottom) / 2;
            expect(part.top, `${name} is inside the row`).toBeGreaterThanOrEqual(rowBox.top - 1);
            expect(part.bottom, `${name} is inside the row`).toBeLessThanOrEqual(rowBox.bottom + 1);
        }
        const lefts = await Promise.all(Object.values(parts).map(locator => box(locator).then(({ left }) => left)));
        expect(lefts, 'in the reference\'s order, left to right').toEqual([...lefts].sort((a, b) => a - b));
        await expect(page.locator('[data-mobile-menu-toggle]'), 'Menu is the phone\'s').toBeHidden();

        const visibleLinks = await page.locator('[data-rf-header] a:visible').evaluateAll(links => links.map(link => ({ href: link.getAttribute('href') || '', text: link.textContent.trim() })));
        expect(visibleLinks.filter(({ href }) => STOCK_ONLY.test(href)), 'no Compare, Gift Certificates or wish list link').toEqual([]);
        expect(visibleLinks.filter(({ text }) => /^(Saved|Compare|Gift Certificates?)$/i.test(text))).toEqual([]);
    });

    test(`${key}: a 56px phone bar that stays at the top, with Menu a button that reads Close while open, and Escape${label(QA_OVERLAY)}`, async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'the phone bar is the phone layout');
        await open(page, key);
        const header = page.locator('[data-rf-header]');
        expect((await box(header)).height).toBe(PHONE_BAR);
        await page.evaluate(() => window.scrollTo(0, 400));
        expect((await box(header)).top, 'the bar stays at the top as the page scrolls').toBe(0);
        await page.evaluate(() => window.scrollTo(0, 0));

        const menu = page.locator('[data-mobile-menu-toggle]');
        await expect(menu).toHaveJSProperty('tagName', 'BUTTON');
        await expect(menu).toHaveAccessibleName('Menu');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(menu.locator('.rf-header-menu-label:visible')).toHaveText('Menu');

        await menu.tap();
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        await expect(menu).toHaveAccessibleName('Close');
        await expect(menu.locator('.rf-header-menu-label:visible')).toHaveText('Close');
        await expect(page.locator('#menu')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-rf-open', /(^|\s)drawer(\s|$)/);
        expect((await box(header)).height, 'the bar doesn\'t grow with the drawer open').toBe(PHONE_BAR);

        await page.keyboard.press('Escape');
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#menu')).toBeHidden();
        await expect(menu).toBeFocused();
        await expect(menu).toHaveAccessibleName('Menu');
        await expect(page.locator('html')).not.toHaveAttribute('data-rf-open', /drawer/);
    });

    test(`${key}: "Shop flies" opens the menu panel at 1280 until ticket 28, and Escape closes it${label(QA_OVERLAY)}`, async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), '"Shop flies" is the desktop control');
        await open(page, key);
        const shop = page.getByRole('button', { name: 'Shop flies' });
        await expect(shop).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#menu')).toBeHidden();
        await shop.press('Enter');
        await expect(shop).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#menu')).toBeVisible();
        const panel = await box(page.locator('#menu'));
        const header = await box(page.locator('[data-rf-header-row]'));
        expect(panel.top, 'the panel opens under the row').toBeGreaterThanOrEqual(header.bottom - 1);
        await page.keyboard.press('Escape');
        await expect(shop).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator('#menu')).toBeHidden();
        await expect(shop).toBeFocused();
    });

    test(`${key}: no serious or critical axe issue in the header or the strip's landmark, closed and open${label(QA_OVERLAY)}`, async ({ page }, testInfo) => {
        await open(page, key);
        expect(axeProblems((await headerAxe(page)).violations), 'closed').toEqual([]);
        const control = desktop(testInfo) ? page.getByRole('button', { name: 'Shop flies' }) : page.locator('[data-mobile-menu-toggle]');
        await (desktop(testInfo) ? control.press('Enter') : control.tap());
        await expect(control).toHaveAttribute('aria-expanded', 'true');
        expect(axeProblems((await headerAxe(page)).violations), desktop(testInfo) ? 'with the panel open' : 'with the drawer open').toEqual([]);
    });

    test(`${key}: no script error, though the stock scripts no longer find the stock header's markup${label(QA_OVERLAY)}`, async ({ page }) => {
        // quick-search.js, cart-preview.js and compare-products.js bind to markup that was in the
        // stock navigation.html, which the ReelFlies header no longer includes.
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await open(page, key);
        expect(errors).toEqual([]);
    });

    test(`${key}: nothing in the header or the strip is content outside a landmark (axe region)${label(QA_OVERLAY)}`, async ({ page }) => {
        await open(page, key);
        const { violations } = await new AxeBuilder({ page }).withRules(['region']).analyze();
        const nodes = violations.flatMap(violation => violation.nodes.map(node => node.target.join(' ')));
        const inHeaderOrStrip = await page.evaluate(targets => targets.filter(target => {
            const element = document.querySelector(target);
            return element && Boolean(element.closest('[data-rf-header], [data-rf-strip-region], [data-content-region="header_bottom--global"]'));
        }), nodes);
        expect(inHeaderOrStrip).toEqual([]);
    });
}

for (const key of TAB_PINS) {
    test(`${key}: tabbing through never leaves the focused element under the sticky header${label(QA_OVERLAY)}`, async ({ page }, testInfo) => {
        test.setTimeout(180000);
        await open(page, key);
        const { steps, end } = await tabThrough(page);
        testInfo.annotations.push({ type: 'tab-through', description: `${steps.length} focused elements; ${end}` });
        focusNotes(steps).forEach(note => testInfo.annotations.push({ type: 'focus note', description: note }));
        expect(steps.length, `Tab reached no element on ${key}`).toBeGreaterThan(0);
        const problems = focusProblems(steps);
        expect(problems, `${key} at ${testInfo.project.name}${problems.length ? `: ${problems.length} covered, first ${problems[0]}` : ''}`).toEqual([]);
    });
}

test(`the rise ring plays once when the cart count goes up, and not under reduced motion${label(QA_OVERLAY)}`, async ({ page }) => {
    test.skip(SWITCH_VALUES.rf_rise !== true, 'rf_rise is off in this run');
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await open(page, MAIN_PIN);
    const ring = page.locator('[data-rf-rise]');
    await expect(ring).toHaveCount(1);
    await expect.poll(() => requested.some(url => chunkRequested('rf-rise', url)), { message: 'rise.js loads with rf_rise on' }).toBe(true);
    await page.waitForFunction(() => document.querySelector('.rf-header-cart .cart-quantity')?.textContent.trim() !== '');

    await page.evaluate(inPage, { check: 'bumpCart' });
    await expect(ring).toHaveClass(/\bis-rising\b/);
    const playing = await ring.evaluate(element => element.getAnimations().map(animation => animation.animationName));
    expect(playing).toEqual(['rf-rise']);
    await expect(ring).not.toHaveClass(/\bis-rising\b/, { timeout: 2000 });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(inPage, { check: 'bumpCart' });
    await expect(ring).not.toHaveClass(/\bis-rising\b/);
    await expect(ring).toBeHidden();
});

test(`with rf_rise off, the cart count is stock: no ring and no rise script${label(QA_OVERLAY)}`, async ({ page }) => {
    test.skip(SWITCH_VALUES.rf_rise !== false, 'rf_rise is on in this run: QA_OVERLAY=rf_rise-off renders it off');
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await open(page, MAIN_PIN);
    await expect(page.locator('[data-rf-rise]')).toHaveCount(0);
    await expect(page.locator('[data-rf-header] .countPill.cart-quantity')).toHaveCount(1);
    expect(requested.filter(url => chunkRequested('rf-rise', url))).toEqual([]);
});
