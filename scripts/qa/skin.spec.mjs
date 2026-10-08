// Ticket 25's skin, in a browser (spec Testing Decisions, seam 1; stories 67, 69, 70 and 71;
// spec module 1). On every page pinned for QA_CHANNEL, at 375 and 1280:
// - keyboard focus shows the ReelFlies ring on a link and a button (the gold bead when it sits on a
//   forest ground, .rf-on-dark, as the footer's do), and a pointer shows none
// - the first Tab lands on the skip link
// - axe finds no landmark-one-main or landmark-no-duplicate-main issue: they are moderate, so the
//   axe gate (serious and critical only) doesn't fail on them
// - Onest is fetched once, from theme assets, nothing comes from Google Fonts, and the root
//   font size is 16px
// - with reduced motion, every transition and animation on the page is over at once. jQuery's
//   animations jump too, which Jest checks (reduced-motion.spec.js, global.spec.js): the theme's
//   jQuery isn't on window for a test to reach.
// Then, at 320px wide and at 200% zoom, home and category pages don't scroll sideways, and on
// channel 1 a product with no photo shows the ReelFlies default image.
//
//   QA_PORT=<yours> npx playwright test --config scripts/qa/playwright.config.mjs skin.spec
//   QA_PORT=<yours> QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs skin.spec
//
// It runs no gate of its own: `npm run qa:prepush` doesn't run it (ticket 54 folds these checks
// into its runner). Run it in every ticket that changes the skin.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import AxeBuilder from '@axe-core/playwright';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { pageKind } from './pages.mjs';
import { QA_CHANNEL } from './storefront.mjs';

const RING = {
    width: '2px', style: 'solid', colour: 'rgb(35, 39, 43)', offset: '2px',
}; // #23272B, _settings.scss
// The gold bead #F2C14E on forest grounds (.rf-on-dark): the footer (ticket 50) and the forest bands.
const RING_ON_DARK = 'rgb(242, 193, 78)';
const FONT_FILE = /\/fonts\/onest-latin-var\.woff2(\?|$)/;
const GOOGLE_FONTS = /fonts\.(googleapis|gstatic)\.com/;
// A channel-1 product with no image of its own (ticket 14's inventory: 4094, a Mustad hook pack).
const NO_PHOTO_PRODUCT = { 1: '/mustad-9479-salmon-egg-fly-hook-100-pack/' };
const DEFAULT_PRODUCT_IMAGE = /\/img\/reelflies\/default-product\.png(\?|$)/;

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

// The first link and the first button a visitor can reach, in page order. A button is a
// <button> or a submit input, as Cornerstone's forms use both.
async function firstVisible(page, selector) {
    const candidates = page.locator(selector);
    const count = await candidates.count();
    for (let i = 0; i < count; i += 1) {
        const candidate = candidates.nth(i);
        if (await candidate.isVisible()) return candidate; // eslint-disable-line no-await-in-loop
    }
    return null;
}

// Keyboard focus: one Tab makes the keyboard the last input, as for a visitor tabbing through,
// then focus moves to the element, which then matches :focus-visible as it would by tabbing.
async function keyboardFocus(page, locator) {
    await page.keyboard.press('Tab');
    await locator.evaluate(element => element.focus());
}

// Pointer focus: a mouse press on the element focuses it, as a click does, but the release lands
// off it, so nothing is followed or submitted.
async function pointerFocus(page, locator) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(1, 1);
    await page.mouse.up();
}

for (const [key, pagePath] of Object.entries(PAGES)) {
    test.describe(`${key} (${pagePath})`, () => {
        test('keyboard focus shows the ReelFlies ring on a link and a button; a pointer shows none', async ({ page }) => {
            await storefrontPage(page, key);
            await dismissCookieBanner(page);
            const targets = {
                link: await firstVisible(page, '#main-content a[href], footer a[href], header a[href]:not(.skip-to-main-link)'),
                button: await firstVisible(page, 'button, input[type="submit"], input[type="button"]'),
            };
            expect(targets.link, 'a link to focus').not.toBeNull();
            expect(targets.button, 'a button to focus').not.toBeNull();
            for (const [what, target] of Object.entries(targets)) {
                // Stock .button eases `all` over 0.15s, the ring included, so wait for it to settle.
                await keyboardFocus(page, target); // eslint-disable-line no-await-in-loop
                const onDark = await target.evaluate(element => Boolean(element.closest('.rf-on-dark'))); // eslint-disable-line no-await-in-loop
                await expect.poll(() => outlineOf(target), { message: `the ${what} by keyboard`, timeout: 3000 }).toEqual({ // eslint-disable-line no-await-in-loop
                    focused: true, visible: true, width: RING.width, style: RING.style, colour: onDark ? RING_ON_DARK : RING.colour, offset: RING.offset,
                });

                await target.evaluate(element => element.blur()); // eslint-disable-line no-await-in-loop
                await pointerFocus(page, target); // eslint-disable-line no-await-in-loop
                await expect.poll(async () => { // eslint-disable-line no-await-in-loop
                    const { focused, visible, style } = await outlineOf(target);
                    return { focused, visible, style };
                }, { message: `the ${what} after a press: focused, not :focus-visible, no ring`, timeout: 3000 }).toEqual({ focused: true, visible: false, style: 'none' });
            }
        });

        test('the first Tab lands on the skip link', async ({ page }) => {
            await storefrontPage(page, key);
            await dismissCookieBanner(page);
            await page.evaluate(() => {
                document.activeElement?.blur();
                window.scrollTo(0, 0);
            });
            await page.locator('body').evaluate(body => body.focus());
            await page.keyboard.press('Tab');
            const active = await page.evaluate(() => ({ className: document.activeElement.className, href: document.activeElement.getAttribute('href') }));
            expect(active).toEqual({ className: 'skip-to-main-link', href: '#main-content' });
        });

        test('has exactly one main landmark, by axe', async ({ page }) => {
            await storefrontPage(page, key);
            const { violations } = await new AxeBuilder({ page }).withRules(['landmark-one-main', 'landmark-no-duplicate-main']).analyze();
            expect(violations.map(violation => `${violation.id}: ${violation.help}`)).toEqual([]);
        });

        test('Onest comes once, from theme assets, nothing from Google Fonts, and the root font size is 16px', async ({ page }) => {
            const fonts = [];
            page.on('request', request => {
                if (FONT_FILE.test(request.url()) || GOOGLE_FONTS.test(request.url())) fonts.push(request.url());
            });
            await storefrontPage(page, key);
            const own = fonts.filter(url => FONT_FILE.test(url));
            const google = fonts.filter(url => GOOGLE_FONTS.test(url) && /Karla|Montserrat|Onest|fonts\.googleapis\.com\/css/.test(url));
            expect(own, 'requests for onest-latin-var.woff2').toHaveLength(1);
            expect(google, 'Google Fonts requests for the theme\'s own fonts').toEqual([]);
            const facts = await page.evaluate(() => ({
                root: getComputedStyle(document.documentElement).fontSize,
                body: getComputedStyle(document.body).fontFamily,
                loaded: [...document.fonts].filter(face => face.family.replace(/"/g, '') === 'Onest' && face.status === 'loaded').length,
            }));
            expect(facts.root).toBe('16px');
            expect(facts.body).toMatch(/^"?Onest"?, "Onest Fallback"/);
            expect(facts.loaded).toBe(1);
        });

        test('with reduced motion, transitions and animations are over at once', async ({ page }) => {
            const longest = () => page.evaluate(() => {
                const seconds = value => Math.max(...value.split(',').map(part => parseFloat(part) * (part.trim().endsWith('ms') ? 0.001 : 1)));
                let transition = 0;
                let animation = 0;
                for (const element of document.querySelectorAll('*')) {
                    for (const pseudo of [null, '::before', '::after']) {
                        const style = getComputedStyle(element, pseudo);
                        transition = Math.max(transition, seconds(style.transitionDuration) + seconds(style.transitionDelay));
                        animation = Math.max(animation, seconds(style.animationDuration) + seconds(style.animationDelay));
                    }
                }
                return { transition, animation };
            });

            await storefrontPage(page, key);
            const normal = await longest();
            expect(normal.transition, 'the page has transitions to stop (stock .button eases over 0.15s)').toBeGreaterThan(0.1);

            await page.emulateMedia({ reducedMotion: 'reduce' });
            await storefrontPage(page, key);
            const reduced = await longest();
            expect(reduced.transition).toBeLessThanOrEqual(0.00001);
            expect(reduced.animation).toBeLessThanOrEqual(0.00001);
        });
    });
}

test.describe('reflow', () => {
    for (const [key, pagePath] of Object.entries(PAGES).filter(([pageKey]) => ['home', 'category'].includes(pageKind(pageKey)))) {
        for (const [what, viewport] of [['at 320px wide', { width: 320, height: 640 }], ['at 200% zoom (640 CSS px of a 1280 window)', { width: 640, height: 400 }]]) {
            test(`${key} (${pagePath}) doesn't scroll sideways ${what}`, async ({ page }, testInfo) => {
                test.skip(testInfo.project.name !== 'desktop-1280', 'the viewport is set here, once');
                await page.setViewportSize(viewport);
                await storefrontPage(page, key);
                await dismissCookieBanner(page);
                const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
                expect(widths.scroll, `the page is ${widths.scroll}px wide in a ${widths.client}px viewport`).toBeLessThanOrEqual(widths.client);
            });
        }
    }
});

test.describe('the default product image', () => {
    test('a product with no photo shows the ReelFlies default', async ({ page }, testInfo) => {
        test.skip(!NO_PHOTO_PRODUCT[QA_CHANNEL], `channel ${QA_CHANNEL} has no product without a photo to show (ReelFlies_CA has no products until refactor 14)`);
        test.skip(testInfo.project.name !== 'desktop-1280', 'once is enough');
        const response = await page.goto(NO_PHOTO_PRODUCT[QA_CHANNEL], { waitUntil: 'load' });
        expect(response.status()).toBe(200);
        const sources = await page.locator('.productView-images img').evaluateAll(images => images.map(image => image.currentSrc || image.src || image.dataset.src || ''));
        expect(sources.some(source => DEFAULT_PRODUCT_IMAGE.test(source)), `the product images: ${sources.join(', ')}`).toBe(true);
    });
});
