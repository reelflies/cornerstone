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
// - setQuantity({ productId, variantId, quantity, meta }): the same, to a quantity rather than by
//   a step, for the size pickers and the order list, whose fields show what the box holds.
// - lines(): every line, in the order its pattern first went in, with what is waiting applied.
// - subscribe(listener): called after every change, with no arguments.
//
// No size is ever added that the caller didn't name: change() only ever sends the variant it was
// given.
//
// The store's data layer (BigCommerce's BODL, window.bodlEvents, which feeds the store's GA4 and
// other analytics) hears of the store's own adds and removals from stencil-utils. Changes made
// here go round it, so each one that the store accepts tells it the same way: an add or a removal
// of that line's quantity, with the line as the store returned it (setChannel names the channel).

const API = '/api/storefront/carts';
const INCLUDE = 'include=lineItems.physicalItems.options,lineItems.digitalItems.options';

let cart = null;
let loaded = false;
const waiting = [];
const listeners = new Set();
let running = Promise.resolve();

let channelId = null;

const keyOf = (productId, variantId) => `${productId}:${variantId || ''}`;

export function setChannel(id) {
    channelId = Number(id) || null;
}

const itemsOf = found => (found && found.lineItems ? [...(found.lineItems.physicalItems || []), ...(found.lineItems.digitalItems || [])] : []);
const itemIn = (found, productId, variantId) => itemsOf(found).find(item => !item.parentId
    && String(item.productId) === String(productId) && (!variantId || Number(item.variantId) === Number(variantId)));

function eventId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// One add or removal for the data layer, in the shape stencil-utils sends for the store's own.
export function tellDataLayer(added, item, quantity, currency) {
    const bodl = window.bodlEvents;
    const kind = added ? 'AddCartItemEvent' : 'RemoveCartItemEvent';
    if (!item || !quantity || !bodl || !bodl.cart || typeof bodl.cart.emit !== 'function' || !bodl[kind]) return;
    const price = Number(item.salePrice || item.listPrice || 0);
    const base = Number(item.listPrice || price);
    try {
        bodl.cart.emit(bodl[kind].CREATE, {
            event_id: eventId(),
            channel_id: channelId,
            currency,
            product_value: base * quantity,
            line_items: [{
                product_id: String(item.productId),
                variant_id: item.variantId,
                sku: item.sku,
                product_name: item.name,
                brand_name: item.brand,
                quantity,
                base_price: base,
                sale_price: price,
                purchase_price: price,
                discount: 0,
                currency,
            }],
        });
    } catch (error) {
        // analytics never stops a change
    }
}

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

// A line's size: the option whose name holds "size" (Fat Albert's colour comes first), else its
// one option.
function sizeOf(options) {
    if (!options || !options.length) return '';
    const sized = options.find(option => /size/i.test(option.name || ''));
    return String((sized || options[0]).value);
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
        size: sizeOf(item.options),
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
    const before = cart;
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
    const currencyOf = found => (found && found.currency ? found.currency.code : undefined);
    if (delta > 0) tellDataLayer(true, itemIn(cart, productId, variantId), delta, currencyOf(cart));
    else tellDataLayer(false, itemIn(before, productId, variantId), -delta, currencyOf(before));
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

// How many of one variant the box holds, with what is waiting applied.
export function quantityOf(productId, variantId) {
    const line = lines().find(found => found.key === keyOf(productId, variantId));
    return line ? line.quantity : 0;
}

// Sets the box's quantity of one variant (0 removes it): the change from what it holds now,
// queued like any other. Resolves at once when nothing changes.
export function setQuantity({
    productId, variantId, quantity, meta,
}) {
    const target = Math.max(0, Math.round(Number(quantity) || 0));
    const delta = target - quantityOf(productId, variantId);
    if (!delta) return Promise.resolve();
    return change({
        productId, variantId, delta, meta,
    });
}
