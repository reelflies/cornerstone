// What the pinned pages in scripts/qa/pages.mjs make the gates see: the status each pin
// must return, which parts of a page the screenshot diffs mask, and what their stylesheet
// hides or holds at a fixed height. And W0-8's several pins per page kind (kind@name keys),
// with the baseline names they, the UI states and the overlays give.
//
//   node --test scripts/qa/pages.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkScope, parseBaselinePath } from '../check-baseline-scope.mjs';
import {
    CHANNELS, HIDDEN, PAGE_KEY, baselineName, expectedStatus, masksFor, pageKind, screenshotStyle,
} from './pages.mjs';
import { knownIssue } from './axe-known-issues.mjs';

// The boxes channel 1's product page holds: its related products' carousels.
const RELATED = '#tab-related .productCarousel';
const SIMILAR = '#tab-similar .productCarousel';

describe('the status a pinned page must return', () => {
    it('is 404 for the 404 template and 200 for every other one', () => {
        assert.equal(expectedStatus('404'), 404);
        for (const template of ['home', 'product', 'category', 'cart', 'brand', 'fly-type']) assert.equal(expectedStatus(template), 200);
    });
});

describe('the screenshot masks', () => {
    const LIVE = ['.price-section', '[data-product-stock]', '.productView-rating', '.countPill', '.cart-total-value'];
    const CARDS_AND_LISTS = ['.productGrid', '.productCarousel', '.card', '.card-title', '.card-image', '#tab-related', '#tab-similar'];
    const pinned = Object.entries(CHANNELS).flatMap(([channel, { pages }]) => Object.keys(pages).map(template => [channel, template]));

    it('hide prices, stock, ratings and cart counts on every pinned page', () => {
        for (const [channel, template] of pinned) {
            for (const selector of LIVE) assert.ok(masksFor(channel, template).includes(selector), `${selector} on ${channel} ${template}`);
        }
    });

    it('leave product cards, grids and carousels visible, so a change to them fails a diff', () => {
        for (const template of ['home', 'brand', 'cart', '404', 'product', 'category', 'fly-type', 'species']) {
            const masks = masksFor('1895766', template);
            for (const selector of CARDS_AND_LISTS) assert.ok(!masks.includes(selector), `${selector} is masked on 1895766 ${template}`);
        }
    });

    it('hide channel 1\'s live product list, which isn\'t pinned, only on its own pages', () => {
        assert.ok(masksFor('1', 'category').includes('.productGrid'));
        assert.ok(!masksFor('1', 'product').includes('.productGrid'));
    });

    it('no longer mask widget regions, which the screenshot stylesheet hides instead (W0-5)', () => {
        for (const [channel, template] of pinned) assert.ok(!masksFor(channel, template).includes('[data-widget-id]'), `${channel} ${template}`);
    });

    it('cover the boxes channel 1\'s product page holds, so a reviewer sees what isn\'t compared', () => {
        assert.ok(masksFor('1', 'product').includes(RELATED));
        assert.ok(masksFor('1', 'product').includes(SIMILAR));
    });

    it('leave the description and the related section\'s frame in the shot', () => {
        for (const selector of ['#tab-related', '#tab-similar', '.productView-description', '.tabs']) {
            assert.ok(!masksFor('1', 'product').includes(selector), `${selector} is masked on channel 1's product page`);
        }
    });
});

// A selector list split at its own commas, not at those inside :is(), :not() or [...].
function selectorList(list) {
    const parts = [];
    let depth = 0;
    let start = 0;
    [...list].forEach((char, at) => {
        if ('(['.includes(char)) depth++;
        else if (')]'.includes(char)) depth--;
        else if (char === ',' && depth === 0) {
            parts.push(list.slice(start, at));
            start = at + 1;
        }
    });
    return [...parts, list.slice(start)].map(part => part.trim()).filter(Boolean);
}

// One selector as the plain selectors it matches: `:is(A, B) > *` is `A > *` and `B > *`.
function plain(selector) {
    const [, inside, rest] = selector.match(/^:is\((.*)\)([^)]*)$/) || [];
    return inside === undefined ? [selector] : selectorList(inside).flatMap(each => plain(`${each}${rest}`));
}

// A rough CSS reader for the stylesheet the screenshots apply: selector -> declarations,
// one entry per plain selector in each rule's selector list.
function rules(css) {
    const found = new Map();
    for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
        const declarations = Object.fromEntries(body.split(';').map(part => part.trim()).filter(Boolean).map(part => {
            const at = part.indexOf(':');
            return [part.slice(0, at).trim(), part.slice(at + 1).trim()];
        }));
        for (const selector of selectorList(selectors).flatMap(plain)) {
            found.set(selector, { ...found.get(selector), ...declarations });
        }
    }
    return found;
}

describe('the rough CSS reader these tests use', () => {
    it('reads a rule for a selector list as one rule for each selector, :is() lists too', () => {
        const css = rules('#a .x, :is(#b .x, [data-y="1,2"]) > * { display: none; }');
        assert.deepEqual([...css.keys()], ['#a .x', '#b .x > *', '[data-y="1,2"] > *']);
    });
});

describe('the screenshot stylesheet (W0-5)', () => {
    const pinned = Object.entries(CHANNELS).flatMap(([channel, { pages }]) => Object.keys(pages).map(template => [channel, template]));
    const kinds = [...pinned, ['1895766', 'product'], ['1895766', 'category'], ['1', 'home'], ['1895766', 'fly-type']];

    it('takes widget regions out of the layout on every page kind and channel, so an applied widget can\'t change a page\'s height', () => {
        for (const [channel, template] of kinds) {
            assert.equal(rules(screenshotStyle(channel, template)).get('[data-widget-id]')?.display, 'none !important', `${channel} ${template}`);
        }
    });

    it('takes the store\'s cookie banner and the bar it leaves after a choice out of the layout on every page', () => {
        // The bar appears about a second after "Reject all", so a shot taken before it was
        // 48 px shorter: the channel-1 product page at 375 failed once at 375x4101 against
        // a 375x4149 baseline.
        for (const [channel, template] of kinds) {
            const css = rules(screenshotStyle(channel, template));
            for (const selector of ['#consent-manager', '#consent-manager-update-banner']) {
                assert.equal(css.get(selector)?.display, 'none !important', `${selector} on ${channel} ${template}`);
            }
        }
        assert.deepEqual(HIDDEN, ['[data-widget-id]', '#consent-manager', '#consent-manager-update-banner']);
    });

    it('holds channel 1\'s related and similar carousels at a fixed height, with their cards taken out', () => {
        const css = rules(screenshotStyle('1', 'product'));
        for (const box of [RELATED, SIMILAR]) {
            const height = CHANNELS[1].hold.product[box];
            assert.ok(Number.isInteger(height) && height > 0, `${box} has a height`);
            for (const property of ['height', 'min-height', 'max-height']) assert.equal(css.get(box)?.[property], `${height}px !important`, `${box} ${property}`);
            assert.equal(css.get(box)?.overflow, 'hidden !important', `${box} overflow`);
            assert.equal(css.get(`${box} > *`)?.display, 'none !important', `${box}'s cards`);
        }
    });

    it('holds each box a hold key lists, and takes out each one\'s cards, without hiding a box', () => {
        // Ticket 39 points `hold` at its grid, and a key may then name more than one box.
        const channels = { 9: { pages: {}, hold: { product: { '#tab-related .grid, #tab-similar .grid': 200 } } } };
        const css = rules(screenshotStyle('9', 'product', channels));
        for (const box of ['#tab-related .grid', '#tab-similar .grid']) {
            assert.equal(css.get(box)?.height, '200px !important', `${box} height`);
            assert.equal(css.get(box)?.display, undefined, `${box} itself is hidden`);
            assert.equal(css.get(`${box} > *`)?.display, 'none !important', `${box}'s cards`);
        }
    });

    it('never hides or holds the description or the related section\'s frame, which tickets 39 and 40 change', () => {
        const css = rules(screenshotStyle('1', 'product'));
        for (const selector of ['#tab-related', '#tab-similar', '.productView-description', '.tabs', '.productView']) {
            assert.ok(!css.has(selector), `${selector} is in the stylesheet`);
        }
    });

    it('holds nothing on any other page or channel, so cards stay in those shots', () => {
        for (const [channel, template] of kinds.filter(([kindChannel, kindTemplate]) => !(kindChannel === '1' && kindTemplate === 'product'))) {
            const css = rules(screenshotStyle(channel, template));
            assert.deepEqual([...css.keys()].sort(), [...HIDDEN].sort(), `${channel} ${template}`);
        }
    });
});

describe('several pins per page kind (W0-8)', () => {
    it('reads a page key as its kind, whether or not it names a pin', () => {
        assert.equal(pageKind('product'), 'product');
        assert.equal(pageKind('product@5663'), 'product');
        assert.equal(pageKind('product@sold-out'), 'product');
        assert.equal(pageKind('fly-type@dry_flies'), 'fly-type');
        assert.equal(pageKind('404'), '404');
    });

    it('refuses a key that is neither a kind nor kind@name', () => {
        for (const key of ['Product', 'product@', '@sold-out', 'product@sold out', 'product@a@b', 'product~drawer-open', 'product+rf_rise-off', '']) {
            assert.throws(() => pageKind(key), /isn't a page key/, key);
        }
    });

    it('keys every page pinned on every channel as a kind or kind@name', () => {
        for (const [channel, { pages }] of Object.entries(CHANNELS)) {
            for (const key of Object.keys(pages)) assert.match(key, PAGE_KEY, `${key} on channel ${channel}`);
        }
    });

    it('expects 404 from every pin of the 404 kind, and 200 from every other pin', () => {
        assert.equal(expectedStatus('404@typo'), 404);
        for (const key of ['product@5663', 'product@sold-out', 'category@alpha', 'home@en']) assert.equal(expectedStatus(key), 200, key);
    });

    it('masks and holds a pin by its whole key, so another pin of the same kind keeps its cards', () => {
        const channels = {
            9: {
                pages: { category: '/live/', 'category@alpha': '/stable/?sort=alphaasc' },
                mask: { category: ['.productGrid'] },
                hold: { 'category@alpha': { '.facetedSearch': 400 } },
            },
        };
        assert.ok(masksFor('9', 'category', channels).includes('.productGrid'));
        assert.ok(!masksFor('9', 'category@alpha', channels).includes('.productGrid'));
        assert.ok(masksFor('9', 'category@alpha', channels).includes('.facetedSearch'));
        assert.match(screenshotStyle('9', 'category@alpha', channels), /:is\(\.facetedSearch\) \{ height: 400px/);
        assert.doesNotMatch(screenshotStyle('9', 'category', channels), /\.facetedSearch/);
    });

    it('lets an axe known issue listed for a kind cover every pin of it, and one listed for kind@name only that pin', () => {
        const issues = [
            { rule: 'region', templates: ['product'], ticket: 25 },
            { rule: 'list', templates: ['category@alpha'], ticket: 33 },
        ];
        assert.ok(knownIssue('region', 'product@sold-out', { issues }));
        assert.ok(knownIssue('list', 'category@alpha', { issues }));
        assert.equal(knownIssue('list', 'category', { issues }), undefined);
        assert.equal(knownIssue('region', 'cart', { issues }), undefined);
    });
});

describe('baseline names (W0-8)', () => {
    const PROJECTS = ['phone-375', 'desktop-1280'];
    // Where Playwright puts a baseline: snapshotPathTemplate in playwright.config.mjs.
    const pathOf = (set, name, project) => `scripts/qa/baselines/${set}/${name.replace(/\.png$/, '')}-${project}-darwin.png`;

    it('keeps a plain pin\'s name, so no existing baseline moves', () => {
        assert.equal(baselineName({ key: 'home' }), 'home.png');
        assert.equal(baselineName({ key: '404' }), '404.png');
    });

    it('adds the pin, the UI state and the overlay in the shape the baseline-scope check reads', () => {
        const cases = [
            [{ key: 'product@sold-out' }, {
                kind: 'product', pin: 'sold-out', state: null, overlay: null,
            }],
            [{ key: 'home', state: 'drawer-open' }, {
                kind: 'home', pin: null, state: 'drawer-open', overlay: null,
            }],
            [{ key: 'home', overlay: 'rf_rise-off' }, {
                kind: 'home', pin: null, state: null, overlay: 'rf_rise-off',
            }],
            [{ key: 'fly-type@dry', state: 'panel-open', overlay: 'menu-ids-empty' }, {
                kind: 'fly-type', pin: 'dry', state: 'panel-open', overlay: 'menu-ids-empty',
            }],
        ];
        for (const [parts, expected] of cases) {
            for (const project of PROJECTS) {
                const parsed = parseBaselinePath(pathOf('1-reelflies-ca', baselineName(parts), project));
                assert.ok(parsed, `${baselineName(parts)} at ${project} is a baseline path the check reads`);
                assert.deepEqual({
                    kind: parsed.kind, pin: parsed.pin, state: parsed.state, overlay: parsed.overlay,
                }, expected, baselineName(parts));
                assert.equal(parsed.project, project);
            }
        }
    });

    it('is covered by the "Baselines:" line a ticket would write for it', () => {
        const file = name => pathOf('1-reelflies-ca', name, 'phone-375');
        assert.ok(checkScope({ body: 'Baselines: product@sold-out', files: [file(baselineName({ key: 'product@sold-out' }))] }).ok);
        assert.ok(checkScope({ body: 'Baselines: home', files: [file(baselineName({ key: 'home', state: 'drawer-open' }))] }).ok);
        assert.ok(checkScope({ body: 'Baselines: overlay rf_rise-off', files: [file(baselineName({ key: 'home', state: 'drawer-open', overlay: 'rf_rise-off' }))] }).ok);
        assert.ok(!checkScope({ body: 'Baselines: home', files: [file(baselineName({ key: 'home', overlay: 'rf_rise-off' }))] }).ok, 'an overlay baseline needs its overlay declared');
    });

    it('refuses a state or overlay name the scope check couldn\'t read', () => {
        assert.throws(() => baselineName({ key: 'home', state: 'drawer open' }), /isn't a UI state name/);
        assert.throws(() => baselineName({ key: 'home', overlay: 'rise~off' }), /isn't an overlay name/);
        assert.throws(() => baselineName({ key: 'home~x' }), /isn't a page key/);
    });
});
