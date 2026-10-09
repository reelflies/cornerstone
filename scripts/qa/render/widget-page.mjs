// The fixture page a widget element shot is taken on (W0-9; scripts/qa/widget-screens.spec.mjs).
// How to use it: scripts/qa/README.md, "Fixture renders".
//
// - renderWidgetPage(widgetCase) renders the widget from its fixture (render.mjs) into the
//   region its fixture names, on the page template it names: the real page template, inside the
//   theme's real components/common/body, so the widget sits in the same boxes as on the
//   storefront (a hero-block region outside .container, a page region inside it). The store's
//   wrapper goes round it: data-widget-id, data-placement-id and data-placement-status. The
//   fixture's page_context is the page's data, and "chrome": true adds the header and footer.
// - compileThemeCss(variation) compiles theme.scss with the variation's settings, with
//   stencil-cli's compiler and engine, as stencil start serves it to the page baselines.
// - openWidget(page, widgetCase) opens that page in Playwright on a made-up origin that no
//   network request ever reaches: Playwright answers each request (requestAction, respond).
//   - The page, the compiled CSS and the theme's assets/ come from this checkout.
//   - Any other path, and any store CDN image URL, is answered with the fixture file of the
//     same name from widgets/<name>/fixtures/files/ (or the self-test's or fixture page's own
//     fixtures/files/), whatever its size segment, so a fixture can keep the URLs a real GraphQL
//     response holds.
//   - The theme's Google Fonts load, as on the storefront.
//   - Every other request is blocked and reported, so a shot never depends on the store's
//     state, analytics, or any other host.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import {
    DEFAULT_VARIATION, PLACEMENT_ID, THEME_DIR, WIDGET_ID, renderPartial, renderWidget, themeConfig,
} from './render.mjs';

export const FIXTURE_ORIGIN = 'https://widget-fixture.reelflies.test';
export const THEME_CSS_PATH = '/assets/css/theme.css';
// The shot self-test's widget (widget-screens.spec.mjs). It lives outside widgets/, so the
// widget sync never sees it.
export const SELFTEST_WIDGETS = path.join(THEME_DIR, 'scripts/qa/render/selftest/widgets');
// Fixture pages (ticket 31): a widget folder whose fixture renders a real page template round it,
// so a spec can shoot what that page shows from fixed data (card-screens.spec.mjs). Never synced.
export const PAGE_FIXTURES = path.join(THEME_DIR, 'scripts/qa/render/pages');
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const STORE_IMAGE_HOST = /^cdn\d*\.bigcommerce\.com$/;
const LAYOUT = fs.readFileSync(new URL('./widget-layout.html', import.meta.url), 'utf8');
const CONTENT_TYPES = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};
const NOT_FOUND = { status: 404, contentType: 'text/plain; charset=utf-8', body: 'not found' };

const relative = file => path.relative(THEME_DIR, file);

// The page template renders with the fixture's `page_context` as its store data (paper sets
// `template` to the page itself), so a region inside a condition, such as cart.html's
// cart_below_totals, can hold the widget. With `chrome: true` the theme's header and footer
// render round it, as layout/base.html renders them, for a widget in a header or footer region.
export async function renderWidgetPage(widgetCase, { variation = DEFAULT_VARIATION, themeDir = THEME_DIR } = {}) {
    const { fixture } = widgetCase;
    const widget = await renderWidget(widgetCase.widget, fixture, { root: widgetCase.root });
    const placed = `<div data-widget-id="${WIDGET_ID}" data-placement-id="${PLACEMENT_ID}" data-placement-status="ACTIVE">${widget}</div>`;
    const chrome = fixture.chrome === true;
    const html = await renderPartial(fixture.page, { ...fixture.page_context, rf_fixture_chrome: chrome }, {
        variation, themeDir, overrides: { 'layout/base': LAYOUT }, regions: { [fixture.region]: placed },
    });
    if (!html.includes(`data-content-region="${fixture.region}"`)) {
        const regions = [...html.matchAll(/data-content-region="([^"]+)"/g)].map(([, name]) => name);
        throw new Error(`${relative(widgetCase.file)}: the region "${fixture.region}" isn't on ${fixture.page} as the fixture page renders it `
            + `(the page template inside components/common/body, ${chrome ? 'with' : 'without'} the header and footer, with the fixture's page_context). `
            + `Its regions: ${regions.join(', ') || 'none'}. A region in the header or footer needs "chrome": true, `
            + 'and a region inside a condition (cart_below_totals needs cart.items) needs a "page_context" that meets it.');
    }
    return html;
}

const cssCache = new Map();

// theme.css for the variation, compiled once per process. stencil-cli's compile() defaults to
// the node-sass engine, which stencil start uses too.
export function compileThemeCss(variation = DEFAULT_VARIATION, themeDir = THEME_DIR) {
    const key = `${themeDir}\n${variation}`;
    if (!cssCache.has(key)) {
        cssCache.set(key, (async () => {
            const { default: cssCompiler } = await import('@bigcommerce/stencil-cli/lib/css/compile.js'); // eslint-disable-line import/extensions, import/no-extraneous-dependencies
            const css = await cssCompiler.compile(themeConfig(variation, themeDir), path.join(themeDir, 'assets'), 'theme.css');
            return css.replace(/\/\*# sourceMappingURL=[\s\S]*?\*\//g, '');
        })());
    }
    return cssCache.get(key);
}

// What the fixture page may load: 'serve' (answered by respond), 'allow' (the theme's fonts)
// or 'block' (anything else).
export function requestAction(href) {
    const url = new URL(href);
    if (url.origin === FIXTURE_ORIGIN || STORE_IMAGE_HOST.test(url.hostname)) return 'serve';
    if (url.protocol === 'data:' || FONT_HOSTS.includes(url.hostname)) return 'allow';
    return 'block';
}

// A file under `base`, or 404. The path never leaves `base`.
function serveFile(base, encoded) {
    let name;
    try {
        name = decodeURIComponent(encoded);
    } catch {
        return NOT_FOUND;
    }
    const root = path.resolve(base);
    const file = path.resolve(root, name);
    if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return NOT_FOUND;
    return { status: 200, contentType: CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', body: fs.readFileSync(file) };
}

// The answer to a request requestAction() serves: { status, contentType, body }.
export function respond(url, {
    html, css, themeDir = THEME_DIR, filesDir,
}) {
    if (url.origin === FIXTURE_ORIGIN) {
        if (url.pathname === '/') return { status: 200, contentType: 'text/html; charset=utf-8', body: html };
        if (url.pathname === THEME_CSS_PATH) return { status: 200, contentType: 'text/css; charset=utf-8', body: css };
        if (url.pathname.startsWith('/assets/')) return serveFile(path.join(themeDir, 'assets'), url.pathname.slice('/assets/'.length));
    }
    return serveFile(filesDir, path.posix.basename(url.pathname));
}

// Opens the widget's fixture page and waits until it stops moving. Returns the widget's
// wrapper as a Locator, and the problems met on the way: blocked requests and missing files.
// A shot with problems isn't a shot of the fixture, so the spec fails on them.
export async function openWidget(page, widgetCase, { variation = DEFAULT_VARIATION, themeDir = THEME_DIR } = {}) {
    const [html, css] = await Promise.all([renderWidgetPage(widgetCase, { variation, themeDir }), compileThemeCss(variation, themeDir)]);
    const filesDir = path.join(widgetCase.root, widgetCase.widget, 'fixtures/files');
    const problems = [];
    await page.route('**/*', route => {
        const href = route.request().url();
        const action = requestAction(href);
        if (action === 'allow') return route.continue();
        if (action === 'block') {
            problems.push(`blocked ${href}: a widget shot loads only its fixture's files, the theme's assets and the theme's fonts`);
            return route.abort('blockedbyclient');
        }
        const answer = respond(new URL(href), {
            html, css, themeDir, filesDir,
        });
        if (answer.status !== 200) problems.push(`${href} answered ${answer.status}: put the file in ${relative(filesDir)}/`);
        return route.fulfill(answer);
    });

    await page.goto(`${FIXTURE_ORIGIN}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const widget = page.locator('[data-widget-id]');
    await widget.scrollIntoViewIfNeeded();
    await widget.evaluate(element => Promise.race([
        Promise.all([...element.querySelectorAll('img')].filter(image => !image.complete)
            .map(image => new Promise(resolve => {
                image.addEventListener('load', resolve);
                image.addEventListener('error', resolve);
            }))),
        new Promise(resolve => { setTimeout(resolve, 10000); }),
    ]));
    return { widget, problems };
}
