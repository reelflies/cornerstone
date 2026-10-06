// The non-GET requests the gates let a page send on a live channel (W0-6). On channel 1
// (reelflies.ca) and 1855224 (reelflies.com), stencil start passes every request through to
// the live store, so a cart call a test forgot to mock would make a real guest cart there.
// network-guard.mjs therefore refuses every request that isn't a GET, HEAD or OPTIONS, and
// fails the test, apart from:
//
// - READ_ONLY_POSTS: POSTs that only read, let through to the store. Add one only with the
//   reason it changes nothing, and a test in read-only-posts.test.mjs.
// - LOCAL_ANSWERS: writes the gates' own fixtures make, which the gates answer themselves, so
//   they never reach the store.
//
// Both apply only to the storefront under test (the run's base URL): the same path on any
// other host is refused.

const pathOf = (url, storefront) => {
    try {
        const parsed = new URL(url);
        return parsed.origin === new URL(storefront).origin ? parsed.pathname : null;
    } catch {
        return null;
    }
};

// True when a GraphQL POST body holds only queries: JSON, one operation or a batch, each with
// a query text, and the word "mutation" nowhere in it. Anything else is refused, a persisted
// query too, since its hash could stand for a mutation.
export function isGraphqlQuery(body) {
    if (typeof body !== 'string' || /\bmutation\b/i.test(body)) return false;
    let parsed;
    try {
        parsed = JSON.parse(body);
    } catch {
        return false;
    }
    const operations = Array.isArray(parsed) ? parsed : [parsed];
    return operations.length > 0 && operations.every(operation => typeof operation?.query === 'string' && operation.query.trim() !== '');
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
