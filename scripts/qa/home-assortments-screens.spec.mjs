// The home page's Assortments band as ReelFlies_CA places it (ticket 49; spec module 7; stories
// 18, 68, 70 and 71; R5, HOME-3, HOME-4, SEO-8, R12): widgets/assortments-band in
// home_below_top_products after the Species section, rendered from its fixture with every other
// home widget, on templates/pages/home.html with the theme's header and footer and this
// checkout's theme CSS (render/home-page.mjs).
//
// The element shots (widget-screens.spec.mjs) show the band alone; what only the page shows is
// checked here:
//
// - at 1280, the copy in the left 4/12 beside three cards in the right 8/12, on the tinted ground
//   (#F1F3F0) with a 20px radius, inside the page's container; from 801px to 1260px the copy
//   above the three cards; at 375 and 320 the copy above two cards in two columns, the third
//   hidden, with no sideways scroll (story 71)
// - width by width, from 320 to 1440: no card's name cut by its clamp (two lines from 801px,
//   four on phones, where an Assortment's long name needs them at 320), with every pick's card
//   shown in turn, spares included; and each shown
//   photo's sizes attribute declaring the width it renders at (SEO-8, story 70), as ticket 48's
//   home-bands-screens measures its bands
// - the spares: the band shows its first three cards (two on phones); the cards after them stay
//   hidden with their photos unfetched, and move up when a pick is sold out or missing
// - fewer cards: two left share the row from 801px, with no empty column; one or none hides the
//   band, as an unpublished one (no lone card beside the copy)
// - switching the band off (an R12 unpublish) leaves no gap: nothing before it moves and the
//   footer moves up by exactly its height
// - the copy says the fly boxes are not included; each card shows its price with no "/ fly" and
//   is one link with nothing focusable inside (story 18)
// - its heading an H2 between the Species section's and About's, the cards' names H3s under it
//   (story 68); the link and each shown card take ticket 25's focus ring from the keyboard, the
//   hidden spares out of the tab order; no serious or critical axe issue in the band
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs home-assortments-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { homeCases, openHomePage } from './render/home-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the home widgets render from their fixtures, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const RING = {
    width: '2px', style: 'solid', colour: 'rgb(35, 39, 43)',
}; // ticket 25's ring on light grounds
const TINT = 'rgb(241, 243, 240)'; // $rf-tile, #F1F3F0 (the ticket's tint)
const WIDGET = 'assortments-band';
const BAND = '.rf-assortments';
const PANEL = '.rf-assortments__inner';
const COPY = '.rf-assortments__copy';
const CARDS = '.rf-assortments__cards';
const PICKED = [3886, 3870, 4251, 4888, 4397];
const TOLERANCE = 1; // px

const desktop = testInfo => testInfo.project.name === 'desktop-1280';

// The home page with every widget 1895766 places on it, the band from the named fixture, or
// without the band (an unpublished placement renders nothing in its region).
async function open(page, { fixture = 'default', off = false } = {}) {
    const cases = homeCases({ fixtures: { [WIDGET]: fixture } }).filter(({ widget }) => !(off && widget === WIDGET));
    const { problems } = await openHomePage(page, cases, { variation: QA_VARIATION });
    expect(problems, 'the page loads nothing but its widgets\' fixture files, the theme\'s assets and fonts').toEqual([]);
}

// Each card the band rendered, with its box in document coordinates, whether it shows, and its
// photo's state.
const cardsIn = page => page.locator(`${BAND} .rf-product-cards__item`).evaluateAll(items => items.map(item => {
    const rect = item.getBoundingClientRect();
    const img = item.querySelector('img');
    return {
        product: Number(item.querySelector('a').dataset.rfProduct),
        shown: item.getClientRects().length > 0,
        top: Math.round(rect.top + window.scrollY),
        left: rect.left,
        right: rect.right,
        loaded: Boolean(img && img.complete && img.naturalWidth > 0),
        requested: Boolean(img && img.currentSrc),
    };
}));
const shownIn = async page => (await cardsIn(page)).filter(card => card.shown);

const box = (page, selector) => page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
});

const sidewaysScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);

// The window widths the width-by-width checks walk, each project its own side of 801px, with
// every breakpoint's edges: 801px, the large container's 1261px, and 1280px.
const WIDTHS = { phone: [320, 360, 375, 390, 414, 600, 800], desktop: [801, 1024, 1136, 1200, 1260, 1261, 1280, 1440] };
const widthsFor = testInfo => (desktop(testInfo) ? WIDTHS.desktop : WIDTHS.phone);

// Each card name shown, with the lines it takes and whether its clamp cuts it.
const namesIn = page => page.locator(`${BAND} .rf-product-card__name`).evaluateAll(elements => elements
    .filter(element => element.getClientRects().length > 0)
    .map(element => ({
        name: element.textContent.trim(),
        lines: Math.round(element.clientHeight / parseFloat(getComputedStyle(element).lineHeight)),
        cut: element.scrollHeight > element.clientHeight + 1,
    })));

// Each photo shown: the width it renders at, and the width its sizes attribute declares at this
// window width (the first entry whose media condition matches, measured as a CSS width).
const photosIn = page => page.locator(`${BAND} .rf-product-card__img`).evaluateAll(images => images
    .filter(image => image.getClientRects().length > 0)
    .map(image => {
        const entries = image.getAttribute('sizes').split(/,(?![^()]*\))/).map(entry => entry.trim());
        const chosen = entries.map(entry => entry.match(/^(\([^()]*\))\s+(.+)$/) || [entry, null, entry])
            .find(([, media]) => !media || window.matchMedia(media).matches);
        const probe = document.createElement('div');
        probe.style.cssText = `position: absolute; visibility: hidden; width: ${chosen[2]}`;
        document.body.append(probe);
        const declared = probe.getBoundingClientRect().width;
        probe.remove();
        return { product: image.closest('a').dataset.rfProduct, rendered: image.getBoundingClientRect().width, declared };
    }));

test.describe('the home page\'s Assortments band (widgets/assortments-band)', () => {
    test('at 1280: the copy in the left 4/12 beside three cards in the right 8/12, in one row, on the tinted ground with a 20px radius inside the container', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the desktop layout');
        await open(page);
        const shown = await shownIn(page);
        expect(shown.map(card => card.product)).toEqual(PICKED.slice(0, 3));
        expect(new Set(shown.map(card => card.top)).size, 'one row').toBe(1);
        const copy = await box(page, COPY);
        const cards = await box(page, CARDS);
        expect(copy.right, 'the copy sits left of the cards').toBeLessThan(Math.min(...shown.map(card => card.left)));
        expect(cards.width / copy.width, 'the cards take twice the copy\'s width: 8/12 and 4/12').toBeCloseTo(2, 1);
        expect(Math.max(...shown.map(card => card.right)), 'the three cards fill their 8/12').toBeCloseTo(cards.right, 0);
        const panel = await box(page, PANEL);
        const container = await box(page, '.rf-home-tiles');
        expect(Math.abs(panel.left - container.left), 'the band lines up with the container\'s left edge').toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(panel.right - container.right), 'and its right edge').toBeLessThanOrEqual(TOLERANCE);
        await expect(page.locator(PANEL)).toHaveCSS('background-color', TINT);
        await expect(page.locator(PANEL)).toHaveCSS('border-radius', '20px');
        expect(await sidewaysScroll(page), 'no sideways scroll').toBe(0);
    });

    test('from 801px to 1260px: the copy above the three cards, in one row across the band', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the desktop layouts');
        for (const width of [1260, 1024, 801]) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const shown = await shownIn(page); // eslint-disable-line no-await-in-loop
            expect(shown.map(card => card.product), `three cards at ${width}px`).toEqual(PICKED.slice(0, 3));
            expect(new Set(shown.map(card => card.top)).size, `one row at ${width}px`).toBe(1);
            const copy = await box(page, COPY); // eslint-disable-line no-await-in-loop
            expect(copy.bottom, `the copy above the cards at ${width}px`).toBeLessThanOrEqual(Math.min(...shown.map(card => card.top)));
            expect(await sidewaysScroll(page), `no sideways scroll at ${width}px`).toBe(0); // eslint-disable-line no-await-in-loop
        }
    });

    test('on phones: the copy above two cards in two columns, the third hidden with its photo unfetched, and no sideways scroll at 375 or 320 (story 71)', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'a phone layout');
        for (const width of [375, 320]) {
            await page.setViewportSize({ width, height: 812 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            const cards = await cardsIn(page); // eslint-disable-line no-await-in-loop
            expect(cards.map(card => card.shown), `two cards at ${width}px`).toEqual([true, true, false, false, false]);
            const shown = cards.filter(card => card.shown);
            expect(new Set(shown.map(card => card.top)).size, `one row at ${width}px`).toBe(1);
            expect(shown.every(card => card.loaded), `the two photos loaded at ${width}px`).toBe(true);
            expect(cards.slice(2).some(card => card.requested), `no hidden card's photo fetched at ${width}px`).toBe(false);
            const copy = await box(page, COPY); // eslint-disable-line no-await-in-loop
            expect(copy.bottom, `the copy above the cards at ${width}px`).toBeLessThanOrEqual(Math.min(...shown.map(card => card.top)));
            await expect(page.locator(PANEL)).toHaveCSS('background-color', TINT); // eslint-disable-line no-await-in-loop
            await expect(page.locator(PANEL)).toHaveCSS('border-radius', '20px'); // eslint-disable-line no-await-in-loop
            expect(await sidewaysScroll(page), `no sideways scroll at ${width}px`).toBe(0); // eslint-disable-line no-await-in-loop
        }
    });

    test('no card\'s name is cut at any width, whichever pick shows: two lines at most from 801px, four on phones', async ({ page }, testInfo) => {
        await open(page);
        // Every pick's card shown in turn, spares included, at the width the layout gives a card.
        await page.addStyleTag({ content: `${BAND} .rf-product-cards__item { display: flex !important; }` });
        const problems = [];
        for (const width of widthsFor(testInfo)) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            const names = await namesIn(page); // eslint-disable-line no-await-in-loop
            expect(names, `every pick's name at ${width}px`).toHaveLength(PICKED.length);
            const most = width < 801 ? 4 : 2;
            for (const card of names) {
                if (card.cut) problems.push(`at ${width}px: "${card.name}" is cut`);
                if (card.lines > most) problems.push(`at ${width}px: "${card.name}" takes ${card.lines} lines, more than ${most}`);
            }
        }
        expect(problems).toEqual([]);
    });

    test('each shown photo\'s sizes attribute declares the width it renders at, at every width (within 2.5%), with the picks and with the spares moved up', async ({ page }, testInfo) => {
        const problems = [];
        for (const fixture of ['default', 'sold-out']) {
            await page.setViewportSize({ width: desktop(testInfo) ? 1280 : 375, height: 900 }); // eslint-disable-line no-await-in-loop
            await open(page, { fixture }); // eslint-disable-line no-await-in-loop
            for (const width of widthsFor(testInfo)) {
                await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
                const photos = await photosIn(page); // eslint-disable-line no-await-in-loop
                expect(photos.length, `${fixture}: ${width < 801 ? 'two' : 'three'} photos shown at ${width}px`).toBe(width < 801 ? 2 : 3);
                for (const photo of photos) {
                    if (Math.abs(photo.declared - photo.rendered) > photo.rendered * 0.025) problems.push(`${fixture} ${photo.product} at ${width}px: sizes declares ${photo.declared.toFixed(1)}px, it renders at ${photo.rendered.toFixed(1)}px`);
                }
            }
        }
        expect(problems).toEqual([]);
    });

    test('the band shows its first three cards (two on phones): the spares stay hidden with their photos unfetched, and move up when a pick is sold out or missing', async ({ page }, testInfo) => {
        const show = desktop(testInfo) ? 3 : 2;
        await open(page);
        const cards = await cardsIn(page);
        expect(cards.map(card => card.product)).toEqual(PICKED);
        expect(cards.map(card => card.shown)).toEqual(PICKED.map((id, index) => index < show));
        expect(cards.slice(0, show).every(card => card.loaded), 'the shown photos loaded').toBe(true);
        expect(cards.slice(show).some(card => card.requested), 'no hidden card\'s photo was fetched').toBe(false);
        await open(page, { fixture: 'sold-out' });
        expect((await shownIn(page)).map(card => card.product), '42 Mayfly sold out, the Adams Family missing: both spares move up').toEqual([3870, 4888, 4397].slice(0, show));
    });

    test('with two picks left they share the row from 801px, with no column left empty; with one or none the band hides itself, as an unpublished one', async ({ page }, testInfo) => {
        await open(page, { fixture: 'two-left' });
        const shown = await shownIn(page);
        expect(shown.map(card => card.product)).toEqual([3870, 4397]);
        expect(new Set(shown.map(card => card.top)).size, 'one row').toBe(1);
        const cards = await box(page, CARDS);
        expect(Math.min(...shown.map(card => card.left)), 'from the cards\' left edge').toBeCloseTo(cards.left, 0);
        expect(Math.max(...shown.map(card => card.right)), 'to their right edge: no empty column').toBeCloseTo(cards.right, 0);
        if (desktop(testInfo)) {
            const copy = await box(page, COPY);
            expect(copy.right, 'beside the copy at 1280').toBeLessThan(cards.left);
        }
        await open(page, { off: true });
        const off = await box(page, 'footer');
        for (const fixture of ['one-left', 'empty']) {
            await open(page, { fixture }); // eslint-disable-line no-await-in-loop
            await expect(page.locator(BAND), `${fixture}: the band hides itself, heading and copy included`).toBeHidden(); // eslint-disable-line no-await-in-loop
            expect((await box(page, 'footer')).top, `${fixture}: the page closes up as if the band were unpublished`).toBeCloseTo(off.top, 0); // eslint-disable-line no-await-in-loop
        }
    });

    // R12: the band is switched off by unpublishing its widget. The store then renders nothing for
    // it, so everything after it moves up by exactly its height, and no space is left behind.
    test('unpublishing the band leaves no gap: nothing before it moves, and the footer moves up by exactly its height', async ({ page }, testInfo) => {
        await open(page);
        const measure = () => page.evaluate(() => ({
            footer: document.querySelector('footer').getBoundingClientRect().top + window.scrollY,
            species: document.querySelector('.rf-species').getBoundingClientRect().bottom + window.scrollY,
        }));
        const before = await measure();
        const wrapper = await page.locator(BAND).evaluate(element => element.closest('[data-widget-id]').getBoundingClientRect().height);
        const section = await box(page, BAND);
        await testInfo.attach(`on (${testInfo.project.name})`, { body: await page.locator('[data-content-region="home_below_top_products"]').screenshot(), contentType: 'image/png' });
        await open(page, { off: true });
        await expect(page.locator(BAND)).toHaveCount(0);
        await testInfo.attach(`off (${testInfo.project.name})`, { body: await page.locator('[data-content-region="home_below_top_products"]').screenshot(), contentType: 'image/png' });
        const after = await measure();
        expect(wrapper, 'the band takes space while placed').toBeGreaterThan(200);
        expect(wrapper, 'its space above it is its own: the widget\'s box is the section\'s').toBeCloseTo(section.height, 0);
        expect(after.species, 'nothing before it moves').toBeCloseTo(before.species, 0);
        expect(before.footer - after.footer, 'the footer moves up by the band\'s whole height').toBeCloseTo(wrapper, 0);
    });

    test('the copy says the fly boxes are not included, and each card shows its set\'s price with no "/ fly", one link with nothing focusable inside (story 18)', async ({ page }) => {
        await open(page);
        await expect(page.locator(COPY)).toContainText('Fly boxes are shown for scale and not included.');
        const cards = page.locator(`${BAND} .rf-product-card:visible`);
        const prices = await cards.locator('.rf-product-card__price').allInnerTexts();
        expect(prices.length).toBeGreaterThanOrEqual(2);
        for (const price of prices) expect(price.trim()).toMatch(/^\$\d+\.\d{2}$/);
        expect(await page.locator(BAND).innerText()).not.toMatch(/\/\s*fly|per fly/i);
        const inside = await page.locator(`${BAND} .rf-product-card`).evaluateAll(links => links.map(link => link.querySelectorAll('a, button, input, select, textarea, [tabindex]').length));
        expect(inside).toEqual(PICKED.map(() => 0));
        await expect(page.locator(`${BAND} button`)).toHaveCount(0);
    });

    test('its heading is an H2 between the Species section\'s and About\'s, with the cards\' names as H3s under it (story 68)', async ({ page }) => {
        await open(page);
        await expect(page.locator(`${BAND} h2`)).toHaveCount(1);
        const headings = await page.locator('main h1:visible, main h2:visible, main h3:visible').evaluateAll(elements => elements.map(element => `${element.tagName.toLowerCase()} ${element.textContent.trim()}`));
        const at = headings.indexOf('h2 Fly selections');
        expect(at).toBeGreaterThan(headings.indexOf('h2 Shop by fish'));
        expect(at).toBeLessThan(headings.indexOf('h2 100% Canadian and family-run since 2003'));
        const next = headings.findIndex((line, index) => index > at && line.startsWith('h2'));
        expect(headings.slice(at + 1, next).every(line => line.startsWith('h3 ')), 'only the cards\' H3s under it').toBe(true);
    });

    test('the link and each shown card take ticket 25\'s focus ring from the keyboard, and the hidden spares are out of the tab order', async ({ page }, testInfo) => {
        await open(page);
        const show = desktop(testInfo) ? 3 : 2;
        const targets = [page.locator(`${BAND} .rf-assortments__link`), ...[...Array(show).keys()].map(index => page.locator(`${BAND} .rf-product-card`).nth(index))];
        await page.keyboard.press('Tab');
        await targets[0].focus();
        for (const [index, target] of targets.entries()) {
            if (index) await page.keyboard.press('Tab'); // eslint-disable-line no-await-in-loop
            await expect.poll(() => target.evaluate(element => { // eslint-disable-line no-await-in-loop
                const style = getComputedStyle(element);
                return {
                    focused: document.activeElement === element, visible: element.matches(':focus-visible'), width: style.outlineWidth, style: style.outlineStyle, colour: style.outlineColor,
                };
            }), { message: `target ${index + 1} focused by the keyboard`, timeout: 3000 }).toEqual({
                focused: true, visible: true, width: RING.width, style: RING.style, colour: RING.colour,
            });
        }
        await page.keyboard.press('Tab');
        expect(await page.evaluate(selector => Boolean(document.activeElement.closest(selector)), BAND), 'the next Tab leaves the band: the spares take no stop').toBe(false);
    });

    test('has no serious or critical axe issues in the band', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include(BAND).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
