// The fixture renderer (W0-9, extends ticket 16): renders a ReelFlies partial, or a widget
// template from widgets/<name>/, from fixture JSON instead of store data. It lets a template
// be tested before the store has its data (tree-4 categories, Species pages, the hub, the hook
// chart rows), and a widget be checked from its source instead of from what the store shows.
// How to use it: scripts/qa/README.md, "Fixture renders".
//
// Partials render the way `stencil start` renders a page (stencil-cli 9.1.0's
// server/plugins/renderer/responses/pencil-response.js):
//
// - through @bigcommerce/stencil-paper and the @bigcommerce/stencil-paper-handlebars it wraps,
//   the versions stencil-cli pins, with config.json's template engine (handlebars_v4)
// - with every partial the template includes, found by stencil-cli's own patterns
//   (lib/template-assembler.js): first in the `templates` folders a test passes, then in the
//   theme's templates/
// - with theme_settings from config.json, the variation's settings on top, as stencil start
//   merges them, and lang strings from lang/
// - each render with a fresh renderer, so assignVar and getVar start empty, as each page
//   request does
//
// Widget templates render the way the store renders a widget: widget_configuration at the
// top level of the context, the storefront_api_query result as `_.data`, and the widget's id
// as `_.id` (here a fixed id, so a shot is the same on every run). A widget template can't
// include theme partials or read lang strings; it can include the partials in
// widgets/_shared/, which the widget sync must inline before upload (ticket 46).
//
// One deliberate difference: a helper the store doesn't have fails the render. The store
// renders `{{shout name}}` as nothing (stencil-paper-handlebars' helperMissing), which would
// let a typo, or a helper outside the whitelist, pass every test. A widget template also fails
// on the helpers that read the theme's page context (lang, langJson, inject, jsContext,
// region). `strict: false` renders them as stencil-paper-handlebars does.

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import lodash from 'lodash';
// Both are pinned through @bigcommerce/stencil-cli 9.1.0's lockfile entry, so a fixture render
// uses the renderer stencil start uses. Deep imports into the pinned devDependency; Node's ESM
// loader needs the .js.
import Paper from '@bigcommerce/stencil-paper'; // eslint-disable-line import/no-extraneous-dependencies
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies

const require = createRequire(import.meta.url);
const HELPERS_VERSION = require('@bigcommerce/stencil-paper-handlebars/package.json').version; // eslint-disable-line import/no-extraneous-dependencies

export const THEME_DIR = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
export const WIDGETS_DIR = path.join(THEME_DIR, 'widgets');
export const DEFAULT_VARIATION = 'ReelFlies CA';
// Fixed ids for `_.id` and the placement wrapper, so a widget renders the same on every run.
export const WIDGET_ID = '0f1c5e00-0000-4000-8000-000000000001';
export const PLACEMENT_ID = '0f1c5e00-0000-4000-8000-000000000002';
// A widget's image helpers build store CDN URLs from cdn_url. Element shots answer this host
// from the fixture's files/ folder (widget-page.mjs), so no shot ever reads the store's CDN.
export const WIDGET_SITE_SETTINGS = { cdn_url: 'https://cdn11.bigcommerce.com/s-fixture' };
// stencil start passes the request's Accept-Language, lowercased; the gates send en-CA.
const ACCEPT_LANGUAGE = 'en-ca';
const WIDGET_ENGINE = 'handlebars-v4';
const FRONT_MATTER = /^---\r?\n[\S\s]*?\r?\n---\r?\n/;

const relative = file => path.relative(THEME_DIR, file) || '.';

export function readFixture(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`can't read the fixture ${relative(file)}: ${error.message}`);
    }
}

// config.json with the variation's settings over the base settings, and the CSS defaults
// stencil-cli's lib/theme-config.js getConfig() sets, so the same object can compile theme.css.
export function themeConfig(variation = DEFAULT_VARIATION, themeDir = THEME_DIR) {
    const file = path.join(themeDir, 'config.json');
    const config = readFixture(file);
    const variations = config.variations || [];
    const variationIndex = variations.findIndex(({ name }) => name === variation);
    if (variationIndex === -1) {
        throw new Error(`the variation "${variation}" isn't in ${relative(file)} (${variations.map(({ name }) => name).join(', ')})`);
    }
    return {
        ...config,
        settings: lodash.defaultsDeep(lodash.cloneDeep(variations[variationIndex].settings || {}), config.settings || {}),
        variationName: variation,
        variationIndex,
        css_compiler: config.css_compiler || 'scss',
        autoprefixer_cascade: config.autoprefixer_cascade ?? true,
        autoprefixer_browsers: config.autoprefixer_browsers || ['> 1%', 'last 2 versions', 'Firefox ESR'],
    };
}

const translationsCache = new Map();
function translations(themeDir) {
    if (!translationsCache.has(themeDir)) {
        const dir = path.join(themeDir, 'lang');
        const files = fs.readdirSync(dir).filter(name => name.endsWith('.json'));
        translationsCache.set(themeDir, Object.fromEntries(files.map(name => [path.basename(name, '.json').toLowerCase(), readFixture(path.join(dir, name))])));
    }
    return translationsCache.get(themeDir);
}

const unquote = name => name.replace(/^(["'])(.*)\1$/, '$2');

function readTemplate(name, folders) {
    for (const folder of folders) {
        const file = path.join(folder, `${name}.html`);
        if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8');
    }
    return undefined;
}

// The templates a template includes, by stencil-cli's patterns: {{> name}} partials, and every
// file in a {{dynamicComponent 'folder'}} folder.
function includedTemplates(source, folders) {
    const names = [...source.matchAll(new RegExp(templateAssembler.partialRegex.source, 'g'))]
        .map(([, name]) => unquote(name))
        .filter(name => name !== '@partial-block');
    for (const [, folder] of source.matchAll(new RegExp(templateAssembler.dynamicComponentRegex.source, 'g'))) {
        for (const root of folders) {
            const dir = path.join(root, folder);
            if (fs.existsSync(dir)) names.push(...fs.readdirSync(dir).map(file => `${folder}/${path.parse(file).name}`));
        }
    }
    return names;
}

// The template and everything it includes, each from the first folder that has it. A name in
// `overrides` uses that source instead (the widget page's stand-in for layout/base).
function collectTemplates(top, folders, overrides) {
    const templates = {};
    const missing = new Set();
    const queue = [top];
    while (queue.length) {
        const name = queue.shift();
        if (!(name in templates) && !missing.has(name)) {
            const source = overrides[name] ?? readTemplate(name, folders);
            if (source === undefined) {
                missing.add(name);
            } else {
                // stencil-cli strips the front matter of the page template only.
                templates[name] = name === top ? source.replace(FRONT_MATTER, '') : source;
                queue.push(...includedTemplates(source, folders));
            }
        }
    }
    if (missing.size) {
        throw new Error(`template${missing.size > 1 ? 's' : ''} not found: ${[...missing].join(', ')} (looked in ${folders.map(relative).join(', ')})`);
    }
    return templates;
}

// Fails a call to a helper the store doesn't have, as stock Handlebars does: one with
// arguments, or with hash arguments only ({{regoin name="…"}}). A plain {{name}} that matches
// nothing still renders empty: that is a missing value, not a helper.
function failOnUnknownHelpers(paper) {
    paper.getRenderer().handlebars.registerHelper('helperMissing', (...args) => {
        const options = args[args.length - 1];
        if (args.length === 1 && !Object.keys(options.hash || {}).length) return undefined;
        throw new Error(`{{${options.name}}} isn't a helper the store has (stencil-paper-handlebars ${HELPERS_VERSION}), so the store would render it as nothing`);
    });
}

// The helpers that read the theme's page context: its lang strings, the page's jsContext and
// its regions. A widget template doesn't get that context, so in strict mode a widget that
// calls one fails, instead of rendering nothing (lang) or this renderer's own jsContext.
const PAGE_CONTEXT_HELPERS = ['lang', 'langJson', 'inject', 'jsContext', 'region'];

function failOnPageContextHelpers(paper) {
    const { handlebars } = paper.getRenderer();
    for (const name of PAGE_CONTEXT_HELPERS) {
        handlebars.registerHelper(name, () => {
            throw new Error(`{{${name}}} reads the theme's page context (lang strings, jsContext, regions), which a widget template doesn't get: put the widget's text in its widget_configuration`);
        });
    }
}

// paper-handlebars rejects with "<message> : <stack>"; keep the message and say what failed.
function renderFailure(what, error) {
    const message = error.message.replace(/ : \w*Error: [\s\S]*$/, '').split('\n')[0];
    return new Error(`rendering ${what}: ${message}`);
}

const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// Renders a theme template (a partial such as components/reelflies/listing-header, or a page
// template) with `context` as its store data.
//
// options:
//   variation   the config.json variation for theme_settings (default "ReelFlies CA")
//   templates   folders searched before the theme's templates/ (fixture or example partials)
//   regions     region name -> HTML, for {{{region name="…"}}}
//   strict      false renders an unknown helper as nothing, as the store does (default true)
//   themeDir    the theme to render (default this repo)
//   overrides   template name -> source, used instead of any file
//
// A fixture's `theme_settings` are laid over the variation's, key by key, so one render can
// switch a setting on or off. Its `settings` (the store's site settings) are laid over the
// ones stencil start sets.
export async function renderPartial(name, context = {}, options = {}) {
    const {
        variation = DEFAULT_VARIATION, templates = [], regions = {}, strict = true, themeDir = THEME_DIR, overrides = {},
    } = options;
    const config = themeConfig(variation, themeDir);
    const themeSettings = { ...config.settings, ...context.theme_settings };
    const settings = {
        cdn_url: '',
        theme_version_id: uuid(1),
        theme_config_id: uuid(config.variationIndex + 1),
        theme_session_id: null,
        ...context.settings,
    };
    const folders = [...templates.map(folder => path.resolve(folder)), path.join(themeDir, 'templates')];
    const paper = new Paper(settings, themeSettings, {
        getTemplates: async (top, preprocess) => preprocess(collectTemplates(top, folders, overrides)),
        getTranslations: async () => translations(themeDir),
    }, (config.template_engine || 'handlebars_v3').replace('_', '-')); // stencil-cli's default is v3
    if (strict) failOnUnknownHelpers(paper);
    paper.setContent(regions);
    try {
        await paper.loadTheme(name, ACCEPT_LANGUAGE);
        return await paper.render(name, {
            ...context,
            theme_settings: themeSettings,
            template_engine: config.template_engine,
            settings,
            in_development: true,
            in_production: false,
        });
    } catch (error) {
        throw renderFailure(`${name} (or a partial it includes)`, error);
    }
}

function sharedWidgetPartials(root) {
    const dir = path.join(root, '_shared');
    if (!fs.existsSync(dir)) return {};
    return Object.fromEntries(fs.readdirSync(dir).filter(file => file.endsWith('.html'))
        .map(file => [`_shared/${path.basename(file, '.html')}`, fs.readFileSync(path.join(dir, file), 'utf8')]));
}

// Renders widgets/<widget>/template.html with a fixture's `configuration` (the widget's
// widget_configuration) and `data` (the storefront_api_query result). Returns the template's
// output, without the wrapper the store adds around it (widget-page.mjs adds that).
//
// options: root (the widgets folder, default widgets/), strict (as for renderPartial; it also
// fails lang, langJson, inject, jsContext and region, which need the theme's page context)
export async function renderWidget(widget, fixture = {}, options = {}) {
    const { root = WIDGETS_DIR, strict = true } = options;
    const file = path.join(root, widget, 'template.html');
    if (!fs.existsSync(file)) throw new Error(`${relative(file)} doesn't exist: a widget's template is widgets/<name>/template.html`);
    const paper = new Paper(WIDGET_SITE_SETTINGS, {}, null, WIDGET_ENGINE);
    if (strict) {
        failOnUnknownHelpers(paper);
        failOnPageContextHelpers(paper);
    }
    paper.addTemplates(paper.getPreProcessor()(sharedWidgetPartials(root)));
    try {
        return await paper.renderString(fs.readFileSync(file, 'utf8'), {
            ...fixture.configuration,
            _: { id: WIDGET_ID, data: fixture.data },
        });
    } catch (error) {
        throw renderFailure(relative(file), error);
    }
}

function widgetCase(root, widget, file) {
    const fixture = readFixture(file);
    const shot = fixture.shot !== false;
    if (shot && (typeof fixture.page !== 'string' || typeof fixture.region !== 'string')) {
        throw new Error(`${relative(file)}: a fixture with an element shot names the "page" template and the "region" its widget sits in, for example "pages/home" and "home_below_menu"; a fixture for render tests only sets "shot": false`);
    }
    return {
        widget, name: path.basename(file, '.json'), root, file, shot, fixture,
    };
}

// Every widgets/<name>/fixtures/<case>.json under each root, sorted by widget and case. A
// folder whose name starts with "_" (widgets/_shared/) isn't a widget.
export function widgetCases(roots = [WIDGETS_DIR]) {
    const sorted = names => [...names].sort();
    return roots.flatMap(root => {
        if (!fs.existsSync(root)) return [];
        const widgets = fs.readdirSync(root, { withFileTypes: true })
            .filter(entry => entry.isDirectory() && !entry.name.startsWith('_'))
            .map(entry => entry.name);
        return sorted(widgets).flatMap(widget => {
            const dir = path.join(root, widget, 'fixtures');
            if (!fs.existsSync(dir)) return [];
            return sorted(fs.readdirSync(dir).filter(file => file.endsWith('.json')))
                .map(file => widgetCase(root, widget, path.join(dir, file)));
        });
    });
}
