// The menu-id resolver, components/reelflies/menu-links.html (ticket 50; build pipeline 6.2,
// used by the footer's Shop column and by ticket 51's dead ends; ticket 28 may adopt it). It turns
// a comma-separated list of category ids into links in the list's order, looking for each id among
// the top-level categories and one level down, never by tree position (BUILD-2).
//
//   node --test scripts/qa/render/partials/menu-links.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

const CALLER = 'rf-test/menu-links-caller';
const resolve = (ids, categories, source = '<ul>{{> components/reelflies/menu-links ids=list}}</ul>') => renderPartial(CALLER, { list: ids, categories }, {
    overrides: { [CALLER]: source },
});
const ids = html => findTags(html, 'a').map(tag => tag.attrs['data-rf-menu-id']);
const hrefs = html => findTags(html, 'a').map(tag => tag.attrs.href);

// A category as the store gives it: id, name, url and its children.
const category = (id, name, url, children) => ({
    id, name, url, ...(children && { children }),
});
const TREE = [
    category('10', 'Flies', '/flies/', [
        category('11', 'Dry Flies', '/flies/dry-flies/', [category('111', 'Caddis', '/flies/dry-flies/caddis/', [])]),
        category('12', 'Nymphs', '/flies/nymphs/', []),
    ]),
    category('20', 'Streamers', '/streamers/', []),
    category('30', 'Eggs & Worms', '/eggs-worms/'),
];

describe('menu-links', () => {
    it('renders one link per id, in the list\'s order, from the top level and one level down', async () => {
        const html = await resolve('12,20,11,30', TREE);
        assert.deepEqual(ids(html), ['12', '20', '11', '30']);
        assert.deepEqual(hrefs(html), ['/flies/nymphs/', '/streamers/', '/flies/dry-flies/', '/eggs-worms/']);
        assert.equal(findTags(html, 'li').length, 4);
        assert.match(html, />Eggs &amp; Worms<\/a>/);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('ignores spaces and stray commas, and skips an id the tree doesn\'t hold', async () => {
        assert.deepEqual(ids(await resolve(' 20 , ,999,10,', TREE)), ['20', '10']);
    });

    it('doesn\'t look two levels down', async () => {
        assert.deepEqual(ids(await resolve('111,12', TREE)), ['12']);
    });

    it('matches ids the store sends as numbers', async () => {
        const numeric = [category(7, 'Saltwater', '/saltwater/', [category(8, 'Tarpon', '/saltwater/tarpon/')])];
        assert.deepEqual(hrefs(await resolve('8,7', numeric)), ['/saltwater/tarpon/', '/saltwater/']);
    });

    it('renders nothing for an empty or missing list', async () => {
        assert.equal(findTags(await resolve('', TREE), 'li').length, 0);
        assert.equal(findTags(await resolve(undefined, TREE), 'li').length, 0);
        assert.equal(findTags(await resolve('10', []), 'li').length, 0);
    });

    it('reads the page\'s categories, wherever it is included from', async () => {
        const nested = await renderPartial(CALLER, { list: '20', categories: TREE, groups: [{ name: 'a' }] }, {
            overrides: { [CALLER]: '{{#each groups}}<ul>{{> components/reelflies/menu-links ids=../list}}</ul>{{/each}}' },
        });
        assert.deepEqual(ids(nested), ['20']);
    });
});
