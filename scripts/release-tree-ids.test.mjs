import test from 'node:test';
import assert from 'node:assert/strict';
import {
    categoryIdsFromPage, fetchChannelCategoryIds, readGuardToken, tokenGetJson, treeIdForChannel,
} from './release-tree-ids.mjs';

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

// --- The read-only token, through W0-11's loader (scripts/lib/store-token.mjs) -----------------

const FAKE = 'faketoken0123456789abcdefghijkl';
const keychain = answer => {
    const calls = [];
    return {
        calls,
        security: args => {
            calls.push(args);
            return answer ? { status: 0, stdout: `${answer}\n`, stderr: '' } : { status: 44, stdout: '', stderr: 'not found\n' };
        },
    };
};
const loader = extra => ({ platform: 'darwin', env: {}, ...extra });

test('the guard reads the read-only token through the store token loader: RF_BC_READ_TOKEN, then RF_BC_API_TOKEN, then the Keychain', () => {
    const none = keychain(null);
    const other = 'other0123456789abcdefghij';
    assert.deepEqual(readGuardToken(loader({ env: { RF_BC_API_TOKEN: FAKE }, security: none.security })), { token: FAKE, source: '$RF_BC_API_TOKEN' });
    assert.equal(readGuardToken(loader({ env: { RF_BC_READ_TOKEN: FAKE, RF_BC_API_TOKEN: other }, security: none.security })).token, FAKE);
    assert.deepEqual(none.calls, [], 'an exported token is never skipped for the Keychain');
    const item = keychain(FAKE);
    assert.deepEqual(readGuardToken(loader({ security: item.security })), { token: FAKE, source: 'Keychain item "reelflies-bc-read" (account "reelflies")' });
    assert.deepEqual(item.calls, [['find-generic-password', '-a', 'reelflies', '-s', 'reelflies-bc-read', '-w']]);
});

test('without the token, the guard\'s message names the scope and where the token comes from, and never asks for it in a chat', () => {
    assert.throws(() => readGuardToken(loader({ security: keychain(null).security })), error => {
        assert.match(error.message, /the read-only store API token \(Products: read-only, store_v2_products_read_only\)/);
        assert.match(error.message, /no RF_BC_READ_TOKEN in the environment and no Keychain item "reelflies-bc-read"/);
        assert.match(error.message, /never in a chat/);
        return true;
    });
});

test('a 401 or 403 from the catalogue names the read-only token\'s scope, never the token', async () => {
    const sent = [];
    const request = async (url, init) => {
        sent.push([url, init.method, init.headers['X-Auth-Token']]);
        return { ok: false, status: 403, statusText: 'Forbidden' };
    };
    await assert.rejects(tokenGetJson(FAKE, { request })('https://api.bigcommerce.com/stores/abc/v3/catalog/trees'), error => {
        assert.match(error.message, /answered 403 Forbidden \(the read-only store API token needs Products: read-only\)/);
        assert.ok(!error.message.includes(FAKE));
        return true;
    });
    assert.deepEqual(sent, [['https://api.bigcommerce.com/stores/abc/v3/catalog/trees', 'GET', FAKE]]);
});
