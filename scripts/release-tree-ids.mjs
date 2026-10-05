// Reads the category ids in a channel's category tree, for the release guard's menu id rule
// (ticket 15). Two read-only calls:
//
//   GET /v3/catalog/trees?channel_id:in=<channel>
//   GET /v3/catalog/trees/categories?tree_id:in=<tree>&limit=250&page=<n>   (every page)
//
// They need a store API token with Products: read-only (store_v2_products_read_only), passed as
// RF_BC_API_TOKEN. The Stencil-CLI token can't read the catalogue. The token is sent as a header
// and never printed.

const API = 'https://api.bigcommerce.com/stores';
const PAGE_SIZE = 250; // the endpoint's maximum

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

// A GET that returns the parsed body. Errors name the status, never the token.
export function tokenGetJson(token) {
    return async url => {
        const response = await fetch(url, { method: 'GET', headers: { 'X-Auth-Token': token, Accept: 'application/json' } });
        if (!response.ok) {
            const hint = response.status === 401 || response.status === 403 ? ' (RF_BC_API_TOKEN needs Products: read-only)' : '';
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
