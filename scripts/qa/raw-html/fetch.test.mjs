// The raw-HTML fetch sends the prelaunch preview cookie to QA_BASE_URL and to no other
// host, even when a page redirects there. Two local servers stand in for the hosts.
//
//   node --test scripts/qa/raw-html/fetch.test.mjs

import http from 'http';
import { after, before, it } from 'node:test';
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

before(async () => {
    other = await serve('other', (request, response) => response.end('<html></html>'));
    const otherUrl = `http://127.0.0.1:${other.address().port}`;
    qa = await serve('qa', (request, response) => {
        if (request.url === '/moved/') {
            response.writeHead(301, { Location: '/product/' }).end();
        } else if (request.url === '/elsewhere/') {
            response.writeHead(302, { Location: `${otherUrl}/landing/` }).end();
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
