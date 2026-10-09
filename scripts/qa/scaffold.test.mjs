// The scaffold ticket 25 lands first (build pipeline, section 6.1): one slot per module in each
// shared file, so tickets that run in parallel fill their own lines instead of appending to the
// same ones, and the upstream hooks that load the ReelFlies files. These tests hold the
// conventions, not the values: a ticket fills its own slot and sets its own group's values (the
// four module switches stay booleans). Seam 5 (spec, Testing Decisions): the release guard's
// fixture for the pre-declared keys, switches and values, before and after the scaffold's push.
//
//   node --test scripts/qa/scaffold.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import templateAssembler from '@bigcommerce/stencil-cli/lib/template-assembler.js'; // eslint-disable-line import/extensions, import/no-extraneous-dependencies
import { THEME_DIR } from './render/render.mjs';
import { checkRelease, menuIdsSet } from '../release-guard.mjs';
import { effectiveSettings, MENU_ID_KEYS, threeWayDiff } from '../release-diff.mjs';
import { validateThemeConfig } from '../release-schema.mjs';

const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
const json = file => JSON.parse(read(file));
const lines = file => read(file).split('\n');

// Section 6.3's keys, one group per module, in ticket order, as the scaffold pre-declares them.
// A ticket may add keys at the end of its own group.
const SETTINGS_GROUPS = [
    [27, ['rf_rise']],
    [28, ['rf_menu_type_ids', 'rf_menu_species_root_id', 'rf_menu_exclude_ids']],
    [31, ['rf_price_unit_exclude']],
    [39, ['rf_ship_free_threshold', 'rf_ship_standard_rate', 'rf_ship_expedited_from']],
    [40, ['rf_store_same_as']],
    [42, ['rf_cart_state']],
    [43, ['rf_quick_add']],
    [52, ['rf_region_prompt']],
];
const SWITCHES = ['rf_rise', 'rf_cart_state', 'rf_quick_add', 'rf_region_prompt'];
// The pre-declared values that aren't menu ids. Rule 1 guards them like the switches.
const VALUE_KEYS = SETTINGS_GROUPS.flatMap(([, groupKeys]) => groupKeys)
    .filter(key => !SWITCHES.includes(key) && !MENU_ID_KEYS.includes(key));
const VARIATIONS = ['ReelFlies CA', 'ReelFlies US'];

// Section 6.1's lang modules, in order.
const LANG_MODULES = [
    'header', 'menu', 'search', 'card', 'category', 'facets', 'hub', 'chart', 'brand', 'size_pills', 'add_flow',
    'product', 'reviews', 'cart', 'cart_state', 'quick_add', 'home', 'footer', 'not_found', 'cart_empty',
    'search_empty', 'region',
];

describe('config.json: the ReelFlies settings block', () => {
    const config = json('config.json');
    const keys = Object.keys(config.settings);
    const text = lines('config.json');
    const lineOf = key => text.findIndex(line => line.trim().startsWith(`"${key}":`));

    it('pre-declares every key section 6.3 names', () => {
        for (const [ticket, groupKeys] of SETTINGS_GROUPS) {
            for (const key of groupKeys) assert.ok(keys.includes(key), `${key} (ticket ${ticket}) is in config.json's settings`);
        }
    });

    it('keeps every rf_* key in one block, before the last stock key, so each ReelFlies line ends with a comma', () => {
        const rf = keys.map((key, index) => (key.startsWith('rf_') ? index : -1)).filter(index => index >= 0);
        assert.deepEqual(rf, Array.from({ length: rf.length }, (_, offset) => rf[0] + offset), 'the rf_* keys are contiguous');
        assert.ok(!keys[keys.length - 1].startsWith('rf_'), 'the last settings key is a stock key');
        assert.ok(rf[rf.length - 1] === keys.length - 2, 'the block sits right before the last stock key');
    });

    it('orders the groups by ticket, each key inside its own group', () => {
        const starts = SETTINGS_GROUPS.map(([, groupKeys]) => keys.indexOf(groupKeys[0]));
        assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
        SETTINGS_GROUPS.forEach(([ticket, groupKeys], group) => {
            const end = group + 1 < starts.length ? starts[group + 1] : Infinity;
            for (const key of groupKeys) {
                const at = keys.indexOf(key);
                assert.ok(at >= starts[group] && at < end, `${key} sits in ticket ${ticket}'s group`);
            }
        });
    });

    it('separates the groups, and the block, with blank lines', () => {
        for (const [ticket, [first]] of SETTINGS_GROUPS) {
            assert.equal(text[lineOf(first) - 1].trim(), '', `a blank line before ticket ${ticket}'s group`);
        }
        assert.equal(text[lineOf(keys[keys.length - 1]) - 1].trim(), '', 'a blank line after the block');
    });

    // Only the switches' type is a convention: a module reads true or false. A value's type is its
    // owner's to choose.
    it('makes the four module switches booleans', () => {
        for (const key of SWITCHES) assert.equal(typeof config.settings[key], 'boolean', key);
    });

    // Ticket 53's channel-1 variation too, which sets tree 1's ids.
    it('declares the two menu ids in every variation too', () => {
        assert.ok(VARIATIONS.every(name => config.variations.some(item => item.name === name)));
        for (const variation of config.variations) {
            for (const key of MENU_ID_KEYS) assert.ok(key in variation.settings, `${key} in ${variation.name}`);
        }
    });

    it('passes stencil-cli\'s full theme config schema', () => {
        assert.deepEqual(validateThemeConfig(config), []);
    });
});

describe('the release guard and step 1 with the pre-declared keys (seam 5)', () => {
    const config = json('config.json');

    for (const variation of VARIATIONS) {
        const repo = effectiveSettings(config, variation);
        const live = Object.fromEntries(Object.entries(repo).filter(([key]) => !key.startsWith('rf_')));
        // These tests are about the switches and values (rule 1). A variation with menu ids set
        // (ReelFlies US has tree 2's, decision 5) is checked against a tree that holds them, as
        // the release reads its target's tree; rule 2 is release-guard.test.mjs's.
        const tree = menuIdsSet(repo)
            ? MENU_ID_KEYS.flatMap(key => String(repo[key]).split(',')).map(id => id.trim()).filter(Boolean).map(Number)
            : null;

        it(`lets the first push after the scaffold through on ${variation}, listing each switch once as new`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: live, channelId: 1895766, categoryIds: tree,
            });
            assert.equal(result.pass, true, result.reasons.join('; '));
            const switches = Object.keys(repo).filter(key => key.startsWith('rf_') && !MENU_ID_KEYS.includes(key)).sort();
            assert.deepEqual([...result.newSwitches].sort(), switches);
            assert.ok(switches.length >= 10);
        });

        it(`doesn't stop step 1 on ${variation}: keys only in config.json are new`, () => {
            const { blocking } = threeWayDiff({ repo, live });
            assert.deepEqual(blocking.filter(entry => entry.key.startsWith('rf_')), []);
        });

        it(`refuses, on ${variation}, a pre-declared switch the live theme has with another value`, () => {
            for (const key of SWITCHES) {
                const result = checkRelease({
                    repoSettings: repo, liveSettings: { ...live, [key]: !repo[key] }, channelId: 1895766, categoryIds: tree,
                });
                assert.equal(result.pass, false, key);
                assert.ok(result.reasons.some(reason => reason.startsWith(`${key}:`)), key);
            }
        });

        // After the scaffold's push, the live theme holds every pre-declared key at the scaffold's
        // value, which is also the channel's last released value. An owner ticket then sets its
        // real value in config.json.
        const pushed = repo;
        const another = key => (repo[key] === '5' ? '6' : '5');

        it(`refuses, on ${variation}, a pre-declared value that config.json changes after the scaffold's push (rule 1)`, () => {
            assert.equal(VALUE_KEYS.length, 6);
            for (const key of VALUE_KEYS) {
                const result = checkRelease({
                    repoSettings: { ...repo, [key]: another(key) }, liveSettings: pushed, channelId: 1895766, categoryIds: tree,
                });
                // If this starts passing, the release lane has given values the three-way rule: update
                // CUSTOMIZATIONS.md ("Changing a pre-declared value"), drop this test and the todo below's flag.
                assert.equal(result.pass, false, key);
                assert.ok(result.reasons.some(reason => reason.startsWith(`${key}: live `) && /No flag overrides this/.test(reason)), key);
            }
        });

        it(`passes, on ${variation}, a pre-declared value set in Theme Styles first and then in config.json`, () => {
            for (const key of VALUE_KEYS) {
                const value = another(key);
                const changed = { ...repo, [key]: value };
                const result = checkRelease({
                    repoSettings: changed, liveSettings: { ...pushed, [key]: value }, channelId: 1895766, categoryIds: tree,
                });
                assert.equal(result.pass, true, `${key}: ${result.reasons.join('; ')}`);
                const { blocking } = threeWayDiff({ repo: changed, live: { ...pushed, [key]: value }, released: pushed });
                assert.deepEqual(blocking, [], key);
            }
        });

        // The release-lane change PR #29 asks the orchestrator for: values follow W0-2's three-way
        // rule, as the menu ids do, so a value config.json changed since the last release passes
        // while the live value is still the released one. A control-panel edit still stops step 1.
        it(`passes, on ${variation}, a pre-declared value that config.json changed since the last release`, {
            todo: 'waits on the release lane: non-boolean rf_* values follow step 1\'s three-way rule',
        }, () => {
            for (const key of VALUE_KEYS) {
                const changed = { ...repo, [key]: another(key) };
                const result = checkRelease({
                    repoSettings: changed, liveSettings: pushed, channelId: 1895766, categoryIds: tree,
                });
                assert.equal(result.pass, true, `${key}: ${result.reasons.join('; ')}`);
                const step1 = threeWayDiff({ repo: changed, live: pushed, released: pushed });
                assert.deepEqual(step1.changedInRepo.map(entry => entry.key), [key]);
                const edited = threeWayDiff({ repo, live: { ...pushed, [key]: another(key) }, released: pushed });
                assert.deepEqual(edited.blocking.map(entry => entry.key), [key], `${key} edited live still stops step 1`);
            }
        });
    }
});

describe('schema.json and schemaTranslations.json: the ReelFlies group', () => {
    const schema = json('schema.json');
    const translations = json('schemaTranslations.json');
    const config = json('config.json');
    const group = schema.find(item => item.name === 'i18n.RfReelFlies');

    it('is one group, before the last stock group', () => {
        assert.ok(group, 'schema.json has the ReelFlies group');
        assert.equal(schema.filter(item => item.name === 'i18n.RfReelFlies').length, 1);
        assert.notEqual(schema[schema.length - 1], group);
    });

    it('has one heading per settings module, in ticket order, with the menu ids under the menu heading', () => {
        const headings = group.settings.filter(setting => setting.type === 'heading').map(setting => setting.content);
        assert.deepEqual(headings, [
            'i18n.RfHeader', 'i18n.RfMenu', 'i18n.RfProductCards', 'i18n.RfProductPage', 'i18n.RfStoreDetails',
            'i18n.RfCartState', 'i18n.RfQuickAdd', 'i18n.RfRegionPrompt',
        ]);
        const menu = group.settings.findIndex(setting => setting.content === 'i18n.RfMenu');
        assert.deepEqual(group.settings.slice(menu + 1, menu + 3).map(setting => [setting.type, setting.id]), [
            ['text', 'rf_menu_type_ids'],
            ['text', 'rf_menu_species_root_id'],
        ]);
    });

    it('only names rf_* settings that config.json declares', () => {
        for (const setting of group.settings.filter(item => item.id)) {
            assert.ok(setting.id.startsWith('rf_'), setting.id);
            assert.ok(setting.id in config.settings, `${setting.id} is in config.json's settings`);
        }
    });

    it('has a translation for every string, and keeps its translations before the last stock key', () => {
        const strings = [group.name, ...group.settings.flatMap(setting => [setting.content, setting.label])].filter(Boolean);
        for (const key of strings) assert.ok(translations[key]?.default, `${key} has a default translation`);
        const keys = Object.keys(translations);
        assert.ok(!keys[keys.length - 1].startsWith('i18n.Rf'), 'the last translation is a stock key');
    });
});

describe('lang/en.json: the reelflies slots', () => {
    const lang = json('lang/en.json');
    const text = lines('lang/en.json');

    it('has a reelflies key, before the last stock key, with one sub-object per module in order', () => {
        const keys = Object.keys(lang);
        assert.ok(keys.includes('reelflies'));
        assert.notEqual(keys[keys.length - 1], 'reelflies');
        assert.deepEqual(Object.keys(lang.reelflies), LANG_MODULES);
    });

    it('opens each module with its placeholder, and a blank line between modules', () => {
        for (const module of LANG_MODULES) {
            assert.equal(Object.keys(lang.reelflies[module])[0], '_slot', `${module} starts with _slot`);
            assert.equal(lang.reelflies[module]._slot, '', `${module}'s _slot is empty`);
        }
        const opening = text.findIndex(line => /^ {4}"reelflies": \{$/.test(line));
        for (const module of LANG_MODULES.slice(1)) {
            const at = text.findIndex((line, index) => index > opening && line === `        "${module}": {`);
            assert.equal(text[at - 1].trim(), '', `a blank line before ${module}`);
        }
    });
});

describe('the ReelFlies style layer', () => {
    const index = lines('assets/scss/reelflies/_index.scss');
    const imports = index
        .map(line => /^(\/\/ )?@import "([a-z0-9-]+)"; \/\/ (\d+) /.exec(line))
        .filter(Boolean)
        .map(([, commented, partial, ticket]) => ({ commented: Boolean(commented), partial, ticket: Number(ticket) }));

    it('lists one import per module in ticket order, each a slot until its ticket uncomments it', () => {
        assert.ok(imports.length >= 20);
        const tickets = imports.map(entry => entry.ticket);
        assert.deepEqual(tickets, [...tickets].sort((a, b) => a - b));
        assert.equal(new Set(imports.map(entry => entry.partial)).size, imports.length, 'each partial once');
        for (const entry of imports.filter(item => !item.commented)) {
            assert.ok(fs.existsSync(path.join(THEME_DIR, `assets/scss/reelflies/_${entry.partial}.scss`)), `_${entry.partial}.scss exists`);
        }
    });

    it('separates the slots with blank lines', () => {
        const at = index.map((line, number) => (/@import "/.test(line) ? number : -1)).filter(number => number >= 0);
        for (const number of at.slice(1)) assert.equal(index[number - 1].trim(), '', `a blank line before line ${number + 1}`);
    });

    it('is imported by theme.scss: the settings after the stock settings, the index last', () => {
        const theme = lines('assets/scss/theme.scss').filter(line => line.startsWith('@import'));
        const settings = theme.findIndex(line => line.startsWith('@import "reelflies/settings"'));
        assert.equal(theme[settings - 1], '@import "settings/layouts/layouts"; // 4');
        assert.match(theme[theme.length - 1], /^@import "reelflies\/index";/);
        assert.equal(theme.filter(line => line.includes('"reelflies/')).length, 2);
    });
});

// A slot list split at its blank lines: group i is the i-th ticket's slot. An empty slot is the
// ticket's one comment line. A ticket fills it by replacing that line with its own lines, or by
// keeping the comment and adding its lines right under it. So a group that doesn't start with a
// slot comment is a filled slot, and a slot comment anywhere else in a group means a blank line
// between two slots has gone, which brings back the adjacent-line conflicts section 6.1 prevents.
function slotProblems(body, tickets, slotComment) {
    const groups = body.reduce((list, line) => {
        if (line.trim() === '') {
            if (list[list.length - 1].length) list.push([]);
        } else {
            list[list.length - 1].push(line);
        }
        return list;
    }, [[]]).filter(group => group.length);
    const problems = [];
    if (groups.length !== tickets.length) {
        problems.push(`${groups.length} slots, not ${tickets.length} (tickets ${tickets.join(', ')}): keep one blank line between slots`);
    }
    groups.forEach((group, index) => {
        group.forEach((line, at) => {
            const ticket = slotComment.exec(line)?.[1];
            if (!ticket) return;
            if (at > 0) problems.push(`ticket ${ticket}'s slot has no blank line before it`);
            else if (Number(ticket) !== tickets[index]) problems.push(`slot ${index + 1} is ticket ${ticket}'s, not ticket ${tickets[index]}'s: keep ticket order`);
        });
    });
    return problems;
}

const JS_SLOT = /^\s*\/\/ (\d+) \S/;
const TEMPLATE_SLOT = /^\{\{!-- (\d+) .*--\}\}$/;

// The lines of a `name = [ … ];` array literal, between its brackets.
function arrayBody(file, name) {
    const text = lines(file);
    const start = text.findIndex(line => new RegExp(`\\b${name} = \\[$`).test(line));
    assert.ok(start >= 0, `${file} has ${name}`);
    const end = text.findIndex((line, index) => index > start && line === '];');
    return text.slice(start + 1, end);
}

describe('the JavaScript and template slots', () => {
    const PAGE_MODULES = 'assets/js/theme/reelflies/page-modules.js';

    for (const [name, tickets] of [['product', [37, 38, 42]], ['listing', [31, 32, 33, 42, 43]], ['cart', [41]], ['page', [35]]]) {
        it(`page-modules.js: the ${name} array has one slot per module, in ticket order, with blank lines between`, () => {
            assert.deepEqual(slotProblems(arrayBody(PAGE_MODULES, name), tickets, JS_SLOT), []);
        });
    }

    it('reelflies/global.js: GLOBAL_MODULES has one slot per module, in ticket order, with blank lines between', () => {
        assert.deepEqual(slotProblems(arrayBody('assets/js/theme/reelflies/global.js', 'GLOBAL_MODULES'), [27, 28, 30, 52], JS_SLOT), []);
    });

    it('js-settings.html: one slot per switch ticket, in ticket order, with blank lines between', () => {
        const text = lines('templates/components/reelflies/js-settings.html');
        const body = text.slice(text.indexOf('--}}') + 1);
        assert.deepEqual(slotProblems(body, [27, 31, 39, 40, 42, 43, 52], TEMPLATE_SLOT), []);
    });

    it('the slot check accepts a filled slot and catches a lost blank line or a slot out of order', () => {
        const slots = ['    // 37 size pills', '', '    // 38 add flow', '', '    // 42 cart state'];
        const tickets = [37, 38, 42];
        assert.deepEqual(slotProblems(slots, tickets, JS_SLOT), []);
        const filled = ['    () => import(\'./size-pills\'),', '', '    // 38 add flow', '', '    // 42 cart state', '    () => import(\'./cart-state\'),'];
        assert.deepEqual(slotProblems(filled, tickets, JS_SLOT), []);
        const lostBlank = /ticket 38's slot has no blank line before it/;
        assert.ok(slotProblems(['    // 37 size pills', '    // 38 add flow', '', '    // 42 cart state'], tickets, JS_SLOT).some(problem => lostBlank.test(problem)));
        assert.ok(slotProblems(['    () => import(\'./size-pills\'),', '    // 38 add flow', '', '    // 42 cart state'], tickets, JS_SLOT).some(problem => lostBlank.test(problem)));
        assert.deepEqual(slotProblems(['    // 38 add flow', '', '    // 37 size pills', '', '    // 42 cart state'], tickets, JS_SLOT), [
            'slot 1 is ticket 38\'s, not ticket 37\'s: keep ticket order',
            'slot 2 is ticket 37\'s, not ticket 38\'s: keep ticket order',
        ]);
    });
});

describe('the template and JavaScript hooks', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);

    it('base.html includes js-settings once, inside the inject block, where stencil bundle finds it', () => {
        const base = read('templates/layout/base.html');
        const head = base.slice(0, base.indexOf('</head>'));
        assert.equal(base.split('components/reelflies/js-settings').length - 1, 1);
        assert.ok(head.lastIndexOf('{{~inject') < head.indexOf('components/reelflies/js-settings'), 'after the stock injects');
        assert.ok(bundled(base).includes('components/reelflies/js-settings'));
    });

    it('base.html includes body-start once, right after <body>, where stencil bundle finds it', () => {
        const base = read('templates/layout/base.html');
        assert.match(base, /<body>\n\s*\{\{> components\/reelflies\/body-start\}\}/);
        assert.equal(base.split('components/reelflies/body-start').length - 1, 1);
        assert.ok(bundled(base).includes('components/reelflies/body-start'));
    });

    it('the ReelFlies partials include each other in a form stencil bundle finds', () => {
        for (const file of ['body-start', 'icons']) {
            const source = read(`templates/components/reelflies/${file}.html`);
            const includes = [...source.matchAll(/\{\{~?#?>\s*([^\s}]+)/g)].map(match => match[1]);
            assert.deepEqual(bundled(source), includes, `${file}.html`);
        }
    });

    it('app.js spreads its customClasses from reelflies/page-modules.js', () => {
        const app = read('assets/js/app.js');
        assert.match(app, /^import reelfliesPageModules from '\.\/theme\/reelflies\/page-modules';/m);
        assert.match(app, /^const customClasses = \{ \.\.\.reelfliesPageModules \};/m);
    });

    it('global.js starts reelflies/global.js once, after the stock globals', () => {
        const global = read('assets/js/theme/global.js');
        assert.match(global, /^import reelfliesGlobal from '\.\/reelflies\/global';/m);
        const onReady = global.slice(global.indexOf('onReady() {'), global.lastIndexOf('}'));
        const calls = onReady.split('\n').map(line => line.replace(/\s*\/\/.*$/, '').trim()).filter(line => line.endsWith(';'));
        assert.match(calls[calls.length - 1], /^reelfliesGlobal\(this\.context\);/);
    });
});
