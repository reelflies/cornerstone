// Tests scripts/widgets/source.mjs (ticket 46): reading a widget and its per-channel file from
// widgets/<name>/, inlining widgets/_shared/ partials, and writing back the recorded uuids.
//
//   node --test scripts/widgets/source.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { renderWidget } from '../qa/render/render.mjs';
import {
    SYNC_CHANNELS, WIDGETS_DIR, emptyComments, entriesFor, inlineShared, readChannelFile, readWidget, setPlacementStatus, writeUuids,
} from './source.mjs';

const require = createRequire(import.meta.url);
// The Handlebars build Paper renders with (config.json's handlebars_v4), to read a template's comments.
const Handlebars = require('@bigcommerce/handlebars-v4'); // eslint-disable-line import/no-extraneous-dependencies

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widgets-source-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const RENDER_FIXTURES = path.resolve('scripts/qa/render/fixtures/widgets');
const UUID = 'c0ffee00-1234-4abc-8def-0123456789ab';

// A widgets folder of its own, with one widget and its 1895766 file.
function widgetsRoot(name, { channel = {}, template = '<p class="rf-x">{{text}}</p>', schema } = {}) {
    const root = fs.mkdtempSync(path.join(tmp, 'root-'));
    const dir = path.join(root, 'rf-x');
    fs.mkdirSync(path.join(dir, 'channels'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'template.html'), template);
    fs.writeFileSync(path.join(dir, 'schema.json'), JSON.stringify(schema ?? [{
        type: 'tab',
        label: 'Content',
        sections: [{
            label: 'Text',
            settings: [{
                type: 'input', label: 'Text', id: 'text', default: '',
            }],
        }],
    }]));
    const file = {
        channel_id: 1895766,
        configuration: { text: 'Hello' },
        placement: {
            template_file: 'pages/home', region: 'home_below_menu', sort_order: 0, status: 'inactive',
        },
        uuids: { template: null, widget: null, placement: null },
        ...channel,
    };
    fs.writeFileSync(path.join(dir, 'channels', '1895766.json'), `${JSON.stringify(file, null, 4)}\n`);
    return { root, dir, name };
}

test('the sync targets ReelFlies_CA only: ticket 53 adds channel 1', () => {
    assert.deepEqual(SYNC_CHANNELS, [1895766]);
});

test('the hero reads as rf-home-lead, with its schema and no storefront query', () => {
    const widget = readWidget('home-lead');
    assert.equal(widget.templateName, 'rf-home-lead');
    assert.equal(widget.widgetName, 'rf-home-lead');
    assert.equal(widget.query, '');
    assert.ok(Array.isArray(widget.schema));
    assert.match(widget.template, /<h1 class="rf-hero__heading">\{\{heading\}\}<\/h1>/);
    assert.equal(widget.dir, path.join(WIDGETS_DIR, 'home-lead'));
});

test('the hero\'s 1895766 file sets every schema field and nothing else, and records no uuids yet', () => {
    const widget = readWidget('home-lead');
    const channelFile = readChannelFile(widget, 1895766);
    const ids = widget.schema.flatMap(tab => tab.sections.flatMap(section => section.settings.map(setting => setting.id))).sort();
    assert.deepEqual(Object.keys(channelFile.configuration).sort(), ids);
    assert.equal(channelFile.channel, 1895766);
    assert.deepEqual(channelFile.placement, {
        template_file: 'pages/home', region: 'home_below_menu', sort_order: 0, status: 'inactive',
    });
});

test('a widget\'s schema and query are what the store gets, and its template with each comment emptied', () => {
    const { root } = widgetsRoot('rf-x', { template: '{{!-- a note --}}<p>{{text}}</p>' });
    fs.writeFileSync(path.join(root, 'rf-x', 'query.graphql'), 'query Q { site { settings { storeName } } }\n');
    const widget = readWidget('rf-x', { root });
    assert.equal(widget.query, 'query Q { site { settings { storeName } } }');
    assert.equal(widget.template, '{{!}}<p>{{text}}</p>');
});

// Renders `template` as the fixture renderer does and as the store would, from the copy readWidget
// gives the store, and returns both renders and that copy.
async function renderBoth(template, configuration = { text: 'Hello' }) {
    const { root } = widgetsRoot('rf-x', { template });
    const stored = readWidget('rf-x', { root }).template;
    const copy = fs.mkdtempSync(path.join(tmp, 'stored-'));
    fs.mkdirSync(path.join(copy, 'rf-x'));
    fs.writeFileSync(path.join(copy, 'rf-x', 'template.html'), stored);
    const fixture = { configuration };
    return { stored, fixture: await renderWidget('rf-x', fixture, { root }), store: await renderWidget('rf-x', fixture, { root: copy }) };
}

// The comments in a template as Handlebars parses them: each one's text and ~ flags.
const commentsIn = template => {
    const found = [];
    const walk = node => {
        if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') {
            if (node.type === 'CommentStatement') found.push({ value: node.value, strip: node.strip });
            Object.entries(node).forEach(([key, value]) => key !== 'loc' && walk(value));
        }
    };
    walk(Handlebars.parseWithoutProcessing(template));
    return found;
};

test('each comment is emptied to {{!}} with its ~ flags, so the store renders exactly what the fixture renderer renders', async () => {
    const template = [
        '{{!--',
        '    A note naming <width>, <path> and }} inside a block comment.',
        '--}}',
        '<div class="rf-x">',
        '    <p>{{text}}{{!-- mid-line --}}!</p>',
        '    <p>{{~! trims the space before ~}}  {{text}}</p>',
        '  {{~!-- trims before only --}}  ',
        '</div>',
    ].join('\n');
    assert.equal(emptyComments(template), [
        '{{!}}',
        '<div class="rf-x">',
        '    <p>{{text}}{{!}}!</p>',
        '    <p>{{~!~}}  {{text}}</p>',
        '  {{~!}}  ',
        '</div>',
    ].join('\n'));
    // The reviewers' cases (PR #46), each rendered both ways: empty and dash-only comments, ~ beside
    // a standalone comment or a mustache, comments sharing a line with a block tag or {{else}},
    // escapes, a "{{! … }}" in a string, CRLF, a non-breaking space, and a template that is only a comment.
    const cases = [
        template,
        '{{!--}}<p>{{text}}</p>{{!-- note --}}\n',
        '<b>{{text}}</b>{{!---}}<p>{{text}}</p>{{!-- later --}}',
        '<p>a</p> \n {{~!-- trim --}}\n<p>{{text}}</p>\n',
        '<p>a</p>\n  {{! c ~}}  \n<p>{{text}}</p>\n',
        '<div>\n    {{~! note }}\n</div>',
        '<div>\n    {{!-- note --~}}\n</div>',
        '<p>\n{{! a }}\n   {{~! b }}x',
        '<p>{{text~}}{{! c }}  x</p>',
        '<div>\n{{! c }}{{#if text}}\n  <p>{{text}}</p>\n{{/if}}\n</div>',
        '{{#if text}}{{! yes }}\n<p>{{text}}</p>\n{{else}}{{!-- no --}}\n<p>none</p>\n{{/if}}\n',
        '<p>\\{{! shown as typed }} {{text}}</p>\n',
        '<p>\\\\{{! hidden }} {{text}}</p>\n',
        '\\{{!-- a }} <b>{{text}}</b> {{!-- real <x> --}}',
        '<p>{{concat text "{{! x }}"}}</p>',
        '<p>a</p>\r\n{{! c }}\r\n<p>{{text}}</p>\r\n',
        '<p>a</p>\n {{! c }}\n<p>{{text}}</p>\n',
        '{{!-- only --}}',
    ];
    for (const source of cases) {
        const { stored, fixture, store } = await renderBoth(source); // eslint-disable-line no-await-in-loop
        assert.equal(store, fixture, `renders differently: ${JSON.stringify(source)}`);
        const original = commentsIn(source);
        const emptied = commentsIn(stored);
        assert.deepEqual(emptied.map(comment => comment.strip), original.map(comment => comment.strip), `~ flags: ${JSON.stringify(source)}`);
        assert.ok(emptied.every(comment => comment.value === ''), `a comment keeps text: ${JSON.stringify(stored)}`);
    }
    const loop = await renderBoth('<ul>\n{{#each items}}{{! one per item }}\n<li>{{this}}</li>\n{{/each}}\n</ul>\n', { items: ['1', '2'] });
    assert.equal(loop.store, loop.fixture);
});

test('a _shared partial\'s comments are emptied too, after it is inlined', async () => {
    const { root } = widgetsRoot('rf-x', { template: '<p>{{> _shared/rf-note text=text}}</p>\n' });
    fs.mkdirSync(path.join(root, '_shared'));
    fs.writeFileSync(path.join(root, '_shared', 'rf-note.html'), '{{!-- the note <b> --}}\n<em>{{text}}</em>\n');
    const stored = readWidget('rf-x', { root }).template;
    assert.ok(stored.includes('{{#*inline "_shared/rf-note"}}\n{{!}}\n<em>{{text}}</em>\n{{/inline}}'), stored);
    const copy = fs.mkdtempSync(path.join(tmp, 'stored-'));
    fs.mkdirSync(path.join(copy, 'rf-x'));
    fs.writeFileSync(path.join(copy, 'rf-x', 'template.html'), stored);
    const fixture = { configuration: { text: 'Hello' } };
    assert.equal(await renderWidget('rf-x', fixture, { root: copy }), await renderWidget('rf-x', fixture, { root }));
});

test('every widget, with each of its fixtures, renders from the store\'s copy as from its files', async () => {
    const names = fs.readdirSync(WIDGETS_DIR).filter(name => !name.startsWith('_') && fs.existsSync(path.join(WIDGETS_DIR, name, 'template.html')));
    assert.ok(names.includes('home-lead'));
    for (const name of names) {
        const stored = readWidget(name).template;
        assert.ok(commentsIn(stored).every(comment => comment.value === ''), `${name}: a comment keeps text`);
        const copy = fs.mkdtempSync(path.join(tmp, `${name}-`));
        fs.mkdirSync(path.join(copy, name));
        fs.writeFileSync(path.join(copy, name, 'template.html'), stored);
        const dir = path.join(WIDGETS_DIR, name, 'fixtures');
        const fixtures = fs.existsSync(dir) ? fs.readdirSync(dir).filter(file => file.endsWith('.json')) : [];
        assert.ok(fixtures.length, `${name} has no fixture`);
        for (const file of fixtures) {
            const fixture = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
            // eslint-disable-next-line no-await-in-loop
            assert.equal(await renderWidget(name, fixture, { root: copy }), await renderWidget(name, fixture), `${name} with ${file}`);
        }
    }
});

test('the hero closes its <img>, as BigCommerce\'s examples do', () => {
    assert.match(readWidget('home-lead').template, /<img\b[^>]*\/>/);
});

test('a widget without template.html or schema.json, or with a schema that isn\'t an array, is refused', () => {
    const { root } = widgetsRoot('rf-x');
    assert.throws(() => readWidget('rf-none', { root }), /widgets\/rf-none\/template\.html doesn't exist/);
    fs.writeFileSync(path.join(root, 'rf-x', 'schema.json'), '{"type": "tab"}');
    assert.throws(() => readWidget('rf-x', { root }), /schema\.json must be a JSON array/);
    fs.rmSync(path.join(root, 'rf-x', 'schema.json'));
    assert.throws(() => readWidget('rf-x', { root }), /schema\.json/);
    assert.throws(() => readWidget('_shared', { root }), /isn't a widget name/);
    assert.throws(() => readWidget('../x', { root }), /isn't a widget name/);
});

test('a channel file is checked before anything is read from the store', () => {
    const cases = [
        [{ channel_id: 1 }, /channel_id 1 isn't the file's own channel 1895766/],
        [{ channel_id: '1895766' }, /channel_id "1895766" isn't the file's own channel 1895766/],
        [{ configuration: [] }, /configuration must be an object/],
        [{ configuration: { text: 'x', extra: 'y' } }, /configuration sets "extra", which the schema doesn't have/],
        [{ configuration: {} }, /configuration doesn't set "text"/],
        [{ configuration: { text: 'x', nested: { channel_id: 1 } } }, /names channel 1/],
        [{
            placement: {
                template_file: 'pages/home', region: 'home_below_menu', sort_order: 0, status: 'live',
            },
        }, /placement status must be "active" or "inactive"/],
        [{
            placement: {
                template_file: 'pages/home', region: '', sort_order: 0, status: 'active',
            },
        }, /placement needs a region/],
        [{
            placement: {
                template_file: 'pages/home', region: 'home_below_menu', sort_order: 1.5, status: 'active',
            },
        }, /sort_order must be a whole number/],
        [{ uuids: { template: 'not-a-uuid', widget: null, placement: null } }, /uuids\.template must be null or a uuid/],
        [{ uuids: { template: null, widget: null } }, /uuids needs template, widget and placement/],
    ];
    for (const [channel, error] of cases) {
        const { root } = widgetsRoot('rf-x', { channel });
        const widget = readWidget('rf-x', { root });
        assert.throws(() => readChannelFile(widget, 1895766), error, JSON.stringify(channel));
    }
});

test('a widget with no file for the channel isn\'t synced there', () => {
    const { root } = widgetsRoot('rf-x');
    const widget = readWidget('rf-x', { root });
    assert.equal(readChannelFile(widget, 1), null);
    assert.deepEqual(entriesFor(1, { root }), []);
    assert.deepEqual(entriesFor(1895766, { root }).map(entry => entry.widget.name), ['rf-x']);
});

test('--widget names must exist and have a file for the channel', () => {
    const { root } = widgetsRoot('rf-x');
    assert.throws(() => entriesFor(1895766, { root, names: ['rf-missing'] }), /no widget rf-missing in widgets\//);
    assert.throws(() => entriesFor(1, { root, names: ['rf-x'] }), /rf-x has no channels\/1\.json/);
});

test('the real widgets folder has the hero on 1895766', () => {
    assert.ok(entriesFor(1895766).some(entry => entry.widget.name === 'home-lead'));
});

test('_shared partials are inlined as inline partials, so the store renders what the fixture renderer renders', async () => {
    const source = fs.readFileSync(path.join(RENDER_FIXTURES, 'rf-render-band', 'template.html'), 'utf8');
    const inlined = inlineShared(source, RENDER_FIXTURES);
    assert.ok(inlined.startsWith(source), 'the template is kept as it is');
    assert.match(inlined.slice(source.length), /^\{\{#\*inline "_shared\/rf-render-price"\}\}\n[\s\S]*\n\{\{\/inline\}\}\n$/);
    assert.ok(inlined.includes('{{> _shared/rf-render-price price=node.prices.price}}'), 'the call is kept, with its hash arguments');
    // Rendered with no _shared folder at all, the inlined template gives the same HTML.
    const empty = fs.mkdtempSync(path.join(tmp, 'no-shared-'));
    fs.mkdirSync(path.join(empty, 'rf-inlined'));
    fs.writeFileSync(path.join(empty, 'rf-inlined', 'template.html'), inlined);
    const fixture = JSON.parse(fs.readFileSync(path.join(RENDER_FIXTURES, 'rf-render-band', 'fixtures', 'two-in-stock.json'), 'utf8'));
    assert.equal(await renderWidget('rf-inlined', fixture, { root: empty }), await renderWidget('rf-render-band', fixture, { root: RENDER_FIXTURES }));
});

test('a template that includes anything but a _shared partial, or a missing one, is refused', () => {
    const { root } = widgetsRoot('rf-x');
    assert.throws(() => inlineShared('{{> components/products/card}}', root), /a store widget can't include the theme partial components\/products\/card/);
    assert.throws(() => inlineShared('{{> _shared/rf-nope}}', root), /widgets\/_shared\/rf-nope\.html doesn't exist/);
    assert.equal(inlineShared('<p>{{text}}</p>', root), '<p>{{text}}</p>');
});

test('recorded uuids and a placement status are written back into the channel file, and nothing else changes', () => {
    const { root } = widgetsRoot('rf-x');
    const widget = readWidget('rf-x', { root });
    const channelFile = readChannelFile(widget, 1895766);
    const before = JSON.parse(fs.readFileSync(channelFile.file, 'utf8'));
    writeUuids(channelFile, { template: UUID, widget: null, placement: null });
    const after1 = JSON.parse(fs.readFileSync(channelFile.file, 'utf8'));
    assert.deepEqual(after1, { ...before, uuids: { template: UUID, widget: null, placement: null } });
    assert.ok(fs.readFileSync(channelFile.file, 'utf8').endsWith('}\n'));
    setPlacementStatus(readChannelFile(widget, 1895766), 'active');
    assert.equal(readChannelFile(widget, 1895766).placement.status, 'active');
    assert.throws(() => setPlacementStatus(readChannelFile(widget, 1895766), 'gone'), /"active" or "inactive"/);
});
