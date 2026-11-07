// The box: the shopper's cart, read and changed through the Storefront Cart API
// (/api/storefront/carts), for the order line, the box sheet, the header count and the cards.
//
// - load(cartId): reads the cart once, when the page has one (context.cartId); with none it is
//   empty and nothing is fetched.
// - change({ productId, variantId, delta, meta }): adds or removes flies of one size. The change
//   shows at once (lines() includes it while it waits) and the calls run one at a time, each from
//   the cart the last one returned, so quick taps add up exactly. A refused or failed call is
//   dropped, the box goes back to the store's cart, and the promise rejects with the store's own
//   words where it sent any. `meta` describes a line the store hasn't returned yet (name, size,
//   image, price, brand, url).
// - lines(): every line, in the order its pattern first went in, with what is waiting applied.
// - subscribe(listener): called after every change, with no arguments.
//
// No size is ever added that the caller didn't name: change() only ever sends the variant it was
// given.

const API = '/api/storefront/carts';
const INCLUDE = 'include=lineItems.physicalItems.options,lineItems.digitalItems.options';

let cart = null;
let loaded = false;
const waiting = [];
const listeners = new Set();
let running = Promise.resolve();

const keyOf = (productId, variantId) => `${productId}:${variantId || ''}`;

function notify() {
    listeners.forEach(listener => {
        try {
            listener();
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error('ReelFlies box listener failed', error);
        }
    });
}

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function isLoaded() {
    return loaded;
}

function storeLines() {
    if (!cart || !cart.lineItems) return [];
    const items = [...(cart.lineItems.physicalItems || []), ...(cart.lineItems.digitalItems || [])];
    return items.filter(item => !item.parentId).map(item => ({
        key: keyOf(item.productId, item.variantId),
        itemId: item.id,
        productId: String(item.productId),
        variantId: item.variantId,
        name: item.name,
        url: item.url,
        imageUrl: item.imageUrl,
        brand: item.brand || '',
        size: item.options && item.options[0] ? String(item.options[0].value) : '',
        quantity: item.quantity,
        price: Number(item.salePrice),
    }));
}

export function lines() {
    const all = storeLines();
    const byKey = new Map(all.map(line => [line.key, line]));
    waiting.forEach(({
        productId, variantId, delta, meta,
    }) => {
        const key = keyOf(productId, variantId);
        let line = byKey.get(key);
        if (!line) {
            line = {
                key,
                itemId: null,
                productId: String(productId),
                variantId,
                quantity: 0,
                ...meta,
            };
            byKey.set(key, line);
            all.push(line);
        }
        line.quantity += delta;
    });
    return all.filter(line => line.quantity > 0);
}

export function totals(flyBrands = []) {
    const all = lines();
    const units = all.reduce((sum, line) => sum + line.quantity, 0);
    const amount = all.reduce((sum, line) => sum + line.quantity * (line.price || 0), 0);
    const isFly = line => flyBrands.includes(String(line.brand || '').trim());
    const flyAmount = all.filter(isFly).reduce((sum, line) => sum + line.quantity * (line.price || 0), 0);
    return {
        units,
        amount,
        flyAmount,
        patterns: new Set(all.map(line => line.productId)).size,
        flies: all.length > 0 && flyBrands.length > 0 && all.every(isFly),
    };
}

async function call(method, path, body) {
    const response = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}${INCLUDE}`, {
        method,
        credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await response.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch (error) {
        json = null;
    }
    if (!response.ok) {
        const reason = json && (json.title || json.detail);
        const error = new Error(reason || `Cart ${response.status}`);
        error.storeWords = Boolean(reason);
        throw error;
    }
    return json;
}

export async function load(cartId) {
    if (cartId) {
        try {
            const found = await call('GET', '');
            cart = Array.isArray(found) ? (found[0] || null) : found;
        } catch (error) {
            cart = null;
        }
    }
    loaded = true;
    notify();
}

async function send({ productId, variantId, delta }) {
    const line = storeLines().find(found => found.key === keyOf(productId, variantId));
    const target = (line ? line.quantity : 0) + delta;
    const item = { productId: Number(productId), quantity: target };
    if (variantId) item.variantId = Number(variantId);
    if (target <= 0) {
        if (!line) return;
        cart = await call('DELETE', `/${cart.id}/items/${line.itemId}`);
    } else if (line) {
        cart = await call('PUT', `/${cart.id}/items/${line.itemId}`, { lineItem: item });
    } else if (cart) {
        cart = await call('POST', `/${cart.id}/items`, { lineItems: [{ ...item, quantity: delta }] });
    } else {
        cart = await call('POST', '', { lineItems: [{ ...item, quantity: delta }] });
    }
    if (cart && Array.isArray(cart)) cart = cart[0] || null;
    if (cart && !cart.lineItems) cart = null;
}

export function change(request) {
    const entry = { ...request, meta: request.meta || {} };
    waiting.push(entry);
    notify();
    const done = running.then(() => send(entry)).finally(() => {
        waiting.splice(waiting.indexOf(entry), 1);
        notify();
    });
    running = done.catch(() => {});
    return done;
}
