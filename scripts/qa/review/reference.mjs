// The reference screens a review page shows beside the theme (W0-10): the storefront
// screens of the "ReelFlies Hook Gauge" reference page (plan/design/reelflies-reference.html,
// built from plan/design/src/reference.src.html), shot at 375 and 1280 by
// screens-reference.spec.mjs in the same run as the theme's screenshots.
//
// - REFERENCE_ANCHORS: one entry per screen shot, by its hash route in the reference page.
//   The category screen draws three of them (a Fly Type page, a Species page and the
//   ReelFlies brand listing), so each gets its own anchor.
// - referenceFor(template): the anchor a theme template is compared with, or null.
// - REFERENCE_SETTINGS: the reference page's Options, set before any shot: "Heading face"
//   Onest and the fly-type links row off (reference.src.html:1995-1996), the sage buy
//   colour, a visitor in Canada (no outside-Canada prompt), and no build notes.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
export const REFERENCE_FILE = path.join('plan', 'design', 'reelflies-reference.html');

export const REFERENCE_ANCHORS = [
    {
        id: 'home', screen: 'home', hash: '#home', label: 'Home',
    },
    {
        id: 'fly-type', screen: 'category', hash: '#cat/dry-flies', label: 'Fly Type page (Dry Flies)',
    },
    {
        id: 'species', screen: 'category', hash: '#cat/trout-flies', label: 'Species page (Trout Flies)',
    },
    {
        id: 'species-hub', screen: 'flies-by-species', hash: '#cat/flies-by-species', label: 'Flies by Species hub',
    },
    {
        id: 'hook-chart', screen: 'hook-size-chart', hash: '#hook-size-chart', label: 'Hook size chart',
    },
    {
        id: 'product', screen: 'product', hash: '#product/4877', label: 'Product page (Adams Parachute)',
    },
    {
        id: 'cart', screen: 'cart', hash: '#cart', label: 'Cart',
    },
    {
        id: 'brand', screen: 'category', hash: '#brand/reelflies', label: 'ReelFlies brand listing',
    },
];

export const anchorById = id => REFERENCE_ANCHORS.find(anchor => anchor.id === id) || null;

// Theme template (a page key in scripts/qa/pages.mjs) -> reference anchor. The stock
// category template becomes the Fly Type page in ticket 32, so it is compared with that.
const TEMPLATE_REFERENCE = {
    home: 'home',
    'fly-type': 'fly-type',
    category: 'fly-type',
    species: 'species',
    'species-hub': 'species-hub',
    product: 'product',
    cart: 'cart',
    'hook-chart': 'hook-chart',
    brand: 'brand',
};

// A kind@name pin (W0-8, for example product@sold-out) is compared by its kind.
export const referenceFor = template => TEMPLATE_REFERENCE[String(template).split('@')[0]] ?? null;

export const REFERENCE_SETTINGS = {
    headFace: 'onest',
    linksToggle: false,
    variation: 'sage',
    visitor: 'ca',
    notes: false,
};

// The stage around the store frame has 16 px gutters, so a desktop shot widens the
// viewport by both to keep the frame itself at the width named. Below 641 px the gutters
// are gone (reference.src.html, ".stage").
export const referenceViewport = width => (width > 640 ? { width: width + 32, height: 900 } : { width, height: 812 });

// The reference page is the content claude.ai publishes, without a document around it.
// This is the document claude.ai wraps it in (and plan/design/shoot.js too).
export const wrapReference = body => '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    + '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
    + 'body{margin:0;font:14px/1.4 system-ui,sans-serif;background:#fafafa}img{max-width:100%}[hidden]{display:none!important}</style>'
    + `</head><body>${body}</body></html>`;

// Where the reference page is: QA_REFERENCE_HTML, or plan/design/reelflies-reference.html in
// the nearest folder above the checkout that has one (~/reelflies/theme for the main clone
// and for every worktree). Null where there is none, as in CI.
export function findReferenceHtml({ env = process.env, root = ROOT } = {}) {
    if (env.QA_REFERENCE_HTML) {
        if (!fs.existsSync(env.QA_REFERENCE_HTML)) throw new Error(`QA_REFERENCE_HTML is ${env.QA_REFERENCE_HTML}, which doesn't exist`);
        return env.QA_REFERENCE_HTML;
    }
    let dir = path.resolve(root);
    for (;;) {
        const candidate = path.join(dir, REFERENCE_FILE);
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

// One line for the review page's run notes: an error's first line, without colour codes.
export const problemText = error => String(error?.message ?? error)
    .replace(/\u001b\[[0-9;]*m/g, '') // eslint-disable-line no-control-regex
    .split('\n').map(line => line.trim()).find(Boolean) || 'unknown problem';

// Shoots each anchor in turn, and never throws: the reference shots run inside every
// `npm run qa:screens`, the release's included, so a changed or broken reference page must
// not fail that run. A screen that can't be shot gets `problem` instead of `image`, and the
// review page says so.
//
// - prepare() opens and sets up the page. If it throws, every screen gets its problem.
// - shoot(anchor, msLeft) shoots one screen and returns its image path. It must keep each
//   wait within msLeft.
// - Once budgetMs has passed since the start, the screens left aren't tried, so the test
//   stays inside its timeout.
export async function shootScreens({
    anchors, prepare, shoot, budgetMs, now = Date.now,
}) {
    const started = now();
    let setupProblem = null;
    try {
        await prepare();
    } catch (error) {
        setupProblem = problemText(error);
    }
    const results = [];
    for (const anchor of anchors) {
        const left = budgetMs - (now() - started);
        if (setupProblem) results.push({ anchor, image: null, problem: setupProblem });
        else if (left <= 0) results.push({ anchor, image: null, problem: `not tried: the reference shots ran out of time (${Math.round(budgetMs / 1000)} s)` });
        else {
            try {
                results.push({ anchor, image: await shoot(anchor, left), problem: null }); // eslint-disable-line no-await-in-loop
            } catch (error) {
                results.push({ anchor, image: null, problem: problemText(error) });
            }
        }
    }
    return results;
}
