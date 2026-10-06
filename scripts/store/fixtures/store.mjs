// Test doubles for the store helper's tests (W0-11): the fixture responses, and a fetch that
// answers from a route table instead of the network. No test needs a token or a store.
//
//   import { loadFixture, fixtureFetch, STORE_HASH } from './fixtures/store.mjs';
//   const calls = [];
//   const fetch = fixtureFetch({ 'GET /v3/settings/inventory?channel_id=1895766': { body: ... } }, { calls });
//
// A route is "<METHOD> <path and query>", the query keys sorted as the client sends them. Its
// answer is { status, body } (status 200 by default), a list of answers given in turn (the last
// one repeats), or a function of the call. A request with no route throws, so a test never
// passes on a call it didn't expect.
//
// The JSON files are shaped on BigCommerce's documented responses, not captured from this store:
// no store API token exists yet (W0-12). The first real plan runs dry (plan only) and records
// the store's real shapes.

import fs from 'fs';
import { fileURLToPath } from 'url';

export const STORE_HASH = 'abc123test';
export const FAKE_TOKEN = 'faketoken0123456789abcdefghijkl';

const DIR = fileURLToPath(new URL('./', import.meta.url));

export function loadFixture(name) {
    return JSON.parse(fs.readFileSync(`${DIR}${name}`, 'utf8'));
}

export function fixtureFetch(routes, { calls = [], record } = {}) {
    const queues = new Map(Object.entries(routes).map(([key, answer]) => [key, Array.isArray(answer) ? [...answer] : [answer]]));
    return async (url, init = {}) => {
        const parsed = new URL(url);
        const prefix = `/stores/${STORE_HASH}`;
        if (parsed.origin !== 'https://api.bigcommerce.com' || !parsed.pathname.startsWith(prefix)) throw new Error(`fixture fetch: unexpected URL ${url}`);
        const method = init.method || 'GET';
        const key = `${method} ${parsed.pathname.slice(prefix.length)}${parsed.search}`;
        const call = {
            method, path: `${parsed.pathname.slice(prefix.length)}${parsed.search}`, body: init.body === undefined ? undefined : JSON.parse(init.body), token: init.headers?.['X-Auth-Token'],
        };
        calls.push(call);
        if (record) record(call);
        const queue = queues.get(key);
        if (!queue) throw new Error(`fixture fetch: no route for ${key}`);
        const next = queue.length > 1 ? queue.shift() : queue[0];
        const answer = typeof next === 'function' ? next(call) : next;
        return new Response(answer.body === undefined ? '' : JSON.stringify(answer.body), { status: answer.status || 200, headers: { 'Content-Type': 'application/json' } });
    };
}
