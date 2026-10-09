// The home page with every widget a channel places on it, each rendered from one of its fixtures
// (ticket 47; W0-9's fixture page, scripts/qa/render/widget-page.mjs, for several widgets at once).
//
// The store's home page holds several widgets: the hero and the cards (widgets/home-lead) in
// home_below_menu, the tiles (widgets/link-tiles) first in home_below_top_products, and tickets 48
// and 49's bands after them. Page baselines hide every widget (W0-5), and an element shot sees
// one widget alone, so what only the whole page shows is checked here: where the six Fly Types sit
// (HOME-3's 1,600px), whether the page scrolls sideways, and whether a photo appears twice.
//
// - homeCases({ channel, fixtures }) lists each widget whose channels/<channel>.json places it on
//   pages/home, with the fixture named in `fixtures` (default: "default"), in the order the
//   store renders them: by region as home.html has them, then by placement sort_order.
// - renderHomePage(cases, { variation, chrome, context }) renders templates/pages/home.html inside
//   the theme's own body, with the header and footer unless chrome is false, and each widget in its
//   region in the store's wrapper. context is more store data for the page, such as the
//   shipping_messages home.html prints.
// - openHomePage(page, cases, options) opens it in Playwright on widget-page.mjs's made-up origin:
//   no request reaches the store, and each store image URL is answered from the fixtures/files/
//   folder of the widgets on the page.
//
// It reads the placements from the channel files, never the store: whether the store holds what
// the repo records is widgets-sync.mjs --verify's check.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import fs from 'fs';
import path from 'path';
import {
    DEFAULT_VARIATION, THEME_DIR, WIDGETS_DIR, readFixture, renderPartial, renderWidget, widgetCases,
} from './render.mjs';
import {
    FIXTURE_ORIGIN, compileThemeCss, requestAction, respond,
} from './widget-page.mjs';

export const HOME_TEMPLATE = 'pages/home';
// home.html's regions, top to bottom.
export const HOME_REGIONS = ['home_below_menu', 'home_below_carousel', 'home_below_featured_products', 'home_below_top_products', 'home_below_new_products'];
const LAYOUT = fs.readFileSync(new URL('./widget-layout.html', import.meta.url), 'utf8');

const relative = file => path.relative(THEME_DIR, file);
// A fixed id per widget on the page, so the page is the same on every run.
const fixedId = (n, kind) => `0f1c5e00-0000-4000-8000-${String(kind * 1000 + n).padStart(12, '0')}`;

// Each widget placed on pages/home on the channel, with its fixture and placement.
export function homeCases({ channel = 1895766, fixtures = {}, root = WIDGETS_DIR } = {}) {
    const all = widgetCases([root]);
    const placed = [...new Set(all.map(({ widget }) => widget))].flatMap(widget => {
        const file = path.join(root, widget, 'channels', `${channel}.json`);
        if (!fs.existsSync(file)) return [];
        const { placement } = readFixture(file);
        if (!(placement.template_files || [placement.template_file]).includes(HOME_TEMPLATE)) return [];
        const name = fixtures[widget] || 'default';
        const widgetCase = all.find(item => item.widget === widget && item.name === name);
        if (!widgetCase) throw new Error(`widgets/${widget} has no fixture "${name}"`);
        if (widgetCase.fixture.region && widgetCase.fixture.region !== placement.region) {
            throw new Error(`${relative(widgetCase.file)}: its region "${widgetCase.fixture.region}" isn't the placement's "${placement.region}" in ${relative(file)}`);
        }
        return [{ ...widgetCase, placement }];
    });
    const unknown = Object.keys(fixtures).filter(widget => !placed.some(item => item.widget === widget));
    if (unknown.length) throw new Error(`no widget placed on ${HOME_TEMPLATE} on channel ${channel} is named ${unknown.join(', ')}`);
    return placed.sort((a, b) => (HOME_REGIONS.indexOf(a.placement.region) - HOME_REGIONS.indexOf(b.placement.region))
        || (a.placement.sort_order - b.placement.sort_order));
}

// The home page, every widget in its region in the store's wrapper, in the cases' order.
export async function renderHomePage(cases, {
    variation = DEFAULT_VARIATION, chrome = true, themeDir = THEME_DIR, context = {},
} = {}) {
    const regions = {};
    for (const [index, widgetCase] of cases.entries()) {
        const html = await renderWidget(widgetCase.widget, widgetCase.fixture, { root: widgetCase.root }); // eslint-disable-line no-await-in-loop
        const { region } = widgetCase.placement;
        regions[region] = `${regions[region] || ''}<div data-widget-id="${fixedId(index + 1, 1)}" data-placement-id="${fixedId(index + 1, 2)}" data-placement-status="ACTIVE">${html}</div>`;
    }
    return renderPartial(HOME_TEMPLATE, { ...context, rf_fixture_chrome: chrome }, {
        variation, themeDir, overrides: { 'layout/base': LAYOUT }, regions,
    });
}

// Opens the home page and waits until it stops moving, every lazy image included (the page is
// scrolled to its end and back). Returns the problems met on the way: blocked requests and
// missing files, as openWidget does.
export async function openHomePage(page, cases, { variation = DEFAULT_VARIATION, chrome = true, themeDir = THEME_DIR } = {}) {
    const [html, css] = await Promise.all([renderHomePage(cases, { variation, chrome, themeDir }), compileThemeCss(variation, themeDir)]);
    const filesDirs = [...new Set(cases.map(({ root, widget }) => path.join(root, widget, 'fixtures/files')))];
    const problems = [];
    await page.route('**/*', route => {
        const href = route.request().url();
        const action = requestAction(href);
        if (action === 'allow') return route.continue();
        if (action === 'block') {
            problems.push(`blocked ${href}: the home fixture page loads only its widgets' fixture files, the theme's assets and the theme's fonts`);
            return route.abort('blockedbyclient');
        }
        const url = new URL(href);
        const answers = filesDirs.map(filesDir => respond(url, {
            html, css, themeDir, filesDir,
        }));
        const answer = answers.find(({ status }) => status === 200) || answers[0];
        if (answer.status !== 200) problems.push(`${href} answered ${answer.status}: put the file in one of ${filesDirs.map(relative).join(', ')}`);
        return route.fulfill(answer);
    });

    await page.goto(`${FIXTURE_ORIGIN}/`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
        window.scrollTo(0, document.scrollingElement.scrollHeight);
        await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
        const pending = [...document.images].filter(image => !image.complete)
            .map(image => new Promise(resolve => {
                image.addEventListener('load', resolve);
                image.addEventListener('error', resolve);
            }));
        await Promise.race([Promise.all(pending), new Promise(resolve => { setTimeout(resolve, 10000); })]);
        window.scrollTo(0, 0);
    });
    return { problems };
}
