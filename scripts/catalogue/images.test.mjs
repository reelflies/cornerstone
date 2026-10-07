// Tests scripts/catalogue/images.mjs (ticket 18): which product photos are on a white ground.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import jpeg from 'jpeg-js'; // eslint-disable-line import/no-extraneous-dependencies -- installed through lighthouse
import {
    classifyGround, classifyImages, decoderProblem, tinyUrl,
} from './images.mjs';

// A width x height RGBA image: `ground` everywhere, and `subject` inside a margin of `margin` pixels.
function image(width, height, ground, subject = ground, margin = 4) {
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inside = x >= margin && y >= margin && x < width - margin && y < height - margin;
            const [r, g, b] = inside ? subject : ground;
            data.set([r, g, b, 255], (y * width + x) * 4);
        }
    }
    return { width, height, data };
}

const WHITE = [252, 252, 250];
const BLACK = [8, 8, 10];
const OLIVE = [90, 110, 60];

test('the ground is read from the photo\'s border: white, black or other', () => {
    assert.equal(classifyGround(image(44, 58, WHITE, OLIVE)), 'white');
    assert.equal(classifyGround(image(44, 58, BLACK, OLIVE)), 'black');
    assert.equal(classifyGround(image(44, 58, OLIVE, WHITE)), 'other');
});

test('a corner logo on the border doesn\'t stop a white ground reading as white', () => {
    const photo = image(44, 58, WHITE, OLIVE);
    for (let y = 50; y < 58; y++) for (let x = 0; x < 11; x++) photo.data.set([30, 30, 30, 255], (y * 44 + x) * 4);
    assert.equal(classifyGround(photo), 'white');
});

test('the tiny rendition is asked for, never the full-size photo', () => {
    assert.equal(tinyUrl({ urlTiny: 'https://cdn.example/a.44.58.jpg', url: 'x' }), 'https://cdn.example/a.44.58.jpg');
    assert.equal(tinyUrl({ urlTiny: null, url: 'https://cdn.example/p/1/images/2/a__1.1541778709.386.513.jpg?c=2' }), 'https://cdn.example/p/1/images/2/a__1.1541778709.44.58.jpg?c=2');
    assert.equal(tinyUrl({ urlTiny: null, url: 'https://cdn.example/a.jpg' }), null);
});

test('images are fetched once, decoded and classified, and the answers are cached by URL', async () => {
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-grounds-'));
    const white = Buffer.from(jpeg.encode(image(44, 58, WHITE, OLIVE), 90).data);
    const black = Buffer.from(jpeg.encode(image(44, 58, BLACK, OLIVE), 90).data);
    const fetched = [];
    const fetch = async url => {
        fetched.push(url);
        if (url.endsWith('missing.44.58.jpg')) return new Response('', { status: 404 });
        return new Response(url.includes('white') ? white : black, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    };
    const images = [
        { id: 1, urlTiny: 'https://cdn.example/white.44.58.jpg' },
        { id: 2, urlTiny: 'https://cdn.example/black.44.58.jpg' },
        { id: 3, urlTiny: 'https://cdn.example/missing.44.58.jpg' },
        { id: 4, urlTiny: null, url: 'https://cdn.example/no-size.jpg' },
    ];
    const grounds = await classifyImages(images, { fetch, cacheDir });
    assert.deepEqual(Object.fromEntries(grounds), {
        1: { ground: 'white', url: 'https://cdn.example/white.44.58.jpg' },
        2: { ground: 'black', url: 'https://cdn.example/black.44.58.jpg' },
        3: { ground: 'unknown', url: 'https://cdn.example/missing.44.58.jpg', reason: 'HTTP 404' },
        4: { ground: 'unknown', url: null, reason: 'no small rendition to read' },
    });
    assert.equal(fetched.length, 3);
    const again = await classifyImages(images.slice(0, 2), { fetch, cacheDir });
    assert.equal(again.get(1).ground, 'white');
    assert.equal(fetched.length, 3, 'the second run answers from the cache');
});

test('the photo read stops with a clear reason when jpeg-js is missing, and passes when it is there', async () => {
    assert.equal(await decoderProblem(), null);
    const missing = await decoderProblem({ load: async () => { throw new Error('Cannot find package \'jpeg-js\''); } });
    assert.match(missing, /^the photo read needs jpeg-js, which this repo has only through lighthouse \(an upstream devDependency\): run npm ci, or pass --images skip/);
});
