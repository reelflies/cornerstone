// Tests scripts/widgets/source.mjs (ticket 46): reading a widget and its per-channel file from
// widgets/<name>/, inlining widgets/_shared/ partials, and writing back the recorded uuids.
//
//   node --test scripts/widgets/source.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderWidget } from '../qa/render/render.mjs';
import {
    SYNC_CHANNELS, WIDGETS_DIR, entriesFor, inlineShared, readChannelFile, readWidget, setPlacementStatus, stripComments, writeUuids,
} from './source.mjs';

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

test('a widget\'s schema and query are what the store gets, and its template without its Handlebars comments', () => {
    const { root } = widgetsRoot('rf-x', { template: '{{!-- a note --}}<p>{{text}}</p>' });
    fs.writeFileSync(path.join(root, 'rf-x', 'query.graphql'), 'query Q { site { settings { storeName } } }\n');
    const widget = readWidget('rf-x', { root });
    assert.equal(widget.query, 'query Q { site { settings { storeName } } }');
    assert.equal(widget.template, '<p>{{text}}</p>');
});

// The store refused the hero, whose comment names <width>, <path> and <channel>, with "422:
// template: is not valid HTML" (2026-10-07). A comment renders nothing, so the store gets none.
test('comments are dropped as Handlebars drops them, so the store renders what the fixture renderer renders', async () => {
    const template = [
        '{{!--',
        '    A note naming <width>, <path> and }} inside a block comment.',
        '--}}',
        '<div class="rf-x">',
        '    {{! a short note }}',
        '    <p>{{text}}{{!-- mid-line --}}!</p>',
        '    <p>{{~! trims the space before ~}}  {{text}}</p>',
        '  {{!-- standalone, indented --}}  ',
        '</div>',
        '{{! last line, no newline }}',
    ].join('\n');
    assert.equal(stripComments(template), [
        '<div class="rf-x">',
        '    <p>{{text}}!</p>',
        '    <p>{{text}}</p>',
        '</div>',
        '',
    ].join('\n'));
    const { root } = widgetsRoot('rf-x', { template });
    const stripped = fs.mkdtempSync(path.join(tmp, 'stripped-'));
    fs.mkdirSync(path.join(stripped, 'rf-x'));
    fs.writeFileSync(path.join(stripped, 'rf-x', 'template.html'), readWidget('rf-x', { root }).template);
    const fixture = { configuration: { text: 'Hello' } };
    assert.equal(await renderWidget('rf-x', fixture, { root: stripped }), await renderWidget('rf-x', fixture, { root }));
});

test('an escaped \\{{! … }} is text, not a comment, and stays', async () => {
    const template = '<p>\\{{! shown as typed }} {{text}}</p>\n';
    assert.equal(stripComments(template), template);
    const { root } = widgetsRoot('rf-x', { template });
    assert.match(await renderWidget('rf-x', { configuration: { text: 'Hello' } }, { root }), /\{\{! shown as typed \}\} Hello/);
});

test('the hero the store gets has no comments, renders as its fixture does, and closes its <img>', async () => {
    const hero = readWidget('home-lead');
    assert.doesNotMatch(hero.template, /\{\{~?!/);
    assert.match(hero.template, /<img\b[^>]*\/>/);
    const stripped = fs.mkdtempSync(path.join(tmp, 'hero-'));
    fs.mkdirSync(path.join(stripped, 'home-lead'));
    fs.writeFileSync(path.join(stripped, 'home-lead', 'template.html'), hero.template);
    const fixture = JSON.parse(fs.readFileSync(path.join(WIDGETS_DIR, 'home-lead', 'fixtures', 'default.json'), 'utf8'));
    assert.equal(await renderWidget('home-lead', fixture, { root: stripped }), await renderWidget('home-lead', fixture));
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
