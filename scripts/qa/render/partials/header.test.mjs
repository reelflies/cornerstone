// The ReelFlies header (ticket 27; spec modules 2 and 4; redrawn for Streamside Stone, DESIGN.md
// "Navigation"): components/common/header.html, which includes components/reelflies/header.html
// (the icon sheet, the utility strip, the header, the mega-menu scrim, the drawer and the live
// region) in place of the stock <header>, rendered from fixture store data the way stencil start
// renders it (W0-9), after components/reelflies/head.html, which sets the page variables the
// menus read. The menus and the drawer are menu.test.mjs's; the server HTML on the storefront is
// the raw-HTML assertions rf-header, max-one-h1 and strip-region.
//
// Retired with the redesign: the rf_rise ring (the count's bump is order-line.js's), the stock
// count pill (the Box count, data-rf-count, is the cart's), "Shop flies", Sign out in the row, the
// stock navigation in #menu while the menu ids were empty, and the header_bottom--global region
// (the strip is strip.html now, above the header).
//
//   node --test scripts/qa/render/partials/header.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies
import { findTags, outerHtml, textOf } from '../../raw-html/html.mjs';
import { headerProblems, headerSource } from '../../raw-html/assertions/rf-header.mjs';
import { links, menuSource } from '../../raw-html/assertions/rf-menu.mjs';
import { stripRegionProblems } from '../../raw-html/assertions/strip-region.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial, THEME_DIR } from '../render.mjs';

// The store logo as the store gives it: the CDN URL with the {:size} placeholder and its size.
const LOGO = {
    data: 'https://cdn11.bigcommerce.com/s-fixture/images/stencil/{:size}/a/reelflies-logo__70145.original.png', alt: '', width: 133, height: 95,
};
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
        store_name: 'ReelFlies',
        phone_number: '1 866 250 4071',
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
// head.html sets the page variables the menus read (rf_species_root, rf_counts, …) before the
// header renders, as layout/base does; the header alone would render without them.
const PAGE = 'rf-test/header-page';
const WITH_HEAD = { [PAGE]: '{{> components/reelflies/head}}{{> components/common/header}}' };

const render = (context = {}, options = {}) => renderPartial(PAGE, {
    ...STORE,
    ...context,
    settings: { ...STORE.settings, ...context.settings },
}, { overrides: WITH_HEAD, ...options });
const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
const hasClass = (name, attrs) => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const barSource = html => outerHtml(headerSource(html), 'div', attrs => hasClass('rf-head__bar', attrs));
const brandSource = html => outerHtml(headerSource(html), 'a', attrs => hasClass('rf-brand', attrs));
// The bar's own links: the logo, Account and Box, outside the nav row.
const barLinks = html => {
    const bar = barSource(html);
    return links(bar.replace(menuSource(bar), ''));
};

describe('the header partial', () => {
    it('replaces the stock <header> with the ReelFlies one after the skip link, with the icon sheet and the strip above it, and passes the rf-header and strip-region assertions', async () => {
        const html = await render();
        const [first] = findTags(html, 'a');
        assert.equal(first.attrs.class, 'skip-to-main-link', 'the skip link stays the first link (header.html:1)');
        const headers = findTags(html, 'header');
        assert.equal(headers.length, 1);
        assert.ok('data-rf-head' in headers[0].attrs, 'menu.js finds it');
        assert.ok(findTags(html, 'svg').some(tag => hasClass('rf-icon-sheet', tag.attrs)), 'the icon sheet');
        const strip = findTags(html, 'div').find(tag => hasClass('rf-strip', tag.attrs));
        assert.equal(strip.attrs.role, 'region');
        assert.equal(strip.attrs['aria-label'], 'Shipping and contact');
        assert.ok(html.indexOf('rf-icon-sheet') < html.indexOf('class="rf-strip"') && html.indexOf('class="rf-strip"') < html.indexOf('<header'), 'sheet, strip, header');
        assert.equal(findTags(html).filter(tag => hasClass('mobileMenu-toggle', tag.attrs) || hasClass('navPages', tag.attrs)).length, 0, 'no stock "Toggle menu" link or navigation');
        assert.deepEqual(headerProblems(html), []);
        assert.deepEqual(stripRegionProblems(html), []);
        assert.deepEqual(unbalancedTags(html), []);
    });

    for (const pageType of ['default', 'product', 'category', 'page', 'cart']) {
        it(`makes the logo a link home in a plain <a>, never an <h1>, on a ${pageType} page`, async () => {
            const html = await render({ page_type: pageType });
            assert.equal(findTags(headerSource(html), 'h1').length, 0, 'the header holds no <h1>');
            const brand = brandSource(html);
            assert.ok(brand, 'the logo is <a class="rf-brand">');
            const [link, ...more] = findTags(brand, 'a');
            assert.equal(more.length, 0);
            assert.equal(link.attrs.href, 'https://reelflies.ca/');
            const [img] = findTags(brand, 'img');
            assert.equal(img.attrs.alt, 'ReelFlies.ca home', 'the store\'s name, from the logo\'s title');
            assert.equal(img.attrs.width, '133');
            assert.equal(img.attrs.height, '95', 'the logo\'s own size, so its box is reserved');
            assert.match(img.attrs.src, /\/stencil\/\d+x\d+\/a\/reelflies-logo__70145\.original\.png$/, 'the store logo at the logo_size setting');
            assert.ok(img.attrs.srcset, 'the stock 1x/2x srcset (a 2x only when the file is big enough)');
        });
    }

    it('names the link with the logo\'s title, or the store\'s name, when the store has no logo image', async () => {
        const titled = brandSource(await render({ settings: { store_logo: { image: null, title: 'ReelFlies.ca' } } }));
        assert.equal(findTags(titled, 'img').length, 0);
        assert.equal(textOf(titled), 'ReelFlies.ca');
        assert.ok(findTags(titled, 'span').some(tag => hasClass('rf-brand__text', tag.attrs)));
        const named = brandSource(await render({ settings: { store_logo: { image: null, title: '' } } }));
        assert.equal(textOf(named), 'ReelFlies', 'settings.store_name when the logo has no title');
    });

    it('makes Menu a real <button> that opens the drawer, with aria-expanded, aria-controls and its label', async () => {
        const html = await render();
        const header = headerSource(html);
        const toggles = findTags(header).filter(tag => 'data-rf-drawer-open' in tag.attrs);
        assert.equal(toggles.length, 1);
        const [toggle] = toggles;
        assert.equal(toggle.name, 'button');
        assert.equal(toggle.attrs.type, 'button');
        assert.equal(toggle.attrs['aria-expanded'], 'false');
        assert.equal(toggle.attrs['aria-controls'], 'rf-drawer');
        assert.equal(textOf(outerHtml(header, 'button', attrs => 'data-rf-drawer-open' in attrs)), 'Menu', 'the label, visually hidden beside the icon');
        const drawer = findTags(html, 'div').find(tag => tag.attrs.id === 'rf-drawer');
        assert.ok(drawer && 'data-rf-drawer' in drawer.attrs && 'hidden' in drawer.attrs, 'the drawer it opens, hidden until then');
        assert.ok(html.indexOf('</header>') < html.indexOf('id="rf-drawer"'), 'after the header');
    });

    it('holds one bar: Menu, the logo, the nav row, the search form, Account and Box, in that order', async () => {
        const html = await render();
        const bar = barSource(html);
        const order = ['data-rf-drawer-open', 'class="rf-brand"', '<nav ', '<form ', 'class="rf-head__link"', 'data-rf-box-btn'].map(marker => bar.indexOf(marker));
        assert.ok(order.every(index => index >= 0), 'every part is in the bar');
        assert.deepEqual([...order].sort((a, b) => a - b), order);
        assert.deepEqual(barLinks(html).map(({ attrs }) => attrs.href), ['https://reelflies.ca/', '/login.php', '/cart.php']);
        const nav = findTags(bar, 'nav');
        assert.equal(nav.length, 1);
        assert.equal(nav[0].attrs['aria-label'], 'Main');
        assert.equal(findTags(bar, 'form').length, 1);
    });

    it('sends Account to the account page when a customer is signed in, and to sign-in otherwise, with no Sign out anywhere', async () => {
        const signedIn = await render({ customer: { id: 1, name: 'A shopper' } });
        assert.deepEqual(barLinks(signedIn).map(({ attrs }) => attrs.href), ['https://reelflies.ca/', '/account.php', '/cart.php']);
        for (const html of [signedIn, await render()]) {
            assert.ok(!findTags(html, 'a').some(tag => /action(=|&#x3D;)logout/.test(tag.attrs.href || '')), 'Sign out is the account page\'s');
            assert.doesNotMatch(textOf(html), /Sign out/);
        }
    });

    it('has no Saved, Compare or Gift Certificates link in the header or the drawer (stock O04; UX-20)', async () => {
        const html = await render({ customer: { id: 1, name: 'A shopper' } });
        const hrefs = findTags(html, 'a').map(tag => tag.attrs.href);
        for (const href of ['/compare', '/giftcertificates.php', '/wishlist.php']) assert.ok(!hrefs.includes(href), href);
        assert.doesNotMatch(textOf(html), /Compare|Gift Certificate|Saved|Wish List/i);
    });

    it('labels Account and Box in their links, and gives the Box the count order-line.js fills, read as flies', async () => {
        const html = await render();
        const [account, box] = barLinks(html).slice(1);
        assert.equal(account.text, 'Account');
        assert.ok('data-rf-box-btn' in box.attrs, 'order-line.js opens the box sheet from it');
        assert.equal(box.text, 'Box 0 flies in your box');
        const source = outerHtml(barSource(html), 'a', attrs => 'data-rf-box-btn' in attrs);
        const count = findTags(source, 'span').find(tag => 'data-rf-count' in tag.attrs);
        assert.ok(count && hasClass('rf-num', count.attrs), 'the count in the numerals\' cut');
        assert.equal(textOf(outerHtml(source, 'span', attrs => 'data-rf-count' in attrs)), '0');
        assert.ok(findTags(source, 'span').some(tag => 'data-rf-count-label' in tag.attrs && hasClass('is-srOnly', tag.attrs)));
    });

    it('includes the search form partial with rf_id rf-search-q: a GET to the search page with a label, a submit button and the suggestions panel, and no stock quick-search hooks', async () => {
        const html = await render();
        const forms = findTags(headerSource(html), 'form');
        assert.equal(forms.length, 1);
        const [form] = forms;
        assert.ok('data-rf-search' in form.attrs, 'quick-search.js binds it');
        assert.equal(form.attrs.role, 'search');
        assert.equal(form.attrs.action, '/search.php');
        assert.equal(form.attrs.method, 'get');
        const source = outerHtml(html, 'form', attrs => 'data-rf-search' in attrs);
        const [input] = findTags(source, 'input');
        assert.equal(input.attrs.id, 'rf-search-q');
        assert.equal(input.attrs.name, 'search_query');
        assert.equal(input.attrs.type, 'search');
        assert.equal(input.attrs.autocomplete, 'off');
        const [label] = findTags(source, 'label');
        assert.equal(label.attrs.for, 'rf-search-q');
        assert.equal(textOf(outerHtml(source, 'label')), 'Search flies');
        const [button] = findTags(source, 'button');
        assert.equal(button.attrs.type, 'submit');
        assert.equal(textOf(outerHtml(source, 'button')), 'Search');
        const suggest = findTags(source, 'div').find(tag => 'data-rf-suggest' in tag.attrs);
        assert.ok(suggest && 'hidden' in suggest.attrs, 'the suggestions panel, empty and hidden until typed into');
        for (const attr of ['data-search-quick', 'data-quick-search-form']) assert.ok(findTags(html).every(tag => !(attr in tag.attrs)), attr);
    });

    it('lists the top-level categories as plain links while the menu ids are empty (ReelFlies CA today), then Hatch chart and Wholesale: there is no stock fallback', async () => {
        const html = await render();
        const nav = menuSource(html);
        assert.equal(findTags(nav, 'li').filter(tag => 'data-rf-mega' in tag.attrs).length, 0, 'no Flies or Species item');
        assert.deepEqual(links(nav).map(({ attrs, text }) => [attrs.href, text]), [
            ['/dry-flies/', 'Dry Flies'], ['/nymphs/', 'Nymphs'], ['#hatch', 'Hatch chart'], ['/contact-us/', 'Wholesale'],
        ]);
        assert.ok(findTags(nav, 'a').every(tag => hasClass('rf-nav__btn', tag.attrs)));
        const hatch = links(nav).find(({ text }) => text === 'Hatch chart');
        assert.ok('data-rf-mega-close' in hatch.attrs, 'closes an open panel on its way to the chart');
        assert.equal(findTags(html).filter(tag => hasClass('navPages', tag.attrs) || 'data-menu' in tag.attrs).length, 0, 'nothing of the stock navigation');
    });

    it('sends Hatch chart to the home page\'s chart from any other page', async () => {
        const nav = menuSource(await render({ page_type: 'category' }));
        assert.equal(links(nav).find(({ text }) => text === 'Hatch chart').attrs.href, 'https://reelflies.ca/#hatch');
    });

    it('leaves Wholesale out when rf_trade_url is empty', async () => {
        const nav = menuSource(await render({ theme_settings: { rf_trade_url: '' } }));
        assert.deepEqual(links(nav).map(({ text }) => text), ['Dry Flies', 'Nymphs', 'Hatch chart']);
    });

    it('keeps the page\'s own header_bottom region after the header, and renders no header_bottom--global or header_navigation_bottom--global one', async () => {
        const html = await render({}, { regions: { header_bottom: '<div data-rf-test-region></div>' } });
        assert.match(html, /data-content-region="header_bottom"/);
        assert.match(html, /data-rf-test-region/);
        assert.ok(html.indexOf('</header>') < html.indexOf('data-content-region="header_bottom"'));
        assert.doesNotMatch(html, /header_bottom--global|header_navigation_bottom--global/);
    });

    it('puts the mega-menu scrim and the drawer after the header, and the one polite live region after the drawer, empty at load', async () => {
        const html = await render();
        const at = marker => html.indexOf(marker);
        assert.ok(at('</header>') < at('data-rf-mega-scrim') && at('data-rf-mega-scrim') < at('id="rf-drawer"') && at('id="rf-drawer"') < at('data-rf-live-region'));
        const scrim = findTags(html, 'div').find(tag => 'data-rf-mega-scrim' in tag.attrs);
        assert.ok('hidden' in scrim.attrs);
        const regions = findTags(html).filter(tag => 'data-rf-live-region' in tag.attrs);
        assert.equal(regions.length, 1);
        assert.equal(regions[0].attrs.role, 'status');
        assert.equal(regions[0].attrs['aria-live'], 'polite');
        assert.equal(regions[0].attrs['aria-atomic'], 'true');
        assert.equal(textOf(outerHtml(html, 'div', attrs => 'data-rf-live-region' in attrs)), '', 'empty, so screen readers already watch it');
    });
});

describe('the partials stencil bundle has to find', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);
    const includes = source => [...source.matchAll(/\{\{~?#?>\s*([^\s}]+)/g)].map(match => match[1]);
    const files = ['components/common/header.html', 'components/reelflies/header.html', 'components/reelflies/strip.html', 'components/reelflies/search-form.html', 'components/reelflies/drawer.html']
        .map(file => `templates/${file}`);

    for (const file of files) {
        it(`finds every include in ${file}`, () => {
            const source = read(file);
            assert.deepEqual(bundled(source), includes(source));
        });
    }
});
