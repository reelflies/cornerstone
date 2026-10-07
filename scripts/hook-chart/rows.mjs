#!/usr/bin/env node
// The hook size chart's size rows (ticket 35): a size × Fly Type table built from the
// catalogue, rendered as one anchored row per size from 6/0 to 24, and spliced into the chart's
// Web Page between two fixed markers. It reads saved API reads only: it sends nothing to the
// store and reads no token. The write is the store-write helper's (scripts/store/, W0-11):
// this writes the changes file for plan.mjs, then apply.mjs sends it.
//
//   node scripts/hook-chart/rows.mjs --products <page.json> --assignments <page.json> --tree <page.json>
//       prints the table, and what it left out
//   … --rows-out <rows.html>                                   also writes the rows block
//   … --existing <pages page.json> --changes <changes.json>    also writes the page update for plan.mjs
//
// The reads are saved one file per page, each exactly as the API answers it, with its "data"
// and "meta.pagination". Give each read's option once per page: every page from 1 to
// total_pages, each once, all from one read. A page left out or given twice, a file without its
// pagination, pages that don't add up to the read's total, or an item on two pages is refused,
// because each would change the table without a sign. That catches most changes to the store
// between pages, but not all: if one item is deleted and another added between two pages, the
// totals still match and an item can move past the page boundary unread. So the read step
// (below) is to read every page in one pass, then read page 1's total again at the end.
//
// - --products: GET /v3/catalog/products?include=variants. A product's sizes are the labels of
//   its variants' "Fly Sizes" option values, the facet the row links filter by.
//   A size counts only while a shopper can buy it, because the store hides the rest from the
//   filtered listing the row links open (probe 10, research/07-prelaunch-probes.md: every
//   channel inherits option_out_of_stock_behavior "label_option" and hide_in_product_filtering
//   true). A variant can be bought when purchasing_disabled is false and the product's
//   inventory_tracking is "none", or "product" with the product's inventory_level above 0, or
//   "variant" with that variant's inventory_level above 0. A size counts when any of its
//   variants can be bought, and a product out of stock in every size isn't counted. The links
//   this leaves out are listed on every run. The rows show the stock at the time of the run, so
//   they go stale as stock moves until the next run.
// - --assignments: GET /v3/catalog/products/channel-assignments?channel_id:in=1895766. A product
//   counts only when it is visible and assigned to ReelFlies_CA (1895766). Refactor 14 places
//   only Live products there (CONTEXT.md: a Live product is visible and assigned to ReelFlies,
//   channel 1), so these are the Live products placed on ReelFlies_CA.
// - --tree: GET /v3/catalog/trees/categories?tree_id:in=4 (ReelFlies_CA's tree), one tree only.
//   The Fly Types in rows.json are found at its top level, by id or by name. A hidden Fly Type
//   is refused. A hidden category, or one below a hidden category, is never linked and counts
//   no product: a shopper can't open it, and whether a Fly Type's page lists its products
//   wasn't probed. The products placed only there are reported.
// - --existing: GET /v3/content/pages?channel_id=1895766&include=body. The chart page is the
//   one at /fly-hook-size-chart/, and it must already hold the two markers. The update sends
//   every field the read gave back, with only the body changed (chartPageRequest).
//
// Roll-up: probe 8 found that a Fly Type's page lists its sub-types' products one level down;
// deeper levels weren't tested. Every rolled-up run lists the links that rely only on products
// two or more levels down, for the R1 rerun of probe 8 and criterion 3's spot check.
//
// No repo tool saves these reads yet, and they are never fetched by hand: no curl, and no
// store token read anywhere but scripts/lib/store-token.mjs. The first run waits on a read step
// built on scripts/store/client.mjs's read-only client (ticket 35's template PR, or ticket 18's
// scripts/catalogue/api-read.mjs if it then reads variants and tree 4), after refactors 13
// (tree 4's Fly Types) and 14 (the products placed on ReelFlies_CA).
//
// Options:
//   --no-rollup   link the categories that hold each size's products, not the six Fly Types
//                 (if a Fly Type page doesn't list its sub-types' products; probe 8 found that
//                 roots roll up one level, research/07-prelaunch-probes.md)
//   --min <n>     link a Fly Type only when at least n counted products come in that size (default 1)
//   --count-stock-outs   count a size whatever its stock, if the store stops hiding out-of-stock
//                 options from filtering (hide_in_product_filtering false, or backorders allowed)
//   --text-only   name the Fly Types without links (channel 1 until the Flip, ticket 53);
//                 only with --rows-out, because the store-write helper never writes channel 1.
//                 The rows are still ReelFlies_CA's: tree 4's Fly Types and what is placed on
//                 1895766, so they too wait for refactors 13 and 14. Rows from tree 1, where the
//                 Fly Types sit under Flies (398), and tree-1 facet links aren't supported.
//   --config <rows.json>   another copy and Fly Type list (default scripts/hook-chart/rows.json)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMain } from '../lib/is-main.mjs';
import { CHANNEL } from '../store/channel.mjs';
import {
    CHART_SIZES, CHART_URL, FACET_NAME, anchorId, facetParam, isChartSize, isHyphenAught, normalizeSize,
} from '../hook-gauge/sizes.mjs';

export { CHART_URL };
export const CONFIG_FILE = fileURLToPath(new URL('./rows.json', import.meta.url));
// Fixed markers around the rows in the page's body. Everything between them is rewritten on
// each run; everything outside them is Shaun's copy, and is never touched.
export const MARKERS = Object.freeze({
    start: '<!-- rf:hook-chart-rows start -->',
    end: '<!-- rf:hook-chart-rows end -->',
});
const NOTE = '<!-- Written by scripts/hook-chart/rows.mjs (ticket 35). Each run rewrites everything between these markers: change the rows\' copy in scripts/hook-chart/rows.json. -->';

const STATUSES = ['draft', 'approved'];
const TEXT_KEYS = ['size', 'uses', 'shop', 'none'];
const PLAIN_PATH = /^\/[^?#\s]*\/$/;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const andList = items => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
// Text and attribute values in the page body. Not gauge.mjs's escaper, which matches Handlebars
// and so also escapes "=": the row links must keep "_bc_fsnf=1" as it is in the raw HTML, where
// story 16's curl looks for it.
const escapeHtml = text => String(text).replace(/[&<>"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[character]));

export function listOf(read, what) {
    if (Array.isArray(read)) return read;
    if (isObject(read) && Array.isArray(read.data)) return read.data;
    throw new Error(`the ${what} read must be { "data": […] } or an array`);
}

const AGAIN = 'the store changed while it was read, or a page was given twice, so read every page again';
const isCount = value => Number.isInteger(value) && value >= 0;

// One paged read, from its pages as the API answered them: [{ file, read }], in any order. It
// returns { data } with every page's items in page order, and refuses anything that would leave
// an item out or count it twice.
export function joinPages(pages, what) {
    if (!pages.length) throw new Error(`no ${what} read`);
    const described = pages.map(({ file, read }) => {
        const pagination = isObject(read) && Array.isArray(read.data) && isObject(read.meta) ? read.meta.pagination : null;
        if (!isObject(pagination) || !Number.isInteger(pagination.current_page) || pagination.current_page < 1
            || !isCount(pagination.total_pages) || !isCount(pagination.total) || !isCount(pagination.count)) {
            throw new Error(`the ${what} read ${file} isn't a page as the API answers it: save each page with its "data" and "meta.pagination"`);
        }
        return {
            file, data: read.data, page: pagination.current_page, pages: pagination.total_pages, total: pagination.total, count: pagination.count,
        };
    });
    const [first] = described;
    const odd = described.find(({ pages: n, total }) => n !== first.pages || total !== first.total);
    if (odd) {
        const size = ({ file, pages: n, total }) => `${file} says ${n} pages and ${total} items`;
        throw new Error(`the ${what} read's pages come from different reads: ${size(first)}, ${size(odd)}`);
    }
    const last = Math.max(first.pages, 1);
    const byPage = new Map();
    for (const page of described) {
        if (page.page > last) throw new Error(`${page.file} is page ${page.page}, but the ${what} read has ${last} ${last === 1 ? 'page' : 'pages'}`);
        if (byPage.has(page.page)) throw new Error(`the ${what} read gives page ${page.page} twice (${byPage.get(page.page).file}, ${page.file}): give each page once`);
        if (page.data.length !== page.count) throw new Error(`page ${page.page} of the ${what} read (${page.file}) holds ${page.data.length} items but says it holds ${page.count}`);
        byPage.set(page.page, page);
    }
    const missing = Array.from({ length: last }, (_, index) => index + 1).filter(n => !byPage.has(n));
    if (missing.length) throw new Error(`the ${what} read has no page ${andList(missing)} of ${last}: give every page from 1 to ${last}, each once`);
    const data = Array.from({ length: last }, (_, index) => byPage.get(index + 1).data).flat();
    if (data.length !== first.total) throw new Error(`the ${what} read's pages hold ${data.length} items, but the read says ${first.total}: the store changed while it was read, so read every page again`);
    return { data };
}

// Throws when `key` was seen before, naming the thing and the read.
const onlyOnce = (seen, key, thing, what) => {
    if (seen.has(key)) throw new Error(`${thing} is in the ${what} read twice: ${AGAIN}`);
    seen.add(key);
};

// Everything wrong with rows.json, as sentences; empty when it can be used.
export function rowsConfigProblems(config) {
    const problems = [];
    if (!STATUSES.includes(config.status)) problems.push(`status must be ${STATUSES.join(' or ')}, not ${JSON.stringify(config.status)}`);
    const flyTypes = Array.isArray(config.flyTypes) ? config.flyTypes : [];
    if (!flyTypes.length) problems.push('flyTypes must list the Fly Types');
    const seen = new Set();
    for (const flyType of flyTypes) {
        if (!isObject(flyType) || !isText(flyType.name)) {
            problems.push('each Fly Type needs a name');
        } else {
            if (seen.has(flyType.name.toLowerCase())) problems.push(`the Fly Type "${flyType.name}" is listed twice`);
            seen.add(flyType.name.toLowerCase());
            if ('id' in flyType && !(Number.isInteger(flyType.id) && flyType.id > 0)) problems.push(`the Fly Type "${flyType.name}" has an id that isn't a category id`);
        }
    }
    for (const key of TEXT_KEYS) {
        if (!isObject(config.text) || !isText(config.text[key])) problems.push(`text.${key} must be a non-empty string`);
    }
    const covered = new Set();
    for (const use of Array.isArray(config.uses) ? config.uses : []) {
        if (!isText(use?.text)) problems.push('each "common uses" line needs its text');
        for (const size of Array.isArray(use?.sizes) ? use.sizes : []) {
            if (!isChartSize(size)) problems.push(`${size} isn't a chart size`);
            else if (covered.has(size)) problems.push(`${size} has two "common uses" lines`);
            covered.add(size);
        }
    }
    for (const size of CHART_SIZES) {
        if (!covered.has(size)) problems.push(`no "common uses" line for ${size}`);
    }
    return problems;
}

export function readRowsConfig(file = CONFIG_FILE) {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`can't read the rows config ${file}: ${error.message}`);
    }
    const problems = rowsConfigProblems(config);
    if (problems.length) throw new Error(`${file} can't be used:\n- ${problems.join('\n- ')}`);
    return config;
}

const TRACKING = ['none', 'product', 'variant'];

// Whether a shopper can buy a variant now, as the store's filtering sees it (the header):
// never when purchasing is disabled; otherwise by the stock the product tracks.
function canBuy(product, variant) {
    const { id, inventory_tracking: tracking } = product;
    if (typeof variant.purchasing_disabled !== 'boolean') throw new Error(`variant ${variant.id} of product ${id} has no purchasing_disabled: read the products with include=variants, every field`);
    if (variant.purchasing_disabled) return false;
    if (tracking === 'none') return true;
    if (tracking === 'product') return product.inventory_level > 0;
    if (!Number.isInteger(variant.inventory_level)) throw new Error(`variant ${variant.id} of product ${id} has no inventory_level, and the product tracks stock by variant`);
    return variant.inventory_level > 0;
}

// The catalogue's products as the table needs them: whether each is listed on ReelFlies_CA
// (visible and assigned to 1895766), its category ids, its Fly Sizes in chart spelling, those
// a shopper can buy now (inStock), and how many of its aught values are still spelled with a
// hyphen ("2-0", before ticket 18's rename).
export function catalogueProducts(productsRead, assignmentsRead) {
    const assigned = new Set();
    const pairs = new Set();
    for (const row of listOf(assignmentsRead, 'channel assignments')) {
        if (!isObject(row) || !Number.isInteger(row.product_id) || !Number.isInteger(row.channel_id)) {
            throw new Error('each channel assignment needs a product_id and a channel_id');
        }
        onlyOnce(pairs, `${row.product_id} ${row.channel_id}`, `product ${row.product_id}'s assignment to channel ${row.channel_id}`, 'channel assignments');
        if (row.channel_id === CHANNEL) assigned.add(row.product_id);
    }
    const ids = new Set();
    return listOf(productsRead, 'products').map(product => {
        if (!isObject(product) || !Number.isInteger(product.id)) throw new Error('each product needs its id');
        const { id } = product;
        onlyOnce(ids, id, `product ${id}`, 'products');
        if (!Array.isArray(product.variants)) throw new Error(`product ${id} has no variants: read the products with include=variants`);
        if (!Array.isArray(product.categories)) throw new Error(`product ${id} has no categories list`);
        if (!TRACKING.includes(product.inventory_tracking)) {
            throw new Error(`product ${id}'s inventory_tracking is ${JSON.stringify(product.inventory_tracking)}, not none, product or variant: read the products as the API answers them`);
        }
        if (product.inventory_tracking === 'product' && !Number.isInteger(product.inventory_level)) {
            throw new Error(`product ${id} tracks stock by product but has no inventory_level`);
        }
        // Each variant's Fly Sizes labels, and whether it can be bought; a variant without a
        // Fly Sizes value (a product with no sizes, or another option) takes no part.
        const variants = product.variants.map(variant => {
            if (!isObject(variant)) throw new Error(`product ${id} has a variant that isn't an object`);
            const labels = (Array.isArray(variant.option_values) ? variant.option_values : [])
                .filter(value => value?.option_display_name === FACET_NAME)
                .map(value => String(value.label));
            return { labels, buyable: labels.length > 0 && canBuy(product, variant) };
        });
        const labels = new Set(variants.flatMap(variant => variant.labels));
        const sizesOf = list => [...new Set([...list].map(normalizeSize).filter(Boolean))];
        const sizes = sizesOf(labels);
        const stocked = new Set(sizesOf(variants.filter(variant => variant.buyable).flatMap(variant => variant.labels)));
        return {
            id,
            listed: product.is_visible === true && assigned.has(id),
            categories: product.categories,
            sizes,
            inStock: sizes.filter(size => stocked.has(size)),
            hyphenAughts: [...labels].filter(isHyphenAught).length,
        };
    });
}

// The configured Fly Types, found at the top level of one tree's category read, each with every
// category below it, in tree order (the Fly Type itself first). Each category carries its depth
// below the Fly Type (0 for the Fly Type) and whether it is hidden: not visible itself, or
// below a category that isn't.
export function flyTypesFromTree(treeRead, configured) {
    const ids = new Set();
    const categories = listOf(treeRead, 'tree').map(category => {
        const id = category.category_id ?? category.id;
        if (typeof category.is_visible !== 'boolean') throw new Error(`category ${id} has no is_visible: read the tree as the API answers it`);
        return {
            id,
            parent: category.parent_id,
            tree: category.tree_id,
            name: category.name,
            url: typeof category.url === 'string' ? category.url : category.url?.path,
            visible: category.is_visible,
        };
    });
    categories.forEach(({ id }) => onlyOnce(ids, id, `category ${id}`, 'tree'));
    const trees = [...new Set(categories.map(({ tree }) => tree).filter(tree => tree !== undefined))].sort((a, b) => a - b);
    if (trees.length > 1) throw new Error(`the tree read holds trees ${andList(trees)}: read one tree`);
    const where = trees.length ? `tree ${trees[0]}` : 'the tree read';
    const top = categories.filter(({ parent }) => parent === 0);
    const children = new Map();
    for (const category of categories) {
        if (!children.has(category.parent)) children.set(category.parent, []);
        children.get(category.parent).push(category);
    }
    const below = (category, depth = 0, hiddenAbove = false) => {
        const hidden = hiddenAbove || !category.visible;
        return [{ ...category, depth, hidden }, ...(children.get(category.id) || []).flatMap(child => below(child, depth + 1, hidden))];
    };
    return configured.map(({ name, id }) => {
        const matches = id ? top.filter(category => category.id === id) : top.filter(category => String(category.name).toLowerCase() === name.toLowerCase());
        if (!matches.length) {
            throw new Error(id ? `no top-level category ${id} ("${name}") in ${where}` : `no top-level category "${name}" in ${where} (it has ${top.map(category => category.name).join(', ')})`);
        }
        if (matches.length > 1) {
            throw new Error(`${matches.length === 2 ? 'two' : matches.length} top-level categories are named "${name}" (${matches.map(category => category.id).join(', ')}): give its id in rows.json`);
        }
        const [root] = matches;
        if (!root.visible) {
            throw new Error(`the Fly Type "${root.name}" (${root.id}) is hidden in ${where}: the rows never link a hidden category, so make it visible or take it out of rows.json`);
        }
        const subtree = below(root).map(category => {
            if (typeof category.url !== 'string' || !PLAIN_PATH.test(category.url)) {
                throw new Error(`category ${category.id}'s URL ${JSON.stringify(category.url)} isn't a plain path like /dry-flies/`);
            }
            return {
                id: category.id, name: category.name, url: category.url, depth: category.depth, hidden: category.hidden,
            };
        });
        return {
            name: root.name, id: root.id, url: root.url, categories: subtree,
        };
    });
}

// One row per chart size, in hook order. Rolled up (the default), a row links each Fly Type
// with at least `min` listed products in that size, counting the products placed anywhere below
// it, since its page lists its sub-types' products too. Without roll-up (probe 8), a row links
// each category that holds such products itself, so every link opens a page with products.
// A size counts only while it is in stock (the header), unless stockOuts is true. A hidden
// category is never linked and counts no product.
//
// The report says what was left out and why, so nothing disappears unseen:
// - stock: the links that only out-of-stock sizes would make, [{ size, name }]. They are left
//   out, or with stockOuts kept, and listed either way.
// - deep: rolled up, the links with fewer than `min` products within one level of the Fly Type,
//   which rely on roll-up deeper than probe 8 proved; deepOnly counts the products counted
//   only through such a placement.
export function buildTable(products, flyTypes, { rollup = true, min = 1, stockOuts = false } = {}) {
    if (!Number.isInteger(min) || min < 1) throw new Error(`min must be a whole number of products, at least 1, not ${min}`);
    const owners = new Map();
    flyTypes.forEach((flyType, index) => flyType.categories.forEach(category => owners.set(category.id, { index, category })));
    // Who holds each link: every listed, placed product whatever its stock (any), those in stock
    // (inStock), and of the linked ones, those within one level of the Fly Type (near).
    const held = { any: new Map(), inStock: new Map(), near: new Map() };
    const hold = (map, key, id) => {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(id);
    };
    const count = (map, key) => map.get(key)?.size || 0;
    const keyOf = (size, { index, category }) => (rollup ? `${size}|type ${index}` : `${size}|category ${category.id}`);
    const report = {
        counted: 0, notListed: 0, noFlyType: 0, hiddenOnly: 0, noSizes: 0, outOfStock: 0, offChart: {}, hyphenAughts: 0, stock: [], deep: [], deepOnly: 0,
    };
    for (const product of products) {
        const placed = product.categories.map(id => owners.get(id)).filter(Boolean);
        const placements = placed.filter(({ category }) => !category.hidden);
        if (!product.listed) report.notListed += 1;
        else if (!placed.length) report.noFlyType += 1;
        else if (!placements.length) report.hiddenOnly += 1;
        else if (!product.sizes.length) report.noSizes += 1;
        else {
            const chartSizes = product.sizes.filter(isChartSize);
            const inStock = product.inStock.filter(isChartSize);
            chartSizes.forEach(size => placements.forEach(placement => hold(held.any, keyOf(size, placement), product.id)));
            inStock.forEach(size => placements.forEach(placement => hold(held.inStock, keyOf(size, placement), product.id)));
            if (!product.inStock.length) report.outOfStock += 1;
            if (stockOuts || product.inStock.length) {
                report.counted += 1;
                report.hyphenAughts += product.hyphenAughts;
                for (const size of product.sizes.filter(value => !isChartSize(value))) report.offChart[size] = (report.offChart[size] || 0) + 1;
                const near = placements.filter(({ category }) => category.depth <= 1);
                if (rollup && !near.length) report.deepOnly += 1;
                (stockOuts ? chartSizes : inStock).forEach(size => near.forEach(placement => hold(held.near, keyOf(size, placement), product.id)));
            }
        }
    }
    const linked = stockOuts ? held.any : held.inStock;
    // Every link a row could have, in Fly Type order: rolled up, the Fly Types; otherwise their
    // visible categories.
    const candidates = rollup
        ? flyTypes.map((flyType, index) => ({ name: flyType.name, url: flyType.url, key: size => `${size}|type ${index}` }))
        : flyTypes.flatMap(flyType => flyType.categories.filter(category => !category.hidden)
            .map(category => ({ name: category.name, url: category.url, key: size => `${size}|category ${category.id}` })));
    const rows = CHART_SIZES.map(size => {
        const links = [];
        for (const { name, url, key } of candidates) {
            const n = count(linked, key(size));
            if (count(held.any, key(size)) >= min && count(held.inStock, key(size)) < min) report.stock.push({ size, name });
            if (n >= min) {
                links.push({ name, url, count: n });
                if (rollup && count(held.near, key(size)) < min) report.deep.push({ size, name });
            }
        }
        return { size, anchor: anchorId(size), links };
    });
    return { rows, report };
}

// A category URL with the size applied in BigCommerce's facet form (SEO-6): _bc_fsnf=1, which
// robots.txt blocks, and the Fly Sizes value as ticket 18 names it.
export const facetUrl = (url, size) => `${url}?_bc_fsnf=1&${facetParam(size)}`;

// The rows block, markers included. With links false, the Fly Types are named without links.
export function renderRows(table, config, { links = true } = {}) {
    const uses = new Map(config.uses.flatMap(({ sizes, text }) => sizes.map(size => [size, text])));
    const { text } = config;
    const shop = row => {
        if (!row.links.length) return escapeHtml(text.none);
        return row.links.map(({ name, url }) => (links
            ? `<a href="${escapeHtml(facetUrl(url, row.size))}" rel="nofollow">${escapeHtml(name)}</a>`
            : escapeHtml(name))).join(', ');
    };
    return [
        MARKERS.start,
        NOTE,
        '<table class="rf-chart-rows">',
        `<thead><tr><th scope="col">${escapeHtml(text.size)}</th><th scope="col">${escapeHtml(text.uses)}</th><th scope="col">${escapeHtml(text.shop)}</th></tr></thead>`,
        '<tbody>',
        ...table.rows.map(row => `<tr id="${row.anchor}"><th scope="row">${row.size}</th><td>${escapeHtml(uses.get(row.size) || '')}</td><td>${shop(row)}</td></tr>`),
        '</tbody>',
        '</table>',
        MARKERS.end,
    ].join('\n');
}

const occurrences = (text, marker) => text.split(marker).length - 1;

// The body with everything from the start marker to the end marker replaced by `block`.
export function spliceRows(body, block) {
    if (!block.startsWith(MARKERS.start) || !block.endsWith(MARKERS.end)) throw new Error('the rows block must start and end with the markers');
    for (const [name, marker] of Object.entries(MARKERS)) {
        const n = occurrences(body, marker);
        if (n === 0) throw new Error(`the page has no rows ${name} marker (${marker}): put the two markers where the rows go`);
        if (n > 1) throw new Error(`the page has ${n} rows ${name} markers (${marker}): keep one`);
    }
    const start = body.indexOf(MARKERS.start);
    const end = body.indexOf(MARKERS.end);
    if (end < start) throw new Error('the rows end marker comes before the start marker');
    return `${body.slice(0, start)}${block}${body.slice(end + MARKERS.end.length)}`;
}

// The update of the chart's Web Page on 1895766 that puts `block` between its markers, as a
// request for the store-write helper, or null when the page already has these rows. It sends
// every field the read gave back but the id, as read, with only the body changed. BigCommerce's
// page update needs name and type, and documents a default for several fields it isn't sent
// (is_visible true, meta_description "", parent_id 0 …), while plan.mjs's diff compares only the
// fields sent. Sending them all keeps the page as it is, and the reviewed diff shows the body
// alone, or any field that changed on the store since the read.
export function chartPageRequest(pagesRead, block) {
    const pages = listOf(pagesRead, 'pages').filter(page => isObject(page) && page.url === CHART_URL);
    if (!pages.length) throw new Error(`no Web Page at ${CHART_URL} in the read: create it first, with the two markers where the rows go`);
    if (pages.length > 1) throw new Error(`${pages.length} Web Pages at ${CHART_URL} (${pages.map(page => page.id).join(', ')}): the read must hold one`);
    const [page] = pages;
    if (page.channel_id !== CHANNEL) throw new Error(`page ${page.id} is on channel ${page.channel_id}, not ${CHANNEL}: the rows are written to ReelFlies_CA only`);
    if (typeof page.body !== 'string') throw new Error(`page ${page.id} has no body: read the pages with include=body`);
    const body = spliceRows(page.body, block);
    if (body === page.body) return { page, request: null };
    const { id, ...fields } = page;
    return {
        page,
        request: {
            method: 'PUT',
            path: `/v3/content/pages/${id}`,
            body: { ...fields, channel_id: CHANNEL, body },
        },
    };
}

class Usage extends Error {}

export function parseArgs(argv) {
    const args = {
        products: [], assignments: [], tree: [], config: CONFIG_FILE, rollup: true, min: 1, stockOuts: false, rowsOut: null, existing: [], changes: null, textOnly: false,
    };
    const value = (i, flag) => {
        if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Usage(`${flag} needs a value`);
        return argv[i + 1];
    };
    for (let i = 0; i < argv.length; i += 1) {
        const flag = argv[i];
        if (flag === '--no-rollup') args.rollup = false;
        else if (flag === '--text-only') args.textOnly = true;
        else if (flag === '--count-stock-outs') args.stockOuts = true;
        else if (['--products', '--assignments', '--tree', '--config', '--min', '--rows-out', '--existing', '--changes'].includes(flag)) {
            const given = value(i, flag);
            i += 1;
            if (flag === '--products') args.products.push(given);
            else if (flag === '--assignments') args.assignments.push(given);
            else if (flag === '--tree') args.tree.push(given);
            else if (flag === '--config') args.config = given;
            else if (flag === '--rows-out') args.rowsOut = given;
            else if (flag === '--existing') args.existing.push(given);
            else if (flag === '--changes') args.changes = given;
            else {
                args.min = Number(given);
                if (!Number.isInteger(args.min) || args.min < 1) throw new Usage(`--min must be a whole number, at least 1, not ${given}`);
            }
        } else {
            throw new Usage(`unknown argument ${flag} (see the top of scripts/hook-chart/rows.mjs)`);
        }
    }
    if (!args.products.length || !args.assignments.length || !args.tree.length) throw new Usage('--products, --assignments and --tree are needed: saved reads of the products, their channel assignments and the tree');
    if (args.changes && !args.existing.length) throw new Usage('--changes needs --existing, the channel\'s pages read with include=body');
    if (args.textOnly && args.changes) throw new Usage('--text-only rows are for channel 1 (ticket 53), which the store-write helper never writes: use --rows-out');
    return args;
}

const readJson = file => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`can't read ${file}: ${error.message}`);
    }
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// Every page of one read, from its files.
const readPages = (files, what) => joinPages(files.map(file => ({ file, read: readJson(file) })), what);

export function main(argv = process.argv.slice(2)) {
    let args;
    try {
        args = parseArgs(argv);
    } catch (error) {
        if (!(error instanceof Usage)) throw error;
        console.error(`rows.mjs: ${error.message}`);
        return 2;
    }
    try {
        const config = readRowsConfig(args.config);
        const products = catalogueProducts(readPages(args.products, 'products'), readPages(args.assignments, 'channel assignments'));
        const flyTypes = flyTypesFromTree(readPages(args.tree, 'tree'), config.flyTypes);
        const pages = args.existing.length ? readPages(args.existing, 'pages') : null;
        const table = buildTable(products, flyTypes, { rollup: args.rollup, min: args.min, stockOuts: args.stockOuts });
        for (const row of table.rows) {
            console.log(`${row.size.padEnd(5)} ${row.links.map(({ name, count }) => `${name} (${count})`).join(', ') || '-'}`);
        }
        const { report } = table;
        console.log(`counted  ${plural(report.counted, 'product')} visible and assigned to ReelFlies_CA (${CHANNEL}), ${args.rollup ? `rolled up to the ${flyTypes.length} Fly Types` : 'linked to the categories that hold them'}`
            + `${args.min > 1 ? `, at least ${args.min} a link` : ''}${args.stockOuts ? ', out-of-stock sizes included' : ''}`
            + `; left out: ${report.notListed} not visible and assigned to ${CHANNEL}, ${report.noFlyType} with no Fly Type Placement, ${report.hiddenOnly} placed only in hidden categories, ${report.noSizes} with no ${FACET_NAME}`
            + `${args.stockOuts ? '' : `, ${report.outOfStock} out of stock in every size`}`);
        // The links a report line names: ": 22 Nymphs, 24 Nymphs", or nothing.
        const listed = list => (list.length ? `: ${list.map(({ size, name }) => `${size} ${name}`).join(', ')}` : '');
        console.log(args.stockOuts
            ? `stock    ${plural(report.stock.length, 'link')} kept although every variant of the size is out of stock or not for sale (--count-stock-outs)${listed(report.stock)}`
            : `stock    ${plural(report.stock.length, 'link')} left out because every variant of the size is out of stock or not for sale, which the store hides from filtering (probe 10)${listed(report.stock)}`);
        if (args.rollup) {
            console.log(`deep     ${plural(report.deep.length, 'link')} ${report.deep.length === 1 ? 'needs' : 'need'} roll-up deeper than the one level probe 8 proved${listed(report.deep)}`
                + `; ${plural(report.deepOnly, 'product')} counted only through a category two or more levels down`);
        }
        const offChart = Object.entries(report.offChart);
        if (offChart.length) console.error(`WARN     sizes off the chart, not shown: ${offChart.map(([size, n]) => `${size} (${plural(n, 'product')})`).join(', ')}`);
        if (report.hyphenAughts) console.error(`WARN     ${report.hyphenAughts} aught values are still spelled with a hyphen (2-0): their row links resolve only after ticket 18's rename to 2/0`);
        if (config.status !== 'approved') console.error(`WARN     the rows' copy in ${path.relative(process.cwd(), args.config) || args.config} is ${config.status}, not approved by Shaun yet`);
        const block = renderRows(table, config, { links: !args.textOnly });
        if (args.rowsOut) {
            fs.writeFileSync(args.rowsOut, `${block}\n`);
            console.log(`wrote    ${args.rowsOut}`);
        }
        if (pages) {
            const { page, request } = chartPageRequest(pages, block);
            if (!request) {
                console.log(`unchanged: the page already has these rows; no changes file written (page ${page.id})`);
            } else if (args.changes) {
                fs.writeFileSync(args.changes, `${JSON.stringify([request], null, 2)}\n`);
                console.log(`wrote    ${args.changes}: ${request.method} ${request.path}`);
                // plan.mjs reads a changes file only from the main clone, a worktree or ~/reelflies/store-snapshots/.
                console.log(`next     node ~/reelflies/theme/cornerstone/scripts/store/plan.mjs --ticket 35 --changes ${path.resolve(args.changes)}`);
            } else {
                console.log(`changed  page ${page.id}'s rows differ; add --changes <file> to write the update`);
            }
        }
        return 0;
    } catch (error) {
        console.error(`rows.mjs: ${error.message}`);
        return 1;
    }
}

if (isMain(import.meta.url)) process.exitCode = main();
