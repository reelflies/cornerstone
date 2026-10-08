// Tests ticket 30's raw-HTML assertion rf-search-forms (spec seam 2), on pages built round the
// header as components/common/header.html renders it for each template, and on broken copies of it.
//
//   node --test scripts/qa/raw-html/assertions/rf-search-forms.test.mjs

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { renderPartial } from '../../render/render.mjs';
import { searchFormProblems } from './rf-search-forms.mjs';

const STORE = {
    urls: {
        home: 'https://reelflies.ca/', search: '/search.php', cart: '/cart.php', auth: { login: '/login.php' },
    },
    settings: { store_logo: { title: 'ReelFlies.ca' } },
    categories: [{
        id: 298, name: 'Dry Flies', url: '/dry-flies/', children: [],
    }],
};

// The header as a page of `template` renders it: the phone row follows on home, category and
// search pages only (phone-search-row.html reads `template`, which stencil-paper sets).
const header = template => renderPartial(template, STORE, { overrides: { [template]: '{{> components/common/header}}' } });
const frame = html => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body>${html}<main id="main-content"><h1>Page</h1></main></body></html>`;
const page = (html, kind) => ({
    kind, key: kind, path: '/', url: 'http://localhost:3701/', status: kind === '404' ? 404 : 200, html,
});

const rendered = {};
before(async () => {
    for (const template of ['pages/home', 'pages/category', 'pages/search', 'pages/product', 'pages/cart']) {
        rendered[template] = frame(await header(template)); // eslint-disable-line no-await-in-loop
    }
});

describe('rf-search-forms', () => {
    it('is registered for every page kind, as ticket 30\'s', async () => {
        const assertion = (await loadAssertions()).find(entry => entry.id === 'rf-search-forms');
        assert.ok(assertion);
        assert.equal(assertion.ticket, 30);
        assert.equal(assertion.pages, undefined);
    });

    it('passes the header and phone row as they render on home, category and search pages', async () => {
        const [assertion] = (await loadAssertions()).filter(({ id }) => id === 'rf-search-forms');
        for (const [template, kind] of [['pages/home', 'home'], ['pages/category', 'category'], ['pages/search', 'search']]) {
            assert.match(rendered[template], /data-rf-search-form="phone"/, template);
            const [result] = checkPage(page(rendered[template], kind), [assertion]);
            assert.equal(result.status, 'pass', `${kind}: ${(result.problems || []).join('; ')}`);
        }
    });

    it('passes the header alone on product and cart pages, which have no phone row', () => {
        for (const [template, kind] of [['pages/product', 'product'], ['pages/cart', 'cart']]) {
            assert.doesNotMatch(rendered[template], /data-rf-phone-search/, template);
            assert.deepEqual(searchFormProblems(rendered[template], kind), [], kind);
        }
    });

    it('fails a form with no action, a POST, or a field that isn\'t search_query', () => {
        const home = rendered['pages/home'];
        assert.match(searchFormProblems(home.replace('action="/search.php" method="get" data-rf-search-form="header"', 'data-rf-search-form="header"'), 'home').join(), /"header" has no action/);
        assert.match(searchFormProblems(home.replace('method="get" data-rf-search-form="phone"', 'method="post" data-rf-search-form="phone"'), 'home').join(), /"phone" submits with post/);
        assert.match(searchFormProblems(home.replace('id="rf-search-phone" name="search_query"', 'id="rf-search-phone" name="q"'), 'home').join(), /"phone" holds 0 fields named search_query/);
    });

    it('fails stock quick-search hooks, and combobox attributes on the field', () => {
        const home = rendered['pages/home'];
        assert.match(searchFormProblems(home.replace('data-rf-search-form="header"', 'data-rf-search-form="header" data-quick-search-form'), 'home').join(), /data-quick-search-form/);
        assert.match(searchFormProblems(home.replace('id="rf-search-header"', 'id="rf-search-header" aria-expanded="false" aria-controls="x"'), 'home').join(), /aria-expanded.*aria-controls|carries aria-expanded/);
        assert.match(searchFormProblems(home.replace('id="rf-search-header"', 'id="rf-search-header" role="combobox"'), 'home').join(), /is a combobox/);
    });

    it('fails a home, category or search page with the header\'s form but no phone row', () => {
        for (const kind of ['home', 'category', 'search']) {
            assert.match(searchFormProblems(rendered['pages/product'], kind).join(), new RegExp(`no phone search row on the ${kind} page`));
        }
    });

    it('fails the phone row on a page that isn\'t home, category or search', () => {
        for (const kind of ['product', 'cart', '404', 'brand', 'page', 'login']) {
            assert.match(searchFormProblems(rendered['pages/home'], kind).join(), new RegExp(`phone search row is on the ${kind} page`));
        }
    });

    it('fails the phone row inside the header, or twice', () => {
        const home = rendered['pages/home'];
        const row = home.slice(home.indexOf('<div class="rf-phone-search"'), home.indexOf('</form>', home.indexOf('<div class="rf-phone-search"')) + '</form>\n</div>'.length);
        const inside = home.replace(row, '').replace('</header>', `${row}</header>`);
        assert.match(searchFormProblems(inside, 'home').join(), /inside the <header>/);
        assert.match(searchFormProblems(home.replace(row, `${row}${row}`), 'home').join(), /2 phone search rows|"phone" is on the page more than once/);
    });

    it('leaves a page with no ReelFlies search form alone', () => {
        assert.deepEqual(searchFormProblems(frame('<header data-rf-header></header>'), 'home'), []);
    });
});
