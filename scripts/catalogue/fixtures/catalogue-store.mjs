// A small in-memory catalogue for the apply tests (ticket 18): a fetch that answers the reads and
// the four PUTs apply may send, and keeps their effect, so a test can apply a plan, restore it and
// see the store back where it began. It never reaches the network.
//
//   import { fakeCatalogue } from './fixtures/catalogue-store.mjs';
//   const store = fakeCatalogue({ products: [...], brands: [...] });
//   const client = createClient({ storeHash: STORE_HASH, token: FAKE_TOKEN, fetch: store.fetch });
//   store.calls        // every request, in order
//   store.product(101) // the product as it is now
//
// Like BigCommerce, a PUT of an option's option_values keeps only the values it lists, and making
// an image the thumbnail clears the old one. `answers` queues answers to send instead, by
// "METHOD path" (for example a 429 or a 500), each used once.

import { STORE_HASH } from '../../store/fixtures/store.mjs';

const clone = value => JSON.parse(JSON.stringify(value));

export function fakeCatalogue({ products = [], brands = [] } = {}, { answers = {}, writeAnyway = false } = {}) {
    const state = { products: new Map(products.map(product => [product.id, clone(product)])), brands: new Map(brands.map(brand => [brand.id, clone(brand)])) };
    const queued = new Map(Object.entries(answers).map(([key, list]) => [key, [...list]]));
    const calls = [];
    const json = (status, body, headers = {}) => new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

    function write(kind, ids, body) {
        if (kind === 'brand') {
            Object.assign(state.brands.get(ids[0]), body);
            return state.brands.get(ids[0]);
        }
        const product = state.products.get(ids[0]);
        if (kind === 'product') {
            Object.assign(product, body);
            return product;
        }
        if (kind === 'image') {
            const image = product.images.find(candidate => candidate.id === ids[1]);
            if (body.is_thumbnail) product.images.forEach(other => { other.is_thumbnail = other === image; }); // eslint-disable-line no-param-reassign
            if ('description' in body) image.description = body.description;
            return image;
        }
        const option = product.options.find(candidate => candidate.id === ids[1]);
        if (body.display_name) option.display_name = body.display_name;
        if (body.option_values) option.option_values = body.option_values.map(value => ({ ...option.option_values.find(old => old.id === value.id), ...value }));
        return option;
    }

    const fetch = async (url, init = {}) => {
        const parsed = new URL(url);
        const prefix = `/stores/${STORE_HASH}`;
        if (parsed.origin !== 'https://api.bigcommerce.com' || !parsed.pathname.startsWith(prefix)) throw new Error(`fake catalogue: unexpected URL ${url}`);
        const method = init.method || 'GET';
        const apiPath = parsed.pathname.slice(prefix.length);
        const body = init.body === undefined ? undefined : JSON.parse(init.body);
        calls.push({
            method, path: apiPath, query: Object.fromEntries(parsed.searchParams), body,
        });
        const queue = queued.get(`${method} ${apiPath}`);
        if (queue && queue.length) {
            const answer = queue.shift();
            if (writeAnyway && method === 'PUT') fetch.write(apiPath, body);
            return json(answer.status, answer.body, answer.headers);
        }
        if (method === 'GET' && apiPath === '/v3/catalog/products') {
            const ids = (parsed.searchParams.get('id:in') || '').split(',').filter(Boolean).map(Number);
            return json(200, { data: ids.filter(id => state.products.has(id)).map(id => clone(state.products.get(id))), meta: { pagination: { total_pages: 1 } } });
        }
        const brandRead = apiPath.match(/^\/v3\/catalog\/brands\/(\d+)$/);
        if (method === 'GET' && brandRead) {
            const brand = state.brands.get(Number(brandRead[1]));
            return brand ? json(200, { data: clone(brand) }) : json(404, { title: 'not found' });
        }
        if (method === 'PUT') return fetch.write(apiPath, body);
        throw new Error(`fake catalogue: no answer for ${method} ${apiPath}`);
    };
    fetch.write = (apiPath, body) => {
        const routes = [
            ['option', /^\/v3\/catalog\/products\/(\d+)\/options\/(\d+)$/],
            ['image', /^\/v3\/catalog\/products\/(\d+)\/images\/(\d+)$/],
            ['product', /^\/v3\/catalog\/products\/(\d+)$/],
            ['brand', /^\/v3\/catalog\/brands\/(\d+)$/],
        ];
        for (const [kind, pattern] of routes) {
            const match = apiPath.match(pattern);
            if (match) return json(200, { data: clone(write(kind, match.slice(1).map(Number), body)) });
        }
        throw new Error(`fake catalogue: no write for ${apiPath}`);
    };
    return {
        fetch, calls, product: id => clone(state.products.get(id)), brand: id => clone(state.brands.get(id)),
    };
}
