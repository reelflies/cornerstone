// The home page's hook band, as ReelFlies_CA places it (ticket 49; spec modules 7 and 22, R1,
// CD-12, UX-16, R12; stories 15, 16, 68 and 71): widgets/hook-sizes in home_below_top_products
// between the Species section and About, rendered from its fixture with every other home widget,
// on templates/pages/home.html with the theme's header and footer and this checkout's theme CSS
// (render/home-page.mjs).
//
// Page baselines hide every widget (W0-5) and an element shot sees one widget alone, so what only
// the page shows is checked here:
// - at 1280, the band is 260px tall or less on the tinted ground with a 20px radius, its heading
//   beside its paragraph (CD-12's align-items: start), and the 13 hooks on one line; from 801px
//   to about 850px the second row wraps under the first, and no hook is ever squeezed
// - at 375 and 360, two rows (2/0 to 6, then 8 to 20), every hook a target of 44px or more; at
//   320, the same two rows with 36px targets (ticket 35's #72 note); no third row, and nothing
//   scrolls sideways at 375 or 320 (story 71); the hooks in the page's column, the tint out to
//   the window's edges
// - every hook drawn to one scale at each width: its drawn width over its length is the band's
//   px per mm (3 from 801px, 2.1 from 375px on phones, 1.7 below 375px)
// - one H2, in page order between "Shop by fish" and About, with no heading level skipped
// - unpublishing the widget leaves no gap, at 1280 and 375 (R12)
// - Tab reaches every link in the band in order, each with ticket 25's focus ring
// - no serious or critical axe issue in the band
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs hook-band-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { homeCases, openHomePage } from './render/home-page.mjs';
import { LAYOUTS } from '../hook-gauge/geometry.mjs';

test.skip(Boolean(QA_OVERLAY), `the home widgets render from their fixtures, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const BAND = '.rf-hook-band';
const PANEL = '.rf-hook-band__panel';
const MAX_HEIGHT = 260; // UX-16's slim band, at 1280
const TILE = 'rgb(241, 243, 240)'; // --rf-tile, #F1F3F0
const RING = {
    width: '2px', style: 'solid', offset: '2px', colour: 'rgb(35, 39, 43)',
}; // ticket 25's ring on light grounds
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const [ROW_ONE, ROW_TWO] = LAYOUTS.band.rows;
const TOLERANCE = 1; // px

const desktop = testInfo => testInfo.project.name === 'desktop-1280';

async function open(page, { without = [] } = {}) {
    const cases = homeCases().filter(({ widget }) => !without.includes(widget));
    const { problems } = await openHomePage(page, cases, { variation: QA_VARIATION });
    expect(problems, 'the page loads nothing but its widgets\' fixture files, the theme\'s assets and fonts').toEqual([]);
}

// The band's hooks, in page order: the size, the link's box (document coordinates), the line its
// size sits on (the rule under the hooks: a row's hooks are bottom-aligned), and the hook's drawn
// px per mm.
const hooks = page => page.locator(`${BAND} .rf-hook-gauge__link`).evaluateAll(links => links.map(link => {
    const box = link.getBoundingClientRect();
    const hook = link.querySelector('.rf-hook-gauge__hook');
    return {
        size: link.querySelector('.rf-hook-gauge__size').textContent.trim(),
        line: Math.round(box.bottom + window.scrollY),
        top: box.top + window.scrollY,
        bottom: box.bottom + window.scrollY,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
        k: hook.getBoundingClientRect().width / parseFloat(getComputedStyle(hook).getPropertyValue('--rf-hook-len')),
    };
}));

// The hooks grouped into the lines they sit on, top to bottom: each line's sizes.
const lines = found => [...new Set(found.map(({ line }) => line))].sort((a, b) => a - b)
    .map(line => found.filter(hook => hook.line === line).map(({ size }) => size));

const box = (page, selector) => page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
});

const scrollWidth = page => page.evaluate(() => ({ scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth }));

// The colour the page shows at one point in the viewport, read from a screenshot through a canvas.
async function pixelAt(page, x, y) {
    const shot = (await page.screenshot({
        clip: {
            x, y, width: 1, height: 1,
        },
        animations: 'disabled',
    })).toString('base64');
    return page.evaluate(async data => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
    }, shot);
}

test.describe('the home page\'s hook band (widgets/hook-sizes)', () => {
    test('at 1280 the band is 260px tall or less, tinted with a 20px radius, its heading beside its paragraph, and the 13 hooks on one line (UX-16, CD-12)', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the desktop layout');
        await open(page);
        const panel = await box(page, PANEL);
        testInfo.annotations.push({ type: 'height', description: `the band at 1280: ${panel.width.toFixed(1)}x${panel.height.toFixed(1)}` });
        expect(panel.height, 'a slim band').toBeLessThanOrEqual(MAX_HEIGHT);
        await expect(page.locator(PANEL)).toHaveCSS('background-color', TILE);
        await expect(page.locator(PANEL)).toHaveCSS('border-radius', '20px');
        const heading = await box(page, `${BAND} h2`);
        const text = await box(page, `${BAND} .rf-hook-band__text`);
        expect(heading.right, 'the heading in the left column').toBeLessThan(text.left);
        expect(Math.abs(heading.top - text.top), 'the heading level with its paragraph\'s top, not floating below it').toBeLessThanOrEqual(TOLERANCE);
        const found = await hooks(page);
        expect(lines(found), 'one line of 13 hooks').toEqual([[...ROW_ONE, ...ROW_TWO]]);
        for (const hook of found) expect(hook.k, `size ${hook.size} at 3 px/mm`).toBeCloseTo(LAYOUTS.band.k.desktop, 1);
        expect(found[12].right, 'the hooks inside the band').toBeLessThanOrEqual(panel.right);
    });

    test('from 801px to 1024 every hook keeps the desktop scale: one line where it fits, else the second row under the first, never a third', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the desktop layout');
        for (const width of [801, 850, 1024]) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const found = await hooks(page); // eslint-disable-line no-await-in-loop
            const shown = lines(found);
            testInfo.annotations.push({ type: 'lines', description: `at ${width}px: ${shown.map(line => line.join(' ')).join(' / ')}` });
            expect([[[...ROW_ONE, ...ROW_TWO]], [ROW_ONE, ROW_TWO]], `at ${width}px`).toContainEqual(shown);
            for (const hook of found) expect(hook.k, `size ${hook.size} at ${width}px`).toBeCloseTo(LAYOUTS.band.k.desktop, 1);
            const { scrollWidth: wide, innerWidth } = await scrollWidth(page); // eslint-disable-line no-await-in-loop
            expect(wide, `no sideways scroll at ${width}px`).toBe(innerWidth);
        }
    });

    test('on phones, two deliberate rows, 2/0 to 6 then 8 to 20, every hook a 44px target from 360px and 36px below, and nothing scrolls sideways (CD-12, story 71)', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'a phone layout');
        for (const [width, target, k] of [[375, 44, LAYOUTS.band.k.phone], [360, 44, LAYOUTS.band.k.narrow], [320, 36, LAYOUTS.band.k.narrow]]) {
            await page.setViewportSize({ width, height: 812 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const found = await hooks(page); // eslint-disable-line no-await-in-loop
            expect(lines(found), `two rows at ${width}px`).toEqual([ROW_ONE, ROW_TWO]);
            for (const hook of found) {
                expect(hook.width, `size ${hook.size}'s target at ${width}px`).toBeGreaterThanOrEqual(target - 0.01);
                expect(hook.height, `size ${hook.size}'s target at ${width}px`).toBeGreaterThanOrEqual(44);
                expect(hook.k, `size ${hook.size} at ${width}px`).toBeCloseTo(k, 1);
                expect(hook.right, `size ${hook.size} inside the viewport at ${width}px`).toBeLessThanOrEqual(width);
                expect(hook.left).toBeGreaterThanOrEqual(0);
            }
            // The hooks keep the page's column, and the tint runs out to the window's edges.
            const panel = await box(page, PANEL); // eslint-disable-line no-await-in-loop
            const column = await box(page, '[data-content-region="home_below_top_products"]'); // eslint-disable-line no-await-in-loop
            expect(panel.left, `the band in the page's column at ${width}px`).toBeCloseTo(column.left, 0);
            expect(panel.width).toBeCloseTo(column.width, 0);
            expect(found[0].left).toBeGreaterThanOrEqual(panel.left - 0.5);
            expect(Math.max(...found.map(hook => hook.right))).toBeLessThanOrEqual(panel.right + 0.5);
            await page.locator(PANEL).evaluate(element => element.scrollIntoView({ block: 'center' })); // eslint-disable-line no-await-in-loop
            const middle = await page.locator(PANEL).evaluate(element => { // eslint-disable-line no-await-in-loop
                const rect = element.getBoundingClientRect();
                return Math.round(rect.top + 12);
            });
            for (const x of [0, width - 1]) expect(await pixelAt(page, x, middle), `the tint at x=${x}, ${width}px`).toBe(TILE); // eslint-disable-line no-await-in-loop
            const { scrollWidth: wide, innerWidth } = await scrollWidth(page); // eslint-disable-line no-await-in-loop
            expect(wide, `no sideways scroll at ${width}px`).toBe(innerWidth);
            testInfo.annotations.push({ type: 'phone', description: `at ${width}px: the band ${panel.height.toFixed(1)}px tall; the narrowest target ${Math.min(...found.map(hook => hook.width)).toFixed(1)}px` });
        }
    });

    test('has one H2, in page order between "Shop by fish" and About, and the page\'s headings skip no level (story 68)', async ({ page }) => {
        await open(page);
        await expect(page.locator(`${BAND} h2`)).toHaveCount(1);
        await expect(page.locator(`${BAND} h2`)).toHaveText('Bigger number, smaller hook.');
        const headings = await page.locator('main h1, main h2, main h3, main h4').evaluateAll(elements => elements.map(element => ({ level: Number(element.tagName[1]), text: element.textContent.trim() })));
        const h2s = headings.filter(({ level }) => level === 2).map(({ text }) => text);
        const band = h2s.indexOf('Bigger number, smaller hook.');
        expect(band).toBeGreaterThan(h2s.indexOf('Shop by fish'));
        expect(band).toBeLessThan(h2s.indexOf('100% Canadian and family-run since 2003'));
        headings.forEach(({ level, text }, index) => {
            const previous = index ? headings[index - 1].level : 1;
            expect(level - previous, `"${text}" (h${level}) after an h${previous}`).toBeLessThanOrEqual(1);
        });
    });

    // R12: the band is switched off by unpublishing its widget (or never made, if Shaun drops it).
    // The store then renders nothing for it, so About moves up by exactly its height.
    test('unpublishing it leaves no gap: what follows moves up by exactly its height, and nothing before it moves', async ({ page }) => {
        await open(page);
        const before = await page.evaluate(selector => {
            const wrapper = document.querySelector(selector).closest('[data-widget-id]').getBoundingClientRect();
            return {
                height: wrapper.height,
                about: document.querySelector('.rf-about').getBoundingClientRect().top + window.scrollY,
                species: document.querySelector('.rf-species').getBoundingClientRect().top + window.scrollY,
            };
        }, BAND);
        await open(page, { without: ['hook-sizes'] });
        await expect(page.locator(BAND)).toHaveCount(0);
        const after = await page.evaluate(() => ({
            about: document.querySelector('.rf-about').getBoundingClientRect().top + window.scrollY,
            species: document.querySelector('.rf-species').getBoundingClientRect().top + window.scrollY,
        }));
        expect(before.height, 'the band takes space while placed').toBeGreaterThan(100);
        expect(after.species, 'nothing before it moves').toBeCloseTo(before.species, 0);
        expect(before.about - after.about, 'About moves up by the band\'s whole height').toBeCloseTo(before.height, 0);
    });

    test('Tab reaches the text link and then every hook in order, each with ticket 25\'s focus ring', async ({ page }) => {
        await open(page);
        const links = page.locator(`${BAND} a`);
        const count = await links.count();
        expect(count, 'the text link and 13 hooks').toBe(14);
        // Start on the last link before the band, the Species section's last pill.
        await page.locator('.rf-species a').last().focus();
        for (let index = 0; index < count; index += 1) {
            await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
            const link = links.nth(index);
            expect(await link.evaluate(element => element === document.activeElement), `Tab ${index + 1} reaches link ${index + 1}`).toBe(true); // eslint-disable-line no-await-in-loop
            await expect.poll(() => link.evaluate(element => { // eslint-disable-line no-await-in-loop
                const style = getComputedStyle(element);
                return {
                    visible: element.matches(':focus-visible'), width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset, colour: style.outlineColor,
                };
            }), { message: `link ${index + 1} shows the ring`, timeout: 3000 }).toEqual({
                visible: true, width: RING.width, style: RING.style, offset: RING.offset, colour: RING.colour,
            });
        }
    });

    test('has no serious or critical axe issues in the band', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include(BAND).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
