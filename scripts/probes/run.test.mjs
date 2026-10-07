import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseArgs, pickProbeCategory, readAll, runApiProbes, runContextProbes, runHostProbes,
} from './run.mjs';

test('parseArgs takes one command and its options, and refuses anything else', () => {
    assert.deepEqual(parseArgs(['api', '--out', 'x.json']), { command: 'api', out: 'x.json' });
    assert.deepEqual(parseArgs(['context', '--api', 'a.json', '--category', '/flies/']), { command: 'context', api: 'a.json', category: '/flies/' });
    assert.deepEqual(parseArgs(['hosts']), { command: 'hosts' });
    assert.throws(() => parseArgs([]), /api, context or hosts/);
    assert.throws(() => parseArgs(['put']), /api, context or hosts/);
    assert.throws(() => parseArgs(['api', '--method', 'PUT']), /--method/);
    assert.throws(() => parseArgs(['api', '--out']), /--out needs a value/);
});

// A stand-in for the store helper's read-only client: it answers from `routes`, keyed by the
// path and query, and records every call.
function fakeClient(routes) {
    const calls = [];
    const key = (path, query) => `${path}?${Object.entries(query || {}).sort().map(([k, v]) => `${k}=${v}`).join('&')}`;
    return {
        calls,
        get: async (path, query) => {
            calls.push({ method: 'GET', path, query });
            const route = routes[key(path, query)];
            if (!route) return { status: 404, ok: false, body: { title: 'Not Found' } };
            return { status: route.status || 200, ok: (route.status || 200) < 300, body: route.body };
        },
        request: async ({ method }) => { throw new Error(`the probes never send ${method}`); },
    };
}

test('readAll follows v3 pagination and v2 short pages', async () => {
    const client = fakeClient({
        '/v3/x?limit=2&page=1': { body: { data: [1, 2], meta: { pagination: { total_pages: 2 } } } },
        '/v3/x?limit=2&page=2': { body: { data: [3], meta: { pagination: { total_pages: 2 } } } },
        '/v2/y?limit=2&page=1': { body: ['a', 'b'] },
        '/v2/y?limit=2&page=2': { status: 204, body: null },
    });
    assert.deepEqual((await readAll(client, { path: '/v3/x', query: { limit: 2 }, pages: true })).items, [1, 2, 3]);
    assert.deepEqual((await readAll(client, { path: '/v2/y', query: { limit: 2 }, pages: true })).items, ['a', 'b']);
    const one = await readAll(client, { path: '/v3/x', query: { limit: 2, page: 1 } });
    assert.equal(one.status, 200);
});

const settingsBody = channel => ({ data: { listing_mode: channel ? null : 'current_category_only', category_tree_depth: channel === 1 ? 3 : null, default_product_sort: 'featured' } });

function apiRoutes() {
    const routes = {};
    const scopes = [['', null], ['channel_id=1895766', 1895766], ['channel_id=1', 1], ['channel_id=1855224', 1855224]];
    ['/v3/settings/storefront/category', '/v3/settings/storefront/search', '/v3/settings/inventory', '/v3/settings/search/filters'].forEach(path => {
        scopes.forEach(([query, channel]) => { routes[`${path}?${query}`] = { body: settingsBody(channel) }; });
    });
    routes['/v3/settings/search/filters/contexts?'] = { body: { data: [{ context: { channel_id: 1 }, data: [] }] } };
    routes['/v3/settings/search/filters/contexts?channel_id=1895766'] = { status: 422, body: { title: 'Only the default channel' } };
    routes['/v3/settings/search/filters/contexts?channel_id=1'] = { body: { data: [] } };
    routes['/v3/catalog/trees?'] = { body: { data: [{ id: 1, name: 'Default', channels: [1, 1855224] }, { id: 2, name: 'CA', channels: [1895766] }] } };
    routes['/v3/catalog/trees/categories?limit=250&page=1&tree_id:in=1'] = {
        body: {
            data: [{
                category_id: 398, parent_id: 0, name: 'Flies', sort_order: 1, is_visible: true, url: { path: '/flies/' },
            }],
            meta: { pagination: { total_pages: 1 } },
        },
    };
    routes['/v3/catalog/trees/categories?limit=250&page=1&tree_id:in=2'] = { body: { data: [], meta: { pagination: { total_pages: 1 } } } };
    routes['/v3/catalog/products?categories:in=398&include_fields=id&limit=1'] = { body: { data: [], meta: { pagination: { total: 0 } } } };
    routes['/v3/promotions?limit=50&page=1'] = { body: { data: [], meta: { pagination: { total_pages: 1 } } } };
    routes['/v2/blog/posts?limit=250&page=1'] = {
        body: [{
            id: 1, title: 'One', url: '/blog/one/', is_published: true,
        }, {
            id: 2, title: 'Draft', url: '/blog/draft/', is_published: false,
        }],
    };
    routes['/v3/catalog/products?include=custom_fields&include_fields=id,name,categories,is_visible&limit=250&page=1'] = {
        body: {
            data: [
                {
                    id: 5, name: 'Fly', categories: [251, 398], is_visible: true, custom_fields: [{ id: 1, name: 'Sold by', value: 'fly' }],
                },
                {
                    id: 6, name: 'Bare', categories: [398], is_visible: true, custom_fields: [],
                },
            ],
            meta: { pagination: { total_pages: 1 } },
        },
    };
    return routes;
}

test('runApiProbes sends GETs only, and turns the reads into the evidence for probes 2, 3, 6, 8, 10, 12 and 15', async () => {
    const client = fakeClient(apiRoutes());
    const evidence = await runApiProbes({ client });
    assert.ok(client.calls.every(call => call.method === 'GET'));
    assert.deepEqual(evidence.probe2.category_tree_depth, {
        global: null, 1895766: null, 1: 3, 1855224: null,
    });
    assert.deepEqual(evidence.probe8.listing_mode, {
        global: 'current_category_only', 1895766: null, 1: null, 1855224: null,
    });
    assert.deepEqual(evidence.probe8.rootDirectProducts, { 1: { 398: 0 }, 1895766: {} });
    assert.equal(evidence.probe10['storefront-category'].scopes['1895766'].fields.find(field => field.key === 'listing_mode').state, 'inherits');
    assert.equal(evidence.probe6.contexts['1895766'].error, '422: Only the default channel');
    assert.equal(evidence.probe6.contexts.global.contexts, 1);
    assert.deepEqual(evidence.trees, [{ id: 1, name: 'Default', channels: [1, 1855224] }, { id: 2, name: 'CA', channels: [1895766] }]);
    assert.deepEqual(Object.keys(evidence.treeCategories), ['1', '1895766']);
    assert.equal(evidence.treeCategories['1'][0].name, 'Flies');
    assert.deepEqual(evidence.blogPosts, [{ id: 1, title: 'One', url: '/blog/one/' }]);
    assert.deepEqual(evidence.customFields, {
        scanned: 2,
        withFields: 1,
        fieldNames: { 'Sold by': 1 },
        samples: [{
            id: 5, name: 'Fly', categories: [251, 398], fields: ['Sold by'],
        }],
    });
    assert.equal(evidence.probe12.promotions, 0);
});

// A stand-in for the local stencil server.
function fakeServer(pages) {
    const requested = [];
    return {
        requested,
        fetch: async url => {
            const { pathname, search } = new URL(url);
            requested.push(`${pathname}${search}`);
            const page = pages[`${pathname}${search}`];
            if (!page) {
                return {
                    status: 404, ok: false, json: async () => ({}), text: async () => '',
                };
            }
            return {
                status: page.status || 200, ok: true, json: async () => page.body, text: async () => JSON.stringify(page.body),
            };
        },
    };
}

const homeContext = {
    settings: { channel_id: 1, theme_config_id: '00000000-0000-0000-0000-000000000001', client_ip_address: '203.0.113.9' },
    categories: [{
        id: '398',
        name: 'Flies',
        url: 'https://reelflies.ca/flies/',
        image: { data: 'x' },
        children: [{
            id: '251',
            name: 'Nymphs',
            url: 'https://reelflies.ca/flies/nymphs/',
            image: { data: 'y' },
            children: [{
                id: '9', name: 'Leaf', url: 'https://reelflies.ca/flies/nymphs/leaf/', image: null,
            }],
        }],
    }],
    carousel: { slides: [] },
};

test('pickProbeCategory takes the first menu category that has children, preferring the second level', () => {
    assert.equal(pickProbeCategory(homeContext), '/flies/nymphs/');
    assert.equal(pickProbeCategory({
        categories: [{
            id: '1', name: 'A', url: 'https://x/a/', children: [{ id: '2', name: 'B', url: 'https://x/a/b/' }],
        }],
    }), '/a/');
    assert.equal(pickProbeCategory({ categories: [] }), null);
});

test('runContextProbes checks the server\'s channel, runs the context probes and keeps no context', async () => {
    const server = fakeServer({
        '/?debug=context': { body: homeContext },
        '/cart.php?debug=context': { body: { cart: { multi_coupon_ui_enabled: true } } },
        '/flies/?debug=context': { body: { category: { total_products: 30, products: [{ id: 5 }] } } },
        '/flies/nymphs/?debug=context': { body: { category: { products: [{ id: 5, custom_fields: null }], subcategories: [{ id: 9, name: 'Leaf', image: null }] } } },
        '/blog/?debug=context': { body: { blog: { url: 'https://reelflies.ca/blog/', posts: [{ url: 'https://reelflies.ca/blog/one/' }] } } },
        '/blog/': { body: {} },
        '/blog/one/': { body: {} },
        '/blog/two/': { status: 404, body: {} },
    });
    const api = {
        treeCategories: {
            1: [{
                category_id: 398, parent_id: 0, name: 'Flies', sort_order: 0, is_visible: true,
            }, {
                category_id: 251, parent_id: 398, name: 'Nymphs', sort_order: 0, is_visible: true,
            }, {
                category_id: 9, parent_id: 251, name: 'Leaf', sort_order: 0, is_visible: true,
            }],
        },
        trees: [{ id: 1, channels: [1] }],
        blogPosts: [{ url: '/blog/one/' }, { url: '/blog/two/' }],
        customFields: { samples: [] },
        probe8: { rootDirectProducts: { 1: { 398: 0 } } },
    };
    const evidence = await runContextProbes({
        base: 'http://localhost:4401', channel: '1', api, fetch: server.fetch, problems: () => [],
    });
    assert.equal(evidence.channel, '1');
    assert.equal(evidence.probe1.verdict, 'pass');
    assert.equal(evidence.probe2.depth, 3);
    assert.equal(evidence.probe3.verdict, 'pass');
    assert.equal(evidence.probe4.verdict, 'partial');
    assert.equal(evidence.probe4.page, '/flies/nymphs/');
    assert.equal(evidence.probe5.slides, 0);
    assert.equal(evidence.probe7.multiCouponUiEnabled, true);
    assert.equal(evidence.probe8.verdict, 'pass');
    assert.deepEqual(evidence.probe8.rows[0], {
        id: '398', name: 'Flies', path: '/flies/', listed: 30, cards: 1, direct: 0, rollsUp: true,
    });
    assert.equal(evidence.probe14.verdict, 'pass');
    assert.deepEqual(evidence.probe15.statuses, [
        { path: '/blog/', status: 200 },
        { path: '/blog/one/', status: 200 },
        { path: '/blog/two/', status: 404 },
    ]);
    assert.equal(evidence.probe15.verdict, 'fail');
    assert.ok(!JSON.stringify(evidence).includes('203.0.113.9'), 'the context itself is never kept');
});

test('runContextProbes stops when the server renders another channel', async () => {
    const server = fakeServer({ '/?debug=context': { body: homeContext } });
    await assert.rejects(
        runContextProbes({
            base: 'http://localhost:4401', channel: '1895766', api: null, fetch: server.fetch, problems: () => ['renders channel 1, not QA_CHANNEL 1895766'],
        }),
        /renders channel 1/,
    );
});

test('runHostProbes keeps the trace\'s country and the blog status, never the address', async () => {
    const fetchStub = async url => {
        const { hostname, pathname } = new URL(url);
        if (pathname === '/cdn-cgi/trace') return { status: 200, text: async () => `h=${hostname}\nip=203.0.113.9\ncolo=YYZ\nloc=CA\n` };
        return { status: 503, text: async () => 'Coming Soon' };
    };
    const evidence = await runHostProbes({ fetch: fetchStub });
    assert.equal(evidence.probe11.verdict, 'pass');
    assert.equal(evidence.probe11.hosts.length, 4);
    assert.deepEqual(evidence.probe15Anonymous, { host: 'reelflies_ca-1895766.mybigcommerce.com', path: '/blog/', status: 503 });
    assert.ok(!JSON.stringify(evidence).includes('203.0.113.9'));
});

test('probe 4 passes on a card whose product has a custom field, even when the picked page has none', async () => {
    const server = fakeServer({
        '/?debug=context': { body: homeContext },
        '/cart.php?debug=context': { body: { cart: {} } },
        '/flies/?debug=context': { body: { category: { total_products: 1, products: [] } } },
        '/flies/nymphs/?debug=context': { body: { category: { products: [{ id: 5, custom_fields: null }], subcategories: [] } } },
        '/flies/nymphs/leaf/?debug=context': { body: { category: { products: [{ id: 77, custom_fields: [{ name: 'Sold by', value: 'fly' }] }] } } },
        '/blog/?debug=context': { body: {} },
    });
    const api = { customFields: { samples: [{ id: 77, fields: ['Sold by'], categories: [9] }] } };
    const evidence = await runContextProbes({
        base: 'http://localhost:4401', channel: '1', api, fetch: server.fetch, problems: () => [],
    });
    assert.equal(evidence.probe4.pageVerdict, 'partial');
    assert.equal(evidence.probe4.verdict, 'pass');
    assert.deepEqual(evidence.probe4.sample.cardFields, ['Sold by']);
});
