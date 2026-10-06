#!/usr/bin/env node
// Custom layouts for local renders (W0-8). On the store, a custom template
// (templates/pages/custom/<type>/<file>, such as ticket 32's rf-noindex.html, 34's Species hub
// or 35's hook chart page) is chosen by a template association in the control panel, which
// belongs to the uploaded theme. stencil start knows nothing of those: it renders a custom
// template for a URL only when config.stencil.json's customLayouts maps the file to that URL
// (stencil-cli's renderer.module.js, getTemplatePath).
//
// So the mappings the gates need are committed in scripts/qa/custom-layouts.json, by page type:
//
//   { "category": { "rf-noindex.html": "/flies/realistic-trout-flies/realistic-nymphs/" },
//     "page": { "hook-size-chart.html": ["/fly-hook-size-chart/"] }, "brand": {}, "product": {} }
//
// and every stencil start the gates, serve.mjs and the overlays make runs this first, in the
// folder it starts in (startCommand in storefront.mjs):
//
//   node scripts/qa/custom-layouts.mjs
//
// It merges the committed mappings into that folder's config.stencil.json, the run's copy:
// - The committed mappings come first, so they win: stencil-cli takes the first file that maps
//   a URL. A mapping made by hand is kept after them and named in a WARNING line, because no
//   other checkout renders with it; one for a URL the committed file maps is dropped.
// - A config.stencil.json that is a link (a worktree's, to the main clone's) is replaced by a
//   copy before it changes, so the file it points at never changes through it. Nothing is
//   written when it already has the mappings.
// - A problem in the committed file stops the start, before anything is written: a page type
//   stencil-cli has no custom templates for, a template that doesn't exist, a URL that isn't a
//   path, or one URL mapped to two files.
//
// stencil start reads config.stencil.json once, when it starts, so a server already running
// keeps the mappings it started with: stop it after changing custom-layouts.json.

import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';

export const CUSTOM_LAYOUTS_FILE = path.join('scripts', 'qa', 'custom-layouts.json');
// stencil-cli's validCustomTemplatePageTypes.
export const PAGE_TYPES = ['brand', 'category', 'page', 'product'];
const TEMPLATE_FILE = /^[a-z0-9][a-z0-9_-]*\.html$/;
const SHOWN_FILE = CUSTOM_LAYOUTS_FILE.split(path.sep).join('/');

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const urlsOf = urls => (Array.isArray(urls) ? urls : [urls]);
// stencil-cli compares paths without a trailing slash.
const bare = url => String(url).replace(/\/$/, '');

export function readCustomLayouts(dir) {
    const file = path.join(dir, CUSTOM_LAYOUTS_FILE);
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${SHOWN_FILE} can't be read: ${error.message}`);
    }
}

// Every problem with the committed `layouts`, whose templates are looked for in `dir`.
export function customLayoutProblems(layouts, { dir }) {
    if (!isPlainObject(layouts)) return [`${SHOWN_FILE} must be an object of page types`];
    return Object.entries(layouts).flatMap(([type, files]) => {
        if (!PAGE_TYPES.includes(type)) return [`"${type}" isn't a page type stencil-cli renders custom templates for (${PAGE_TYPES.join(', ')})`];
        if (!isPlainObject(files)) return [`${type} must map template files to URLs`];
        const seen = new Map();
        return Object.entries(files).flatMap(([file, urls]) => {
            if (!TEMPLATE_FILE.test(file)) return [`${type} "${file}" isn't a template file name in templates/pages/custom/${type}/ (lower-case, ending .html)`];
            const problems = [];
            if (!fs.existsSync(path.join(dir, 'templates', 'pages', 'custom', type, file))) problems.push(`templates/pages/custom/${type}/${file} doesn't exist`);
            const list = urlsOf(urls);
            if (!list.length) problems.push(`${type} ${file} maps no URL`);
            for (const url of list) {
                if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) {
                    problems.push(`${type} ${file}: "${url}" isn't a path on the store, such as /flies/`);
                } else if (seen.has(bare(url))) {
                    problems.push(`${type}: ${url} is mapped to both ${seen.get(bare(url))} and ${file}`);
                } else {
                    seen.set(bare(url), file);
                }
            }
            return problems;
        });
    });
}

// config.stencil.json's customLayouts with the committed ones merged in, committed first, and
// the hand mappings kept after them (localOnly). A hand mapping's URLs that the committed file
// maps for the same type are dropped, and a mapping left with none is dropped.
export function mergeCustomLayouts(local = {}, committed = {}) {
    const customLayouts = {};
    const localOnly = [];
    const types = [...new Set([...PAGE_TYPES, ...Object.keys(local || {}), ...Object.keys(committed)])];
    for (const type of types) {
        const ours = committed[type] || {};
        const taken = new Set(Object.values(ours).flatMap(urlsOf).map(bare));
        const merged = { ...ours };
        for (const [file, urls] of Object.entries((local || {})[type] || {})) {
            if (!(file in ours)) {
                const left = urlsOf(urls).filter(url => !taken.has(bare(url)));
                if (left.length) {
                    const kept = Array.isArray(urls) ? left : left[0];
                    merged[file] = kept;
                    localOnly.push({ type, file, urls: kept });
                }
            }
        }
        customLayouts[type] = merged;
    }
    return { customLayouts, localOnly };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Merges the committed custom layouts into `dir`'s config.stencil.json (see the top of this
// file). Resolves to { written, copied }. Throws on a problem, before writing anything.
export function prepareStencilConfig({ dir = process.cwd(), log = console.log } = {}) {
    const layouts = readCustomLayouts(dir);
    const problems = customLayoutProblems(layouts, { dir });
    if (problems.length) throw new Error(`${SHOWN_FILE}: ${problems.join('; ')}`);

    const file = path.join(dir, 'config.stencil.json');
    if (!fs.existsSync(file)) throw new Error(`${dir} has no config.stencil.json: \`npx stencil init\` makes it in the main clone, and a worktree links or copies it`);
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const { customLayouts, localOnly } = mergeCustomLayouts(config.customLayouts, layouts);
    for (const { type, file: template, urls } of localOnly) {
        log(`WARNING  config.stencil.json maps ${type} ${template} (${urlsOf(urls).join(', ')}), which ${SHOWN_FILE} doesn't: this run renders with it, and no other checkout does. Add it to ${SHOWN_FILE}, or delete it.`);
    }
    if (same(customLayouts, config.customLayouts)) return { written: false, copied: false };

    const link = fs.lstatSync(file).isSymbolicLink() ? fs.readlinkSync(file) : null;
    // Written whole and renamed into place, which also replaces a link with a file, so the
    // file a link points at never changes.
    const temporary = path.join(dir, `.config.stencil.json.${process.pid}.tmp`);
    fs.writeFileSync(temporary, `${JSON.stringify({ ...config, customLayouts }, null, 2)}\n`);
    fs.renameSync(temporary, file);
    if (link) log(`COPY     config.stencil.json was a link to ${path.resolve(dir, link)}; ${dir} now has its own copy, so that file stays as it was`);
    const count = Object.values(layouts).reduce((total, files) => total + Object.keys(files).length, 0);
    log(`LAYOUTS  ${count} custom layout${count === 1 ? '' : 's'} from ${SHOWN_FILE} in ${file}`);
    return { written: true, copied: Boolean(link) };
}

if (isMain(import.meta.url)) {
    try {
        prepareStencilConfig();
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exit(1);
    }
}
