// Quick search in a browser (ticket 30; spec modules 4 and 5; stories 1, 2, 3 and 68), on the pinned
// pages of QA_CHANNEL, at 375 and 1280. The server HTML is the raw-HTML assertion rf-search-forms;
// the look of the phone row is the page baselines' (screens.spec.mjs); the dropdown's logic is
// Jest's (assets/js/test-unit/theme/reelflies/quick-search.spec.js).
//
// - Typing a pattern name into the visible field (the phone row at 375, the header's at 1280)
//   sends one request, 400 ms after the last key, and shows the count heading, up to 2 categories
//   labelled as categories, each with its arrow tile, at most 6 product rows at 375 and 8 at
//   1280, each with its price, and "See all N results" with the heading's N. ReelFlies_CA has no
//   products until refactor 14, so the rows are checked on channel 1 (QA_CHANNEL=1); on 1895766
//   the heading says nothing matched.
// - The heading's words are announced once, through the shared live region.
// - With the dropdown open, <html data-rf-open> holds "search"; Escape closes it, clears it, and
//   leaves focus in the field; axe finds no aria-allowed-attr, or any serious or critical issue,
//   in the form.
// - With JavaScript off, Enter in the visible field lands on the search page.
// - At 375, home and category pages show the phone search row under the bar, and it scrolls away
//   with the page; other pages and the desktop layout don't show it.
// - At 375, the header's search icon opens the header's form as the bar's second row.
//
// It isn't a gate in qa:prepush; ticket 30 runs it, and any ticket that changes the header or
// the search forms:
//
//   QA_PORT=3700 npx playwright test --config scripts/qa/playwright.config.mjs quick-search.spec
//   QA_PORT=3700 QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs quick-search.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, dismissCookieBanner, expect, pinPath, storefrontPage, test,
} from './fixtures.mjs';
import { pageKind } from './pages.mjs';
import { QA_CHANNEL } from './storefront.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = ['serious', 'critical'];
const QUERY = 'caddis';
const ROWS = { 'phone-375': 6, 'desktop-1280': 8 };
const desktop = testInfo => testInfo.project.name === 'desktop-1280';
const WITH_PRODUCTS = QA_CHANNEL === '1'; // ReelFlies_CA has none until refactor 14

const PINS = Object.keys(PAGES);
const ROW_PINS = PINS.filter(key => ['home', 'category', 'search'].includes(pageKind(key)));
const NO_ROW_PINS = PINS.filter(key => !ROW_PINS.includes(key));
// The page the dropdown is checked on: a category page where the channel pins one, else home.
const SEARCH_PIN = PINS.find(key => pageKind(key) === 'category') || PINS.find(key => pageKind(key) === 'home') || PINS[0];

const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height };
});

// Waits for quick-search.js, its own chunk, to have added a dropdown to each form.
const quickSearchReady = page => page.waitForFunction(() => document.querySelectorAll('[data-rf-search-form]').length > 0
    && [...document.querySelectorAll('[data-rf-search-form]')].every(form => form.querySelector('[data-rf-qs]')));

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    await quickSearchReady(page);
}

// The field a shopper sees: the phone row's at 375 (on a page that has one), the header's at 1280.
function visibleForm(page, testInfo, key) {
    const name = !desktop(testInfo) && ROW_PINS.includes(key) ? 'phone' : 'header';
    return page.locator(`[data-rf-search-form="${name}"]`);
}

const isSearch = (url, query) => {
    const parsed = new URL(url);
    return parsed.pathname.endsWith('/search.php') && (query === undefined || parsed.searchParams.get('search_query') === query);
};

// Types the query a key at a time, and resolves once the dropdown shows its results.
async function search(page, form, query = QUERY) {
    const input = form.locator('input[name="search_query"]');
    await input.click();
    await input.pressSequentially(query, { delay: 60 });
    const dropdown = form.locator('[data-rf-qs]');
    await expect(dropdown).toBeVisible({ timeout: 30000 });
    return { input, dropdown };
}

const watchAnnouncements = page => page.evaluate(() => {
    const region = document.querySelector('[data-rf-live-region]');
    window.rfAnnounced = [];
    new MutationObserver(() => {
        const text = region.textContent.trim();
        if (text) window.rfAnnounced.push(text);
    }).observe(region, { childList: true, characterData: true, subtree: true });
});

test(`${SEARCH_PIN}: typing a pattern name shows the count, up to 2 categories, the rows with their prices and "See all" (stories 2, 3)`, async ({ page }, testInfo) => {
    const requests = [];
    page.on('request', request => {
        if (isSearch(request.url()) && request.headers()['x-requested-with'] === 'stencil-utils') requests.push(new URL(request.url()).searchParams.get('search_query'));
    });
    await open(page, SEARCH_PIN);
    const form = visibleForm(page, testInfo, SEARCH_PIN);
    await expect(form.locator('input[name="search_query"]')).toBeVisible();
    const { dropdown } = await search(page, form);
    expect(requests, 'one request, for the whole word, after the last key').toEqual([QUERY]);

    const heading = dropdown.locator('[data-rf-qs-heading]');
    const total = Number(await dropdown.locator('[data-rf-qs-results]').getAttribute('data-rf-qs-total'));
    if (WITH_PRODUCTS) expect(total, 'channel 1 has caddis flies').toBeGreaterThan(0);
    await expect(heading).toHaveText(total ? new RegExp(`^${total} results? for “${QUERY}”$`) : `No results for “${QUERY}”`);

    const categories = dropdown.locator('[data-rf-qs-categories] a');
    const categoryCount = await categories.count();
    expect(categoryCount).toBeLessThanOrEqual(2);
    if (WITH_PRODUCTS) expect(categoryCount, 'tree 1\'s nav has caddis categories').toBeGreaterThan(0);
    for (let i = 0; i < categoryCount; i += 1) {
        const link = categories.nth(i);
        await expect(link).toHaveAccessibleName(/caddis.*, category$/i); // eslint-disable-line no-await-in-loop
        await expect(link.locator('.rf-qs-kind')).toBeVisible(); // eslint-disable-line no-await-in-loop
        // The reference's arrow tile, from the template the store rendered with its icon partial
        await expect(link.locator('.rf-qs-thumb--category svg[aria-hidden="true"] use')).toHaveAttribute('href', '#rf-icon-chevron-down'); // eslint-disable-line no-await-in-loop
        await expect(link.locator('.rf-qs-thumb--category')).toBeVisible(); // eslint-disable-line no-await-in-loop
        expect(await link.getAttribute('href')).not.toMatch(/search\.php/); // eslint-disable-line no-await-in-loop
    }

    const rows = dropdown.locator('.rf-qs-products .rf-qs-item');
    const visibleRows = dropdown.locator('.rf-qs-products .rf-qs-item:visible');
    const shown = await visibleRows.count();
    expect(shown, `at most ${ROWS[testInfo.project.name]} rows at ${testInfo.project.name}`).toBeLessThanOrEqual(ROWS[testInfo.project.name]);
    if (WITH_PRODUCTS) expect(shown).toBe(Math.min(ROWS[testInfo.project.name], await rows.count()));
    for (let i = 0; i < shown; i += 1) {
        await expect(visibleRows.nth(i).locator('.rf-qs-price')).toHaveText(/\$\d+\.\d\d/); // eslint-disable-line no-await-in-loop
    }

    const all = dropdown.locator('[data-rf-qs-all]');
    if (total) {
        await expect(all).toHaveText(total === 1 ? 'See the result' : `See all ${total} results`);
        expect(isSearch(new URL(await all.getAttribute('href'), page.url()).href, QUERY)).toBe(true);
        const order = await Promise.all([heading, dropdown.locator('[data-rf-qs-categories]'), visibleRows.first(), all]
            .filter((_, index) => index !== 1 || categoryCount > 0)
            .map(locator => box(locator).then(({ top }) => top)));
        expect(order, 'heading, categories, rows, then "See all", top to bottom').toEqual([...order].sort((a, b) => a - b));
    } else {
        await expect(all).toHaveCount(0);
    }
});

test(`${SEARCH_PIN}: the heading is announced once through the shared live region, and the open state follows the dropdown (story 68, GEO-3)`, async ({ page }, testInfo) => {
    await open(page, SEARCH_PIN);
    await watchAnnouncements(page);
    const form = visibleForm(page, testInfo, SEARCH_PIN);
    const { input, dropdown } = await search(page, form);
    await expect(page.locator('html')).toHaveAttribute('data-rf-open', /(^|\s)search(\s|$)/);
    await expect.poll(() => page.evaluate(() => window.rfAnnounced.length)).toBe(1);
    await page.waitForTimeout(600); // nothing more follows
    const heading = (await dropdown.locator('[data-rf-qs-heading]').textContent()).trim();
    expect(await page.evaluate(() => window.rfAnnounced)).toEqual([heading]);

    await page.keyboard.press('Escape');
    await expect(dropdown).toBeHidden();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(QUERY);
    await expect(page.locator('html')).not.toHaveAttribute('data-rf-open', /(^|\s)search(\s|$)/);

    await input.blur();
    await input.focus();
    await expect(dropdown, 'focusing the field again shows the last results').toBeVisible();
    await page.keyboard.press('Shift+Tab');
    await expect(dropdown, 'focus leaving the form closes it').toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-rf-open', /(^|\s)search(\s|$)/);
});

test(`${SEARCH_PIN}: axe finds no aria-allowed-attr on the field, and no serious or critical issue, with the dropdown open (story 68)`, async ({ page }, testInfo) => {
    await open(page, SEARCH_PIN);
    const form = visibleForm(page, testInfo, SEARCH_PIN);
    const { input } = await search(page, form);
    for (const attr of ['role', 'aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete']) {
        await expect(input, `the simple model: no ${attr}`).not.toHaveAttribute(attr, /.*/); // eslint-disable-line no-await-in-loop
    }
    const name = await form.getAttribute('data-rf-search-form');
    const { violations } = await new AxeBuilder({ page }).include(`[data-rf-search-form="${name}"]`).withTags(TAGS).analyze();
    expect(violations.filter(violation => violation.id === 'aria-allowed-attr').map(violation => violation.id)).toEqual([]);
    expect(violations.filter(violation => BLOCKING.includes(violation.impact))
        .map(violation => `${violation.id} (${violation.impact}) on ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
});

test.describe('with JavaScript off', () => {
    test.use({ javaScriptEnabled: false });

    for (const key of [...new Set([SEARCH_PIN, ...ROW_PINS])]) {
        test(`${key}: Enter in the visible search field lands on the search page (story 3)`, async ({ page }, testInfo) => {
            await page.goto(pinPath(key), { waitUntil: 'load' });
            const form = visibleForm(page, testInfo, key);
            const input = form.locator('input[name="search_query"]');
            await expect(input).toBeVisible();
            await input.fill(QUERY);
            const [response] = await Promise.all([
                page.waitForResponse(answer => answer.request().isNavigationRequest() && isSearch(answer.url(), QUERY)),
                input.press('Enter'),
            ]);
            expect(response.status()).toBe(200);
            await page.waitForURL(url => isSearch(url.href, QUERY));
        });
    }
});

for (const key of ROW_PINS) {
    test(`${key}: at 375 the phone search row sits under the bar and scrolls away; at 1280 it is hidden (story 1)`, async ({ page }, testInfo) => {
        await open(page, key);
        const row = page.locator('[data-rf-phone-search]');
        if (desktop(testInfo)) {
            await expect(row).toBeHidden();
            return;
        }
        const input = row.getByRole('searchbox', { name: 'Search flies' });
        await expect(input).toBeVisible();
        await expect(input).toHaveAttribute('placeholder', 'Search flies by name');
        const header = page.locator('[data-rf-header]');
        const bar = await box(header);
        const first = await box(row);
        expect(first.top, 'right under the 56px bar').toBeGreaterThanOrEqual(bar.bottom - 1);
        expect(first.top).toBeLessThanOrEqual(bar.bottom + 1);
        await page.evaluate(() => window.scrollTo(0, 400));
        expect((await box(header)).top, 'the bar stays').toBe(0);
        expect((await box(row)).bottom, 'the row scrolls away with the page').toBeLessThan(0);
    });
}

for (const key of NO_ROW_PINS) {
    test(`${key}: no phone search row`, async ({ page }) => {
        await open(page, key);
        await expect(page.locator('[data-rf-phone-search]')).toHaveCount(0);
    });
}

test(`${PINS.includes('home') ? 'home' : PINS[0]}: at 375 the header's search icon opens the header's form as the bar's second row, and Escape closes it`, async ({ page }, testInfo) => {
    test.skip(desktop(testInfo), 'the toggle is the phone header\'s');
    const key = PINS.includes('home') ? 'home' : PINS[0];
    await open(page, key);
    await expect(page.locator('[data-rf-search-link]')).toBeHidden();
    const toggle = page.locator('[data-rf-search-toggle]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAccessibleName('Search');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const form = page.locator('[data-rf-search-form="header"]');
    await expect(form).toBeHidden();
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(form).toBeVisible();
    await expect(form.locator('input[name="search_query"]')).toBeFocused();
    const bar = await box(page.locator('[data-rf-header]'));
    expect((await box(form)).bottom, 'inside the bar, as its second row').toBeLessThanOrEqual(bar.bottom + 1);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(form).toBeHidden();
    await expect(toggle).toBeFocused();
});
