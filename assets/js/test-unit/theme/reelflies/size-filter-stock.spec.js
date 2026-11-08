/**
 * @jest-environment-options {"url": "https://reelflies.ca/dry-flies/"}
 */
// The Fly size filter's Filter button and refresh with stock's real code (ticket 33; story 68;
// PR #73's rf/spec m5 and rf/skeptic minor 9). size-filter.spec.js stands in for stock with a
// stub; here stock faceted-search.js, collapsible.js and category.js run, as on the storefront.
//
// - The HTML is what stock's refresh puts in the page: components/category/sidebar and
//   components/category/product-listing, rendered from the category fixture page's `fly-type`
//   and `filtered` contexts (scripts/qa/render/pages/category-page/fixtures/). There is no helper
//   file: beforeAll renders them with scripts/qa/render/render.mjs's renderPartial in a child
//   `node` process, because render.mjs is an ES module that Jest's CommonJS runtime can't load.
// - Phone CSS: stock's rules that hide the facet panel and the closed accordions below 801px
//   are cascaded through a <style>, and jQuery's :hidden reads them through getComputedStyle.
//   jest.setup.js's getClientRects shim reads inline styles only, so this file replaces it, and
//   puts it back afterwards.
// - api.getPage is stubbed. It answers on a later microtask, as a fetch would: a URL with a Fly
//   Sizes filter gets the `filtered` page (size 14 picked, 31 flies), any other URL `fly-type`.
// - The live region (ticket 25) is the real one. Its writes are recorded, so "announced once"
//   counts what a screen reader would hear.
// - jsdom's URL is the fixtures' host, so stock's history.pushState accepts their absolute
//   facet URLs.
//
// It reads only the templates' hooks (data-rf-filter-button, data-facet, aria-current, stock's
// ids) and size-filter.js's start(), never the module's internals.

import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

const THEME = path.resolve(__dirname, '../../../../..');
const RENDER = pathToFileURL(path.join(THEME, 'scripts/qa/render/render.mjs')).href;
const FIXTURES = path.join(THEME, 'scripts/qa/render/pages/category-page/fixtures');
const MARK = '\n@@rf-rendered@@\n';

// Renders the sidebar and the listing from each fixture, as stock's AJAX refresh would.
function renderFixtures(names) {
    const script = `
        import fs from 'fs';
        import path from 'path';
        const { renderPartial } = await import(${JSON.stringify(RENDER)});
        const out = {};
        for (const name of ${JSON.stringify(names)}) {
            const context = JSON.parse(fs.readFileSync(path.join(${JSON.stringify(FIXTURES)}, name + '.json'), 'utf8')).page_context;
            out[name] = {
                sidebar: await renderPartial('components/category/sidebar', context),
                listing: await renderPartial('components/category/product-listing', context),
            };
        }
        process.stdout.write(${JSON.stringify(MARK)} + JSON.stringify(out));
    `;
    const stdout = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
        cwd: THEME, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout.slice(stdout.lastIndexOf(MARK) + MARK.length));
}

// Below 801px: _facetedSearch.scss hides the panel until it is open, and Foundation's accordion
// hides a closed facet.
const PHONE_CSS = `
    .facetedSearch-navList { display: none; }
    .facetedSearch-navList.is-open { display: block; }
    .accordion-content { display: none; }
    .accordion-content.is-open { display: block; }
    .modal { display: none; }
`;

// category.js reads the price validation strings from these.
const DICTIONARY = JSON.stringify({
    translations: {
        'validation_messages.price_min_evaluation': 'Min. price must be less than max. price.',
        'validation_messages.price_max_evaluation': 'Min. price must be less than max. price.',
        'validation_messages.price_min_not_entered': 'Min. price is required.',
        'validation_messages.price_max_not_entered': 'Max. price is required.',
        'validation_messages.price_invalid_value': 'Input must be greater than 0.',
    },
});
const CONTEXT = {
    categoryProductsPerPage: 24,
    validationDictionaryJSON: DICTIONARY,
    validationFallbackDictionaryJSON: DICTIONARY,
    validationDefaultDictionaryJSON: DICTIONARY,
    urls: {},
};

const settle = (ms = 0) => new Promise(resolve => { setTimeout(resolve, ms); });

let rendered;
let api;
let Category;
let sizeFilter;
let announceDelay;
let page;
let spoken;
let regionObserver;
const originalRects = window.Element.prototype.getClientRects;

// The category page's body, as components/reelflies/category-page.html lays it out, with the
// server's empty live region (body-start.html) and stock's modal.
function pageHtml(name) {
    return `<style>${PHONE_CSS}</style>
        <div class="is-srOnly" role="status" aria-live="polite" aria-atomic="true" data-rf-live-region></div>
        <div class="rf-list__inner">
            <aside class="rf-list__side" id="faceted-search-container">${rendered[name].sidebar}</aside>
            <div class="rf-list__main" id="product-listing-container">${rendered[name].listing}</div>
        </div>
        <div id="modal" class="modal" data-reveal><div class="modal-content"></div><div class="loadingOverlay"></div></div>`;
}

beforeAll(async () => {
    rendered = renderFixtures(['fly-type', 'filtered']);

    window.Element.prototype.getClientRects = function getClientRects() {
        for (let node = this; node && node !== document; node = node.parentNode) {
            if (node.nodeType === 1 && window.getComputedStyle(node).display === 'none') return [];
        }
        return [{ width: 1, height: 1 }];
    };
    $.fx.off = true; // category.js's scroll to the top, done at once

    // faceted-search.js reads the page (#facetedSearch, #modal) when it is first imported.
    document.body.innerHTML = pageHtml('fly-type');
    ({ api } = await import('@bigcommerce/stencil-utils'));
    Category = (await import('../../../theme/category')).default;
    sizeFilter = await import('../../../theme/reelflies/size-filter');
    announceDelay = (await import('../../../theme/reelflies/live-region')).ANNOUNCE_DELAY_MS;
}, 60000);

afterAll(() => {
    window.Element.prototype.getClientRects = originalRects;
    $.fx.off = false;
});

beforeEach(() => {
    window.history.replaceState({}, '', '/dry-flies/');
    document.body.innerHTML = pageHtml('fly-type');
    jest.spyOn(api, 'getPage').mockImplementation((url, options, callback) => {
        const name = /Fly(\+|%20)Sizes=/.test(url) ? 'filtered' : 'fly-type';
        Promise.resolve().then(() => callback(null, { productListing: rendered[name].listing, sidebar: rendered[name].sidebar }));
    });

    spoken = [];
    const region = document.querySelector('[data-rf-live-region]');
    regionObserver = new MutationObserver(() => {
        const text = region.textContent.trim();
        if (text) spoken.push(text);
    });
    regionObserver.observe(region, { childList: true, characterData: true, subtree: true });
});

afterEach(() => {
    regionObserver.disconnect();
    if (page && page.facetedSearch) page.facetedSearch.unbindEvents();
    page = null;
    $('body').off();
    jest.restoreAllMocks();
});

// Starts stock's category page and the size filter, in either order: both are loaded as
// separate chunks, so either can start first. Then waits for stock's setTimeout, which closes
// every facet when the panel starts hidden (faceted-search.js:80-86).
async function start(order = 'stock first') {
    const startStock = () => {
        page = new Category(CONTEXT);
        page.onReady();
    };
    if (order === 'stock first') {
        startStock();
        sizeFilter.start({});
    } else {
        sizeFilter.start({});
        startStock();
    }
    await settle(10);
}

// After a click or a change that refreshes the listing: stock's request, its callback and
// restoreCollapsedFacets, then long enough past the live region's delay that a second, later
// announcement would be heard too.
const afterRefresh = () => settle(announceDelay * 3 + 100);

const filterButton = () => document.querySelector('[data-rf-filter-button]');
const stockToggle = () => document.querySelector('#facetedSearch .facetedSearch-toggle');
const panel = () => document.getElementById('facetedSearch-navList');
const sizesFacet = () => document.getElementById('facetedSearch-content--fly-sizes');
const pills = () => [...document.querySelectorAll('#facetedSearch [data-facet="Fly Sizes"] a[data-faceted-search-facet]')];
const pill = size => pills().find(anchor => anchor.textContent.trim() === size);
const isOpen = element => element.classList.contains('is-open');
const click = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe('Filter on a phone, with stock faceted-search.js and collapsible.js', () => {
    describe.each(['stock first', 'size filter first'])('loaded %s', order => {
        it('starts closed, then opens the panel and Fly Sizes through stock\'s toggle, with focus on the first pill', async () => {
            await start(order);
            expect(isOpen(panel())).toBe(false);
            expect(isOpen(sizesFacet())).toBe(false); // stock closed every facet
            expect(filterButton().getAttribute('aria-expanded')).toBe('false');

            filterButton().click();

            expect(isOpen(panel())).toBe(true);
            expect(isOpen(sizesFacet())).toBe(true);
            expect(filterButton().getAttribute('aria-expanded')).toBe('true');
            expect(stockToggle().getAttribute('aria-expanded')).toBe('true');
            expect(document.activeElement).toBe(pills()[0]);
        });
    });

    it('keeps the panel and Fly Sizes open through stock\'s whole refresh after a pill, with focus on the size used and the count announced once', async () => {
        await start();
        filterButton().click();
        const fourteen = pill('14');
        fourteen.focus();
        click(fourteen);
        await afterRefresh();

        expect(window.location.search).toContain('Fly+Sizes=14');
        expect(isOpen(panel())).toBe(true);
        expect(isOpen(sizesFacet())).toBe(true);
        expect(filterButton().getAttribute('aria-expanded')).toBe('true');
        expect(stockToggle().getAttribute('aria-expanded')).toBe('true');
        expect(document.activeElement).toBe(pill('14'));
        expect(document.activeElement.getAttribute('aria-current')).toBe('true');
        expect(spoken).toEqual(['31 patterns']);
    });

    it('keeps the panel closed through a sort refresh, Filter and stock\'s toggle both saying so', async () => {
        await start();
        filterButton().click();
        filterButton().click(); // open, then closed again
        expect(isOpen(panel())).toBe(false);

        const sort = document.querySelector('[data-sort-by] select');
        sort.focus();
        sort.value = sort.options[1].value;
        sort.dispatchEvent(new Event('change', { bubbles: true }));
        await afterRefresh();

        expect(window.location.search).toContain(`sort=${sort.options[1].value}`);
        expect(isOpen(panel())).toBe(false);
        expect(filterButton().getAttribute('aria-expanded')).toBe('false');
        expect(stockToggle().getAttribute('aria-expanded')).toBe('false');
    });
});
