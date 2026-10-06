// Self-tests of fixtures.mjs, which every storefront gate opens its pages with. They run
// with qa:axe, qa:screens and qa:quick-view, and serve their own pages (page.route and
// setContent), so they need no store data; only the 5xx and 429 retry cases get a pinned
// page's real response from the storefront under test.
//
// - A pinned page that doesn't answer as its template should fails the run, so axe and the
//   screenshots never check, or record as a baseline, an error page instead.
// - A page that answers 5xx is opened once more, about 2 s later: stencil start's request
//   to the store can drop. A second 5xx fails, and a 4xx is never asked again.
// - A page that answers 429 is opened again after its Retry-After, up to three times
//   (W0-4). A fourth 429 fails.
// - Dismissing the cookie banner leaves nothing hovered, so no hover zoom or menu is open
//   in a screenshot.
// - The network guard (network-guard.mjs, W0-6) aborts a request to every analytics host on
//   the list, and on a live channel refuses every cart write, failing the test at teardown:
//   the GETs that add to the cart and the stock card's "Add to cart" link clicked among them.
//   The read-only POSTs and a
//   test's own mocks go through, and it catches an analytics request that a route ahead of it
//   let through. Those cases run in a context of their own whose first route answers
//   everything itself, and send everything else to a .test origin that never resolves, so no
//   request leaves the Mac. More prove that every gate test gets the guard through the
//   fixture, again only towards that origin.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import { ANALYTICS_HOSTS, sampleUrl } from './analytics-hosts.mjs';
import { LIVE_CHANNELS, guardChannel, installNetworkGuard } from './network-guard.mjs';
import { expectedStatus } from './pages.mjs';
import { QA_CHANNEL } from './storefront.mjs';
import {
    ANALYTICS, PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';

const html = status => `<!doctype html><html lang="en"><title>HTTP ${status}</title><h1>HTTP ${status}</h1></html>`;
// Answers `url` with `status` (and `headers`), and returns a counter of the requests it answered.
async function serve(page, url, status, headers = {}) {
    const requests = { count: 0 };
    await page.route(url, route => {
        requests.count += 1;
        return route.fulfill({
            status, headers, contentType: 'text/html', body: html(status),
        });
    });
    return requests;
}

test.describe('opening a pinned page', () => {
    test('fails when a template\'s pinned page answers 404, without asking again', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/gone/', 404);
        await expect(storefrontPage(page, 'product', '/rf-selftest/gone/'))
            .rejects.toThrow('the product page /rf-selftest/gone/ returned HTTP 404, not 200');
        expect(requests.count).toBe(1);
    });

    test('fails when the pinned 404 page answers 200, without asking again', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/missing/', 200);
        await expect(storefrontPage(page, '404', '/rf-selftest/missing/'))
            .rejects.toThrow('the 404 page /rf-selftest/missing/ returned HTTP 200, not 404');
        expect(requests.count).toBe(1);
    });

    test('opens a pinned page that answers 5xx once, from the storefront\'s real response', async ({ page, baseURL }) => {
        // The 404 page is the one that answered 500 once in a release dry run.
        const [template, pagePath] = PAGES['404'] ? ['404', PAGES['404']] : Object.entries(PAGES)[0];
        const target = new URL(pagePath, baseURL).href;
        const answers = [];
        await page.route(url => url.href === target, route => {
            answers.push(answers.length ? 'storefront' : 500);
            return answers.length === 1
                ? route.fulfill({ status: 500, contentType: 'text/html', body: html(500) })
                : route.fallback();
        });
        const logged = [];
        const log = console.log;
        console.log = (...args) => logged.push(args.join(' '));
        try {
            expect((await storefrontPage(page, template, pagePath)).status()).toBe(expectedStatus(template));
        } finally {
            console.log = log;
        }
        expect(answers).toEqual([500, 'storefront']);
        expect(logged).toEqual([`RETRY    the ${template} page ${pagePath} returned HTTP 500; opening it once more in 2 s (stencil start's request to the store can drop)`]);
    });

    test('opens a pinned page that answers 429 again after its Retry-After, from the storefront\'s real response', async ({ page, baseURL }) => {
        const [template, pagePath] = PAGES['404'] ? ['404', PAGES['404']] : Object.entries(PAGES)[0];
        const target = new URL(pagePath, baseURL).href;
        const answers = [];
        await page.route(url => url.href === target, route => {
            answers.push(answers.length ? 'storefront' : 429);
            return answers.length === 1
                ? route.fulfill({
                    status: 429, headers: { 'Retry-After': '1' }, contentType: 'text/html', body: html(429),
                })
                : route.fallback();
        });
        const logged = [];
        const log = console.log;
        console.log = (...args) => logged.push(args.join(' '));
        try {
            expect((await storefrontPage(page, template, pagePath)).status()).toBe(expectedStatus(template));
        } finally {
            console.log = log;
        }
        expect(answers).toEqual([429, 'storefront']);
        expect(logged).toEqual([`RETRY    the ${template} page ${pagePath} returned HTTP 429; opening it again in 1 s, as its Retry-After asks (retry 1 of 3; the store is limiting requests)`]);
    });

    test('fails when a pinned page answers 429 after three retries', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/throttled/', 429, { 'Retry-After': '0' });
        await expect(storefrontPage(page, 'product', '/rf-selftest/throttled/'))
            .rejects.toThrow('the product page /rf-selftest/throttled/ returned HTTP 429, not 200');
        expect(requests.count).toBe(4);
    });

    test('fails when a pinned page answers 5xx twice', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/down/', 502);
        await expect(storefrontPage(page, 'product', '/rf-selftest/down/'))
            .rejects.toThrow('the product page /rf-selftest/down/ returned HTTP 502, not 200');
        expect(requests.count).toBe(2);
    });

    test('opens a pinned page that answers as its template should', async ({ page }) => {
        await serve(page, '**/rf-selftest/product/', 200);
        await serve(page, '**/rf-selftest/missing/', 404);
        expect((await storefrontPage(page, 'product', '/rf-selftest/product/')).status()).toBe(200);
        expect((await storefrontPage(page, '404', '/rf-selftest/missing/')).status()).toBe(404);
    });
});

test.describe('dismissing the cookie banner', () => {
    // On the desktop product page, "Reject all" sits over the main image, whose EasyZoom
    // flyout opens on hover (ticket 16 review).
    test('leaves the element under the banner unhovered', async ({ page }) => {
        await page.setContent(`<!doctype html><html lang="en"><body style="margin:0">
            <div id="photo" style="position:absolute;left:0;top:0;width:600px;height:600px;background:#eee"></div>
            <div id="consent-manager" style="position:fixed;left:100px;top:300px;padding:20px;background:#333">
                <button type="button" onclick="document.getElementById('consent-manager').style.display = 'none'">Reject all</button>
            </div>
            <script>
                window.entered = 0;
                document.getElementById('photo').addEventListener('mouseenter', () => { window.entered += 1; });
            </script>
        </body></html>`);

        await dismissCookieBanner(page);
        await expect(page.locator('#consent-manager')).toBeHidden();
        await page.waitForTimeout(300); // Chrome updates hover on a timer after a layout change

        expect(await page.locator('#photo').evaluate(element => element.matches(':hover')), 'the photo is hovered').toBe(false);
        expect(await page.evaluate(() => window.entered), 'mouseenter on the photo').toBe(0);
    });
});

// The fixture pages of the network guard's cases sit on a made-up origin, answered by the
// context's first route. The .test domain never resolves, so not even a mistake could send
// one of these requests anywhere.
const SELFTEST_ORIGIN = 'http://rf-qa-selftest.test';
const SELFTEST_PAGE = `${SELFTEST_ORIGIN}/rf-selftest/guard/`;

// A made-up product id: no store has it, so even a write that got out would add nothing.
const SELFTEST_PRODUCT = '9999901';

// A context of the test's own, with the guard on top as fixtures.mjs installs it, and under it
// a route that answers the fixture page (`body`) and every request the guard passes on to the
// selftest origin itself (recorded in `reached`). Anything else that got past the guard is
// recorded in `leaked` and aborted, so nothing leaves the Mac.
async function guardedPage(browser, { channel, body = '<h1>guard</h1>' }) {
    const context = await browser.newContext();
    const reached = [];
    const leaked = [];
    await context.route('**/*', route => {
        const request = route.request();
        if (request.method() === 'GET' && request.url() === SELFTEST_PAGE) {
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><title>guard</title>${body}</html>` });
        }
        const line = `${request.method()} ${request.url()}`;
        if (new URL(request.url()).origin === SELFTEST_ORIGIN) {
            reached.push(line);
            return route.fulfill({ status: 200, contentType: 'application/json', body: '{"rf":"storefront"}' });
        }
        leaked.push(line);
        return route.abort('internetdisconnected');
    });
    const guard = await installNetworkGuard(context, {
        channel, storefront: SELFTEST_ORIGIN, local: true, blockAnalytics: true,
    });
    const page = await context.newPage();
    const failures = [];
    page.on('requestfailed', request => failures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
    await page.goto(SELFTEST_PAGE);
    return {
        context, page, guard, reached, leaked, failures,
    };
}

// Sends each request from the page: a fetch (same-origin, or no-cors to another origin), an
// image or a script. Resolves to the status of each, 'opaque' for a no-cors answer, or 'failed'.
const send = (page, requests) => page.evaluate(list => Promise.all(list.map(({
    method = 'GET', url, body = null, kind = 'fetch',
}) => {
    if (kind === 'img' || kind === 'script') {
        return new Promise(resolve => {
            const element = document.createElement(kind);
            element.addEventListener('load', () => resolve(200));
            element.addEventListener('error', () => resolve('failed'));
            element.src = url;
            document.body.append(element);
        });
    }
    const mode = new URL(url).origin === window.location.origin ? 'same-origin' : 'no-cors';
    return fetch(url, { method, body, mode }).then(response => (response.type === 'opaque' ? 'opaque' : response.status), () => 'failed');
})), requests);

const CART_WRITES = [
    ['POST', '/remote/v1/cart/add', 'action=add&product_id=6178&qty%5B%5D=1'],
    ['POST', '/api/storefront/carts', '{"lineItems":[{"productId":6178,"quantity":1}]}'],
    ['POST', '/api/storefront/carts/rf-selftest/items', '{"lineItems":[{"productId":6178,"quantity":1}]}'],
    ['PUT', '/api/storefront/carts/rf-selftest/items/rf-line', '{"lineItem":{"productId":6178,"quantity":2}}'],
    ['DELETE', '/api/storefront/carts/rf-selftest/items/rf-line', null],
    ['POST', '/cart.php', 'action=add&product_id=6178'],
    ['POST', '/graphql', '{"query":"mutation { cart { createCart(input: {lineItems: []}) { cart { entityId } } } }"}'],
    ['POST', '/graphql', '{"query":"\\u006dutation { cart { createCart(input: {lineItems: []}) { cart { entityId } } } }"}'],
    // BigCommerce adds to the cart on these GETs: the stock card's "Add to cart" is a link.
    ['GET', `/cart.php?action=add&product_id=${SELFTEST_PRODUCT}`, null],
    ['GET', `/cart.php?action=buy&sku=RF-SELFTEST-${SELFTEST_PRODUCT}`, null],
];
const lines = requests => requests.map(([method, pagePath]) => `${method} ${SELFTEST_ORIGIN}${pagePath}`).sort();

test.describe('the network guard (W0-6)', () => {
    for (const channel of ['1895766', '1']) {
        test(`aborts a request to every analytics host on the list, beacons included, on channel ${channel}`, async ({ browser }) => {
            const {
                context, page, guard, reached, leaked, failures,
            } = await guardedPage(browser, { channel });
            const urls = ANALYTICS_HOSTS.map(sampleUrl);
            const kinds = ['fetch', 'img', 'script'];
            const answers = await send(page, urls.map((url, index) => ({ url, kind: kinds[index % kinds.length] })));
            await page.evaluate(url => navigator.sendBeacon(url, 'rf-qa-selftest'), urls[1]);
            await expect.poll(() => guard.blocked.length).toBe(urls.length + 1);

            expect(answers).toEqual(urls.map(() => 'failed'));
            expect([...guard.blocked].sort()).toEqual([...urls.map(url => `GET ${url}`), `POST ${urls[1]}`].sort());
            await expect.poll(() => failures.length).toBe(urls.length + 1);
            // Chromium names an abort through the inspector "net::ERR_BLOCKED_BY_CLIENT.Inspector".
            expect(failures.filter(failure => !/ net::ERR_BLOCKED_BY_CLIENT(\.Inspector)?$/.test(failure))).toEqual([]);
            expect(guard.refused, 'an analytics beacon is blocked, never counted as a refused write').toEqual([]);
            expect(reached).toEqual([]);
            expect(leaked).toEqual([]);
            await context.close();
        });
    }

    test('refuses every cart write on a live channel, names each one, and lets none out', async ({ browser }) => {
        const {
            context, page, guard, reached, leaked, failures,
        } = await guardedPage(browser, { channel: '1' });
        const answers = await send(page, CART_WRITES.map(([method, pagePath, body]) => ({ method, url: `${SELFTEST_ORIGIN}${pagePath}`, body })));

        expect(answers).toEqual(CART_WRITES.map(() => 'failed'));
        expect([...guard.refused].sort()).toEqual(lines(CART_WRITES));
        expect(failures.filter(failure => !/ net::ERR_ACCESS_DENIED(\.Inspector)?$/.test(failure))).toEqual([]);
        expect(reached, 'no write reached the storefront').toEqual([]);
        expect(leaked).toEqual([]);
        expect(() => guard.assertNoRefusedWrites()).toThrow(`The gates refused ${CART_WRITES.length} writes on channel 1, which is live, so none reached the store: ${guard.refused.join('; ')}.`);
        await context.close();
    });

    test('refuses the stock card\'s "Add to cart" link when it is clicked on a live channel', async ({ browser }) => {
        const link = `/cart.php?action=add&product_id=${SELFTEST_PRODUCT}`;
        const {
            context, page, guard, reached, leaked,
        } = await guardedPage(browser, {
            channel: '1',
            // As templates/components/products/card.html renders it.
            body: `<a href="${link}" data-event-type="product-click" data-button-type="add-cart" class="button button--small card-figcaption-button">Add to Cart</a>`,
        });
        await page.getByRole('link', { name: 'Add to Cart' }).click();
        await expect.poll(() => guard.refused).toEqual([`GET ${SELFTEST_ORIGIN}${link}`]);
        expect(reached, 'the add never reached the storefront').toEqual([]);
        expect(leaked).toEqual([]);
        expect(() => guard.assertNoRefusedWrites()).toThrow(`The gates refused 1 write on channel 1, which is live, so none reached the store: GET ${SELFTEST_ORIGIN}${link}.`);
        await context.close();
    });

    test('lets the read-only POSTs through on a live channel, and answers the consent POST itself', async ({ browser }) => {
        const {
            context, page, guard, reached, leaked,
        } = await guardedPage(browser, { channel: '1855224' });
        const reads = [
            ['POST', '/remote/v1/product-attributes/6178', 'action=add&product_id=6178&attribute%5B123%5D=456'],
            ['POST', '/graphql', JSON.stringify({ query: '{ site { settings { storeName } } }' })],
        ];
        const consent = ['POST', '/api/storefront/consent', '{"allow":[],"deny":[2,3,4]}'];
        const answers = await send(page, [...reads, consent].map(([method, pagePath, body]) => ({ method, url: `${SELFTEST_ORIGIN}${pagePath}`, body })));

        expect(answers).toEqual([200, 200, 204]);
        expect([...reached].sort(), 'the reads went on to the storefront; the consent POST didn\'t').toEqual(lines(reads));
        expect(guard.answered).toEqual(lines([consent]));
        expect(guard.refused).toEqual([]);
        expect(leaked).toEqual([]);
        guard.assertNoRefusedWrites();
        await context.close();
    });

    test('answers a write the test mocks itself with its mock, on a live channel', async ({ browser }) => {
        const {
            context, page, guard, reached,
        } = await guardedPage(browser, { channel: '1' });
        await page.route(`${SELFTEST_ORIGIN}/remote/v1/cart/add`, route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"rf":"mocked"}' }));
        const body = await page.evaluate(url => fetch(url, { method: 'POST', body: 'action=add' }).then(response => response.text()), `${SELFTEST_ORIGIN}/remote/v1/cart/add`);

        expect(body).toBe('{"rf":"mocked"}');
        expect(guard.refused).toEqual([]);
        expect(reached).toEqual([]);
        await context.close();
    });

    test('catches an analytics request that a route ahead of it let through', async ({ browser }) => {
        const {
            context, page, guard, leaked,
        } = await guardedPage(browser, { channel: '1895766' });
        const target = 'https://www.google-analytics.com/rf-qa-selftest';
        await page.route(target, route => route.fulfill({ status: 204 }));
        expect(await send(page, [{ url: target }])).toEqual(['opaque']);
        await expect.poll(() => guard.completed).toEqual([`GET ${target}`]);
        expect(guard.blocked).toEqual([]);
        expect(leaked).toEqual([]);
        expect(() => guard.assertNoAnalyticsCompleted()).toThrow(`1 request to an analytics host completed although this run blocks them: GET ${target}.`);
        await context.close();
    });

    test('lets writes through on ReelFlies_CA, which isn\'t live', async ({ browser }) => {
        const {
            context, page, guard, reached,
        } = await guardedPage(browser, { channel: '1895766' });
        const answers = await send(page, CART_WRITES.slice(0, 2).map(([method, pagePath, body]) => ({ method, url: `${SELFTEST_ORIGIN}${pagePath}`, body })));

        expect(answers).toEqual([200, 200]);
        expect([...reached].sort()).toEqual(lines(CART_WRITES.slice(0, 2)));
        expect(guard.refused).toEqual([]);
        await context.close();
    });
});

test.describe('the network guard in every gate test, through the fixture (W0-6)', () => {
    test('blocks the analytics tags, and records that it does', async ({ page, networkGuard }, testInfo) => {
        expect(testInfo.annotations).toContainEqual({ type: 'analytics blocked', description: ANALYTICS.blocked ? 'yes' : 'no' });
        test.skip(!ANALYTICS.blocked, 'QA_ANALYTICS=allow lets the tags load in this run');
        await serve(page, '**/rf-selftest/fixture-guard/', 200);
        await page.goto('/rf-selftest/fixture-guard/');
        // A path with no measurement id, on a listed host.
        const target = 'https://www.google-analytics.com/rf-qa-selftest';
        expect(await send(page, [{ url: target }])).toEqual(['failed']);
        expect(networkGuard.blocked).toEqual([`GET ${target}`]);
    });

    test.describe('on a live channel', () => {
        test.use({ qaChannel: '1' });

        test('fails a test that wrote to the cart, at teardown', async ({ page, networkGuard }) => {
            test.fail(true, 'the fixture fails this test at teardown, for the cart write the guard refused: that is what it proves');
            await serve(page, '**/rf-selftest/fixture-guard/', 200);
            await page.goto('/rf-selftest/fixture-guard/');
            // The write goes to an origin that never resolves, not the storefront under test: on a
            // live channel the guard refuses a write to any host, and if it ever stopped, the
            // write would still reach no store.
            const write = `${SELFTEST_ORIGIN}/remote/v1/cart/add`;
            expect(await page.evaluate(([url, product]) => fetch(url, { method: 'POST', body: `action=add&product_id=${product}` }).then(() => 'answered', () => 'failed'), [write, SELFTEST_PRODUCT])).toBe('failed');
            expect(networkGuard.refused).toEqual([`POST ${write}`]);
        });

        test.describe('when a test asks to be guarded as ReelFlies_CA', () => {
            test.use({ qaChannel: '1895766' });

            test('stays live on a run whose QA_CHANNEL is live: the option only tightens the guard', async ({ networkGuard }) => {
                expect(networkGuard.channel).toBe(guardChannel(QA_CHANNEL, '1895766'));
                if (LIVE_CHANNELS.includes(String(QA_CHANNEL))) expect(networkGuard.refusesWrites).toBe(true);
            });
        });

        test('passes a test that only read, refusing nothing', async ({ page, networkGuard }, testInfo) => {
            await serve(page, '**/rf-selftest/fixture-guard/', 200);
            await page.goto('/rf-selftest/fixture-guard/');
            expect(networkGuard.refusesWrites).toBe(true);
            expect(testInfo.annotations.map(({ type }) => type)).toContain('writes refused');
            expect(networkGuard.refused).toEqual([]);
        });
    });
});
