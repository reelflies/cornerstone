#!/usr/bin/env node
// Ticket 07's prelaunch probes, read-only. Three commands, each printing JSON evidence (or writing
// it with --out) that research/07-prelaunch-probes.md records:
//
//   node scripts/probes/run.mjs api [--out <file>]
//       Probes 6, 7, 10 and 12, and the reads behind 2, 3, 4, 8 and 15: GETs only, with the
//       read-only store API token (scripts/lib/store-token.mjs: RF_BC_READ_TOKEN, then the
//       Keychain item "reelflies-bc-read") through the store helper's read-only client, which
//       refuses any other method before it sends anything.
//
//   QA_PORT=4400 QA_CHANNEL=1 node scripts/probes/run.mjs context [--api <api evidence>] [--category <path>] [--out <file>]
//       Probes 1, 2, 3, 4, 5, 7, 14 and 15 from the Stencil context of a local stencil start,
//       started first with `QA_PORT=4400 QA_CHANNEL=1 node scripts/qa/serve.mjs` (it takes the
//       port lock and a stencil start slot). The server must render QA_CHANNEL and QA_VARIATION.
//       With --api, probe 3 compares the menu with the channel's tree, probe 4 also renders a
//       category holding a product that has custom fields, and probe 15 requests every post.
//
//   node scripts/probes/run.mjs hosts [--out <file>]
//       Probe 11 (/cdn-cgi/trace on the prelaunch host and the live sites) and the prelaunch
//       blog's answer without the preview cookie.
//
// Never kept or printed: a page's context (it carries the storefront API token and the visitor's
// IP address), a trace's ip= line, coupon codes, or the store API token (every line goes through
// release-redact.mjs with it).

import fs from 'fs';
import { isMain } from '../lib/is-main.mjs';
import { withRetries } from '../qa/retry.mjs';
import {
    HEADERS, LOCAL_URL, QA_CHANNEL, serverProblems,
} from '../qa/storefront.mjs';
import {
    READS, SETTINGS, CHANNEL_CA, directProductsRead, probeFilterContexts, probeFreeShippingPromotions, productsWithFieldsRead, settingsInheritance, treeCategoriesRead,
} from './api-probes.mjs';
import {
    flattenCategories, probeBlogPaths, probeCardCustomFields, probeCarousel, probeFlags, probeMenuDepth, probeMenuImages, probeMenuOrder, probeRootRollup, probeSubcategoryImages,
} from './context-probes.mjs';
import { TRACE_HOSTS, parseTrace, probeCdnCountry } from './trace.mjs';

const COMMANDS = ['api', 'context', 'hosts'];
const OPTIONS = { api: ['out'], context: ['api', 'category', 'out'], hosts: ['out'] };
const MAX_PAGES = 60;
const MAX_CATEGORY_PAGES = 5;
const SAMPLES = 5;

export function parseArgs(argv) {
    const [command, ...rest] = argv;
    if (!COMMANDS.includes(command)) throw new Error('the first argument is the command: api, context or hosts');
    const options = { command };
    for (let index = 0; index < rest.length; index += 1) {
        const flag = rest[index];
        const name = flag.replace(/^--/, '');
        if (!flag.startsWith('--') || !OPTIONS[command].includes(name)) throw new Error(`${flag} isn't an option of ${command} (${OPTIONS[command].map(option => `--${option}`).join(', ')})`);
        const value = rest[index + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`);
        options[name] = value;
        index += 1;
    }
    return options;
}

const describe = response => {
    const body = response.body && typeof response.body === 'object' && !Array.isArray(response.body) ? response.body : null;
    return body && body.title ? `${response.status}: ${body.title}` : String(response.status);
};

// Every page of a read: v3 answers say how many pages there are, v2 answers stop at a short page
// (or 204). A read without `pages` is sent once, as given.
export async function readAll(client, read) {
    if (!read.pages) {
        const response = await client.get(read.path, read.query);
        return {
            status: response.status, ok: response.ok, body: response.body, items: null, error: response.ok ? null : describe(response),
        };
    }
    const items = [];
    let status = 200;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        // Pages are read one after another, because each one says whether there is another.
        // eslint-disable-next-line no-await-in-loop
        const response = await client.get(read.path, { ...read.query, page });
        status = response.status;
        if (response.status === 204) break;
        if (!response.ok) {
            return {
                status, ok: false, body: response.body, items, error: describe(response),
            };
        }
        if (Array.isArray(response.body)) {
            items.push(...response.body);
            if (response.body.length < read.query.limit) break;
        } else {
            items.push(...(response.body.data || []));
            const pagination = response.body.meta && response.body.meta.pagination;
            if (!pagination || page >= pagination.total_pages) break;
        }
    }
    return {
        status, ok: true, body: null, items, error: null,
    };
}

const scopeKey = query => (query.channel_id ? String(query.channel_id) : 'global');

// The API probes. `client` is the store helper's read-only client, or a stand-in in the tests.
export async function runApiProbes({ client }) {
    const results = {};
    for (const read of READS) {
        // One read at a time, so a rate limit can't make several fail together.
        // eslint-disable-next-line no-await-in-loop
        results[read.id] = await readAll(client, read);
    }
    const reads = READS.map(read => ({
        id: read.id, path: read.path, query: read.query, status: results[read.id].status,
    }));

    const probe10 = {};
    SETTINGS.forEach(setting => {
        const global = results[`settings:${setting.name}:global`];
        const scopes = {};
        ['1895766', '1', '1855224'].forEach(channel => {
            const read = results[`settings:${setting.name}:${channel}`];
            scopes[channel] = settingsInheritance(global.body, read.body, { globalStatus: global.status, channelStatus: read.status });
        });
        probe10[setting.name] = { global: global.ok ? global.body.data : { error: global.error }, scopes };
    });

    const settingByScope = (name, key) => Object.fromEntries(['global', '1895766', '1', '1855224'].map(scope => {
        const read = results[`settings:${name}:${scope}`];
        return [scope, read.ok && read.body && read.body.data ? read.body.data[key] ?? null : `error ${read.error}`];
    }));

    const contexts = {};
    READS.filter(read => read.id.startsWith('filter-contexts:')).forEach(read => {
        const result = results[read.id];
        contexts[scopeKey(read.query)] = result.ok ? probeFilterContexts(result.body) : { error: result.error };
    });
    const enabledFilters = Object.fromEntries(['global', '1895766', '1', '1855224'].map(scope => {
        const read = results[`settings:search-filters:${scope}`];
        if (!read.ok) return [scope, `error ${read.error}`];
        const data = Array.isArray(read.body.data) ? read.body.data : [];
        return [scope, data.filter(filter => filter.is_enabled !== false).map(filter => filter.display_name)];
    }));

    const treesRead = results.trees;
    const trees = treesRead.ok ? (treesRead.body.data || []).map(({ id, name, channels }) => ({ id, name, channels })) : [];
    const treeCategories = {};
    for (const channel of [1, CHANNEL_CA]) {
        const tree = trees.find(candidate => (candidate.channels || []).map(Number).includes(channel));
        if (tree) {
            // eslint-disable-next-line no-await-in-loop
            const read = await readAll(client, treeCategoriesRead(tree.id));
            reads.push({
                id: `tree-categories:${tree.id}`, path: '/v3/catalog/trees/categories', query: { 'tree_id:in': tree.id }, status: read.status,
            });
            treeCategories[String(channel)] = read.ok ? read.items.map(row => ({
                category_id: row.category_id, parent_id: row.parent_id, name: row.name, sort_order: row.sort_order, is_visible: row.is_visible, path: row.url && row.url.path,
            })) : { error: read.error };
        }
    }

    // Probe 8: how many products each visible root holds directly.
    const rootDirectProducts = {};
    for (const [channel, rows] of Object.entries(treeCategories)) {
        if (Array.isArray(rows)) {
            rootDirectProducts[channel] = {};
            for (const root of rows.filter(row => row.parent_id === 0 && row.is_visible)) {
                const read = directProductsRead(root.category_id);
                // eslint-disable-next-line no-await-in-loop
                const response = await client.get(read.path, read.query);
                const pagination = response.ok && response.body.meta && response.body.meta.pagination;
                rootDirectProducts[channel][root.category_id] = pagination ? pagination.total : `error ${describe(response)}`;
            }
        }
    }

    const customFields = {
        scanned: 0, withFields: 0, fieldNames: {}, samples: [],
    };
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const response = await client.get(productsWithFieldsRead(page).path, productsWithFieldsRead(page).query);
        if (!response.ok) {
            customFields.error = describe(response);
            break;
        }
        const products = response.body.data || [];
        customFields.scanned += products.length;
        products.filter(product => (product.custom_fields || []).length).forEach(product => {
            customFields.withFields += 1;
            product.custom_fields.forEach(field => { customFields.fieldNames[field.name] = (customFields.fieldNames[field.name] || 0) + 1; });
            if (customFields.samples.length < SAMPLES && product.is_visible) {
                customFields.samples.push({
                    id: product.id, name: product.name, categories: product.categories, fields: product.custom_fields.map(field => field.name),
                });
            }
        });
        const pagination = response.body.meta && response.body.meta.pagination;
        if (!pagination || page >= pagination.total_pages) break;
    }

    const blog = results['blog-posts'];
    return {
        generated: new Date().toISOString(),
        reads,
        probe2: { category_tree_depth: settingByScope('storefront-category', 'category_tree_depth') },
        probe6: { contexts, enabledFilters },
        probe8: { listing_mode: settingByScope('storefront-category', 'listing_mode'), rootDirectProducts },
        probe10,
        probe12: results.promotions.ok ? probeFreeShippingPromotions({ data: results.promotions.items }) : { error: results.promotions.error },
        trees,
        treeCategories,
        blogPosts: blog.ok ? blog.items.filter(post => post.is_published).map(({ id, title, url }) => ({ id, title, url })) : { error: blog.error },
        customFields,
    };
}

const pathOf = url => {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
};

// The first menu category with children, at the second level if there is one: a Fly Type page in
// tree 1, which has both cards and subcategories.
export function pickProbeCategory(context) {
    const rows = flattenCategories(context.categories);
    const parents = new Set(rows.map(row => row.parentId).filter(Boolean));
    const withChildren = rows.filter(row => parents.has(row.id));
    const pick = withChildren.find(row => row.depth === 2) || withChildren[0];
    return pick ? pathOf(pick.url) : null;
}

// A GET to the local stencil start, asked again on a 5xx or a 429 by the gates' own policy
// (scripts/qa/retry.mjs: its request to the store can drop). RETRY lines go to stderr, so the
// evidence on stdout stays JSON.
function localGet(fetchImpl, url) {
    return withRetries(() => fetchImpl(url, { headers: HEADERS, redirect: 'manual' }), {
        what: url,
        read: response => ({ status: response.status, retryAfter: response.headers && response.headers.get ? response.headers.get('retry-after') : null }),
        drop: response => (response.arrayBuffer ? response.arrayBuffer() : null),
        log: line => console.error(line),
    });
}

async function getContext(fetchImpl, base, path) {
    const separator = path.includes('?') ? '&' : '?';
    const response = await localGet(fetchImpl, `${base}${path}${separator}debug=context`);
    if (response.status !== 200) throw new Error(`GET ${path}${separator}debug=context answered ${response.status}`);
    return response.json();
}

async function statusOf(fetchImpl, base, path) {
    return (await localGet(fetchImpl, `${base}${path}`)).status;
}

// Probe 4 again, on a category page that holds a product with custom fields (from the API
// evidence), so "partial" can become "pass" or "fail".
async function customFieldCard(fetchImpl, base, rows, samples) {
    const byId = new Map(rows.map(row => [row.id, row]));
    for (const sample of samples) {
        const category = (sample.categories || []).map(String).map(id => byId.get(id)).find(Boolean);
        if (category) {
            const path = pathOf(category.url);
            for (let page = 1; page <= MAX_CATEGORY_PAGES; page += 1) {
                // eslint-disable-next-line no-await-in-loop
                const context = await getContext(fetchImpl, base, page === 1 ? path : `${path}?page=${page}`);
                const card = ((context.category && context.category.products) || []).find(product => product.id === sample.id);
                if (card) {
                    return {
                        product: sample.id, apiFields: sample.fields, page: page === 1 ? path : `${path}?page=${page}`, cardHasKey: Object.hasOwn(card, 'custom_fields'), cardFields: (card.custom_fields || []).map(field => field.name),
                    };
                }
                if (!context.category || !context.pagination || !context.pagination.category || !context.pagination.category.next) break;
            }
        }
    }
    return { product: null, note: samples.length ? 'no sample product was found on a menu category\'s first pages' : 'no visible product has a custom field' };
}

// The context probes against a local stencil start. `problems(context)` is storefront.mjs's
// serverProblems, so the run stops if the server renders another channel or variation.
export async function runContextProbes({
    base, channel, api, category, fetch: fetchImpl = fetch, problems,
}) {
    const home = await getContext(fetchImpl, base, '/');
    const found = problems(home);
    if (found.length) throw new Error(`the server at ${base} ${found.join('; ')}`);
    const cart = await getContext(fetchImpl, base, '/cart.php');
    const rows = flattenCategories(home.categories);
    const categoryPath = category || pickProbeCategory(home);
    const categoryContext = categoryPath ? await getContext(fetchImpl, base, categoryPath) : { category: null };
    const treeRows = api && api.treeCategories && Array.isArray(api.treeCategories[channel]) ? api.treeCategories[channel] : null;

    let blogPaths = [];
    try {
        blogPaths = probeBlogPaths(await getContext(fetchImpl, base, '/blog/'));
    } catch (error) {
        blogPaths = ['/blog/'];
    }
    const apiPosts = api && Array.isArray(api.blogPosts) ? api.blogPosts.map(post => post.url) : [];
    const paths = [...new Set([...blogPaths, ...apiPosts])];
    const statuses = [];
    for (const path of paths) {
        // eslint-disable-next-line no-await-in-loop
        statuses.push({ path, status: await statusOf(fetchImpl, base, path) });
    }

    const roots = [];
    for (const root of rows.filter(row => row.depth === 1)) {
        const path = pathOf(root.url);
        // eslint-disable-next-line no-await-in-loop
        const context = await getContext(fetchImpl, base, path);
        const cards = ((context.category && context.category.products) || []).length;
        roots.push({
            id: root.id, name: root.name, path, listed: context.category ? context.category.total_products ?? cards : 0, cards,
        });
    }
    const direct = api && api.probe8 && api.probe8.rootDirectProducts ? api.probe8.rootDirectProducts[channel] || {} : {};

    // Probe 4's verdict: the picked page's, unless a card whose product has a custom field shows it
    // (pass) or drops it (fail), which answers the question the picked page may leave open.
    const pageProbe4 = probeCardCustomFields(categoryContext);
    const probe4 = { ...pageProbe4, pageVerdict: pageProbe4.verdict, page: categoryPath };
    if (api && api.customFields) {
        probe4.sample = await customFieldCard(fetchImpl, base, rows, api.customFields.samples || []);
        if (probe4.sample.product) probe4.verdict = probe4.sample.cardFields.length ? 'pass' : 'fail';
    }

    return {
        generated: new Date().toISOString(),
        channel,
        server: base,
        probe1: probeMenuImages(home),
        probe2: probeMenuDepth(home),
        probe3: treeRows ? probeMenuOrder(home, treeRows) : { verdict: 'no tree read', note: 'run with --api <api evidence>' },
        probe4,
        probe5: probeCarousel(home),
        probe7: probeFlags(cart, home),
        probe8: probeRootRollup(roots, direct),
        probe14: { ...probeSubcategoryImages(categoryContext), page: categoryPath },
        probe15: { verdict: statuses.every(({ status }) => status === 200) && statuses.length ? 'pass' : 'fail', statuses },
        menu: rows.map(({
            id, name, depth, parentId, image,
        }) => ({
            id, name, depth, parentId, image: Boolean(image),
        })),
    };
}

// Probe 11, and the prelaunch blog without the preview cookie.
export async function runHostProbes({ fetch: fetchImpl = fetch } = {}) {
    const hosts = [];
    for (const { host, what } of TRACE_HOSTS) {
        try {
            // One host at a time, so each answer is read before the next request.
            // eslint-disable-next-line no-await-in-loop
            const response = await fetchImpl(`https://${host}/cdn-cgi/trace`, { redirect: 'manual' });
            // eslint-disable-next-line no-await-in-loop
            const text = await response.text();
            hosts.push({
                host, what, status: response.status, trace: parseTrace(text),
            });
        } catch (error) {
            hosts.push({
                host, what, status: null, error: error.cause ? String(error.cause.code || error.cause.message) : error.message, trace: {},
            });
        }
    }
    const prelaunch = TRACE_HOSTS[0].host;
    let status = null;
    try {
        status = (await fetchImpl(`https://${prelaunch}/blog/`, { redirect: 'manual' })).status;
    } catch (error) {
        status = `error ${error.message}`;
    }
    return {
        generated: new Date().toISOString(),
        probe11: { ...probeCdnCountry(hosts), hosts },
        probe15Anonymous: { host: prelaunch, path: '/blog/', status },
    };
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error(`usage: node scripts/probes/run.mjs api|context|hosts [--out <file>] [--api <file>] [--category <path>]\n  ${error.message}`);
        return 2;
    }
    const secrets = [];
    const { redact } = await import('../release-redact.mjs');
    try {
        let evidence;
        if (options.command === 'api') {
            const { readStoreToken } = await import('../lib/store-token.mjs');
            const { createClient } = await import('../store/client.mjs');
            const { commandStoreHash } = await import('../store/plan.mjs');
            const storeHash = await commandStoreHash();
            const { token, source } = readStoreToken('read');
            secrets.push(token);
            console.error(redact(`Reading with ${source}, GET only…`, secrets));
            // Never follow a redirect: it would carry the X-Auth-Token header to another origin.
            const client = createClient({
                storeHash, token, readOnly: true, fetch: (url, init) => fetch(url, { ...init, redirect: 'error' }),
            });
            evidence = await runApiProbes({ client });
        } else if (options.command === 'context') {
            const api = options.api ? JSON.parse(fs.readFileSync(options.api, 'utf8')) : null;
            evidence = await runContextProbes({
                base: LOCAL_URL, channel: QA_CHANNEL, api, category: options.category, problems: context => serverProblems(context),
            });
        } else {
            evidence = await runHostProbes();
        }
        const text = redact(`${JSON.stringify(evidence, null, 2)}\n`, secrets);
        if (options.out) {
            fs.writeFileSync(options.out, text);
            console.error(`Wrote ${options.out}`);
        } else {
            process.stdout.write(text);
        }
        return 0;
    } catch (error) {
        console.error(redact(`FAIL     ${error.message}`, secrets));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
