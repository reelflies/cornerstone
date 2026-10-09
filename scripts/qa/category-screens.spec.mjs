// The Fly Type and Species pages (ticket 32; spec module 8; O10, UX-5, CD-6, CD-10; stories 20,
// 21, 22, 27, 70 and 71), at 375 and 1280, on the fixture page: the real category page rendered
// round tree-4-shaped data (render/pages/category-page/), two Fly Type pages and a Species page,
// with the theme's header and footer and channel 1's own category images. ReelFlies_CA has no
// tree-4 categories until refactor 13, and the live category pins mask their grids, so the
// templates' look is checked here; category.spec.mjs checks the live channel-1 pins.
//
// - Each page matches its baseline (widget baselines, declared as `widget category-page`).
// - The banner: eager with fetchpriority="high", 220px tall from 801px (taller only when a long
//   name wraps), with the H1 and the intro on it; on phones the photo first, then the H1 and the
//   intro. Every line of text on it holds 4.5:1 against its lightest pixel (photo-contrast.mjs).
// - The chips: at most two rows, with "+N more" at 1280 and "Show all N" at 375 when some are
//   hidden (the Nymphs page has ten); every chip's link in the page; the "more" chip shows them
//   all. A chip has a thumbnail only where its subcategory has an image. Laying them out moves
//   nothing below them. Nothing scrolls sideways at 320.
// - The first row of products: its photos whole at 1366x768, and starting within the first
//   screen at 375x667 (stories 20 and 21).
// - axe finds no serious or critical issue in the page's body.
// - Ticket 33's Fly size filter, on the same pages and two more fixtures, `filtered` (size 14
//   picked) and `empty` (filters that match nothing); the Species page has fifteen sizes and
//   "Show more":
//   - the pills in hook order, from the API's order, and again after a refresh, with the count
//     announced and focus back on the size used
//   - the empty state's message and Clear filters, with focus left alone (its fold check skips)
//   - Filter beside Sort by on phones, in place of stock's toggle, with the header or without it
//   - Sort by on the row's right as the reference's, a 44px pill with its label beside it
//   - "Show more" under the pills, 24px tall or more; stock's "Clear" centred on its heading;
//     stock's "Refine by" only once a filter is applied
//
// The fixture page loads no theme bundle, so the spec runs the real category-chips.js in the
// page: it has no imports, so its source goes in as a classic script, its exports dropped.
// size-filter.js has imports, so it goes in through render/theme-script.mjs.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs category-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { THEME_DIR, widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';
import { themeScript } from './render/theme-script.mjs';

test.skip(Boolean(QA_OVERLAY), `the category page renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const CASES = widgetCases([PAGE_FIXTURES]).filter(({ widget, shot }) => widget === 'category-page' && shot);
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const CHIPS_SOURCE = fs.readFileSync(path.join(THEME_DIR, 'assets/js/theme/reelflies/category-chips.js'), 'utf8')
    .replace(/^export default /m, 'const chipsModule = ')
    .replace(/^export /gm, '');
const phone = testInfo => testInfo.project.name === 'phone-375';

const runChips = page => page.addScriptTag({ content: `${CHIPS_SOURCE}\nchipsModule.load({}, document);` });

// Ticket 33's size-filter.js and its imports, run in the page as the bundle would.
const SIZE_FILTER = ['reelflies/live-region', 'reelflies/hook-order', 'reelflies/facet-order', 'reelflies/size-filter'];
const runSizeFilter = page => page.addScriptTag({ content: themeScript(SIZE_FILTER, "modules['reelflies/size-filter'].default.load({}, document);") });
const byName = name => CASES.find(fixture => fixture.name === name);
const pillSizes = page => page.locator('#facetedSearch [data-facet="Fly Sizes"] .rf-size-pill').allInnerTexts();
const hookRank = size => (size.includes('/') ? -Number(size.split('/')[0]) : Number(size));

async function open(page, fixture, { chips = true, sizes = true } = {}) {
    const { problems } = await openWidget(page, fixture, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    if (!chips) return;
    // The pills in hook order, as shoppers see them (ticket 33's size-filter.js).
    if (sizes) await runSizeFilter(page);
    await runChips(page);
    await expect(page.locator('[data-rf-chips]')).toHaveAttribute('data-rf-chips-ready', '');
    for (const img of await page.locator('#main-content img:not([loading="lazy"]), .rf-chip-image').all()) {
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    await page.evaluate(() => window.scrollTo(0, 0));
}

for (const fixture of CASES) {
    test.describe(`the category page: ${fixture.name} (ticket 32)`, () => {
        test('matches its baseline', async ({ page }) => {
            await open(page, fixture);
            for (const img of await page.locator('.card-image').all()) {
                await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
                await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
            }
            // The phone header is sticky, and would cover the page's top in an element shot.
            await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
            await page.evaluate(() => window.scrollTo(0, 0));
            await expect(page.locator('#main-content')).toHaveScreenshot(['widgets', slug(QA_VARIATION), `category-page-${fixture.name}.png`]);
        });

        test('shows the banner: eager and high priority, 220px tall from 801px, with the H1 and the intro on it (story 21)', async ({ page }, testInfo) => {
            await open(page, fixture);
            const banner = page.locator('.rf-listing-banner');
            await expect(banner).toHaveAttribute('fetchpriority', 'high');
            expect(await banner.getAttribute('loading')).toBeNull();
            const box = await banner.boundingBox();
            const copy = await page.locator('.rf-listing-header .rf-listing-copy').boundingBox();
            if (phone(testInfo)) {
                expect(copy.y, 'the H1 and the intro under the photo').toBeGreaterThanOrEqual(box.y + box.height - 1);
            } else {
                expect(Math.round(box.height)).toBe(220);
                expect(copy.y, 'the copy on the photo').toBeGreaterThanOrEqual(box.y - 1);
                expect(copy.y + copy.height).toBeLessThanOrEqual(box.y + box.height + 1);
                for (const selector of ['.rf-listing-title', '.rf-listing-intro']) {
                    expect((await worstContrastOverPhoto(page, selector)).ratio, `${selector} over the banner`).toBeGreaterThanOrEqual(4.5); // eslint-disable-line no-await-in-loop
                }
            }
        });

        test('keeps the chips to two rows, with every link in the page, and "more" shows them all (stories 22 and 71)', async ({ page }, testInfo) => {
            await open(page, fixture);
            const list = page.locator('[data-rf-chips]');
            const { subcategories } = fixture.fixture.page_context.category;
            await expect(list.locator('a.rf-chip')).toHaveCount(subcategories.length);
            const rows = () => list.evaluate(element => new Set([...element.children].filter(item => !item.hidden).map(item => Math.round(item.getBoundingClientRect().top))).size);
            expect(await rows()).toBeLessThanOrEqual(2);
            const thumbs = await list.locator('a.rf-chip').evaluateAll(links => links.map(link => Boolean(link.querySelector('img'))));
            expect(thumbs, 'a thumbnail only where the subcategory has an image').toEqual(subcategories.map(sub => Boolean(sub.image)));
            const more = list.locator('[data-rf-chips-more]');
            const hidden = await list.locator('li[hidden]:not([data-rf-chips-more])').count();
            if (!hidden) {
                await expect(more).toBeHidden();
                return;
            }
            const button = more.getByRole('button');
            await expect(button).toHaveAccessibleName(phone(testInfo) ? `Show all ${subcategories.length}` : `+${hidden} more`);
            await button.click();
            await expect(list.locator('li[hidden]')).toHaveCount(1); // the "more" chip
            await expect(page.locator(':focus')).toHaveAttribute('href', subcategories[subcategories.length - hidden].url);
        });

        for (const reducedMotion of ['no-preference', 'reduce']) {
            test(`lays the chips out without moving anything below them, each chip its own height (CLS; story 70; ${reducedMotion} motion)`, async ({ page }) => {
                await page.emulateMedia({ reducedMotion });
                await open(page, fixture, { chips: false });
                const list = page.locator('[data-rf-chips]');
                expect(await list.evaluate(element => getComputedStyle(element).maxHeight), 'the clip is on until the script runs').not.toBe('none');
                const top = () => page.locator('.page').evaluate(element => element.getBoundingClientRect().top + window.scrollY);
                const before = await top();
                await runChips(page);
                await expect(list).toHaveAttribute('data-rf-chips-ready', '');
                expect(Math.abs(await top() - before), 'the listing stays where it was').toBeLessThanOrEqual(1);
                const { height, chips } = await list.evaluate(element => ({
                    height: parseFloat(getComputedStyle(element).getPropertyValue('--rf-chip-h')),
                    chips: [...element.querySelectorAll('li:not([hidden]) .rf-chip')].map(chip => chip.getBoundingClientRect().height),
                }));
                chips.forEach(chip => expect(chip, 'a chip is its own height, never stretched to the reserved rows').toBeLessThanOrEqual(height + 1));
            });
        }

        test('scrolls nothing sideways at 320', async ({ page }) => {
            await page.setViewportSize({ width: 320, height: 800 });
            await open(page, fixture);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow).toBeLessThanOrEqual(0);
        });

        test('shows the first row of products within the first screen (stories 20 and 21)', async ({ page }, testInfo) => {
            test.skip(fixture.name === 'empty', 'filters that match nothing show no products');
            const size = phone(testInfo) ? { width: 375, height: 667 } : { width: 1366, height: 768 };
            await page.setViewportSize(size);
            await open(page, fixture);
            const photo = await page.locator('.productGrid .card-image').first().boundingBox();
            if (phone(testInfo)) expect(photo.y, 'the first row starts on the first screen').toBeLessThan(size.height);
            else expect(photo.y + photo.height, 'the first row\'s photos show whole on the first screen').toBeLessThanOrEqual(size.height);
        });

        test('has no serious or critical axe issues', async ({ page }) => {
            await open(page, fixture);
            const { violations } = await new AxeBuilder({ page }).include('#main-content').withTags(TAGS).analyze();
            expect(violations.filter(violation => ['serious', 'critical'].includes(violation.impact)).map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`)).toEqual([]);
        });
    });
}

test.describe('the Fly size filter (ticket 33)', () => {
    test('puts the Fly Sizes pills in hook order, from the API\'s order (story 23)', async ({ page }) => {
        await open(page, byName('fly-type'), { sizes: false });
        const before = await pillSizes(page);
        await runSizeFilter(page);
        const after = await pillSizes(page);
        expect([...after].sort((a, b) => hookRank(a) - hookRank(b)), `${after.join(', ')} in hook order`).toEqual(after);
        expect([...after].sort()).toEqual([...before].sort());
        expect(after).not.toEqual(before);
    });

    test('after a filter refresh: the pills in hook order again, the count announced, focus back on the size used (story 68)', async ({ page, browser }) => {
        // The refreshed listing and sidebar, as stock's callback puts them in: the filtered page's.
        const other = await browser.newPage();
        await open(other, byName('filtered'), { chips: false });
        const [listing, sidebar] = await Promise.all(['#product-listing-container', '#faceted-search-container'].map(selector => other.locator(selector).innerHTML()));
        await other.close();

        await open(page, byName('fly-type'));
        // Stock's script would send the click through its own refresh; here it only mustn't
        // navigate. On phones the facets are open, as Filter (stock's toggle) leaves them, and
        // stock's refresh opens them again in the same task (restoreCollapsedFacets).
        await page.evaluate(() => {
            document.addEventListener('click', event => event.preventDefault());
            document.getElementById('facetedSearch-navList').classList.add('is-open');
        });
        await page.locator('.rf-size-pill', { hasText: /^14$/ }).focus();
        await page.keyboard.press('Enter');
        await page.evaluate(([newListing, newSidebar]) => {
            document.getElementById('product-listing-container').innerHTML = newListing;
            document.getElementById('faceted-search-container').innerHTML = newSidebar;
            document.getElementById('facetedSearch-navList').classList.add('is-open');
        }, [listing, sidebar]);
        await expect(page.locator('[data-rf-live-region]')).toHaveText('31 flies');
        await expect(page.locator('.rf-size-pill[aria-current="true"]')).toBeFocused();
        await expect(page.locator('.rf-size-pill[aria-current="true"]')).toHaveText('14');
        const after = await pillSizes(page);
        expect([...after].sort((a, b) => hookRank(a) - hookRank(b))).toEqual(after);
    });

    test('when filters match nothing: the message, Clear filters, and the pills still there, with focus left alone (story 25)', async ({ page }, testInfo) => {
        await open(page, byName('empty'));
        await expect(page.locator('[data-rf-list-count]')).toHaveText('No flies match these filters');
        await expect(page.locator('.rf-listing-empty a')).toHaveText('Clear filters');
        expect(await page.evaluate(() => document.activeElement === document.body), 'nothing took focus').toBe(true);
        if (phone(testInfo)) await expect(page.locator('[data-rf-filter-button]')).toBeVisible();
        else await expect(page.locator('#facetedSearch [data-facet="Fly Sizes"]')).toBeVisible();
    });

    test('puts Filter beside Sort by on phones, in place of stock\'s toggle, with "What do sizes mean?" in the facets', async ({ page }, testInfo) => {
        await open(page, byName('fly-type'));
        await expect(page.locator('.rf-size-help a')).toHaveAttribute('href', '/fly-hook-size-chart/');
        if (!phone(testInfo)) {
            await expect(page.locator('[data-rf-filter-button]')).toBeHidden();
            await expect(page.locator('.rf-size-help a')).toBeVisible();
            return;
        }
        await expect(page.locator('.facetedSearch-toggle')).toBeHidden();
        const [filter, sort] = await Promise.all([page.locator('[data-rf-filter-button]').boundingBox(), page.locator('.rf-list-tools .actionBar').boundingBox()]);
        expect(Math.abs(filter.y + filter.height / 2 - (sort.y + sort.height / 2)), 'one row').toBeLessThanOrEqual(2);
        expect(filter.height).toBeGreaterThanOrEqual(44);
        // With Theme Styles' hide_category_page_heading on there is no header; the rules key on
        // the page, so Filter still stands in for stock's toggle.
        await page.evaluate(() => document.querySelector('.rf-listing-header').remove());
        await expect(page.locator('[data-rf-filter-button]')).toBeVisible();
        await expect(page.locator('.facetedSearch-toggle')).toBeHidden();
    });

    test('puts Sort by on the row\'s right, as the reference\'s: a 44px pill, its label beside it from 801px', async ({ page }, testInfo) => {
        await open(page, byName('fly-type'));
        // Without Filter, as on every listing with no visible facet, it stays right too.
        await page.evaluate(() => document.querySelector('[data-rf-filter-button]').remove());
        const [row, select] = await Promise.all([page.locator('.rf-list-top').boundingBox(), page.locator('.rf-list-tools select').boundingBox()]);
        expect(Math.abs(row.x + row.width - (select.x + select.width)), 'flush with the row\'s right').toBeLessThanOrEqual(1);
        expect(select.height).toBeGreaterThanOrEqual(44);
        const label = page.locator('.rf-list-tools .form-label');
        if (phone(testInfo)) {
            expect(await label.evaluate(element => element.getBoundingClientRect().width), 'read, not shown').toBeLessThanOrEqual(1);
            return;
        }
        const box = await label.boundingBox();
        expect(box.x + box.width, 'beside the select').toBeLessThanOrEqual(select.x);
        expect(Math.abs(box.y + box.height / 2 - (select.y + select.height / 2))).toBeLessThanOrEqual(2);
    });

    test('shows "Show more" under the pills, 24px tall or more and clear of the last row', async ({ page }, testInfo) => {
        test.skip(phone(testInfo), 'the facets are closed on phones until Filter opens them');
        await open(page, byName('species'));
        const more = page.locator('.rf-size-facet .accordion-content > .toggleLink');
        await expect(more).toBeVisible();
        const [link, last] = await Promise.all([more.boundingBox(), page.locator('.rf-size-pill').last().boundingBox()]);
        expect(link.height).toBeGreaterThanOrEqual(24);
        expect(link.y - (last.y + last.height)).toBeGreaterThanOrEqual(8);
    });

    test('shows stock\'s "Refine by" only once a filter is applied, and centres "Clear" on its heading', async ({ page }, testInfo) => {
        test.skip(phone(testInfo), 'stock hides "Refine by" on phones, and the facets are closed there');
        await open(page, byName('fly-type'));
        await expect(page.locator('.facetedSearch-refineFilters')).toBeHidden();
        await open(page, byName('filtered'));
        await expect(page.locator('.facetedSearch-refineFilters')).toBeVisible();
        const [clear, title] = await Promise.all([page.locator('.rf-size-facet .facetedSearch-clearLink').boundingBox(), page.locator('.rf-size-facet .accordion-title').boundingBox()]);
        expect(Math.abs(clear.y + clear.height / 2 - (title.y + title.height / 2))).toBeLessThanOrEqual(2);
        expect(clear.height).toBeGreaterThanOrEqual(24);
    });
});
