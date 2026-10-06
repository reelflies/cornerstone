// The store API client for the store-write helper (W0-11): JSON over HTTPS to
// https://api.bigcommerce.com/stores/<hash>/, with the token as the X-Auth-Token header.
//
//   import { createClient, describeFailure } from './client.mjs';
//   const client = createClient({ storeHash, token, readOnly: true });   // plan.mjs: GET only
//   const { status, ok, body } = await client.get('/v3/settings/inventory', { channel_id: 1895766 });
//
// - A read-only client refuses any other method before it sends anything. plan.mjs uses one, so
//   a plan can't write, whichever token it holds.
// - The client retries nothing: a write sent twice could create two objects. A failed read
//   before any write stops the plan or the apply, which is run again; apply.mjs tries each GET
//   after a write up to 3 times, because part 3 must be read.
// - Errors and failure descriptions carry the status and BigCommerce's own title, never the
//   request's headers. Callers print through release-redact.mjs anyway.

export const API_HOST = 'https://api.bigcommerce.com';

const QUERY_KEY = /^[a-z_]+(:[a-z]+)?$/;
const STORE_HASH = /^[a-z0-9]{4,32}$/;

// "?a=1&b:in=2", keys sorted, so a read's key and its route are the same string every time.
export function queryString(query) {
    const entries = Object.entries(query || {}).sort(([a], [b]) => (a < b ? -1 : 1));
    if (!entries.length) return '';
    return `?${entries.map(([key, value]) => {
        if (!QUERY_KEY.test(key)) throw new Error(`"${key}" isn't a query key the helper sends`);
        return `${key}=${encodeURIComponent(String(value))}`;
    }).join('&')}`;
}

export function createClient({
    storeHash, token, fetch: fetchImpl = fetch, readOnly = false,
}) {
    if (!STORE_HASH.test(String(storeHash))) throw new Error(`${JSON.stringify(storeHash)} isn't a store hash`);
    if (!token) throw new Error('the store client has no token');
    async function request({
        method, path, query, body,
    }) {
        if (readOnly && method !== 'GET') throw new Error(`this client is read-only: ${method} ${path} refused`);
        const headers = { 'X-Auth-Token': token, Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        const response = await fetchImpl(`${API_HOST}/stores/${storeHash}${path}${queryString(query)}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await response.text();
        let parsed = null;
        try {
            parsed = text ? JSON.parse(text) : null;
        } catch {
            parsed = null;
        }
        return {
            status: response.status, ok: response.ok, body: parsed, text,
        };
    }
    return { request, get: (path, query) => request({ method: 'GET', path, query }) };
}

const clip = (text, length = 200) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

// "422: Invalid (channel_id: is required)": the status and BigCommerce's title and errors.
export function describeFailure(response) {
    const { status, body } = response;
    if (body && typeof body === 'object' && body.title) {
        const errors = body.errors && typeof body.errors === 'object' ? Object.entries(body.errors).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`) : [];
        return clip(`${status}: ${body.title}${errors.length ? ` (${errors.join('; ')})` : ''}`, 250);
    }
    const text = (response.text || '').replace(/\s+/g, ' ').trim();
    return clip(`${status}${text ? `: ${text}` : ''}`, 250);
}
