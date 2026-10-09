// The widget sync's side of the repo (ticket 46): what each widget in widgets/<name>/ should be
// on a channel. scripts/widgets-sync.mjs compares it with the channel's snapshot.
//
//   import { entriesFor, readWidget, readChannelFile } from './widgets/source.mjs';
//   const entries = entriesFor(1895766);                 // every widget with channels/1895766.json
//
// A widget's folder (scripts/qa/README.md, "Widgets"):
//
//   widgets/<name>/template.html          the template, uploaded as widget template rf-<name>, with
//                                         each comment emptied and _shared partials pasted
//   widgets/<name>/schema.json            its Page Builder schema (an array of tabs)
//   widgets/<name>/query.graphql          optional: its storefront_api_query
//   widgets/<name>/channels/<id>.json     the widget on one channel: its widget_configuration,
//                                         its placement, and the uuids the store gave it
//   widgets/<name>/fixtures/              the fixture renders and element shots (W0-9); never synced
//   widgets/_shared/<partial>.html        markup two widgets share, pasted in before upload (paste.mjs)
//
// A channel file:
//
//   { "channel_id": 1895766,
//     "configuration": { … every schema setting's value on that channel … },
//     "placement": { "template_file": "pages/home", "region": "home_below_menu", "sort_order": 0, "status": "inactive" },
//     "uuids": { "template": null, "widget": null, "placement": null } }
//
// The uuids are null until the store creates the objects; `widgets-sync.mjs --record` fills
// them in from the channel's snapshot, and the PR that follows the apply commits them.
//
// A widget on several pages names `template_files` instead of `template_file`, and records one
// placement uuid per template file in `uuids.placements` (ticket 27's strip: the store shows a
// global region's placement on its own template file's page only, docs/widgets.md):
//
//     "placement": { "template_files": ["pages/home", "pages/cart"], "region": "header_bottom--global", … },
//     "uuids": { "template": null, "widget": null, "placements": { "pages/home": null, "pages/cart": null } }
//
// A template file left out of `uuids.placements` reads as null. placementsOf(channelFile) gives
// either shape as one list of placements, each with its uuid.

import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { channelsNamed } from '../store/channel.mjs';
import { parseForStore, pasteShared } from './paste.mjs';

const require = createRequire(import.meta.url);
// Handlebars 4's parser, for parseWithoutProcessing, which finds each comment where it is
// written (Handlebars 3 has no such parse). Its comments lex as Handlebars 3's do.
const Handlebars = require('@bigcommerce/handlebars-v4'); // eslint-disable-line import/no-extraneous-dependencies

export const WIDGETS_DIR = fileURLToPath(new URL('../../widgets/', import.meta.url)).replace(/\/$/, '');
// The channels a sync may target. Ticket 53 adds channel 1 (Option A), whose writes are Shaun's,
// through its own guarded path; the store-write helper refuses every channel but 1895766 anyway.
export const SYNC_CHANNELS = [1895766];
export const PLACEMENT_STATUSES = ['active', 'inactive'];

const NAME = /^[a-z0-9][a-z0-9-]*$/;
// A Widgets API template_file: pages/<name>, pages/custom/<kind>/<file> and so on.
const TEMPLATE_FILE = /^pages\/[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const show = value => JSON.stringify(value);

function readJson(file, what) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (error) {
        throw new Error(`${what} can't be read (${error.code || error.message})`);
    }
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`${what} isn't JSON`);
    }
}

const relative = (root, file) => path.join('widgets', path.relative(root, file));

// Handlebars' lexer breaks lines at \r\n, \r and \n, and counts its columns from there.
const LINE_BREAK = /\r\n?|\n/g;
// A comment token's text, as Handlebars' parser takes it from {{!-- … --}} or {{! … }}.
const commentText = token => token.replace(/^\{\{~?!-?-?/, '').replace(/-?-?~?\}\}$/, '');

// Each Handlebars comment in a template, {{!-- … --}} or {{! … }}, as Handlebars' own parser finds
// it (so an escaped \{{! … }} or a "{{! … }}" in a string isn't one): its offsets and ~ flags.
// Throws when the parser places a comment where it isn't: its lexer counts a column short after a
// U+2028 or U+2029 in a token that spans lines.
function commentSpans(source) {
    const lineStarts = [0, ...[...source.matchAll(LINE_BREAK)].map(found => found.index + found[0].length)];
    const offset = ({ line, column }) => lineStarts[line - 1] + column;
    const spans = [];
    const walk = node => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!isObject(node)) return;
        if (node.type === 'CommentStatement') {
            const span = { start: offset(node.loc.start), end: offset(node.loc.end), strip: node.strip };
            const token = source.slice(span.start, span.end);
            if (!/^\{\{~?![\s\S]*\}\}$/.test(token) || commentText(token) !== node.value) {
                throw new Error(`Handlebars places a comment at line ${node.loc.start.line}, column ${node.loc.start.column} where it isn't, so its comments can't be emptied. A U+2028 or U+2029 character upsets its count of lines: replace it with a space or a line break`);
            }
            spans.push(span);
            return;
        }
        Object.entries(node).forEach(([key, value]) => {
            if (key !== 'loc') walk(value);
        });
    };
    walk(Handlebars.parseWithoutProcessing(source));
    return spans;
}

// A template's parse tree without its places or its comments' text: what Handlebars renders from.
const parsedShape = source => JSON.stringify(Handlebars.parseWithoutProcessing(source), function shape(key, value) {
    if (key === 'loc') return undefined;
    return key === 'value' && this.type === 'CommentStatement' ? '' : value;
});

// The template with each comment emptied to {{!}}, keeping its ~ flags ({{~!}}, {{!~}}, {{~!~}}).
// Only the comments' text changes, which it checks by parsing the result again, so the copy
// renders as the file does, whitespace and standalone lines included.
// The store most likely reads the text inside comments when it checks a template's HTML: it
// refused the hero's first upload, whose comment names <width>, <path> and <channel>, as "not
// valid HTML" (2026-10-07).
export function emptyComments(source) {
    const emptied = commentSpans(source)
        .sort((a, b) => b.start - a.start)
        .reduce((text, { start, end, strip }) => `${text.slice(0, start)}{{${strip.open ? '~' : ''}!${strip.close ? '~' : ''}}}${text.slice(end)}`, source);
    if (parsedShape(emptied) !== parsedShape(source)) throw new Error('emptying its comments would change more than their text, so it isn\'t uploaded');
    return emptied;
}

// make(), with any error it throws prefixed by `where`.
const naming = (where, make) => {
    try {
        return make();
    } catch (error) {
        throw new Error(`${where}: ${error.message}`);
    }
};

// The ids a widget_configuration holds: every setting's, in tabs, sections, hidden groups and
// conditional settings. An array setting holds its items under its own id. readWidget refuses
// "_": the store adds "_": { "id": <the widget's uuid> } to each widget_configuration, and a template
// reads the widget's id and query result as _.id and _.data, so a setting can't have it.
const settingIds = schema => {
    const ids = [];
    const walk = node => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!isObject(node)) return;
        if (typeof node.id === 'string' && node.type && node.type !== 'tab') ids.push(node.id);
        if (node.type === 'array') return;
        ['sections', 'settings', 'typeMeta', 'conditionalSettings'].forEach(key => walk(node[key]));
    };
    walk(schema);
    return ids;
};

// A widget as the store should hold it: its template (each comment emptied and _shared partials
// pasted in), schema and query, and the names its template and widget take on every channel.
export function readWidget(name, { root = WIDGETS_DIR } = {}) {
    if (!NAME.test(name)) throw new Error(`"${name}" isn't a widget name: a folder in widgets/ (lower-case letters, digits and -)`);
    const dir = path.join(root, name);
    const templateFile = path.join(dir, 'template.html');
    if (!fs.existsSync(templateFile)) throw new Error(`${relative(root, templateFile)} doesn't exist: a widget's template is widgets/<name>/template.html`);
    const schema = readJson(path.join(dir, 'schema.json'), `${relative(root, path.join(dir, 'schema.json'))}`);
    if (!Array.isArray(schema)) throw new Error(`${relative(root, path.join(dir, 'schema.json'))} must be a JSON array of tabs (the Page Builder schema)`);
    const settings = settingIds(schema);
    if (settings.includes('_')) throw new Error(`${relative(root, path.join(dir, 'schema.json'))}: the setting id "_" is the store's own key (it gives each widget "_": { "id": <uuid> }, and a template reads _.id and _.data): name the setting anything else`);
    const queryFile = path.join(dir, 'query.graphql');
    // Handlebars 3, the store's engine, must parse the file as written, so an error carries its
    // own line numbers. Then its comments are emptied, and each _shared partial it calls is pasted
    // in (an error in a partial names the partial's file and lines).
    const where = relative(root, templateFile);
    const source = fs.readFileSync(templateFile, 'utf8');
    naming(where, () => parseForStore(source));
    const own = naming(where, () => emptyComments(source));
    const template = naming(where, () => pasteShared(own, { root }));
    return {
        name,
        dir,
        root,
        templateName: `rf-${name}`,
        widgetName: `rf-${name}`,
        template,
        schema,
        settings,
        query: fs.existsSync(queryFile) ? fs.readFileSync(queryFile, 'utf8').trim() : '',
    };
}

// The widget on one channel, checked, or null when the widget has no file for it.
export function readChannelFile(widget, channel) {
    const file = path.join(widget.dir, 'channels', `${channel}.json`);
    if (!fs.existsSync(file)) return null;
    const where = relative(widget.root, file);
    const data = readJson(file, where);
    const problems = [];
    if (!isObject(data)) throw new Error(`${where} must be a JSON object`);
    if (data.channel_id !== channel) problems.push(`channel_id ${show(data.channel_id)} isn't the file's own channel ${channel}`);
    const { configuration, placement, uuids } = data;
    if (!isObject(configuration)) {
        problems.push('configuration must be an object: the widget_configuration');
    } else {
        Object.keys(configuration).filter(key => !widget.settings.includes(key)).forEach(key => problems.push(`configuration sets "${key}", which the schema doesn't have`));
        widget.settings.filter(key => !(key in configuration)).forEach(key => problems.push(`configuration doesn't set "${key}", a schema setting`));
        [...new Set(channelsNamed(configuration).map(show))].forEach(value => problems.push(`configuration names channel ${value}: the channel is the file's channel_id alone`));
    }
    const several = isObject(placement) && 'template_files' in placement;
    if (!isObject(placement)) {
        problems.push('placement must be an object');
    } else {
        if (several) {
            const files = placement.template_files;
            if ('template_file' in placement) problems.push('placement names template_file or template_files, not both');
            if (!Array.isArray(files) || !files.length) {
                problems.push('placement template_files lists no template file: name one or more, such as "pages/cart"');
            } else {
                files.filter(name => typeof name !== 'string' || !TEMPLATE_FILE.test(name)).forEach(name => problems.push(`placement template_files has ${show(name)}, which isn't a template file such as "pages/cart"`));
                [...new Set(files.filter((name, index) => files.indexOf(name) !== index))].forEach(name => problems.push(`placement template_files lists ${name} twice`));
            }
        } else if (typeof placement.template_file !== 'string' || !placement.template_file) {
            problems.push('placement needs a template_file, such as "pages/home"');
        } else if (!TEMPLATE_FILE.test(placement.template_file)) {
            problems.push(`placement template_file ${show(placement.template_file)} isn't a template file such as "pages/home"`);
        }
        if (typeof placement.region !== 'string' || !placement.region) problems.push('placement needs a region, such as "home_below_menu"');
        if (!Number.isInteger(placement.sort_order)) problems.push('placement sort_order must be a whole number');
        if (!PLACEMENT_STATUSES.includes(placement.status)) problems.push('placement status must be "active" or "inactive"');
        const unknown = Object.keys(placement).filter(key => !['template_file', 'template_files', 'region', 'sort_order', 'status'].includes(key));
        unknown.forEach(key => problems.push(`placement has "${key}": a placement here is template_file (or template_files), region, sort_order and status`));
    }
    const placementKey = several ? 'placements' : 'placement';
    if (!isObject(uuids) || !['template', 'widget'].every(key => key in uuids)) {
        problems.push(`uuids needs template, widget and ${placementKey} (each null until the store makes it)`);
    } else if (several && !isObject(uuids.placements)) {
        problems.push('uuids needs placements, a uuid or null per template file, with template_files');
    } else if (!several && !('placement' in uuids)) {
        problems.push(`uuids needs ${'placements' in uuids ? 'placement, not placements, with one template_file' : 'template, widget and placement (each null until the store makes it)'}`);
    } else {
        for (const key of ['template', 'widget', ...(several ? [] : ['placement'])]) {
            if (uuids[key] !== null && !UUID.test(String(uuids[key]))) problems.push(`uuids.${key} must be null or a uuid`);
        }
        if (several) {
            const listed = Array.isArray(placement.template_files) ? placement.template_files : [];
            for (const [name, uuid] of Object.entries(uuids.placements)) {
                if (!listed.includes(name)) problems.push(`uuids.placements records ${name}, which template_files doesn't list: the sync never deletes a placement, so delete it in the control panel (the store-write helper can't), then remove its uuid here`);
                else if (uuid !== null && !UUID.test(String(uuid))) problems.push(`uuids.placements[${show(name)}] must be null or a uuid`);
            }
        }
        const unknownUuids = Object.keys(uuids).filter(key => !['template', 'widget', placementKey].includes(key));
        unknownUuids.forEach(key => problems.push(`uuids has "${key}": they are template, widget and ${placementKey}`));
    }
    const unknown = Object.keys(data).filter(key => !['channel_id', 'configuration', 'placement', 'uuids'].includes(key));
    unknown.forEach(key => problems.push(`"${key}" isn't a channel file key (channel_id, configuration, placement, uuids)`));
    if (problems.length) throw new Error(problems.map(problem => `${where}: ${problem}`).join('\n'));
    return {
        file, where, channel, configuration, placement, uuids,
    };
}

// The channel file's placements as one list, one per template file, each with its recorded uuid
// (null until the store makes it).
export function placementsOf({ placement, uuids }) {
    const { template_file: one, template_files: files, ...rest } = placement;
    if (!files) return [{ template_file: one, ...rest, uuid: uuids.placement }];
    return files.map(file => ({ template_file: file, ...rest, uuid: uuids.placements[file] ?? null }));
}

// Every widget with a file for the channel, by name, or the named ones only.
export function entriesFor(channel, { root = WIDGETS_DIR, names = [] } = {}) {
    const all = fs.existsSync(root)
        ? fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory() && !entry.name.startsWith('_')).map(entry => entry.name).sort()
        : [];
    const missing = names.filter(name => !all.includes(name));
    if (missing.length) throw new Error(`no widget ${missing.join(', ')} in widgets/`);
    return (names.length ? names : all).flatMap(name => {
        const widget = readWidget(name, { root });
        const channelFile = readChannelFile(widget, channel);
        if (!channelFile && names.includes(name)) throw new Error(`${name} has no channels/${channel}.json: it isn't synced to channel ${channel}`);
        return channelFile ? [{ widget, channelFile }] : [];
    });
}

// Rewrites the channel file with `change(data)`'s result, keeping its key order and 4 spaces.
function rewrite(channelFile, change) {
    const data = change(JSON.parse(fs.readFileSync(channelFile.file, 'utf8')));
    fs.writeFileSync(channelFile.file, `${JSON.stringify(data, null, 4)}\n`);
}

// Writes the uuids the store gave the widget's objects into its channel file: `placement`, or
// `placements` by template file in template_files' order.
export function writeUuids(channelFile, uuids) {
    rewrite(channelFile, data => {
        const files = data.placement.template_files;
        const placementUuids = files
            ? { placements: Object.fromEntries(files.map(file => [file, uuids.placements?.[file] ?? null])) }
            : { placement: uuids.placement };
        return { ...data, uuids: { template: uuids.template, widget: uuids.widget, ...placementUuids } };
    });
}

// Sets the placement's status in the channel file: "inactive" unpublishes the widget (R12).
export function setPlacementStatus(channelFile, status) {
    if (!PLACEMENT_STATUSES.includes(status)) throw new Error(`a placement status is "active" or "inactive", not ${show(status)}`);
    rewrite(channelFile, data => ({ ...data, placement: { ...data.placement, status } }));
}
