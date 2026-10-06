// What counts as a write on a live channel, and the writes the gates let a page send there
// (W0-6). On channel 1 (reelflies.ca) and 1855224 (reelflies.com), stencil start passes every
// request through to the live store, so a cart call a test forgot to mock would make a real
// guest cart there. network-guard.mjs therefore refuses every write, and fails the test:
//
// - every request that isn't a GET, HEAD or OPTIONS
// - GET_WRITES: the GETs (and HEADs) that change something, on any host. BigCommerce adds to
//   the cart on a GET: the stock card's "Add to cart" is a link to /cart.php?action=add.
//
// apart from:
//
// - READ_ONLY_POSTS: POSTs that only read, let through to the store. Add one only with the
//   reason it changes nothing, and a test in read-only-posts.test.mjs.
// - LOCAL_ANSWERS: writes the gates' own fixtures make, which the gates answer themselves, so
//   they never reach the store.
//
// Both exceptions apply only to the storefront under test (the run's base URL): the same path
// on any other host is refused.

const pathOf = (url, storefront) => {
    try {
        const parsed = new URL(url);
        return parsed.origin === new URL(storefront).origin ? parsed.pathname : null;
    } catch {
        return null;
    }
};

const MUTATION = /\bmutation\b/i;

// True when a GraphQL POST body holds only queries: JSON, one operation or a batch, each with
// a query text, and the word "mutation" nowhere in it, as sent or as parsed. JSON can spell
// the word with escapes (\u006dutation), which only the parsed text shows, so it is checked
// again after parsing: JSON.stringify writes every letter as itself. Anything else is refused,
// a persisted query too, since its hash could stand for a mutation.
export function isGraphqlQuery(body) {
    if (typeof body !== 'string' || MUTATION.test(body)) return false;
    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch {
        return false;
    }
    if (MUTATION.test(JSON.stringify(parsed))) return false;
    const operations = Array.isArray(parsed) ? parsed : [parsed];
    return operations.length > 0 && operations.every(operation => typeof operation?.query === 'string' && operation.query.trim() !== '');
}

// GETs that change something on the store, refused on a live channel like any other write, a
// HEAD to them too, on every host. A cart page with no action, the cart's contents
// (/api/storefront/carts) and every other page stay reads.
export const GET_WRITES = [
    {
        id: 'cart-action',
        path: /^\/cart\.php$/i,
        query: params => params.has('action'),
        what: "BigCommerce's cart links, which change the cart on a GET: add_to_cart_url, the \"Add to cart\" on the stock card, list item and compare page (/cart.php?action=add&product_id=N), its pre-order twin, action=buy, and the cart page's coupon, gift certificate and gift-wrapping \"Remove\" links. /cart.php with no action only shows the cart",
    },
    {
        id: 'remote-cart',
        path: /^\/remote\/v1\/cart(\/|$)/i,
        what: "stencil-utils' cart endpoints (/remote/v1/cart/add, /update, /remove), which only write; none is a read sent as a GET",
    },
    {
        id: 'wishlist-action',
        path: /^\/wishlist\.php$/i,
        query: params => params.has('action'),
        what: 'the wish list links (/wishlist.php?action=add, addwishlist, remove and so on). The gates never sign in, so none is a read a gate needs',
    },
    {
        id: 'logout',
        path: /^\/login\.php$/i,
        query: params => params.get('action') === 'logout',
        what: "the header's \"Sign out\" link, /login.php?action=logout, which ends the shopper's session",
    },
];

// The GET_WRITES entry a GET or HEAD matches, on any host, or null.
export function getWrite({ method, url }) {
    if (method !== 'GET' && method !== 'HEAD') return null;
    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    return GET_WRITES.find(entry => entry.path.test(parsed.pathname) && (!entry.query || entry.query(parsed.searchParams))) || null;
}

export const READ_ONLY_POSTS = [
    {
        id: 'product-attributes',
        method: 'POST',
        path: /^\/remote\/v1\/product-attributes\/\d+$/,
        what: "stencil-utils' productAttributes.optionChange: the price, stock and image for the options chosen on a product page or in Quick view. It reads them; the cart is untouched",
    },
    {
        id: 'graphql-query',
        method: 'POST',
        path: /^\/graphql$/,
        body: isGraphqlQuery,
        what: 'a storefront GraphQL query. GraphQL sends reads as POSTs too; a body with a mutation, or one that is not plain queries, is refused',
    },
];

export const LOCAL_ANSWERS = [
    {
        id: 'consent',
        method: 'POST',
        path: /^\/api\/storefront\/consent$/,
        response: { status: 204 },
        what: "the cookie banner's \"Reject all\" (dismissCookieBanner in fixtures.mjs) saves the shopper's choice here. The banner hides whatever the answer, so the gates answer it with a 204 and the choice never reaches a live store",
    },
];

const matching = (list, { method, url, postData }, { storefront }) => {
    const pathname = pathOf(url, storefront);
    if (pathname === null) return null;
    return list.find(entry => entry.method === method && entry.path.test(pathname) && (!entry.body || entry.body(postData))) || null;
};

// The READ_ONLY_POSTS entry a request matches, or null.
export const readOnlyPost = (request, options) => matching(READ_ONLY_POSTS, request, options);

// The LOCAL_ANSWERS entry a request matches, or null.
export const localAnswer = (request, options) => matching(LOCAL_ANSWERS, request, options);
