// Which product photos are on a white ground (ticket 18, the white-ground thumbnails job; IMG-1).
//
//   import { classifyImages } from './images.mjs';
//   const grounds = await classifyImages(images, { cacheDir });   // Map(image id -> { ground, url, reason? })
//
// Each photo's smallest rendition (url_tiny, 44 x 58) is fetched from the public CDN with a plain
// GET, decoded, and judged by its border: "white" or "black" when at least 80% of the border
// pixels are near white or near black, otherwise "other". A photo that can't be fetched or read
// is "unknown", and the job lists it for a person. The answers are cached by URL, so a rerun
// fetches only new photos.
//
// JPEGs are decoded with jpeg-js, which the repo already installs through lighthouse (an
// upstream devDependency). Revisitable: if it ever goes, every photo reads "unknown" and the job
// says so; it never guesses.

import fs from 'fs';
import path from 'path';

const BORDER_SHARE = 0.06;
const GROUND_SHARE = 0.8;
const NEAR_WHITE = 225;
const NEAR_BLACK = 50;
const CONCURRENCY = 6;
const CACHE_FILE = 'grounds.json';

// "white", "black" or "other", from an RGBA image's border ring.
export function classifyGround({ width, height, data }) {
    const ring = Math.max(1, Math.round(Math.min(width, height) * BORDER_SHARE));
    let white = 0;
    let black = 0;
    let total = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const inside = x >= ring && y >= ring && x < width - ring && y < height - ring;
            if (!inside) {
                const at = (y * width + x) * 4;
                const [r, g, b] = [data[at], data[at + 1], data[at + 2]];
                if (Math.min(r, g, b) >= NEAR_WHITE) white++;
                else if (Math.max(r, g, b) <= NEAR_BLACK) black++;
                total++;
            }
        }
    }
    if (white / total >= GROUND_SHARE) return 'white';
    if (black / total >= GROUND_SHARE) return 'black';
    return 'other';
}

// The 44 x 58 rendition: the API's url_tiny, or the export's URL with its size swapped.
export function tinyUrl({ urlTiny, url }) {
    if (urlTiny) return urlTiny;
    const swapped = String(url || '').replace(/\.\d+\.\d+\.(jpe?g|png|gif)(\?|$)/i, '.44.58.$1$2');
    return swapped && swapped !== url ? swapped : null;
}

let decoder;
async function decodeJpeg(buffer) {
    if (decoder === undefined) {
        try {
            decoder = (await import('jpeg-js')).default; // eslint-disable-line import/no-extraneous-dependencies
        } catch {
            decoder = null;
        }
    }
    if (!decoder) throw new Error('jpeg-js isn\'t installed, so photos can\'t be read');
    return decoder.decode(buffer, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 64 });
}

async function judge(url, fetchImpl) {
    let response;
    try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    } catch (error) {
        return { ground: 'unknown', url, reason: `no answer (${error.message})` };
    }
    if (!response.ok) return { ground: 'unknown', url, reason: `HTTP ${response.status}` };
    const type = response.headers.get('content-type') || '';
    if (type && !/jpe?g/i.test(type)) return { ground: 'unknown', url, reason: `not a JPEG (${type})` };
    try {
        return { ground: classifyGround(await decodeJpeg(Buffer.from(await response.arrayBuffer()))), url };
    } catch (error) {
        return { ground: 'unknown', url, reason: error.message };
    }
}

function readCache(cacheDir) {
    if (!cacheDir) return {};
    try {
        return JSON.parse(fs.readFileSync(path.join(cacheDir, CACHE_FILE), 'utf8'));
    } catch {
        return {};
    }
}

// Map(image id -> { ground, url, reason? }). Only a definite ground is cached.
export async function classifyImages(images, { fetch: fetchImpl = fetch, cacheDir = null, onProgress = () => {} } = {}) {
    const cache = readCache(cacheDir);
    const grounds = new Map();
    const queue = [];
    for (const image of images) {
        const url = tinyUrl(image);
        if (!url) grounds.set(image.id, { ground: 'unknown', url: null, reason: 'no small rendition to read' });
        else if (cache[url]) grounds.set(image.id, { ground: cache[url], url });
        else queue.push({ image, url });
    }
    let done = 0;
    const worker = async () => {
        while (queue.length) {
            const { image, url } = queue.shift();
            const verdict = await judge(url, fetchImpl); // eslint-disable-line no-await-in-loop
            grounds.set(image.id, verdict);
            if (verdict.ground !== 'unknown') cache[url] = verdict.ground;
            done++;
            if (done % 100 === 0) onProgress(done);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (cacheDir) {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(path.join(cacheDir, CACHE_FILE), `${JSON.stringify(cache)}\n`);
    }
    return new Map(images.map(image => [image.id, grounds.get(image.id)]));
}
