// Tests for the fixture page that widget element shots are taken on
// (scripts/qa/render/widget-page.mjs, W0-9): where the widget sits, what the page loads, and
// which requests it may make. The shots themselves are Playwright's
// (scripts/qa/widget-screens.spec.mjs); these need no browser and no compiled CSS, so CI
// runs them through `npm run test:scripts`.
//
//   node --test scripts/qa/render/widget-page.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { after, describe, it } from 'node:test';
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
const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
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

    it('fails on a region the page template doesn\'t render, naming the ones it does and how to reach the others', async () => {
        await assert.rejects(renderWidgetPage(inRegion(band(), 'header_bottom--global')), error => {
            assert.match(error.message, /"header_bottom--global".*pages\/home/);
            assert.match(error.message, /home_below_menu, home_below_carousel, home_below_featured_products, home_below_top_products, home_below_new_products/);
            assert.match(error.message, /"chrome": true/);
            assert.match(error.message, /"page_context"/);
            return true;
        });
    });

    it('gives the page template the fixture\'s page_context, so a region inside a condition can hold the widget', async () => {
        // cart.html renders cart_below_totals only inside {{#if cart.items.length}}.
        const inCart = { ...band(), fixture: { ...band().fixture, page: 'pages/cart', region: 'cart_below_totals' } };
        await assert.rejects(renderWidgetPage(inCart), /"cart_below_totals" isn't on pages\/cart/);
        const cart = { cart: { quantity: 1, items: [{ id: 'line-1', name: 'Parachute Adams', quantity: 1 }] } };
        const html = await renderWidgetPage({ ...inCart, fixture: { ...inCart.fixture, page_context: cart } });
        assertInOrder(html, ['data-cart-totals', 'data-content-region="cart_below_totals"', `data-widget-id="${WIDGET_ID}"`, '<h2>Best sellers</h2>']);
    });

    it('sets template to the fixture\'s page, as the store does, whatever the page_context says', async () => {
        // A theme whose only page prints `template`, with the real components (body.html among them).
        const themeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widget-page-'));
        tempDirs.push(themeDir);
        for (const name of ['config.json', 'lang']) fs.symlinkSync(path.join(THEME_DIR, name), path.join(themeDir, name));
        fs.mkdirSync(path.join(themeDir, 'templates/pages'), { recursive: true });
        fs.symlinkSync(path.join(THEME_DIR, 'templates/components'), path.join(themeDir, 'templates/components'), 'dir');
        const page = '{{#partial "page"}}<p class="rf-template">{{template}}</p>{{{region name="rf_template"}}}{{/partial}}{{> layout/base}}';
        fs.writeFileSync(path.join(themeDir, 'templates/pages/rf-template.html'), page);
        const fixture = {
            ...band().fixture, page: 'pages/rf-template', region: 'rf_template', page_context: { template: 'pages/home' },
        };
        const widgetCase = { ...band(), fixture };
        assert.match(await renderWidgetPage(widgetCase, { themeDir }), /<p class="rf-template">pages\/rf-template<\/p>/);
    });

    it('with "chrome": true, renders the theme\'s header and footer round the page, so a widget can sit in a header region', async () => {
        const html = await renderWidgetPage({ ...band(), fixture: { ...band().fixture, region: 'header_bottom--global', chrome: true } });
        assertInOrder(html, ['<header class="header"', '</header>', 'data-content-region="header_bottom--global"', `data-widget-id="${WIDGET_ID}"`, 'id="main-content"', '<footer class="footer"']);
        assert.deepEqual(findTags(html, 'script'), []);
    });

    it('without "chrome", renders no header and no footer', async () => {
        const html = await renderWidgetPage(band());
        assert.doesNotMatch(html, /<header|<footer/);
    });

    it('loads the theme\'s compiled CSS, whose @font-face brings Onest from theme assets, and no script', async () => {
        const html = await renderWidgetPage(band());
        const links = findTags(html, 'link');
        assert.ok(links.some(link => link.attrs.rel === 'stylesheet' && link.attrs.href === THEME_CSS_PATH), 'the theme CSS');
        // Onest comes from theme assets through the CSS (ticket 25), so no theme font asks Google.
        assert.ok(!links.some(link => /fonts\.googleapis\.com/.test(link.attrs.href)), 'no Google Fonts link: the theme settings name no Google font');
        assert.deepEqual(findTags(html, 'script'), []);
        assert.match(html, /<html class="js" lang="en-CA">/);
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
