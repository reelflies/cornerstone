// The module switches (spec, Implementation Decisions, "Server-side switches"): the boolean
// rf_* theme settings that turn the rise ring, the cart state, quick add and the outside-Canada
// prompt on and off. Each is checked in a template, so with it off the stock markup renders.
// Ticket 54's switch matrix (switch-matrix.mjs) renders every pinned page with each switch on
// and off, through W0-8's overlays, and switch-stock.spec.mjs checks that nothing of a module
// whose switch is off is on the page.
//
// SWITCHES has one entry per switch, in ticket order, with a blank line between entries, so
// each module ticket changes only its own lines (build pipeline, section 6.1). An entry:
//   ticket   the ticket whose module the switch turns on and off
//   module   what it switches, for messages
//   markers  the data-rf-* attributes the module's markup carries. With the switch off, no
//            element on the page may carry one (switch-stock.spec.mjs).
//   chunks   the webpackChunkName of each script the module loads (as check-bundle.mjs names
//            them). With the switch off, the page may not load one.
//   stock    optional: the stock markup the module replaces or guards, as page kind -> CSS
//            selectors. With the switch off, each must match on every pinned page of that kind
//            (switch-stock.spec.mjs), so a module that changes stock markup while it is off fails
//            even with its markers and chunks gone. Quick add (43) would name the stock card's
//            Quick view button, for example, on the kinds that list cards.
// The owning ticket fills in its markers and chunks when its module lands: once a template
// reads theme_settings.<switch>, switches.test.mjs fails until the entry names at least one.
//
// A switch is in the matrix once a template reads theme_settings.<switch> outside a Handlebars
// comment (templatesReading). Until then its module hasn't landed: the scaffold pre-declares
// every switch (ticket 25), and flipping one that nothing reads renders the same page.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readOverlay } from './overlays.mjs';

export const SWITCHES = {
    rf_rise: {
        ticket: '27',
        module: 'the rise ring on the cart count',
        markers: [],
        chunks: [],
    },

    rf_cart_state: {
        ticket: '42',
        module: 'the cart state on the product page and the cards',
        markers: [],
        chunks: [],
    },

    rf_quick_add: {
        ticket: '43',
        module: 'quick add on the cards',
        markers: [],
        chunks: [],
    },

    rf_region_prompt: {
        ticket: '52',
        module: 'the outside-Canada prompt',
        // The prompt's root (the no-region-prompt raw-HTML assertion's marker). It is only ever
        // made in the browser, so the server HTML never has it, whatever the switch says.
        markers: ['data-rf-region-prompt'],
        chunks: [],
    },
};

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
