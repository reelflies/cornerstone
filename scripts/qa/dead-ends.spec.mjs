// The three dead ends in a browser (ticket 51; spec module 24; O20, O24; stories 66, 67, 68 and
// 71), on the pins of QA_CHANNEL, at 375 and 1280: the 404 page (404), the empty cart (cart: the
// gates' browser has no cart) and a search for a word nothing matches (search@none). Their markup
// is render/partials/dead-ends.test.mjs's, their server HTML the dead-ends assertion's, their look
// the page screenshots', and a search with the platform's suggestions search-empty-screens.spec's.
//
// - Each answers its own status (the 404 page 404), and has one main landmark and one H1 after
//   its scripts have run; axe's landmark and heading rules find no serious or critical issue.
// - The Fly Type links are the channel's menu ids, in order, as the store's own categories
//   (?debug=context) resolve them, top level and one level down: tree 1's on channel 1. With both
//   ids empty (ReelFlies CA until wave R1, or the menu-ids-empty overlay), there is no list.
// - Every link in a dead end, the empty cart's way forward among them, answers 200 (curl).
// - Keyboard focus moves through a dead end's controls and links in their order on the page, and
//   the empty cart has no heading that takes focus.
// - The search help names the query as text: a query of markup creates no element and runs no
//   script (the XSS check).
// - Nothing scrolls sideways at 320.
//
// It runs only when named, like category.spec.mjs: no npm script's filter matches it.
//
//   QA_PORT=<yours> npx playwright test --config scripts/qa/playwright.config.mjs dead-ends.spec
//   QA_PORT=<yours> QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs dead-ends.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { HEADERS, QA_CHANNEL, ROOT } from './storefront.mjs';
import { withQuery } from './switches.mjs';

const LANG = JSON.parse(fs.readFileSync(path.join(ROOT, 'lang/en.json'), 'utf8'));
const DEAD_ENDS = {
    404: '[data-rf-not-found]',
    cart: '[data-rf-cart-empty]',
    'search@none': '[data-rf-search-empty]',
};
const PINS = Object.keys(DEAD_ENDS).filter(key => PAGES[key]);
// axe's landmark and heading rules (story 68; ticket 51's criterion 4).
const RULES = [
    'landmark-banner-is-top-level', 'landmark-complementary-is-top-level', 'landmark-contentinfo-is-top-level', 'landmark-main-is-top-level',
    'landmark-no-duplicate-banner', 'landmark-no-duplicate-contentinfo', 'landmark-no-duplicate-main', 'landmark-one-main', 'landmark-unique',
    'page-has-heading-one', 'heading-order', 'empty-heading', 'p-as-heading',
];
// A query of markup for the XSS check: if it were printed as markup, the image would fail to load
// and set the flag.
const XSS_QUERY = 'qzxjv<img src=qzxjw onerror="window.rfXss=1"> & qzxjk';
// The store sends forms.search.query escaped; the page shows it as text, decoded.
const decode = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'").replace(/&amp;/g, '&');

async function storeContext(request, pagePath) {
    const response = await request.get(withQuery(pagePath, 'debug=context'), { headers: HEADERS });
    return response.json();
}

// The links the menu ids should give, as menu-links.html resolves them: each id in order, among
// the top-level categories and one level down.
function expectedLinks(context) {
    const settings = context.theme_settings || {};
    const ids = [settings.rf_menu_type_ids, settings.rf_menu_species_root_id].flatMap(list => String(list || '').split(',')).map(id => id.trim()).filter(Boolean);
    const all = (context.categories || []).flatMap(top => [top, ...(top.children || [])]);
    return ids.flatMap(id => all.filter(found => String(found.id) === id)).map(found => ({ id: String(found.id), name: found.name }));
}

const localPath = href => {
    const url = new URL(href);
    return `${url.pathname}${url.search}`;
};

async function open(page, key, pagePath) {
    await storefrontPage(page, key, pagePath);
    await dismissCookieBanner(page);
}

test.skip(!PINS.length, `no dead end (404, cart, search@none) is pinned for channel ${QA_CHANNEL}`);

for (const key of PINS) {
    const selector = DEAD_ENDS[key];

    test.describe(`${key} (${PAGES[key]})`, () => {
        test('has one main landmark and one H1, and axe\'s landmark and heading rules find no serious or critical issue (story 68)', async ({ page }) => {
            await open(page, key);
            await expect(page.locator(selector)).toHaveCount(1);
            await expect(page.locator('main, [role="main"]')).toHaveCount(1);
            await expect(page.locator(`main ${selector}, [role="main"] ${selector}`)).toHaveCount(1);
            await expect(page.locator('h1')).toHaveCount(1);
            const { violations } = await new AxeBuilder({ page }).withRules(RULES).analyze();
            const serious = violations.filter(violation => ['serious', 'critical'].includes(violation.impact));
            expect(serious.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(' ')).join('; ')})`)).toEqual([]);
        });

        test('lists the channel\'s Fly Types and Species hub in menu order, from the store\'s own categories, or nothing with both ids empty (story 66)', async ({ page, request }) => {
            const expected = expectedLinks(await storeContext(request, PAGES[key]));
            await open(page, key);
            const links = page.locator(`${selector} [data-rf-dead-end-links] a`);
            if (!expected.length) {
                await expect(page.locator(`${selector} ul`), 'with both menu ids empty, no list').toHaveCount(0);
                return;
            }
            expect(await links.evaluateAll(found => found.map(link => link.dataset.rfMenuId))).toEqual(expected.map(link => link.id));
            await expect(links).toHaveText(expected.map(link => link.name));
        });

        test('every link in it answers 200 (curl)', async ({ page }) => {
            await open(page, key);
            const hrefs = await page.locator(`${selector} a[href]`).evaluateAll(found => found.map(link => link.href));
            if (key === 'cart') expect(hrefs.length, 'the empty cart always offers a way forward').toBeGreaterThan(0);
            for (const href of hrefs) {
                const response = await page.request.get(localPath(href), { headers: HEADERS, maxRedirects: 0 }); // eslint-disable-line no-await-in-loop
                expect(response.status(), `${href} answers`).toBe(200);
            }
        });

        test('keyboard focus moves through its controls and links in their order on the page (story 67)', async ({ page }, testInfo) => {
            test.skip(testInfo.project.name !== 'desktop-1280', 'once is enough: the order is the markup\'s');
            await open(page, key);
            const deadEnd = page.locator(selector);
            const order = await deadEnd.evaluate(element => [...element.querySelectorAll('a[href], input:not([type="hidden"]), button')].map(found => found.outerHTML));
            // The empty cart always has its way forward and the 404 its search box; a search's help
            // has only its links, none while both menu ids are empty.
            if (key !== 'search@none') expect(order.length).toBeGreaterThan(0);
            // Start from the dead end's first line of text, as a click there would.
            await deadEnd.locator('p').first().click({ position: { x: 1, y: 1 } });
            const visited = [];
            for (let step = 0; step < order.length; step += 1) {
                await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
                visited.push(await page.evaluate(() => document.activeElement.outerHTML)); // eslint-disable-line no-await-in-loop
            }
            expect(visited).toEqual(order);
            const focusable = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(headings => headings.filter(heading => heading.tabIndex >= 0).map(heading => heading.outerHTML));
            expect(focusable, 'no heading takes focus').toEqual([]);
        });

        test('nothing scrolls sideways at 320 (story 71)', async ({ page }, testInfo) => {
            test.skip(testInfo.project.name !== 'phone-375', 'the viewport is set here, once');
            await page.setViewportSize({ width: 320, height: 640 });
            await open(page, key);
            const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
            expect(widths.scroll, `the page is ${widths.scroll}px wide in a ${widths.client}px viewport`).toBeLessThanOrEqual(widths.client);
        });
    });
}

test.describe('the empty cart', () => {
    test.skip(!PAGES.cart, `no cart pin on channel ${QA_CHANNEL}`);

    test('says so in plain text under the H1, then the reference\'s line and its way forward', async ({ page }) => {
        await open(page, 'cart');
        const empty = page.locator('[data-rf-cart-empty]');
        await expect(empty.locator('p').nth(0)).toHaveText(LANG.reelflies.cart_empty.message);
        await expect(empty.locator('p').nth(1)).toHaveText(LANG.reelflies.cart_empty.lead);
        const shop = empty.locator('[data-rf-cart-empty-shop]');
        await expect(shop).toHaveText(await page.locator('[data-rf-dead-end-links]').count() ? LANG.reelflies.cart_empty.shop : LANG.reelflies.cart_empty.continue);
        await expect(page.locator('h3')).toHaveCount(0);
    });
});

test.describe('a search for a word nothing matches', () => {
    test.skip(!PAGES['search@none'], `no search@none pin on channel ${QA_CHANNEL}`);

    test('shows the no-match line naming the query, and the tip, with stock\'s no-match line and tips left out', async ({ page }) => {
        await open(page, 'search@none');
        const query = new URL(PAGES['search@none'], 'http://localhost/').searchParams.get('search_query');
        const help = page.locator('[data-rf-search-empty]');
        await expect(help.locator('[data-rf-search-empty-line]')).toHaveText(LANG.reelflies.search_empty.no_match.replace('{query}', query));
        await expect(help).toContainText(LANG.reelflies.search_empty.tip);
        await expect(page.locator('main')).not.toContainText(LANG.forms.search.suggestions.title);
    });

    test('prints a query of markup as text: no element made, no script run (the XSS check)', async ({ page, request }) => {
        const pagePath = `/search.php?search_query=${encodeURIComponent(XSS_QUERY)}&section=product`;
        const context = await storeContext(request, pagePath);
        expect(context.forms.search.query, 'the store sends the query escaped').not.toContain('<');
        await open(page, 'search@none', pagePath);
        await expect(page.locator('img[src="qzxjw"]'), 'the query made no element anywhere on the page').toHaveCount(0);
        expect(await page.evaluate(() => window.rfXss)).toBeUndefined();
        // The help shows only when nothing matched: a live catalogue can match a word of the query.
        test.skip(context.result_count !== 0, `the store found ${context.result_count} results for the query on channel ${QA_CHANNEL}`);
        const line = page.locator('[data-rf-search-empty-line]');
        await expect(line).toHaveText(LANG.reelflies.search_empty.no_match.replace('{query}', decode(context.forms.search.query).trim()));
        await expect(line).toContainText('<img src=qzxjw onerror="window.rfXss=1"> & qzxjk');
        await expect(page.locator('[data-rf-search-empty] img')).toHaveCount(0);
    });
});
