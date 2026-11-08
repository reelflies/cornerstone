// Tests ticket 27's raw-HTML assertions (spec seam 2): rf-header, max-one-h1 and strip-region,
// redrawn for Streamside Stone, on pages built round the header as components/common/header.html
// renders it after head.html, and on the stock header's markup, which they fail.
//
//   node --test scripts/qa/raw-html/assertions/rf-header.test.mjs

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { renderPartial } from '../../render/render.mjs';
import { outerHtml } from '../html.mjs';
import { headerProblems } from './rf-header.mjs';
import maxOneH1 from './max-one-h1.mjs';
import { stripRegionProblems } from './strip-region.mjs';

const STORE = {
    urls: {
        home: 'https://reelflies.ca/', search: '/search.php', cart: '/cart.php', account: { index: '/account.php' }, auth: { login: '/login.php' },
    },
    settings: {
        store_logo: {
            image: {
                data: 'https://cdn11.bigcommerce.com/s-x/images/stencil/{:size}/logo.png', alt: '', width: 133, height: 95,
            },
            title: 'ReelFlies.ca',
        },
        store_name: 'ReelFlies',
        phone_number: '1 866 250 4071',
    },
    categories: [{
        id: 298, name: 'Dry Flies', url: '/dry-flies/', children: [],
    }],
    page_type: 'default',
};
const PAGE = 'rf-test/rf-header-page';
const WITH_HEAD = { [PAGE]: '{{> components/reelflies/head}}{{> components/common/header}}' };
// The stock Cornerstone 6.22 header on the home page, trimmed: the toggle link and the logo <h1>.
const STOCK_HEADER = `<a href="#main-content" class="skip-to-main-link">Skip to main content</a>
<header class="header" role="banner">
    <a href="#" class="mobileMenu-toggle" data-mobile-menu-toggle="menu"><span class="mobileMenu-toggleIcon">Toggle menu</span></a>
    <nav class="navUser"><a class="navUser-action navUser-item--compare" href="/compare">Compare</a><a class="navUser-action" href="/giftcertificates.php">Gift Certificates</a></nav>
    <h1 class="header-logo header-logo--center"><a href="https://reelflies.ca/" class="header-logo__link"><img src="/logo.png" alt="ReelFlies.ca"></a></h1>
    <div class="navPages-container" id="menu" data-menu></div>
</header>
<div data-content-region="header_bottom--global"></div>`;

const frame = (header, main = '<h1>Dry Flies</h1>') => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body>${header}<main id="main-content">${main}</main></body></html>`;
const page = (html, kind = 'home') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3501/', status: kind === '404' ? 404 : 200, html,
});
let header;
before(async () => {
    const rendered = await renderPartial(PAGE, STORE, { overrides: WITH_HEAD });
    header = rendered.slice(rendered.indexOf('<a href="#main-content"'));
});
const swap = (from, to) => {
    const html = header.replace(from, to);
    assert.notEqual(html, header, `the fixture holds ${from}`);
    return html;
};
const MENU_BUTTON = '<button class="rf-head__menu" type="button" aria-expanded="false" aria-controls="rf-drawer" data-rf-drawer-open>';

describe('ticket 27\'s assertions', () => {
    it('are registered, for every page kind', async () => {
        const assertions = await loadAssertions();
        for (const id of ['rf-header', 'max-one-h1', 'strip-region']) {
            const assertion = assertions.find(entry => entry.id === id);
            assert.ok(assertion, `${id} is registered`);
            assert.equal(assertion.pages, undefined, `${id} applies to every page`);
            assert.equal(assertion.ticket, 27);
        }
    });

    it('pass the header components/common/header.html renders, on every page kind', async () => {
        const assertions = (await loadAssertions()).filter(({ ticket }) => ticket === 27);
        for (const kind of ['home', 'product', 'category', 'cart', 'brand', '404', 'login', 'page', 'search']) {
            const failed = checkPage(page(frame(header), kind), assertions).filter(({ status }) => status !== 'pass');
            assert.deepEqual(failed.map(({ id, problems }) => `${id}: ${problems}`), [], kind);
        }
    });

    it('fail the stock header: the logo an <h1>, a "Toggle menu" link, Compare and Gift Certificates, and no strip', () => {
        assert.deepEqual(headerProblems(frame(STOCK_HEADER, '')), ['0 ReelFlies headers (<header data-rf-head>), not 1: components/common/header.html includes components/reelflies/header']);
        assert.deepEqual(maxOneH1.check(page(frame(STOCK_HEADER))), ['2 <h1> elements, not at most 1']);
        assert.deepEqual(stripRegionProblems(frame(STOCK_HEADER)), ['0 utility strips (.rf-strip), not 1']);
    });
});

describe('rf-header', () => {
    const brand = () => outerHtml(header, 'a', attrs => /(^|\s)rf-brand(\s|$)/.test(attrs.class || ''));

    it('fails a logo that is an <h1>, has no link or has no name', () => {
        const asHeading = swap(brand(), brand().replace(/^<a class="rf-brand" href="[^"]*">/, '<h1 class="rf-brand"><a href="https://reelflies.ca/">').replace(/<\/a>$/, '</a></h1>'));
        const problems = headerProblems(frame(asHeading)).join('\n');
        assert.match(problems, /the header holds 1 <h1>/);
        assert.match(problems, /the logo is a <h1>, not a link home/);
        assert.match(headerProblems(frame(swap(brand(), brand().replace(' href="https://reelflies.ca/"', '')))).join('\n'), /the logo link has no href/);
        assert.match(headerProblems(frame(swap(' alt="ReelFlies.ca home"', ' alt=""'))).join('\n'), /the logo link has no name/);
        assert.match(headerProblems(frame(swap(brand(), ''))).join('\n'), /0 logos \(\.rf-brand\), not 1/);
    });

    it('fails a Menu control that is a link, has no aria-expanded, controls nothing or something that isn\'t the drawer, or has no label', () => {
        const asLink = swap(MENU_BUTTON, MENU_BUTTON.replace(/^<button/, '<a href="#rf-drawer"')).replace('</button>', '</a>');
        assert.match(headerProblems(frame(asLink)).join('\n'), /the Menu control is a <a>, not a <button>/);
        assert.match(headerProblems(frame(swap(MENU_BUTTON, MENU_BUTTON.replace(' aria-expanded="false"', '')))).join('\n'), /the Menu button has aria-expanded "", not "false"/);
        assert.match(headerProblems(frame(swap(MENU_BUTTON, MENU_BUTTON.replace(' aria-controls="rf-drawer"', '')))).join('\n'), /the Menu button has no aria-controls/);
        assert.match(headerProblems(frame(swap(MENU_BUTTON, MENU_BUTTON.replace('aria-controls="rf-drawer"', 'aria-controls="nowhere"')))).join('\n'), /controls "nowhere", which isn't on the page/);
        assert.match(headerProblems(frame(swap(MENU_BUTTON, MENU_BUTTON.replace('aria-controls="rf-drawer"', 'aria-controls="main-content"')))).join('\n'), /controls "main-content", which isn't the drawer/);
        assert.match(headerProblems(frame(swap('<span class="is-srOnly">Menu</span>', ''))).join('\n'), /the Menu button has no label/);
        assert.match(headerProblems(frame(swap(' data-rf-drawer-open', ''))).join('\n'), /0 Menu controls \(data-rf-drawer-open\) in the header, not 1/);
    });

    it('fails a second <nav> in the header, a nav with no name, a missing search form and a Box with no count', () => {
        assert.match(headerProblems(frame(swap('<nav class="rf-nav"', '<nav aria-label="x"></nav><nav class="rf-nav"'))).join('\n'), /2 <nav> in the header, not 1/);
        assert.match(headerProblems(frame(swap(' aria-label="Main"', ''))).join('\n'), /the header's <nav> has no aria-label/);
        assert.match(headerProblems(frame(swap(' data-rf-search>', '>'))).join('\n'), /0 search forms \(form\[data-rf-search\]\) in the header, not 1/);
        assert.match(headerProblems(frame(swap(' role="search"', ''))).join('\n'), /the header's search form has no role="search"/);
        assert.match(headerProblems(frame(swap(' data-rf-count>', '>'))).join('\n'), /the Box link has no count \(data-rf-count\)/);
        assert.match(headerProblems(frame(swap(' data-rf-box-btn', ''))).join('\n'), /0 Box links \(data-rf-box-btn\) in the header, not 1/);
    });

    it('fails a Compare, Gift Certificates or wish list link in the header, and the stock navigation beside it', () => {
        for (const href of ['/compare', '/giftcertificates.php', '/wishlist.php?action=addwishlist']) {
            const crowded = swap('<a class="rf-head__link"', `<a href="${href}">More</a><a class="rf-head__link"`);
            assert.match(headerProblems(frame(crowded)).join('\n'), new RegExp(`the header links to ${href.replace(/[?.]/g, '\\$&')}`), href);
        }
        assert.match(headerProblems(frame(`${header}<nav class="navPages"></nav>`)).join('\n'), /the stock header's navigation renders beside the ReelFlies one/);
        assert.deepEqual(headerProblems(frame(swap('<div class="rf-drawer"', '<a href="/giftcertificates.php">Gift Certificates</a><div class="rf-drawer"'))), [], 'a link outside the header is the page\'s, not the header\'s');
    });

    it('fails a page with two headers, or none', () => {
        assert.match(headerProblems(frame(header + header)).join('\n'), /2 ReelFlies headers/);
        assert.match(headerProblems(frame('')).join('\n'), /0 ReelFlies headers/);
    });

    it('reads markup only: a header in a comment or a script isn\'t one', () => {
        const hidden = `<!-- ${header} --><script>var later = '<header data-rf-head>';</script>`;
        assert.deepEqual(headerProblems(frame(header + hidden)), []);
    });
});

describe('max-one-h1', () => {
    it('passes a page with one <h1> or none, and fails one with two', () => {
        assert.deepEqual(maxOneH1.check(page(frame(header))), []);
        assert.deepEqual(maxOneH1.check(page(frame(header, ''))), []);
        assert.deepEqual(maxOneH1.check(page(frame(header, '<h1>Dry Flies</h1><h1>Again</h1>'))), ['2 <h1> elements, not at most 1']);
    });
});

describe('strip-region', () => {
    const strip = () => outerHtml(header, 'div', attrs => /(^|\s)rf-strip(\s|$)/.test(attrs.class || ''));

    it('fails a landmark with no role or no name', () => {
        assert.match(stripRegionProblems(frame(swap(' role="region"', ''))).join('\n'), /the strip has role "", not "region"/);
        assert.match(stripRegionProblems(frame(swap(' aria-label="Shipping and contact"', ''))).join('\n'), /has no accessible name/);
    });

    it('fails the strip inside the <header>, after it, or twice, and none at all', () => {
        const inside = header.replace(strip(), '').replace('<div class="rf-head__bar">', `${strip()}<div class="rf-head__bar">`);
        assert.match(stripRegionProblems(frame(inside)).join('\n'), /inside the <header>/);
        const after = header.replace(strip(), '').replace('</header>', `</header>${strip()}`);
        assert.match(stripRegionProblems(frame(after)).join('\n'), /comes after the <header>/);
        assert.deepEqual(stripRegionProblems(frame(header + header)), ['2 utility strips (.rf-strip), not 1']);
        assert.deepEqual(stripRegionProblems(frame(swap(strip(), ''))), ['0 utility strips (.rf-strip), not 1']);
    });

    it('fails a link in the strip with no href, and passes the strip\'s own links', () => {
        assert.match(strip(), /<a href="tel:/, 'the phone number is a link by design');
        assert.deepEqual(stripRegionProblems(frame(header)), []);
        assert.match(stripRegionProblems(frame(swap('<a href="https://reelflies.com/">', '<a>'))).join('\n'), /1 link\(s\) in the strip with no href/);
    });
});
