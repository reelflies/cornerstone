// The review page's images (W0-10). Screenshots are PNGs of up to several MB, so each is
// re-encoded as WebP at about 200 KB, in Playwright's Chromium (a canvas), which needs no
// new dependency. Chromium can't make a WebP taller than 16,383 px, so such a page falls
// back to JPEG. The whole page, HTML and images, must stay under the artifact limit.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import crypto from 'crypto';
import { chromium } from '@playwright/test';
import { formatBytes } from '../../lib/format.mjs';

export const IMAGE_TARGET_BYTES = 200000;
export const PAGE_LIMIT_BYTES = 16000000;
const QUALITIES = [0.8, 0.7, 0.6, 0.5];
const SCALES = [1, 0.75, 0.5];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function pngSize(buffer) {
    if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('the image isn\'t a PNG');
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

// The best quality that fits the target, at full size if any does; otherwise smaller.
// When nothing fits, the smallest try, marked overTarget.
export async function fitImage(png, { encoder, target = IMAGE_TARGET_BYTES }) {
    if (encoder.fit) return encoder.fit(png);
    let type = 'image/webp';
    let smallest = null;
    for (const scale of SCALES) {
        for (const quality of QUALITIES) {
            let result = await encoder.encode(png, { type, quality, scale }); // eslint-disable-line no-await-in-loop
            if (result.type !== type && type === 'image/webp') {
                type = 'image/jpeg';
                result = await encoder.encode(png, { type, quality, scale }); // eslint-disable-line no-await-in-loop
            }
            const image = {
                ...result, scale, quality, overTarget: false,
            };
            if (image.bytes.length <= target) return image;
            if (!smallest || image.bytes.length < smallest.bytes.length) smallest = image;
        }
    }
    return { ...smallest, overTarget: true };
}

// Encodes in a blank Chromium page. The PNG is loaded once and encoded at each try.
export async function createChromiumEncoder() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    let loaded = null;
    return {
        async encode(png, { type, quality, scale }) {
            const hash = crypto.createHash('sha256').update(png).digest('hex');
            if (hash !== loaded) {
                await page.evaluate(async src => {
                    const image = new Image();
                    image.src = src;
                    await image.decode();
                    window.rfImage = image;
                }, `data:image/png;base64,${png.toString('base64')}`);
                loaded = hash;
            }
            const { url, width, height } = await page.evaluate(({ type: wanted, quality: q, scale: s }) => {
                const image = window.rfImage;
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(image.naturalWidth * s));
                canvas.height = Math.max(1, Math.round(image.naturalHeight * s));
                const context = canvas.getContext('2d');
                context.imageSmoothingQuality = 'high';
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                return { url: canvas.toDataURL(wanted, q), width: canvas.width, height: canvas.height };
            }, { type, quality, scale });
            const [, actualType, data] = /^data:([^;,]+);base64,(.*)$/s.exec(url);
            return {
                type: actualType, bytes: Buffer.from(data, 'base64'), width, height,
            };
        },
        close: () => browser.close(),
    };
}

// Keeps each PNG as it is, for tests and for machines without Playwright's browser.
export const copyEncoder = {
    async fit(png) {
        const { width, height } = pngSize(png);
        return {
            type: 'image/png', bytes: png, width, height, scale: 1, quality: 1, overTarget: png.length > IMAGE_TARGET_BYTES,
        };
    },
    close: () => Promise.resolve(),
};

const EXTENSIONS = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const slug = text => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// A readable name that changes with the image's content.
export function imageFileName(image, bytes, type) {
    const base = image.path.replace(/^scripts\/qa\/(baselines|results)\//, '').replace(/\.png$/, '');
    const ref = image.kind === 'git' ? `-${slug(/^[0-9a-f]{40}$/.test(image.ref) ? image.ref.slice(0, 8) : image.ref)}` : '';
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8);
    return `${slug(base)}${ref}-${hash}.${EXTENSIONS[type] || 'bin'}`;
}

// files: [{ name, bytes, overTarget }]. Fails over the page limit; lists images that missed
// their own target, which don't fail on their own.
export function checkBudget(files, limit = PAGE_LIMIT_BYTES) {
    const total = files.reduce((sum, file) => sum + file.bytes, 0);
    const problems = [];
    const ok = total <= limit;
    if (!ok) problems.push(`the page and its images come to ${formatBytes(total)}, over the artifact limit of ${formatBytes(limit)}. Shoot fewer pages, or lower IMAGE_TARGET_BYTES.`);
    for (const file of files.filter(entry => entry.overTarget)) problems.push(`${file.name} is ${formatBytes(file.bytes)}, over the ${formatBytes(IMAGE_TARGET_BYTES)} target even at half size.`);
    return { ok, total, problems };
}
