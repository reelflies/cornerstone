// The home lead's layout, contrast and accessibility (ticket 46; spec module 6; stories 11, 67,
// 68, 70), checked on the widget's fixture page (W0-9), which renders widgets/home-lead from
// the fixture ReelFlies_CA gets, inside the theme's own body, with this checkout's theme CSS.
// The store's copy of the hero is hidden in page baselines (W0-6's HIDDEN), so its layout is
// checked here, from its source, and its look by widget-screens.spec.mjs's element shots.
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

test.skip(Boolean(QA_OVERLAY), `the hero renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const HERO = widgetCases([WIDGETS_DIR]).find(({ widget, name }) => widget === 'home-lead' && name === 'default');
const MAX_HEIGHT = 300; // CD-1
const MIN_CONTRAST = 4.5; // WCAG 1.4.3, for the hero's text over the scrim and the photo
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

// The relative luminance (WCAG) of an sRGB colour given as 0-255 channels.
const luminance = ([r, g, b]) => {
    const channel = value => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return (0.2126 * channel(r)) + (0.7152 * channel(g)) + (0.0722 * channel(b));
};
const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// The lightest background pixel behind each line of the element's text: the text is made
// transparent, the line boxes are shot, and each shot is read back in the page through a
// canvas. Returns the worst contrast of the element's own text colour against them.
async function worstContrastOverPhoto(page, selector) {
    const { color, lines } = await page.locator(selector).evaluate(element => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return {
            color: getComputedStyle(element).color,
            lines: [...range.getClientRects()].filter(rect => rect.width > 2 && rect.height > 2).map(rect => ({
                x: Math.floor(rect.left), y: Math.floor(rect.top), width: Math.ceil(rect.width), height: Math.ceil(rect.height),
            })),
        };
    });
    expect(lines.length, `${selector} has text`).toBeGreaterThan(0);
    const style = await page.addStyleTag({ content: `${selector}, ${selector} * { color: transparent !important; text-shadow: none !important; border-color: transparent !important; }` });
    const shots = [];
    for (const clip of lines) {
        shots.push((await page.screenshot({ clip, animations: 'disabled' })).toString('base64')); // eslint-disable-line no-await-in-loop
    }
    await style.evaluate(element => element.remove());
    const lightest = await page.evaluate(async images => {
        let max = [0, 0, 0];
        let maxSum = -1;
        for (const data of images) {
            const image = new Image();
            image.src = `data:image/png;base64,${data}`;
            await image.decode(); // eslint-disable-line no-await-in-loop
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < pixels.length; i += 4) {
                const sum = (0.2126 * pixels[i]) + (0.7152 * pixels[i + 1]) + (0.0722 * pixels[i + 2]);
                if (sum > maxSum) {
                    maxSum = sum;
                    max = [pixels[i], pixels[i + 1], pixels[i + 2]];
                }
            }
        }
        return max;
    }, shots);
    const text = color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    return { ratio: contrast(luminance(text), luminance(lightest)), text, lightest };
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

    test('has no serious or critical axe issues', async ({ page }) => {
        await open(page);
        const { violations } = await new AxeBuilder({ page }).include('[data-widget-id]').withTags(TAGS).analyze();
        const blocking = violations.filter(violation => ['serious', 'critical'].includes(violation.impact))
            .map(violation => `${violation.id} (${violation.impact}): ${violation.help}, on ${violation.nodes.map(node => node.target.join(' ')).join(' | ')}`);
        expect(blocking).toEqual([]);
    });
});
