// The home lead's layout, contrast and accessibility (ticket 46; spec module 6; stories 11, 67,
// 68, 70), checked on the widget's fixture page (W0-9), which renders widgets/home-lead from
// the fixture ReelFlies_CA gets, inside the theme's own body, with this checkout's theme CSS.
// The store's copy of the hero is hidden in page baselines (W0-5's HIDDEN, in pages.mjs), so its
// layout is checked here, from its source, and its look by widget-screens.spec.mjs's element shots.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
//
//   npx playwright test --config scripts/qa/playwright.config.mjs home-lead-screens

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION } from './storefront.mjs';
import { WIDGETS_DIR, widgetCases } from './render/render.mjs';
import { openWidget } from './render/widget-page.mjs';
import { contrast, luminance, worstContrastOverPhoto } from './render/photo-contrast.mjs';

test.skip(Boolean(QA_OVERLAY), `the hero renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const HERO = widgetCases([WIDGETS_DIR]).find(({ widget, name }) => widget === 'home-lead' && name === 'default');
const MAX_HEIGHT = 300; // CD-1
const MIN_CONTRAST = 4.5; // WCAG 1.4.3, for the hero's text over the scrim and the photo
const MIN_RING_CONTRAST = 3; // WCAG 1.4.11, for the focus ring against what is round it
// Ticket 25's rings (_settings.scss): #23272B on light grounds, the gold bead #F2C14E on dark.
const RING = { width: '2px', style: 'solid', offset: '2px' };
const RING_ON_LIGHT = 'rgb(35, 39, 43)';
const RING_ON_DARK = 'rgb(242, 193, 78)';
const RING_REACH = 6; // px past the button's edge: the 2px offset, the 2px ring and 2px beyond it
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const desktop = testInfo => testInfo.project.name === 'desktop-1280';
const box = locator => locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height,
    };
});

async function open(page) {
    const { widget, problems } = await openWidget(page, HERO, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but the fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    return widget;
}

const rgbOf = colour => colour.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

// The outline a focused element draws, and whether it matches :focus-visible.
const outlineOf = locator => locator.evaluate(element => {
    const style = getComputedStyle(element);
    return {
        focused: element === document.activeElement,
        visible: element.matches(':focus-visible'),
        width: style.outlineWidth,
        style: style.outlineStyle,
        colour: style.outlineColor,
        offset: style.outlineOffset,
    };
});

// Keyboard focus, as skin.spec.mjs gives it: one Tab makes the keyboard the last input, then
// focus moves to the element, which then matches :focus-visible as it would by tabbing.
async function keyboardFocus(page, locator) {
    await page.keyboard.press('Tab');
    await locator.evaluate(element => element.focus());
}

// The worst contrast of the element's focus ring against the pixels round it, out to
// RING_REACH past its edge: the ring is hidden, the band is shot, and each pixel outside the
// element's box is read back through a canvas, as the text ratios are read.
async function worstContrastRoundRing(page, locator, ring) {
    const rect = await box(locator);
    const viewport = page.viewportSize();
    const clip = {
        x: Math.max(0, Math.floor(rect.left - RING_REACH)),
        y: Math.max(0, Math.floor(rect.top - RING_REACH)),
    };
    clip.width = Math.min(viewport.width, Math.ceil(rect.right + RING_REACH)) - clip.x;
    clip.height = Math.min(viewport.height, Math.ceil(rect.bottom + RING_REACH)) - clip.y;
    const inner = {
        left: Math.floor(rect.left) - clip.x, top: Math.floor(rect.top) - clip.y, right: Math.ceil(rect.right) - clip.x, bottom: Math.ceil(rect.bottom) - clip.y,
    };
    const style = await page.addStyleTag({ content: '.rf-hero__button, .rf-hero__button:focus-visible { outline: none !important; }' });
    const shot = (await page.screenshot({ clip, animations: 'disabled' })).toString('base64');
    await style.evaluate(element => element.remove());
    const colours = await page.evaluate(async ({ data, button, cssWidth }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
        const scale = canvas.width / cssWidth; // device pixels per CSS pixel
        const seen = new Set();
        for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
                const [cx, cy] = [x / scale, y / scale];
                if (cx < button.left || cx >= button.right || cy < button.top || cy >= button.bottom) {
                    const i = ((y * canvas.width) + x) * 4;
                    seen.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
                }
            }
        }
        return [...seen].map(value => value.split(',').map(Number));
    }, { data: shot, button: inner, cssWidth: clip.width });
    expect(colours.length, 'pixels round the button').toBeGreaterThan(0);
    const ringRgb = rgbOf(ring);
    const [worst] = colours.map(rgb => ({ rgb, ratio: contrast(luminance(ringRgb), luminance(rgb)) })).sort((a, b) => a.ratio - b.ratio);
    return worst;
}

test.describe('the home lead (widgets/home-lead)', () => {
    test('is 300px tall or less on desktop, from 801px to 1280px', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'the cap is a desktop rule (CD-1)');
        for (const width of [801, 1024, 1280]) {
            await page.setViewportSize({ width, height: 800 }); // eslint-disable-line no-await-in-loop
            const widget = await open(page); // eslint-disable-line no-await-in-loop
            const hero = await box(widget.locator('.rf-hero')); // eslint-disable-line no-await-in-loop
            const copy = await box(widget.locator('.rf-hero__copy')); // eslint-disable-line no-await-in-loop
            expect(hero.height, `the hero's height at ${width}px`).toBeLessThanOrEqual(MAX_HEIGHT);
            expect(copy.height, `the text fits inside the hero at ${width}px`).toBeLessThanOrEqual(hero.height + 0.5);
            const photo = await box(widget.locator('.rf-hero__img')); // eslint-disable-line no-await-in-loop
            expect(photo.height, `the photo fills the hero at ${width}px`).toBeCloseTo(hero.height, 0);
        }
    });

    test('puts the text below the photo on phones, with the photo cropped to 16:10', async ({ page }, testInfo) => {
        test.skip(desktop(testInfo), 'a phone layout');
        const widget = await open(page);
        const photo = await box(widget.locator('.rf-hero__img'));
        const copy = await box(widget.locator('.rf-hero__copy'));
        expect(copy.top).toBeGreaterThanOrEqual(photo.bottom);
        expect(photo.width / photo.height).toBeCloseTo(1.6, 1);
        const heading = await box(widget.locator('h1'));
        expect(heading.top).toBeGreaterThan(photo.bottom);
    });

    test('loads its photo eagerly, as the page\'s one fetchpriority="high" image, mirrored', async ({ page }) => {
        const widget = await open(page);
        await expect(page.locator('[fetchpriority="high"]')).toHaveCount(1);
        const image = widget.locator('img.rf-hero__img');
        await expect(image).toHaveAttribute('fetchpriority', 'high');
        // Loaded, from one of its srcset's candidates (naturalWidth is the file's width divided
        // by the candidate's density, so it isn't checked).
        const loaded = await image.evaluate(element => ({ complete: element.complete, width: element.naturalWidth, src: element.currentSrc }));
        expect(loaded.complete && loaded.width > 0).toBe(true);
        expect(loaded.src).toMatch(/\/images\/stencil\/(320|480|640|960|1280|1600)w\/s\/bass-panfish__24775\.original\.jpg$/);
        expect(await image.evaluate(element => getComputedStyle(element).transform)).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    });

    test('keeps its text 4.5:1 or better over the scrim and the photo on desktop', async ({ page }, testInfo) => {
        test.skip(!desktop(testInfo), 'on phones the text sits on the page below the photo, and axe checks its colours');
        for (const width of [801, 1280]) {
            await page.setViewportSize({ width, height: 800 }); // eslint-disable-line no-await-in-loop
            await open(page); // eslint-disable-line no-await-in-loop
            for (const selector of ['.rf-hero__heading', '.rf-hero__text', '.rf-hero__button--secondary']) {
                const { ratio, text, lightest } = await worstContrastOverPhoto(page, selector); // eslint-disable-line no-await-in-loop
                testInfo.annotations.push({ type: 'contrast', description: `${selector} at ${width}px: ${ratio.toFixed(2)}:1 (rgb ${text} on the lightest pixel behind it, rgb ${lightest})` });
                expect(ratio, `${selector} at ${width}px: rgb ${text} on rgb ${lightest}`).toBeGreaterThanOrEqual(MIN_CONTRAST);
            }
        }
    });

    // Story 67 (a visible focus ring everywhere); WCAG 2.4.7 and 1.4.11. On phones the buttons
    // sit on the white page and take ticket 25's ring; from 801px they sit on the scrim, where
    // the ring is 25's dark-ground one, the gold bead.
    test('shows ticket 25\'s focus ring on both buttons from the keyboard, 3:1 or better against what is round it', async ({ page }, testInfo) => {
        const widths = desktop(testInfo) ? [801, 1280] : [page.viewportSize().width];
        for (const width of widths) {
            if (desktop(testInfo)) await page.setViewportSize({ width, height: 800 }); // eslint-disable-line no-await-in-loop
            const widget = await open(page); // eslint-disable-line no-await-in-loop
            const ring = width >= 801 ? RING_ON_DARK : RING_ON_LIGHT;
            for (const selector of ['.rf-hero__button--primary', '.rf-hero__button--secondary']) {
                const button = widget.locator(selector);
                await keyboardFocus(page, button); // eslint-disable-line no-await-in-loop
                await expect.poll(() => outlineOf(button), { message: `${selector} at ${width}px, focused by keyboard`, timeout: 3000 }).toEqual({ // eslint-disable-line no-await-in-loop
                    focused: true, visible: true, width: RING.width, style: RING.style, colour: ring, offset: RING.offset,
                });
                const { ratio, rgb } = await worstContrastRoundRing(page, button, ring); // eslint-disable-line no-await-in-loop
                testInfo.annotations.push({ type: 'focus ring', description: `${selector} at ${width}px: ${ring} ring, ${ratio.toFixed(2)}:1 against the worst pixel round it, rgb ${rgb}` });
                expect(ratio, `${selector}'s ring at ${width}px: ${ring} against rgb ${rgb}`).toBeGreaterThanOrEqual(MIN_RING_CONTRAST);
                await button.evaluate(element => element.blur()); // eslint-disable-line no-await-in-loop
            }
        }
    });

    test('has no serious or critical axe issues', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('[data-widget-id]').withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
