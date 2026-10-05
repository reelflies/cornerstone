import test from 'node:test';
import assert from 'node:assert/strict';
import { categoryIdsFromPage, fetchChannelCategoryIds, treeIdForChannel } from './release-tree-ids.mjs';

// Response shapes from GET /v3/catalog/trees and GET /v3/catalog/trees/categories (trimmed).
const TREES = { data: [{ id: 4, name: 'ReelFlies CA', channels: [1895766] }], meta: {} };
const page = (ids, currentPage, totalPages) => ({
    data: ids.map(id => ({
        category_id: id, parent_id: 0, tree_id: 4, name: `Category ${id}`, is_visible: true,
    })),
    meta: {
        pagination: {
            total: 3, count: ids.length, per_page: 2, current_page: currentPage, total_pages: totalPages,
        },
    },
});

test('the channel\'s tree id comes from the trees list', () => {
    assert.equal(treeIdForChannel(TREES, 1895766), 4);
});

test('a channel without a tree, or with more than one, is an error', () => {
    assert.throws(() => treeIdForChannel({ data: [] }, 1895766), /channel 1895766 has no category tree/);
    const two = { data: [{ id: 1, channels: [1895766] }, { id: 4, channels: [1895766] }] };
    assert.throws(() => treeIdForChannel(two, 1895766), /2 category trees/);
});

test('a categories page gives its category ids and the page count', () => {
    assert.deepEqual(categoryIdsFromPage(page([23, 24], 1, 2)), { ids: [23, 24], totalPages: 2 });
    assert.deepEqual(categoryIdsFromPage({ data: [] }), { ids: [], totalPages: 1 });
});

test('the fetch reads the tree, then every page of its categories, with GET requests only', async () => {
    const requested = [];
    const responses = {
        'https://api.bigcommerce.com/stores/abc123/v3/catalog/trees?channel_id:in=1895766': TREES,
        'https://api.bigcommerce.com/stores/abc123/v3/catalog/trees/categories?tree_id:in=4&limit=250&page=1': page([23, 24], 1, 2),
        'https://api.bigcommerce.com/stores/abc123/v3/catalog/trees/categories?tree_id:in=4&limit=250&page=2': page([25], 2, 2),
    };
    const getJson = async url => {
        requested.push(url);
        if (!responses[url]) throw new Error(`unexpected request ${url}`);
        return responses[url];
    };
    const ids = await fetchChannelCategoryIds({ channelId: 1895766, storeHash: 'abc123', getJson });
    assert.deepEqual(ids, [23, 24, 25]);
    assert.deepEqual(requested, Object.keys(responses));
});
