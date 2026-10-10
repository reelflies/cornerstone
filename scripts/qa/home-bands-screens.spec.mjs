// The home page's product bands as ReelFlies_CA places them (ticket 48; spec module 7; stories 12,
// 17, 68, 70 and 71; R5, CD-6, CD-8, HOME-4, SEO-8): best sellers and the ReelFlies Signature
// Flies band in home_below_top_products after ticket 47's tiles, each rendered from its fixture
// with every other home widget, on templates/pages/home.html with the theme's header and footer
// and this checkout's theme CSS (render/home-page.mjs).
//
// The element shots (widget-screens.spec.mjs) show each band alone; what only the page shows is
// checked here:
//
// - at 1280, best sellers as one row of four cards, and the Signature band with its copy on the
//   left and four cards on the right, on a forest ground that reaches both edges of the window
// - at 375 and 320, both as 2x2 grids (the Signature copy above its cards), with no sideways
//   scroll (CD-8, story 71)
// - width by width, from 320 to 1440: no card's name cut by its clamp, and each photo's sizes
//   attribute declaring the width it renders at (SEO-8, story 70)
// - the spares: a band shows its first four cards; the cards after them stay hidden and their
//   photos unloaded, and move up when a pick is sold out in every size
// - switching a band off (an R12 unpublish, or no products on the channel yet) closes the page up
//   with no gap: the region loses exactly the band's own box and its space above it. Screenshots
//   of the region at 1280 and 375, with each band on and off, are attached to the report.
// - the bands' headings are H2s, in page order after the Fly Type cards' (story 68); every card
//   and the Signature button show ticket 25's focus ring from the keyboard, gold on the forest
//   ground; no serious or critical axe issue in the bands
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs home-bands-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { homeCases, openHomePage } from './render/home-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the home widgets render from their fixtures, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const FOREST = 'rgb(47, 56, 47)'; // $rf-forest, #2F382F (CD-6)
const RING = { light: 'rgb(35, 39, 43)', dark: 'rgb(242, 193, 78)' }; // ticket 25's ring, and its gold bead on forest
const BEST = '.rf-best-sellers';
const SIGNATURE = '.rf-signature';
const REGION = '[data-content-region="home_below_top_products"]';
const BANDS = { 'best-sellers': BEST, 'signature-band': SIGNATURE };

const desktop = testInfo => testInfo.project.name === 'desktop-1280';

// The home page with every widget 1895766 places on it, from the named fixtures, without the
// widgets in `off` (an unpublished placement renders nothing in its region).
async function open(page, { fixtures = {}, off = [] } = {}) {
    const cases = homeCases({ fixtures }).filter(({ widget }) => !off.includes(widget));
    const { problems } = await openHomePage(page, cases, { variation: QA_VARIATION });
    expect(problems, 'the page loads nothing but its widgets\' fixture files, the theme\'s assets and fonts').toEqual([]);
}

// Each card a band shows (rendered), as boxes in document coordinates, with its product id, and
// the cards it keeps hidden.
const cardsIn = (page, band) => page.locator(`${band} .rf-product-cards__item`).evaluateAll(items => items.map(item => {
    const rect = item.getBoundingClientRect();
    const img = item.querySelector('img');
    return {
        product: Number(item.querySelector('a').dataset.rfProduct),
        shown: item.getClientRects().length > 0,
        top: Math.round(rect.top + window.scrollY),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom + window.scrollY),
        loaded: Boolean(img && img.complete && img.naturalWidth > 0),
        requested: Boolean(img && img.currentSrc),
    };
}));

const box = (page, selector) => page.locator(selector).first().evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left, right: rect.right, height: rect.height,
    };
});

const noSidewaysScroll = page => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);

// The window widths the width-by-width checks walk, each project its own side of 801px (the
// medium breakpoint), with every breakpoint's edges: 801px, the container's 1261px (large), and
// 1280px, where the large container stops growing.
const WIDTHS = { phone: [320, 360, 375, 390, 414, 600, 800], desktop: [801, 1024, 1136, 1200, 1260, 1261, 1280, 1440] };
const widthsFor = testInfo => (desktop(testInfo) ? WIDTHS.desktop : WIDTHS.phone);

// Each name a band shows, with the lines it takes and whether its clamp cuts it.
const namesIn = page => page.locator('.rf-home-band .rf-product-card__name').evaluateAll(elements => elements
    .filter(element => element.getClientRects().length > 0)
    .map(element => ({
        band: element.closest('[data-rf-band]').dataset.rfBand,
        name: element.textContent.trim(),
        lines: Math.round(element.clientHeight / parseFloat(getComputedStyle(element).lineHeight)),
        cut: element.scrollHeight > element.clientHeight + 1,
    })));

// Each photo a band shows: the width it renders at, and the width its sizes attribute declares at
// this window width (the first entry whose media condition matches, measured as a CSS width).
const photosIn = page => page.locator('.rf-home-band .rf-product-card__img').evaluateAll(images => images
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
        return {
            band: image.closest('[data-rf-band]').dataset.rfBand,
            product: image.closest('a').dataset.rfProduct,
            rendered: image.getBoundingClientRect().width,
            declared,
        };
    }));

// The colour painted at a point of the page, read from a screenshot of one pixel there.
async function pixel(page, x, y) {
    const shot = await page.screenshot({
        clip: {
            x, y, width: 1, height: 1,
        },
    });
    return page.evaluate(async png => {
        const image = new Image();
        image.src = `data:image/png;base64,${png}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return `rgb(${r}, ${g}, ${b})`;
    }, shot.toString('base64'));
}

test.describe('the home page\'s product bands (widgets/best-sellers, widgets/signature-band)', () => {
    test('at 1280: best sellers in one row of four, the Signature copy on the left and four cards on the right, on a forest ground to both edges', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the desktop layout');
        await open(page);
        const best = await cardsIn(page, BEST);
        const shown = best.filter(card => card.shown);
        expect(shown.map(card => card.product)).toEqual([4877, 4507, 5835, 4754]);
        expect(new Set(shown.map(card => card.top)).size, 'one row').toBe(1);
        const container = await box(page, '.rf-home-tiles');
        expect(Math.min(...shown.map(card => card.left))).toBeGreaterThanOrEqual(Math.floor(container.left));
        expect(Math.max(...shown.map(card => card.right))).toBeLessThanOrEqual(Math.ceil(container.right));

        const signature = await cardsIn(page, SIGNATURE);
        const plates = signature.filter(card => card.shown);
        expect(plates.map(card => card.product)).toEqual([4797, 5837, 6232, 4576]);
        expect(new Set(plates.map(card => card.top)).size, 'one row').toBe(1);
        const copy = await box(page, '.rf-signature__copy');
        expect(copy.right, 'the copy sits left of the cards').toBeLessThan(Math.min(...plates.map(card => card.left)));
        const band = await box(page, SIGNATURE);
        await page.evaluate(top => window.scrollTo(0, top - 100), band.top);
        const middle = band.top + band.height / 2 - await page.evaluate(() => window.scrollY);
        expect(await pixel(page, 2, middle), 'the forest ground reaches the left edge').toBe(FOREST);
        expect(await pixel(page, 1277, middle), 'and the right').toBe(FOREST);
        expect(await noSidewaysScroll(page), 'no sideways scroll').toBe(0);
    });

    test('on phones: both bands as 2x2 grids, the Signature copy above its cards, with no sideways scroll at 375 or 320', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'a phone layout');
        for (const width of [375, 320]) {
            await page.setViewportSize({ width, height: 812 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            for (const band of [BEST, SIGNATURE]) {
                const shown = (await cardsIn(page, band)).filter(card => card.shown); // eslint-disable-line no-await-in-loop
                expect(shown, `${band} at ${width}px shows four cards`).toHaveLength(4);
                expect(new Set(shown.map(card => card.left)).size, `${band} at ${width}px: two columns`).toBe(2);
                expect(new Set(shown.map(card => card.top)).size, `${band} at ${width}px: two rows`).toBe(2);
            }
            const copy = await box(page, '.rf-signature__copy'); // eslint-disable-line no-await-in-loop
            const plates = (await cardsIn(page, SIGNATURE)).filter(card => card.shown); // eslint-disable-line no-await-in-loop
            expect(copy.bottom, `the copy sits above the cards at ${width}px`).toBeLessThanOrEqual(Math.min(...plates.map(card => card.top)));
            expect(await noSidewaysScroll(page), `no sideways scroll at ${width}px`).toBe(0); // eslint-disable-line no-await-in-loop
            const band = await box(page, SIGNATURE); // eslint-disable-line no-await-in-loop
            await page.evaluate(top => window.scrollTo(0, top - 100), band.top); // eslint-disable-line no-await-in-loop
            const y = 100 + 20;
            expect(await pixel(page, 1, y), `the forest ground reaches the left edge at ${width}px`).toBe(FOREST); // eslint-disable-line no-await-in-loop
            expect(await pixel(page, width - 2, y), `and the right at ${width}px`).toBe(FOREST); // eslint-disable-line no-await-in-loop
        }
    });

    test('no card\'s name is cut at any width: two lines at most, or three on the Signature plates on phones, which are narrower by their padding', async ({ page }, testInfo) => {
        await open(page);
        const problems = [];
        for (const width of widthsFor(testInfo)) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            const names = await namesIn(page); // eslint-disable-line no-await-in-loop
            for (const card of names) {
                const most = card.band === 'signature' && width < 801 ? 3 : 2;
                if (card.cut) problems.push(`${card.band} at ${width}px: "${card.name}" is cut`);
                if (card.lines > most) problems.push(`${card.band} at ${width}px: "${card.name}" takes ${card.lines} lines, more than ${most}`);
            }
        }
        expect(problems).toEqual([]);
    });

    test('each photo\'s sizes attribute declares the width it renders at, at every width (within 2.5%), so the browser picks the right srcset file', async ({ page }, testInfo) => {
        await open(page);
        const problems = [];
        for (const width of widthsFor(testInfo)) {
            await page.setViewportSize({ width, height: 900 }); // eslint-disable-line no-await-in-loop
            const photos = await photosIn(page); // eslint-disable-line no-await-in-loop
            expect(photos.length, `eight photos shown at ${width}px`).toBe(8);
            for (const photo of photos) {
                if (Math.abs(photo.declared - photo.rendered) > photo.rendered * 0.025) problems.push(`${photo.band} ${photo.product} at ${width}px: sizes declares ${photo.declared.toFixed(1)}px, it renders at ${photo.rendered.toFixed(1)}px`);
            }
        }
        expect(problems).toEqual([]);
    });

    test('a band shows its first four cards: the spares stay hidden with their photos unloaded, and move up when a pick is sold out in every size', async ({ page }) => {
        await open(page);
        for (const band of [BEST, SIGNATURE]) {
            const cards = await cardsIn(page, band); // eslint-disable-line no-await-in-loop
            expect(cards.map(card => card.shown), band).toEqual([true, true, true, true, false, false]);
            expect(cards.slice(0, 4).every(card => card.loaded), `${band}: the four shown photos loaded`).toBe(true);
            expect(cards.slice(4).some(card => card.requested), `${band}: no spare's photo was fetched`).toBe(false);
        }
        await open(page, { fixtures: { 'best-sellers': 'sold-out' } });
        const cards = await cardsIn(page, BEST);
        expect(cards.filter(card => card.shown).map(card => card.product), 'Prince Nymph sold out, Pheasant Tail missing: both spares move up').toEqual([4877, 5835, 4675, 4368]);
        expect(cards.every(card => card.shown && card.loaded)).toBe(true);
    });

    for (const widget of Object.keys(BANDS)) {
        test(`switching ${widget} off closes the page up with no gap, as a band with no products does`, async ({ page }, testInfo) => {
            const shots = {};
            const measure = async name => {
                const region = await box(page, REGION);
                shots[name] = await page.locator(REGION).screenshot();
                await testInfo.attach(`${widget} ${name} (${testInfo.project.name})`, { body: shots[name], contentType: 'image/png' });
                return region;
            };
            await open(page);
            const on = await measure('on');
            const band = await box(page, BANDS[widget]);
            // The band's box holds its padding (best sellers' space above it); the Signature band's
            // space above it is its margin.
            const space = await page.locator(BANDS[widget]).evaluate(element => parseFloat(getComputedStyle(element).marginTop));
            await open(page, { off: [widget] });
            const off = await measure('off');
            expect(await page.locator(BANDS[widget]).count(), 'the band is gone').toBe(0);
            expect(on.height - off.height, `the region loses the band's box (${Math.round(band.height)}px) and its space above it (${space}px), and nothing more`).toBeCloseTo(band.height + space, 0);
            expect(await noSidewaysScroll(page)).toBe(0);
            if (widget === 'best-sellers') {
                await open(page, { fixtures: { 'best-sellers': 'empty' } });
                const empty = await measure('with no products');
                expect(await page.locator(BEST).isVisible(), 'a band with no card hides itself, heading included').toBe(false);
                expect(empty.height, 'and takes the space an unpublished band does').toBeCloseTo(off.height, 0);
            }
        });
    }

    test('the bands\' headings are H2s, in page order after the Fly Type cards\', and each card\'s name an H3 under its band', async ({ page }) => {
        await open(page);
        const headings = await page.locator('main h1:visible, main h2:visible, main h3:visible').evaluateAll(elements => elements.map(element => `${element.tagName.toLowerCase()} ${element.textContent.trim()}`));
        const bandHeadings = headings.filter(line => /^h2 (Best sellers|ReelFlies Signature Flies)$/.test(line));
        expect(bandHeadings).toEqual(['h2 Best sellers', 'h2 ReelFlies Signature Flies']);
        const best = headings.indexOf('h2 Best sellers');
        const signature = headings.indexOf('h2 ReelFlies Signature Flies');
        expect(headings.slice(0, best).filter(line => line.startsWith('h2'))).toEqual(['h2 Dry Flies', 'h2 Nymphs', 'h2 Streamers']);
        expect(headings.slice(best + 1, signature)).toEqual(['Adams Parachute Dry Fly', 'Beadhead Prince Nymph', 'Elk Hair Caddis Tan', 'Beadhead Pheasant Tail'].map(name => `h3 ${name}`));
        // Ticket 49's sections follow the Signature band (sort_order 40 and 70), each with its own H2.
        const next = headings.findIndex((line, index) => index > signature && line.startsWith('h2'));
        expect(headings.slice(signature + 1, next === -1 ? undefined : next)).toEqual(['Black Reel Egg Sucking Leech', 'ReelCray Orange Crayfish', 'Tungsten Beadhead Egg Flies', 'Reel Egg Nuke'].map(name => `h3 ${name}`));
    });

    test('every card and the Signature button show ticket 25\'s focus ring from the keyboard, gold on the forest ground', async ({ page }) => {
        await open(page);
        const targets = [
            ...[0, 1, 2, 3].map(index => [`${BEST} .rf-product-card >> nth=${index}`, RING.light]),
            ['.rf-signature__button', RING.dark],
            ...[0, 1, 2, 3].map(index => [`${SIGNATURE} .rf-product-card >> nth=${index}`, RING.dark]),
        ];
        await page.keyboard.press('Tab');
        for (const [selector, colour] of targets) {
            const link = page.locator(selector);
            await link.evaluate(element => element.focus()); // eslint-disable-line no-await-in-loop
            await expect.poll(() => link.evaluate(element => { // eslint-disable-line no-await-in-loop
                const style = getComputedStyle(element);
                return {
                    visible: element.matches(':focus-visible'), width: style.outlineWidth, style: style.outlineStyle, colour: style.outlineColor, inside: element.querySelectorAll('a, button, input, select, textarea, [tabindex]').length,
                };
            }), { message: `${selector} focused by keyboard`, timeout: 3000 }).toEqual({
                visible: true, width: '2px', style: 'solid', colour, inside: 0,
            });
        }
    });

    test('has no serious or critical axe issues in the bands', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include(BEST).include(SIGNATURE).withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
