// The cart reader (ticket 42; spec module 17; build pipeline 6.9's fixed interface; story 40): what
// the cart holds, by product, from the Storefront Cart API. Ticket 42's marks and lines
// (cart-marks.js) read it on the product page and the listings, and ticket 44's quick-add rows read
// it when their panel opens, whichever way rf_cart_state is set, so their steppers start from the
// real quantities.
//
//   import { readCart, sizeCounts } from './cart-state';
//   const cart = await readCart(); // { cartId, products } or null
//   const fly = cart && cart.products.get(5663); // { total, lines: [{ lineItemId, variantId, optionValueIds, quantity }] }
//
// - One GET of /api/storefront/carts?include=lineItems.physicalItems.options, as the session's own
//   request, each time it is called: a read after a change is never an answer from before it.
// - It resolves null when the read fails (a network error, an answer that isn't 2xx, a body that
//   isn't JSON), and never rejects, so a failed read can't stop anything, an add least of all.
// - No cart yet is { cartId: null, products: an empty Map }.
// - products is keyed by the product's id, a number. A product's total adds up all its lines;
//   each line keeps its option value ids (numbers: a size's is its pill radio's value, ticket 37),
//   in the order the Cart API gives them.
// - Physical and digital lines count. Gift certificates and custom items have no product, and a
//   line with a parentId is an item another product's pick list added, so none of those does.
//
// It imports nothing and touches no DOM: ticket 44 imports it into quick add's chunk, and a module
// two chunks import is split out and counted against both budgets (check-bundle.mjs).

export const CART_URL = '/api/storefront/carts?include=lineItems.physicalItems.options';

const positiveInteger = value => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
};

// The Cart API's answer (a list of carts; the storefront has one) as { cartId, products }.
export function mapCart(carts) {
    const products = new Map();
    const cart = Array.isArray(carts) && carts[0] && typeof carts[0] === 'object' ? carts[0] : null;
    if (!cart) return { cartId: null, products };
    const { physicalItems = [], digitalItems = [] } = cart.lineItems || {};
    physicalItems.concat(digitalItems).forEach(item => {
        const productId = positiveInteger(item && item.productId);
        if (!productId || item.parentId) return;
        const quantity = Math.max(0, Number(item.quantity) || 0);
        const product = products.get(productId) || { total: 0, lines: [] };
        product.total += quantity;
        product.lines.push({
            lineItemId: item.id,
            variantId: positiveInteger(item.variantId),
            optionValueIds: (Array.isArray(item.options) ? item.options : []).map(option => positiveInteger(option && option.valueId)).filter(Boolean),
            quantity,
        });
        products.set(productId, product);
    });
    return { cartId: cart.id || null, products };
}

// One product's quantity by option value id: Map<optionValueId, quantity>, adding up every line
// that has the value (a size's count across every Colour, for example).
export function sizeCounts(product) {
    const counts = new Map();
    if (!product) return counts;
    product.lines.forEach(({ optionValueIds, quantity }) => {
        optionValueIds.forEach(id => counts.set(id, (counts.get(id) || 0) + quantity));
    });
    return counts;
}

// doFetch: window.fetch unless a test gives one.
export function readCart(doFetch = null) {
    return Promise.resolve()
        .then(() => (doFetch || window.fetch.bind(window))(CART_URL, { credentials: 'same-origin', headers: { Accept: 'application/json' } }))
        .then(response => (response && response.ok ? response.json() : null))
        .then(body => (body === null ? null : mapCart(body)))
        .catch(() => null);
}
