// The Species hub on its live pins (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70 and
// 71), at 375 and 1280. Its markup is render/partials/species-hub.test.mjs's, its server HTML the
// species-hub assertion's, and its look on tree-4 data species-hub-screens.spec.mjs's.
//
// The pin today is channel 1's stand-in, `species-hub`: tree 1's Saltwater, Warmwater & Salmon
// (/flies/saltwater-warmwater-salmon/, category 272) rendered with the hub template, which
// custom-layouts.json maps to it. Wave R2 pins /species/ on 1895766, once refactor 14 has placed
// the products: in wave R1 tree 4 holds none, so the tiles would show no counts and the hub no
// grid. On every species-hub pin, against the store's own data (?debug=context):
//
// - one tile per subcategory, in the store's order, with its name, its link, its photo (the
//   page's own image, or the default image) and its count, when above 0 (stories 13 and 14)
// - under each tile, its Fly Type links: the subcategory's children in the categories data. On
//   the stand-in there are none: 272's children are on tree 1's third level, and the Menu Display
//   Depth of 3 leaves their children out of the data (research/07-prelaunch-probes.md, probe 2).
//   On any other pin, data with none fails: tree 4 gives five Species their Species × Fly Type
//   pages, so none means a Menu Display Depth below 3.
// - the grid after the tiles, with a page of cards (24) and a numbered pager when the root lists
//   more, and no "no products" message (probe 8, which passed on tree 1. Its rerun on tree 4, in
//   wave R2, counts only on a root whose Species pages have products: an empty root lists nothing
//   whether it rolls up or not)
// - two columns on phones and three from 801px, the eager photos all in the first row, and
//   nothing scrolling sideways at 320 (stories 70 and 71)
//
// It runs only when named, like category.spec.mjs: no npm script's filter matches it. Wave R2 runs
// it on 1895766 once /species/ is pinned there.
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs species-hub.spec
//   QA_CHANNEL=1895766 npx playwright test --config scripts/qa/playwright.config.mjs species-hub.spec

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { pageKind } from './pages.mjs';
import { isStandIn } from './raw-html/assertions/species-hub.mjs';
import { HEADERS, QA_CHANNEL } from './storefront.mjs';
import { withQuery } from './switches.mjs';

const HUB_PINS = Object.keys(PAGES).filter(key => pageKind(key) === 'species-hub');
const PER_PAGE = 24;
const phone = testInfo => testInfo.project.name === 'phone-375';
const pathOf = url => new URL(url, 'http://species-hub.invalid').pathname;

async function context(request, key) {
    const response = await request.get(withQuery(PAGES[key], 'debug=context'), { headers: HEADERS });
    expect(response.status(), `?debug=context on ${key}`).toBe(200);
    return response.json();
}

async function open(page, key) {
    await storefrontPage(page, key);
    await dismissCookieBanner(page);
    await page.evaluate(() => window.scrollTo(0, 0));
}

// A Species page's children in the categories data, found by its id with the root at the top
// level or one level down, as category-tile.html finds them.
const typesOf = (categories, id) => {
    for (const top of categories || []) {
        for (const kid of top.children || []) {
            if (String(kid.id) === String(id)) return kid.children || [];
            const grandKid = (kid.children || []).find(node => String(node.id) === String(id));
            if (grandKid) return grandKid.children || [];
        }
    }
    return [];
};

test.skip(!HUB_PINS.length, `no species-hub page is pinned for channel ${QA_CHANNEL}; try QA_CHANNEL=1`);

for (const key of HUB_PINS) {
    test(`${key}: one tile per Species page, in the store's order, with its name, link, photo and count (stories 13 and 14)`, async ({ page, request }) => {
        const { category } = await context(request, key);
        const species = category.subcategories || [];
        expect(species.length, 'the root has Species pages').toBeGreaterThan(0);
        await open(page, key);
        // By path: stencil start serves the store's links as paths.
        const tiles = await page.locator('[data-rf-hub-tiles] > .rf-hub-tile').evaluateAll(items => items.map(tile => ({
            name: tile.querySelector('h2').textContent.trim(),
            path: tile.querySelector('h2 a').pathname,
            photoPath: tile.querySelector('.rf-hub-tile__media').pathname,
            src: tile.querySelector('img').getAttribute('src'),
            count: tile.querySelector('.rf-hub-tile__count')?.textContent.trim() ?? null,
        })));
        expect(tiles.map(tile => tile.name)).toEqual(species.map(sub => sub.name));
        expect(tiles.map(tile => tile.path)).toEqual(species.map(sub => pathOf(sub.url)));
        expect(tiles.map(tile => tile.photoPath), 'the photo links to the same page').toEqual(tiles.map(tile => tile.path));
        species.forEach((sub, index) => {
            const file = sub.image?.data ? sub.image.data.split('/').pop() : 'default-product.png';
            expect(tiles[index].src, `${sub.name}'s photo`).toContain(file);
            expect(tiles[index].count, `${sub.name}'s count`).toBe(sub.product_count > 0 ? `${sub.product_count} pattern${sub.product_count === 1 ? '' : 's'}` : null);
        });
    });

    test(`${key}: each tile's Fly Type links are its Species page's children in the categories data (stories 14 and 72)`, async ({ page, request }) => {
        const data = await context(request, key);
        await open(page, key);
        const lists = await page.locator('[data-rf-hub-tiles] > .rf-hub-tile').evaluateAll(items => items.map(tile => [...tile.querySelectorAll('.rf-hub-tile__types a')].map(anchor => anchor.pathname)));
        const expected = data.category.subcategories.map(sub => typesOf(data.categories, sub.id).map(type => pathOf(type.url)));
        expect(lists).toEqual(expected);
        if (expected.flat().length) return;
        expect(isStandIn(PAGES[key]), `no Species × Fly Type pages in ${key}'s categories data: Menu Display Depth below 3?`).toBe(true);
        test.info().annotations.push({ type: 'no Fly Type links', description: `the categories data holds no children of ${key}'s Species pages (Menu Display Depth 3 stops above them on tree 1)` });
    });

    test(`${key}: the grid follows the tiles, a page of cards with the numbered pager, and no "no products" message (probe 8)`, async ({ page, request }) => {
        const { category } = await context(request, key);
        await open(page, key);
        await expect(page.locator('[data-no-products-notification], .rf-listing-empty')).toHaveCount(0);
        const grid = page.locator('[data-rf-hub-products]');
        if (!(category.products || []).length) {
            await expect(grid).toHaveCount(0);
            return;
        }
        const cards = await grid.locator('.productGrid .card').count();
        expect(cards).toBe(Math.min(PER_PAGE, category.total_products));
        expect(cards).toBe(category.products.length);
        if (category.total_products > PER_PAGE) expect(await grid.locator('.pagination .pagination-link').count(), 'the numbered pager').toBeGreaterThanOrEqual(2);
        const [tilesTop, gridTop] = await Promise.all(['[data-rf-hub-tiles]', '[data-rf-hub-products]'].map(selector => page.locator(selector).evaluate(element => element.getBoundingClientRect().top)));
        expect(gridTop).toBeGreaterThan(tilesTop);
    });

    test(`${key}: two columns on phones and three from 801px, the eager photos in the first row (story 70)`, async ({ page }, testInfo) => {
        await open(page, key);
        const tiles = await page.locator('[data-rf-hub-tiles] > .rf-hub-tile').evaluateAll(items => items.map(tile => ({
            top: Math.round(tile.getBoundingClientRect().top), left: Math.round(tile.getBoundingClientRect().left), eager: tile.querySelector('img').getAttribute('loading') !== 'lazy',
        })));
        expect(new Set(tiles.map(tile => tile.left)).size).toBe(Math.min(tiles.length, phone(testInfo) ? 2 : 3));
        for (const tile of tiles.filter(item => item.eager)) expect(tile.top, 'an eager photo in the first row').toBe(tiles[0].top);
        if (phone(testInfo)) expect(tiles.filter(tile => tile.top === tiles[0].top).every(tile => tile.eager), 'the whole first row eager on a phone').toBe(true);
    });

    test(`${key}: nothing scrolls sideways at 320 (story 71)`, async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await open(page, key);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });
}
