// The grouped menu and the phone drawer's markup (ticket 28; spec modules 3 and 4; O05-O08,
// SEO-3, BUILD-2, UX-2): components/common/header.html rendered from fixture store data the way
// stencil start renders it (W0-9), on tree 4 as refactor 13 plans it, on tree 1 with the
// channel-1 variation's ids, and on .com's tree 2 with ReelFlies US's (decision 5).
// scripts/qa/menu-urls.mjs states the rules; these tests hold the template to them. The browser checks (the panel at 1280, the drawer at 375) are
// menu.spec.mjs's, and the raw HTML on the storefront is the rf-menu assertion's.
//
//   node --test scripts/qa/render/partials/menu.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies
import { findTags } from '../../raw-html/html.mjs';
import { elementSource } from '../../raw-html/assertions/rf-header.mjs';
import {
    links, menuProblems, menuSource, railFromHtml,
} from '../../raw-html/assertions/rf-menu.mjs';
import { expectedUrls, menuGroups, railNames } from '../../menu-urls.mjs';
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

const PAGES = [
    { name: 'About Us', url: 'https://reelflies.ca/about-us/' },
    { name: 'Shipping & Returns', url: 'https://reelflies.ca/shipping-returns/' },
    { name: 'Contact Us', url: 'https://reelflies.ca/contact-us/' },
    { name: 'Blog', url: 'https://reelflies.ca/blog/' },
    { name: 'Privacy Policy', url: 'https://reelflies.ca/privacy-policy/' },
    { name: 'Gift Certificates', url: '/giftcertificates.php' },
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
        phone_number: '1 866 250 4071',
        blog_enabled: true,
        gift_certificates_enabled: true,
        account_creation_enabled: true,
    },
    pages: PAGES,
    page_type: 'default',
};

const render = (fixture, context = {}, options = {}) => renderPartial('components/common/header', {
    ...STORE,
    ...fixture,
    ...context,
    settings: { ...STORE.settings, ...context.settings },
    theme_settings: { ...fixture.theme_settings, ...context.theme_settings },
}, options);
const tree4 = (context, options) => render(TREE_4, context, options);
const tree1 = (context, options) => render(TREE_1, context, { variation: CHANNEL_1, ...options });
const tree2 = (context, options) => render(TREE_2, context, { variation: US, ...options });
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
// Handlebars writes = as &#x3D; in an attribute, as stock's own {{urls.auth.logout}}; a browser reads =.
const decode = value => String(value).replace(/&#x3D;/g, '=').replace(/&amp;/g, '&').replace(/&#x27;/g, '\'');
const hrefs = html => links(html).map(({ attrs }) => decode(attrs.href));
const settingsOf = (fixture, variation) => ({ ...themeConfig(variation).settings, ...fixture.theme_settings });

const rail = railFromHtml;
// The pane a row's button opens: its heading link and its links.
function pane(html, name) {
    const nav = menuSource(html);
    const button = findTags(nav, 'button').find(tag => 'data-rf-menu-toggle' in tag.attrs
        && text(elementSource(nav, 'button', attrs => attrs['aria-controls'] === tag.attrs['aria-controls'])).endsWith(name));
    if (!button) return null;
    const source = elementSource(nav, 'div', attrs => attrs.id === button.attrs['aria-controls']);
    const heading = elementSource(source, 'h2');
    return {
        button, source, heading: links(heading), kids: links(elementSource(source, 'ul')),
    };
}

describe('the grouped menu on tree 4', () => {
    it('renders one <nav> in #menu inside the header, instead of the stock navigation, and passes the rf-menu assertion', async () => {
        const html = await tree4();
        assert.equal(findTags(html, 'nav').filter(tag => 'data-rf-menu' in tag.attrs).length, 1);
        assert.deepEqual(menuProblems(html), []);
        const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);
        const container = elementSource(header, 'div', attrs => attrs.id === 'menu');
        assert.ok(menuSource(container), 'the nav is the drawer\'s and the panel\'s content (#menu)');
        assert.ok(!('data-menu' in findTags(container, 'div')[0].attrs), 'no data-menu: stock menu.js binds nothing to it');
        assert.equal(findTags(container).filter(tag => /(^|\s)navPages(\s|$)/.test(tag.attrs.class || '')).length, 0, 'no stock navigation');
        assert.equal(findTags(container).filter(tag => 'data-collapsible' in tag.attrs).length, 0, 'nothing for stock collapsible.js');
        assert.equal(findTags(container).filter(tag => 'data-quick-search-form' in tag.attrs).length, 0, 'no stock quick-search form');
        assert.equal(findTags(menuSource(html), 'nav')[0].attrs['aria-label'], 'Shop flies');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('shows the six Fly Types in rf_menu_type_ids order, a divider and Flies by Species, then More from ReelFlies', async () => {
        const groups = rail(await tree4());
        assert.deepEqual(groups, [
            {
                label: 'Fly types', divider: false, rows: ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies'],
            },
            { label: null, divider: true, rows: ['Flies by Species'] },
            { label: 'More from ReelFlies', divider: false, rows: ['Fly Selections & Assortments', 'Fly Gear', 'Clearance'] },
        ]);
        assert.deepEqual(groups.flatMap(group => group.rows), railNames(menuGroups(TREE_4.categories, settingsOf(TREE_4, 'ReelFlies CA'))));
    });

    it('links every Fly Type, subcategory and Species page with a real <a href> (the curl criterion)', async () => {
        const nav = menuSource(await tree4());
        const found = hrefs(nav);
        const expected = expectedUrls(TREE_4.categories, settingsOf(TREE_4, 'ReelFlies CA'));
        assert.deepEqual(expected.filter(url => !found.includes(url)), []);
        assert.ok(!found.includes('/dry-flies/caddis-dry-flies/elk-hair-caddis/'), 'no third level');
        assert.ok(!found.some(url => /^\/species\/[^/]+\/[^/]+\//.test(url)), 'no Species × Fly Type pages (decision 3: the 11 names)');
    });

    it('makes each pane\'s heading the link to its category, with no "All …" or "Shop all" line', async () => {
        const html = await tree4();
        const dry = pane(html, 'Dry Flies');
        assert.deepEqual(dry.heading.map(({ attrs, text: name }) => [attrs.href, name]), [['/dry-flies/', 'Dry Flies']]);
        assert.equal(dry.heading[0].attrs['data-rf-category'], '501');
        assert.deepEqual(dry.kids.map(({ text: name }) => decode(name)), ['Mayfly Dry Flies', 'Attractor Dry Flies', 'Hoppers & Terrestrials', 'Parachute Dry Flies',
            'Caddis Dry Flies', 'Stonefly Dry Flies', 'Midge Dry Flies', 'Emergers & Cripples'], 'the children in the categories data\'s order (probe 3)');
        assert.doesNotMatch(text(menuSource(html)), /\bAll (Dry|Nymphs|Streamers|Flies|Fly)\b|Shop all/i);
        assert.doesNotMatch(menuSource(html), /view_all/);
    });

    it('lists only the 11 Species names under Flies by Species', async () => {
        const species = pane(await tree4(), 'Flies by Species');
        assert.equal(species.heading[0].attrs.href, '/species/');
        assert.deepEqual(species.kids.map(({ text: name }) => decode(name)), ['Trout Flies', 'Steelhead Flies', 'Atlantic Salmon Flies', 'Bass Flies', 'Pike & Muskie Flies',
            'Panfish Flies', 'Carp Flies', 'Bonefish Flies', 'Permit Flies', 'Tarpon, Snook & Redfish Flies', 'Barracuda Flies']);
    });

    it('splits each row with children: the name is the link, and a separate button opens its pane in place', async () => {
        const nav = menuSource(await tree4());
        const rows = [...nav.matchAll(/<div class="rf-menu-row">([\s\S]*?)<\/div>/g)].map(([, row]) => row);
        assert.equal(rows.length, 6 + 1 + 2, 'every Fly Type, Flies by Species, and the two More categories with children');
        for (const row of rows) {
            const [link] = links(row);
            const [button] = findTags(row, 'button');
            assert.ok(link.attrs.href && 'data-rf-category' in link.attrs, `${link.text} is a link`);
            assert.equal(button.attrs.type, 'button');
            assert.equal(button.attrs['aria-expanded'], 'false');
            assert.match(button.attrs['aria-controls'], /^rf-menu-pane-\d+$/);
            assert.match(text(elementSource(row, 'button')), new RegExp(`^Show ${link.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), 'its name says what it opens');
            const target = findTags(nav, 'div').find(tag => tag.attrs.id === button.attrs['aria-controls']);
            assert.ok(target && 'hidden' in target.attrs, `${button.attrs['aria-controls']} is hidden until opened`);
        }
    });

    it('makes a category with no children a plain link, with no button', async () => {
        const nav = menuSource(await tree4());
        assert.match(nav, /<a class="rf-menu-name rf-menu-name--plain" href="\/clearance\/" data-rf-category="560">Clearance<\/a>/);
        assert.ok(!findTags(nav, 'button').some(tag => tag.attrs['aria-controls'] === 'rf-menu-pane-560'));
    });

    it('gives every category link data-rf-category, its id (build pipeline 6.9, for quick search)', async () => {
        const nav = menuSource(await tree4());
        const body = nav.slice(0, nav.indexOf('data-rf-menu-foot'));
        const categoryLinks = links(body);
        assert.ok(categoryLinks.length > 50);
        assert.deepEqual(categoryLinks.filter(({ attrs }) => !/^\d+$/.test(attrs['data-rf-category'] || '')).map(({ text: name }) => name), []);
    });

    it('prints no Web Page: Help pages are in the drawer footer only', async () => {
        const nav = menuSource(await tree4());
        const body = nav.slice(0, nav.indexOf('data-rf-menu-foot'));
        for (const { url } of PAGES) assert.ok(!hrefs(body).includes(url), url);
    });

    it('has no Species group when rf_menu_species_root_id is empty', async () => {
        const groups = rail(await tree4({ theme_settings: { rf_menu_species_root_id: '' } }));
        assert.ok(!groups.some(group => group.divider));
        assert.deepEqual(groups[0].rows, ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies']);
    });

    it('leaves the categories in rf_menu_exclude_ids out of More from ReelFlies', async () => {
        const groups = rail(await tree4({ theme_settings: { rf_menu_exclude_ids: '560' } }));
        assert.deepEqual(groups[2].rows, ['Fly Selections & Assortments', 'Fly Gear']);
    });

    it('reads ids with spaces and stray commas', async () => {
        const groups = rail(await tree4({ theme_settings: { rf_menu_type_ids: ' 503, 501,,502 ,', rf_menu_species_root_id: ' 520 ' } }));
        assert.deepEqual(groups[0].rows, ['Streamers', 'Dry Flies', 'Nymphs']);
        assert.deepEqual(groups[1].rows, ['Flies by Species']);
    });

    it('renders nothing for an id the tree doesn\'t hold (the release guard refuses one before a push)', async () => {
        const groups = rail(await tree4({ theme_settings: { rf_menu_type_ids: '501,999999,502' } }));
        assert.deepEqual(groups[0].rows, ['Dry Flies', 'Nymphs']);
    });
});

describe('the grouped menu on tree 1, with the channel-1 variation (Option A)', () => {
    it('groups the Fly-Type-like categories one level under Flies, in the variation\'s order, with no Species group', async () => {
        const html = await tree1();
        assert.deepEqual(menuProblems(html), []);
        assert.deepEqual(rail(html), [
            {
                label: 'Fly types', divider: false, rows: ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies'],
            },
            { label: 'More from ReelFlies', divider: false, rows: ['Flies', 'Fly Selections & Fly Boxes', 'Fly Gear'] },
        ]);
    });

    it('makes Flies a plain link, because its children are the Fly Types already in the rail', async () => {
        const nav = menuSource(await tree1());
        assert.match(nav, /<a class="rf-menu-name rf-menu-name--plain" href="\/flies\/" data-rf-category="398">Flies<\/a>/);
        assert.ok(!findTags(nav, 'button').some(tag => tag.attrs['aria-controls'] === 'rf-menu-pane-398'));
    });

    it('links every URL the rules expect', async () => {
        const found = hrefs(menuSource(await tree1()));
        const expected = expectedUrls(TREE_1.categories, settingsOf(TREE_1, CHANNEL_1));
        assert.ok(expected.length > 50);
        assert.deepEqual(expected.filter(url => !found.includes(url)), []);
    });
});

// Build pipeline decision 5 (tagged 28): ReelFlies US gets tree 2's menu ids, Flies (447)'s
// children read through stencil start -c 1855224, so Shaun's .com preview shows the grouped menu
// with .com's real categories. .com isn't a release target, so the release guard never reads them.
describe('the grouped menu on tree 2, with ReelFlies US (decision 5: the .com preview)', () => {
    const FLIES = '447';
    const fliesChildren = TREE_2.categories.find(category => category.id === FLIES).children.map(category => category.id);

    it('names every child of Flies (447) in ReelFlies US, and no Species root (tree 2 has none)', () => {
        const { settings } = themeConfig(US);
        assert.equal(typeof settings.rf_menu_type_ids, 'string', 'paper\'s trim reads anything but a string as empty');
        const ids = settings.rf_menu_type_ids.split(',');
        assert.deepEqual([...ids].sort(), [...fliesChildren].sort());
        assert.equal(settings.rf_menu_species_root_id, '');
    });

    it('groups Flies (447)\'s children in the variation\'s order, as on channel 1, then More: Flies and Fly Selections & Assortments', async () => {
        const html = await tree2();
        assert.deepEqual(menuProblems(html), []);
        assert.deepEqual(rail(html), [
            {
                label: 'Fly types', divider: false, rows: ['Dry Flies', 'Nymphs & Sub Surface Flies', 'Streamers & Buggers', 'Saltwater, Warmwater & Salmon', 'Realistic Trout Flies'],
            },
            { label: 'More from ReelFlies', divider: false, rows: ['Flies', 'Fly Selections & Assortments'] },
        ]);
    });

    it('links every URL the rules expect', async () => {
        const found = hrefs(menuSource(await tree2()));
        const expected = expectedUrls(TREE_2.categories, settingsOf(TREE_2, US));
        assert.ok(expected.length > 50);
        assert.deepEqual(expected.filter(url => !found.includes(url)), []);
    });
});

describe('the menu ids in config.json', () => {
    it('are strings in the base settings and every variation: paper\'s trim reads a number as empty', () => {
        const config = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'config.json'), 'utf8'));
        for (const [name, settings] of [['settings', config.settings], ...config.variations.map(variation => [variation.name, variation.settings])]) {
            for (const key of ['rf_menu_type_ids', 'rf_menu_species_root_id', 'rf_menu_exclude_ids']) {
                if (key in settings) assert.equal(typeof settings[key], 'string', `${name} ${key}`);
            }
        }
    });
});

describe('the fallback', () => {
    it('renders the stock navigation with both ids empty, as before ticket 28', async () => {
        const html = await tree4({ theme_settings: { rf_menu_type_ids: '', rf_menu_species_root_id: '' } });
        assert.equal(menuSource(html), null);
        const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);
        const container = elementSource(header, 'div', attrs => attrs.id === 'menu');
        assert.ok('data-menu' in findTags(container, 'div')[0].attrs, 'stock menu.js binds the stock navigation');
        assert.ok(findTags(container, 'nav').some(tag => tag.attrs.class === 'navPages'));
        assert.ok(hrefs(container).includes('/dry-flies/'));
        assert.deepEqual(menuProblems(html), [], 'the assertion passes the fallback');
    });

    it('renders the stock navigation on 1895766\'s variation today, whose ids are empty', async () => {
        assert.equal(themeConfig('ReelFlies CA').settings.rf_menu_type_ids, '');
        const html = await renderPartial('components/common/header', { ...STORE, categories: TREE_4.categories });
        assert.equal(menuSource(html), null);
    });

    it('groups the menu with only the Species id set, with no Fly types group', async () => {
        const groups = rail(await tree4({ theme_settings: { rf_menu_type_ids: '' } }));
        assert.deepEqual(groups.map(group => group.label), [null, 'More from ReelFlies']);
        assert.deepEqual(groups[0].rows, ['Flies by Species']);
    });
});

describe('the drawer footer (O05, UX-19, SEO-15)', () => {
    const foot = async (context = {}) => {
        const nav = menuSource(await tree4(context));
        return elementSource(nav, 'div', attrs => 'data-rf-menu-foot' in attrs);
    };

    it('lists Account, Shipping & Returns, Contact us, Hook size chart, Fly fishing articles and the phone number', async () => {
        const html = await foot();
        assert.deepEqual(links(html).map(({ attrs, text: name }) => [decode(attrs.href), decode(name)]), [
            ['/login.php', 'Account'],
            ['https://reelflies.ca/shipping-returns/', 'Shipping & Returns'],
            ['https://reelflies.ca/contact-us/', 'Contact us'],
            ['/fly-hook-size-chart/', 'Hook size chart'],
            ['/blog/', 'Fly fishing articles'],
            ['tel:+18662504071', '1 866 250 4071'],
        ]);
        assert.match(text(html), /Call 1 866 250 4071$/, '"Call" as text, with the number a tel: link beside it');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('sends Account to the account page and adds Sign out when a customer is signed in', async () => {
        const html = await foot({ customer: { id: 1, name: 'A shopper' } });
        const found = links(html).map(({ attrs, text: name }) => [decode(attrs.href), name]);
        assert.deepEqual(found[0], ['/account.php', 'Account']);
        assert.deepEqual(found[found.length - 1], ['/login.php?action=logout', 'Sign out']);
    });

    it('leaves out a Help page the channel doesn\'t have, and the articles when the blog is off', async () => {
        const html = await foot({ pages: [], settings: { blog_enabled: false } });
        assert.deepEqual(links(html).map(({ text: name }) => name), ['Account', 'Hook size chart', '1 866 250 4071']);
    });
});

describe('the partials stencil bundle has to find', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);
    const includes = source => [...source.matchAll(/\{\{~?#?>\s*([^\s}]+)/g)].map(match => match[1]);
    const files = ['menu.html', 'menu-item.html', 'menu-in-rail.html', 'menu-species.html', 'drawer-footer.html']
        .map(file => `templates/components/reelflies/${file}`);

    for (const file of files) {
        it(`finds every include in ${file}`, () => {
            const source = fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
            assert.deepEqual(bundled(source), includes(source));
        });
    }
});
