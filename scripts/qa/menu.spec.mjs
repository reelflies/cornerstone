// The grouped menu and the phone drawer in a browser (ticket 28; spec modules 3 and 4, seam 2;
// stories 4, 5, 6, 9, 10, 19, 68 and 72), on the pinned pages of QA_CHANNEL, at 375 and 1280. The
// look is the page baselines' (the drawer-open and panel-open states, screens.spec.mjs); the
// markup is render/partials/menu.test.mjs's and the rf-menu raw-HTML assertion's.
//
// - The curl test: each product and category pin's raw HTML, fetched with no JavaScript, links
//   every URL the menu ids and the store's own tree call for (menu-urls.mjs, from the page's
//   ?debug=context) inside the header's <nav>, with the rail in that order.
// - At 1280: "Shop flies" opens the panel on the first Fly Type's pane with focus on its rail
//   item; the rail reads the Fly Types in rf_menu_type_ids order, a divider and Flies by Species
//   where there is one, then More from ReelFlies; the pane's heading is the link, beside the
//   rail, its children in two columns; a rail item shows its own pane; Escape closes it.
// - At 375: Menu opens the drawer and <html data-rf-open> holds "drawer"; each row is its name
//   as a link and a 48px chevron button that opens its children in place; the footer lists
//   Account, the Help pages the channel has, the hook size chart, the articles and the phone.
// - axe finds no serious or critical issue in the menu with a row or a pane open.
// - No ReelFlies script adds, removes or changes a link in the menu.
// - With both ids empty (ReelFlies CA until tree 4, or QA_OVERLAY=menu-ids-empty) the stock
//   navigation renders in #menu; with the Species id empty, there is no Species group.
// - Tree 4 (6 Fly Types, Flies by Species and its 11 names) on W0-9's fixture page, until
//   refactor 13 gives a channel that tree.
//
// It isn't a gate in qa:prepush; ticket 28 runs it, and any ticket that changes the menu:
//
//   QA_PORT=3500 QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs menu.spec
//   QA_PORT=3500 npx playwright test --config scripts/qa/playwright.config.mjs menu.spec
//   QA_PORT=3500 QA_CHANNEL=1 QA_OVERLAY=menu-ids-empty npx playwright test --config scripts/qa/playwright.config.mjs menu.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { test as fixtureTest } from '@playwright/test';
import {
    PAGES, dismissCookieBanner, expect, pinPath, storefrontPage, test,
} from './fixtures.mjs';
import {
    expectedUrls, isGrouped, menuGroups, railNames,
} from './menu-urls.mjs';
import { pageKind } from './pages.mjs';
import {
    links, menuProblems, menuSource, railFromHtml,
} from './raw-html/assertions/rf-menu.mjs';
import { chunkLoaded } from './states.mjs';
import { HEADERS, QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { readFixture, widgetCases } from './render/render.mjs';
import { openWidget } from './render/widget-page.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = ['serious', 'critical'];
const ROW = 48;
const desktop = testInfo => testInfo.project.name === 'desktop-1280';
const label = QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : '';

const PINS = Object.keys(PAGES);
const CURL_PINS = PINS.filter(key => ['product', 'category'].includes(pageKind(key)));
const MAIN_PIN = PINS.filter(key => pageKind(key) === 'category')[0] || (PINS.includes('home') ? 'home' : PINS[0]);
const pathOf = href => new URL(href, 'http://storefront.test').pathname;

const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
});

// The page's own store data, from stencil start's ?debug=context. It carries the storefront API
// token, so nothing here prints or keeps it: only the categories and the menu settings are read.
async function storeData(request, key) {
    const response = await request.get(`${PAGES[key]}${PAGES[key].includes('?') ? '&' : '?'}debug=context`, { headers: HEADERS });
    expect(response.status(), `?debug=context on ${key}`).toBe(200);
    const context = await response.json();
    return {
        categories: context.categories || [],
        settings: context.theme_settings || {},
        pages: (context.pages || []).map(({ url }) => url),
        blog: Boolean(context.settings && context.settings.blog_enabled),
        phone: (context.settings && context.settings.phone_number) || '',
    };
}

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    await chunkLoaded(page, 'rf-header');
    if (await page.locator('[data-rf-menu]').count()) await chunkLoaded(page, 'rf-menu');
}

const menuAxe = page => new AxeBuilder({ page }).include('#menu').withTags(TAGS).analyze();
const axeProblems = violations => violations.filter(violation => BLOCKING.includes(violation.impact))
    .map(violation => `${violation.id} (${violation.impact}) on ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);

for (const key of CURL_PINS) {
    test(`${key}: the raw HTML, with no JavaScript, links every URL the menu ids and the tree call for in the header's <nav> (curl)${label}`, async ({ request }, testInfo) => {
        test.skip(desktop(testInfo), 'the raw HTML is the same at every width');
        const data = await storeData(request, key);
        const response = await request.get(pinPath(key), { headers: HEADERS });
        expect(response.status()).toBe(200);
        const html = await response.text();
        if (!isGrouped(data.settings)) {
            expect(menuSource(html), 'both ids empty: the stock navigation, no grouped menu').toBe(null);
            expect(html).toMatch(/id="menu" data-menu>/);
            testInfo.annotations.push({ type: 'menu', description: 'stock fallback: both menu ids are empty in this run' });
            return;
        }
        expect(menuProblems(html)).toEqual([]);
        const found = links(menuSource(html)).map(({ attrs }) => pathOf(String(attrs.href).replace(/&amp;/g, '&')));
        const expected = expectedUrls(data.categories, data.settings).map(pathOf);
        expect(expected.length, 'the menu ids find categories in this channel\'s tree').toBeGreaterThan(0);
        expect(expected.filter(url => !found.includes(url)), 'URLs missing from the menu').toEqual([]);
        expect(railFromHtml(html).flatMap(group => group.rows), 'the rail, in order').toEqual(railNames(menuGroups(data.categories, data.settings)));
        testInfo.annotations.push({ type: 'menu', description: `${expected.length} category URLs, every one an <a href> in the menu` });
    });
}

test(`${MAIN_PIN}: with both ids empty the stock navigation renders, and with the Species id empty there is no Species group${label}`, async ({ page, request }, testInfo) => {
    test.skip(desktop(testInfo), 'the markup is the same at every width');
    const data = await storeData(request, MAIN_PIN);
    await open(page, MAIN_PIN);
    if (!isGrouped(data.settings)) {
        await expect(page.locator('[data-rf-menu]')).toHaveCount(0);
        await expect(page.locator('#menu[data-menu] nav.navPages')).toHaveCount(1);
        return;
    }
    await expect(page.locator('#menu[data-menu]'), 'no data-menu: stock menu.js binds nothing').toHaveCount(0);
    await expect(page.locator('#menu .navPages')).toHaveCount(0);
    const species = menuGroups(data.categories, data.settings).species;
    await expect(page.locator('.rf-menu-group--species')).toHaveCount(species ? 1 : 0);
    if (!String(data.settings.rf_menu_species_root_id || '').trim()) testInfo.annotations.push({ type: 'menu', description: 'the Species id is empty: no Species group' });
});

test(`${MAIN_PIN}: "Shop flies" opens the grouped panel on the first Fly Type's pane, the rail in order, and a rail item shows its own pane${label}`, async ({ page, request }, testInfo) => {
    test.skip(!desktop(testInfo), 'the panel is the desktop layout');
    const data = await storeData(request, MAIN_PIN);
    test.skip(!isGrouped(data.settings), 'the stock fallback renders: both menu ids are empty in this run');
    const groups = menuGroups(data.categories, data.settings);
    await open(page, MAIN_PIN);
    const shop = page.getByRole('button', { name: 'Shop flies' });
    await shop.press('Enter');
    await expect(shop).toHaveAttribute('aria-expanded', 'true');
    const nav = page.locator('[data-rf-menu]');
    await expect(nav).toBeVisible();
    expect((await box(nav)).top, 'the panel opens under the row').toBeGreaterThanOrEqual((await box(page.locator('[data-rf-header-row]'))).bottom - 1);

    const first = groups.types[0] || groups.species;
    const firstToggle = nav.locator(`[aria-controls="rf-menu-pane-${first.id}"]`);
    await expect(firstToggle, 'the first Fly Type\'s rail item has focus').toBeFocused();
    await expect(firstToggle).toHaveAttribute('aria-expanded', 'true');
    const pane = page.locator(`#rf-menu-pane-${first.id}`);
    await expect(pane).toBeVisible();
    await expect(nav.locator('[data-rf-menu-pane]:visible')).toHaveCount(1);

    // The rail, top to bottom: the visible rail items' names.
    const rail = await nav.locator('.rf-menu-toggle-name:visible, .rf-menu-name--plain:visible').evaluateAll(items => items
        .map(item => ({ name: item.textContent.trim(), top: item.getBoundingClientRect().top })));
    expect(rail.map(item => item.name)).toEqual(railNames(groups));
    expect(rail.map(item => item.top), 'one above the other').toEqual([...rail.map(item => item.top)].sort((a, b) => a - b));
    await expect(nav.locator('.rf-menu-label:visible')).toHaveText([...(groups.types.length ? ['Fly types'] : []), 'More from ReelFlies']);
    await expect(nav.locator('.rf-menu-sep:visible')).toHaveCount(groups.species ? 1 : 0);

    // The pane: beside the rail, its heading the link, its children in two columns.
    const heading = pane.locator('h2 a');
    await expect(heading).toHaveText(first.name);
    expect(pathOf(await heading.getAttribute('href'))).toBe(pathOf(first.url));
    expect((await box(pane)).left, 'beside the rail').toBeGreaterThanOrEqual((await box(firstToggle)).right);
    const lefts = new Set(await pane.locator('.rf-menu-kids a').evaluateAll(kids => kids.map(kid => Math.round(kid.getBoundingClientRect().left))));
    if (first.children.length > 1) expect(lefts.size, 'two columns').toBe(2);
    expect(await nav.locator(':visible').evaluateAll(elements => elements.map(element => element.textContent.trim()))
        .then(texts => texts.filter(text => /^(All\s|Shop all)/i.test(text))), 'no "All …" or "Shop all" line').toEqual([]);

    // A rail item shows its own pane, alone.
    const second = [...groups.types, ...(groups.species ? [groups.species] : [])][1];
    if (second) {
        const secondToggle = nav.locator(`[aria-controls="rf-menu-pane-${second.id}"]`);
        await secondToggle.press('Enter');
        await expect(secondToggle).toHaveAttribute('aria-expanded', 'true');
        await expect(firstToggle).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator(`#rf-menu-pane-${second.id}`)).toBeVisible();
        await expect(pane).toBeHidden();
    }

    await page.keyboard.press('Escape');
    await expect(shop).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    await expect(shop).toBeFocused();
});

test(`${MAIN_PIN}: the drawer's rows are the name as a link and a 48px chevron that opens the children in place, then the footer${label}`, async ({ page, request }, testInfo) => {
    test.skip(desktop(testInfo), 'the drawer is the phone layout');
    const data = await storeData(request, MAIN_PIN);
    test.skip(!isGrouped(data.settings), 'the stock fallback renders: both menu ids are empty in this run');
    await open(page, MAIN_PIN);
    const menuButton = page.locator('[data-mobile-menu-toggle]');
    await menuButton.tap();
    const nav = page.locator('[data-rf-menu]');
    await expect(nav).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-rf-open', /(^|\s)drawer(\s|$)/);

    const rows = nav.locator('.rf-menu-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
        const row = rows.nth(index);
        const name = row.locator('.rf-menu-name');
        const button = row.locator('[data-rf-menu-toggle]');
        /* eslint-disable no-await-in-loop */
        const nameBox = await box(name);
        const buttonBox = await box(button);
        expect(nameBox.height, `${await name.textContent()}: a 48px row`).toBeGreaterThanOrEqual(ROW - 0.5);
        expect(Math.round(buttonBox.width), 'a 48px chevron').toBeGreaterThanOrEqual(ROW);
        expect(Math.round(buttonBox.height), 'a 48px chevron').toBeGreaterThanOrEqual(ROW);
        expect(buttonBox.left, 'the chevron after the name').toBeGreaterThanOrEqual(nameBox.right - 1);
        await expect(button).toHaveAccessibleName(`Show ${(await name.textContent()).trim()}`);
        /* eslint-enable no-await-in-loop */
    }
    await expect(nav.locator('.rf-menu-heading:visible'), 'the row\'s name is the link: the pane\'s heading hides').toHaveCount(0);

    const first = rows.first();
    const toggle = first.locator('[data-rf-menu-toggle]');
    const paneId = await toggle.getAttribute('aria-controls');
    const pane = page.locator(`#${paneId}`);
    const nextBefore = count > 1 ? (await box(rows.nth(1))).top : null;
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(pane).toBeVisible();
    expect((await box(pane)).top, 'the children open under the row').toBeGreaterThanOrEqual((await box(first)).bottom - 1);
    if (nextBefore !== null) expect((await box(rows.nth(1))).top, 'in place: the next row moves down').toBeGreaterThan(nextBefore);
    const kid = pane.locator('.rf-menu-kids a').first();
    expect((await box(kid)).height, 'a 48px child row').toBeGreaterThanOrEqual(ROW - 0.5);
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(pane).toBeHidden();

    // The footer.
    const footer = nav.locator('[data-rf-menu-foot]');
    await footer.scrollIntoViewIfNeeded();
    const expected = ['Account',
        ...(data.pages.some(url => url.includes('/shipping-returns/')) ? ['Shipping & Returns'] : []),
        ...(data.pages.some(url => url.includes('/contact-us/')) ? ['Contact us'] : []),
        'Hook size chart',
        ...(data.blog ? ['Fly fishing articles'] : []),
        ...(data.phone ? [data.phone] : []),
    ];
    await expect(footer.locator('a:visible')).toHaveText(expected);
    if (data.phone) {
        await expect(footer.getByText(`Call ${data.phone}`)).toBeVisible();
        await expect(footer.getByRole('link', { name: data.phone })).toHaveAttribute('href', `tel:+${data.phone.replace(/ /g, '')}`);
    }

    await page.keyboard.press('Escape');
    await expect(menuButton).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    await expect(page.locator('html')).not.toHaveAttribute('data-rf-open', /drawer/);
});

test(`${MAIN_PIN}: no serious or critical axe issue in the menu, with a row open at 375 and a pane open at 1280${label}`, async ({ page }, testInfo) => {
    await open(page, MAIN_PIN);
    const grouped = await page.locator('[data-rf-menu]').count();
    if (desktop(testInfo)) {
        await page.getByRole('button', { name: 'Shop flies' }).press('Enter');
    } else {
        await page.locator('[data-mobile-menu-toggle]').tap();
        if (grouped) await page.locator('#menu [data-rf-menu-toggle]').first().tap();
    }
    await expect(page.locator('#menu')).toBeVisible();
    if (grouped) await expect(page.locator('#menu [data-rf-menu-pane]:visible')).toHaveCount(1);
    const problems = axeProblems((await menuAxe(page)).violations);
    if (!grouped) testInfo.annotations.push({ type: 'menu', description: 'stock fallback: see axe-known-issues.mjs for its sub-menu' });
    expect(problems.filter(problem => grouped || !problem.startsWith('aria-hidden-focus'))).toEqual([]);
});

test(`${MAIN_PIN}: no ReelFlies script adds, removes or changes a link in the menu (story 72)${label}`, async ({ page, request }, testInfo) => {
    const response = await request.get(pinPath(MAIN_PIN), { headers: HEADERS });
    const nav = menuSource(await response.text());
    test.skip(!nav, 'the stock fallback renders: both menu ids are empty in this run');
    const served = links(nav).map(({ attrs }) => pathOf(String(attrs.href).replace(/&amp;/g, '&').replace(/&#x3D;/g, '=')));
    await open(page, MAIN_PIN);
    if (desktop(testInfo)) {
        await page.getByRole('button', { name: 'Shop flies' }).press('Enter');
        await page.locator('#menu [data-rf-menu-toggle]').last().press('Enter');
    } else {
        await page.locator('[data-mobile-menu-toggle]').tap();
        await page.locator('#menu [data-rf-menu-toggle]').first().tap();
    }
    const live = await page.locator('[data-rf-menu] a').evaluateAll(anchors => anchors.map(anchor => new URL(anchor.getAttribute('href'), 'http://storefront.test').pathname));
    expect(live).toEqual(served);
});

// Tree 4, as refactor 13 plans it, on W0-9's fixture page (the shipping strip's, which renders
// the theme's header round it with this checkout's CSS): no channel has tree 4's categories
// until refactor 13. The page has no scripts, so the panel and the drawer are opened as
// header.js, stock mobile-menu-toggle.js and menu.js open them: the classes and attributes only.
const STRIP_CASE = widgetCases().find(({ widget, name }) => widget === 'shipping-strip' && name === 'default');
const TREE_4 = readFixture(path.join(path.dirname(new URL(import.meta.url).pathname), 'render/partials/menu/tree-4.json'));
const TREE_4_CASE = {
    ...STRIP_CASE,
    fixture: {
        ...STRIP_CASE.fixture,
        page_context: {
            ...STRIP_CASE.fixture.page_context,
            categories: TREE_4.categories,
            theme_settings: TREE_4.theme_settings,
            settings: { phone_number: '1 866 250 4071', blog_enabled: true },
            urls: {
                home: '/', search: '/search.php', cart: '/cart.php', auth: { login: '/login.php' },
            },
        },
    },
};

fixtureTest('tree 4 on the fixture page: the rail\'s six Fly Types, the divider and Flies by Species, then More, and the drawer\'s rows', async ({ page }, testInfo) => {
    fixtureTest.skip(Boolean(QA_OVERLAY), 'the fixture page renders no overlay');
    const { problems } = await openWidget(page, TREE_4_CASE, { variation: QA_VARIATION });
    expect(problems).toEqual([]);
    const nav = page.locator('[data-rf-menu]');
    if (desktop(testInfo)) {
        await page.evaluate(() => {
            document.getElementById('menu').classList.add('rf-is-panel-open');
            document.querySelector('[data-rf-shop]').setAttribute('aria-expanded', 'true');
            const toggle = document.querySelector('[data-rf-menu-toggle]');
            toggle.setAttribute('aria-expanded', 'true');
            document.getElementById(toggle.getAttribute('aria-controls')).hidden = false;
        });
        await expect(nav).toBeVisible();
        const order = await nav.locator('.rf-menu-label:visible, .rf-menu-sep:visible, .rf-menu-toggle-name:visible, .rf-menu-name--plain:visible, .rf-menu-foot a:visible')
            .evaluateAll(items => items.map(item => ({ text: item.textContent.trim() || '—', top: item.getBoundingClientRect().top })).sort((a, b) => a.top - b.top).map(item => item.text));
        expect(order).toEqual(['Fly types', 'Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies', '—', 'Flies by Species',
            'More from ReelFlies', 'Fly Selections & Assortments', 'Fly Gear', 'Clearance', 'Hook size chart']);
        const pane = page.locator('#rf-menu-pane-501');
        await expect(pane.locator('h2 a')).toHaveText('Dry Flies');
        const lefts = new Set(await pane.locator('.rf-menu-kids a').evaluateAll(kids => kids.map(kid => Math.round(kid.getBoundingClientRect().left))));
        expect(lefts.size, 'two columns').toBe(2);
        expect((await box(pane)).left).toBeGreaterThanOrEqual((await box(nav.locator('[data-rf-menu-toggle]').first())).right);
        expect(axeProblems((await new AxeBuilder({ page }).include('#menu').withTags(TAGS).analyze()).violations)).toEqual([]);
        return;
    }
    await page.evaluate(() => {
        document.getElementById('menu').classList.add('is-open');
        const toggle = document.querySelector('[aria-controls="rf-menu-pane-520"]');
        toggle.setAttribute('aria-expanded', 'true');
        document.getElementById('rf-menu-pane-520').hidden = false;
    });
    await expect(nav).toBeVisible();
    const species = page.locator('#rf-menu-pane-520 .rf-menu-kids a');
    await expect(species).toHaveCount(11);
    await expect(species.first()).toHaveText('Trout Flies');
    expect((await box(page.locator('.rf-menu-sep'))).bottom, 'the divider above Flies by Species').toBeLessThanOrEqual((await box(page.locator('[aria-controls="rf-menu-pane-520"]'))).top);
    expect(axeProblems((await new AxeBuilder({ page }).include('#menu').withTags(TAGS).analyze()).violations)).toEqual([]);
});
