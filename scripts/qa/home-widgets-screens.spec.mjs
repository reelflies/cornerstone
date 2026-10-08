// The home page with its widgets, as ReelFlies_CA places them (ticket 47; spec modules 6 and 7;
// stories 11, 19, 67, 68, 70 and 71; HOME-1, HOME-3, CD-1, CD-4, CD-6): the hero and the three
// big Fly Type cards (widgets/home-lead) in home_below_menu and the six tiles (widgets/link-tiles)
// in home_below_top_products, each rendered from its fixture, on templates/pages/home.html with
// the theme's header and footer and this checkout's theme CSS (render/home-page.mjs).
//
// Page baselines hide every widget (W0-5) and an element shot sees one widget alone, so what only
// the whole page shows is checked here: all six Fly Types within the first 1,600px at 1280, with
// the square crops and with ticket 14's 4:5 frames; the phone layout and no sideways scroll at 375
// and 320; no photo twice; the cards' text over its scrim; and the links from the keyboard.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs home-widgets-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { homeCases, openHomePage } from './render/home-page.mjs';
import { worstContrastOverPhoto } from './render/photo-contrast.mjs';
import {
    MENU_BANNER_ATTRIBUTE, MENU_PANE_ATTRIBUTE, REPEAT_ATTRIBUTE, photoKey,
} from './raw-html/assertions/home-photo-once.mjs';

test.skip(Boolean(QA_OVERLAY), `the home widgets render from their fixtures, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const FIRST_SCREENS = 1600; // HOME-3: all six Fly Types in the first two desktop screens
const MIN_CONTRAST = 4.5; // WCAG 1.4.3; the names are large text, held to the same
const RING = {
    width: '2px', style: 'solid', offset: '2px', colour: 'rgb(35, 39, 43)',
}; // ticket 25's ring on light grounds
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const CARD = '.rf-type-card';
const TILE = '.rf-link-tile';
const FLY_TYPE_TILES = 3; // Eggs & Worms, Warmwater Flies and Saltwater Flies

const desktop = testInfo => testInfo.project.name === 'desktop-1280';

async function open(page, fixtures = {}) {
    const { problems } = await openHomePage(page, homeCases({ fixtures }), { variation: QA_VARIATION });
    expect(problems, 'the page loads nothing but its widgets\' fixture files, the theme\'s assets and fonts').toEqual([]);
}

// Each element's box on the page (document coordinates).
const boxes = (page, selector) => page.locator(selector).evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
}));

// Every <img> on the page but ticket 29's menu pane banners, with the photo it shows (its
// currentSrc), and whether it repeats a photo on purpose: data-rf-photo-repeat on the <img> or on
// a <source> of its <picture>, where home-photo-once reads it (ticket 49's crop of the Dry banner).
// A pane's banner is its category's image, the card's banner for a Fly Type, and the menu's, as
// home-photo-once judges it; a marked banner outside a pane counts.
const photosOnPage = page => page.locator(`img:not([${MENU_PANE_ATTRIBUTE}] [${MENU_BANNER_ATTRIBUTE}])`).evaluateAll((elements, attribute) => elements.map(element => {
    const sources = element.parentElement && element.parentElement.tagName === 'PICTURE' ? [...element.parentElement.querySelectorAll('source')] : [];
    return {
        src: element.currentSrc,
        loading: element.getAttribute('loading'),
        fetchpriority: element.getAttribute('fetchpriority'),
        className: element.className,
        complete: element.complete && element.naturalWidth > 0,
        repeat: [element, ...sources].some(node => node.hasAttribute(attribute)),
    };
}), REPEAT_ATTRIBUTE);

// The photos shown more than once, each named as home-photo-once names a file. An allowed repeat
// isn't counted.
const shownTwice = images => {
    const keys = images.filter(({ src, repeat }) => src && !repeat).map(({ src }) => photoKey(src));
    return keys.filter((key, index) => keys.indexOf(key) !== index);
};

test.describe('the home page\'s cards and tiles (widgets/home-lead, widgets/link-tiles)', () => {
    for (const [crop, fixtures] of [['the square crops', {}], ['ticket 14\'s 4:5 frames', { 'home-lead': 'frames' }]]) {
        test(`puts all six Fly Types within the first ${FIRST_SCREENS}px at 1280, with ${crop}`, async ({ page }, testInfo) => {
            test.skip(!desktop(testInfo), 'HOME-3 measures the desktop page');
            await open(page, fixtures);
            const cards = await boxes(page, CARD);
            const tiles = await boxes(page, TILE);
            expect(cards).toHaveLength(3);
            expect(tiles).toHaveLength(6);
            const flyTypes = [...cards, ...tiles.slice(0, FLY_TYPE_TILES)];
            const bottom = Math.max(...flyTypes.map(box => box.bottom));
            testInfo.annotations.push({ type: 'first screens', description: `with ${crop}, the last Fly Type tile ends at ${Math.round(bottom)}px` });
            expect(bottom, `the bottom edge of the last Fly Type tile, with ${crop}`).toBeLessThanOrEqual(FIRST_SCREENS);
            // Three cards across, then six tiles in one row under them, and nothing in between.
            expect(new Set(cards.map(box => Math.round(box.top))).size).toBe(1);
            expect(new Set(tiles.map(box => Math.round(box.top))).size).toBe(1);
            const ratio = crop === 'the square crops' ? 1 : 0.8;
            for (const card of cards) expect(card.width / card.height).toBeCloseTo(ratio, 1);
            const between = await page.evaluate(([cardsBottom, tilesTop]) => [...document.querySelectorAll('body *')]
                .filter(element => {
                    const rect = element.getBoundingClientRect();
                    return rect.height > 0 && rect.top + window.scrollY >= cardsBottom - 0.5 && rect.bottom + window.scrollY <= tilesTop + 0.5 && element.children.length === 0;
                })
                .map(element => element.outerHTML.slice(0, 80)), [Math.max(...cards.map(box => box.bottom)), Math.min(...tiles.map(box => box.top))]);
            expect(between, 'nothing renders between the cards and the tiles').toEqual([]);
        });
    }

    test('stacks the cards as 16:10 landscape cards and lays the tiles in two columns on phones, with no sideways scroll at 375 or 320', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'a phone layout');
        for (const width of [375, 320]) {
            await page.setViewportSize({ width, height: 812 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const cards = await boxes(page, CARD); // eslint-disable-line no-await-in-loop
            for (const [index, card] of cards.entries()) {
                expect(card.width / card.height, `card ${index + 1} at ${width}px is 16:10`).toBeCloseTo(1.6, 1);
                if (index) expect(card.top, `card ${index + 1} at ${width}px sits below card ${index}`).toBeGreaterThanOrEqual(cards[index - 1].bottom);
            }
            const tiles = await boxes(page, TILE); // eslint-disable-line no-await-in-loop
            expect(new Set(tiles.map(box => Math.round(box.left))).size, `two tile columns at ${width}px`).toBe(2);
            expect(new Set(tiles.map(box => Math.round(box.top))).size, `three tile rows at ${width}px`).toBe(3);
            const scroll = await page.evaluate(() => ({ scrollWidth: document.scrollingElement.scrollWidth, innerWidth: window.innerWidth })); // eslint-disable-line no-await-in-loop
            expect(scroll.scrollWidth, `no sideways scroll at ${width}px`).toBe(scroll.innerWidth);
        }
    });

    test('keeps each card\'s text inside the card, which grows past its photo\'s shape only when the text needs more (counts, a two-line name)', async ({ page }, testInfo) => {
        const widths = desktop(testInfo) ? [801, 1024, 1280] : [320, 375];
        const shape = desktop(testInfo) ? 1 : 1.6; // the square crop, or the phones' 16:10
        for (const width of widths) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page, { 'home-lead': 'counts' }); // eslint-disable-line no-await-in-loop
            // As the counts fixture has them, then with a tree-1 name long enough to wrap (channel 1's copy, ticket 53).
            for (const longName of [null, 'Nymphs & Sub Surface Flies']) {
                if (longName) await page.locator('.rf-type-card__name').nth(1).evaluate((element, name) => element.replaceChildren(name), longName); // eslint-disable-line no-await-in-loop
                const cards = await page.locator(CARD).evaluateAll(elements => elements.map(element => { // eslint-disable-line no-await-in-loop
                    const card = element.getBoundingClientRect();
                    const copy = element.querySelector('.rf-type-card__copy').getBoundingClientRect();
                    return {
                        name: element.querySelector('.rf-type-card__name').textContent, top: card.top, bottom: card.bottom, width: card.width, height: card.height, copyTop: copy.top, copyBottom: copy.bottom,
                    };
                }));
                for (const card of cards) {
                    const where = `${card.name} at ${width}px`;
                    testInfo.annotations.push({ type: 'card text', description: `${where}: text block ${Math.round(card.copyBottom - card.copyTop)}px in a ${Math.round(card.height)}px card` });
                    expect(card.copyTop, `${where}: the text block starts inside the card`).toBeGreaterThanOrEqual(card.top - 0.5);
                    expect(card.copyBottom, `${where}: the text block ends inside the card`).toBeLessThanOrEqual(card.bottom + 0.5);
                    expect(card.height, `${where}: never shorter than its photo's shape`).toBeGreaterThanOrEqual(card.width / shape - 1);
                }
            }
        }
    });

    test('shows no photo twice; the hero\'s is the one fetchpriority="high", the cards load eagerly and the tiles lazily', async ({ page }) => {
        await open(page);
        const images = await photosOnPage(page);
        expect(images.filter(({ src }) => src).length, 'every photo loaded').toBe(images.length);
        expect(shownTwice(images), 'no photo twice').toEqual([]);
        expect(images.filter(({ fetchpriority }) => fetchpriority === 'high').map(({ className }) => className)).toEqual(['rf-hero__img rf-hero__img--mirror']);
        const cards = images.filter(({ className }) => className.startsWith('rf-type-card__img'));
        const tiles = images.filter(({ className }) => className === 'rf-link-tile__img');
        expect(cards).toHaveLength(3);
        expect(tiles).toHaveLength(6);
        for (const card of cards) expect([card.loading, card.fetchpriority]).toEqual([null, null]);
        for (const tile of tiles) expect(tile.loading).toBe('lazy');
        expect(images.every(({ complete }) => complete), 'every photo loaded').toBe(true);
    });

    test('counts a photo shown twice, unless the repeat carries data-rf-photo-repeat, as home-photo-once does (ticket 49\'s crop)', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the rule doesn\'t depend on the width');
        await open(page);
        // A second copy of the Dry card's photo after the tiles, marked or not.
        const repeatDryPhoto = marked => page.evaluate(([isMarked, attribute]) => new Promise(resolve => {
            const copy = document.createElement('img');
            copy.alt = '';
            if (isMarked) copy.setAttribute(attribute, '');
            copy.addEventListener('load', resolve);
            copy.addEventListener('error', resolve);
            copy.src = document.querySelector('.rf-type-card__img').currentSrc;
            document.querySelector('.rf-link-tiles').after(copy);
        }), [marked, REPEAT_ATTRIBUTE]);
        await repeatDryPhoto(true);
        expect(shownTwice(await photosOnPage(page)), 'the marked crop isn\'t counted').toEqual([]);
        await repeatDryPhoto(false);
        expect(shownTwice(await photosOnPage(page)), 'an unmarked repeat is').toEqual([photoKey(await page.locator('.rf-type-card__img').first().evaluate(element => element.currentSrc))]);
    });

    // Ticket 29's pane banners show the cards' Fly Type banners in the menu (rf/spec and
    // rf/standards on 441be5d8, minor 2): a marked banner inside a pane isn't counted, one
    // anywhere else is.
    test('leaves out a menu pane\'s banner that repeats a card\'s photo, and counts a marked banner outside a pane, as home-photo-once does', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the rule doesn\'t depend on the width');
        await open(page);
        const addBanner = inPane => page.evaluate(([isInPane, banner, pane]) => new Promise(resolve => {
            const copy = document.createElement('img');
            copy.alt = '';
            copy.setAttribute(banner, '');
            copy.addEventListener('load', resolve);
            copy.addEventListener('error', resolve);
            copy.src = document.querySelector('.rf-type-card__img').currentSrc;
            if (isInPane) {
                const holder = document.createElement('div');
                holder.setAttribute(pane, '');
                holder.append(copy);
                document.body.prepend(holder);
            } else {
                document.querySelector('.rf-link-tiles').after(copy);
            }
        }), [inPane, MENU_BANNER_ATTRIBUTE, MENU_PANE_ATTRIBUTE]);
        await addBanner(true);
        expect(shownTwice(await photosOnPage(page)), 'a pane\'s banner isn\'t counted').toEqual([]);
        await addBanner(false);
        expect(shownTwice(await photosOnPage(page)), 'a marked banner outside a pane is').toEqual([photoKey(await page.locator('.rf-type-card__img').first().evaluate(element => element.currentSrc))]);
    });

    test('keeps the cards\' text 4.5:1 or better over the scrim and the photo', async ({ page }, testInfo) => {
        const widths = desktop(testInfo) ? [801, 1024, 1280] : [320, 375];
        for (const width of widths) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page, { 'home-lead': 'counts' }); // eslint-disable-line no-await-in-loop
            for (const card of [1, 2, 3]) {
                const item = `.rf-type-cards__item:nth-child(${card})`;
                await page.locator(item).evaluate(element => element.scrollIntoView({ block: 'center' })); // eslint-disable-line no-await-in-loop
                const parts = ['.rf-type-card__label', '.rf-type-card__name', ...(card < 3 ? ['.rf-type-card__count'] : [])];
                for (const part of parts) {
                    const selector = `${item} ${part}`;
                    const { ratio, text, lightest } = await worstContrastOverPhoto(page, selector); // eslint-disable-line no-await-in-loop
                    testInfo.annotations.push({ type: 'contrast', description: `card ${card} ${part} at ${width}px: ${ratio.toFixed(2)}:1 (rgb ${text} on the lightest pixel behind it, rgb ${lightest})` });
                    expect(ratio, `card ${card} ${part} at ${width}px: rgb ${text} on rgb ${lightest}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
                }
            }
        }
    });

    test('makes each card and tile one link that shows ticket 25\'s focus ring from the keyboard', async ({ page }) => {
        await open(page);
        for (const selector of [CARD, TILE]) {
            const links = page.locator(selector);
            const count = await links.count(); // eslint-disable-line no-await-in-loop
            for (let index = 0; index < count; index += 1) {
                const link = links.nth(index);
                const inside = await link.evaluate(element => element.querySelectorAll('a, button, input, select, textarea, [tabindex]').length); // eslint-disable-line no-await-in-loop
                expect(inside, `${selector} ${index + 1} holds nothing focusable`).toBe(0);
                await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
                await link.evaluate(element => element.focus()); // eslint-disable-line no-await-in-loop
                await expect.poll(() => link.evaluate(element => { // eslint-disable-line no-await-in-loop
                    const style = getComputedStyle(element);
                    return {
                        visible: element.matches(':focus-visible'), width: style.outlineWidth, style: style.outlineStyle, offset: style.outlineOffset, colour: style.outlineColor,
                    };
                }), { message: `${selector} ${index + 1} focused by keyboard`, timeout: 3000 }).toEqual({
                    visible: true, width: RING.width, style: RING.style, offset: RING.offset, colour: RING.colour,
                });
            }
        }
    });

    test('has no serious or critical axe issues in the widgets', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('[data-widget-id]').withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
