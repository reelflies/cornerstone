// The review page's images (scripts/qa/review/images.mjs; W0-10): each screenshot is
// re-encoded as WebP (JPEG past WebP's size limit) at about 200 KB, and the whole page must
// stay under the artifact limit of 16 MB.
//
//   node --test scripts/qa/review/images.test.mjs

import fs from 'fs';
import path from 'path';
import { chromium } from '@playwright/test';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    IMAGE_TARGET_BYTES, PAGE_LIMIT_BYTES, checkBudget, createChromiumEncoder, fitImage, imageFileName, pngSize,
} from './images.mjs';

const SELFTEST_PNG = path.resolve('scripts/qa/baselines/selftest/blocks-phone-375-darwin.png');

// An encoder whose output shrinks with quality and scale, like a real one.
const fakeEncoder = ({ base = 1000000, webpLimit = Infinity } = {}) => {
    const calls = [];
    return {
        calls,
        async encode(png, { type, quality, scale }) {
            calls.push({ type, quality, scale });
            const { height } = pngSize(png);
            const actualType = type === 'image/webp' && height * scale > webpLimit ? 'image/png' : type;
            return { type: actualType, bytes: Buffer.alloc(Math.round(base * quality * scale * scale)) };
        },
    };
};

describe('fitting a screenshot to the size target', () => {
    const png = fs.readFileSync(SELFTEST_PNG);

    it('keeps the best quality that fits, at full size', async () => {
        const encoder = fakeEncoder({ base: 250000 });
        const image = await fitImage(png, { encoder });
        assert.equal(image.type, 'image/webp');
        assert.ok(image.bytes.length <= IMAGE_TARGET_BYTES);
        assert.equal(image.scale, 1);
        assert.equal(encoder.calls[0].quality, 0.8);
    });

    it('scales a large page down only when no quality fits', async () => {
        const image = await fitImage(png, { encoder: fakeEncoder({ base: 1200000 }) });
        assert.ok(image.scale < 1);
        assert.ok(image.bytes.length <= IMAGE_TARGET_BYTES);
    });

    it('keeps the smallest try, and says so, when nothing fits', async () => {
        const image = await fitImage(png, { encoder: fakeEncoder({ base: 100000000 }) });
        assert.equal(image.overTarget, true);
        assert.equal(image.scale, 0.5);
    });

    it('falls back to JPEG when the browser can\'t make a WebP that tall', async () => {
        const image = await fitImage(png, { encoder: fakeEncoder({ base: 100000, webpLimit: 10 }) });
        assert.equal(image.type, 'image/jpeg');
    });

    it('reads a PNG\'s size from its header', () => {
        assert.deepEqual(pngSize(png), { width: 375, height: 812 });
        assert.throws(() => pngSize(Buffer.from('not a png')), /isn't a PNG/);
    });
});

describe('the page budget', () => {
    it('passes a page under 16 MB and fails one over it', () => {
        assert.equal(PAGE_LIMIT_BYTES, 16000000);
        assert.deepEqual(checkBudget([{ name: 'index.html', bytes: 50000 }, { name: 'a.webp', bytes: 200000 }]), { ok: true, total: 250000, problems: [] });
        const over = checkBudget([{ name: 'index.html', bytes: 1000 }, { name: 'a.webp', bytes: 16000000 }]);
        assert.equal(over.ok, false);
        assert.match(over.problems[0], /16,001,000 B.*16,000,000 B/);
    });

    it('names an image that missed its own target', () => {
        const { problems, ok } = checkBudget([{ name: 'big.webp', bytes: 900000, overTarget: true }]);
        assert.equal(ok, true);
        assert.match(problems[0], /big\.webp/);
    });
});

describe('image file names', () => {
    it('are readable and change when the image does', () => {
        const name = imageFileName({ kind: 'git', ref: 'review-00', path: 'scripts/qa/baselines/1-reelflies-ca/product-phone-375-darwin.png' }, Buffer.from('a'), 'image/webp');
        assert.match(name, /^1-reelflies-ca-product-phone-375-darwin-review-00-[0-9a-f]{8}\.webp$/);
        assert.notEqual(name, imageFileName({ kind: 'git', ref: 'review-00', path: 'scripts/qa/baselines/1-reelflies-ca/product-phone-375-darwin.png' }, Buffer.from('b'), 'image/webp'));
        assert.match(imageFileName({ kind: 'file', path: 'scripts/qa/results/reference/home-phone-375.png' }, Buffer.from('a'), 'image/jpeg'), /^reference-home-phone-375-[0-9a-f]{8}\.jpg$/);
    });
});

const hasChromium = (() => {
    try {
        return fs.existsSync(chromium.executablePath());
    } catch {
        return false;
    }
})();

describe('the browser encoder', { skip: !hasChromium && 'Playwright\'s Chromium isn\'t installed here (CI)' }, () => {
    it('makes a WebP of a screenshot', async () => {
        const encoder = await createChromiumEncoder();
        try {
            const image = await fitImage(fs.readFileSync(SELFTEST_PNG), { encoder });
            assert.equal(image.type, 'image/webp');
            assert.equal(image.bytes.subarray(0, 4).toString(), 'RIFF');
            assert.equal(image.bytes.subarray(8, 12).toString(), 'WEBP');
        } finally {
            await encoder.close();
        }
    });
});
