// Tests for the raw-HTML harness (scripts/qa/raw-html.mjs) and its registered
// assertions, on fixture pages. CI runs them through `npm run test:scripts`.
//
//   node --test scripts/qa/raw-html/raw-html.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    after, before, describe, it,
} from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions, pagesToFetch } from '../raw-html.mjs';

const FIXTURES = path.resolve('scripts/qa/raw-html/fixtures');
const fixture = (name, kind = 'product') => ({
    kind,
    path: `/${name}`,
    url: `http://localhost:3301/${name}`,
    status: 200,
    html: fs.readFileSync(path.join(FIXTURES, name), 'utf8'),
});
const failed = results => results.filter(result => result.status === 'fail').map(result => result.id);

let assertions;
before(async () => {
    assertions = await loadAssertions();
});

describe('the registered assertions', () => {
    it('include the three starting assertions', () => {
        const ids = assertions.map(assertion => assertion.id);
        for (const id of ['one-canonical', 'json-ld-parses', 'no-region-prompt']) assert.ok(ids.includes(id), `${id} is registered`);
    });

    it('pass a good product page', () => {
        const results = checkPage(fixture('good-product.html'), assertions);
        assert.deepEqual(failed(results), []);
        assert.ok(results.some(result => result.status === 'pass'));
    });

    it('fail a page with two canonicals', () => {
        const results = checkPage(fixture('two-canonicals.html'), assertions);
        assert.deepEqual(failed(results), ['one-canonical']);
        assert.match(results.find(result => result.id === 'one-canonical').problems[0], /2 canonical links/);
    });

    it('fail a page with no canonical', () => {
        const page = fixture('good-product.html');
        page.html = page.html.replace(/<link rel='canonical'[^>]*>/, '');
        assert.deepEqual(failed(checkPage(page, assertions)), ['one-canonical']);
    });

    it('fail a page with a broken JSON-LD block, and say which block', () => {
        const results = checkPage(fixture('broken-json-ld.html'), assertions);
        assert.deepEqual(failed(results), ['json-ld-parses']);
        assert.match(results.find(result => result.id === 'json-ld-parses').problems[0], /JSON-LD block 2 of 2 doesn't parse/);
    });

    it('fail a page whose server HTML carries the outside-Canada prompt marker', () => {
        const results = checkPage(fixture('region-prompt.html'), assertions);
        assert.deepEqual(failed(results), ['no-region-prompt']);
        assert.match(results.find(result => result.id === 'no-region-prompt').problems[0], /data-rf-region-prompt/);
    });

    it('ignore markup inside comments and scripts, which a crawler doesn\'t read as elements', () => {
        // good-product.html has a commented-out canonical and the prompt marker in a script string.
        assert.deepEqual(failed(checkPage(fixture('good-product.html'), assertions)), []);
    });

    it('don\'t ask for a canonical on the cart or the 404 page', () => {
        const page = fixture('good-product.html', 'cart');
        page.html = page.html.replace(/<link rel='canonical'[^>]*>/, '');
        const canonical = checkPage(page, assertions).find(result => result.id === 'one-canonical');
        assert.equal(canonical.status, 'skip');
    });

    it('don\'t ask for a canonical on the sign-in or create-account page (ticket 25)', () => {
        for (const kind of ['login', 'create-account']) {
            const page = fixture('good-product.html', kind);
            page.html = page.html.replace(/<link rel='canonical'[^>]*>/, '');
            assert.equal(checkPage(page, assertions).find(result => result.id === 'one-canonical').status, 'skip', kind);
        }
    });
});

describe('the harness', () => {
    const tempDirs = [];
    after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

    it('picks up a new assertion module dropped into the assertions folder', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-html-'));
        tempDirs.push(dir);
        fs.writeFileSync(path.join(dir, 'one-h1.mjs'), `export default {
            id: 'one-h1',
            ticket: 27,
            description: 'exactly one <h1>',
            check: page => ((page.html.match(/<h1[\\s>]/g) || []).length === 1 ? [] : ['not one <h1>']),
        };\n`);
        fs.writeFileSync(path.join(dir, 'one-h1.test.mjs'), 'throw new Error("tests are not assertions");\n');

        const loaded = await loadAssertions(dir);
        assert.deepEqual(loaded.map(assertion => assertion.id), ['one-h1']);
        assert.deepEqual(failed(checkPage(fixture('good-product.html'), loaded)), []);
    });

    it('refuses an assertion module without an id and a check function', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raw-html-'));
        tempDirs.push(dir);
        fs.writeFileSync(path.join(dir, 'broken.mjs'), 'export default { description: "no id" };\n');
        await assert.rejects(loadAssertions(dir), /broken\.mjs must export default \{ id, description, check \}/);
    });

    it('fails a page that didn\'t render, whatever the assertions say', () => {
        const page = { ...fixture('good-product.html'), status: 404 };
        const results = checkPage(page, assertions);
        assert.deepEqual(failed(results), ['page-renders']);
    });

    it('runs an assertion only on the page kinds it names', () => {
        const productOnly = {
            id: 'offer',
            description: 'has an Offer',
            pages: ['product'],
            check: () => ['no Offer'],
        };
        assert.equal(checkPage(fixture('good-product.html', 'category'), [productOnly])[0].status, 'skip');
        assert.equal(checkPage(fixture('good-product.html', 'product'), [productOnly])[0].status, 'fail');
    });

    it('fails a page that answers 404 when its template should render', () => {
        const page = { ...fixture('good-product.html'), status: 404 };
        assert.match(checkPage(page, assertions)[0].problems[0], /returned HTTP 404, not 200/);
    });

    it('checks the 404 page, which must answer 404, and fails it when it answers 200', () => {
        const notFound = { ...fixture('good-product.html', '404'), status: 404 };
        assert.deepEqual(failed(checkPage(notFound, assertions)), []);
        assert.ok(checkPage(notFound, assertions).some(result => result.status === 'pass'));
        assert.deepEqual(failed(checkPage({ ...notFound, status: 200 }, assertions)), ['page-renders']);
    });

    it('fetches every page pinned for the channel, so a ticket adds a page kind by pinning it', () => {
        const { fetch } = pagesToFetch({
            pages: {
                home: '/', cart: '/cart.php', 404: '/missing/', product: '/p/', category: '/c/',
            },
        });
        assert.deepEqual(fetch.map(({ kind }) => kind).sort(), ['404', 'cart', 'category', 'home', 'product']);
        assert.deepEqual(fetch.find(({ kind }) => kind === 'cart'), { key: 'cart', kind: 'cart', path: '/cart.php' });
    });

    it('fetches every pin of a kind, each named by its key and checked by its kind (W0-8)', () => {
        const { fetch, missing } = pagesToFetch({
            pages: {
                product: '/p/', 'product@sold-out': '/sold-out/', 'category@alpha': '/c/?sort=alphaasc',
            },
        });
        assert.deepEqual(fetch, [
            { key: 'product', kind: 'product', path: '/p/' },
            { key: 'product@sold-out', kind: 'product', path: '/sold-out/' },
            { key: 'category@alpha', kind: 'category', path: '/c/?sort=alphaasc' },
        ]);
        assert.deepEqual(missing, [], 'a kind@name pin counts as that kind\'s page');
    });

    it('says a kind is pinned now when only a kind@name pin of it is', () => {
        const { stale, waiting } = pagesToFetch({ pages: { 'product@5663': '/p/' }, notPinnedYet: { product: 'no products until refactor 13', category: 'no tree 4 until refactor 14' } });
        assert.deepEqual(stale, ['product']);
        assert.deepEqual(waiting.map(({ kind }) => kind), ['category']);
    });

    it('runs an assertion that names a kind on every pin of it, and one that names kind@name on that pin only (W0-8)', () => {
        const pin = (key, name = 'good-product.html') => ({ ...fixture(name, key.split('@')[0]), key });
        const everyProduct = {
            id: 'offer', description: 'has an Offer', pages: ['product'], check: () => ['no Offer'],
        };
        const soldOutOnly = {
            id: 'sold-out', description: 'says sold out', pages: ['product@sold-out'], check: () => ['no sold-out line'],
        };
        const notSoldOut = {
            id: 'add-button', description: 'has an add button', pages: ['product'], notOn: ['product@sold-out'], check: () => ['no add button'],
        };
        const results = key => Object.fromEntries(checkPage(pin(key), [everyProduct, soldOutOnly, notSoldOut]).map(({ id, status }) => [id, status]));
        assert.deepEqual(results('product'), { offer: 'fail', 'sold-out': 'skip', 'add-button': 'fail' });
        assert.deepEqual(results('product@sold-out'), { offer: 'fail', 'sold-out': 'fail', 'add-button': 'skip' });
        assert.deepEqual(results('product@5663'), { offer: 'fail', 'sold-out': 'skip', 'add-button': 'fail' });
    });

    it('expects 404 from a kind@name pin of the 404 kind', () => {
        const typo = { ...fixture('good-product.html', '404'), key: '404@typo', status: 404 };
        assert.deepEqual(failed(checkPage(typo, assertions)), []);
    });

    it('fails a channel with no product or category page pinned, the spec\'s two raw-HTML pages', () => {
        const { missing, waiting } = pagesToFetch({ pages: { home: '/' } });
        assert.deepEqual(missing, ['product', 'category']);
        assert.deepEqual(waiting, []);
    });

    it('only warns about a product or category page the channel says it can\'t pin yet, and why', () => {
        const { missing, waiting } = pagesToFetch({ pages: { home: '/' }, notPinnedYet: { product: 'no products until refactor 13', category: 'no tree 4 until refactor 14' } });
        assert.deepEqual(missing, []);
        assert.deepEqual(waiting, [{ kind: 'product', reason: 'no products until refactor 13' }, { kind: 'category', reason: 'no tree 4 until refactor 14' }]);
    });

    it('says when a page listed as not pinned yet is pinned now, so the entry can go', () => {
        const { stale } = pagesToFetch({ pages: { product: '/p/' }, notPinnedYet: { product: 'no products until refactor 13' } });
        assert.deepEqual(stale, ['product']);
    });
});
