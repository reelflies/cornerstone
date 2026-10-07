// The module switches and how the switch matrix finds them (ticket 54a; scripts/qa/switches.mjs):
//
// - The module switches are config.json's boolean rf_* settings, and each has an entry in
//   SWITCHES with the ticket that owns it.
// - A switch is in the matrix once a template reads theme_settings.<switch> outside a
//   Handlebars comment: until then its module hasn't landed, and flipping it changes nothing.
// - Each switch has an overlay that flips its base value, so the matrix can render it both ways.
// - A switch a template reads names its markup (markers) or its script (chunks), so the matrix
//   can check that nothing of the module renders with the switch off.
//
//   node --test scripts/qa/switches.test.mjs

import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { listOverlays, readOverlay } from './overlays.mjs';
import {
    SWITCHES, chunkRequested, datasetName, describeValues, flippingOverlays, moduleSwitches, offSwitches, readSwitchValues, sourceText, stripHandlebarsComments,
    switchValues, templatesReading,
} from './switches.mjs';

const CONFIG = JSON.parse(fs.readFileSync(path.resolve('config.json'), 'utf8'));
const TEMPLATES = path.resolve('templates');

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
        rf_rise: true, rf_menu_type_ids: '', rf_cart_state: true, rf_region_prompt: false, show_powered_by: true,
    },
    variations: [
        { name: 'ReelFlies CA', settings: { rf_menu_type_ids: '' } },
        { name: 'ReelFlies CA channel 1', settings: { rf_cart_state: false } },
    ],
};

describe('the module switches', () => {
    it('are config.json\'s boolean rf_* settings, and nothing else', () => {
        assert.deepEqual(moduleSwitches(FIXTURE), ['rf_rise', 'rf_cart_state', 'rf_region_prompt']);
    });

    it('each have an entry in SWITCHES, naming the ticket that owns the module', () => {
        const keys = moduleSwitches(CONFIG);
        assert.ok(keys.length >= 4, keys.join(', '));
        assert.deepEqual(Object.keys(SWITCHES).sort(), [...keys].sort());
        for (const [key, entry] of Object.entries(SWITCHES)) {
            assert.match(entry.ticket, /^\d+$/, `${key}'s ticket`);
            assert.ok(entry.module, `${key} says which module it switches`);
            assert.ok(Array.isArray(entry.markers) && Array.isArray(entry.chunks), `${key} lists its markers and chunks`);
            for (const marker of entry.markers) assert.match(marker, /^data-rf-[a-z0-9-]+$/, `${key}'s marker ${marker} is a data-rf-* attribute`);
            for (const chunk of entry.chunks) assert.match(chunk, /^rf-[a-z0-9-]+$/, `${key}'s chunk ${chunk} is a webpackChunkName`);
        }
    });

    it('take the variation\'s value over the base one, and an overlay\'s over both', () => {
        assert.deepEqual(switchValues({ config: FIXTURE, variation: 'ReelFlies CA' }), { rf_rise: true, rf_cart_state: true, rf_region_prompt: false });
        assert.deepEqual(switchValues({ config: FIXTURE, variation: 'ReelFlies CA channel 1' }), { rf_rise: true, rf_cart_state: false, rf_region_prompt: false });
        assert.deepEqual(
            switchValues({ config: FIXTURE, variation: 'ReelFlies CA', overlay: { name: 'rf_rise-off', settings: { rf_rise: false } } }),
            { rf_rise: false, rf_cart_state: true, rf_region_prompt: false },
        );
        assert.throws(() => switchValues({ config: FIXTURE, variation: 'ReelFlies XX' }), /"ReelFlies XX" isn't a variation in config\.json/);
    });

    it('that are off are listed with their entries, in config.json\'s order', () => {
        const off = offSwitches({ rf_rise: false, rf_cart_state: true, rf_region_prompt: false });
        assert.deepEqual(off.map(({ key }) => key), ['rf_rise', 'rf_region_prompt']);
        assert.equal(off[1].ticket, '52');
        assert.deepEqual(off[1].markers, ['data-rf-region-prompt']);
    });

    it('are described as the run renders them', () => {
        assert.equal(describeValues({ rf_rise: true, rf_region_prompt: false }), 'rf_rise on, rf_region_prompt off');
    });
});

describe('which switches a template reads', () => {
    it('finds theme_settings.<switch> in any template, at any depth', () => {
        const dir = templates({
            'components/reelflies/rise.html': '{{#if theme_settings.rf_rise}}<span data-rf-rise></span>{{/if}}',
            'components/reelflies/js-settings.html': "{{~inject 'rfCartState' theme_settings.rf_cart_state}}",
        });
        assert.deepEqual([...templatesReading(['rf_rise', 'rf_cart_state', 'rf_quick_add'], { dir })].sort(), ['rf_cart_state', 'rf_rise']);
    });

    it('doesn\'t count a Handlebars comment, such as the scaffold\'s slot lines and their example', () => {
        const dir = templates({
            'components/reelflies/js-settings.html': [
                '{{!--',
                "    {{~inject 'rfRise' theme_settings.rf_rise}}",
                '--}}',
                '{{!-- 27 header: rf_rise --}}',
                '{{! theme_settings.rf_cart_state }}',
                '{{~!-- theme_settings.rf_quick_add --~}}',
            ].join('\n'),
        });
        assert.deepEqual([...templatesReading(['rf_rise', 'rf_cart_state', 'rf_quick_add'], { dir })], []);
    });

    it('doesn\'t take one switch for another whose name begins the same way', () => {
        const dir = templates({ 'pages/home.html': '{{theme_settings.rf_rise_ring_size}}' });
        assert.deepEqual([...templatesReading(['rf_rise'], { dir })], []);
    });

    it('keeps an HTML comment, which Handlebars still renders', () => {
        const dir = templates({ 'pages/home.html': '<!-- {{theme_settings.rf_rise}} -->' });
        assert.deepEqual([...templatesReading(['rf_rise'], { dir })], ['rf_rise']);
    });

    it('strips both kinds of Handlebars comment and nothing else', () => {
        assert.equal(stripHandlebarsComments('a{{!-- x }} y --}}b{{! z }}c{{x}}'), 'abc{{x}}');
    });

    it('reads the theme\'s own templates by default', () => {
        // The scaffold's js-settings.html names every switch, but only in comments.
        assert.ok(fs.readFileSync(path.join(TEMPLATES, 'components/reelflies/js-settings.html'), 'utf8').includes('theme_settings.rf_rise'));
        const reading = templatesReading(moduleSwitches(CONFIG));
        for (const key of reading) assert.ok(moduleSwitches(CONFIG).includes(key));
    });
});

describe('the overlays that flip a switch', () => {
    const overlays = [
        { name: 'rf_rise-off', settings: { rf_rise: false } },
        { name: 'rf_rise-and-more', settings: { rf_rise: false, rf_cart_state: false } },
        { name: 'rf_rise-on', settings: { rf_rise: true } },
    ];

    it('set that switch alone, to the value asked for', () => {
        assert.deepEqual(flippingOverlays('rf_rise', false, overlays), ['rf_rise-off']);
        assert.deepEqual(flippingOverlays('rf_rise', true, overlays), ['rf_rise-on']);
        assert.deepEqual(flippingOverlays('rf_cart_state', false, overlays), []);
    });

    it('exist for every module switch, flipping its base value', () => {
        const committed = listOverlays().map(name => readOverlay(name));
        for (const key of moduleSwitches(CONFIG)) {
            const flipped = !CONFIG.settings[key];
            assert.equal(flippingOverlays(key, flipped, committed).length, 1, `one overlay in scripts/qa/overlays/ sets ${key} to ${flipped} and nothing else`);
        }
    });
});

describe('a switch whose module has landed', () => {
    const reading = templatesReading(moduleSwitches(CONFIG));

    it('names the markup or the script the matrix checks for with the switch off', () => {
        for (const key of reading) {
            const { ticket, markers, chunks } = SWITCHES[key];
            assert.ok(
                markers.length + chunks.length > 0,
                `a template reads theme_settings.${key} now, so ticket ${ticket}'s module has landed: name in SWITCHES.${key} (scripts/qa/switches.mjs) the data-rf-* attribute its markup carries (markers), or the webpackChunkName of its script (chunks). The switch matrix checks that neither is on the page with ${key} off (ticket 54).`,
            );
        }
    });

    it('names markers and chunks the theme\'s source really has, so the check isn\'t empty', () => {
        const source = sourceText();
        for (const key of reading) {
            const { ticket, markers, chunks } = SWITCHES[key];
            for (const marker of markers) {
                assert.ok(source.includes(marker) || source.includes(datasetName(marker)), `SWITCHES.${key} names the marker ${marker}, and no template or script under assets/js writes it (ticket ${ticket})`);
            }
            for (const chunk of chunks) {
                assert.match(source, new RegExp(`webpackChunkName:\\s*["']${chunk}["']`), `SWITCHES.${key} names the chunk ${chunk}, and no import under assets/js names it (ticket ${ticket})`);
            }
        }
    });

    it('reads the dataset spelling of a marker too', () => {
        assert.equal(datasetName('data-rf-region-prompt'), 'rfRegionPrompt');
    });
});

describe('a run\'s switch values', () => {
    it('come from config.json, the variation and the overlay the run names', () => {
        assert.deepEqual(readSwitchValues({ variation: 'ReelFlies CA' }), switchValues({ config: CONFIG, variation: 'ReelFlies CA' }));
        assert.equal(readSwitchValues({ variation: 'ReelFlies CA', overlay: 'rf_rise-off' }).rf_rise, false);
        assert.throws(() => readSwitchValues({ variation: 'ReelFlies CA', overlay: 'rf-rise-off' }), /isn't an overlay/);
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
