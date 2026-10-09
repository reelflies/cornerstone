// The three dead ends (ticket 51; spec modules 24 and 25; stories 66, 68 and 71): the 404 page
// (components/reelflies/not-found.html, through stock errors/404.html's hook), the empty cart
// (cart-empty.html, through stock cart.html's empty branch) and a search with no results
// (search-empty.html, through stock search.html), and the Fly Type links all three share
// (404-links.html, through ticket 50's menu-links.html resolver).
//
// Whole pages, not just the partials: each partial is included inside its page's
// {{#partial "page"}} block, where @root is empty, so the links read the page's categories and
// settings from there and nowhere else.
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
const inMain = html => elementsHtml(html, 'main', () => true)[0] || '';
const block = (html, attr) => outerHtml(html, 'div', attrs => attr in attrs) || outerHtml(html, 'section', attrs => attr in attrs);

describe('the links (components/reelflies/404-links.html)', () => {
    const LINKS = 'rf-test/dead-end-links';
    const links = (settings, categories = TREE_4) => renderPartial(LINKS, { ...settings, categories }, {
        overrides: { [LINKS]: '{{> components/reelflies/404-links rf_type_ids=rf_menu_type_ids rf_species_id=rf_menu_species_root_id rf_categories=categories}}' },
    });

    it('lists the six Fly Types in rf_menu_type_ids order, then Flies by Species, as server-rendered links (story 66)', async () => {
        const html = await links(TREE_4_IDS);
        assert.deepEqual(linkIds(html), TREE_4_LINKS);
        assert.deepEqual(findTags(html, 'a').map(tag => tag.attrs.href), ['/dry-flies/', '/nymphs/', '/streamers/', '/eggs-worms/', '/warmwater-flies/', '/saltwater-flies/', '/species/']);
        assert.equal(textOf(findTags(html, 'a').length ? elementsHtml(html, 'a', () => true).at(-1) : ''), 'Flies by Species');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('declares the ids it was given, so the raw-HTML check can hold the links to them', async () => {
        const [list] = findTags(linksList(await links(TREE_4_IDS)), 'ul');
        assert.equal(decodeHtml(list.attrs['data-rf-menu-type-ids']), TREE_4_IDS.rf_menu_type_ids);
        assert.equal(decodeHtml(list.attrs['data-rf-menu-species-root-id']), TREE_4_IDS.rf_menu_species_root_id);
        assert.equal(decodeHtml(list.attrs['aria-label']), LANG.not_found.links_label);
    });

    it('renders nothing with both ids empty, or only spaces: no empty list', async () => {
        assert.equal((await links(EMPTY_IDS)).trim(), '');
        assert.equal((await links({ rf_menu_type_ids: ' ', rf_menu_species_root_id: '  ' })).trim(), '');
    });

    it('follows the variation\'s ids, never the tree\'s position: tree 1\'s Fly Types one level down, and no Species link without its id', async () => {
        assert.deepEqual(linkIds(await links({ rf_menu_type_ids: '251,298', rf_menu_species_root_id: '' }, TREE_1)), ['251', '298']);
        assert.deepEqual(linkIds(await links({ rf_menu_type_ids: '', rf_menu_species_root_id: '520' })), ['520']);
    });
});

describe('the 404 page (pages/errors/404)', () => {
    it('has one <main>, one H1 with the ReelFlies heading, the sentence, the stock search box, then the links, all inside the <main>', async () => {
        const html = await notFound();
        assert.equal(mains(html).length, 1);
        const h1s = elementsHtml(html, 'h1', () => true);
        assert.equal(h1s.length, 1);
        assert.equal(textOf(h1s[0]), LANG.not_found.heading);
        const main = inMain(html);
        assert.ok(textOf(main).includes(LANG.not_found.message));
        const form = findTags(main, 'form')[0];
        assert.equal(form.attrs.action, '/search.php', 'the stock search box (components/common/search-box)');
        assert.ok(findTags(main, 'input').some(tag => tag.attrs.name === 'search_query_adv'));
        assert.deepEqual(linkIds(main), TREE_4_LINKS);
        const order = ['<h1', LANG.not_found.message, '<form', 'data-rf-dead-end-links'].map(mark => main.indexOf(mark));
        assert.deepEqual([...order].sort((a, b) => a - b), order, 'H1, sentence, search box, links');
        assert.doesNotMatch(textOf(html), /404 Error - Page not found/, 'the stock heading isn\'t rendered too');
        assert.deepEqual(unbalancedTags(main), []);
    });

    it('with both menu ids empty, shows the H1, the sentence and the search box, and no list', async () => {
        const html = await notFound(EMPTY_IDS);
        assert.equal(elementsHtml(html, 'h1', () => true).length, 1);
        assert.ok(textOf(html).includes(LANG.not_found.message));
        assert.ok(findTags(inMain(html), 'form').length);
        assert.equal(linksList(html), null);
        assert.equal(findTags(inMain(html), 'ul').length, 0, 'no empty list');
    });

    it('carries the rf_404_note region for a per-channel note, after the sentence and inside the <main> (build pipeline 6.9)', async () => {
        const empty = inMain(await notFound(TREE_4_IDS, TREE_4, { regions: {} }));
        const region = findTags(empty, 'div').filter(tag => tag.attrs['data-content-region'] === 'rf_404_note');
        assert.equal(region.length, 1);
        assert.equal(textOf(outerHtml(empty, 'div', attrs => attrs['data-content-region'] === 'rf_404_note')), '', 'nothing when no widget is placed');
        assert.ok(empty.indexOf(LANG.not_found.message) < empty.indexOf('rf_404_note'));
    });

    it('renders a widget placed in the note region', async () => {
        const note = '<div data-widget-id="w1"><p>We reorganised our flies.</p></div>';
        const main = inMain(await notFound(TREE_4_IDS, TREE_4, { regions: { rf_404_note: note } }));
        assert.equal(textOf(outerHtml(main, 'div', attrs => attrs['data-content-region'] === 'rf_404_note')), 'We reorganised our flies.');
    });
});

describe('the empty cart (pages/cart, no items)', () => {
    it('has one <main> and one H1, "Your cart", and no heading in the empty state, focusable or not', async () => {
        const html = await emptyCart();
        assert.equal(mains(html).length, 1);
        const h1s = elementsHtml(html, 'h1', () => true);
        assert.equal(h1s.length, 1);
        assert.equal(textOf(h1s[0]), LANG.cart.heading);
        const empty = block(html, 'data-rf-cart-empty');
        assert.ok(empty, 'the ReelFlies empty state');
        assert.deepEqual(findTags(empty).filter(tag => /^h[1-6]$/.test(tag.name)), []);
        assert.deepEqual(findTags(html).filter(tag => /^h[1-6]$/.test(tag.name) && 'tabindex' in tag.attrs && tag.attrs.tabindex !== '-1'), [], 'no focusable heading anywhere');
        assert.doesNotMatch(html, /<h3 tabindex="0">/);
    });

    it('says the cart is empty as plain text under the H1, then the reference\'s line, "Shop dry flies" and the links', async () => {
        const html = await emptyCart();
        const empty = block(html, 'data-rf-cart-empty');
        const text = textOf(empty);
        assert.ok(text.startsWith(`${LANG.cart_empty.message} ${LANG.cart_empty.lead} ${LANG.cart_empty.shop}`), text);
        assert.ok(html.indexOf('<h1') < html.indexOf('data-rf-cart-empty'));
        const shop = outerHtml(empty, 'a', attrs => 'data-rf-cart-empty-shop' in attrs);
        assert.equal(textOf(shop), LANG.cart_empty.shop);
        assert.equal(findTags(shop, 'a')[0].attrs.href, '/dry-flies/', 'the first Fly Type, Dry Flies in every variation\'s order');
        assert.deepEqual(linkIds(empty), TREE_4_LINKS);
        assert.deepEqual(unbalancedTags(empty), []);
    });

    it('goes to the first Fly Type the tree holds, past stray commas and spaces', async () => {
        const empty = block(await emptyCart({ ...TREE_4_IDS, rf_menu_type_ids: ' , 502,501' }), 'data-rf-cart-empty');
        assert.equal(findTags(outerHtml(empty, 'a', attrs => 'data-rf-cart-empty-shop' in attrs), 'a')[0].attrs.href, '/nymphs/');
    });

    it('with both menu ids empty, offers "Continue shopping" to the home page instead, and no list', async () => {
        const empty = block(await emptyCart(EMPTY_IDS), 'data-rf-cart-empty');
        const shop = outerHtml(empty, 'a', attrs => 'data-rf-cart-empty-shop' in attrs);
        assert.equal(textOf(shop), LANG.cart_empty.continue);
        assert.equal(findTags(shop, 'a')[0].attrs.href, '/');
        assert.equal(linksList(empty), null);
        assert.equal(findTags(empty, 'ul').length, 0);
    });
});

describe('a search with no results (pages/search)', () => {
    const help = html => block(html, 'data-rf-search-empty');
    const noMatch = query => LANG.search_empty.no_match.replace('{query}', query);

    it('shows the no-match line, the tip and the links, inside the <main>, under the one H1', async () => {
        const html = await search();
        assert.equal(mains(html).length, 1);
        assert.equal(elementsHtml(html, 'h1', () => true).length, 1);
        const box = help(inMain(html));
        assert.ok(box);
        assert.equal(textOf(box), `${noMatch('qzxjv')} ${LANG.search_empty.tip} ${TREE_4_NAMES}`);
        assert.deepEqual(linkIds(box), TREE_4_LINKS);
        assert.deepEqual(unbalancedTags(box), []);
    });

    it('shows them when the platform has suggestions too, once, with stock\'s "Did you mean" and categories kept and its own no-match line and tips left out', async () => {
        const html = await search({ suggestions: true });
        const main = inMain(html);
        assert.equal(findTags(main, 'div').filter(tag => 'data-rf-search-empty' in tag.attrs).length, 1);
        assert.ok(textOf(help(main)).startsWith(noMatch('qzxjv')));
        assert.ok(textOf(main).includes('Did you mean'), 'stock\'s suggested query stays');
        assert.ok(findTags(main, 'a').some(tag => decodeHtml(tag.attrs.href) === '/search.php?search_query=caddis'));
        assert.ok(findTags(main, 'a').some(tag => tag.attrs.href === '/dry-flies/' && !('data-rf-menu-id' in tag.attrs)), 'stock\'s category suggestions stay');
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

    it('with both menu ids empty, shows the line and the tip, and no list', async () => {
        const box = help(await search({ settings: EMPTY_IDS }));
        assert.equal(textOf(box), `${noMatch('qzxjv')} ${LANG.search_empty.tip}`);
        assert.equal(findTags(box, 'ul').length, 0);
    });

    it('keeps the search_below_content region free for Page Builder, after the results', async () => {
        const main = inMain(await search());
        assert.equal(findTags(main, 'div').filter(tag => tag.attrs['data-content-region'] === 'search_below_content').length, 1);
    });
});

describe('the wording (spec module 25)', () => {
    it('is in lang/en.json under reelflies, in the reference\'s words', () => {
        assert.equal(LANG.cart_empty.lead, 'Most orders start with a dozen dry flies or nymphs in two or three sizes.');
        assert.equal(LANG.cart_empty.shop, 'Shop dry flies');
        assert.equal(LANG.search_empty.no_match, 'No flies match “{query}”.');
        assert.equal(LANG.search_empty.tip, 'Check the spelling, or search by fly type, like “caddis” or “nymph”.');
    });

    it('has no hard-coded English in the dead ends\' partials', () => {
        for (const name of ['404-links', 'not-found', 'cart-empty', 'search-empty']) {
            const source = fs.readFileSync(path.join(THEME_DIR, `templates/components/reelflies/${name}.html`), 'utf8').replace(/{{!--[\s\S]*?--}}/g, '');
            const text = source.replace(/{{{?[\s\S]*?}}}?/g, '').replace(/<[^>]+>/g, '').trim();
            assert.equal(text, '', `${name}.html has text outside its lang strings: ${text}`);
        }
    });
});
