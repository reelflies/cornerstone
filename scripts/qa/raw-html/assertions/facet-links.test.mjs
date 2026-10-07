// Tests for the facet-links raw-HTML assertion (ticket 33; SEO-12, spec seam 2), on fixture
// pages, through the harness's own registry and checkPage. The registry skips *.test.mjs, so
// this file sits beside its assertion. CI runs it through `npm run test:scripts`.
//
//   node --test scripts/qa/raw-html/assertions/facet-links.test.mjs

import fs from 'fs';
import path from 'path';
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import facetLinks, { decodeHtml, facetAnchors } from './facet-links.mjs';

const FIXTURES = path.resolve('scripts/qa/raw-html/fixtures');
const page = (name, kind = 'category') => ({
    kind,
    path: '/flies/dry-flies/',
    url: 'http://localhost:3301/flies/dry-flies/',
    status: 200,
    html: fs.readFileSync(path.join(FIXTURES, name), 'utf8'),
});
const result = (fixturePage, assertions) => checkPage(fixturePage, assertions).find(({ id }) => id === 'facet-links');

let assertions;
before(async () => {
    assertions = await loadAssertions();
});

describe('the facet-links assertion', () => {
    it('is registered by adding its file, as ticket 33\'s', () => {
        const registered = assertions.find(({ id }) => id === 'facet-links');
        assert.ok(registered, 'facet-links is in the registry');
        assert.equal(registered.ticket, 33);
        assert.equal(registered.pages, undefined, 'it runs on every page kind: facet links appear on category, brand and search pages');
    });

    it('passes stock facet markup: every facet link carries _bc_fsnf=1 and rel="nofollow"', () => {
        const checked = result(page('facet-links-good.html'), assertions);
        assert.equal(checked.status, 'pass', checked.problems.join('\n'));
    });

    it('reads the facet links a crawler sees: the three value links and the selected label, not the pager, the clear links, a comment or a script', () => {
        const good = page('facet-links-good.html');
        const found = facetAnchors(good.html, good.url).map(({ href }) => href);
        assert.deepEqual(found, [
            'https://reelflies.ca/flies/dry-flies/?_bc_fsnf=1&Fly+Sizes=2%2F0&Fly+Sizes=14',
            'https://reelflies.ca/flies/dry-flies/?_bc_fsnf=1&Fly+Sizes=14',
            'https://reelflies.ca/flies/dry-flies/?_bc_fsnf=1&Fly+Sizes=2%2F0&Fly+Sizes=14',
            '/flies/dry-flies/?Fly+Sizes=16&_bc_fsnf=1&sort=featured',
        ]);
    });

    it('fails a link built without the marker, a link without nofollow, a wrong marker, a link with no href and a pill turned into a button', () => {
        const checked = result(page('facet-links-bad.html'), assertions);
        assert.equal(checked.status, 'fail');
        assert.deepEqual(checked.problems, [
            'facet link without _bc_fsnf=1, so robots.txt doesn\'t block it: /flies/dry-flies/?Fly+Sizes=14',
            'facet link without rel="nofollow": https://reelflies.ca/flies/dry-flies/?_bc_fsnf=1&Fly+Sizes=16',
            'facet link without _bc_fsnf=1, so robots.txt doesn\'t block it, and without rel="nofollow": /flies/dry-flies/?_bc_fsnf=0&Fly+Sizes=18',
            'facet link with no URL to follow, so it filters only with JavaScript: <a class="navList-action" rel="nofollow" data-faceted-search-facet>',
            'facet control that isn\'t a link, so it filters only with JavaScript: <button type="button" class="rf-pill" data-faceted-search-facet>',
        ]);
    });

    it('passes a page with no facets, as stencil start renders every listing today', () => {
        const home = { ...page('facet-links-good.html', 'home'), html: '<!DOCTYPE html><html><body><main><h1>Home</h1></main></body></html>' };
        assert.equal(result(home, assertions).status, 'pass');
    });

    it('reads a relative href against the page, and an absolute one as it is', () => {
        const html = '<a href="?_bc_fsnf=1&amp;Fly+Sizes=14" rel="nofollow" data-faceted-search-facet>14</a>'
            + '<a href="https://reelflies.ca/flies/nymphs/?Fly+Sizes=12" rel="nofollow" data-faceted-search-facet>12</a>';
        assert.deepEqual(facetLinks.check({ html, url: 'http://localhost:3301/flies/dry-flies/' }), [
            'facet link without _bc_fsnf=1, so robots.txt doesn\'t block it: https://reelflies.ca/flies/nymphs/?Fly+Sizes=12',
        ]);
    });

    it('fails a facet link whose href isn\'t a URL', () => {
        assert.deepEqual(facetLinks.check({ html: '<a href="http://[bad/?Fly+Sizes=14" data-faceted-search-facet>14</a>', url: 'http://localhost:3301/' }), [
            'facet link whose href isn\'t a URL: <a href="http://[bad/?Fly+Sizes=14" data-faceted-search-facet>',
        ]);
    });

    it('fails a facet link that only points at the page itself or runs a script', () => {
        const html = '<a href="#" rel="nofollow" data-faceted-search-facet>14</a><a href="javascript:void(0)" data-faceted-search-facet>16</a><a href=" " data-faceted-search-facet>18</a>';
        assert.deepEqual(facetLinks.check({ html, url: 'http://localhost:3301/flies/dry-flies/' }), [
            'facet link with no URL to follow, so it filters only with JavaScript: <a href="#" rel="nofollow" data-faceted-search-facet>',
            'facet link with no URL to follow, so it filters only with JavaScript: <a href="javascript:void(0)" data-faceted-search-facet>',
            'facet link with no URL to follow, so it filters only with JavaScript: <a href=" " data-faceted-search-facet>',
        ]);
    });

    it('treats a search query, a sort or a page as no filter, so the search page\'s clear link isn\'t a facet link', () => {
        const html = '<a href="/search.php?search_query=adams&amp;section=product&amp;sort=newest&amp;limit=24&amp;mode=grid" data-faceted-search-facet>Clear all</a>';
        assert.deepEqual(facetAnchors(html, 'http://localhost:3301/search.php?search_query=adams'), []);
        assert.deepEqual(facetLinks.check({ html, url: 'http://localhost:3301/search.php' }), []);
    });
});

describe('decodeHtml', () => {
    it('decodes the character references Handlebars writes into attributes', () => {
        assert.equal(decodeHtml('?_bc_fsnf&#x3D;1&amp;Fly+Sizes&#x3D;2%2F0'), '?_bc_fsnf=1&Fly+Sizes=2%2F0');
        assert.equal(decodeHtml('&quot;&#x27;&#x60;&lt;&gt;&#61;&apos;&#X3d;'), '"\'`<>=\'=');
    });

    it('leaves text without references, and references it doesn\'t know, as they are', () => {
        assert.equal(decodeHtml('/flies/dry-flies/?page=2'), '/flies/dry-flies/?page=2');
        assert.equal(decodeHtml('a &copy; b &#xZZ; &#x110000;'), 'a &copy; b &#xZZ; &#x110000;');
    });
});
