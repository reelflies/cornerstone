// The ids-to-links resolver, components/reelflies/cats.html with cat-view.html's link views
// (ticket 50; build pipeline 6.2; redrawn for Streamside Stone: what menu-links.html did). It turns
// a comma-separated list of category ids into links in the list's order, looking for each id at
// the categories data's first three levels (the channel's Menu Display Depth), never by tree
// position (BUILD-2), and nav-links.html chooses between it and nav-more.html's top-level
// fallback for the header's and the drawer's plain links.
//
//   node --test scripts/qa/render/partials/menu-links.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, textOf } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

const CALLER = 'rf-test/menu-links-caller';
const call = (view, tree = 'categories', ids = 'list') => `{{> components/reelflies/cats rf_tree=${tree} ids=${ids} view='${view}'}}`;
const resolve = (ids, categories, source = `<ul>${call('dead-end')}</ul>`) => renderPartial(CALLER, { list: ids, categories }, {
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
        category('11', 'Dry Flies', '/flies/dry-flies/', [
            category('111', 'Caddis', '/flies/dry-flies/caddis/', [category('1111', 'Elk Hair Caddis', '/flies/dry-flies/caddis/elk-hair-caddis/', [])]),
        ]),
        category('12', 'Nymphs', '/flies/nymphs/', []),
    ]),
    category('20', 'Streamers', '/streamers/', []),
    category('30', 'Eggs & Worms', '/eggs-worms/'),
    category('40', 'Fly Gear', '/fly-gear/', []),
];

describe('the resolver (cats.html)', () => {
    it('renders one link per id, in the list\'s order, from the top level and two levels down', async () => {
        const html = await resolve('12,20,111,30,11', TREE);
        assert.deepEqual(ids(html), ['12', '20', '111', '30', '11']);
        assert.deepEqual(hrefs(html), ['/flies/nymphs/', '/streamers/', '/flies/dry-flies/caddis/', '/eggs-worms/', '/flies/dry-flies/']);
        assert.equal(findTags(html, 'li').length, 5);
        assert.match(html, />Eggs &amp; Worms<\/a>/);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('ignores spaces and stray commas, and skips an id the tree doesn\'t hold', async () => {
        assert.deepEqual(ids(await resolve(' 20 , ,999,10,', TREE)), ['20', '10']);
    });

    it('doesn\'t look four levels down: Menu Display Depth is 3', async () => {
        assert.deepEqual(ids(await resolve('1111,12', TREE)), ['12']);
    });

    it('matches ids the store sends as numbers', async () => {
        const numeric = [category(7, 'Saltwater', '/saltwater/', [category(8, 'Tarpon', '/saltwater/tarpon/')])];
        assert.deepEqual(hrefs(await resolve('8,7', numeric)), ['/saltwater/tarpon/', '/saltwater/']);
    });

    it('renders nothing for an empty or missing list, or an empty tree', async () => {
        assert.equal(findTags(await resolve('', TREE), 'li').length, 0);
        assert.equal(findTags(await resolve(undefined, TREE), 'li').length, 0);
        assert.equal(findTags(await resolve('10', []), 'li').length, 0);
    });

    it('draws each link view: nav as a nav row item, drawer-link and foot as plain items, dead-end naming its id', async () => {
        const nav = await resolve('20', TREE, `<ul>${call('nav')}</ul>`);
        assert.equal(nav.replace(/\s+/g, ' ').trim(), '<ul><li class="rf-nav__item"><a class="rf-nav__btn" href="/streamers/">Streamers</a></li></ul>');
        const plain = await Promise.all(['drawer-link', 'foot'].map(view => resolve('20,12', TREE, `<ul>${call(view)}</ul>`)));
        for (const html of plain) {
            assert.equal(html.replace(/\s+/g, ' ').trim(), '<ul><li><a href="/streamers/">Streamers</a></li><li><a href="/flies/nymphs/">Nymphs</a></li></ul>');
        }
        const dead = findTags(await resolve('20', TREE), 'a')[0];
        assert.equal(dead.attrs['data-rf-menu-id'], '20', 'for the dead-ends check');
    });

    it('reads the categories passed as rf_tree, wherever it is included from', async () => {
        const nested = await renderPartial(CALLER, { list: '20', categories: TREE, groups: [{ name: 'a' }] }, {
            overrides: { [CALLER]: `{{#each groups}}<ul>${call('dead-end', '../categories', '../list')}</ul>{{/each}}` },
        });
        assert.deepEqual(ids(nested), ['20']);
        const passed = [category('70', 'Passed', '/passed/')];
        const other = await renderPartial(CALLER, { list: '70,20', categories: TREE, passed }, {
            overrides: { [CALLER]: `<ul>${call('dead-end', 'passed')}</ul>` },
        });
        assert.deepEqual(hrefs(other), ['/passed/'], 'the tree passed, not the page\'s');
    });

    // The dead ends include it from a page's {{#partial "page"}} block, where @root is empty: the
    // block renders later, inside layout/base, without the page's data. So every caller passes the
    // page's categories as rf_tree.
    describe('inside a page\'s {{#partial "page"}} block, where @root is empty', () => {
        const LAYOUT = 'rf-test/menu-links-layout';
        const inPage = (source, context) => renderPartial(CALLER, context, {
            overrides: {
                [CALLER]: `{{#partial "page"}}<ul>${source}</ul>{{/partial}}{{> ${LAYOUT}}}`,
                [LAYOUT]: '<body>{{{block "page"}}}</body>',
            },
        });

        it('finds nothing in @root.categories there, which is why the categories are passed', async () => {
            assert.equal(findTags(await inPage(call('dead-end', '@root.categories'), { list: '12,20', categories: TREE }), 'a').length, 0);
        });

        it('reads the categories passed as rf_tree, in the list\'s order', async () => {
            const html = await inPage(call('dead-end'), { list: '12,20,11', categories: TREE });
            assert.deepEqual(ids(html), ['12', '20', '11']);
            assert.deepEqual(unbalancedTags(html), []);
        });
    });
});

describe('the plain links (nav-links.html)', () => {
    const PAGE_VARS = '{{assignVar \'rf_type_ids\' \'11\'}}{{assignVar \'rf_species_root\' \'20\'}}{{assignVar \'rf_exclude_ids\' \'30\'}}';
    const navLinks = (list, vars = PAGE_VARS) => renderPartial(CALLER, { list, categories: TREE }, {
        overrides: { [CALLER]: `${vars}<ul>{{> components/reelflies/nav-links rf_tree=categories rf_link_ids=list rf_view='foot'}}</ul>` },
    });

    it('draws rf_menu_link_ids through the resolver, in their order, whatever the page variables exclude', async () => {
        const html = await navLinks('30,12');
        assert.deepEqual(hrefs(html), ['/eggs-worms/', '/flies/nymphs/']);
        assert.equal(textOf(html), 'Eggs & Worms Nymphs');
    });

    it('falls back to the top-level categories the menus don\'t cover with the setting empty: not a Fly Type, a category holding one, the Species root or an excluded id', async () => {
        assert.deepEqual(hrefs(await navLinks('')), ['/fly-gear/'], 'Flies holds Dry Flies (a Fly Type), Streamers is the Species root, Eggs & Worms is excluded');
        assert.deepEqual(hrefs(await navLinks('   ')), ['/fly-gear/'], 'spaces are empty');
        assert.deepEqual(hrefs(await navLinks('', '')), ['/flies/', '/streamers/', '/eggs-worms/', '/fly-gear/'], 'with nothing set, every top-level category, as the stock menu lists them');
    });
});
