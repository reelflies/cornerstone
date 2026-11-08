// The module switches (spec, Implementation Decisions, "Server-side switches"): the boolean
// rf_* theme settings that turn a ReelFlies module on and off. Each is read in a template, so
// with it off the module's markup stays out of the page (or stock's renders in its place).
// Ticket 54's switch matrix (switch-matrix.mjs) renders every pinned page with each switch on
// and off, through W0-8's overlays, and switch-stock.spec.mjs checks that nothing of a module
// whose switch is off is on the page.
//
// SWITCHES has one entry per switch, in config.json's order, with a blank line between entries.
// An entry:
//   ticket   who owns the module: the master ticket it descends from ('43'), or the redesign step
//            that made it ('redesign step 2', CUSTOMIZATIONS.md). ownerOf(entry) words it.
//   module   what it switches, for messages
//   markers  the data-rf-* attributes the module's markup carries. With the switch off, no
//            element on the page may carry one (switch-stock.spec.mjs).
//   chunks   the webpackChunkName of each script the module alone loads (as check-bundle.mjs
//            names them). With the switch off, the page may not load one. A chunk that loads
//            whatever the switch says (reelflies/global.js's order line, the product page's
//            rf-product) isn't the module's to name.
//   stock    optional: the stock markup the module replaces or guards, as page kind -> CSS
//            selectors. With the switch off, each must match on every pinned page of that kind
//            (switch-stock.spec.mjs), so a module that changes stock markup while it is off fails
//            even with its markers and chunks gone.
//   browser  optional: for a module whose whole effect is written in the browser, with no marker
//            of its own in the server HTML and no chunk of its own, what the matrix's off row shows
//            instead (its screenshots). The cart state is one: quick-add.js fills a tag every
//            card carries either way.
//   query    optional: the QA overrides of a module that its switch alone doesn't show on the
//            runner, { show, hide }, each a query string. A run with the switch on opens every
//            pinned page with `show` added, and makes the first interaction the module waits for
//            (fixtures.mjs, storefrontPage); switch-query.spec.mjs checks that it shows with
//            `show`, and that nothing of it shows with `hide`. Needs a marker. No switch on this
//            branch has one (master's outside-Canada prompt, ticket 52, did).
//   notOn    optional, with `query`: the page kinds the module never shows on, even with `show`.
// Once a template reads theme_settings.<switch>, switches.test.mjs fails until the entry names at
// least one marker or chunk, or says in `browser` why it has none.
//
// A switch is in the matrix once a template reads theme_settings.<switch> outside a Handlebars
// comment (templatesReading). Until then its module hasn't landed, and flipping a switch that
// nothing reads renders the same page.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readOverlay } from './overlays.mjs';

export const SWITCHES = {
    rf_counts: {
        ticket: 'redesign step 2',
        module: 'the counts beside categories',
        // A way in's count on the stone (data-rf-count, cat-view.html and species-list.html, which
        // home.js reads for "All n") and a Species hub tile's (data-rf-hub-count, hub-tile.html).
        // The counts are BigCommerce's own, written by the templates: no script of their own.
        markers: ['data-rf-count', 'data-rf-hub-count'],
        chunks: [],
    },

    rf_quick_add: {
        ticket: '43',
        module: 'quick add on the cards',
        // "+ Add" on a card and the size panel it opens (components/reelflies/fly.html), and the
        // scripts the listings load only with the switch on (page-modules.js): quick-add.js and
        // quick order (order-list.js). The redesign's card is the theme's own, not stock's, so
        // with the switch off a card links to its page (a.rf-add--link) and no stock markup
        // returns: no `stock` selectors.
        markers: ['data-rf-add', 'data-rf-sizes'],
        chunks: ['rf-quick-add', 'rf-order-list'],
    },

    rf_cart_state: {
        ticket: '42',
        module: 'the in-box line and ring on the cards',
        // head.html injects it as context.rfCartState; quick-add.js (which quick add loads) shows
        // what the box holds on the line every card reserves ([data-rf-inbox], hidden on the
        // server either way) and lights the card's ring (is-in). Nothing in the server HTML and no
        // chunk is the cart state's alone.
        markers: [],
        chunks: [],
        browser: 'the cards\' in-box lines stay empty and no card is ring-lit, however many flies the box holds (the matrix\'s screenshots)',
    },

    rf_size_strip: {
        ticket: 'redesign step 3',
        module: 'the size picker on the product page',
        // The picker drawn on the server (components/reelflies/product-picker.html) and stock's
        // form hidden behind it (product-buy.html); product-buy.js loads on every product page
        // (rf-product) and finds nothing to do without the picker. With the switch off, stock's
        // form shows, so it is the stock markup to find.
        markers: ['data-rf-pick-page', 'data-rf-pdp-form'],
        chunks: [],
        stock: {
            product: ['.rf-pdp__form:not([hidden]) form[data-cart-item-add]'],
        },
    },

    rf_order_line: {
        ticket: 'redesign step 2',
        module: 'the order line and the box sheet',
        // The bar pinned at the foot of every page but the cart (components/reelflies/order-line.html,
        // from footer.html). order-line.js loads on every page (reelflies/global.js) and does
        // nothing without the bar, so the chunk isn't the switch's to name.
        markers: ['data-rf-orderline'],
        chunks: [],
    },
};

// How messages name a switch's owner: "ticket 43", or "redesign step 2".
export const ownerOf = entry => (/^\d+$/.test(String(entry.ticket)) ? `ticket ${entry.ticket}` : String(entry.ticket));

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
export const TEMPLATES_DIR = path.join(ROOT, 'templates');
const SCRIPTS_DIR = path.join(ROOT, 'assets', 'js');

// config.json's module switches: its boolean rf_* settings, in config.json's order.
export const moduleSwitches = config => Object.entries(config.settings || {})
    .filter(([key, value]) => key.startsWith('rf_') && typeof value === 'boolean')
    .map(([key]) => key);

// Each switch's value as a run renders it: config.json's base settings, the variation's on top
// (as stencil start merges them), and an overlay's (overlays.mjs, readOverlay) on top of both.
export function switchValues({ config, variation, overlay = null }) {
    const entry = (config.variations || []).find(({ name }) => name === variation);
    if (!entry) throw new Error(`"${variation}" isn't a variation in config.json (${(config.variations || []).map(({ name }) => name).join(', ')})`);
    const settings = { ...config.settings, ...(entry.settings || {}), ...(overlay?.settings || {}) };
    return Object.fromEntries(moduleSwitches(config).map(key => [key, settings[key]]));
}

// The switch values a run renders: this checkout's config.json, the run's variation, and its
// overlay by name (QA_OVERLAY), if it has one.
export function readSwitchValues({ variation, overlay = '', root = ROOT }) {
    const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
    return switchValues({ config, variation, overlay: overlay ? readOverlay(overlay) : null });
}

// The switches that are off in `values`, each with its SWITCHES entry, in `values`' order.
export const offSwitches = (values, switches = SWITCHES) => Object.entries(values)
    .filter(([, value]) => value === false)
    .map(([key]) => ({
        key, ticket: null, module: key, markers: [], chunks: [], stock: {}, ...switches[key],
    }));

// The stock markup `entry` must leave on a page of `kind` with its switch off.
export const stockSelectors = (entry, kind) => entry.stock?.[kind] || [];

// The switches that are on in `values` and have QA overrides (`query`), each with its entry.
export const queriedSwitches = (values, switches = SWITCHES) => Object.entries(values)
    .filter(([key, value]) => value === true && switches[key]?.query)
    .map(([key]) => ({ key, notOn: [], ...switches[key] }));

// The query a run with `values` opens every pinned page with: the `show` override of each switch
// that is on and has one, or its `hide` override for the switch named `hide`. '' when none has.
export const switchQuery = (values, { hide = null, switches = SWITCHES } = {}) => queriedSwitches(values, switches)
    .map(({ key, query }) => (key === hide ? query.hide : query.show))
    .join('&');

// `pagePath` with `query` added, after a query it has and before its #fragment.
export function withQuery(pagePath, query) {
    if (!query) return pagePath;
    const at = pagePath.indexOf('#');
    const [base, fragment] = at === -1 ? [pagePath, ''] : [pagePath.slice(0, at), pagePath.slice(at)];
    return `${base}${base.includes('?') ? '&' : '?'}${query}${fragment}`;
}

// The modules a page of `kind` opened at `pagePath` should show after the first interaction, in a
// run with `values`: each switch that is on whose `show` override the path carries, unless the
// module never shows on that kind. [{ key, ticket, module, marker }], marker being its first.
export function expectedModules(values, pagePath, kind, switches = SWITCHES) {
    const params = new URL(pagePath, 'http://storefront.invalid').searchParams;
    const carries = query => [...new URLSearchParams(query)].every(([name, value]) => params.getAll(name).includes(value));
    return queriedSwitches(values, switches)
        .filter(({ query, notOn }) => carries(query.show) && !notOn.includes(kind))
        .map(({
            key, ticket, module, markers,
        }) => ({
            key, ticket, module, marker: markers[0],
        }));
}

export const describeValues = values => Object.entries(values).map(([key, value]) => `${key} ${value ? 'on' : 'off'}`).join(', ');

// A template with its Handlebars comments taken out: {{!-- ... --}} (which may hold "}}") and
// {{! ... }}, each with or without ~. An HTML comment stays, because Handlebars still renders it.
export const stripHandlebarsComments = text => text
    .replace(/\{\{~?!--[\s\S]*?--~?\}\}/g, '')
    .replace(/\{\{~?![\s\S]*?~?\}\}/g, '');

const filesIn = (dir, extension) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(file, extension);
    return entry.name.endsWith(extension) ? [file] : [];
});
const templateFiles = dir => filesIn(dir, '.html');

// Every template and every script under assets/js (the build in assets/dist and the unit tests
// left out), as one text, to check that a switch's markers and chunks are real.
export const sourceText = ({ templates = TEMPLATES_DIR, scripts = SCRIPTS_DIR } = {}) => [
    ...templateFiles(templates),
    ...filesIn(scripts, '.js').filter(file => !file.includes(`${path.sep}test-unit${path.sep}`)),
].map(file => fs.readFileSync(file, 'utf8')).join('\n');

// How a script writes a data-* attribute through element.dataset: data-rf-region-prompt is
// dataset.rfRegionPrompt.
export const datasetName = attribute => attribute.replace(/^data-/, '').replace(/-([a-z0-9])/g, (match, letter) => letter.toUpperCase());

// The switches in `keys` that some template in `dir` reads as theme_settings.<switch>, outside a
// Handlebars comment.
export function templatesReading(keys, { dir = TEMPLATES_DIR } = {}) {
    const reading = new Set();
    for (const file of templateFiles(dir)) {
        const text = stripHandlebarsComments(fs.readFileSync(file, 'utf8'));
        for (const key of keys) {
            if (new RegExp(`\\btheme_settings\\.${key}(?![A-Za-z0-9_])`).test(text)) reading.add(key);
        }
    }
    return reading;
}

// The names of the overlays (overlays.mjs, readOverlay) that set `key` to `value` and change no
// other setting, so a row of the matrix differs from the plain run by that one switch.
export const flippingOverlays = (key, value, overlays) => overlays
    .filter(({ settings }) => Object.keys(settings).length === 1 && settings[key] === value)
    .map(({ name }) => name);

// True when `url` is the file webpack writes for the chunk named `chunk`
// (webpack.common.js: theme-bundle.chunk.[name].js), wherever it is served from.
export function chunkRequested(chunk, url) {
    let pathname;
    try {
        pathname = new URL(url).pathname;
    } catch {
        return false;
    }
    return pathname.endsWith(`/theme-bundle.chunk.${chunk}.js`);
}
