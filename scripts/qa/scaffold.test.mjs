// The ReelFlies scaffold as the redesign keeps it (ticket 25's, on the clean fork of redesign step
// 1; ADR 0001; CUSTOMIZATIONS.md "Where ReelFlies code goes"): one block of rf_* settings in
// config.json, in the groups the schema's headings name; the module switches booleans; the schema
// group with a translation for every string; lang/en.json's reelflies block; the SCSS layer's
// imports; and the upstream hooks that load the ReelFlies files (base.html, header.html,
// footer.html, body.html, app.js and global.js). Seam 5 (spec, Testing Decisions): the release
// guard's fixture for the pre-declared keys, switches and values.
//
// Ticket 25's slot conventions went with the fork: no pre-declared slot lines in page-modules.js,
// global.js or _index.scss, no js-settings.html or body-start.html (head.html and header.html
// carry what they did), no _slot keys in lang, and no menu ids repeated in every variation. Each
// file holds the modules that exist.
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
import { stripHandlebarsComments } from './switches.mjs';

const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
const json = file => JSON.parse(read(file));
const lines = file => read(file).split('\n');

const config = json('config.json');
const schema = json('schema.json');
const group = schema.find(item => item.name === 'i18n.RfReelFlies');
// The settings groups, as the schema's headings cut them: [heading, [ids]], in schema order.
const GROUPS = group.settings.reduce((list, setting) => {
    if (setting.type === 'heading') list.push([setting.content, []]);
    else if (setting.id) list[list.length - 1][1].push(setting.id);
    return list;
}, []);
// The module switches: config.json's boolean rf_* settings (switches.mjs, moduleSwitches).
const SWITCHES = Object.entries(config.settings).filter(([key, value]) => key.startsWith('rf_') && typeof value === 'boolean').map(([key]) => key);
// The pre-declared values that aren't menu ids. Rule 1 guards them like the switches.
const VALUE_KEYS = Object.keys(config.settings).filter(key => key.startsWith('rf_') && !SWITCHES.includes(key) && !MENU_ID_KEYS.includes(key));
const VARIATIONS = ['ReelFlies CA', 'ReelFlies US'];

describe('config.json: the ReelFlies settings block', () => {
    const keys = Object.keys(config.settings);
    const text = lines('config.json');
    const lineOf = key => text.findIndex(line => line.trim().startsWith(`"${key}":`));
    const rf = keys.filter(key => key.startsWith('rf_'));

    it('declares every setting the schema group names, in the schema\'s order, and nothing the schema doesn\'t', () => {
        assert.deepEqual(rf, GROUPS.flatMap(([, ids]) => ids));
        assert.ok(rf.length >= 50, `${rf.length} rf_* settings`);
    });

    it('keeps every rf_* key in one block, right before the last stock key, so each ReelFlies line ends with a comma', () => {
        const at = keys.map((key, index) => (key.startsWith('rf_') ? index : -1)).filter(index => index >= 0);
        assert.deepEqual(at, Array.from({ length: at.length }, (_, offset) => at[0] + offset), 'the rf_* keys are contiguous');
        assert.ok(!keys[keys.length - 1].startsWith('rf_'), 'the last settings key is a stock key');
        assert.equal(at[at.length - 1], keys.length - 2, 'the block sits right before the last stock key');
    });

    it('separates the groups with a blank line, and keeps each group\'s keys together', () => {
        GROUPS.forEach(([heading, ids], index) => {
            const first = lineOf(ids[0]);
            const last = lineOf(ids[ids.length - 1]);
            if (index) assert.equal(text[first - 1].trim(), '', `a blank line before the ${heading} group`);
            for (let line = first; line <= last; line += 1) assert.notEqual(text[line].trim(), '', `no blank line inside the ${heading} group (line ${line + 1})`);
        });
    });

    // Only the switches' type is a convention: a module reads true or false. A value's type is its
    // owner's to choose.
    it('makes the five module switches booleans, and every other rf_* setting a string', () => {
        assert.deepEqual(SWITCHES, ['rf_counts', 'rf_quick_add', 'rf_cart_state', 'rf_size_strip', 'rf_order_line']);
        for (const key of SWITCHES) assert.equal(typeof config.settings[key], 'boolean', key);
        for (const key of VALUE_KEYS) assert.equal(typeof config.settings[key], 'string', `${key} is a string (ids and paths are comma-separated text)`);
        for (const key of MENU_ID_KEYS) assert.equal(typeof config.settings[key], 'string', key);
    });

    it('lets each variation set only what differs there: declared keys, each at its declared type', () => {
        assert.ok(VARIATIONS.every(name => config.variations.some(item => item.name === name)));
        for (const variation of config.variations) {
            for (const [key, value] of Object.entries(variation.settings)) {
                assert.ok(key in config.settings, `${variation.name} sets ${key}, which the base settings declare`);
                assert.equal(typeof value, typeof config.settings[key], `${variation.name}: ${key} has the declared type`);
            }
        }
        assert.deepEqual(config.variations.find(({ name }) => name === 'ReelFlies CA').settings, {}, 'ReelFlies CA is the base settings themselves');
    });

    it('passes stencil-cli\'s full theme config schema', () => {
        assert.deepEqual(validateThemeConfig(config), []);
    });
});

describe('the release guard and step 1 with the pre-declared keys (seam 5)', () => {
    for (const variation of VARIATIONS) {
        const repo = effectiveSettings(config, variation);
        const live = Object.fromEntries(Object.entries(repo).filter(([key]) => !key.startsWith('rf_')));
        // These tests are about the switches and values (rule 1). A variation with menu ids set
        // (ReelFlies US has tree 2's, decision 5) is checked against a tree that holds them, as
        // the release reads its target's tree; rule 2 is release-guard.test.mjs's.
        const tree = menuIdsSet(repo)
            ? MENU_ID_KEYS.flatMap(key => String(repo[key]).split(',')).map(id => id.trim()).filter(Boolean).map(Number)
            : null;

        it(`lets the first push over a stock theme through on ${variation}, listing each switch and value once as new`, () => {
            const result = checkRelease({
                repoSettings: repo, liveSettings: live, channelId: 1895766, categoryIds: tree,
            });
            assert.equal(result.pass, true, result.reasons.join('; '));
            const switches = Object.keys(repo).filter(key => key.startsWith('rf_') && !MENU_ID_KEYS.includes(key)).sort();
            assert.deepEqual([...result.newSwitches].sort(), switches);
            assert.ok(switches.length >= 50);
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

        // After a push, the live theme holds every pre-declared key at the pushed value, which is
        // also the channel's last released value.
        const pushed = repo;
        const another = key => (repo[key] === '5' ? '6' : '5');

        it(`refuses, on ${variation}, a pre-declared value that config.json changes after a push (rule 1)`, () => {
            assert.ok(VALUE_KEYS.length >= 40, `${VALUE_KEYS.length} value keys`);
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
    const translations = json('schemaTranslations.json');

    it('is one group, before the last stock group', () => {
        assert.ok(group, 'schema.json has the ReelFlies group');
        assert.equal(schema.filter(item => item.name === 'i18n.RfReelFlies').length, 1);
        assert.notEqual(schema[schema.length - 1], group);
    });

    it('has one heading per settings module, in the redesign\'s order, with the menu ids first under the menu heading', () => {
        assert.deepEqual(GROUPS.map(([heading]) => heading), [
            'i18n.RfMenu', 'i18n.RfProductCards', 'i18n.RfOrderLine', 'i18n.RfStoreDetails', 'i18n.RfHome', 'i18n.RfHatch',
        ]);
        assert.deepEqual(GROUPS[0][1].slice(0, 2), MENU_ID_KEYS);
        for (const [heading, ids] of GROUPS) assert.ok(ids.length, `${heading} has settings under it`);
    });

    it('only names rf_* settings that config.json declares, each with a label and force_reload, the switches as checkboxes', () => {
        for (const setting of group.settings.filter(item => item.id)) {
            assert.ok(setting.id.startsWith('rf_'), setting.id);
            assert.ok(setting.id in config.settings, `${setting.id} is in config.json's settings`);
            assert.ok(setting.label, `${setting.id} has a label`);
            assert.equal(setting.force_reload, true, `${setting.id} reloads the preview`);
            assert.equal(setting.type, SWITCHES.includes(setting.id) ? 'checkbox' : 'text', setting.id);
        }
    });

    it('has a translation for every string, and keeps its translations before the last stock key', () => {
        const strings = [group.name, ...group.settings.flatMap(setting => [setting.content, setting.label])].filter(Boolean);
        for (const key of strings) assert.ok(translations[key]?.default, `${key} has a default translation`);
        const keys = Object.keys(translations);
        assert.ok(!keys[keys.length - 1].startsWith('i18n.Rf'), 'the last translation is a stock key');
    });
});

describe('lang/en.json: the reelflies block', () => {
    const lang = json('lang/en.json');

    it('has a reelflies key, before the last stock key, with one object per module', () => {
        const keys = Object.keys(lang);
        assert.ok(keys.includes('reelflies'));
        assert.notEqual(keys[keys.length - 1], 'reelflies');
        const modules = Object.keys(lang.reelflies);
        assert.ok(modules.length >= 20, modules.join(', '));
        for (const module of modules) {
            assert.match(module, /^[a-z][a-z_]*$/, `${module} is a module name`);
            assert.equal(typeof lang.reelflies[module], 'object', `${module} is an object`);
            assert.ok(Object.keys(lang.reelflies[module]).length, `${module} has strings`);
            assert.ok(!('_slot' in lang.reelflies[module]), `${module} has no scaffold placeholder`);
        }
    });

    it('holds the modules the redesign\'s pages read', () => {
        for (const module of ['strip', 'nav', 'header', 'search', 'menu', 'species', 'card', 'home', 'hatch', 'js', 'months', 'footer', 'box', 'product', 'cart', 'listing', 'page', 'not_found', 'hub', 'chart']) {
            assert.ok(module in lang.reelflies, module);
        }
    });
});

describe('the ReelFlies style layer', () => {
    const index = lines('assets/scss/reelflies/_index.scss');
    const imports = index.map(line => /^@import "([a-z0-9-]+)";/.exec(line)).filter(Boolean).map(([, partial]) => partial);

    it('imports each partial once, the foundation first, and every one exists', () => {
        assert.ok(imports.length >= 10, imports.join(', '));
        assert.equal(imports[0], 'foundation');
        assert.equal(new Set(imports).size, imports.length, 'each partial once');
        for (const partial of imports) assert.ok(fs.existsSync(path.join(THEME_DIR, `assets/scss/reelflies/_${partial}.scss`)), `_${partial}.scss exists`);
        assert.ok(!index.some(line => /^\/\/ @import/.test(line)), 'no commented-out slot import');
    });

    it('is imported by theme.scss: the settings after the stock settings, the index last', () => {
        const theme = lines('assets/scss/theme.scss').filter(line => line.startsWith('@import'));
        const settings = theme.findIndex(line => line.startsWith('@import "reelflies/settings"'));
        assert.match(theme[settings - 1], /^@import "settings\/layouts\/layouts"; \/\/ 4/);
        assert.match(theme[theme.length - 1], /^@import "reelflies\/index";/);
        assert.equal(theme.filter(line => line.includes('"reelflies/')).length, 2);
    });
});

describe('the page modules', () => {
    const source = read('assets/js/theme/reelflies/page-modules.js');

    it('key each loader by a page template that exists, and load every module as its own chunk', () => {
        const templates = [...source.matchAll(/^ {4}'(pages\/[a-z0-9/-]+)':/gm)].map(match => match[1]);
        assert.ok(templates.includes('pages/home') && templates.includes('pages/product') && templates.includes('pages/cart') && templates.includes('pages/category'), templates.join(', '));
        for (const template of templates) assert.ok(fs.existsSync(path.join(THEME_DIR, 'templates', `${template}.html`)), `templates/${template}.html exists`);
        const chunks = [...source.matchAll(/webpackChunkName: "([a-z0-9-]+)"/g)].map(match => match[1]);
        assert.ok(chunks.length >= 5, chunks.join(', '));
        for (const chunk of chunks) assert.match(chunk, /^rf-/, `${chunk} is a ReelFlies chunk`);
        assert.doesNotMatch(source, /^\s*\/\/ \d+ \S/m, 'no scaffold slot line');
    });

    it('start on every page from reelflies/global.js, whose GLOBAL_MODULES each load a chunk', () => {
        const global = read('assets/js/theme/reelflies/global.js');
        const body = global.slice(global.indexOf('export const GLOBAL_MODULES = ['), global.indexOf('];', global.indexOf('export const GLOBAL_MODULES = [')));
        const chunks = [...body.matchAll(/webpackChunkName: "([a-z0-9-]+)"/g)].map(match => match[1]);
        assert.ok(chunks.length >= 3, chunks.join(', '));
        assert.doesNotMatch(body, /^\s*\/\/ \d+ \S/m, 'no scaffold slot line');
    });
});

describe('the template and JavaScript hooks', () => {
    const bundled = source => [...source.matchAll(templateAssembler.partialRegex)].map(match => match[1]);

    it('base.html includes head once, inside <head> after the fonts collection, where stencil bundle finds it', () => {
        const base = read('templates/layout/base.html');
        const head = base.slice(0, base.indexOf('</head>'));
        assert.equal(base.split('components/reelflies/head}}').length - 1, 1);
        assert.ok(head.includes('components/reelflies/head'), 'inside <head>');
        assert.ok(head.indexOf('getFontsCollection') < head.indexOf('components/reelflies/head'), 'after the fonts collection');
        assert.ok(head.indexOf('components/reelflies/head') < head.indexOf("stylesheet '/assets/css/theme.css'"), 'before the stylesheet');
        assert.ok(bundled(base).includes('components/reelflies/head'));
        assert.ok(!base.includes('js-settings') && !base.includes('body-start'), 'ticket 25\'s js-settings and body-start are gone');
    });

    it('header.html and footer.html hand the stock <header> and <footer> to the ReelFlies partials', () => {
        const header = read('templates/components/common/header.html');
        assert.equal(header.split('components/reelflies/header}}').length - 1, 1);
        assert.doesNotMatch(stripHandlebarsComments(header), /<header[\s>]/, 'no stock <header> outside the hook\'s comment');
        assert.ok(bundled(header).includes('components/reelflies/header'));
        const footer = read('templates/components/common/footer.html');
        assert.equal(footer.split('components/reelflies/footer}}').length - 1, 1);
        assert.doesNotMatch(stripHandlebarsComments(footer), /<footer[\s>]/, 'no stock <footer> outside the hook\'s comment');
        assert.ok(bundled(footer).includes('components/reelflies/footer'));
    });

    it('body.html names the templates that get a <main>, the redesign\'s pages among them', () => {
        const body = read('templates/components/common/body.html');
        const named = body.match(/assignVar 'rf_main_templates' '([^']+)'/)[1].split(',');
        for (const template of ['pages/home', 'pages/product', 'pages/cart', 'pages/category', 'pages/search', 'pages/errors/404', 'pages/custom/page/hook-size-chart']) {
            assert.ok(named.includes(template), template);
        }
        for (const template of named) assert.ok(fs.existsSync(path.join(THEME_DIR, 'templates', `${template}.html`)), `templates/${template}.html exists`);
    });

    it('the ReelFlies partials include each other in a form stencil bundle finds', () => {
        for (const file of ['head', 'header', 'footer', 'home', 'hatch-chart', 'fly', 'icons']) {
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
