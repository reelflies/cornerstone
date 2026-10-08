// The ReelFlies header (ticket 27; spec modules 2 and 4): components/common/header.html, which
// includes components/reelflies/header.html in place of the stock <header>, rendered from fixture
// store data the way stencil start renders it (W0-9). The browser checks (one row at 1280, the
// 56px phone bar, Menu and Escape, focus clear of the sticky bar) are header.spec.mjs's; the
// server HTML on the storefront is the raw-HTML assertions rf-header, max-one-h1 and
// strip-region.
//
//   node --test scripts/qa/render/partials/header.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies
import { findTags } from '../../raw-html/html.mjs';
import { elementSource, headerRowSource } from '../../raw-html/assertions/rf-header.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial, THEME_DIR } from '../render.mjs';

const LOGO = { data: 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/{:size}/a/reelflies-logo__70145.original.png', alt: '' };
const STORE = {
    urls: {
        home: 'https://reelflies.ca/',
        search: '/search.php',
        cart: '/cart.php',
        compare: '/compare',
        account: { index: '/account.php', wishlists: { all: '/wishlist.php' } },
        auth: { login: '/login.php', logout: '/login.php?action=logout', create_account: '/login.php?action=create_account' },
        gift_certificate: { purchase: '/giftcertificates.php' },
    },
    settings: {
        store_logo: { image: LOGO, title: 'ReelFlies.ca' },
        gift_certificates_enabled: true,
        account_creation_enabled: true,
    },
    categories: [
        {
            id: 298,
            name: 'Dry Flies',
            url: '/dry-flies/',
            children: [{
                id: 301, name: 'Mayflies', url: '/dry-flies/mayflies/', children: [],
            }],
        },
        {
            id: 251, name: 'Nymphs', url: '/nymphs/', children: [],
        },
    ],
    page_type: 'default',
};
const STRIP = '<div data-widget-id="w" data-placement-id="p" data-placement-status="ACTIVE"><div class="rf-strip" data-rf-strip><p>Free standard shipping on fly orders over $60</p></div></div>';

const render = (context = {}, options = {}) => renderPartial('components/common/header', {
    ...STORE,
    ...context,
    settings: { ...STORE.settings, ...context.settings },
}, options);
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');

describe('the header partial', () => {
    it('replaces the stock <header> with the ReelFlies one, after the skip link', async () => {
        const html = await render();
        const tags = findTags(html);
        assert.equal(tags[0].name, 'a');
        assert.equal(tags[0].attrs.class, 'skip-to-main-link', 'the skip link stays the first element (header.html:1)');
        const headers = findTags(html, 'header');
        assert.equal(headers.length, 1);
        assert.ok('data-rf-header' in headers[0].attrs);
        assert.equal(headers[0].attrs.role, 'banner');
        assert.equal(findTags(html).filter(tag => /\bmobileMenu-toggle\b/.test(tag.attrs.class || '')).length, 0, 'no stock "Toggle menu" link');
        assert.deepEqual(unbalancedTags(html), []);
    });

    for (const pageType of ['default', 'product', 'category', 'page', 'cart']) {
        it(`makes the logo a link inside a <div>, never an <h1>, on a ${pageType} page`, async () => {
            const html = await render({ page_type: pageType });
            assert.equal(findTags(html, 'h1').length, 0, 'the header holds no <h1>');
            const logo = elementSource(html, 'div', attrs => 'data-rf-logo' in attrs);
            assert.ok(logo, 'the logo is a <div data-rf-logo>');
            const [link, ...more] = findTags(logo, 'a');
            assert.equal(more.length, 0);
            assert.equal(link.attrs.href, 'https://reelflies.ca/');
            assert.ok('data-header-logo-link' in link.attrs, 'modal.js still finds it as its focus fallback');
            const [img] = findTags(logo, 'img');
            assert.equal(img.attrs.alt, 'ReelFlies home', 'the reference page\'s name for it');
            assert.equal(img.attrs.width, '78');
            assert.equal(img.attrs.height, '56');
            assert.match(img.attrs.src, /\/stencil\/250x100\//, 'the logo_size setting, as stock');
            assert.ok(img.attrs.srcset, 'the stock 1x/2x srcset (a 2x only when the file is big enough)');
        });
    }

    it('names the link with the store\'s name when the store has no logo image', async () => {
        const html = await render({ settings: { store_logo: { image: null, title: 'ReelFlies.ca' } } });
        const logo = elementSource(html, 'div', attrs => 'data-rf-logo' in attrs);
        assert.equal(findTags(logo, 'img').length, 0);
        assert.equal(text(logo), 'ReelFlies.ca');
    });

    it('makes Menu a real <button> for the stock toggle, with aria-expanded and its Menu and Close labels', async () => {
        const html = await render();
        const toggles = findTags(html).filter(tag => 'data-mobile-menu-toggle' in tag.attrs);
        assert.equal(toggles.length, 1);
        const [toggle] = toggles;
        assert.equal(toggle.name, 'button');
        assert.equal(toggle.attrs.type, 'button');
        assert.equal(toggle.attrs['data-mobile-menu-toggle'], 'menu');
        assert.equal(toggle.attrs['aria-controls'], 'menu');
        assert.equal(toggle.attrs['aria-expanded'], 'false');
        const button = elementSource(html, 'button', attrs => 'data-mobile-menu-toggle' in attrs);
        assert.equal(text(button), 'Menu Close', 'both labels, from lang strings; CSS shows the one aria-expanded says');
        assert.doesNotMatch(button, /Toggle menu/);
    });

    it('holds one row: the logo, "Shop flies", the search form, Account and Cart', async () => {
        const row = headerRowSource(await render());
        const shop = findTags(row, 'button').find(tag => 'data-rf-shop' in tag.attrs);
        assert.ok(shop, '"Shop flies" is a button');
        assert.equal(shop.attrs['aria-expanded'], 'false');
        assert.equal(shop.attrs['aria-controls'], 'menu');
        assert.equal(text(elementSource(row, 'button', attrs => 'data-rf-shop' in attrs)), 'Shop flies');
        assert.equal(findTags(row, 'form').length, 1);
        const hrefs = findTags(row, 'a').map(tag => tag.attrs.href);
        assert.deepEqual(hrefs, ['https://reelflies.ca/', '/search.php', '/login.php', '/cart.php']);
        const nav = findTags(row, 'nav');
        assert.equal(nav.length, 1);
        assert.equal(nav[0].attrs['aria-label'], 'Your account');
    });

    it('sends Account to the account page when a customer is signed in', async () => {
        const row = headerRowSource(await render({ customer: { id: 1, name: 'A shopper' } }));
        assert.ok(findTags(row, 'a').some(tag => tag.attrs.href === '/account.php'));
        assert.ok(!findTags(row, 'a').some(tag => tag.attrs.href === '/login.php'));
    });

    it('has no Saved, Compare or Gift Certificates link in the row (stock O04; UX-20)', async () => {
        const row = headerRowSource(await render({ customer: { id: 1, name: 'A shopper' } }));
        const hrefs = findTags(row, 'a').map(tag => tag.attrs.href);
        for (const href of ['/compare', '/giftcertificates.php', '/wishlist.php']) assert.ok(!hrefs.includes(href), href);
        assert.doesNotMatch(text(row), /Compare|Gift Certificate|Saved|Wish List/i);
    });

    it('labels Account and Cart in their links, and gives the search link a name', async () => {
        const row = headerRowSource(await render());
        const link = href => elementSource(row, 'a', attrs => attrs.href === href);
        assert.equal(text(link('/login.php')), 'Account');
        assert.equal(text(link('/cart.php')), 'Cart');
        assert.equal(text(link('/search.php')), 'Search');
    });

    it('keeps the stock count pill, which cart-preview.js fills', async () => {
        const row = headerRowSource(await render());
        const pills = findTags(row, 'span').filter(tag => /\bcountPill\b/.test(tag.attrs.class || ''));
        assert.equal(pills.length, 1);
        assert.match(pills[0].attrs.class, /\bcart-quantity\b/);
    });

    it('puts the rise ring on the count with rf_rise on, and no ring markup with it off', async () => {
        const on = await render({ theme_settings: { rf_rise: true } });
        const rings = findTags(on).filter(tag => 'data-rf-rise' in tag.attrs);
        assert.equal(rings.length, 1);
        assert.equal(rings[0].attrs['aria-hidden'], 'true');
        const off = await render({ theme_settings: { rf_rise: false } });
        assert.equal(findTags(off).filter(tag => 'data-rf-rise' in tag.attrs).length, 0);
        assert.ok(findTags(off, 'span').some(tag => /\bcart-quantity\b/.test(tag.attrs.class || '')), 'the stock count stays');
    });

    it('keeps #menu, with the stock navigation-menu, for the phone drawer and the desktop panel', async () => {
        const html = await render();
        const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);
        const menu = findTags(header, 'div').find(tag => tag.attrs.id === 'menu');
        assert.ok(menu);
        assert.ok('data-menu' in menu.attrs, 'menu.js binds it');
        assert.ok(findTags(header, 'a').some(tag => tag.attrs.href === '/dry-flies/'), 'the stock category links');
        assert.match(header, /data-content-region="header_navigation_bottom--global"/);
    });

    it('puts header_bottom--global after </header>, inside a region landmark named from a lang string', async () => {
        const html = await render({}, { regions: { 'header_bottom--global': STRIP } });
        const header = elementSource(html, 'header', attrs => 'data-rf-header' in attrs);
        assert.doesNotMatch(header, /header_bottom--global/);
        const wrapper = elementSource(html, 'div', attrs => 'data-rf-strip-region' in attrs);
        assert.ok(wrapper);
        const [open] = findTags(wrapper, 'div');
        assert.equal(open.attrs.role, 'region');
        assert.equal(open.attrs['aria-label'], 'Shipping and prices');
        assert.match(wrapper, /data-content-region="header_bottom--global"/);
        assert.match(wrapper, /data-rf-strip/);
        assert.ok(html.indexOf('</header>') < html.indexOf('data-rf-strip-region'));
        assert.match(html, /data-content-region="header_bottom"/, 'the page\'s own header_bottom region stays');
    });
});

describe('the search form (build pipeline 6.9)', () => {
    const form = (name, context = {}) => renderPartial('components/reelflies/search-form', { ...STORE, ...context, name });

    it('is a GET to the search page with name="search_query", and a label', async () => {
        const html = await form('header');
        const [tag] = findTags(html, 'form');
        assert.equal(tag.attrs.action, '/search.php');
        assert.equal(tag.attrs.method, 'get');
        assert.equal(tag.attrs.role, 'search');
        const [input] = findTags(html, 'input');
        assert.equal(input.attrs.name, 'search_query');
        assert.equal(input.attrs.type, 'search');
        const [label] = findTags(html, 'label');
        assert.equal(label.attrs.for, input.attrs.id);
        assert.match(text(html), /Search flies/);
        assert.equal(findTags(html, 'button')[0].attrs.type, 'submit');
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('gives each form its own ids, so the header\'s and ticket 30\'s phone row can share a page', async () => {
        const ids = await Promise.all(['header', 'phone'].map(async name => findTags(await form(name), 'input')[0].attrs.id));
        assert.deepEqual(ids, ['rf-search-header', 'rf-search-phone']);
    });

    it('carries no stock quick-search hooks, so stock quick-search.js leaves it to ticket 30', async () => {
        const tags = findTags(await form('header'));
        for (const attr of ['data-search-quick', 'data-quick-search-form']) assert.ok(tags.every(tag => !(attr in tag.attrs)), attr);
    });
});

describe('the partials stencil bundle has to find', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);
    const includes = source => [...source.matchAll(/\{\{~?#?>\s*([^\s}]+)/g)].map(match => match[1]);

    for (const file of ['templates/components/common/header.html', 'templates/components/reelflies/header.html', 'templates/components/reelflies/search-form.html']) {
        it(`finds every include in ${file}`, () => {
            const source = read(file);
            assert.deepEqual(bundled(source), includes(source));
        });
    }
});
