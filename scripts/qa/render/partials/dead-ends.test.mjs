// The three dead ends (ticket 51; redesign step 3; spec modules 24 and 25; stories 66, 68 and
// 71): the 404 page (components/reelflies/not-found.html, from stock errors/404.html's hero
// block), the empty box (cart-empty.html, from cart-page.html's empty branch) and a search with
// no results (search-empty.html, from search-page.html), and the Fly Type links all three share
// (dead-end-links.html, drawn through cats.html's and species.html's dead-end views).
//
// Whole pages, not just the partials: each partial is included inside its page's
// {{#partial "hero"}} block, where @root is empty, so the links read the page's categories and
// settings from there and nowhere else, and head.html's page variables (the Species root) are
// set before the block.
//
// Retired with the redesign: "Shop dry flies" to the first Fly Type (the empty box offers "Keep
// shopping" to the home page) and the stock search box on the 404 page (the header's own form,
// search-form.html, with the suggestions).
//
//   node --test scripts/qa/render/partials/dead-ends.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';
import {
    EMPTY_IDS, TREE_1, TREE_4, TREE_4_IDS, TREE_4_LINKS, TREE_4_NAMES, emptyCart, notFound, search,
} from './dead-ends/pages.mjs';

const LANG = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'lang/en.json'), 'utf8')).reelflies;

const linksList = html => outerHtml(html, 'ul', attrs => 'data-rf-dead-end-links' in attrs);
const linkIds = html => findTags(linksList(html) || '', 'a').map(tag => tag.attrs['data-rf-menu-id']);
const mains = html => findTags(html).filter(tag => tag.name === 'main' || tag.attrs.role === 'main');
const inMain = html => elementsHtml(html, 'main')[0] || '';
const block = (html, attr) => outerHtml(html, 'div', attrs => attr in attrs);
const chartLinks = html => findTags(html, 'a').filter(tag => tag.attrs.href === '/fly-hook-size-chart/');

describe('the links (components/reelflies/dead-end-links.html)', () => {
    // As a page includes them: head.html's variables first, then the list with the page's tree.
    const LINKS = 'rf-test/dead-end-links';
    const links = (settings, categories = TREE_4, species = 1) => renderPartial(LINKS, { theme_settings: settings, categories, species }, {
        overrides: { [LINKS]: "{{assignVar 'rf_species_root' (trim theme_settings.rf_menu_species_root_id)}}{{> components/reelflies/dead-end-links rf_tree=categories rf_label='Shop flies' rf_species=species}}" },
    });

    it('lists the six Fly Types in rf_menu_type_ids order, then Flies by Species, as server-rendered links (story 66)', async () => {
        const html = await links(TREE_4_IDS);
        assert.deepEqual(linkIds(html), TREE_4_LINKS);
        assert.deepEqual(findTags(html, 'a').map(tag => tag.attrs.href), ['/dry-flies/', '/nymphs/', '/streamers/', '/eggs-worms/', '/warmwater-flies/', '/saltwater-flies/', '/species/']);
        assert.equal(textOf(elementsHtml(html, 'a').at(-1)), 'Flies by Species');
        assert.equal(findTags(html, 'nav').length, 0, 'a list, not a second navigation landmark');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('declares the ids it was given, and its label, so the raw-HTML check can hold the links to them', async () => {
        const [list] = findTags(linksList(await links(TREE_4_IDS)), 'ul');
        assert.equal(decodeHtml(list.attrs['data-rf-menu-type-ids']), TREE_4_IDS.rf_menu_type_ids);
        assert.equal(decodeHtml(list.attrs['data-rf-menu-species-root-id']), TREE_4_IDS.rf_menu_species_root_id);
        assert.equal(decodeHtml(list.attrs['aria-label']), 'Shop flies');
        assert.match(list.attrs.class, /(^|\s)rf-dead-links(\s|$)/);
    });

    it('renders nothing with no Fly Type ids, or only spaces: no empty list, even with a Species root', async () => {
        assert.equal((await links(EMPTY_IDS)).trim(), '');
        assert.equal((await links({ rf_menu_type_ids: ' ', rf_menu_species_root_id: '520' })).trim(), '');
    });

    it('follows the variation\'s ids, never the tree\'s position: tree 1\'s Fly Types one level down, and the Species link only where asked for', async () => {
        assert.deepEqual(linkIds(await links({ rf_menu_type_ids: '251,298', rf_menu_species_root_id: '' }, TREE_1)), ['251', '298']);
        const noSpecies = await links(TREE_4_IDS, TREE_4, 0);
        assert.deepEqual(linkIds(noSpecies), TREE_4_LINKS.slice(0, 6));
        assert.ok(!('data-rf-menu-species-root-id' in findTags(linksList(noSpecies), 'ul')[0].attrs), 'the list declares no Species root it doesn\'t draw');
    });
});

describe('the 404 page (pages/errors/404)', () => {
    it('has one <main>, one H1 with the ReelFlies heading, the line, the search form with its suggestions, then the links and the hook size chart, all inside the <main>', async () => {
        const html = await notFound();
        assert.equal(mains(html).length, 1);
        const h1s = elementsHtml(html, 'h1');
        assert.equal(h1s.length, 1);
        assert.equal(textOf(h1s[0]), LANG.not_found.heading);
        const main = inMain(html);
        const content = block(main, 'data-rf-not-found');
        assert.ok(content, 'the 404 content');
        assert.ok(textOf(content).includes(LANG.not_found.message));
        const [form] = findTags(content, 'form');
        assert.equal(form.attrs.action, '/search.php', 'the header\'s search form (search-form.html), on the page a second time');
        assert.ok('data-rf-search' in form.attrs, 'so quick-search.js binds it');
        assert.equal(findTags(content, 'input').find(tag => tag.attrs.name === 'search_query').attrs.id, 'rf-not-found-q', 'an id of its own beside the header\'s');
        assert.deepEqual(linkIds(content), TREE_4_LINKS);
        assert.deepEqual(chartLinks(content).map(tag => textOf(elementsHtml(content, 'a', attrs => attrs.href === tag.attrs.href)[0])), [LANG.menu.hook_chart]);
        const order = ['<h1', LANG.not_found.message, '<form', 'data-rf-dead-end-links', '/fly-hook-size-chart/'].map(mark => content.indexOf(mark));
        assert.deepEqual([...order].sort((a, b) => a - b), order, 'H1, line, search form, links, chart');
        assert.doesNotMatch(textOf(html), /404 Error - Page not found/, 'the stock heading isn\'t rendered too');
        assert.deepEqual(unbalancedTags(main), []);
    });

    it('with both menu ids empty, shows the H1, the line and the search form, and no list', async () => {
        const html = await notFound(EMPTY_IDS);
        assert.equal(elementsHtml(html, 'h1').length, 1);
        assert.ok(textOf(html).includes(LANG.not_found.message));
        assert.ok(findTags(block(inMain(html), 'data-rf-not-found'), 'form').length);
        assert.equal(linksList(html), null);
        assert.equal(findTags(block(inMain(html), 'data-rf-not-found'), 'ul').length, 0, 'no empty list');
    });

    it('leaves the hook size chart out without its setting, and follows the setting\'s path', async () => {
        assert.equal(chartLinks(block(await notFound(TREE_4_IDS, TREE_4), 'data-rf-not-found')).length, 1);
        assert.equal(findTags(block(await notFound({ ...TREE_4_IDS, rf_hook_chart_url: '' }), 'data-rf-not-found'), 'a').filter(tag => /hook/.test(tag.attrs.href)).length, 0);
        assert.ok(findTags(block(await notFound({ ...TREE_4_IDS, rf_hook_chart_url: ' /hooks/ ' }), 'data-rf-not-found'), 'a').some(tag => tag.attrs.href === '/hooks/'));
    });

    it('carries the rf_404_note region for a per-channel note, after the links and inside the <main>', async () => {
        const content = block(inMain(await notFound(TREE_4_IDS, TREE_4, { regions: {} })), 'data-rf-not-found');
        const region = findTags(content, 'div').filter(tag => tag.attrs['data-content-region'] === 'rf_404_note');
        assert.equal(region.length, 1);
        assert.equal(textOf(outerHtml(content, 'div', attrs => attrs['data-content-region'] === 'rf_404_note')), '', 'nothing when no widget is placed');
        assert.ok(content.indexOf('data-rf-dead-end-links') < content.indexOf('rf_404_note'));
        const note = '<div data-widget-id="w1"><p>We reorganised our flies.</p></div>';
        const noted = block(inMain(await notFound(TREE_4_IDS, TREE_4, { regions: { rf_404_note: note } })), 'data-rf-not-found');
        assert.equal(textOf(outerHtml(noted, 'div', attrs => attrs['data-content-region'] === 'rf_404_note')), 'We reorganised our flies.');
    });
});

describe('the empty box (pages/cart, no items)', () => {
    it('has one <main> and one H1, "Your box", and no heading in the empty state, focusable or not', async () => {
        const html = await emptyCart();
        assert.equal(mains(html).length, 1);
        const h1s = elementsHtml(html, 'h1');
        assert.equal(h1s.length, 1);
        assert.equal(textOf(h1s[0]), LANG.cart.heading);
        const empty = block(html, 'data-rf-cart-empty');
        assert.ok(empty, 'the ReelFlies empty state');
        assert.deepEqual(findTags(empty).filter(tag => /^h[1-6]$/.test(tag.name)), []);
        assert.deepEqual(findTags(html).filter(tag => /^h[1-6]$/.test(tag.name) && 'tabindex' in tag.attrs && tag.attrs.tabindex !== '-1'), [], 'no focusable heading anywhere');
        assert.doesNotMatch(html, /<h3 tabindex="0">/);
    });

    it('says the box is empty as plain words under the H1, then the hint, the Fly Types and "Keep shopping" to the home page', async () => {
        const html = await emptyCart();
        const empty = block(html, 'data-rf-cart-empty');
        const text = textOf(empty);
        assert.ok(text.startsWith(`${LANG.cart.empty} ${LANG.cart.empty_hint} `), text);
        assert.ok(text.endsWith(LANG.cart.keep_shopping), text);
        assert.ok(html.indexOf('<h1') < html.indexOf('data-rf-cart-empty'));
        const shop = outerHtml(empty, 'a', attrs => 'data-rf-cart-empty-shop' in attrs);
        assert.equal(textOf(shop), LANG.cart.keep_shopping);
        assert.equal(findTags(shop, 'a')[0].attrs.href, '/');
        assert.deepEqual(linkIds(empty), TREE_4_LINKS.slice(0, 6), 'the Fly Types, without the Species hub');
        assert.equal(decodeHtml(findTags(linksList(empty), 'ul')[0].attrs['aria-label']), LANG.cart.empty_types);
        assert.deepEqual(unbalancedTags(empty), []);
    });

    it('with both menu ids empty, keeps the words and "Keep shopping", and shows no list', async () => {
        const empty = block(await emptyCart(EMPTY_IDS), 'data-rf-cart-empty');
        assert.equal(textOf(empty), `${LANG.cart.empty} ${LANG.cart.empty_hint} ${LANG.cart.keep_shopping}`);
        assert.equal(linksList(empty), null);
        assert.equal(findTags(empty, 'ul').length, 0);
    });
});

describe('a search with no results (pages/search)', () => {
    const help = html => block(html, 'data-rf-search-empty');
    const noMatch = query => LANG.search.none.replace('{query}', query);

    it('shows the no-match line, the tip, the links and the hook size chart, inside the <main>, under the one H1', async () => {
        const html = await search();
        assert.equal(mains(html).length, 1);
        assert.equal(elementsHtml(html, 'h1').length, 1);
        assert.equal(textOf(elementsHtml(html, 'h1')[0]), 'No results for “qzxjv”', 'stock search/heading.html, hooked');
        const box = help(inMain(html));
        assert.ok(box);
        assert.equal(textOf(box), `${noMatch('qzxjv')} ${LANG.search.none_tip} ${TREE_4_NAMES} ${LANG.menu.hook_chart}`);
        assert.deepEqual(linkIds(box), TREE_4_LINKS);
        assert.equal(chartLinks(box).length, 1);
        assert.ok(inMain(html).indexOf('<h1') < inMain(html).indexOf('data-rf-search-empty'));
        assert.deepEqual(unbalancedTags(box), []);
    });

    it('shows them when the platform has suggestions too, once, with the store\'s "Did you mean" and categories kept and stock\'s no-match line and tips left out', async () => {
        const html = await search({ suggestions: true });
        const main = inMain(html);
        assert.equal(findTags(main, 'div').filter(tag => 'data-rf-search-empty' in tag.attrs).length, 1);
        assert.ok(textOf(help(main)).startsWith(noMatch('qzxjv')));
        assert.ok(textOf(main).includes('Did you mean'), 'the store\'s suggested query stays');
        assert.ok(findTags(main, 'a').some(tag => decodeHtml(tag.attrs.href) === '/search.php?search_query=caddis'));
        assert.ok(findTags(main, 'a').some(tag => tag.attrs.href === '/dry-flies/' && !('data-rf-menu-id' in tag.attrs)), 'the store\'s category suggestions stay, as chips');
        assert.doesNotMatch(textOf(main), /did not match any products or information/, 'stock\'s no-match line would say it twice');
        assert.doesNotMatch(textOf(main), /Suggestions:|Make sure all words are spelled correctly/, 'stock\'s tips would say it twice');
    });

    it('shows the query as text, as the store sends it: escaped, so "&" and markup read as typed, never twice escaped', async () => {
        // A search for `<script>alert(1)</script>"&'` arrives in forms.search.query escaped.
        const box = help(await search({ query: '&lt;script&gt;alert(1)&lt;/script&gt;&quot;&amp;&#39;' }));
        assert.equal(findTags(box, 'script').length, 0);
        assert.equal(textOf(outerHtml(box, 'p', attrs => 'data-rf-search-empty-line' in attrs)), noMatch('<script>alert(1)</script>"&\''));
        assert.doesNotMatch(box, /&amp;amp;|&amp;lt;/, 'escaped once, not twice');
    });

    it('makes no element of a query that arrives unescaped either (the XSS check): its tags are stripped, as stock\'s heading strips them', async () => {
        const box = help(await search({ query: 'qzxjv<script>alert(1)</script><img src=x onerror="alert(2)">' }));
        assert.equal(findTags(box, 'script').length, 0);
        assert.equal(findTags(box, 'img').length, 0);
        assert.equal(textOf(outerHtml(box, 'p', attrs => 'data-rf-search-empty-line' in attrs)), noMatch('qzxjvalert(1)'));
    });

    it('shows nothing when there are results, when nothing was searched for, or when the search failed', async () => {
        assert.equal(help(await search({ count: 3 })), null);
        assert.equal(help(await search({ query: '' })), null);
        assert.equal(help(await search({ error: true })), null);
    });

    it('with both menu ids empty, shows the line, the tip and the chart, and no list', async () => {
        const box = help(await search({ settings: EMPTY_IDS }));
        assert.equal(textOf(box), `${noMatch('qzxjv')} ${LANG.search.none_tip} ${LANG.menu.hook_chart}`);
        assert.equal(findTags(box, 'ul').length, 0);
    });

    it('keeps the search_below_content region free for Page Builder, after the results', async () => {
        const main = inMain(await search());
        assert.equal(findTags(main, 'div').filter(tag => tag.attrs['data-content-region'] === 'search_below_content').length, 1);
    });
});

describe('the wording (spec module 25; the drafts wait with the webpages repo\'s site copy)', () => {
    it('is in lang/en.json under reelflies, in the reference\'s words, with "Your box" the shell\'s word', () => {
        assert.equal(LANG.cart.heading, 'Your box');
        assert.equal(LANG.cart.empty, 'Your box is empty.');
        assert.equal(LANG.cart.empty_hint, 'Most orders start with a dozen dry flies or nymphs in two or three sizes.');
        assert.equal(LANG.cart.empty_types, 'Shop by fly type');
        assert.equal(LANG.cart.keep_shopping, 'Keep shopping');
        assert.equal(LANG.search.none, 'No flies match “{query}”.');
        assert.equal(LANG.search.none_tip, 'Check the spelling, or search by fly type, like “caddis” or “nymph”.');
        assert.equal(LANG.not_found.heading, 'Sorry, we can\'t find that page');
        assert.equal(LANG.not_found.links_label, 'Shop flies');
    });

    it('has no hard-coded English in the dead ends\' partials', () => {
        for (const name of ['dead-end-links', 'not-found', 'cart-empty', 'search-empty']) {
            const source = fs.readFileSync(path.join(THEME_DIR, `templates/components/reelflies/${name}.html`), 'utf8').replace(/{{!--[\s\S]*?--}}/g, '');
            const text = source.replace(/{{{?[\s\S]*?}}}?/g, '').replace(/<[^>]+>/g, '').trim();
            assert.equal(text, '', `${name}.html has text outside its lang strings: ${text}`);
        }
    });
});
