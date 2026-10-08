// The desktop rail and the banner strip in a browser (ticket 29; spec module 3, the behaviour
// half; UX-2, O08, O09, SEO-3; stories 4, 7, 8, 15 and 16), on the grouped menu of QA_CHANNEL's
// category pin (channel 1's tree 1 with "ReelFlies CA channel 1" until tree 4), and tree 4 on
// W0-9's fixture page. The look is the panel-open state's baseline (screens.spec.mjs); the
// markup is render/partials/menu-banner.test.mjs's and the rf-menu-banner assertion's; menu.js's
// timing is Jest's (menu.spec.js).
//
// - The diagonal (UX-2): a straight line from the first Fly Type to its first child, at 125, 250,
//   500 and 1000 ms, keeps its pane open, though it crosses other rail items.
// - Hover switches a pane only after the pointer rests 300 ms; a click switches at once, and a
//   click on the item hover has just opened leaves it open (story 4).
// - Keys (story 8): the arrows, Home and End move along the rail, Enter opens a pane, Escape
//   closes the panel with focus on "Shop flies", and tabbing out of the panel either way closes it.
// - Height (UX-2): at 1366x657 the whole rail shows and the panel ends above the viewport's
//   bottom; a pane taller than the space scrolls inside the panel.
// - The banner (O09; story 7): at 1280 each pane whose category has an image shows it, no
//   taller than 120px, with the child links within 200px of the panel's top; at 375, with the
//   panel closed, and for a closed pane, no banner is downloaded.
// - The rail's foot links the hook size chart (stories 15 and 16).
// - axe finds no serious or critical issue in the menu with each pane open at 1280.
//
// The menu script's size is check-bundle.mjs's (rf-menu, 8,000 B gzip). It isn't a gate in
// qa:prepush; ticket 29 runs it, and any ticket that changes the menu:
//
//   QA_PORT=3500 QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs rail.spec
//   QA_PORT=3500 npx playwright test --config scripts/qa/playwright.config.mjs rail.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { test as fixtureTest } from '@playwright/test';
import {
    PAGES, dismissCookieBanner, expect, pinPath, storefrontPage, test,
} from './fixtures.mjs';
import { findCategory } from './menu-urls.mjs';
import { pageKind } from './pages.mjs';
import { findTags, outerHtml } from './raw-html/html.mjs';
import { menuSource } from './raw-html/assertions/rf-menu.mjs';
import { chunkLoaded } from './states.mjs';
import { HEADERS, QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { readFixture, widgetCases } from './render/render.mjs';
import { openWidget } from './render/widget-page.mjs';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = ['serious', 'critical'];
const HOVER = 300; // menu.js's HOVER_DELAY
const BANNER_MAX = 120; // O09
const KIDS_WITHIN = 200; // O09: the child links start within 200px of the panel's top
const LAPTOP = { width: 1366, height: 657 }; // a 1366x768 laptop less the browser's chrome (UX-2)
const MARGIN = 16; // _rail.scss: between the panel and the viewport's bottom
const ROW_MAX = 81; // header.spec.mjs: the desktop row is 12px, the 56px logo, 12px at most
const DESKTOP = 'desktop-1280';
const desktop = testInfo => testInfo.project.name === DESKTOP;
const label = QA_OVERLAY ? ` under the overlay ${QA_OVERLAY}` : '';

const PINS = Object.keys(PAGES);
const MAIN_PIN = PINS.filter(key => pageKind(key) === 'category')[0] || (PINS.includes('home') ? 'home' : PINS[0]);

const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
});
const centre = rect => ({ x: rect.left + (rect.width / 2), y: rect.top + (rect.height / 2) });
const menuAxe = page => new AxeBuilder({ page }).include('#menu').withTags(TAGS).analyze();
const axeProblems = violations => violations.filter(violation => BLOCKING.includes(violation.impact))
    .map(violation => `${violation.id} (${violation.impact}) on ${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(' | ')}`);
// The file a store image request asks for, whatever its size: the path after /images/stencil/<size>/.
const imageFile = url => (String(url).match(/\/images\/stencil\/[^/]+\/(.+?)(?:\?.*)?$/) || [])[1] || null;
const loaded = image => image.evaluate(element => element.complete || new Promise(resolve => {
    element.addEventListener('load', resolve);
    element.addEventListener('error', resolve);
}));

// The page's categories, from stencil start's ?debug=context. The context carries the storefront
// API token, so only the categories are read, and nothing is printed or kept.
async function storeCategories(request) {
    const response = await request.get(`${PAGES[MAIN_PIN]}${PAGES[MAIN_PIN].includes('?') ? '&' : '?'}debug=context`, { headers: HEADERS });
    expect(response.status(), `?debug=context on ${MAIN_PIN}`).toBe(200);
    return (await response.json()).categories || [];
}

// Opens the pin, skipping the test where the stock fallback renders (both menu ids empty).
async function open(page) {
    await storefrontPage(page, MAIN_PIN);
    await dismissCookieBanner(page);
    await chunkLoaded(page, 'rf-header');
    const grouped = await page.locator('[data-rf-menu]').count();
    test.skip(!grouped, 'the stock fallback renders: both menu ids are empty in this run');
    await chunkLoaded(page, 'rf-menu');
}

// "Shop flies" opens the panel from the keyboard, on the first Fly Type's pane with focus on its
// rail item (ticket 28).
async function openPanel(page) {
    const shop = page.getByRole('button', { name: 'Shop flies' });
    await shop.press('Enter');
    const shown = page.locator('#menu [data-rf-menu-toggle][aria-expanded="true"]');
    await expect(shown).toHaveCount(1);
    return {
        shop,
        nav: page.locator('[data-rf-menu]'),
        toggles: page.locator('#menu [data-rf-menu-toggle]'),
        rail: page.locator('#menu [data-rf-menu-toggle], #menu .rf-menu-name--plain'),
    };
}

const paneOf = async (page, toggle) => page.locator(`#${await toggle.getAttribute('aria-controls')}`);

for (const ms of [125, 250, 500, 1000]) {
    test(`${MAIN_PIN}: a straight line from the first Fly Type to its first child, in ${ms} ms, keeps its pane open (UX-2; stories 4 and 8)${label}`, async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the rail is the desktop layout');
        await open(page);
        const { toggles } = await openPanel(page);
        const first = toggles.first();
        const pane = await paneOf(page, first);
        const from = centre(await box(first));
        const to = centre(await box(pane.locator('.rf-menu-kids a').first()));
        const items = await toggles.evaluateAll(buttons => buttons.map(button => {
            const rect = button.getBoundingClientRect();
            return {
                name: button.querySelector('.rf-menu-toggle-name').textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
            };
        }));
        await page.mouse.move(from.x, from.y);
        const steps = 25;
        const crossed = new Set();
        for (let step = 1; step <= steps; step += 1) {
            const x = from.x + (((to.x - from.x) * step) / steps);
            const y = from.y + (((to.y - from.y) * step) / steps);
            items.slice(1).filter(item => x >= item.left && x <= item.right && y >= item.top && y <= item.bottom).forEach(item => crossed.add(item.name));
            /* eslint-disable no-await-in-loop */
            await page.mouse.move(x, y);
            await page.waitForTimeout(ms / steps);
            /* eslint-enable no-await-in-loop */
        }
        await page.waitForTimeout(2 * HOVER);
        expect([...crossed].length, 'the line crosses other rail items on its way').toBeGreaterThan(0);
        await expect(first).toHaveAttribute('aria-expanded', 'true');
        await expect(pane).toBeVisible();
        await expect(page.locator('#menu [data-rf-menu-pane]:visible')).toHaveCount(1);
        testInfo.annotations.push({ type: 'rail', description: `crossed ${[...crossed].join(', ')} on the way to the first child` });
    });
}

test(`${MAIN_PIN}: hover switches a pane after a 300 ms rest; a click switches at once, and a click after hover keeps the pane open (UX-2; story 4)${label}`, async ({ page }, testInfo) => {
    test.skip(!desktop(testInfo), 'the rail is the desktop layout');
    await open(page);
    const { toggles } = await openPanel(page);
    const second = toggles.nth(1);
    const third = toggles.nth(2);
    const point = centre(await box(second));
    await page.mouse.move(point.x, point.y);
    const started = Date.now();
    await page.waitForTimeout(HOVER / 2);
    expect(await second.getAttribute('aria-expanded'), 'not before the pointer has rested 300 ms').toBe('false');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    expect(Date.now() - started).toBeGreaterThanOrEqual(HOVER - 10);
    await expect(toggles.first()).toHaveAttribute('aria-expanded', 'false');

    // Hover, then a click on the same item: the critique's desktop menu finding closed it.
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(2 * HOVER);
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await expect(await paneOf(page, second)).toBeVisible();

    // A click on another item switches at once, before any hover wait could.
    await third.click();
    await expect(third).toHaveAttribute('aria-expanded', 'true', { timeout: HOVER / 2 });
    await expect(await paneOf(page, third)).toBeVisible();
    await expect(page.locator('#menu [data-rf-menu-pane]:visible')).toHaveCount(1);
});

test(`${MAIN_PIN}: the arrows, Home and End move along the rail, Enter opens a pane, Escape closes the panel, and tabbing out of it closes it (story 8)${label}`, async ({ page }, testInfo) => {
    test.skip(!desktop(testInfo), 'the rail is the desktop layout');
    await open(page);
    const {
        shop, nav, toggles, rail,
    } = await openPanel(page);
    const count = await rail.count();
    const first = toggles.first();
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rail.nth(1)).toBeFocused();
    await expect(first, 'moving along the rail leaves the pane as it was').toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(rail.nth(1)).toHaveAttribute('aria-expanded', 'true');
    await expect(await paneOf(page, rail.nth(1))).toBeVisible();
    await expect(first).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowUp');
    await expect(first).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rail.nth(count - 1), 'round to the bottom').toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await page.keyboard.press('End');
    await expect(rail.nth(count - 1)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(first, 'round to the top').toBeFocused();

    await page.keyboard.press('Escape');
    await expect(shop).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    await expect(shop).toBeFocused();

    // Shift+Tab from the first rail item goes back to the header row: the panel closes. (It
    // opens again on the pane last shown, with focus on that item: Home goes to the first.)
    await openPanel(page);
    await expect(rail.nth(1)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(first).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(shop).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('[data-rf-header-row]'))), 'focus stays where it went, in the header row').toBe(true);

    // Tab on through the panel and out past its foot: the panel closes.
    await shop.focus();
    await openPanel(page);
    for (let presses = 0; presses < 80; presses += 1) {
        /* eslint-disable no-await-in-loop */
        await page.keyboard.press('Tab');
        if (!(await page.evaluate(() => Boolean(document.activeElement.closest('#menu'))))) break;
        /* eslint-enable no-await-in-loop */
    }
    expect(await page.evaluate(() => Boolean(document.activeElement.closest('#menu'))), 'focus left the panel').toBe(false);
    await expect(shop).toHaveAttribute('aria-expanded', 'false');
    await expect(nav).toBeHidden();
});

test(`${MAIN_PIN}: at 1366x657 the whole rail shows with the panel open, and the panel ends above the viewport's bottom (UX-2)${label}`, async ({ page }, testInfo) => {
    test.skip(!desktop(testInfo), 'the rail is the desktop layout');
    await page.setViewportSize(LAPTOP);
    await open(page);
    const { nav } = await openPanel(page);
    const card = await box(nav);
    expect(card.bottom, 'the panel ends 16px above the viewport\'s bottom').toBeLessThanOrEqual(LAPTOP.height - MARGIN + 0.5);
    const parts = await page.locator('#menu .rf-menu-label:visible, #menu .rf-menu-toggle:visible, #menu .rf-menu-name--plain:visible, #menu [data-rf-menu-foot] a:visible')
        .evaluateAll(elements => elements.map(element => {
            const rect = element.getBoundingClientRect();
            return { text: element.textContent.trim(), top: rect.top, bottom: rect.bottom };
        }));
    expect(parts.length).toBeGreaterThan(3);
    expect(parts.filter(part => part.top < card.top || part.bottom > card.bottom).map(part => part.text), 'the whole rail is in the panel without scrolling').toEqual([]);
    expect(await nav.evaluate(element => element.scrollTop)).toBe(0);
    testInfo.annotations.push({ type: 'rail', description: `panel ${Math.round(card.top)}–${Math.round(card.bottom)}px, rail foot at ${Math.round(parts[parts.length - 1].bottom)}px, at 1366x657` });
});

test(`${MAIN_PIN}: a pane taller than the space scrolls inside the panel, which still ends above the viewport's bottom (UX-2)${label}`, async ({ page }, testInfo) => {
    test.skip(!desktop(testInfo), 'the rail is the desktop layout');
    // Short enough that the first pane's children run past the panel: its 11 children on channel 1.
    const short = { width: LAPTOP.width, height: 400 };
    await page.setViewportSize(short);
    await open(page);
    const { nav, toggles } = await openPanel(page);
    const pane = await paneOf(page, toggles.first());
    const card = await box(nav);
    expect(card.bottom).toBeLessThanOrEqual(short.height - MARGIN + 0.5);
    const space = await nav.evaluate(element => element.clientHeight);
    expect((await box(pane)).height, 'the pane is taller than the space').toBeGreaterThan(space);
    const last = pane.locator('.rf-menu-kids a').last();
    expect((await box(last)).top, 'its last child starts below the panel').toBeGreaterThan(card.bottom);
    const scrollY = await page.evaluate(() => window.scrollY);
    await nav.hover();
    await page.mouse.wheel(0, 2000);
    await expect.poll(async () => (await box(last)).bottom, { message: 'the panel scrolls to its last child' }).toBeLessThanOrEqual(card.bottom + 0.5);
    expect(await page.evaluate(() => window.scrollY), 'the page stays where it was').toBe(scrollY);
    await expect(nav).toBeVisible();
});

test(`${MAIN_PIN}: at 1280 each pane whose category has an image shows it, no taller than 120px, with the child links within 200px of the panel's top (O09; story 7)${label}`, async ({ page, request }, testInfo) => {
    test.skip(!desktop(testInfo), 'the banner is desktop only');
    const categories = await storeCategories(request);
    await open(page);
    const { nav, toggles } = await openPanel(page);
    const shown = [];
    for (let index = 0; index < await toggles.count(); index += 1) { // eslint-disable-line no-await-in-loop
        /* eslint-disable no-await-in-loop */
        const toggle = toggles.nth(index);
        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        const pane = await paneOf(page, toggle);
        const id = (await toggle.getAttribute('aria-controls')).replace('rf-menu-pane-', '');
        const category = findCategory(categories, id);
        const banner = pane.locator('[data-rf-menu-banner]');
        if (!(category && category.image && category.image.data)) {
            await expect(banner, `${id} has no image in the categories data`).toHaveCount(0);
        } else {
            await expect(banner).toBeVisible();
            await loaded(banner);
            expect(await banner.evaluate(image => image.naturalWidth), `${category.name}'s banner loaded`).toBeGreaterThan(0);
            const strip = await box(banner);
            const heading = await box(pane.locator('h2'));
            const kid = await box(pane.locator('.rf-menu-kids a').first());
            const panel = await box(nav);
            expect(strip.height, `${category.name}: no taller than 120px`).toBeLessThanOrEqual(BANNER_MAX + 0.5);
            expect(strip.left, `${category.name}: beside the heading`).toBeGreaterThanOrEqual(heading.left);
            expect(Math.abs(strip.top - heading.top), `${category.name}: level with the heading`).toBeLessThanOrEqual(1);
            expect(kid.top - panel.top, `${category.name}: the child links within 200px of the panel's top`).toBeLessThanOrEqual(KIDS_WITHIN);
            shown.push(`${category.name} ${Math.round(strip.width)}x${Math.round(strip.height)}, children at ${Math.round(kid.top - panel.top)}px`);
        }
        /* eslint-enable no-await-in-loop */
    }
    testInfo.annotations.push({ type: 'banner', description: shown.length ? shown.join('; ') : 'no pane has an image in this run' });
});

test(`${MAIN_PIN}: no banner is downloaded at 375, with the panel closed, or for a closed pane (O09, SEO-3; story 7)${label}`, async ({ page, request }, testInfo) => {
    // The banners the served HTML holds, by pane, and the file each asks the CDN for.
    const nav = menuSource(await (await request.get(pinPath(MAIN_PIN), { headers: HEADERS })).text());
    test.skip(!nav, 'the stock fallback renders: both menu ids are empty in this run');
    const banners = findTags(nav, 'div').filter(tag => 'data-rf-menu-pane' in tag.attrs).flatMap(tag => {
        const [image] = findTags(outerHtml(nav, 'div', attrs => attrs.id === tag.attrs.id) || '', 'img');
        return image ? [{ pane: tag.attrs.id, file: imageFile(image.attrs.src) }] : [];
    });
    test.skip(!banners.length, 'no pane has an image in this run');
    const requested = [];
    page.on('request', entry => requested.push(imageFile(entry.url())));
    await open(page);
    // An image the page shows outside the menu, such as the category's own header image, isn't
    // a banner's request.
    const elsewhere = await page.evaluate(() => [...document.images].filter(image => !image.closest('#menu'))
        .map(image => [image.currentSrc, image.src, image.srcset, image.dataset.srcset].join(' ')).join(' '));
    const watched = banners.filter(banner => !elsewhere.includes(banner.file));
    const fetched = () => watched.filter(banner => requested.includes(banner.file)).map(banner => banner.pane);
    testInfo.annotations.push({ type: 'banner', description: `watching ${watched.length} of ${banners.length} banners (the rest are shown elsewhere on the page)` });

    if (!desktop(testInfo)) {
        await page.locator('[data-mobile-menu-toggle]').tap();
        const chevrons = page.locator('#menu [data-rf-menu-toggle]');
        for (let index = 0; index < await chevrons.count(); index += 1) await chevrons.nth(index).tap(); // eslint-disable-line no-await-in-loop
        await expect(page.locator('#menu [data-rf-menu-toggle][aria-expanded="false"]')).toHaveCount(0);
        await page.waitForTimeout(1000);
        expect(fetched(), 'at 375, with every row open in the drawer').toEqual([]);
        return;
    }
    expect(fetched(), 'at 1280 with the panel closed').toEqual([]);
    const { toggles } = await openPanel(page);
    const first = await toggles.first().getAttribute('aria-controls');
    const banner = page.locator(`#${first} [data-rf-menu-banner]`);
    if (await banner.count()) await loaded(banner);
    await page.waitForTimeout(500);
    expect(fetched(), 'only the shown pane\'s banner').toEqual(watched.some(entry => entry.pane === first) ? [first] : []);
});

test(`${MAIN_PIN}: the rail's foot links the hook size chart (stories 15 and 16)${label}`, async ({ page }, testInfo) => {
    test.skip(!desktop(testInfo), 'the rail is the desktop layout');
    await open(page);
    const { rail } = await openPanel(page);
    const foot = page.locator('#menu [data-rf-menu-foot] a:visible');
    await expect(foot).toHaveCount(1);
    await expect(foot).toHaveText('Hook size chart');
    expect(new URL(await foot.getAttribute('href'), 'http://storefront.test').pathname).toBe('/fly-hook-size-chart/');
    expect((await box(foot)).top, 'at the foot of the rail').toBeGreaterThanOrEqual((await box(rail.last())).bottom);
});

test(`${MAIN_PIN}: no serious or critical axe issue in the menu with each pane open at 1280${label}`, async ({ page }, testInfo) => {
    test.skip(!desktop(testInfo), 'the panes beside the rail are the desktop layout');
    await open(page);
    const { toggles } = await openPanel(page);
    const problems = [];
    for (let index = 0; index < await toggles.count(); index += 1) { // eslint-disable-line no-await-in-loop
        /* eslint-disable no-await-in-loop */
        const toggle = toggles.nth(index);
        await toggle.click();
        const id = await toggle.getAttribute('aria-controls');
        const banner = page.locator(`#${id} [data-rf-menu-banner]`);
        if (await banner.count()) await loaded(banner);
        problems.push(...axeProblems((await menuAxe(page)).violations).map(problem => `${id}: ${problem}`));
        /* eslint-enable no-await-in-loop */
    }
    expect(problems).toEqual([]);
});

// Tree 4, as refactor 13 plans it, on W0-9's fixture page (menu.spec.mjs's case): no channel has
// tree 4's categories until refactor 13. The page has no scripts, so the panel is opened as
// header.js and menu.js open it, by its classes and attributes. Two categories get an image (the
// fixture page has no such file, so it shows as a box of the banner's size).
const STRIP_CASE = widgetCases().find(({ widget, name }) => widget === 'shipping-strip' && name === 'default');
const TREE_4 = readFixture(path.join(path.dirname(new URL(import.meta.url).pathname), 'render/partials/menu/tree-4.json'));
const IMAGE = id => ({ data: `https://cdn11.bigcommerce.com/s-test/images/stencil/{:size}/c/category-${id}__1.original.jpg`, alt: '' });
const TREE_4_CASE = {
    ...STRIP_CASE,
    fixture: {
        ...STRIP_CASE.fixture,
        page_context: {
            ...STRIP_CASE.fixture.page_context,
            categories: TREE_4.categories.map(category => (['501', '520'].includes(category.id) ? { ...category, image: IMAGE(category.id) } : category)),
            theme_settings: TREE_4.theme_settings,
            settings: { phone_number: '1 866 250 4071', blog_enabled: true },
            urls: {
                home: '/', search: '/search.php', cart: '/cart.php', auth: { login: '/login.php' },
            },
        },
    },
};

async function openFixturePanel(page, paneId) {
    await page.evaluate(id => {
        document.getElementById('menu').classList.add('rf-is-panel-open');
        document.querySelector('[data-rf-shop]').setAttribute('aria-expanded', 'true');
        const toggle = document.querySelector(`[aria-controls="${id}"]`);
        toggle.setAttribute('aria-expanded', 'true');
        document.getElementById(id).hidden = false;
    }, paneId);
    await expect(page.locator('[data-rf-menu]')).toBeVisible();
}

fixtureTest('tree 4 on the fixture page: at 1366x657 the whole rail (six Fly Types, Flies by Species, three More) fits under a full-height header row', async ({ page }, testInfo) => {
    fixtureTest.skip(Boolean(QA_OVERLAY), 'the fixture page renders no overlay');
    fixtureTest.skip(!desktop(testInfo), 'the rail is the desktop layout');
    await page.setViewportSize(LAPTOP);
    const { problems } = await openWidget(page, TREE_4_CASE, { variation: QA_VARIATION });
    expect(problems).toEqual([]);
    await openFixturePanel(page, 'rf-menu-pane-501');
    const nav = page.locator('[data-rf-menu]');
    const card = await box(nav);
    const foot = await box(nav.locator('[data-rf-menu-foot] a:visible'));
    expect(await nav.evaluate(element => element.scrollHeight - element.clientHeight), 'no scrolling: the rail fits').toBeLessThanOrEqual(1);
    // The fixture's header has no logo image, so its row is shorter than the store's: measure the
    // rail from the card's top, and put the store's tallest row (81px) and the 8px gap above it.
    const needed = ROW_MAX + 8 + (foot.bottom - card.top) + 2 + MARGIN;
    expect(needed, 'the store\'s header row, the gap, the rail to its foot and the margin fit 657px').toBeLessThanOrEqual(LAPTOP.height);
    testInfo.annotations.push({ type: 'rail', description: `tree 4's rail ends ${Math.round(foot.bottom - card.top)}px below the panel's top: ${Math.round(needed)}px of 657 with the store's header` });
});

fixtureTest('tree 4 on the fixture page: the Species pane at 1280, with a banner beside its heading and its names within 200px of the top, and no axe issue', async ({ page }, testInfo) => {
    fixtureTest.skip(Boolean(QA_OVERLAY), 'the fixture page renders no overlay');
    fixtureTest.skip(!desktop(testInfo), 'the panes beside the rail are the desktop layout');
    await openWidget(page, TREE_4_CASE, { variation: QA_VARIATION });
    await openFixturePanel(page, 'rf-menu-pane-520');
    const pane = page.locator('#rf-menu-pane-520');
    const panel = await box(page.locator('[data-rf-menu]'));
    const strip = await box(pane.locator('[data-rf-menu-banner]'));
    const kid = await box(pane.locator('.rf-menu-kids a').first());
    expect(strip.height).toBeGreaterThan(0);
    expect(strip.height).toBeLessThanOrEqual(BANNER_MAX + 0.5);
    expect(kid.top - panel.top).toBeLessThanOrEqual(KIDS_WITHIN);
    await expect(pane.locator('.rf-menu-kids a')).toHaveCount(11);
    expect(axeProblems((await new AxeBuilder({ page }).include('#menu').withTags(TAGS).analyze()).violations)).toEqual([]);
});
