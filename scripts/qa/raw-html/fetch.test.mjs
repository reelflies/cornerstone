// The raw-HTML fetch (scripts/qa/raw-html.mjs fetchPage), against two local servers that
// stand in for the hosts:
//
// - It sends the prelaunch preview cookie to QA_BASE_URL and to no other host, even when a
//   page redirects there.
// - A page that answers 5xx is fetched once more, about 2 s later, and the output says so:
//   stencil start's upstream request to the store can drop. A second 5xx is the result, and
//   a 4xx is never fetched again.
// - A page that answers 429 is fetched again after its Retry-After, up to three times, and
//   the output says so each time (W0-4). A fourth 429 is the result.
//
//   node --test scripts/qa/raw-html/fetch.test.mjs

import http from 'http';
import {
    after, before, describe, it,
} from 'node:test';
import assert from 'node:assert/strict';

const seen = { qa: [], other: [] };
const serve = (name, handler) => new Promise(resolve => {
    const server = http.createServer((request, response) => {
        seen[name].push({ url: request.url, cookie: request.headers.cookie });
        handler(request, response);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
});

let qa;
let other;
let fetchPage;
const requestsFor = url => seen.qa.filter(request => request.url === url).length;

before(async () => {
    other = await serve('other', (request, response) => response.end('<html></html>'));
    const otherUrl = `http://127.0.0.1:${other.address().port}`;
    qa = await serve('qa', (request, response) => {
        if (request.url === '/moved/') {
            response.writeHead(301, { Location: '/product/' }).end();
        } else if (request.url === '/elsewhere/') {
            response.writeHead(302, { Location: `${otherUrl}/landing/` }).end();
        } else if (request.url === '/flaky/' && seen.qa.filter(({ url }) => url === '/flaky/').length === 1) {
            response.writeHead(500).end('stream has been aborted');
        } else if (request.url === '/busy/' && seen.qa.filter(({ url }) => url === '/busy/').length === 1) {
            response.writeHead(429, { 'Retry-After': '1' }).end('Too Many Requests');
        } else if (request.url === '/throttled/') {
            response.writeHead(429, { 'Retry-After': '0' }).end('Too Many Requests');
        } else if (request.url === '/down/') {
            response.writeHead(502).end('upstream is down');
        } else if (request.url === '/gone/') {
            response.writeHead(404).end('<html><title>Not found</title></html>');
        } else {
            response.end('<html><head><link rel="canonical" href="/product/"></head></html>');
        }
    });

    process.env.QA_BASE_URL = `http://127.0.0.1:${qa.address().port}`;
    process.env.QA_PREVIEW_COOKIE = 'preview=secret-value';
    ({ fetchPage } = await import('../raw-html.mjs'));
});

after(() => {
    qa.close();
    other.close();
});

it('sends the preview cookie to QA_BASE_URL, through a same-host redirect', async () => {
    const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'product', path: '/moved/' });
    assert.equal(page.status, 200);
    assert.match(page.html, /canonical/);
    assert.deepEqual(seen.qa.slice(-2).map(request => request.cookie), ['preview=secret-value', 'preview=secret-value']);
});

it('never sends the preview cookie to a host a redirect points at', async () => {
    const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'product', path: '/elsewhere/' });
    assert.equal(page.status, 200);
    assert.equal(seen.other.length, 1);
    assert.equal(seen.other[0].cookie, undefined);
});

describe('a page that answers 5xx', () => {
    it('is fetched once more after about 2 s, and the output says so', async t => {
        const log = t.mock.method(console, 'log', () => {});
        const started = Date.now();
        const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'product', path: '/flaky/' });
        assert.equal(page.status, 200);
        assert.match(page.html, /canonical/);
        assert.equal(requestsFor('/flaky/'), 2);
        assert.ok(Date.now() - started >= 1900, 'it waits about 2 s first');
        assert.deepEqual(log.mock.calls.map(call => call.arguments.join(' ')), [
            'RETRY    product /flaky/ returned HTTP 500; fetching it once more in 2 s (stencil start\'s request to the store can drop)',
        ]);
    });

    it('fails as before when the second request answers 5xx too', async t => {
        t.mock.method(console, 'log', () => {});
        const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'product', path: '/down/' });
        assert.equal(page.status, 502);
        assert.equal(requestsFor('/down/'), 2, 'only once more');
    });

    it('is, with a 429, the only status fetched again: a 404 is the page\'s answer', async t => {
        const log = t.mock.method(console, 'log', () => {});
        const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'product', path: '/gone/' });
        assert.equal(page.status, 404);
        assert.equal(requestsFor('/gone/'), 1);
        assert.equal(log.mock.callCount(), 0);
    });
});

describe('a page that answers 429', () => {
    it('is fetched again once its Retry-After has passed, and the output says so', async t => {
        const log = t.mock.method(console, 'log', () => {});
        const started = Date.now();
        const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'product', path: '/busy/' });
        assert.equal(page.status, 200);
        assert.match(page.html, /canonical/);
        assert.equal(requestsFor('/busy/'), 2);
        assert.ok(Date.now() - started >= 900, 'it waits the 1 s its Retry-After asks for');
        assert.deepEqual(log.mock.calls.map(call => call.arguments.join(' ')), [
            'RETRY    product /busy/ returned HTTP 429; fetching it again in 1 s, as its Retry-After asks (retry 1 of 3; the store is limiting requests)',
        ]);
    });

    it('fails as a 429 after three retries', async t => {
        const log = t.mock.method(console, 'log', () => {});
        const page = await fetchPage(process.env.QA_BASE_URL, { kind: 'category', path: '/throttled/' });
        assert.equal(page.status, 429);
        assert.equal(requestsFor('/throttled/'), 4);
        assert.equal(log.mock.callCount(), 3);
    });
});
