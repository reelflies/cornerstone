// The mega menus and the phone drawer (ticket 28; spec modules 3 and 4; O05-O08, SEO-3, BUILD-2,
// UX-2; redrawn for Streamside Stone, DESIGN.md "Mega menu" and "Phone drawer"):
// components/common/header.html, after components/reelflies/head.html (which sets the page
// variables the menus read), rendered from fixture store data the way stencil start renders it
// (W0-9), on tree 4 as refactor 13 plans it, on tree 1 with the channel-1 variation's ids, and on
// .com's tree 2 with ReelFlies US's (decision 5). Every link is in the server's HTML, from the
// categories data by the ids in the Menu settings (header.html, cats.html, cat-view.html,
// species.html, species-view.html, species-list.html, nav-links.html, nav-more.html, drawer.html).
// The raw HTML on the storefront is the rf-menu assertion's.
//
// Retired with the redesign: the grouped <nav data-rf-menu> in #menu with its rail of groups and
// per-row pane buttons, data-rf-category (now data-rf-cat, the name), the "no All …" rule (the
// drawer ends each Fly Type with "All …" by design), the stock navigation fallback with both ids
// empty (deliberately none: the nav lists the top-level categories as plain links), and the
// drawer footer's Help pages (the footer's now). scripts/qa/menu-urls.mjs stated the old grouping
// rules; the expectations here come straight from the fixtures.
//
//   node --test scripts/qa/render/partials/menu.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import {
    drawerSource, links, menuProblems, menuSource, panelSource, panesFromHtml, railFromHtml,
} from '../../raw-html/assertions/rf-menu.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import {
    readFixture, renderPartial, themeConfig, THEME_DIR,
} from '../render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const TREE_4 = readFixture(path.join(HERE, 'menu/tree-4.json'));
const TREE_1 = readFixture(path.join(HERE, 'menu/tree-1.json'));
const TREE_2 = readFixture(path.join(HERE, 'menu/tree-2.json'));
const CHANNEL_1 = 'ReelFlies CA channel 1';
const US = 'ReelFlies US';
// Tree 4's saltwater species, for rf_species_salt_ids.
const SALT = '630,633,636,639';

const PAGES = [
    { name: 'About Us', url: 'https://reelflies.ca/about-us/' },
    { name: 'Shipping & Returns', url: 'https://reelflies.ca/shipping-returns/' },
    { name: 'Contact Us', url: 'https://reelflies.ca/contact-us/' },
    { name: 'Blog', url: 'https://reelflies.ca/blog/' },
];
const STORE = {
    urls: {
        home: 'https://reelflies.ca/',
        search: '/search.php',
        cart: '/cart.php',
        account: { index: '/account.php' },
        auth: { login: '/login.php', logout: '/login.php?action=logout', create_account: '/login.php?action=create_account' },
        gift_certificate: { purchase: '/giftcertificates.php' },
    },
    settings: {
        store_logo: { image: null, title: 'ReelFlies.ca' },
        store_name: 'ReelFlies',
        phone_number: '1 866 250 4071',
        blog_enabled: true,
        gift_certificates_enabled: true,
    },
    pages: PAGES,
    page_type: 'default',
};
// head.html sets rf_species_root, rf_salt_ids, rf_type_ids, rf_exclude_ids and rf_counts before
// the header renders, as layout/base does; the header alone would render without them.
const PAGE = 'rf-test/menu-page';
const WITH_HEAD = { [PAGE]: '{{> components/reelflies/head}}{{> components/common/header}}' };

const render = (fixture, context = {}, options = {}) => renderPartial(PAGE, {
    ...STORE,
    ...fixture,
    ...context,
    settings: { ...STORE.settings, ...context.settings },
    theme_settings: { ...fixture.theme_settings, ...context.theme_settings },
}, { overrides: WITH_HEAD, ...options });
const tree4 = (context, options) => render(TREE_4, context, options);
const tree1 = (context, options) => render(TREE_1, context, { variation: CHANNEL_1, ...options });
const tree2 = (context, options) => render(TREE_2, context, { variation: US, ...options });
const hasClass = (name, attrs) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const hrefs = html => links(html).map(({ attrs }) => decodeHtml(attrs.href ?? ''));
// Links as [href, text] pairs: of a list of links, or of the links in some markup.
const asPairs = list => list.map(({ attrs, text }) => [decodeHtml(attrs.href ?? ''), text]);
const pairs = html => asPairs(links(html));
const names = list => list.map(({ name }) => name);
const flies = html => panelSource(html, 'rf-mega-flies');
const speciesPanel = html => panelSource(html, 'rf-mega-species');
const megaItems = html => elementsHtml(menuSource(html), 'li', attrs => 'data-rf-mega' in attrs);
// The nav row's plain links: everything outside the Flies and Species items.
const navLinks = html => links(megaItems(html).reduce((rest, item) => rest.replace(item, ''), menuSource(html)));
const alsoRow = html => outerHtml(flies(html), 'div', attrs => hasClass('rf-mega__more', attrs));
const drawerLinks = html => outerHtml(drawerSource(html), 'ul', attrs => hasClass('rf-drawer__links', attrs));
const drawerGroups = html => elementsHtml(drawerSource(html), 'details', attrs => hasClass('rf-drawer__group', attrs));
const summary = details => textOf(outerHtml(details, 'summary'));

// The tree with each category's product count set from `counts` (id -> count), as the
// categories data gives it.
function withCounts(fixture, counts) {
    const add = categories => categories.map(category => ({
        ...category,
        ...(String(category.id) in counts ? { count: counts[String(category.id)] } : {}),
        children: add(category.children || []),
    }));
    return { ...fixture, categories: add(fixture.categories) };
}
// A category by id, at any depth.
function find(categories, id) {
    for (const category of categories) {
        if (String(category.id) === String(id)) return category;
        const below = find(category.children || [], id);
        if (below) return below;
    }
    return null;
}
const typesOf = (fixture, settings) => settings.rf_menu_type_ids.split(',').map(id => find(fixture.categories, id.trim()));

describe('the mega menus on tree 4', () => {
    it('renders Flies and Species as buttons that open hidden panels, in one named nav row, with no stock navigation, and passes the rf-menu assertion', async () => {
        const html = await tree4();
        assert.deepEqual(menuProblems(html), []);
        const nav = menuSource(html);
        assert.equal(findTags(nav, 'nav')[0].attrs['aria-label'], 'Main');
        const items = megaItems(html);
        assert.equal(items.length, 2);
        assert.deepEqual(items.map(item => {
            const [button] = findTags(item, 'button');
            return [textOf(outerHtml(item, 'button')), button.attrs.type, button.attrs['aria-expanded'], button.attrs['aria-controls']];
        }), [['Flies', 'button', 'false', 'rf-mega-flies'], ['Species', 'button', 'false', 'rf-mega-species']]);
        for (const id of ['rf-mega-flies', 'rf-mega-species']) {
            const panel = findTags(nav, 'div').find(tag => tag.attrs.id === id);
            assert.ok(panel && 'data-rf-mega-panel' in panel.attrs && 'hidden' in panel.attrs, `${id} is hidden until opened`);
        }
        assert.equal(findTags(html).filter(tag => hasClass('navPages', tag.attrs) || 'data-menu' in tag.attrs || 'data-collapsible' in tag.attrs).length, 0, 'nothing for stock menu.js or collapsible.js');
        assert.equal(findTags(html).filter(tag => 'data-quick-search-form' in tag.attrs).length, 0, 'no stock quick-search form');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('shows the six Fly Types in rf_menu_type_ids order in the rail, each a link naming its pane and itself, the first active', async () => {
        const rail = railFromHtml(flies(await tree4()));
        assert.deepEqual(rail.map(({ id }) => id), ['501', '502', '503', '504', '505', '506']);
        assert.deepEqual(names(rail), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies']);
        assert.deepEqual(rail.map(({ href }) => href), ['/dry-flies/', '/nymphs/', '/streamers/', '/eggs-worms/', '/warmwater-flies/', '/saltwater-flies/']);
        assert.deepEqual(rail.map(({ active }) => active), [true, false, false, false, false, false]);
    });

    it('draws a pane per Fly Type in the rail\'s order, the first shown, headed by its link, with its subcategories in the categories data\'s order and no third level', async () => {
        const html = await tree4();
        const panes = panesFromHtml(flies(html));
        assert.deepEqual(panes.map(({ id }) => id), ['501', '502', '503', '504', '505', '506']);
        assert.deepEqual(panes.map(({ hidden }) => hidden), [false, true, true, true, true, true]);
        const [dry] = panes;
        assert.deepEqual([dry.head.attrs.href, dry.head.text], ['/dry-flies/', 'Dry Flies']);
        assert.deepEqual(dry.kids.map(({ attrs }) => decodeHtml(attrs['data-rf-cat'])), ['Mayfly Dry Flies', 'Attractor Dry Flies', 'Hoppers & Terrestrials', 'Parachute Dry Flies',
            'Caddis Dry Flies', 'Stonefly Dry Flies', 'Midge Dry Flies', 'Emergers & Cripples'], 'the children in the categories data\'s order (probe 3)');
        assert.ok(dry.kids.every(({ attrs }) => attrs.href.startsWith('/dry-flies/')));
        assert.ok(!hrefs(menuSource(html)).includes('/dry-flies/caddis-dry-flies/elk-hair-caddis/'), 'no third level');
        assert.equal(dry.plate, null, 'no plate without an image in the data (menu-banner.test.mjs)');
    });

    it('links every Fly Type and each of its subcategories, and every Species page, with a real <a href> (the curl criterion)', async () => {
        const found = hrefs(menuSource(await tree4()));
        const expected = typesOf(TREE_4, TREE_4.theme_settings).flatMap(type => [type.url, ...type.children.map(({ url }) => url)]);
        expected.push(...find(TREE_4.categories, '520').children.map(({ url }) => url));
        assert.ok(expected.length > 40);
        assert.deepEqual(expected.filter(url => !found.includes(url)), []);
        assert.ok(!found.some(url => /^\/species\/[^/]+\/[^/]+\//.test(url)), 'no Species × Fly Type pages (decision 3: the 11 names)');
    });

    it('shows a count beside a category only with rf_counts on, and names it in patterns in the pane\'s head', async () => {
        const counted = withCounts(TREE_4, { 501: 1234, 642: 56 });
        const html = await render(counted);
        const panel = flies(html);
        const rail = outerHtml(panel, 'a', attrs => attrs['data-rf-pane-for'] === '501');
        assert.equal(textOf(outerHtml(rail, 'span', attrs => hasClass('rf-mega__n', attrs))), '1,234', 'thousands take a comma');
        const [dry] = panesFromHtml(panel);
        assert.equal(textOf(outerHtml(dry.source, 'p', attrs => hasClass('rf-mega__head', attrs))), 'Dry Flies 1,234 patterns');
        assert.deepEqual(dry.kids.slice(0, 2).map(({ text }) => text), ['Mayfly Dry Flies 56', 'Attractor Dry Flies']);
        const off = flies(await render(counted, { theme_settings: { rf_counts: false } }));
        assert.equal(findTags(off).filter(tag => hasClass('rf-num', tag.attrs)).length, 0);
        assert.equal(textOf(outerHtml(off, 'p', attrs => hasClass('rf-mega__head', attrs))), 'Dry Flies');
    });

    it('lists the Species root\'s children in one group headed by its link while rf_species_salt_ids is empty, never their Fly Type pages, with the hatch card', async () => {
        const panel = speciesPanel(await tree4());
        const groups = elementsHtml(panel, 'div', attrs => hasClass('rf-mega__sp', attrs));
        assert.equal(groups.length, 1);
        assert.ok(hasClass('rf-mega__sp--all', findTags(groups[0], 'div')[0].attrs));
        const [heading] = links(outerHtml(groups[0], 'p', attrs => hasClass('rf-mega__group', attrs)));
        assert.deepEqual([heading.attrs.href, heading.text], ['/species/', 'Flies by Species']);
        const list = links(outerHtml(groups[0], 'ul', attrs => hasClass('rf-mega__splist', attrs)));
        assert.deepEqual(list.map(({ attrs }) => decodeHtml(attrs['data-rf-cat'])), ['Trout Flies', 'Steelhead Flies', 'Atlantic Salmon Flies', 'Bass Flies', 'Pike & Muskie Flies',
            'Panfish Flies', 'Carp Flies', 'Bonefish Flies', 'Permit Flies', 'Tarpon, Snook & Redfish Flies', 'Barracuda Flies']);
        assert.ok(list.every(({ attrs }) => /^\/species\/[^/]+\/$/.test(attrs.href)));
        const hatch = findTags(panel, 'a').find(tag => hasClass('rf-mega__hatch', tag.attrs));
        assert.equal(hatch.attrs.href, 'https://reelflies.ca/#hatch');
        assert.ok('data-rf-mega-close' in hatch.attrs);
        assert.match(textOf(outerHtml(panel, 'a', attrs => hasClass('rf-mega__hatch', attrs))), /^On the water in \w+ .+ The hatch chart$/);
    });

    it('splits the species into Freshwater and Saltwater by rf_species_salt_ids', async () => {
        const panel = speciesPanel(await tree4({ theme_settings: { rf_species_salt_ids: SALT } }));
        const groups = elementsHtml(panel, 'div', attrs => hasClass('rf-mega__sp', attrs));
        assert.deepEqual(groups.map(group => textOf(outerHtml(group, 'p'))), ['Freshwater', 'Saltwater']);
        assert.deepEqual(groups.map(group => links(outerHtml(group, 'ul')).map(({ text }) => text)), [
            ['Trout Flies', 'Steelhead Flies', 'Atlantic Salmon Flies', 'Bass Flies', 'Pike & Muskie Flies', 'Panfish Flies', 'Carp Flies'],
            ['Bonefish Flies', 'Permit Flies', 'Tarpon, Snook & Redfish Flies', 'Barracuda Flies'],
        ]);
    });

    it('has no Species item when rf_menu_species_root_id is empty, or names a category the tree doesn\'t hold', async () => {
        const roots = ['', '999999'];
        const rendered = await Promise.all(roots.map(root => tree4({ theme_settings: { rf_menu_species_root_id: root } })));
        rendered.forEach((html, index) => {
            assert.equal(megaItems(html).length, 1, `root "${roots[index]}"`);
            assert.equal(speciesPanel(html), null);
            assert.deepEqual(menuProblems(html), []);
        });
    });

    it('puts the "Also" row under the Flies panel: rf_menu_also_ids, then the hook size chart; with neither, no row', async () => {
        assert.deepEqual(pairs(alsoRow(await tree4())), [['/fly-hook-size-chart/', 'Hook size chart']], 'the base settings: no also ids, the chart\'s URL');
        const both = alsoRow(await tree4({ theme_settings: { rf_menu_also_ids: '540,560' } }));
        assert.equal(textOf(outerHtml(both, 'p')), 'Also');
        assert.deepEqual(pairs(both), [['/fly-selections-assortments/', 'Fly Selections & Assortments'], ['/clearance/', 'Clearance'], ['/fly-hook-size-chart/', 'Hook size chart']]);
        assert.equal(alsoRow(await tree4({ theme_settings: { rf_hook_chart_url: '' } })), null);
    });

    it('follows Flies and Species with the plain links: rf_menu_link_ids in order, or else the top-level categories the menus don\'t cover minus rf_menu_exclude_ids, then Hatch chart and Wholesale', async () => {
        assert.deepEqual(asPairs(navLinks(await tree4())), [
            ['/fly-selections-assortments/', 'Fly Selections & Assortments'], ['/fly-gear/', 'Fly Gear'], ['/clearance/', 'Clearance'], ['#hatch', 'Hatch chart'], ['/contact-us/', 'Wholesale'],
        ], 'the categories data\'s order, without the Fly Types and the Species root');
        assert.deepEqual(navLinks(await tree4({ theme_settings: { rf_menu_exclude_ids: '560' } })).map(({ text }) => text), ['Fly Selections & Assortments', 'Fly Gear', 'Hatch chart', 'Wholesale']);
        assert.deepEqual(navLinks(await tree4({ theme_settings: { rf_menu_link_ids: '550,540', rf_menu_exclude_ids: '550' } })).map(({ text }) => text), ['Fly Gear', 'Fly Selections & Assortments', 'Hatch chart', 'Wholesale'], 'named links in their order; the exclusions are the fallback\'s');
        assert.ok(navLinks(await tree4()).every(({ attrs }) => hasClass('rf-nav__btn', attrs)));
    });

    it('reads ids with spaces and stray commas', async () => {
        const html = await tree4({ theme_settings: { rf_menu_type_ids: ' 503, 501,,502 ,', rf_menu_species_root_id: ' 520 ' } });
        assert.deepEqual(names(railFromHtml(flies(html))), ['Streamers', 'Dry Flies', 'Nymphs']);
        assert.ok(speciesPanel(html));
        assert.deepEqual(menuProblems(html), []);
    });

    it('renders nothing for an id the tree doesn\'t hold (the release guard refuses one before a push)', async () => {
        const html = await tree4({ theme_settings: { rf_menu_type_ids: '501,999999,502' } });
        assert.deepEqual(names(railFromHtml(flies(html))), ['Dry Flies', 'Nymphs']);
        assert.deepEqual(panesFromHtml(flies(html)).map(({ id }) => id), ['501', '502']);
    });

    it('finds a Fly Type at any of the tree\'s first three levels, and leaves a pane without a list when it has no children', async () => {
        // 609 Trout Flies sits under the Species root; 640 Elk Hair Caddis under Dry Flies > Caddis.
        const panel = flies(await tree4({ theme_settings: { rf_menu_type_ids: '609,640' } }));
        assert.deepEqual(names(railFromHtml(panel)), ['Trout Flies', 'Elk Hair Caddis']);
        const [trout, caddis] = panesFromHtml(panel);
        assert.deepEqual(trout.kids.map(({ text }) => text), ['Dry Flies', 'Nymphs']);
        assert.deepEqual(caddis.kids, []);
        assert.equal(findTags(caddis.source, 'ul').length, 0);
    });

    it('prints no Web Page or gift certificate link: the header reads the categories and the Menu settings only', async () => {
        const found = hrefs(await tree4());
        for (const { url } of PAGES) assert.ok(!found.includes(url), url);
        assert.ok(!found.includes('/giftcertificates.php'));
    });

    it('has no Flies or Species item and no stock fallback with both ids empty: the nav lists every top-level category as a plain link', async () => {
        const html = await tree4({ theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } });
        assert.equal(megaItems(html).length, 0);
        assert.deepEqual(navLinks(html).map(({ text }) => text), ['Fly Selections & Assortments', 'Streamers', 'Flies by Species', 'Dry Flies', 'Nymphs', 'Fly Gear',
            'Saltwater Flies', 'Eggs & Worms', 'Warmwater Flies', 'Clearance', 'Hatch chart', 'Wholesale']);
        assert.equal(findTags(html).filter(tag => hasClass('navPages', tag.attrs)).length, 0, 'the stock navigation never renders');
        assert.deepEqual(menuProblems(html), [], 'the assertion passes a header with no mega menus');
    });

    it('renders no mega menu on 1895766\'s variation today, whose ids are empty', async () => {
        assert.equal(themeConfig('ReelFlies CA').settings.rf_menu_type_ids, '');
        const html = await renderPartial(PAGE, { ...STORE, categories: TREE_4.categories }, { overrides: WITH_HEAD });
        assert.equal(megaItems(html).length, 0);
        assert.deepEqual(menuProblems(html), []);
    });
});

describe('the drawer on tree 4', () => {
    it('is a hidden modal dialog after the header, named Menu, with a labelled close button and one named nav', async () => {
        const html = await tree4();
        const tag = findTags(html, 'div').find(entry => 'data-rf-drawer' in entry.attrs);
        assert.equal(tag.attrs.id, 'rf-drawer', 'what the Menu button controls');
        assert.ok('hidden' in tag.attrs);
        assert.ok(html.indexOf('</header>') < html.indexOf('id="rf-drawer"'));
        const drawer = drawerSource(html);
        const [dialog] = findTags(drawer).filter(entry => entry.attrs.role === 'dialog');
        assert.equal(dialog.attrs['aria-modal'], 'true');
        assert.equal(dialog.attrs['aria-labelledby'], 'rf-drawer-title');
        assert.equal(textOf(outerHtml(drawer, 'p', attrs => attrs.id === 'rf-drawer-title')), 'Menu');
        const [close] = findTags(drawer, 'button');
        assert.ok('data-rf-drawer-close' in close.attrs);
        assert.equal(close.attrs.type, 'button');
        assert.equal(textOf(outerHtml(drawer, 'button')), 'Close menu');
        const navs = findTags(drawer, 'nav');
        assert.equal(navs.length, 1);
        assert.equal(navs[0].attrs['aria-label'], 'Menu');
        assert.deepEqual(unbalancedTags(drawer), []);
    });

    it('opens with the Flies group: each Fly Type a disclosure of its subcategories ending in an "All …" link, in the rail\'s order', async () => {
        const [group] = drawerGroups(await tree4());
        assert.ok('open' in findTags(group, 'details')[0].attrs, 'open at load');
        assert.equal(summary(group), 'Flies');
        const subs = elementsHtml(group, 'details', attrs => hasClass('rf-drawer__sub', attrs));
        assert.deepEqual(subs.map(summary), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies']);
        const dry = pairs(subs[0]);
        assert.equal(dry.length, 9);
        assert.deepEqual(dry[0], ['/dry-flies/mayfly-dry-flies/', 'Mayfly Dry Flies']);
        assert.deepEqual(dry[8], ['/dry-flies/', 'All Dry Flies']);
        assert.ok(hasClass('rf-drawer__all', links(subs[0])[8].attrs));
    });

    it('makes a Fly Type with no subcategories a plain row', async () => {
        const [group] = drawerGroups(await tree4({ theme_settings: { rf_menu_type_ids: '501,560' } }));
        assert.equal(elementsHtml(group, 'details', attrs => hasClass('rf-drawer__sub', attrs)).length, 1);
        const rows = links(group).filter(({ attrs }) => hasClass('rf-drawer__row', attrs));
        assert.deepEqual(rows.map(({ attrs, text }) => [attrs.href, text]), [['/clearance/', 'Clearance']]);
    });

    it('lists the species in a closed Species group, Freshwater then Saltwater, ending in All Flies by Species', async () => {
        const [, group] = drawerGroups(await tree4({ theme_settings: { rf_species_salt_ids: SALT } }));
        assert.ok(!('open' in findTags(group, 'details')[0].attrs));
        assert.equal(summary(group), 'Species');
        const found = pairs(group);
        assert.deepEqual(found.map(([, name]) => name), ['Trout Flies', 'Steelhead Flies', 'Atlantic Salmon Flies', 'Bass Flies', 'Pike & Muskie Flies', 'Panfish Flies', 'Carp Flies',
            'Bonefish Flies', 'Permit Flies', 'Tarpon, Snook & Redfish Flies', 'Barracuda Flies', 'All Flies by Species']);
        assert.deepEqual(found[11], ['/species/', 'All Flies by Species']);
    });

    it('ends with the plain links, Hatch chart, Hook size chart, Account and Wholesale, then the phone number', async () => {
        const html = await tree4();
        assert.deepEqual(pairs(drawerLinks(html)), [
            ['/fly-selections-assortments/', 'Fly Selections & Assortments'], ['/fly-gear/', 'Fly Gear'], ['/clearance/', 'Clearance'],
            ['#hatch', 'Hatch chart'], ['/fly-hook-size-chart/', 'Hook size chart'], ['/login.php', 'Account'], ['/contact-us/', 'Wholesale'],
        ]);
        assert.ok('data-rf-drawer-close' in links(drawerLinks(html)).find(({ text }) => text === 'Hatch chart').attrs, 'an in-page link closes the drawer');
        const call = outerHtml(drawerSource(html), 'p', attrs => hasClass('rf-drawer__call', attrs));
        assert.equal(textOf(call), 'Questions? Call 1 866 250 4071');
        assert.deepEqual(pairs(call), [['tel:+1-866-250-4071', '1 866 250 4071']], 'dialled from rf_store_phone');
    });

    it('sends Account to the account page when a customer is signed in, drops the chart and Wholesale with their settings empty, and dials the store number without rf_store_phone', async () => {
        assert.ok(pairs(drawerLinks(await tree4({ customer: { id: 1, name: 'A shopper' } }))).some(([href, name]) => href === '/account.php' && name === 'Account'));
        const bare = await tree4({ theme_settings: { rf_hook_chart_url: '', rf_trade_url: '', rf_store_phone: '' }, settings: { phone_number: '1 800 555 0100' } });
        assert.deepEqual(pairs(drawerLinks(bare)).map(([, name]) => name), ['Fly Selections & Assortments', 'Fly Gear', 'Clearance', 'Hatch chart', 'Account']);
        assert.deepEqual(pairs(outerHtml(drawerSource(bare), 'p', attrs => hasClass('rf-drawer__call', attrs))), [['tel:1 800 555 0100', '1 800 555 0100']]);
        const silent = await tree4({ settings: { phone_number: '' } });
        assert.equal(outerHtml(drawerSource(silent), 'p', attrs => hasClass('rf-drawer__call', attrs)), null, 'no call line without a store phone number');
    });

    it('lists every category the mega menus do, so a phone shopper reaches each one', async () => {
        const html = await tree4({ theme_settings: { rf_species_salt_ids: SALT, rf_menu_also_ids: '540' } });
        const inDrawer = new Set(hrefs(drawerSource(html)));
        const categories = links(menuSource(html)).filter(({ attrs }) => 'data-rf-cat' in attrs).map(({ attrs }) => attrs.href);
        assert.equal(categories.length, 6 + 29 + 11, 'the six Fly Types, their 29 subcategories and the 11 species');
        assert.deepEqual(categories.filter(href => !inDrawer.has(href)), []);
    });
});

describe('the menus on tree 1, with the channel-1 variation', () => {
    it('finds the Fly Types one level under Flies, in the variation\'s order, with no Species item, and passes the rf-menu assertion', async () => {
        const html = await tree1();
        assert.deepEqual(menuProblems(html), []);
        const rail = railFromHtml(flies(html));
        assert.deepEqual(rail.map(({ id }) => id), ['298', '251', '255', '272', '438']);
        assert.deepEqual(names(rail), ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies']);
        assert.equal(speciesPanel(html), null);
        assert.equal(megaItems(html).length, 1);
    });

    it('links the channel\'s plain links (399, 434 and 400) in that order, and its "Also" row (399, 434 and 382) with the hook size chart', async () => {
        const html = await tree1();
        assert.deepEqual(asPairs(navLinks(html)), [
            ['/fly-selections-fly-boxes/', 'Fly Selections & Fly Boxes'], ['/flies/streamers-buggers/reelflies-signature-flies/', 'ReelFlies Signature Flies'], ['/fly-gear/', 'Fly Gear'],
            ['#hatch', 'Hatch chart'], ['/contact-us/', 'Wholesale'],
        ], '434 sits at the tree\'s third level, under Flies > Streamers & Buggers');
        assert.deepEqual(pairs(alsoRow(html)).map(([, name]) => name), ['Fly Selections & Fly Boxes', 'ReelFlies Signature Flies', '**Clearance Flies**', 'Hook size chart']);
    });

    it('links every Fly Type and each of its subcategories', async () => {
        const found = hrefs(menuSource(await tree1()));
        const expected = typesOf(TREE_1, themeConfig(CHANNEL_1).settings).flatMap(type => [type.url, ...type.children.map(({ url }) => url)]);
        assert.ok(expected.length > 50);
        assert.deepEqual(expected.filter(url => !found.includes(url)), []);
        assert.ok(!found.includes('/flies/'), 'Flies itself is in no menu: its children are the Fly Types');
    });
});

// Build pipeline decision 5 (tagged 28): ReelFlies US gets tree 2's menu ids, Flies (447)'s
// children read through stencil start -c 1855224, so Shaun's .com preview shows the mega menu
// with .com's real categories. .com isn't a release target, so the release guard never reads them.
describe('the menus on tree 2, with ReelFlies US (decision 5: the .com preview)', () => {
    const FLIES = '447';
    const fliesChildren = TREE_2.categories.find(category => category.id === FLIES).children.map(category => category.id);

    it('names every child of Flies (447) in ReelFlies US, and no Species root (tree 2 has none)', () => {
        const { settings } = themeConfig(US);
        assert.equal(typeof settings.rf_menu_type_ids, 'string', 'paper\'s trim reads anything but a string as empty');
        const ids = settings.rf_menu_type_ids.split(',');
        assert.deepEqual([...ids].sort(), [...fliesChildren].sort());
        assert.equal(settings.rf_menu_species_root_id, '');
    });

    it('shows Flies (447)\'s children in the variation\'s order, with Fly Selections & Assortments the one plain link: Flies holds the Fly Types', async () => {
        const html = await tree2();
        assert.deepEqual(menuProblems(html), []);
        assert.deepEqual(names(railFromHtml(flies(html))), ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies']);
        assert.deepEqual(asPairs(navLinks(html)), [['/fly-selections-assortments/', 'Fly Selections & Assortments'], ['#hatch', 'Hatch chart'], ['/contact-us/', 'Wholesale']]);
        assert.equal(speciesPanel(html), null);
    });

    it('links every Fly Type and each of its subcategories', async () => {
        const found = hrefs(menuSource(await tree2()));
        const expected = typesOf(TREE_2, themeConfig(US).settings).flatMap(type => [type.url, ...type.children.map(({ url }) => url)]);
        assert.ok(expected.length > 50);
        assert.deepEqual(expected.filter(url => !found.includes(url)), []);
    });
});

describe('the menu ids in config.json', () => {
    it('are strings in the base settings and every variation: paper\'s trim reads a number as empty', () => {
        const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
        for (const [name, settings] of [['settings', config.settings], ...config.variations.map(variation => [variation.name, variation.settings])]) {
            for (const key of ['rf_menu_type_ids', 'rf_menu_species_root_id', 'rf_menu_exclude_ids', 'rf_menu_link_ids', 'rf_menu_also_ids', 'rf_species_salt_ids']) {
                if (key in settings) assert.equal(typeof settings[key], 'string', `${name} ${key}`);
            }
        }
    });
});

describe('the partials stencil bundle has to find', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);
    const includes = source => [...source.matchAll(/\{\{~?#?>\s*([^\s}]+)/g)].map(match => match[1]);
    const files = ['header.html', 'cats.html', 'cat-view.html', 'species.html', 'species-view.html', 'species-list.html', 'nav-links.html', 'nav-more.html', 'drawer.html', 'hatch-card.html']
        .map(file => `templates/components/reelflies/${file}`);

    for (const file of files) {
        it(`finds every include in ${file}`, () => {
            const source = fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
            assert.deepEqual(bundled(source), includes(source));
        });
    }
});
