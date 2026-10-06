// Reads the category ids in a channel's category tree, for the release guard's menu id rule
// (ticket 15). Two read-only calls:
//
//   GET /v3/catalog/trees?channel_id:in=<channel>
//   GET /v3/catalog/trees/categories?tree_id:in=<tree>&limit=250&page=<n>   (every page)
//
// They need the read-only store API token, with Products: read-only (store_v2_products_read_only).
// The Stencil-CLI token can't read the catalogue. readGuardToken gets it through W0-11's loader
// (scripts/lib/store-token.mjs): RF_BC_READ_TOKEN, then RF_BC_API_TOKEN, then the Keychain item
// "reelflies-bc-read". The token is sent as a header and never printed.

import { readStoreToken } from './lib/store-token.mjs';

const API = 'https://api.bigcommerce.com/stores';
const PAGE_SIZE = 250; // the endpoint's maximum
const SCOPE = 'the read-only store API token (Products: read-only, store_v2_products_read_only)';

// { token, source } for the guard's menu id rule, or an Error naming the scope and where the token
// comes from. `options` are readStoreToken's, for the tests.
export function readGuardToken(options) {
    try {
        return readStoreToken('read', options);
    } catch (error) {
        throw new Error(`${SCOPE}: ${error.message}`);
    }
}

export function treeIdForChannel(response, channelId) {
    const trees = (response.data || []).filter(tree => (tree.channels || []).map(Number).includes(Number(channelId)));
    if (!trees.length) throw new Error(`channel ${channelId} has no category tree`);
    if (trees.length > 1) throw new Error(`channel ${channelId} has ${trees.length} category trees (${trees.map(tree => tree.id).join(', ')})`);
    return trees[0].id;
}

export function categoryIdsFromPage(response) {
    const pagination = response.meta && response.meta.pagination;
    return {
        ids: (response.data || []).map(category => category.category_id),
        totalPages: pagination && pagination.total_pages ? pagination.total_pages : 1,
    };
}

// A GET that returns the parsed body. Errors name the status, never the token. `request` is
// fetch, or a stand-in in the tests.
export function tokenGetJson(token, { request = fetch } = {}) {
    return async url => {
        const response = await request(url, { method: 'GET', headers: { 'X-Auth-Token': token, Accept: 'application/json' } });
        if (!response.ok) {
            const hint = response.status === 401 || response.status === 403 ? ' (the read-only store API token needs Products: read-only)' : '';
            throw new Error(`GET ${url} answered ${response.status} ${response.statusText}${hint}`);
        }
        return response.json();
    };
}

export async function fetchChannelCategoryIds({ channelId, storeHash, getJson }) {
    const base = `${API}/${storeHash}/v3/catalog`;
    const treeId = treeIdForChannel(await getJson(`${base}/trees?channel_id:in=${channelId}`), channelId);
    const ids = [];
    let totalPages = 1;
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        // Pages are read one after another, because each one says how many there are.
        // eslint-disable-next-line no-await-in-loop
        const result = categoryIdsFromPage(await getJson(`${base}/trees/categories?tree_id:in=${treeId}&limit=${PAGE_SIZE}&page=${pageNumber}`));
        ids.push(...result.ids);
        totalPages = result.totalPages;
    }
    return ids;
}
