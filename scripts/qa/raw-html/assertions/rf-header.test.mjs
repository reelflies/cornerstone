// Tests ticket 27's raw-HTML assertions (spec seam 2): rf-header, max-one-h1 and strip-region,
// on pages built round the header as components/common/header.html renders it, and on the stock
// header's markup, which they fail.
//
//   node --test scripts/qa/raw-html/assertions/rf-header.test.mjs

import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPage, loadAssertions } from '../../raw-html.mjs';
import { renderPartial } from '../../render/render.mjs';
import { elementSource, headerProblems } from './rf-header.mjs';
import maxOneH1 from './max-one-h1.mjs';
import { stripRegionProblems } from './strip-region.mjs';

const STORE = {
    urls: {
        home: 'https://reelflies.ca/', search: '/search.php', cart: '/cart.php', auth: { login: '/login.php' },
    },
    settings: { store_logo: { image: { data: 'https://cdn11.bigcommerce.com/s-x/images/stencil/{:size}/logo.png', alt: '' }, title: 'ReelFlies.ca' } },
    categories: [{
        id: 298, name: 'Dry Flies', url: '/dry-flies/', children: [],
    }],
    page_type: 'default',
};
// The stock Cornerstone 6.22 header on the home page, trimmed: the toggle link and the logo <h1>.
const STOCK_HEADER = `<a href="#main-content" class="skip-to-main-link">Skip to main content</a>
<header class="header" role="banner">
    <a href="#" class="mobileMenu-toggle" data-mobile-menu-toggle="menu"><span class="mobileMenu-toggleIcon">Toggle menu</span></a>
    <nav class="navUser"><a class="navUser-action navUser-item--compare" href="/compare">Compare</a><a class="navUser-action" href="/giftcertificates.php">Gift Certificates</a></nav>
    <h1 class="header-logo header-logo--center"><a href="https://reelflies.ca/" class="header-logo__link"><img src="/logo.png" alt="ReelFlies.ca"></a></h1>
    <div class="navPages-container" id="menu" data-menu></div>
</header>
<div data-content-region="header_bottom--global"></div>`;
const STRIP = '<div data-widget-id="w"><div class="rf-strip" data-rf-strip><p>Free standard shipping on fly orders over $60</p></div></div>';

const frame = (header, main = '<h1>Dry Flies</h1>') => `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body>${header}<main id="main-content">${main}</main></body></html>`;
const page = (html, kind = 'home') => ({
    kind, key: kind, path: '/', url: 'http://localhost:3501/', status: kind === '404' ? 404 : 200, html,
});
let header;
before(async () => {
    header = await renderPartial('components/common/header', STORE, { regions: { 'header_bottom--global': STRIP } });
});
const swap = (from, to) => header.replace(from, to);

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
        for (const kind of ['home', 'product', 'category', 'cart', 'brand', '404', 'login', 'page']) {
            // A skip counts only where the assertion leaves the kind out (strip-every-page's 404).
            const leftOut = id => (assertions.find(entry => entry.id === id).notOn || []).includes(kind);
            const failed = checkPage(page(frame(header), kind), assertions).filter(({ id, status }) => status !== 'pass' && !(status === 'skip' && leftOut(id)));
            assert.deepEqual(failed.map(({ id, problems }) => `${id}: ${problems}`), [], kind);
        }
    });

    it('fail the stock header: the logo an <h1>, a "Toggle menu" link, Compare and Gift Certificates', () => {
        assert.deepEqual(headerProblems(frame(STOCK_HEADER, '')), ['0 ReelFlies headers (<header data-rf-header>), not 1: components/common/header.html includes components/reelflies/header']);
        assert.deepEqual(maxOneH1.check(page(frame(STOCK_HEADER))), ['2 <h1> elements, not at most 1']);
        assert.match(stripRegionProblems(frame(STOCK_HEADER)).join('\n'), /isn't inside the strip's landmark/);
    });
});

describe('rf-header', () => {
    it('fails a logo that is an <h1>, or sits in one', () => {
        const asHeading = swap(/<div class="header-logo rf-header-logo" data-rf-logo>([\s\S]*?)<\/div>/, '<h1 class="header-logo rf-header-logo" data-rf-logo>$1</h1>');
        const problems = headerProblems(frame(asHeading)).join('\n');
        assert.match(problems, /the header holds 1 <h1>/);
        assert.match(problems, /1 <h1 class="header-logo">: the logo is never a heading/);
        assert.match(problems, /the logo is a <h1>, not a <div>/);
    });

    it('fails a logo <div> with no link in it', () => {
        const unlinked = swap(/<a class="header-logo__link[^>]*>([\s\S]*?)<\/a>/, '$1');
        assert.match(headerProblems(frame(unlinked)).join('\n'), /the logo's <div> holds 0 links, not 1/);
    });

    it('fails a Menu control that is a link, has no aria-expanded or has no label', () => {
        const button = elementSource(header, 'button', attrs => 'data-mobile-menu-toggle' in attrs);
        const asLink = swap(button, button.replace(/^<button/, '<a href="#"').replace(/<\/button>$/, '</a>'));
        assert.match(headerProblems(frame(asLink)).join('\n'), /the Menu control is a <a>, not a <button>/);
        const noState = swap(button, button.replace(' aria-expanded="false"', ''));
        assert.match(headerProblems(frame(noState)).join('\n'), /the Menu button has no aria-expanded/);
        const unlabelled = swap(button, button.replace(/<span class="rf-header-menu-label[\s\S]*?<\/span>/g, ''));
        assert.match(headerProblems(frame(unlabelled)).join('\n'), /the Menu button has no visible label/);
    });

    it('fails a Compare, Gift Certificates or wish list link in the row, and leaves the drawer to ticket 28', () => {
        for (const href of ['/compare', '/giftcertificates.php', '/wishlist.php?action=addwishlist']) {
            const crowded = swap('<nav class="rf-header-user"', `<a href="${href}">More</a><nav class="rf-header-user"`);
            assert.match(headerProblems(frame(crowded)).join('\n'), new RegExp(`the header row links to ${href.replace(/[?.]/g, '\\$&')}`), href);
        }
        const drawer = swap('<div class="navPages-container rf-header-drawer" id="menu" data-menu>', '<div class="navPages-container rf-header-drawer" id="menu" data-menu><a href="/giftcertificates.php">Gift Certificates</a>');
        assert.deepEqual(headerProblems(frame(drawer)), []);
    });

    it('fails a page with two headers, or none', () => {
        assert.match(headerProblems(frame(header + header)).join('\n'), /2 ReelFlies headers/);
        assert.match(headerProblems(frame('')).join('\n'), /0 ReelFlies headers/);
    });

    it('reads markup only: a header in a comment or a script isn\'t one', () => {
        const hidden = `<!-- ${header} --><script>var later = '<header data-rf-header>';</script>`;
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
    it('fails a landmark with no role or no name', () => {
        assert.match(stripRegionProblems(frame(swap(' role="region"', ''))).join('\n'), /has role "", not "region"/);
        assert.match(stripRegionProblems(frame(swap(/ aria-label="Shipping and prices"/, ''))).join('\n'), /has no accessible name/);
    });

    it('fails the region outside the landmark, or a second one', () => {
        const bare = swap(/<div class="rf-strip-region"[^>]*>/, '<div>');
        assert.match(stripRegionProblems(frame(bare)).join('\n'), /isn't inside the strip's landmark/);
        assert.match(stripRegionProblems(frame(header + header)).join('\n'), /2 header_bottom--global regions, not 1/);
    });

    it('fails the landmark inside the <header>', () => {
        const wrapper = elementSource(header, 'div', attrs => 'data-rf-strip-region' in attrs);
        const inside = header.replace(wrapper, '').replace('</header>', `${wrapper}</header>`);
        assert.match(stripRegionProblems(frame(inside)).join('\n'), /inside the <header>/);
    });

    it('fails the landmark before the <header>: it belongs after it', () => {
        const wrapper = elementSource(header, 'div', attrs => 'data-rf-strip-region' in attrs);
        const ahead = header.replace(wrapper, '').replace('<header', `${wrapper}<header`);
        assert.match(stripRegionProblems(frame(ahead)).join('\n'), /before the <header>/);
    });

    it('fails the strip with a link, and leaves another channel\'s widget in the region alone', () => {
        const linked = swap('over $60</p>', 'over $60 <a href="https://reelflies.com/">Shop in USD</a></p>');
        assert.match(stripRegionProblems(frame(linked)).join('\n'), /the shipping strip holds a link \(https:\/\/reelflies\.com\/\)/);
        const other = swap(STRIP, '<div data-widget-id="c1"><p><a href="https://reelflies.com/">Shop in USD</a></p></div>');
        assert.deepEqual(stripRegionProblems(frame(other)), []);
    });

    it('passes the region empty, before the strip is written', () => {
        assert.deepEqual(stripRegionProblems(frame(swap(STRIP, ''))), []);
    });
});
