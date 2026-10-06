// What every Playwright gate's browser may send (scripts/qa/network-guard.mjs, W0-6), which
// fixtures.mjs installs on each test's context:
//
// - A request to an analytics host is aborted, on every channel, unless QA_ANALYTICS=allow.
// - On a live channel (1, 1855224), on any host but the prelaunch host and a local stencil
//   start, and on every channel from the Flip, every write is refused: aborted and recorded,
//   and the test fails at teardown naming each one. A write is any request but a GET, HEAD or
//   OPTIONS, and the GETs that change the cart (GET_WRITES in read-only-posts.mjs). Only the
//   read-only POSTs go through, and the gates answer the cookie banner's consent POST
//   themselves. A request a test mocks itself never reaches the guard.
//
// harness-selftest.spec.mjs proves the same in a browser.
//
//   node --test scripts/qa/network-guard.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PRELAUNCH_URL } from './analytics-hosts.mjs';
import {
    LIVE_CHANNELS, guardChannel, guardNotice, installNetworkGuard, refusesWrites, requestAction,
} from './network-guard.mjs';

const LOCAL = 'http://localhost:3401';
const live = { blockAnalytics: true, refuseWrites: true, storefront: LOCAL };
const prelaunch = { blockAnalytics: true, refuseWrites: false, storefront: LOCAL };
const request = (method, path, postData = null, origin = LOCAL) => ({ method, url: path.startsWith('http') ? path : `${origin}${path}`, postData });

describe('which runs refuse writes', () => {
    const before = { flipped: false };

    it('are the live channels, 1 and 1855224, whatever the host', () => {
        assert.deepEqual(LIVE_CHANNELS, ['1', '1855224']);
        for (const channel of LIVE_CHANNELS) {
            assert.equal(refusesWrites({
                channel, storefront: LOCAL, local: true, ...before,
            }), true);
            assert.equal(refusesWrites({
                channel, storefront: PRELAUNCH_URL, local: false, ...before,
            }), true);
        }
    });

    it('include a run on any host but the prelaunch host, whatever QA_CHANNEL says', () => {
        assert.equal(refusesWrites({
            channel: '1895766', storefront: 'https://reelflies.ca', local: false, ...before,
        }), true);
        assert.equal(refusesWrites({
            channel: '1895766', storefront: 'https://www.reelflies.com', local: false, ...before,
        }), true);
    });

    it('leave out ReelFlies_CA before the Flip, through stencil start or on the prelaunch host', () => {
        assert.equal(refusesWrites({
            channel: '1895766', storefront: LOCAL, local: true, ...before,
        }), false);
        assert.equal(refusesWrites({
            channel: '1895766', storefront: PRELAUNCH_URL, local: false, ...before,
        }), false);
    });

    it('include ReelFlies_CA from the Flip, when it is live reelflies.ca', () => {
        assert.equal(refusesWrites({
            channel: '1895766', storefront: LOCAL, local: true, flipped: true,
        }), true);
        assert.equal(refusesWrites({
            channel: '1895766', storefront: PRELAUNCH_URL, local: false, flipped: true,
        }), true);
    });

    it('read the Flip from the release calendar when they aren\'t told it', () => {
        // The calendar on master has no Flip date yet (scripts/release-calendar.json).
        assert.equal(refusesWrites({ channel: '1895766', storefront: LOCAL, local: true }), false);
    });
});

describe('the channel a test is guarded as', () => {
    it('is the run\'s own when that is live, whatever the test asks for, so a test can\'t loosen the guard', () => {
        assert.equal(guardChannel('1', '1895766'), '1');
        assert.equal(guardChannel('1855224', '1895766'), '1855224');
        assert.equal(guardChannel(1, undefined), '1');
    });

    it('is the test\'s qaChannel on a run that isn\'t live, so a self-test can act as a live channel', () => {
        assert.equal(guardChannel('1895766', '1'), '1');
        assert.equal(guardChannel('1895766', '1855224'), '1855224');
        assert.equal(guardChannel('1895766', undefined), '1895766');
        assert.equal(guardChannel('1895766', '1895766'), '1895766');
    });
});

describe('what happens to each request', () => {
    it('aborts an analytics request on every channel, a beacon POST included', () => {
        for (const options of [live, prelaunch]) {
            assert.deepEqual(requestAction(request('GET', 'https://www.googletagmanager.com/gtag/js?id=G-BQ4RFFK3KW'), options), { action: 'block' });
            assert.deepEqual(requestAction(request('POST', 'https://region1.google-analytics.com/g/collect?v=2'), options), { action: 'block' });
        }
    });

    it('lets analytics through only when QA_ANALYTICS=allow switched blocking off', () => {
        const allowed = { ...prelaunch, blockAnalytics: false };
        assert.deepEqual(requestAction(request('GET', 'https://connect.facebook.net/en_US/fbevents.js'), allowed), { action: 'pass' });
    });

    it('lets every read through on a live channel', () => {
        for (const method of ['GET', 'HEAD', 'OPTIONS']) {
            assert.deepEqual(requestAction(request(method, '/api/storefront/carts'), live), { action: 'pass' }, method);
            assert.deepEqual(requestAction(request(method, '/cart.php'), live), { action: 'pass' }, method);
        }
    });

    it('refuses a cart write sent as a GET on a live channel: the stock card\'s "Add to cart" link among them', () => {
        const writes = [
            request('GET', '/cart.php?action=add&product_id=6178'),
            request('HEAD', '/cart.php?action=add&product_id=6178'),
            request('GET', '/cart.php?action=buy&sku=RF-6178-14'),
            request('GET', '/cart.php?action=remove&item=abc'),
            request('GET', '/remote/v1/cart/add?product_id=6178'),
            request('GET', '/wishlist.php?action=add&product_id=6178'),
            request('GET', '/login.php?action=logout'),
            request('GET', 'https://reelflies.ca/cart.php?action=add&product_id=6178'),
        ];
        for (const write of writes) assert.deepEqual(requestAction(write, live), { action: 'refuse' }, `${write.method} ${write.url}`);
        assert.deepEqual(requestAction(request('GET', '/cart.php?action=add&product_id=6178'), prelaunch), { action: 'pass' }, 'ReelFlies_CA isn\'t live');
    });

    it('refuses every cart write on a live channel, through any endpoint or method', () => {
        const writes = [
            request('POST', '/remote/v1/cart/add', 'action=add&product_id=6178'),
            request('POST', '/api/storefront/carts', '{"lineItems":[]}'),
            request('POST', '/api/storefront/carts/abc/items', '{}'),
            request('PUT', '/api/storefront/carts/abc/items/def', '{}'),
            request('DELETE', '/api/storefront/carts/abc'),
            request('PATCH', '/api/storefront/carts/abc', '{}'),
            request('POST', '/cart.php', 'action=add'),
            request('POST', '/graphql', JSON.stringify({ query: 'mutation { cart { createCart(input: {}) { cart { entityId } } } }' })),
            request('POST', '/graphql', '{"query":"\\u006dutation { cart { createCart(input: {}) { cart { entityId } } } }"}'),
            request('POST', 'https://api.rf-qa-selftest.test/queue', '{}'),
        ];
        for (const write of writes) assert.deepEqual(requestAction(write, live), { action: 'refuse' }, `${write.method} ${write.url}`);
    });

    it('lets the read-only POSTs through on a live channel', () => {
        assert.deepEqual(requestAction(request('POST', '/remote/v1/product-attributes/6178', 'attribute=1'), live), { action: 'pass' });
        assert.deepEqual(requestAction(request('POST', '/graphql', JSON.stringify({ query: '{ site { settings { storeName } } }' })), live), { action: 'pass' });
    });

    it('answers the consent POST itself on a live channel', () => {
        const { action, answer } = requestAction(request('POST', '/api/storefront/consent', '{"allow":[],"deny":[2,3,4]}'), live);
        assert.equal(action, 'answer');
        assert.equal(answer.id, 'consent');
    });

    it('lets writes through on ReelFlies_CA, which isn\'t live', () => {
        assert.deepEqual(requestAction(request('POST', '/remote/v1/cart/add'), prelaunch), { action: 'pass' });
        assert.deepEqual(requestAction(request('POST', '/api/storefront/consent', '{}'), prelaunch), { action: 'pass' });
    });
});

// A stand-in for a Playwright BrowserContext, its routes and its events.
function fakeContext() {
    const routes = [];
    const listeners = {};
    return {
        routes,
        route: async (pattern, handler) => { routes.push({ pattern, handler }); },
        on: (event, handler) => { (listeners[event] ||= []).push(handler); },
        // An answer to a request, which no route stopped.
        finish(method, url) {
            (listeners.response || []).forEach(handler => handler({ url: () => url, request: () => ({ method: () => method }) }));
        },
        // Sends one request through the guard's handler; resolves to what the handler did.
        async send(method, url, postData = null) {
            const calls = [];
            const route = {
                request: () => ({ method: () => method, url: () => url, postData: () => postData }),
                abort: async code => calls.push(['abort', code]),
                fulfill: async response => calls.push(['fulfill', response.status]),
                fallback: async () => calls.push(['fallback']),
            };
            await routes[0].handler(route);
            return calls;
        },
    };
}

describe('the guard on a context', () => {
    it('routes every request of the context through one handler', async () => {
        const context = fakeContext();
        await installNetworkGuard(context, {
            channel: '1', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        assert.deepEqual(context.routes.map(({ pattern }) => pattern), ['**/*']);
    });

    it('aborts analytics as blocked by the client, refuses writes as access denied, and passes the rest on', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        assert.deepEqual(await context.send('GET', 'https://connect.facebook.net/en_US/fbevents.js'), [['abort', 'blockedbyclient']]);
        assert.deepEqual(await context.send('POST', `${LOCAL}/remote/v1/cart/add`, 'action=add'), [['abort', 'accessdenied']]);
        assert.deepEqual(await context.send('POST', `${LOCAL}/api/storefront/consent`, '{}'), [['fulfill', 204]]);
        assert.deepEqual(await context.send('POST', `${LOCAL}/remote/v1/product-attributes/6178`, 'a=1'), [['fallback']]);
        assert.deepEqual(await context.send('GET', `${LOCAL}/cart.php`), [['fallback']]);

        assert.deepEqual(guard.blocked, ['GET https://connect.facebook.net/en_US/fbevents.js']);
        assert.deepEqual(guard.refused, [`POST ${LOCAL}/remote/v1/cart/add`]);
        assert.deepEqual(guard.answered, [`POST ${LOCAL}/api/storefront/consent`]);
    });

    it('fails a test that made a write on a live channel, naming the method and the URL of each', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        guard.assertNoRefusedWrites();
        await context.send('POST', `${LOCAL}/remote/v1/cart/add`, 'action=add');
        await context.send('DELETE', `${LOCAL}/api/storefront/carts/abc`);
        assert.throws(() => guard.assertNoRefusedWrites(), error => {
            assert.match(error.message, /^The gates refused 2 writes on channel 1, which is live, so none reached the store:/);
            assert.match(error.message, /POST http:\/\/localhost:3401\/remote\/v1\/cart\/add/);
            assert.match(error.message, /DELETE http:\/\/localhost:3401\/api\/storefront\/carts\/abc/);
            assert.match(error.message, /mock it in the test \(page\.route\), or, if it only reads, add it to scripts\/qa\/read-only-posts\.mjs/);
            return true;
        });
    });

    it('names the host when a run on another host refused a write', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1895766', storefront: 'https://reelflies.ca', local: false, blockAnalytics: true,
        });
        await context.send('POST', 'https://reelflies.ca/remote/v1/cart/add', 'action=add');
        assert.throws(() => guard.assertNoRefusedWrites(), { message: /^The gates refused 1 write on https:\/\/reelflies\.ca, which isn't the prelaunch host, so none reached the store: POST https:\/\/reelflies\.ca\/remote\/v1\/cart\/add\./ });
    });

    it('lets everything through but analytics on ReelFlies_CA, and fails nothing', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1895766', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        assert.deepEqual(await context.send('POST', `${LOCAL}/remote/v1/cart/add`, 'action=add'), [['fallback']]);
        assert.deepEqual(await context.send('GET', 'https://www.googletagmanager.com/gtag/js?id=G-BQ4RFFK3KW'), [['abort', 'blockedbyclient']]);
        guard.assertNoRefusedWrites();
        assert.equal(guard.refusesWrites, false);
        assert.equal(guard.analyticsBlocked, true);
    });

    it('fails a test in which a request to an analytics host completed although the run blocks them', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1895766', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        context.finish('GET', `${LOCAL}/`);
        guard.assertNoAnalyticsCompleted();
        // Only a route ahead of the guard, such as a test's own mock, can get one past it.
        context.finish('GET', 'https://www.googletagmanager.com/gtag/js?id=G-BQ4RFFK3KW');
        assert.deepEqual(guard.completed, ['GET https://www.googletagmanager.com/gtag/js?id=G-BQ4RFFK3KW']);
        assert.throws(() => guard.assertNoAnalyticsCompleted(), {
            message: /^1 request to an analytics host completed although this run blocks them: GET https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-BQ4RFFK3KW\. /,
        });
    });

    it('records completed analytics requests without failing when QA_ANALYTICS=allow lets them load', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1895766', storefront: PRELAUNCH_URL, local: false, blockAnalytics: false,
        });
        context.finish('GET', 'https://connect.facebook.net/en_US/fbevents.js');
        assert.deepEqual(guard.completed, []);
        guard.assertNoAnalyticsCompleted();
    });

    it('names channel 1895766 as live from the Flip when it refused a write there', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1895766', storefront: LOCAL, local: true, blockAnalytics: true, flipped: true,
        });
        assert.equal(guard.refusesWrites, true);
        await context.send('POST', `${LOCAL}/remote/v1/cart/add`, 'action=add');
        assert.throws(() => guard.assertNoRefusedWrites(), { message: /^The gates refused 1 write on channel 1895766, which is live reelflies\.ca from the Flip on, so none reached the store:/ });
    });

    it('refuses the stock card\'s "Add to cart" link, a GET, on a live channel', async () => {
        const context = fakeContext();
        const guard = await installNetworkGuard(context, {
            channel: '1', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        assert.deepEqual(await context.send('GET', `${LOCAL}/cart.php?action=add&product_id=6178`), [['abort', 'accessdenied']]);
        assert.deepEqual(guard.refused, [`GET ${LOCAL}/cart.php?action=add&product_id=6178`]);
    });

    it('treats a request the page has already closed on as handled', async () => {
        const context = fakeContext();
        await installNetworkGuard(context, {
            channel: '1', storefront: LOCAL, local: true, blockAnalytics: true,
        });
        const closed = async () => { throw new Error('Target page, context or browser has been closed'); };
        const route = {
            request: () => ({ method: () => 'GET', url: () => 'https://www.google-analytics.com/analytics.js', postData: () => null }),
            abort: closed,
            fulfill: closed,
            fallback: closed,
        };
        await context.routes[0].handler(route);
    });
});

describe('the notice each run prints', () => {
    it('says whether analytics are blocked, and whether writes are refused', () => {
        assert.deepEqual(guardNotice({ blockAnalytics: true, refuseWrites: false, channel: '1895766' }), [
            'ANALYTICS blocked: yes (scripts/qa/analytics-hosts.mjs; QA_ANALYTICS=allow lets them load on the prelaunch host only)',
        ]);
        assert.deepEqual(guardNotice({ blockAnalytics: false, refuseWrites: false, channel: '1895766' }), [
            'ANALYTICS blocked: no (QA_ANALYTICS=allow, on the prelaunch host)',
        ]);
        assert.deepEqual(guardNotice({
            blockAnalytics: true, refuseWrites: true, channel: '1', storefront: LOCAL, local: true,
        }), [
            'ANALYTICS blocked: yes (scripts/qa/analytics-hosts.mjs; QA_ANALYTICS=allow lets them load on the prelaunch host only)',
            'WRITES    refused: channel 1 is live, so every write fails the test: every request but a GET, HEAD or OPTIONS, and the GETs that change the cart, a wish list or a sign-in (GET_WRITES). The exceptions are the read-only POSTs (scripts/qa/read-only-posts.mjs).',
        ]);
        assert.match(guardNotice({
            blockAnalytics: true, refuseWrites: true, channel: '1895766', storefront: LOCAL, local: true, flipped: true,
        })[1], /^WRITES {4}refused: channel 1895766 is live reelflies\.ca from the Flip on, so every write fails the test/);
    });
});
