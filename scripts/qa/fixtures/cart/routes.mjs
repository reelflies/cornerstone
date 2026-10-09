// Cart route fixtures (ticket 38; build pipeline 6.2, shared with tickets 42, 43 and 44): the
// storefront's cart calls answered in the page, so a test or a UI state on a live channel never
// makes a cart. Each route is fulfilled or aborted, never passed on (route.continue would send the
// write), and the harness's network guard (network-guard.mjs) fails any other write.
//
// - answerCartAdds(page, { fail, productId }): stock's add (utils.api.cart.itemAdd, POST
//   /remote/v1/cart/add) answered as the cart's item, or aborted with `fail`. Returns the adds
//   made, as the URLs requested, so a test can count them.
// - answerCartRead(page, lines): the Storefront Cart API's read (GET /api/storefront/carts), which
//   ticket 41's cart-count.js counts and ticket 38's confirmation reads, answered with `lines`.
//   Any other method on that path falls back to the next route, so a write a test hasn't
//   answered still reaches the network guard and fails.
// - cartLines(productId, units, brand): one cart of one physical line, the read's shape.

export const cartLines = (productId, units, brand = 'ReelFlies') => [{
    lineItems: { physicalItems: [{ productId, quantity: units, brand }], digitalItems: [], giftCertificates: [] },
}];

export async function answerCartAdds(page, { fail = false, productId = null } = {}) {
    const adds = [];
    await page.route('**/remote/v1/cart/add**', route => {
        adds.push(route.request().url());
        if (fail) return route.abort('failed');
        return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({ data: { cart_id: 'qa-cart', cart_item: { id: 'qa-item', product_id: productId } } }),
        });
    });
    return adds;
}

export async function answerCartRead(page, lines) {
    await page.route('**/api/storefront/carts**', route => {
        if (route.request().method() !== 'GET') return route.fallback();
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(lines) });
    });
}
