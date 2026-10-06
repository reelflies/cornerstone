// Tests scripts/store/client.mjs (W0-11) against the fixture fetch: no network, no token.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    REQUEST_TIMEOUT_MS, createClient, describeFailure, queryString,
} from './client.mjs';
import { FAKE_TOKEN, STORE_HASH, fixtureFetch } from './fixtures/store.mjs';

test('the query string sorts its keys, keeps the filter colon, and encodes values', () => {
    assert.equal(queryString({}), '');
    assert.equal(queryString(undefined), '');
    assert.equal(queryString({ page: 2, 'channel_id:in': 1895766, limit: 250 }), '?channel_id:in=1895766&limit=250&page=2');
    assert.equal(queryString({ name: 'a b&c' }), '?name=a%20b%26c');
    assert.throws(() => queryString({ 'a=b': 1 }), /isn't a query key/);
});

test('requests go to the store API with the token as a header, and parse the JSON answer', async () => {
    const calls = [];
    const fetch = fixtureFetch({ 'PUT /v3/content/placements/abc': { body: { data: { uuid: 'abc', channel_id: 1895766 } } } }, { calls });
    const client = createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch });
    const response = await client.request({ method: 'PUT', path: '/v3/content/placements/abc', body: { status: 'inactive', channel_id: 1895766 } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { data: { uuid: 'abc', channel_id: 1895766 } });
    assert.deepEqual(calls, [{
        method: 'PUT', path: '/v3/content/placements/abc', body: { status: 'inactive', channel_id: 1895766 }, token: FAKE_TOKEN,
    }]);
});

test('a read-only client refuses anything but GET before any request', async () => {
    const calls = [];
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: fixtureFetch({}, { calls }), readOnly: true,
    });
    await assert.rejects(client.request({ method: 'PUT', path: '/v3/settings/inventory', body: {} }), /read-only: PUT \/v3\/settings\/inventory refused/);
    assert.deepEqual(calls, []);
});

test('the store hash and the token are checked before use', () => {
    assert.throws(() => createClient({ storeHash: '../x', token: FAKE_TOKEN }), /isn't a store hash/);
    assert.throws(() => createClient({ storeHash: STORE_HASH, token: '' }), /no token/);
});

test('a failure names the status and BigCommerce\'s title, never the token', async () => {
    const fetch = fixtureFetch({ 'GET /v3/content/widgets': { status: 403, body: { status: 403, title: 'You don\'t have a required scope to access the endpoint', type: 'https://developer.bigcommerce.com/api-docs/getting-started/api-status-codes' } } });
    const client = createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch });
    const response = await client.get('/v3/content/widgets');
    assert.equal(response.ok, false);
    const text = describeFailure(response);
    assert.equal(text, '403: You don\'t have a required scope to access the endpoint');
    assert.ok(!text.includes(FAKE_TOKEN));
    assert.equal(describeFailure({ status: 422, body: { title: 'Invalid', errors: { channel_id: 'is required' } } }), '422: Invalid (channel_id: is required)');
    assert.equal(describeFailure({ status: 500, body: null, text: 'x'.repeat(500) }).length < 260, true);
});

test('a request with no answer in time is abandoned, so a hung write reaches part 3 in the same run', { timeout: 10000 }, async () => {
    // A fetch that answers only when it is aborted, as a socket BigCommerce never answers on.
    const hanging = (url, init = {}) => new Promise((resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('the client never gave up')), 5000);
        if (!init.signal) return;
        init.signal.addEventListener('abort', () => {
            clearTimeout(keepAlive);
            reject(init.signal.reason);
        });
    });
    const client = createClient({
        storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: hanging, timeoutMs: 50,
    });
    await assert.rejects(client.request({
        method: 'PUT', path: '/v3/settings/inventory', query: { channel_id: 1895766 }, body: {},
    }), error => {
        assert.equal(error.message, 'PUT /v3/settings/inventory?channel_id=1895766 got no answer within 0.05 s');
        assert.ok(!error.message.includes(FAKE_TOKEN));
        return true;
    });
    // By default well under the 120 s after which Claude Code's Bash tool kills a command.
    assert.equal(REQUEST_TIMEOUT_MS, 30000);
    let signal = null;
    const answered = createClient({
        storeHash: STORE_HASH,
        token: FAKE_TOKEN,
        fetch: async (url, init) => {
            ({ signal } = init);
            return new Response('{}', { status: 200 });
        },
    });
    await answered.get('/v3/content/widgets');
    assert.ok(signal instanceof AbortSignal, 'every request carries a timeout');
});
