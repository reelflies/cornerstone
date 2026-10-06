// The POSTs the gates let through on a live channel, the ones they answer themselves, and the
// GETs that count as writes (scripts/qa/read-only-posts.mjs, W0-6). Every other write a page
// makes on channel 1 or 1855224 is refused (network-guard.mjs), so the lists are short, and
// each entry says why it only reads, or why it changes something.
//
//   node --test scripts/qa/read-only-posts.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    GET_WRITES, LOCAL_ANSWERS, READ_ONLY_POSTS, getWrite, isGraphqlQuery, localAnswer, readOnlyPost,
} from './read-only-posts.mjs';

const STOREFRONT = 'http://localhost:3401';
const post = (path, postData = null, origin = STOREFRONT) => ({ method: 'POST', url: `${origin}${path}`, postData });
const query = text => JSON.stringify({ query: text, variables: {} });

describe('read-only POSTs', () => {
    it('lets through the option-change price and stock lookup on a product', () => {
        assert.equal(readOnlyPost(post('/remote/v1/product-attributes/6178', 'action=add&product_id=6178&attribute%5B123%5D=456'), { storefront: STOREFRONT })?.id, 'product-attributes');
        assert.equal(readOnlyPost(post('/remote/v1/product-attributes/6178?fresh=1'), { storefront: STOREFRONT })?.id, 'product-attributes');
    });

    it('lets through a storefront GraphQL query', () => {
        const entry = readOnlyPost(post('/graphql', query('query Product { site { product(entityId: 6178) { name } } }')), { storefront: STOREFRONT });
        assert.equal(entry?.id, 'graphql-query');
        assert.equal(readOnlyPost(post('/graphql', query('{ site { settings { storeName } } }')), { storefront: STOREFRONT })?.id, 'graphql-query');
    });

    it('refuses a GraphQL body that holds a mutation, or that can\'t be read as queries', () => {
        const refused = [
            query('mutation AddCartLineItems { cart { addCartLineItems(input: {}) { cart { entityId } } } }'),
            query('mutation{ login(email: "a", password: "b") { result } }'),
            JSON.stringify([{ query: '{ site { settings { storeName } } }' }, { query: 'mutation M { logout { result } }' }]),
            JSON.stringify({ query: '{ site { settings { storeName } } }', variables: { note: 'a mutation in a variable still counts' } }),
            // JSON can spell the keyword with escapes, which only the parsed text shows.
            '{"query":"\\u006dutation { cart { addCartLineItems(input: {}) { cart { entityId } } } }"}',
            '{"query":"\\u006Dutation M { logout { result } }"}',
            '[{"query":"{ site { settings { storeName } } }"},{"query":"\\u006dutation M { logout { result } }"}]',
            '{"query":"query Q { a } m\\u0075tation M { b }","operationName":"M"}',
            JSON.stringify({ extensions: { persistedQuery: { version: 1, sha256Hash: 'abc' } } }),
            JSON.stringify({ query: '' }),
            JSON.stringify([]),
            'query=%7B%20site%20%7D',
            '',
            null,
        ];
        for (const body of refused) {
            assert.equal(isGraphqlQuery(body), false, String(body));
            assert.equal(readOnlyPost(post('/graphql', body), { storefront: STOREFRONT }), null, String(body));
        }
    });

    it('refuses every cart, checkout, account and form write', () => {
        const writes = [
            post('/remote/v1/cart/add', 'action=add&product_id=6178&qty%5B%5D=1'),
            post('/remote/v1/cart/update', 'items=1'),
            post('/remote/v1/cart/remove'),
            post('/remote/v1/shipping-quote', 'shipping-quote=1'),
            post('/api/storefront/carts', '{"lineItems":[{"productId":6178,"quantity":1}]}'),
            post('/api/storefront/carts/abc/items', '{"lineItems":[]}'),
            post('/api/storefront/checkouts/abc/billing-address', '{}'),
            post('/cart.php', 'action=add&product_id=6178'),
            post('/subscribe.php', 'nl_email=rf%40example.test'),
            post('/login.php?action=check_login', 'login_email=a'),
            post('/postreview.php', 'revrating=5'),
        ];
        for (const request of writes) assert.equal(readOnlyPost(request, { storefront: STOREFRONT }), null, request.url);
    });

    it('lets through only POSTs, and only to the storefront under test', () => {
        assert.equal(readOnlyPost({ ...post('/remote/v1/product-attributes/6178'), method: 'PUT' }, { storefront: STOREFRONT }), null);
        assert.equal(readOnlyPost(post('/remote/v1/product-attributes/6178', null, 'https://reelflies.ca'), { storefront: STOREFRONT }), null);
        assert.equal(readOnlyPost(post('/graphql', query('{ site { settings { storeName } } }'), 'https://api.rf-qa-selftest.test'), { storefront: STOREFRONT }), null);
        assert.equal(readOnlyPost(post('/remote/v1/product-attributes/abc'), { storefront: STOREFRONT }), null);
        assert.equal(readOnlyPost(post('/remote/v1/product-attributes/6178/extra'), { storefront: STOREFRONT }), null);
    });

    it('says why each entry only reads', () => {
        for (const entry of READ_ONLY_POSTS) {
            assert.equal(entry.method, 'POST', entry.id);
            assert.ok(entry.what.length > 20, entry.id);
        }
    });
});

describe('writes sent as GETs', () => {
    const get = (path, origin = STOREFRONT, method = 'GET') => ({ method, url: `${origin}${path}`, postData: null });

    it('include the stock card\'s "Add to cart" link and every other cart link with an action', () => {
        const writes = [
            '/cart.php?action=add&product_id=6178',
            '/cart.php?action=add&product_id=6178&pre_order=1',
            '/cart.php?action=buy&sku=RF-6178-14',
            '/cart.php?action=remove&item=abc',
            '/cart.php?action=update&qty%5Babc%5D=2',
            '/cart.php?action=removecoupon&couponcode=RF10',
            '/cart.php?action=removegiftcertificate&giftcertificatecode=RF',
            '/cart.php?action=remove_giftwrapping&itemid=abc',
            '/cart.php?action=',
            '/CART.PHP?action=add&product_id=6178',
        ];
        for (const path of writes) assert.equal(getWrite(get(path))?.id, 'cart-action', path);
    });

    it('include stencil-utils\' cart endpoints, the wish list\'s actions and signing out', () => {
        assert.equal(getWrite(get('/remote/v1/cart/add?product_id=6178'))?.id, 'remote-cart');
        assert.equal(getWrite(get('/remote/v1/cart/update'))?.id, 'remote-cart');
        assert.equal(getWrite(get('/remote/v1/cart'))?.id, 'remote-cart');
        assert.equal(getWrite(get('/wishlist.php?action=add&wishlistid=1&product_id=6178'))?.id, 'wishlist-action');
        assert.equal(getWrite(get('/wishlist.php?action=addwishlist&product_id=6178'))?.id, 'wishlist-action');
        assert.equal(getWrite(get('/login.php?action=logout'))?.id, 'logout');
    });

    it('count as writes on a HEAD too, and on every host, the live store\'s own included', () => {
        assert.equal(getWrite(get('/cart.php?action=add&product_id=6178', STOREFRONT, 'HEAD'))?.id, 'cart-action');
        assert.equal(getWrite(get('/cart.php?action=add&product_id=6178', 'https://reelflies.ca'))?.id, 'cart-action');
        assert.equal(getWrite(get('/cart.php?action=add&product_id=6178', 'https://www.reelflies.com'))?.id, 'cart-action');
    });

    it('leave out the reads: the cart page, the cart\'s contents and the other pages', () => {
        const reads = [
            '/cart.php',
            '/cart.php?suggest=6178',
            '/api/storefront/carts',
            '/api/storefront/carts?include=lineItems.physicalItems.options',
            '/remote/v1/product-attributes/6178',
            '/remote/v1/shipping-quote',
            '/remote/v1/carts-of-a-kind',
            '/login.php',
            '/login.php?action=create_account',
            '/wishlist.php',
            '/flies/realistic-trout-flies/?action=add',
            '/compare/6178/6179',
        ];
        for (const path of reads) assert.equal(getWrite(get(path)), null, path);
        assert.equal(getWrite({ method: 'POST', url: `${STOREFRONT}/cart.php?action=add`, postData: null }), null, 'a POST is a write anyway');
        assert.equal(getWrite(get('', 'data:text/html,cart.php?action=add')), null);
        assert.equal(getWrite({ method: 'GET', url: 'not a url' }), null);
    });

    it('says why each one changes something', () => {
        for (const entry of GET_WRITES) assert.ok(entry.what.length > 20, entry.id);
    });
});

describe('writes the gates answer themselves', () => {
    it('answers the cookie banner\'s consent POST, so it never reaches a live store', () => {
        const entry = localAnswer(post('/api/storefront/consent', '{"allow":[],"deny":[2,3,4]}'), { storefront: STOREFRONT });
        assert.equal(entry?.id, 'consent');
        assert.equal(entry.response.status, 204);
    });

    it('answers nothing else, and only on the storefront under test', () => {
        assert.equal(localAnswer(post('/remote/v1/cart/add'), { storefront: STOREFRONT }), null);
        assert.equal(localAnswer(post('/api/storefront/consent', '{}', 'https://reelflies.ca'), { storefront: STOREFRONT }), null);
        assert.equal(localAnswer({ ...post('/api/storefront/consent'), method: 'DELETE' }, { storefront: STOREFRONT }), null);
    });

    it('says why each answer is safe', () => {
        for (const entry of LOCAL_ANSWERS) assert.ok(entry.what.length > 20, entry.id);
    });
});
