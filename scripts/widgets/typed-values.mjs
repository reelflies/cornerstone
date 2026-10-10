// The typed-value lint for widgets that show products (ticket 48; HOME-4): no widget setting may
// hold a price, a count or a product's name, because the widget's storefront query gives them
// live. A product is held as its id alone, in a productId setting.
//
//   import { typedValuesIn } from './widgets/typed-values.mjs';
//   typedValuesIn('best-sellers');   // [] or one line per typed value, naming the file and setting
//
// It reads every value the widget could carry to the store: each channel file's configuration,
// the schema's defaults (what Page Builder fills in), and every fixture's configuration.
//
// - A price: a currency sign before a digit, or a number with two decimals ("1.95").
// - A count: any digit in a setting that isn't a product id or a link. HOME-4's own example is
//   "Shop signature flies", never "Shop 355". A link (a path from "/", or an http(s) URL, with no
//   space) may carry digits, as ticket 36's canonical /reelflies-2/ does, but is still checked for
//   a price and a name. A widget whose other settings carry digits (ticket 47's photo paths after
//   the size segment) isn't one of these bands, so the lint covers the bands it lists
//   (PRODUCT_BANDS): ticket 48's two and ticket 49's Assortments band.
// - A product name: a name from the widgets' own query fixtures, in any case. The store's
//   catalogue isn't in the repo, and the fixtures hold every product a band picks.
// - A productId setting holding anything but an id.

import fs from 'fs';
import path from 'path';
import { WIDGETS_DIR, readChannelFile, readWidget } from './source.mjs';

export const PRODUCT_BANDS = ['best-sellers', 'signature-band', 'assortments-band'];

const PRICE = /[$€£]\s*\d|\b\d+[.,]\d{2}\b/;
const DIGIT = /\d/;
const ID = /^[1-9]\d*$/;
const LINK = /^(?:\/(?!\s)|https?:\/\/)\S*$/;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const relative = (root, file) => path.relative(path.dirname(root), file);

// Every setting in a schema, by id, with its type and default.
function schemaSettings(schema) {
    const settings = new Map();
    const walk = node => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!isObject(node)) return undefined;
        if (typeof node.id === 'string' && node.type && !['tab', 'graphQl'].includes(node.type)) settings.set(node.id, node);
        return ['sections', 'settings', 'conditionalSettings'].forEach(key => walk(node[key]));
    };
    walk(schema);
    return settings;
}

// The product names in every fixture's query result under the widgets folder (a node with an
// entityId and a name), longest first, so a longer name is named before one it holds.
export function productNames({ root = WIDGETS_DIR } = {}) {
    const names = new Set();
    const walk = node => {
        if (Array.isArray(node)) return node.forEach(walk);
        if (!isObject(node)) return undefined;
        if ('entityId' in node && typeof node.name === 'string') names.add(node.name);
        return Object.values(node).forEach(walk);
    };
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const dir = path.join(root, entry.name, 'fixtures');
        if (entry.isDirectory() && fs.existsSync(dir)) {
            for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.json'))) walk(readJson(path.join(dir, file)).data);
        }
    }
    return [...names].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

// The typed values in one configuration, as lines naming `where` and the setting.
export function typedValues({
    schema, configuration, names, where,
}) {
    const settings = schemaSettings(schema);
    const lowered = names.map(name => [name, name.toLowerCase()]);
    return Object.entries(configuration).flatMap(([id, value]) => {
        const shown = `${id} ${JSON.stringify(String(value))}`;
        if (settings.get(id)?.type === 'productId') {
            return value === '' || ID.test(String(value)) ? [] : [`${where}: ${shown} isn't a product id: a product setting holds the id alone, and the query reads its name and price`];
        }
        if (typeof value !== 'string') return [];
        if (PRICE.test(value)) return [`${where}: ${shown} holds a price: prices come from the storefront query (HOME-4)`];
        if (DIGIT.test(value) && !LINK.test(value)) return [`${where}: ${shown} holds a number: counts come from the storefront query, and a label carries none (HOME-4)`];
        const named = lowered.find(([, name]) => value.toLowerCase().includes(name));
        return named ? [`${where}: ${shown} holds the product name "${named[0]}": names come from the storefront query (HOME-4)`] : [];
    });
}

// The typed values a widget could carry to the store: its channel files, its schema's defaults
// and its fixtures' configurations.
export function typedValuesIn(name, { root = WIDGETS_DIR } = {}) {
    const widget = readWidget(name, { root });
    const names = productNames({ root });
    const check = (configuration, file) => typedValues({
        schema: widget.schema, configuration, names, where: relative(root, file),
    });
    const defaults = Object.fromEntries([...schemaSettings(widget.schema)].map(([id, setting]) => [id, setting.default ?? '']));
    const channels = path.join(widget.dir, 'channels');
    const fixtures = path.join(widget.dir, 'fixtures');
    return [
        ...check(defaults, path.join(widget.dir, 'schema.json')),
        ...(fs.existsSync(channels) ? fs.readdirSync(channels) : []).filter(file => file.endsWith('.json'))
            .flatMap(file => check(readChannelFile(widget, Number(path.basename(file, '.json'))).configuration, path.join(channels, file))),
        ...(fs.existsSync(fixtures) ? fs.readdirSync(fixtures) : []).filter(file => file.endsWith('.json'))
            .flatMap(file => check(readJson(path.join(fixtures, file)).configuration || {}, path.join(fixtures, file))),
    ];
}
