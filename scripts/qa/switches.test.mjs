// The module switches and how the switch matrix finds them (ticket 54a; scripts/qa/switches.mjs;
// the redesign's switches since step 2):
//
// - The module switches are config.json's boolean rf_* settings (rf_counts, rf_quick_add,
//   rf_cart_state, rf_size_strip and rf_order_line), and each has an entry in SWITCHES with the
//   ticket, or the redesign step, that owns it.
// - A switch is in the matrix once a template reads theme_settings.<switch> outside a
//   Handlebars comment: until then its module hasn't landed, and flipping it changes nothing.
// - Each switch has an overlay that flips its base value, so the matrix can render it both ways.
// - A switch a template reads names its markup (markers) or its script (chunks), so the matrix
//   can check that nothing of the module renders with the switch off, or says in `browser` why
//   its effect has neither.
//
//   node --test scripts/qa/switches.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listOverlays, readOverlay } from './overlays.mjs';
import { PAGE_KEY } from './pages.mjs';
import {
    SWITCHES, TEMPLATES_DIR, chunkRequested, datasetName, describeValues, expectedModules, flippingOverlays, moduleSwitches, offSwitches, ownerOf,
    queriedSwitches, readSwitchValues, sourceText, stockSelectors, stripHandlebarsComments, switchQuery, switchValues, templatesReading, withQuery,
} from './switches.mjs';

const CONFIG = JSON.parse(fs.readFileSync(path.resolve('config.json'), 'utf8'));
const TEMPLATES = path.resolve('templates');
const ALL_SWITCHES = ['rf_counts', 'rf_quick_add', 'rf_cart_state', 'rf_size_strip', 'rf_order_line'];

const temps = [];
after(() => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
// A templates folder of its own, with `files` (relative path -> text) in it.
function templates(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-switch-templates-'));
    temps.push(dir);
    for (const [file, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
    }
    return dir;
}

const FIXTURE = {
    settings: {
        rf_counts: true, rf_menu_type_ids: '', rf_quick_add: true, rf_order_line: false, show_powered_by: true,
    },
    variations: [
        { name: 'ReelFlies CA', settings: { rf_menu_type_ids: '' } },
        { name: 'ReelFlies CA channel 1', settings: { rf_quick_add: false } },
    ],
};

describe('the module switches', () => {
    it('are config.json\'s boolean rf_* settings, and nothing else', () => {
        assert.deepEqual(moduleSwitches(FIXTURE), ['rf_counts', 'rf_quick_add', 'rf_order_line']);
        assert.deepEqual(moduleSwitches(CONFIG), ALL_SWITCHES);
    });

    it('each have an entry in SWITCHES, naming who owns the module', () => {
        const keys = moduleSwitches(CONFIG);
        assert.deepEqual(Object.keys(SWITCHES), keys, 'one entry per switch, in config.json\'s order');
        for (const [key, entry] of Object.entries(SWITCHES)) {
            assert.match(entry.ticket, /^(\d+|redesign step \d+)$/, `${key}'s owner is a ticket number or a redesign step`);
            assert.ok(entry.module, `${key} says which module it switches`);
            assert.ok(Array.isArray(entry.markers) && Array.isArray(entry.chunks), `${key} lists its markers and chunks`);
            for (const marker of entry.markers) assert.match(marker, /^data-rf-[a-z0-9-]+$/, `${key}'s marker ${marker} is a data-rf-* attribute`);
            for (const chunk of entry.chunks) assert.match(chunk, /^rf-[a-z0-9-]+$/, `${key}'s chunk ${chunk} is a webpackChunkName`);
            for (const [kind, selectors] of Object.entries(entry.stock || {})) {
                assert.ok(PAGE_KEY.test(kind) && !kind.includes('@'), `${key}'s stock markup is keyed by page kind, and "${kind}" isn't one`);
                assert.ok(Array.isArray(selectors) && selectors.length && selectors.every(selector => typeof selector === 'string' && selector.trim()), `${key}'s stock markup on ${kind} is a list of CSS selectors`);
            }
            if (entry.browser !== undefined) assert.ok(typeof entry.browser === 'string' && entry.browser.trim() && !entry.markers.length && !entry.chunks.length, `${key}'s browser note says what the off row shows, for a module with no marker and no chunk of its own`);
            if (entry.query) {
                assert.deepEqual(Object.keys(entry.query).sort(), ['hide', 'show'], `${key}'s query has a show and a hide override`);
                for (const which of ['show', 'hide']) assert.match(entry.query[which], /^[a-z0-9_]+=[a-z0-9_-]+(&[a-z0-9_]+=[a-z0-9_-]+)*$/, `${key}'s ${which} override is a query string, such as rf_region=out`);
                assert.notEqual(entry.query.show, entry.query.hide, `${key}'s two overrides differ`);
                assert.ok(entry.markers.length, `${key} has a query, so it names the marker that shows its module is on the page`);
            }
            for (const kind of entry.notOn || []) assert.ok(entry.query && PAGE_KEY.test(kind) && !kind.includes('@'), `${key}'s notOn is a list of page kinds, for a switch with a query`);
        }
    });

    it('name their owners as the matrix words them: a ticket, or the redesign step', () => {
        assert.equal(ownerOf(SWITCHES.rf_quick_add), 'ticket 43');
        assert.equal(ownerOf(SWITCHES.rf_cart_state), 'ticket 42');
        assert.equal(ownerOf(SWITCHES.rf_counts), 'redesign step 2');
        assert.equal(ownerOf(SWITCHES.rf_size_strip), 'redesign step 3');
        assert.equal(ownerOf(SWITCHES.rf_order_line), 'redesign step 2');
    });

    it('none waits for a QA override on this branch: master\'s outside-Canada prompt (ticket 52) is gone with its switch', () => {
        for (const key of ALL_SWITCHES) assert.equal(SWITCHES[key].query, undefined, key);
        assert.ok(!('rf_region_prompt' in CONFIG.settings) && !('rf_rise' in CONFIG.settings), 'config.json declares neither rf_region_prompt nor rf_rise');
    });

    it('take the variation\'s value over the base one, and an overlay\'s over both', () => {
        assert.deepEqual(switchValues({ config: FIXTURE, variation: 'ReelFlies CA' }), { rf_counts: true, rf_quick_add: true, rf_order_line: false });
        assert.deepEqual(switchValues({ config: FIXTURE, variation: 'ReelFlies CA channel 1' }), { rf_counts: true, rf_quick_add: false, rf_order_line: false });
        assert.deepEqual(
            switchValues({ config: FIXTURE, variation: 'ReelFlies CA', overlay: { name: 'rf_counts-off', settings: { rf_counts: false } } }),
            { rf_counts: false, rf_quick_add: true, rf_order_line: false },
        );
        assert.throws(() => switchValues({ config: FIXTURE, variation: 'ReelFlies XX' }), /"ReelFlies XX" isn't a variation in config\.json/);
    });

    it('that are off are listed with their entries, in config.json\'s order', () => {
        const off = offSwitches({ rf_counts: false, rf_quick_add: true, rf_order_line: false });
        assert.deepEqual(off.map(({ key }) => key), ['rf_counts', 'rf_order_line']);
        assert.equal(off[1].ticket, 'redesign step 2');
        assert.deepEqual(off[1].markers, ['data-rf-orderline']);
        assert.deepEqual(off[0].markers, ['data-rf-count', 'data-rf-hub-count']);
    });

    it('are described as the run renders them', () => {
        assert.equal(describeValues({ rf_counts: true, rf_order_line: false }), 'rf_counts on, rf_order_line off');
    });
});

describe('which switches a template reads', () => {
    it('finds theme_settings.<switch> in any template, at any depth', () => {
        const dir = templates({
            'components/reelflies/count.html': '{{#if theme_settings.rf_counts}}<span data-rf-count></span>{{/if}}',
            'components/reelflies/head.html': "{{~inject 'rfCartState' theme_settings.rf_cart_state}}",
        });
        assert.deepEqual([...templatesReading(['rf_counts', 'rf_cart_state', 'rf_quick_add'], { dir })].sort(), ['rf_cart_state', 'rf_counts']);
    });

    it('doesn\'t count a Handlebars comment', () => {
        const dir = templates({
            'components/reelflies/head.html': [
                '{{!--',
                "    {{~inject 'rfCounts' theme_settings.rf_counts}}",
                '--}}',
                '{{!-- head: rf_counts --}}',
                '{{! theme_settings.rf_cart_state }}',
                '{{~!-- theme_settings.rf_quick_add --~}}',
            ].join('\n'),
        });
        assert.deepEqual([...templatesReading(['rf_counts', 'rf_cart_state', 'rf_quick_add'], { dir })], []);
    });

    it('doesn\'t take one switch for another whose name begins the same way', () => {
        const dir = templates({ 'pages/home.html': '{{theme_settings.rf_counts_format}}' });
        assert.deepEqual([...templatesReading(['rf_counts'], { dir })], []);
    });

    it('keeps an HTML comment, which Handlebars still renders', () => {
        const dir = templates({ 'pages/home.html': '<!-- {{theme_settings.rf_counts}} -->' });
        assert.deepEqual([...templatesReading(['rf_counts'], { dir })], ['rf_counts']);
    });

    it('strips both kinds of Handlebars comment and nothing else', () => {
        assert.equal(stripHandlebarsComments('a{{!-- x }} y --}}b{{! z }}c{{x}}'), 'abc{{x}}');
    });

    it('reads the theme\'s own templates by default, which read every switch on this branch', () => {
        assert.equal(TEMPLATES_DIR, TEMPLATES);
        const keys = moduleSwitches(CONFIG);
        assert.deepEqual(templatesReading(keys), templatesReading(keys, { dir: TEMPLATES }));
        assert.deepEqual([...templatesReading(keys)].sort(), [...ALL_SWITCHES].sort());
    });
});

describe('the overlays that flip a switch', () => {
    const overlays = [
        { name: 'rf_counts-off', settings: { rf_counts: false } },
        { name: 'rf_counts-and-more', settings: { rf_counts: false, rf_order_line: false } },
        { name: 'rf_counts-on', settings: { rf_counts: true } },
    ];

    it('set that switch alone, to the value asked for', () => {
        assert.deepEqual(flippingOverlays('rf_counts', false, overlays), ['rf_counts-off']);
        assert.deepEqual(flippingOverlays('rf_counts', true, overlays), ['rf_counts-on']);
        assert.deepEqual(flippingOverlays('rf_order_line', false, overlays), []);
    });

    it('exist for every module switch, flipping its base value, and for no switch config.json has lost', () => {
        const committed = listOverlays().map(name => readOverlay(name));
        for (const key of moduleSwitches(CONFIG)) {
            const flipped = !CONFIG.settings[key];
            assert.equal(flippingOverlays(key, flipped, committed).length, 1, `one overlay in scripts/qa/overlays/ sets ${key} to ${flipped} and nothing else`);
        }
        for (const overlay of committed) {
            for (const key of Object.keys(overlay.settings)) assert.ok(key in CONFIG.settings, `the overlay ${overlay.name} sets ${key}, which config.json declares`);
        }
        assert.ok(!listOverlays().some(name => /^rf_(rise|region_prompt)-/.test(name) || name === 'rf_quick_add-on'), 'master\'s overlays for retired or no-longer-differing switches are gone');
    });
});

describe('a switch whose module has landed', () => {
    const reading = templatesReading(moduleSwitches(CONFIG));

    it('names the markup or the script the matrix checks for with the switch off, or says why its effect has neither', () => {
        for (const key of reading) {
            const { markers, chunks, browser } = SWITCHES[key];
            assert.ok(
                markers.length + chunks.length > 0 || browser,
                `a template reads theme_settings.${key} now, so ${ownerOf(SWITCHES[key])}'s module has landed: name in SWITCHES.${key} (scripts/qa/switches.mjs) the data-rf-* attribute its markup carries (markers), or the webpackChunkName of its script (chunks), or say in browser why it has neither. The switch matrix checks that neither is on the page with ${key} off (ticket 54).`,
            );
        }
    });

    it('names markers and chunks the theme\'s source really has, so the check isn\'t empty', () => {
        const source = sourceText();
        for (const key of reading) {
            const { markers, chunks } = SWITCHES[key];
            for (const marker of markers) {
                assert.ok(source.includes(marker) || source.includes(datasetName(marker)), `SWITCHES.${key} names the marker ${marker}, and no template or script under assets/js writes it (${ownerOf(SWITCHES[key])})`);
            }
            for (const chunk of chunks) {
                assert.match(source, new RegExp(`webpackChunkName:\\s*["']${chunk}["']`), `SWITCHES.${key} names the chunk ${chunk}, and no import under assets/js names it (${ownerOf(SWITCHES[key])})`);
            }
        }
    });

    it('names stock selectors only for the module that puts stock markup back with its switch off: the size picker', () => {
        assert.deepEqual(Object.keys(SWITCHES).filter(key => SWITCHES[key].stock), ['rf_size_strip']);
        assert.deepEqual(stockSelectors(SWITCHES.rf_size_strip, 'product'), ['.rf-pdp__form:not([hidden]) form[data-cart-item-add]']);
        assert.match(fs.readFileSync(path.join(TEMPLATES, 'components/reelflies/product-buy.html'), 'utf8'), /<div class="rf-pdp__form"[^>]*>[\s\S]*<form[^>]*data-cart-item-add/);
    });

    it('reads the dataset spelling of a marker too', () => {
        assert.equal(datasetName('data-rf-orderline'), 'rfOrderline');
        assert.equal(datasetName('data-rf-hub-count'), 'rfHubCount');
    });
});

describe('a run\'s switch values', () => {
    it('come from config.json, the variation and the overlay the run names', () => {
        assert.deepEqual(readSwitchValues({ variation: 'ReelFlies CA' }), switchValues({ config: CONFIG, variation: 'ReelFlies CA' }));
        assert.equal(readSwitchValues({ variation: 'ReelFlies CA', overlay: 'rf_counts-off' }).rf_counts, false);
        assert.equal(readSwitchValues({ variation: 'ReelFlies CA', overlay: 'rf_order_line-off' }).rf_order_line, false);
        assert.throws(() => readSwitchValues({ variation: 'ReelFlies CA', overlay: 'rf-counts-off' }), /isn't an overlay/);
    });

    it('are every switch on, on both gated variations, so the plain runs render the whole redesign', () => {
        for (const variation of ['ReelFlies CA', 'ReelFlies CA channel 1']) {
            assert.deepEqual(readSwitchValues({ variation }), Object.fromEntries(ALL_SWITCHES.map(key => [key, true])), variation);
        }
    });
});

describe('a switch whose module waits for a QA override', () => {
    const switches = {
        rf_counts: {
            ticket: 'redesign step 2', module: 'the counts', markers: ['data-rf-count'], chunks: [],
        },
        rf_prompt: {
            ticket: '52', module: 'the prompt', markers: ['data-rf-prompt'], chunks: [], query: { show: 'rf_region=out', hide: 'rf_region=in' }, notOn: ['cart'],
        },
        rf_other: {
            ticket: '99', module: 'another', markers: ['data-rf-other'], chunks: [], query: { show: 'rf_other=show', hide: 'rf_other=hide' },
        },
    };
    const ON = { rf_counts: true, rf_prompt: true, rf_other: false };

    it('counts only while its switch is on', () => {
        assert.deepEqual(queriedSwitches(ON, switches).map(({ key }) => key), ['rf_prompt']);
        assert.deepEqual(queriedSwitches({ ...ON, rf_other: true }, switches).map(({ key, notOn }) => [key, notOn]), [['rf_prompt', ['cart']], ['rf_other', []]]);
        assert.deepEqual(queriedSwitches({ rf_counts: true, rf_prompt: false }, switches), []);
    });

    it('opens every page of a run with the switch on with the override that shows its module', () => {
        assert.equal(switchQuery(ON, { switches }), 'rf_region=out');
        assert.equal(switchQuery({ ...ON, rf_other: true }, { switches }), 'rf_region=out&rf_other=show');
        assert.equal(switchQuery({ rf_prompt: false }, { switches }), '');
    });

    it('swaps one switch\'s override for the one that hides it, and keeps the others showing', () => {
        assert.equal(switchQuery(ON, { switches, hide: 'rf_prompt' }), 'rf_region=in');
        assert.equal(switchQuery({ ...ON, rf_other: true }, { switches, hide: 'rf_other' }), 'rf_region=out&rf_other=hide');
    });

    it('is none of this repo\'s switches, so every run opens its pages with no query', () => {
        assert.equal(switchQuery(readSwitchValues({ variation: 'ReelFlies CA' })), '');
        assert.equal(switchQuery(readSwitchValues({ variation: 'ReelFlies CA channel 1', overlay: 'rf_quick_add-off' })), '');
        assert.equal(switchQuery(Object.fromEntries(ALL_SWITCHES.map(key => [key, true]))), '');
    });

    it('adds the override to a pinned page\'s path, after any query it has and before any fragment', () => {
        assert.equal(withQuery('/', 'rf_region=out'), '/?rf_region=out');
        assert.equal(withQuery('/search.php?search_query=hopper', 'rf_region=out'), '/search.php?search_query=hopper&rf_region=out');
        assert.equal(withQuery('/fly-hook-size-chart/#size-12', 'rf_region=in'), '/fly-hook-size-chart/?rf_region=in#size-12');
        assert.equal(withQuery('/cart.php', ''), '/cart.php');
    });

    it('is expected on a page whose path carries its show override, except on the kinds it never shows on', () => {
        const expected = (pagePath, kind, values = ON) => expectedModules(values, pagePath, kind, switches).map(({ key, marker }) => [key, marker]);
        assert.deepEqual(expected('/?rf_region=out', 'home'), [['rf_prompt', 'data-rf-prompt']]);
        assert.deepEqual(expected('/brands/ReelFlies.html?rf_region=out', 'brand'), [['rf_prompt', 'data-rf-prompt']]);
        assert.deepEqual(expected('/cart.php?rf_region=out', 'cart'), []);
        assert.deepEqual(expected('/?rf_region=in', 'home'), []);
        assert.deepEqual(expected('/', 'home'), []);
        assert.deepEqual(expected('/?rf_region=out', 'home', { ...ON, rf_prompt: false }), []);
        assert.deepEqual(expected('/?rf_region=out&rf_other=show', 'home', { ...ON, rf_other: true }), [['rf_prompt', 'data-rf-prompt'], ['rf_other', 'data-rf-other']]);
    });
});

describe('the stock markup a switched-off module must leave', () => {
    it('is named per page kind, and a kind it doesn\'t name has none', () => {
        const entry = { stock: { category: ['.card .quickview'], brand: ['.card .quickview'] } };
        assert.deepEqual(stockSelectors(entry, 'category'), ['.card .quickview']);
        assert.deepEqual(stockSelectors(entry, 'cart'), []);
        assert.deepEqual(stockSelectors({}, 'category'), []);
    });

    it('comes with each switched-off entry, empty until its owner names it', () => {
        const switches = {
            rf_quick_add: {
                ticket: '43', module: 'quick add', markers: [], chunks: [], stock: { category: ['.quickview'] },
            },
        };
        const [off] = offSwitches({ rf_quick_add: false }, switches);
        assert.deepEqual(off.stock, { category: ['.quickview'] });
        assert.deepEqual(offSwitches({ rf_counts: false })[0].stock, {});
    });
});

describe('a switch\'s chunk', () => {
    it('is recognised by webpack\'s chunk file name, in any build folder', () => {
        assert.ok(chunkRequested('rf-quick-add', 'http://localhost:3301/stencil/00000000-0000-0000-0000-000000000001/dist/theme-bundle.chunk.rf-quick-add.js'));
        assert.ok(chunkRequested('rf-quick-add', 'https://cdn11.bigcommerce.com/s-x/stencil/abc/e/def/dist/theme-bundle.chunk.rf-quick-add.js?v=1'));
        assert.ok(!chunkRequested('rf-quick-add', 'http://localhost:3301/dist/theme-bundle.chunk.rf-quick-add-steppers.js'));
        assert.ok(!chunkRequested('rf-quick-add', 'http://localhost:3301/rf-quick-add.js'));
    });
});
