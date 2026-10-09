// The Species hub (ticket 34; spec module 10; R8, SEO-2; stories 13, 14, 70 and 71), at 375 and
// 1280, on the fixture page: the real hub template (pages/custom/category/species-hub.html)
// rendered round tree-4-shaped data (render/pages/species-hub/): the root "Flies by Species", its
// eleven Species pages with their Species × Fly Type pages, then ticket 31's cards and a pager,
// with the theme's header and footer and channel 1's own category images. ReelFlies_CA has no
// tree-4 categories until refactor 13, so the hub's look is checked here; species-hub.spec.mjs
// checks the live stand-in pin on channel 1.
//
// - The page matches its baseline (widget baselines, declared as `widget species-hub`).
// - One <main> and one <h1>, "Fly Fishing Flies by Species", with the intro under it.
// - The tiles: two columns on phones and three from 801px, each photo in a 3:2 box, its width
//   what the tile's sizes says (so the srcset picks the right file), nothing sideways at 320.
// - The first row: every eager photo starts in the first screen and sits in the first row, which
//   on a phone is all eager; the first tile's photo is the page's one fetchpriority="high".
// - The Fly Type links: at least 24px tall (WCAG 2.5.8), inside their tile at 320.
// - An intro's paragraphs, the root's and a tile's, 8px apart.
// - The grid after the tiles, its photos lazy, then the pager.
// - axe finds no serious or critical issue in the page's body.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs species-hub-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the Species hub renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const HUB = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'species-hub' && name === 'tree-4');
if (!HUB) throw new Error('render/pages/species-hub/fixtures/tree-4.json is missing');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const phone = testInfo => testInfo.project.name === 'phone-375';

// The tile's own width at a viewport width, as category-tile.html's sizes gives it.
const sizesAt = width => {
    if (width >= 1136) return 349;
    if (width >= 801) return width * 0.3333 - 29;
    return width * 0.5 - 30;
};

async function open(page) {
    const { problems } = await openWidget(page, HUB, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
}

// Each tile's box, its photo's box, and whether the photo is eager or high priority.
const tileBoxes = page => page.locator('.rf-hub-tile').evaluateAll(tiles => tiles.map(tile => {
    const img = tile.querySelector('img');
    const box = tile.getBoundingClientRect();
    const photo = img.getBoundingClientRect();
    return {
        name: tile.querySelector('h2').textContent.trim(),
        top: box.top + window.scrollY,
        left: box.left,
        width: box.width,
        photoTop: photo.top + window.scrollY,
        photoWidth: photo.width,
        photoHeight: photo.height,
        eager: img.getAttribute('loading') !== 'lazy',
        high: img.getAttribute('fetchpriority') === 'high',
    };
}));

test.describe('the Species hub (ticket 34)', () => {
    test('matches its baseline', async ({ page }) => {
        await open(page);
        for (const img of await page.locator('#main-content img').all()) {
            await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
            await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
        }
        // The phone header is sticky, and would cover the page's top in an element shot.
        await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect(page.locator('#main-content')).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'species-hub-tree-4.png']);
    });

    test('has one <main> and one <h1>, with the intro under it, and the tiles and the grid inside <main> (story 68)', async ({ page }) => {
        await open(page);
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('main h1')).toHaveText('Fly Fishing Flies by Species');
        await expect(page.locator('main .rf-listing-header .rf-listing-intro')).toContainText('Choose the fish you\'re after');
        await expect(page.locator('main [data-rf-hub-tiles] > .rf-hub-tile')).toHaveCount(11);
        await expect(page.locator('main [data-rf-hub-products] .productGrid .card')).toHaveCount(6);
    });

    test('lays the tiles out two to a row on phones and three from 801px, each photo 3:2 and as wide as its sizes says', async ({ page }, testInfo) => {
        for (const width of phone(testInfo) ? [320, 375, 600] : [801, 1024, 1280]) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const tiles = await tileBoxes(page); // eslint-disable-line no-await-in-loop
            const columns = new Set(tiles.map(tile => Math.round(tile.left))).size;
            expect(columns, `${width}px`).toBe(width < 801 ? 2 : 3);
            for (const tile of tiles) {
                expect(Math.abs(tile.photoHeight - (tile.photoWidth * 2) / 3), `${tile.name}'s photo is 3:2 at ${width}px`).toBeLessThanOrEqual(1);
                // The photo sits inside the tile's 1px border.
                expect(Math.abs(tile.width - sizesAt(width)), `${tile.name}'s tile against its sizes at ${width}px`).toBeLessThanOrEqual(2);
            }
        }
    });

    test('loads only the first row\'s photos eagerly, all in the first screen, and the first is the page\'s one high-priority image (story 70)', async ({ page }, testInfo) => {
        const viewport = phone(testInfo) ? { width: 375, height: 667 } : { width: 1280, height: 800 };
        await page.setViewportSize(viewport);
        await open(page);
        const tiles = await tileBoxes(page);
        const firstRow = tiles.filter(tile => Math.abs(tile.top - tiles[0].top) < 1);
        const eager = tiles.filter(tile => tile.eager);
        expect(eager.length).toBeGreaterThan(0);
        for (const tile of eager) {
            expect(firstRow.map(({ name }) => name), `${tile.name} is eager`).toContain(tile.name);
            expect(tile.photoTop, `${tile.name}'s photo starts in the first screen`).toBeLessThan(viewport.height);
        }
        if (phone(testInfo)) expect(eager.map(({ name }) => name), 'the whole first row on a phone').toEqual(firstRow.map(({ name }) => name));
        expect(tiles.filter(tile => tile.high).map(({ name }) => name)).toEqual([tiles[0].name]);
        await expect(page.locator('img[fetchpriority="high"]')).toHaveCount(1);
        expect(await page.locator('[data-rf-hub-products] img').evaluateAll(imgs => imgs.every(img => img.getAttribute('loading') === 'lazy'))).toBe(true);
    });

    test('gives every Fly Type link a 24px target inside its tile, and scrolls nothing sideways at 320 (stories 14 and 71)', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 800 });
        await open(page);
        const links = await page.locator('.rf-hub-tile__type').evaluateAll(anchors => anchors.map(anchor => {
            const box = anchor.getBoundingClientRect();
            const tile = anchor.closest('.rf-hub-tile').getBoundingClientRect();
            return {
                name: anchor.textContent.trim(), height: box.height, inside: box.left >= tile.left - 0.5 && box.right <= tile.right + 0.5,
            };
        }));
        expect(links).toHaveLength(16);
        for (const link of links) {
            expect(link.height, link.name).toBeGreaterThanOrEqual(24);
            expect(link.inside, `${link.name} stays inside its tile`).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    });

    test('spaces an intro\'s paragraphs 8px apart, the root\'s and a tile\'s', async ({ page }) => {
        await open(page);
        // The fixture's intros are one paragraph each. The root's unmarked description is its
        // whole intro, so the hub's is the likeliest to run to two: give each a second one.
        const gaps = await page.evaluate(() => ['.rf-listing-header .rf-listing-intro', '.rf-hub-tile .rf-listing-intro'].map(selector => {
            const intro = document.querySelector(selector);
            const first = intro.querySelector('p');
            const second = intro.appendChild(document.createElement('p'));
            second.textContent = 'A second paragraph.';
            return Math.round(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom);
        }));
        expect(gaps).toEqual([8, 8]);
    });

    test('puts the grid after the tiles, then the numbered pager, then the description\'s rest', async ({ page }) => {
        await open(page);
        const tops = await Promise.all(['[data-rf-hub-tiles]', '[data-rf-hub-products] .productGrid', '[data-rf-hub-products] .pagination', '[data-rf-description]']
            .map(selector => page.locator(selector).evaluate(element => element.getBoundingClientRect().top)));
        expect([...tops].sort((a, b) => a - b)).toEqual(tops);
        await expect(page.locator('[data-rf-hub-products] h2')).toHaveText('All flies');
    });

    test('has no serious or critical axe issues', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('#main-content').withTags(TAGS).analyze();
        expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    });
});
