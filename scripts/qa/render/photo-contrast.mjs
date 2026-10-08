// The contrast of text set over a photo (tickets 46 and 47; WCAG 1.4.3), read from the pixels
// in a Playwright page, because axe can't see through a scrim to the photo behind it. The hero's
// text (home-lead-screens.spec.mjs) and the Fly Type cards' (home-widgets-screens.spec.mjs) are
// checked this way.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import { expect } from '@playwright/test';

// The relative luminance (WCAG) of an sRGB colour given as 0-255 channels.
export const luminance = ([r, g, b]) => {
    const channel = value => {
        const c = value / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return (0.2126 * channel(r)) + (0.7152 * channel(g)) + (0.0722 * channel(b));
};
export const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

// The lightest background pixel behind each line of the element's text: the text is made
// transparent, the line boxes are shot, and each shot is read back in the page through a
// canvas. Returns the worst contrast of the element's own text colour against them.
export async function worstContrastOverPhoto(page, selector) {
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
