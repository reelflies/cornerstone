// Tests ticket 30's raw-HTML assertion rf-search-forms (spec seam 2; redesign step 3) on the
// search form as components/reelflies/search-form.html renders it, on the 404 page, which carries
// the header's and its own, and on broken copies of them.
//
//   node --test scripts/qa/raw-html/assertions/rf-search-forms.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderPartial } from '../../render/render.mjs';
import { notFound } from '../../render/partials/dead-ends/pages.mjs';
import searchForms, { searchFormProblems } from './rf-search-forms.mjs';

const CALLER = 'rf-test/search-form';
const form = (id = 'rf-search-q') => renderPartial(CALLER, { urls: { search: '/search.php' }, id }, {
    overrides: { [CALLER]: '{{> components/reelflies/search-form rf_id=id}}' },
});
const frame = html => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><header>${html}</header><main id="main-content"><h1>Page</h1></main></body></html>`;
const FORM = '<form class="rf-search" role="search" action="/search.php" method="get" data-rf-search>';
const FIELD = '<input id="rf-search-q" name="search_query" type="search"';
const PANEL = '<div class="rf-suggest" data-rf-suggest hidden></div>';

describe('rf-search-forms', () => {
    it('is registered for every page kind, as ticket 30\'s', () => {
        assert.equal(searchForms.id, 'rf-search-forms');
        assert.equal(searchForms.ticket, 30);
        assert.equal(searchForms.pages, undefined);
    });

    it('passes the form as rendered, and the 404 page with the header\'s form and its own', async () => {
        const html = frame(await form());
        assert.ok(html.includes(FORM) && html.includes(FIELD) && html.includes(PANEL), 'the markup the breakages below edit');
        assert.deepEqual(searchFormProblems(html), []);
        const page = await notFound();
        assert.equal((page.match(/data-rf-search>/g) || []).length, 2, 'two forms');
        assert.deepEqual(searchForms.check({
            kind: '404', key: '404', path: '/x/', status: 404, html: page,
        }), []);
    });

    it('fails a page with no ReelFlies search form', () => {
        assert.match(searchFormProblems(frame('')).join(), /no ReelFlies search form/);
    });

    it('fails a form with no action, a POST, no role, or a field that isn\'t one search_query of type search', async () => {
        const html = frame(await form());
        assert.match(searchFormProblems(html.replace(' action="/search.php"', '')).join(), /search form 1 has no action/);
        assert.match(searchFormProblems(html.replace('method="get"', 'method="post"')).join(), /submits with post/);
        assert.match(searchFormProblems(html.replace(' role="search"', '')).join(), /isn't role="search"/);
        assert.match(searchFormProblems(html.replace('name="search_query"', 'name="q"')).join(), /holds 0 fields named search_query/);
        assert.match(searchFormProblems(html.replace('type="search"', 'type="text"')).join(), /is type="text", not search/);
        assert.match(searchFormProblems(html.replace(PANEL, `${PANEL}<input name="search_query">`)).join(), /holds 2 fields named search_query/);
    });

    it('fails a field without its label, with an id used twice, or without the one submit button', async () => {
        const html = frame(await form());
        assert.match(searchFormProblems(html.replace(/<label class="is-srOnly" for="rf-search-q">[^<]*<\/label>/, '')).join(), /has no label naming it/);
        assert.match(searchFormProblems(html.replace('for="rf-search-q"', 'for="other"')).join(), /has no label naming it/);
        assert.match(searchFormProblems(html.replace('id="rf-search-q" name', 'name')).join(), /has no id for its label/);
        assert.match(searchFormProblems(html.replace('</header>', `${await form()}</header>`)).join(), /id "rf-search-q" is on the page more than once/);
        assert.deepEqual(searchFormProblems(html.replace('</header>', `${await form('rf-second-q')}</header>`)), [], 'a second form with its own id is fine');
        assert.match(searchFormProblems(html.replace(/<button class="rf-search__go" type="submit">[^<]*<\/button>/, '')).join(), /has no one submit button/);
    });

    it('fails a suggestions panel that is missing, shown, or filled on the server', async () => {
        const html = frame(await form());
        assert.match(searchFormProblems(html.replace(PANEL, '')).join(), /has 0 suggestions panels/);
        assert.match(searchFormProblems(html.replace(PANEL, '<div class="rf-suggest" data-rf-suggest></div>')).join(), /isn't empty and hidden/);
        assert.match(searchFormProblems(html.replace(PANEL, '<div class="rf-suggest" data-rf-suggest hidden><ul><li>Caddis</li></ul></div>')).join(), /isn't empty and hidden/);
    });

    it('fails stock quick-search hooks, and combobox attributes on the field', async () => {
        const html = frame(await form());
        assert.match(searchFormProblems(html.replace('data-rf-search>', 'data-rf-search data-quick-search-form>')).join(), /data-quick-search-form/);
        assert.match(searchFormProblems(html.replace(FIELD, `${FIELD} data-search-quick`)).join(), /data-search-quick/);
        assert.match(searchFormProblems(html.replace(FIELD, `${FIELD} aria-expanded="false" aria-controls="x"`)).join(), /carries aria-expanded/);
        assert.match(searchFormProblems(html.replace(FIELD, `${FIELD} role="combobox"`)).join(), /is a combobox/);
    });
});
