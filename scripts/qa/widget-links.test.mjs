// The home widget link check (ticket 54a; scripts/qa/widget-links.mjs): which links it finds in
// the server HTML, which it fetches, and how it judges each answer. The end-to-end cases run
// against a server of their own on localhost, so no request reaches a store.
//
//   node --test scripts/qa/widget-links.test.mjs

import http from 'http';
import {
    after, before, describe, it,
} from 'node:test';
import assert from 'node:assert/strict';
import {
    checkWidgetLinks, classifyLink, fetchLink, widgetLinks,
} from './widget-links.mjs';

const widget = (id, inner) => `<div data-content-region="home_below_menu"><div data-layout-id="l-${id}"><div data-widget-id="${id}" data-placement-id="p-${id}">${inner}</div></div></div>`;

describe('the links in the home widgets', () => {
    it('are the links inside an element with data-widget-id, in page order, nested elements and all', () => {
        const html = `<header><nav><a href="/flies/">Shop flies</a></nav></header>
            ${widget('w1', '<div class="hero"><div><h1>Flies</h1></div><a class="button" href="/flies/dry-flies/">Shop dry flies</a></div><a href="/flies/nymphs/">Nymphs</a>')}
            <a href="/outside/">Not in a widget</a>
            ${widget('w2', '<ul><li><a href=\'/species/trout/\'>Trout</a></li><li><a>No href</a></li></ul>')}
            <footer><a href="/contact-us/">Contact</a></footer>`;
        assert.deepEqual(widgetLinks(html), [
            { href: '/flies/dry-flies/', widget: 'w1' },
            { href: '/flies/nymphs/', widget: 'w1' },
            { href: '/species/trout/', widget: 'w2' },
        ]);
    });

    it('count a widget inside a widget as the inner one, and go on after it closes', () => {
        const html = widget('outer', `<a href="/a/">a</a>${widget('inner', '<a href="/b/">b</a>')}<a href="/c/">c</a>`);
        assert.deepEqual(widgetLinks(html).map(({ href, widget: id }) => `${href} ${id}`), ['/a/ outer', '/b/ inner', '/c/ outer']);
    });

    it('ignore what a comment or a script holds, and decode the href\'s entities', () => {
        const html = widget('w', '<!-- <a href="/commented/">x</a> --><script>"<a href=\\"/scripted/\\">"</script><a href="/search.php?search_query=adams&amp;section=product">Adams</a><img src="x.jpg"><br/>');
        assert.deepEqual(widgetLinks(html), [{ href: '/search.php?search_query=adams&section=product', widget: 'w' }]);
    });

    it('find none on a page with no widget', () => {
        assert.deepEqual(widgetLinks('<main><a href="/flies/">Shop</a></main>'), []);
    });
});

describe('which links are fetched', () => {
    const options = {
        pageUrl: 'http://localhost:4301/', baseUrl: 'http://localhost:4301', own: ['http://localhost:4301', 'https://reelflies_ca-1895766.mybigcommerce.com'],
    };

    it('fetches a path on the storefront, and a link to the store\'s own host through the run\'s server', () => {
        assert.deepEqual(classifyLink('/flies/dry-flies/', options), { kind: 'check', url: 'http://localhost:4301/flies/dry-flies/', path: '/flies/dry-flies/' });
        assert.deepEqual(classifyLink('https://reelflies_ca-1895766.mybigcommerce.com/species/trout/?sort=featured#top', options), {
            kind: 'check', url: 'http://localhost:4301/species/trout/?sort=featured', path: '/species/trout/?sort=featured',
        });
    });

    it('doesn\'t fetch another host, a link within the page, or one that isn\'t a web page', () => {
        assert.deepEqual(classifyLink('https://www.youtube.com/watch?v=1', options), { kind: 'skip', warn: true, why: 'another host (www.youtube.com), not checked' });
        assert.deepEqual(classifyLink('#about', options), { kind: 'skip', why: 'a link within the page' });
        assert.deepEqual(classifyLink('mailto:hello@reelflies.ca', options), { kind: 'skip', why: 'a mailto: link, not a page' });
        assert.deepEqual(classifyLink('', options), { kind: 'skip', why: 'an empty href' });
    });

    it('never fetches a link that changes the cart or the session on a GET', () => {
        assert.deepEqual(classifyLink('/cart.php?action=add&product_id=6178', options), {
            kind: 'skip', warn: true, why: 'it changes the cart or the session on a GET (read-only-posts.mjs, cart-action), so it is never fetched',
        });
    });

    it('fails an href that isn\'t a URL', () => {
        assert.deepEqual(classifyLink('http://[broken', options), { kind: 'fail', why: 'isn\'t a URL' });
    });
});

describe('checking the links on a storefront', () => {
    let server;
    let baseUrl;
    const seen = [];
    const HOME = `<!doctype html><html><body><header><a href="/moved/">nav, not checked</a></header>
        ${widget('hero', '<a href="/flies/">Shop flies</a> <a href="/flies/">Again</a> <a href="#about">About</a>')}
        ${widget('tiles', '<a href="/moved/">Old tile</a><a href="/gone/">Gone</a><a href="/cart.php?action=add&amp;product_id=1">Add</a><a href="https://elsewhere.example/">Elsewhere</a>')}
        </body></html>`;

    before(async () => {
        server = http.createServer((request, response) => {
            seen.push({ url: request.url, language: request.headers['accept-language'], cookie: request.headers.cookie || null });
            const answers = {
                '/': [200, {}, HOME],
                '/empty/': [200, {}, '<html><body><main>No widgets yet</main></body></html>'],
                '/flies/': [200, {}, 'ok'],
                '/moved/': [301, { Location: '/flies/' }, ''],
            };
            const [status, headers, body] = answers[request.url] || [404, {}, 'missing'];
            response.writeHead(status, headers);
            response.end(body);
        });
        await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
        baseUrl = `http://127.0.0.1:${server.address().port}`;
    });
    after(() => server.close());

    it('passes a 200, fails a redirect and a 404, fetches each link once, and never fetches a cart write', async () => {
        seen.length = 0;
        const { failures, lines } = await checkWidgetLinks({ baseUrl, own: [baseUrl], log: () => {} });
        assert.equal(failures, 2);
        assert.deepEqual(seen.map(({ url }) => url), ['/', '/flies/', '/moved/', '/gone/']);
        assert.ok(seen.every(({ language }) => language), 'every request sends Accept-Language, which stencil start needs');
        const text = lines.join('\n');
        assert.match(text, /^Widget links on the home page \(\/\) at http:\/\/127\.0\.0\.1:\d+: 2 widgets, 7 links, 3 to fetch; no JavaScript runs$/m);
        assert.match(text, /^ok {7}\/flies\/ \(200\), linked 2 times, in widget hero$/m);
        assert.match(text, /^FAIL {5}\/moved\/ redirects \(301\) to \/flies\/, in widget tiles$/m);
        assert.match(text, /^FAIL {5}\/gone\/ answered HTTP 404, in widget tiles$/m);
        assert.match(text, /^WARNING {2}\/cart\.php\?action=add&product_id=1 in widget tiles: it changes the cart/m);
        assert.match(text, /^WARNING {2}https:\/\/elsewhere\.example\/ in widget tiles: another host \(elsewhere\.example\), not checked$/m);
        assert.match(text, /^skipped {2}#about in widget hero: a link within the page$/m);
        assert.match(text, /\n2 widget links failed\.$/);
    });

    it('warns, and passes, when the home page has no widget yet', async () => {
        const { failures, lines } = await checkWidgetLinks({
            baseUrl, homePath: '/empty/', own: [baseUrl], log: () => {},
        });
        assert.equal(failures, 0);
        assert.match(lines.join('\n'), /WARNING {2}the home page has no widget \(no data-widget-id in its server HTML\), so no link was checked/);
    });

    it('fails a home page that doesn\'t answer 200', async () => {
        const { failures, lines } = await checkWidgetLinks({
            baseUrl, homePath: '/gone/', own: [baseUrl], log: () => {},
        });
        assert.equal(failures, 1);
        assert.match(lines.join('\n'), /FAIL {5}the home page \/gone\/ answered HTTP 404, not 200/);
    });

    it('sends the preview cookie to the storefront\'s own host only', async () => {
        seen.length = 0;
        await fetchLink(`${baseUrl}/flies/`, { baseUrl, cookie: 'SHOP_SESSION_TOKEN=x' });
        await fetchLink(`${baseUrl}/flies/`, { baseUrl: 'https://reelflies_ca-1895766.mybigcommerce.com', cookie: 'SHOP_SESSION_TOKEN=x' });
        assert.deepEqual(seen.map(({ cookie }) => cookie), ['SHOP_SESSION_TOKEN=x', null]);
    });
});
