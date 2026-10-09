// Tests scripts/widgets/source.mjs (ticket 46): reading a widget and its per-channel file from
// widgets/<name>/, emptying the template's comments, pasting widgets/_shared/ partials
// (paste.mjs), and writing back the recorded uuids. Every store copy is rendered with the
// store's engine, Handlebars 3 (engine.mjs).
//
//   node --test scripts/widgets/source.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { WIDGET_ENGINE, renderWidget, widgetCases } from '../qa/render/render.mjs';
import { Handlebars3, STORE_ENGINE } from './engine.mjs';
import { pasteShared } from './paste.mjs';
import {
    PLACEMENT_STATUSES, SYNC_CHANNELS, WIDGETS_DIR, emptyComments, entriesFor, placementsOf, readChannelFile, readWidget, setPlacementStatus, writeUuids,
} from './source.mjs';

const require = createRequire(import.meta.url);
// Handlebars 4's parser, for parseWithoutProcessing, to read a template's comments where they are written.
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

test('the hero\'s 1895766 file sets every schema field and nothing else, records the uuids its first apply made, and has a status', () => {
    const widget = readWidget('home-lead');
    const channelFile = readChannelFile(widget, 1895766);
    const ids = widget.schema.flatMap(tab => tab.sections.flatMap(section => section.settings.map(setting => setting.id))).sort();
    assert.deepEqual(Object.keys(channelFile.configuration).sort(), ids);
    assert.equal(channelFile.channel, 1895766);
    // Active since checkpoint 02. The status isn't pinned: an R12 unpublish (ticket 57) sets it
    // inactive in a PR that must pass CI; --verify compares it with the store.
    const { status, ...placement } = channelFile.placement;
    assert.deepEqual(placement, { template_file: 'pages/home', region: 'home_below_menu', sort_order: 0 });
    assert.ok(PLACEMENT_STATUSES.includes(status), status);
    for (const uuid of Object.values(channelFile.uuids)) assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('a widget\'s schema and query are what the store gets, and its template with each comment emptied', () => {
    const { root } = widgetsRoot('rf-x', { template: '{{!-- a note --}}<p>{{text}}</p>' });
    fs.writeFileSync(path.join(root, 'rf-x', 'query.graphql'), 'query Q { site { settings { storeName } } }\n');
    const widget = readWidget('rf-x', { root });
    assert.equal(widget.query, 'query Q { site { settings { storeName } } }');
    assert.equal(widget.template, '{{!}}<p>{{text}}</p>');
});

// A widgets folder holding only `name`, whose template.html is `template`: the store's copy, which
// renderWidget then renders with the store's engine and no _shared partials to include.
function storeCopy(name, template) {
    const root = fs.mkdtempSync(path.join(tmp, 'stored-'));
    fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, name, 'template.html'), template);
    return root;
}

// Renders `template` from its files and from the copy readWidget gives the store, both with the
// store's engine, and returns both renders and that copy.
async function renderBoth(template, configuration = { text: 'Hello' }) {
    const { root } = widgetsRoot('rf-x', { template });
    const stored = readWidget('rf-x', { root }).template;
    const fixture = { configuration };
    return { stored, fixture: await renderWidget('rf-x', fixture, { root }), store: await renderWidget('rf-x', fixture, { root: storeCopy('rf-x', stored) }) };
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

test('each comment is emptied to {{!}} with its ~ flags, so the store copy renders as the files do', async () => {
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
    // escapes, a "{{! … }}" in a string, CRLF, a lone CR, a non-breaking space, and a template that is only a comment.
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
        '<p>a\rb</p>\n<p>{{text}}</p>\n<i>{{text}}</i> {{! c <x> }}\n<p>the last line, long enough to be cut</p>\n',
        '<p>a</p>\r{{! c <x> }}\r<p>{{text}}</p>\r{{!-- d <x> --}}\r',
        '<p>a</p>\r{{! c }}\n<div class="x">{{text}}</div>\n',
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

test('a _shared partial\'s comments never reach the store: its body is pasted without them', async () => {
    const { root } = widgetsRoot('rf-x', { template: '<p>{{> _shared/rf-note text=text}}</p>\n' });
    fs.mkdirSync(path.join(root, '_shared'));
    fs.writeFileSync(path.join(root, '_shared', 'rf-note.html'), '{{!-- the note <b> --}}\n<em>{{text}}</em>\n');
    const stored = readWidget('rf-x', { root }).template;
    assert.equal(stored, '<p>{{!}}{{!}}<em>{{text}}</em>\n{{!}}{{!}}</p>\n');
    const fixture = { configuration: { text: 'Hello' } };
    assert.equal(await renderWidget('rf-x', fixture, { root: storeCopy('rf-x', stored) }), await renderWidget('rf-x', fixture, { root }));
});

test('a partial call inside a comment is neither pasted nor refused: notes may name any partial', async () => {
    const { root } = widgetsRoot('rf-x', { template: '{{!-- built like {{> components/products/card}}, once {{> _shared/old-card}} --}}<p>{{text}}</p>' });
    assert.equal(readWidget('rf-x', { root }).template, '{{!}}<p>{{text}}</p>');
    // In a _shared partial too.
    const shared = widgetsRoot('rf-x', { template: '<p>{{> _shared/rf-note text=text}}</p>\n' }).root;
    fs.mkdirSync(path.join(shared, '_shared'));
    fs.writeFileSync(path.join(shared, '_shared', 'rf-note.html'), '{{!-- built like {{> components/products/card}} --}}\n<em>{{text}}</em>\n');
    const stored = readWidget('rf-x', { root: shared }).template;
    const fixture = { configuration: { text: 'Hello' } };
    assert.equal(await renderWidget('rf-x', fixture, { root: storeCopy('rf-x', stored) }), await renderWidget('rf-x', fixture, { root: shared }));
});

// Handlebars' lexer counts a column short after a U+2028 or U+2029 in a token that spans lines, so
// it places a later comment where the comment isn't. Emptying there would cut markup.
test('a comment Handlebars misplaces is refused, naming the template, rather than emptied in the wrong place', () => {
    for (const template of ['<div>\n{{#if text}}\n<p>Sale\u2028ends {{! note }}soon</p>\n{{/if}}\n</div>\n', '<p>\nab\u2029cd {{! c <x> }} {{text}}</p>\n']) {
        const { root } = widgetsRoot('rf-x', { template });
        assert.throws(() => readWidget('rf-x', { root }), /^Error: widgets\/rf-x\/template\.html: .*U\+2028 or U\+2029/, JSON.stringify(template));
    }
});

test('a template Handlebars 3 can\'t parse is refused, naming its file, with its own line numbers', () => {
    const { root } = widgetsRoot('rf-x', { template: '{{!-- a note\n   over two lines --}}\n<p>{{#if text}}</p>' });
    assert.throws(() => readWidget('rf-x', { root }), /^Error: widgets\/rf-x\/template\.html: Handlebars 3, the store's engine \(handlebars_v3\), can't parse it: Parse error on line 3/);
    // A form only Handlebars 4 has, such as an inline partial, is refused too.
    const inline = widgetsRoot('rf-x', { template: '<p>{{> x}}</p>\n{{#*inline "x"}}<b>{{text}}</b>{{/inline}}\n' }).root;
    assert.throws(() => readWidget('rf-x', { root: inline }), /^Error: widgets\/rf-x\/template\.html: Handlebars 3, .*on line 2/s);
});

test('an error in a _shared partial names the partial file, with the partial\'s own line numbers', () => {
    const { root } = widgetsRoot('rf-x', { template: '<div>\n<p>{{> _shared/rf-note text=text}}</p>\n</div>\n' });
    fs.mkdirSync(path.join(root, '_shared'));
    fs.writeFileSync(path.join(root, '_shared', 'rf-note.html'), '<em>\n{{#if text}}{{text}}</em>\n');
    assert.throws(() => readWidget('rf-x', { root }), /^Error: widgets\/rf-x\/template\.html: widgets\/_shared\/rf-note\.html: Handlebars 3, .*Parse error on line 3:/s);
});

// The void elements in a template that don't close with "/>" (BigCommerce's own examples close
// <img … />; the store doesn't say what its HTML check reads). As the HTML tokenizer (parse5)
// reads a tag: the match steps over quoted attribute values, and "/>" closes the tag only after a
// quote, whitespace or the bare tag name, so an unquoted value can't swallow the "/".
const unclosedVoids = template => (template.match(/<(?:area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi) ?? [])
    .filter(tag => !/(?:^<[a-z]+|["'\s])\/>$/i.test(tag));

test('a void element counts as closed only with "/>" after a quote, whitespace or its bare name', () => {
    assert.deepEqual(
        unclosedVoids('<p>a<br>b<hr><img src="x"><input type="text" ><IMG SRC=x><col span="2"></p>'),
        ['<br>', '<hr>', '<img src="x">', '<input type="text" >', '<IMG SRC=x>', '<col span="2">'],
    );
    // "/ >" isn't a self-closing tag to the tokenizer, an unquoted value takes the "/", and a ">"
    // inside a quoted value doesn't end the tag.
    assert.deepEqual(
        unclosedVoids('<img src="x" / ><br/ ><img src=x/><img src={{text}}/><img alt="a/>b" src="x">'),
        ['<img src="x" / >', '<br/ >', '<img src=x/>', '<img src={{text}}/>', '<img alt="a/>b" src="x">'],
    );
    assert.deepEqual(unclosedVoids([
        '<p>a<br/>b<br />c<img src="x" /><img src="x"/><wbr /><img alt="5 > 3" src="x" />',
        '<img\n    src="x"\n    alt="{{lang \'a\'}}"\n/><input {{#if a}}checked{{/if}} /></p><colgroup></colgroup><b>not void</b>',
    ].join('')), []);
});

// Each widget's store copy, rendered with every fixture, with the engine the store renders it with.
test('every widget has a fixture, and renders from the store\'s copy as from its files under the store\'s engine, with no comment text and its void elements closed', async () => {
    assert.equal(STORE_ENGINE, 'handlebars_v3');
    assert.equal(WIDGET_ENGINE, 'handlebars-v3', 'renderWidget renders with the store\'s engine');
    const cases = widgetCases();
    const widgets = fs.readdirSync(WIDGETS_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('_')).map(entry => entry.name).sort();
    assert.ok(widgets.includes('home-lead'));
    assert.deepEqual([...new Set(cases.map(({ widget }) => widget))].sort(), widgets, 'a widget has no fixture in widgets/<name>/fixtures/');
    const stored = {};
    for (const { widget, name, fixture } of cases) {
        if (!stored[widget]) {
            const { template } = readWidget(widget);
            assert.ok(commentsIn(template).every(comment => comment.value === ''), `${widget}: a comment keeps text`);
            assert.deepEqual(unclosedVoids(template), [], `${widget}: a void element isn't closed with />`);
            assert.doesNotThrow(() => Handlebars3.parse(template), `${widget}: Handlebars 3 can't parse the store copy`);
            stored[widget] = storeCopy(widget, template);
        }
        // eslint-disable-next-line no-await-in-loop
        assert.equal(await renderWidget(widget, fixture, { root: stored[widget] }), await renderWidget(widget, fixture), `${widget} with ${name}`);
    }
});

test('a schema setting can\'t have the id "_", which the store and the renderer give the widget itself', () => {
    const schema = [{
        type: 'tab',
        label: 'Content',
        sections: [{
            label: 'Text',
            settings: [{
                type: 'input', label: 'Text', id: 'text', default: '',
            }, {
                type: 'input', label: 'Note', id: '_', default: '',
            }],
        }],
    }];
    const { root } = widgetsRoot('rf-x', { schema, channel: { configuration: { text: 'hi', _: 'note' } } });
    assert.throws(() => readWidget('rf-x', { root }), /widgets\/rf-x\/schema\.json: the setting id "_" is the store's own key/);
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
                template_file: 'home', region: 'home_below_menu', sort_order: 0, status: 'active',
            },
        }, /placement template_file "home" isn't a template file such as "pages\/home"/],
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

test('_shared partials are pasted in place, so the store copy has no partial and renders as the files do', async () => {
    const source = fs.readFileSync(path.join(RENDER_FIXTURES, 'rf-render-band', 'template.html'), 'utf8');
    const pasted = pasteShared(emptyComments(source), { root: RENDER_FIXTURES });
    assert.doesNotMatch(pasted, /\{\{#?>|\{\{#\*inline/);
    assert.ok(pasted.includes('{{node.name}} {{!}}{{!}}<span class="rf-render-band__price">{{node.prices.price.value}} {{node.prices.price.currencyCode}}</span>\n{{!}}{{!}}</li>'), pasted);
    // Rendered with no _shared folder at all, the pasted template gives the same HTML.
    const empty = fs.mkdtempSync(path.join(tmp, 'no-shared-'));
    fs.mkdirSync(path.join(empty, 'rf-pasted'));
    fs.writeFileSync(path.join(empty, 'rf-pasted', 'template.html'), pasted);
    const fixture = JSON.parse(fs.readFileSync(path.join(RENDER_FIXTURES, 'rf-render-band', 'fixtures', 'two-in-stock.json'), 'utf8'));
    assert.equal(await renderWidget('rf-pasted', fixture, { root: empty }), await renderWidget('rf-render-band', fixture, { root: RENDER_FIXTURES }));
});

test('a template that includes anything but a _shared partial, or a missing one, is refused, naming its file', () => {
    for (const [template, error] of [
        ['<p>{{> components/products/card}}</p>', /^Error: widgets\/rf-x\/template\.html: a store widget can't include the theme partial components\/products\/card/],
        ['<p>{{> _shared/rf-nope}}</p>', /^Error: widgets\/rf-x\/template\.html: widgets\/_shared\/rf-nope\.html doesn't exist/],
    ]) {
        const { root } = widgetsRoot('rf-x', { template });
        assert.throws(() => readWidget('rf-x', { root }), error);
    }
});

// Ticket 27's follow-up: a global region's placement still names one template file, and the store
// shows it on that page alone, so the strip is placed once per template file (docs/widgets.md).
test('a placement can name several template files, each with its own recorded uuid', () => {
    const several = {
        placement: {
            template_files: ['pages/home', 'pages/cart'], region: 'header_bottom--global', sort_order: 0, status: 'active',
        },
        uuids: { template: null, widget: null, placements: { 'pages/home': UUID } },
    };
    const { root } = widgetsRoot('rf-x', { channel: several });
    const channelFile = readChannelFile(readWidget('rf-x', { root }), 1895766);
    assert.deepEqual(channelFile.placement.template_files, ['pages/home', 'pages/cart']);
    assert.deepEqual(placementsOf(channelFile), [
        {
            template_file: 'pages/home', region: 'header_bottom--global', sort_order: 0, status: 'active', uuid: UUID,
        },
        {
            template_file: 'pages/cart', region: 'header_bottom--global', sort_order: 0, status: 'active', uuid: null,
        },
    ]);
    const { root: one } = widgetsRoot('rf-x');
    assert.deepEqual(placementsOf(readChannelFile(readWidget('rf-x', { root: one }), 1895766)), [{
        template_file: 'pages/home', region: 'home_below_menu', sort_order: 0, status: 'inactive', uuid: null,
    }]);
    const placement = over => ({ ...several.placement, ...over });
    const cases = [
        [{ ...several, placement: placement({ template_file: 'pages/home' }) }, /placement names template_file or template_files, not both/],
        [{ ...several, placement: placement({ template_files: [] }) }, /template_files lists no template file/],
        [{ ...several, placement: placement({ template_files: ['pages/home', 'pages/home'] }) }, /template_files lists pages\/home twice/],
        [{ ...several, placement: placement({ template_files: ['pages/home', 'cart'] }) }, /template_files has "cart", which isn't a template file such as "pages\/cart"/],
        [{ ...several, uuids: { template: null, widget: null, placement: null } }, /uuids needs placements, a uuid or null per template file, with template_files/],
        [{ ...several, uuids: { template: null, widget: null, placements: { 'pages/search': UUID } } }, /uuids\.placements records pages\/search, which template_files doesn't list/],
        [{ ...several, uuids: { template: null, widget: null, placements: { 'pages/home': 'x' } } }, /uuids\.placements\["pages\/home"\] must be null or a uuid/],
        [{ uuids: { template: null, widget: null, placements: {} } }, /uuids needs placement, not placements, with one template_file/],
    ];
    for (const [channel, error] of cases) {
        const { root: bad } = widgetsRoot('rf-x', { channel });
        assert.throws(() => readChannelFile(readWidget('rf-x', { root: bad }), 1895766), error, JSON.stringify(channel));
    }
});

test('the uuids of a placement on several template files are written back as a map, in the list\'s order', () => {
    const { root } = widgetsRoot('rf-x', {
        channel: {
            placement: {
                template_files: ['pages/home', 'pages/cart'], region: 'header_bottom--global', sort_order: 0, status: 'active',
            },
            uuids: { template: null, widget: null, placements: {} },
        },
    });
    const widget = readWidget('rf-x', { root });
    const channelFile = readChannelFile(widget, 1895766);
    writeUuids(channelFile, { template: UUID, widget: UUID, placements: { 'pages/cart': UUID, 'pages/home': null } });
    const text = fs.readFileSync(channelFile.file, 'utf8');
    assert.deepEqual(JSON.parse(text).uuids, { template: UUID, widget: UUID, placements: { 'pages/home': null, 'pages/cart': UUID } });
    assert.deepEqual(Object.keys(JSON.parse(text).uuids.placements), ['pages/home', 'pages/cart'], 'the map follows template_files\' order');
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
