// The home page's link sections, as ReelFlies_CA places them (ticket 49; spec module 7; stories
// 13, 65, 67, 68, 70 and 71; HOME-3, CD-4, CD-6, CD-9, UX-15, R12): the Species section, "Shop by
// fish" (widgets/shop-by-fish), and the About block (widgets/about), in home_below_top_products
// after the tiles, each rendered from its fixture, on templates/pages/home.html with the theme's
// header and footer and this checkout's theme CSS (render/home-page.mjs).
//
// Page baselines hide every widget (W0-5) and an element shot sees one widget alone, so what only
// the page shows is checked here: the three equal groups at 1280 (and one photo height a row from
// 801px), the stacked phone layout with no sideways scroll at 375 and 320, the cold-water crop's
// third and its distance from the Dry card, the groups' text over their scrim, the About block's
// even split, one H2 a section in page order, no gap when a widget is unpublished, the focus ring
// on every link, and axe.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs home-links-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { homeCases, openHomePage } from './render/home-page.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';
import { REPEAT_ATTRIBUTE, photoKey } from './raw-html/assertions/home-photo-once.mjs';

test.skip(Boolean(QA_OVERLAY), `the home widgets render from their fixtures, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const MIN_CONTRAST = 4.5; // WCAG 1.4.3; the group names are large text, held to the same
const RING = {
    width: '2px', style: 'solid', offset: '2px', colour: 'rgb(35, 39, 43)',
}; // ticket 25's ring on light grounds
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const SPECIES = '.rf-species';
const ABOUT = '.rf-about';
const GROUP_LINK = '.rf-species-group__link';
const GROUP_PHOTO = '.rf-species-group__img';
const TOLERANCE = 1; // px: the ticket's "within 1px"

const desktop = testInfo => testInfo.project.name === 'desktop-1280';

async function open(page, { without = [] } = {}) {
    const cases = homeCases().filter(({ widget }) => !without.includes(widget));
    const { problems } = await openHomePage(page, cases, { variation: QA_VARIATION });
    expect(problems, 'the page loads nothing but its widgets\' fixture files, the theme\'s assets and fonts').toEqual([]);
}

// Each element's box on the page (document coordinates).
const boxes = (page, selector) => page.locator(selector).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
}));

const noSidewaysScroll = async (page, width) => {
    const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(scroll.scrollWidth, `no sideways scroll at ${width}px`).toBe(scroll.innerWidth);
};

test.describe('the home page\'s Species section and About block (widgets/shop-by-fish, widgets/about)', () => {
    test('at 1280 the three Species groups sit side by side with equal widths and photo heights, each photo 16:10, and one photo height a row from 801px (story 13)', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the desktop layout');
        for (const width of [1280, 1024, 801]) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const links = await boxes(page, GROUP_LINK); // eslint-disable-line no-await-in-loop
            const photos = await boxes(page, `${GROUP_LINK} .rf-species-group__media`); // eslint-disable-line no-await-in-loop
            expect(links).toHaveLength(3);
            testInfo.annotations.push({ type: 'groups', description: `at ${width}px: ${links.map(box => `${box.width.toFixed(1)}x${box.height.toFixed(1)}`).join(', ')}` });
            expect(Math.max(...links.map(box => box.width)) - Math.min(...links.map(box => box.width)), `equal widths at ${width}px`).toBeLessThanOrEqual(TOLERANCE);
            expect(Math.max(...photos.map(box => box.height)) - Math.min(...photos.map(box => box.height)), `equal photo heights at ${width}px`).toBeLessThanOrEqual(TOLERANCE);
            expect(new Set(links.map(box => Math.round(box.top))).size, `one row at ${width}px`).toBe(1);
            for (const [index, link] of links.entries()) {
                if (index) expect(link.left, `group ${index + 1} sits right of group ${index}`).toBeGreaterThan(links[index - 1].right);
            }
            // 16:10 where no group's text needs more (1280); never shorter than 16:10.
            for (const photo of photos) expect(photo.height).toBeGreaterThanOrEqual((photo.width / 1.6) - TOLERANCE);
            if (width === 1280) for (const photo of photos) expect(photo.width / photo.height).toBeCloseTo(1.6, 1);
        }
    });

    test('on phones the groups stack, each photo 16:9 or taller for its text, and nothing scrolls sideways at 375 or 320 (HOME-3, story 71)', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'a phone layout');
        for (const width of [375, 320]) {
            await page.setViewportSize({ width, height: 812 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const groups = await boxes(page, '.rf-species-group'); // eslint-disable-line no-await-in-loop
            const photos = await boxes(page, `${GROUP_LINK} .rf-species-group__media`); // eslint-disable-line no-await-in-loop
            expect(groups).toHaveLength(3);
            for (const [index, group] of groups.entries()) {
                if (index) expect(group.top, `group ${index + 1} at ${width}px sits below group ${index}`).toBeGreaterThanOrEqual(groups[index - 1].bottom);
                expect(photos[index].height, `group ${index + 1}'s photo at ${width}px is 16:9 or taller`).toBeGreaterThanOrEqual((photos[index].width * 9 / 16) - TOLERANCE);
            }
            const pills = await boxes(page, '.rf-species-pill'); // eslint-disable-line no-await-in-loop
            expect(pills).toHaveLength(11);
            for (const pill of pills) expect(pill.right, `every pill inside the viewport at ${width}px`).toBeLessThanOrEqual(width);
            await noSidewaysScroll(page, width); // eslint-disable-line no-await-in-loop
        }
    });

    // CD-4: the page's one allowed repeat shows only the Dry banner's left third, so none of its
    // flies is one the Dry card shows, and sits a section or more after the card.
    test('the cold-water group shows the Dry banner\'s left third, marked data-rf-photo-repeat, a section or more after the Dry card (CD-4)', async ({ page }) => {
        await open(page);
        const crop = await page.locator(`${GROUP_PHOTO}[${REPEAT_ATTRIBUTE}]`).evaluateAll(elements => elements.map(element => {
            const box = element.closest('.rf-species-group__media').getBoundingClientRect();
            const image = element.getBoundingClientRect();
            const widgets = [...document.querySelectorAll('[data-widget-id]')];
            const style = getComputedStyle(element);
            return {
                src: element.currentSrc,
                boxLeft: box.left,
                boxWidth: box.width,
                left: image.left,
                width: image.width,
                objectPosition: style.objectPosition,
                widget: widgets.indexOf(element.closest('[data-widget-id]')),
                dryWidget: widgets.indexOf(document.querySelector('.rf-type-card__img').closest('[data-widget-id]')),
                dry: document.querySelector('.rf-type-card__img').currentSrc,
            };
        }));
        expect(crop, 'one marked photo, the cold-water group\'s').toHaveLength(1);
        const [cold] = crop;
        expect(photoKey(cold.src)).toBe(photoKey(cold.dry));
        expect(cold.left, 'drawn from the box\'s left edge').toBeCloseTo(cold.boxLeft, 0);
        expect(cold.width / cold.boxWidth, 'drawn three times as wide as its box').toBeCloseTo(3, 1);
        expect(cold.objectPosition, 'from the photo\'s left edge').toMatch(/^0(px|%) 50%$/);
        expect(cold.widget - cold.dryWidget, 'at least one widget between the Dry card\'s and the crop\'s').toBeGreaterThanOrEqual(2);
        // The others are whole-height crops of their own frames.
        const others = await page.locator(`${GROUP_PHOTO}:not([${REPEAT_ATTRIBUTE}])`).evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width / element.closest('.rf-species-group__media').getBoundingClientRect().width));
        expect(others).toHaveLength(2);
        for (const ratio of others) expect(ratio).toBeCloseTo(1, 2);
    });

    test('every photo in both sections loads, lazily, with no fetchpriority', async ({ page }) => {
        await open(page);
        const images = await page.locator(`${SPECIES} img, ${ABOUT} img`).evaluateAll(elements => elements.map(element => ({
            src: element.currentSrc, complete: element.complete && element.naturalWidth > 0, loading: element.getAttribute('loading'), fetchpriority: element.getAttribute('fetchpriority'),
        })));
        expect(images).toHaveLength(4);
        for (const image of images) expect(image).toEqual(expect.objectContaining({ complete: true, loading: 'lazy', fetchpriority: null }));
    });

    test('each group\'s name keeps 4.5:1 or better over its scrim and photo', async ({ page }, testInfo) => {
        const widths = desktop(testInfo) ? [801, 1024, 1280] : [320, 375];
        for (const width of widths) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            for (const group of [1, 2, 3]) {
                const selector = `.rf-species-group:nth-child(${group}) .rf-species-group__name`;
                await page.locator(selector).evaluate(element => element.scrollIntoView({ block: 'center' })); // eslint-disable-line no-await-in-loop
                const { ratio, text, lightest } = await worstContrastOverPhoto(page, selector); // eslint-disable-line no-await-in-loop
                testInfo.annotations.push({ type: 'contrast', description: `group ${group}'s name at ${width}px: ${ratio.toFixed(2)}:1 (rgb ${text} on the lightest pixel behind it, rgb ${lightest})` });
                expect(ratio, `group ${group}'s name at ${width}px: rgb ${text} on rgb ${lightest}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
            }
        }
    });

    test('the About block is an even split from 801px with the 4:3 photo on the left, and stacks on phones, photo first, with no sideways scroll (CD-9, story 65)', async ({ page }, testInfo) => {
        const widths = desktop(testInfo) ? [1280, 801] : [375, 320];
        for (const width of widths) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const [media] = await boxes(page, `${ABOUT} .rf-about__media`); // eslint-disable-line no-await-in-loop
            const [body] = await boxes(page, `${ABOUT} .rf-about__body`); // eslint-disable-line no-await-in-loop
            const [photo] = await boxes(page, `${ABOUT} .rf-about__img`); // eslint-disable-line no-await-in-loop
            expect(photo.width / photo.height, `the photo at ${width}px is 4:3`).toBeCloseTo(4 / 3, 2);
            await expect(page.locator(`${ABOUT} .rf-about__img`)).toHaveCSS('border-radius', '16px'); // eslint-disable-line no-await-in-loop
            if (width >= 801) {
                expect(Math.abs(media.width - body.width), `an even split at ${width}px`).toBeLessThanOrEqual(TOLERANCE);
                expect(media.right, `the photo left of the text at ${width}px`).toBeLessThan(body.left);
            } else {
                expect(body.top, `the text below the photo at ${width}px`).toBeGreaterThanOrEqual(media.bottom);
                expect(Math.abs(media.width - body.width), `one column at ${width}px`).toBeLessThanOrEqual(TOLERANCE);
                await noSidewaysScroll(page, width); // eslint-disable-line no-await-in-loop
            }
        }
        const text = await page.locator(ABOUT).innerText();
        expect(text).toContain('Tillsonburg');
        expect(text).toContain('1 866 250 4071');
        expect(text).not.toMatch(/\$\d+\.\d{2}/);
    });

    test('each section has one H2, in page order, and the page\'s headings skip no level (story 68)', async ({ page }) => {
        await open(page);
        for (const selector of [SPECIES, ABOUT]) await expect(page.locator(`${selector} h2`)).toHaveCount(1); // eslint-disable-line no-await-in-loop
        const headings = await page.locator('main h1, main h2, main h3, main h4').evaluateAll(elements => elements.map(element => ({ level: Number(element.tagName[1]), text: element.textContent.trim() })));
        const h2s = headings.filter(({ level }) => level === 2).map(({ text }) => text);
        expect(h2s.indexOf('Shop by fish')).toBeGreaterThan(-1);
        expect(h2s.indexOf('100% Canadian and family-run since 2003')).toBeGreaterThan(h2s.indexOf('Shop by fish'));
        headings.forEach(({ level, text }, index) => {
            const previous = index ? headings[index - 1].level : 1;
            expect(level - previous, `"${text}" (h${level}) after an h${previous}`).toBeLessThanOrEqual(1);
        });
    });

    // R12: a section is switched off by unpublishing its widget. The store then renders nothing for
    // it, so everything after it moves up by exactly its height, and no space is left behind.
    for (const widget of ['shop-by-fish', 'about']) {
        test(`unpublishing ${widget} leaves no gap: what follows moves up by exactly its height`, async ({ page }) => {
            const selector = widget === 'about' ? ABOUT : SPECIES;
            await open(page);
            const before = await page.evaluate(sectionSelector => {
                const wrapper = document.querySelector(sectionSelector).closest('[data-widget-id]').getBoundingClientRect();
                const tiles = document.querySelector('.rf-home-tiles').getBoundingClientRect();
                return {
                    height: wrapper.height, footer: document.querySelector('footer').getBoundingClientRect().top + window.scrollY, tiles: tiles.top + window.scrollY,
                };
            }, selector);
            await open(page, { without: [widget] });
            await expect(page.locator(selector)).toHaveCount(0);
            const after = await page.evaluate(() => ({
                footer: document.querySelector('footer').getBoundingClientRect().top + window.scrollY,
                tiles: document.querySelector('.rf-home-tiles').getBoundingClientRect().top + window.scrollY,
            }));
            expect(before.height, 'the section takes space while placed').toBeGreaterThan(100);
            expect(after.tiles, 'nothing before it moves').toBeCloseTo(before.tiles, 0);
            expect(before.footer - after.footer, 'the footer moves up by the section\'s whole height').toBeCloseTo(before.height, 0);
        });
    }

    test('each group\'s photo is one link with nothing focusable inside, and every link in both sections shows ticket 25\'s focus ring from the keyboard', async ({ page }) => {
        await open(page);
        const groups = page.locator(GROUP_LINK);
        for (let index = 0; index < 3; index += 1) {
            const inside = await groups.nth(index).evaluate(element => element.querySelectorAll('a, button, input, select, textarea, [tabindex]').length); // eslint-disable-line no-await-in-loop
            expect(inside, `group ${index + 1}'s link holds nothing focusable`).toBe(0);
        }
        const links = page.locator(`${SPECIES} a, ${ABOUT} a`);
        const count = await links.count();
        expect(count, 'the hub link, 3 group links, 11 pills, the phone link and the About link').toBe(17);
        await page.keyboard.press('Tab');
        for (let index = 0; index < count; index += 1) {
            const link = links.nth(index);
            await link.evaluate(element => element.focus()); // eslint-disable-line no-await-in-loop
            await expect.poll(() => link.evaluate(element => { // eslint-disable-line no-await-in-loop
                const style = getComputedStyle(element);
                return {
                    visible: element.matches(':focus-visible'), width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset, colour: style.outlineColor,
                };
            }), { message: `link ${index + 1} focused by keyboard`, timeout: 3000 }).toEqual({
                visible: true, width: RING.width, style: RING.style, offset: RING.offset, colour: RING.colour,
            });
        }
        // Every pill a target of 40px, above WCAG 2.5.8's 24px.
        for (const pill of await boxes(page, '.rf-species-pill')) expect(pill.height).toBeGreaterThanOrEqual(40);
    });

    test('has no serious or critical axe issues in the two sections', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include(SPECIES).include(ABOUT).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
