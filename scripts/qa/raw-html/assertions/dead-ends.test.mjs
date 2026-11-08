// Tests the dead ends' raw-HTML assertion (ticket 51; redesign step 3): dead-ends, on whole pages
// rendered from fixture data (render/partials/dead-ends/pages.mjs) and on pages broken one way at a
// time, so each rule is shown to fail. The breakages edit the redesign's markup (not-found.html's
// search-form.html, cart-empty.html).
//
//   node --test scripts/qa/raw-html/assertions/dead-ends.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssertions } from '../../raw-html.mjs';
import {
    EMPTY_IDS, TREE_1, TREE_4, TREE_4_IDS, emptyCart, notFound, search,
} from '../../render/partials/dead-ends/pages.mjs';
import deadEnds from './dead-ends.mjs';

const page = (html, key, path = '/') => ({
    kind: key.split('@')[0], key, path, url: `http://localhost:3701${path}`, status: key === '404' ? 404 : 200, html,
});
const problems = (html, key, path) => deadEnds.check(page(html, key, path)).join('\n');
const SEARCH = '/search.php?search_query=qzxjv&section=product';

describe('dead-ends', () => {
    it('is registered, on the 404, cart and search pages only', async () => {
        assert.ok((await loadAssertions()).some(assertion => assertion.id === 'dead-ends'));
        assert.deepEqual(deadEnds.pages, ['404', 'cart', 'search']);
    });

    it('passes each dead end as rendered, with tree 4\'s ids, tree 1\'s, and none', async () => {
        for (const [settings, tree] of [[TREE_4_IDS, TREE_4], [{ rf_menu_type_ids: '298,251', rf_menu_species_root_id: '' }, TREE_1], [EMPTY_IDS, []]]) {
            assert.equal(problems(await notFound(settings, tree), '404'), ''); // eslint-disable-line no-await-in-loop
            assert.equal(problems(await emptyCart(settings, tree), 'cart'), ''); // eslint-disable-line no-await-in-loop
            assert.equal(problems(await search({ settings, categories: tree }), 'search@none', SEARCH), ''); // eslint-disable-line no-await-in-loop
            assert.equal(problems(await search({ settings, categories: tree, suggestions: true }), 'search@none', SEARCH), ''); // eslint-disable-line no-await-in-loop
        }
    });

    it('passes a search with results, which has no help, and a cart with items is not its business', async () => {
        assert.equal(problems(await search({ query: 'streamer', count: 12 }), 'search', '/search.php?search_query=streamer'), '');
    });

    describe('fails', () => {
        it('a page with no <h1>, or two', async () => {
            const html = await notFound();
            assert.match(problems(html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, ''), '404'), /0 <h1> elements/);
            assert.match(problems(html.replace('</main>', '<h1>Again</h1></main>'), '404'), /2 <h1> elements/);
        });

        it('a 404 page without the ReelFlies content in its <main>, or without the search box', async () => {
            const html = await notFound();
            assert.match(problems(html.replace(/data-rf-not-found/g, ''), '404'), /no ReelFlies 404 content/);
            assert.match(problems(html.replace('<form class="rf-search rf-search--page" role="search" action="/search.php" method="get" data-rf-search>', '<form class="rf-search rf-search--page" role="search" data-rf-search>'), '404'), /no search box/);
        });

        it('Fly Type links that aren\'t the declared ids, in order, or a list with no links', async () => {
            const html = await notFound();
            assert.match(problems(html.replace('data-rf-menu-type-ids="501,502,503,504,505,506"', 'data-rf-menu-type-ids="501,502,503,504,505,506,999"'), '404'), /not the ids declared/);
            const swapped = html.replace('data-rf-menu-id="501"', 'data-rf-menu-id="x"').replace('data-rf-menu-id="502"', 'data-rf-menu-id="501"').replace('data-rf-menu-id="x"', 'data-rf-menu-id="502"');
            assert.match(problems(swapped, '404'), /links are 502, 501/);
            const none = await notFound({ rf_menu_type_ids: ',', rf_menu_species_root_id: '' });
            assert.match(problems(none, '404'), /has no links/);
        });

        it('an empty list where a dead end has no ids', async () => {
            const html = await emptyCart(EMPTY_IDS, []);
            assert.match(problems(html.replace('<div class="rf-cart-empty" data-rf-cart-empty>', '<div class="rf-cart-empty" data-rf-cart-empty><ul></ul>'), 'cart'), /an empty list in the empty cart/);
        });

        it('an empty cart with a heading that takes focus, as stock\'s <h3 tabindex="0">', async () => {
            const html = await emptyCart();
            assert.match(problems(html.replace('<div class="rf-cart-empty" data-rf-cart-empty>', '<div class="rf-cart-empty" data-rf-cart-empty><h3 tabindex="0">Your cart is empty</h3>'), 'cart'), /a heading that takes focus/);
        });

        it('an empty cart with no way forward', async () => {
            const html = await emptyCart();
            assert.match(problems(html.replace(/data-rf-cart-empty-shop/g, ''), 'cart'), /no way forward/);
        });

        it('search@none without the help, or with a line that doesn\'t name the query, or beside stock\'s tips', async () => {
            const html = await search();
            assert.match(problems(html.replace(/data-rf-search-empty\b/g, 'data-x'), 'search@none', SEARCH), /no help for a search with no results/);
            assert.match(problems(html, 'search@none', '/search.php?search_query=caddis'), /doesn't name the query "caddis"/);
            assert.match(problems(html.replace('</main>', '<h5>Suggestions:</h5></main>'), 'search@none', SEARCH), /stock's tips/);
            assert.match(problems(html.replace('</main>', '<p>did not match any products or information.</p></main>'), 'search@none', SEARCH), /stock's no-match line/);
        });
    });
});
