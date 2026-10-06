// Tests for the fixture page that widget element shots are taken on
// (scripts/qa/render/widget-page.mjs, W0-9): where the widget sits, what the page loads, and
// which requests it may make. The shots themselves are Playwright's
// (scripts/qa/widget-screens.spec.mjs); these need no browser and no compiled CSS, so CI
// runs them through `npm run test:scripts`.
//
//   node --test scripts/qa/render/widget-page.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../raw-html/html.mjs';
import { unbalancedTags } from './html-checks.mjs';
import {
    PLACEMENT_ID, THEME_DIR, WIDGET_ID, widgetCases,
} from './render.mjs';
import {
    FIXTURE_ORIGIN, THEME_CSS_PATH, renderWidgetPage, requestAction, respond,
} from './widget-page.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WIDGETS = path.join(HERE, 'fixtures/widgets');
const SELFTEST = path.join(HERE, 'selftest/widgets');
const band = () => widgetCases([WIDGETS]).find(({ name }) => name === 'two-in-stock');
const inRegion = (widgetCase, region) => ({ ...widgetCase, fixture: { ...widgetCase.fixture, region } });
// Each needle must appear after the one before it.
function assertInOrder(html, needles) {
    let from = 0;
    for (const needle of needles) {
        const at = html.indexOf(needle, from);
        assert.ok(at !== -1, `"${needle}" comes after "${html.slice(Math.max(0, from - 60), from)}"`);
        from = at + needle.length;
    }
}

describe('the fixture page around a widget', () => {
    it('puts the widget in its region, inside the boxes the page template gives that region', async () => {
        // home.html renders home_below_top_products inside .main.full, inside body.html's .container.
        const html = await renderWidgetPage(band());
        assertInOrder(html, ['id="main-content"', 'class="container"', 'class="main full"', 'data-content-region="home_below_top_products"', `data-widget-id="${WIDGET_ID}"`, '<h2>Best sellers</h2>']);
    });

    it('puts a widget in the hero block\'s region outside .container, as home.html does', async () => {
        const html = await renderWidgetPage(inRegion(band(), 'home_below_menu'));
        assertInOrder(html, ['id="main-content"', 'data-content-region="home_below_menu"', '<h2>Best sellers</h2>', 'class="container"']);
    });

    it('marks the widget as the store does, with its widget, placement and status attributes', async () => {
        const html = await renderWidgetPage(band());
        const [wrapper] = findTags(html, 'div').filter(tag => 'data-widget-id' in tag.attrs);
        assert.deepEqual(wrapper.attrs, { 'data-widget-id': WIDGET_ID, 'data-placement-id': PLACEMENT_ID, 'data-placement-status': 'ACTIVE' });
    });

    it('renders the widget once, and leaves the page\'s other regions empty', async () => {
        const html = await renderWidgetPage(band());
        assert.equal(html.split('<h2>Best sellers</h2>').length, 2);
        assert.match(html, /data-content-region="home_below_menu"><\/div>/);
    });

    it('fails on a region the page template doesn\'t render, naming the ones it does', async () => {
        await assert.rejects(renderWidgetPage(inRegion(band(), 'header_bottom--global')), error => {
            assert.match(error.message, /"header_bottom--global".*pages\/home/);
            assert.match(error.message, /home_below_menu, home_below_carousel, home_below_featured_products, home_below_top_products, home_below_new_products/);
            return true;
        });
    });

    it('loads the theme\'s fonts and its compiled CSS, and no script', async () => {
        const html = await renderWidgetPage(band());
        const links = findTags(html, 'link');
        assert.ok(links.some(link => link.attrs.rel === 'stylesheet' && link.attrs.href === THEME_CSS_PATH), 'the theme CSS');
        assert.ok(links.some(link => /^https:\/\/fonts\.googleapis\.com\/css/.test(link.attrs.href)), 'getFontsCollection\'s Google Fonts link, from the theme settings');
        assert.deepEqual(findTags(html, 'script'), []);
        assert.match(html, /<html class="js" lang="en/);
    });

    it('leaves the markup balanced', async () => {
        assert.deepEqual(unbalancedTags(await renderWidgetPage(band())), []);
    });

    it('renders the shot self-test widget', async () => {
        const [selftest] = widgetCases([SELFTEST]);
        assert.equal(selftest.widget, 'rf-selftest');
        assert.match(await renderWidgetPage(selftest), /class="rf-selftest"/);
    });
});

describe('the requests the fixture page may make', () => {
    it('serves the fixture origin itself, and store image hosts from the fixture\'s files', () => {
        assert.equal(requestAction(`${FIXTURE_ORIGIN}/`), 'serve');
        assert.equal(requestAction(`${FIXTURE_ORIGIN}${THEME_CSS_PATH}`), 'serve');
        assert.equal(requestAction('https://cdn11.bigcommerce.com/s-fixture/images/stencil/320w/products/1/1/fly.svg'), 'serve');
    });

    it('lets the theme\'s Google Fonts through', () => {
        assert.equal(requestAction('https://fonts.googleapis.com/css?family=Karla:400'), 'allow');
        assert.equal(requestAction('https://fonts.gstatic.com/s/karla/v31/a.woff2'), 'allow');
    });

    it('blocks everything else: the store, analytics and any other host', () => {
        for (const url of ['https://reelflies.ca/dry-flies/', 'https://reelflies_ca-1895766.mybigcommerce.com/graphql', 'https://www.googletagmanager.com/gtag/js?id=G-1', 'https://example.com/a.png']) {
            assert.equal(requestAction(url), 'block', url);
        }
    });
});

describe('the fixture origin\'s answers', () => {
    const filesDir = path.join(SELFTEST, 'rf-selftest/fixtures/files');
    const answer = (url, extra = {}) => respond(new URL(url, FIXTURE_ORIGIN), {
        html: '<p>page</p>', css: 'body{}', themeDir: THEME_DIR, filesDir, ...extra,
    });

    it('answer / with the page and the theme CSS path with the compiled CSS', () => {
        assert.deepEqual(answer('/'), { status: 200, contentType: 'text/html; charset=utf-8', body: '<p>page</p>' });
        assert.deepEqual(answer(THEME_CSS_PATH), { status: 200, contentType: 'text/css; charset=utf-8', body: 'body{}' });
    });

    it('answer /assets/ from the theme\'s assets folder, as the CSS\'s relative URLs expect', () => {
        const gif = answer('/assets/img/BrandDefault.gif');
        assert.equal(gif.status, 200);
        assert.equal(gif.contentType, 'image/gif');
        assert.deepEqual(gif.body, fs.readFileSync(path.join(THEME_DIR, 'assets/img/BrandDefault.gif')));
    });

    it('answer any other path, and store image URLs, with the fixture file of the same name, whatever the size in the path', () => {
        for (const url of ['/fly.svg', 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/320w/products/1/1/fly.svg', 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/1280w/image-manager/fly.svg?c=2']) {
            const file = respond(new URL(url, FIXTURE_ORIGIN), {
                html: '', css: '', themeDir: THEME_DIR, filesDir,
            });
            assert.equal(file.status, 200, url);
            assert.equal(file.contentType, 'image/svg+xml');
        }
    });

    it('answer 404 for a file that isn\'t there, and never leave the folder it serves', () => {
        assert.equal(answer('/missing.png').status, 404);
        assert.equal(answer('/assets/%2e%2e/config.json').status, 404);
        assert.equal(answer('/assets/img/%2e%2e%2f%2e%2e%2fconfig.json').status, 404);
        assert.equal(answer('/assets/img').status, 404);
    });
});
