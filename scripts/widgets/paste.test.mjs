// Tests scripts/widgets/paste.mjs (ticket 46): the store copy of a widget template that calls
// widgets/_shared/ partials. The store renders widget templates with Handlebars 3, which can't
// define inline partials, so each call is replaced by the partial's body, with its hash
// arguments mapped. Each case renders the widget's files (the partials registered, as the
// fixture renderer does) and the store copy, both with the store's engine, and compares them.
//
//   node --test scripts/widgets/paste.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderWidget } from '../qa/render/render.mjs';
import { Handlebars3 } from './engine.mjs';
import { pasteShared } from './paste.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-widgets-paste-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// A widgets folder with the widget rf-x (`template`) and the given _shared partials.
function widgets(template, partials = {}) {
    const root = fs.mkdtempSync(path.join(tmp, 'root-'));
    fs.mkdirSync(path.join(root, 'rf-x'));
    fs.writeFileSync(path.join(root, 'rf-x', 'template.html'), template);
    fs.mkdirSync(path.join(root, '_shared'));
    for (const [name, body] of Object.entries(partials)) fs.writeFileSync(path.join(root, '_shared', `${name}.html`), body);
    return root;
}

// A widgets folder holding only rf-x, whose template is the store copy: no _shared partials.
function storeRoot(template) {
    const root = fs.mkdtempSync(path.join(tmp, 'stored-'));
    fs.mkdirSync(path.join(root, 'rf-x'));
    fs.writeFileSync(path.join(root, 'rf-x', 'template.html'), template);
    return root;
}

const CONFIGURATION = {
    text: 'Hello', heading: 'Hi <there>', show: true, hide: false, url: '/dry-flies/', label: 'Top',
};
const DATA = {
    site: {
        products: {
            edges: [
                {
                    node: {
                        entityId: 1, name: 'Parachute Adams', inStock: true, prices: { price: { value: 1.25, currencyCode: 'CAD' } },
                    },
                },
                {
                    node: {
                        entityId: 2, name: 'Royal Wulff', inStock: false, prices: { price: { value: 0.75, currencyCode: 'CAD' } },
                    },
                },
            ],
        },
    },
};

// The store copy of `template`, and the widget rendered from its files and from that copy.
async function bothWays(template, partials, configuration = CONFIGURATION) {
    const root = widgets(template, partials);
    const stored = pasteShared(template, { root });
    const fixture = { configuration, data: DATA };
    return {
        stored,
        files: await renderWidget('rf-x', fixture, { root }),
        store: await renderWidget('rf-x', fixture, { root: storeRoot(stored) }),
    };
}

const PRICE = '<span class="price">{{price.value}} {{price.currencyCode}}</span>\n';
// A product card as ticket 48 might write it: a note, a standalone {{#if}}, an attribute.
const CARD = [
    '{{!-- The product card two bands share. --}}',
    '<article class="card" data-id="{{product.entityId}}">',
    '    <h3>{{product.name}}</h3>',
    '    {{#if product.inStock}}',
    '    <p>{{product.prices.price.value}}</p>',
    '    {{else}}',
    '    <p>Sold out</p>',
    '    {{/if}}',
    '</article>',
    '',
].join('\n');

test('a template that calls no _shared partial is the store copy as it is, byte for byte', () => {
    const template = '{{!}}\n<p>{{text}}</p>\n<img src="x" alt="" />\n';
    assert.equal(pasteShared(template, { root: widgets(template) }), template);
});

test('each call is replaced by the partial\'s body, so the store copy has no partial left and Handlebars 3 parses it', async () => {
    const template = '<ul>\n    {{#each _.data.site.products.edges}}\n    <li>{{> _shared/card product=node}}</li>\n    {{/each}}\n</ul>\n';
    const { stored, files, store } = await bothWays(template, { card: CARD });
    assert.equal(store, files);
    assert.doesNotMatch(stored, /\{\{#?>|\{\{#\*inline/);
    assert.doesNotThrow(() => Handlebars3.parse(stored));
    assert.match(files, /<li><article class="card" data-id="1">\n {4}<h3>Parachute Adams<\/h3>\n {4}<p>1.25<\/p>\n<\/article>\n<\/li>/);
    assert.match(files, /<h3>Royal Wulff<\/h3>\n {4}<p>Sold out<\/p>/);
});

test('the store copy renders as the files do, whitespace and all, wherever the call stands', async () => {
    const cases = [
        // inside a line, with a note on the partial's first line and a standalone block
        ['<p>{{> _shared/card product=_.data.site.products.edges.[0].node}}</p>\n', { card: CARD }],
        // alone on its line, indented: Paper compiles with preventIndent, so the indent is kept once
        ['<div>\n    {{> _shared/price price=_.data.site.products.edges.[1].node.prices.price}}\n</div>\n', { price: PRICE }],
        // alone on its line at column 0, between the tags of a block
        ['{{#each _.data.site.products.edges}}\n{{> _shared/card product=node}}\n{{/each}}\n', { card: CARD }],
        // alone on its line, with trailing spaces, CRLF line breaks, and a partial in CRLF
        ['<div>\r\n  {{> _shared/price price=_.data.site.products.edges.[0].node.prices.price}}  \r\n</div>\r\n', { price: PRICE.replace('\n', '\r\n') }],
        // at the very start and the very end of the template
        ['{{> _shared/price price=_.data.site.products.edges.[0].node.prices.price}}', { price: PRICE }],
        ['<b>{{text}}</b>\n{{> _shared/price price=_.data.site.products.edges.[0].node.prices.price}}\n', { price: PRICE }],
        // a partial with no final line break, inside a line
        ['<p>{{> _shared/note text=text}}</p>\n', { note: '<em>{{text}}</em>' }],
        // ~ on the call strips the template's whitespace round it, as on the files
        ['<p>\n    {{~> _shared/note text=text~}}\n</p>\n', { note: '<em>{{text}}</em>\n' }],
        ['<p> {{~> _shared/note text=text}} </p>\n', { note: '  <em>{{text}}</em>  ' }],
        // ~ and standalone lines inside the partial apply to the partial alone
        ['<p>A{{> _shared/note text=text}}B</p>\n', { note: '  {{~#if text~}}  <em>{{text}}</em>  {{~/if~}}  \n' }],
        ['<p>A{{> _shared/note}}B</p>\n', { note: '\n{{#if show}}\n<em>{{text}}</em>\n{{else if hide}}\n<i>no</i>\n{{^}}\n<s>none</s>\n{{/if}}\n\n' }],
        // the template's own standalone tags round the call keep their own whitespace
        ['<ul>\n{{#if show}}\n{{> _shared/note text=text}}\n{{/if}}\n</ul>\n', { note: '<li>{{text}}</li>\n' }],
        // a partial block that, once its own standalone line breaks are dropped, would stand alone
        // again: the {{!}} before each block tag keeps Handlebars from dropping a second one
        ['<p>{{> _shared/note text=text}}</p>\n', { note: '{{#if text}}\n\n<em>{{text}}</em>\n\n{{/if}}\n' }],
        // the template's own block right beside the call: the {{!}} round the pasted body keep it
        // from standing alone on a line the body starts
        ['{{#if show}}{{> _shared/note text=text}}{{/if}}', { note: '\n<em>{{text}}</em>\n' }],
        // two calls of the same partial with different arguments
        ['<p>{{> _shared/note text=text}}|{{> _shared/note text=label}}</p>\n', { note: '<em>{{text}}</em>' }],
    ];
    for (const [template, partials] of cases) {
        const { stored, files, store } = await bothWays(template, partials); // eslint-disable-line no-await-in-loop
        assert.equal(store, files, `renders differently: ${JSON.stringify(template)} with ${JSON.stringify(partials)}\nstore copy: ${JSON.stringify(stored)}`);
    }
});

test('a hash argument is mapped to its value: a path, this, @index, a literal or a subexpression', async () => {
    const cases = [
        ['<p>{{> _shared/n who=heading}}</p>', '{{who}}|{{{who}}}|{{#if who}}yes{{/if}}|{{concat who "!"}}'],
        ['{{#each _.data.site.products.edges}}<p>{{> _shared/n item=this n=@index}}</p>{{/each}}', '{{n}}:{{item.node.name}}'],
        ['<p>{{> _shared/n who="Bob & <Co>" count=3}}</p>', '{{who}}|{{{who}}}|{{count}}|{{concat who count}}'],
        ['<p>{{> _shared/n who=(concat text "!")}}</p>', '{{#if who}}{{concat who "?"}}{{/if}}'],
        ['<p>{{> _shared/n on=true off=false}}</p>', '{{#if on}}on{{/if}}{{#unless off}}off{{/unless}}'],
        ['<p>{{> _shared/n product=_.data.site.products.edges.[0].node}}</p>', '{{#each product.prices}}{{value}}{{/each}}|{{product.[name]}}'],
    ];
    for (const [template, partial] of cases) {
        const { stored, files, store } = await bothWays(template, { n: partial }); // eslint-disable-line no-await-in-loop
        assert.equal(store, files, `${template} with ${partial}: ${JSON.stringify(stored)}`);
    }
    assert.equal((await bothWays('<p>{{> _shared/n who=heading}}</p>', { n: '{{who}}|{{{who}}}|{{#if who}}yes{{/if}}' })).store, '<p>Hi &lt;there&gt;|Hi <there>|yes</p>');
    assert.equal((await bothWays('<p>{{> _shared/n who="Bob & <Co>" count=3}}</p>', { n: '{{who}}|{{{who}}}|{{count}}' })).store, '<p>Bob &amp; &lt;Co&gt;|Bob & <Co>|3</p>');
});

// Each case: the template, the partial n's body, and what the refusal names.
const REFUSED = [
    ['../ in the partial', '<p>{{> _shared/n}}</p>', '{{#if show}}{{../text}}{{/if}}', /widgets\/_shared\/n\.html: .*\.\.\/text.*\.\.\//],
    ['../ in a hash value', '{{#if show}}<p>{{> _shared/n who=../text}}</p>{{/if}}', '{{who}}', /who=\.\.\/text.*\.\.\//],
    ['a hash argument read inside {{#each}}', '<p>{{> _shared/n who=text}}</p>', '{{#each items}}{{who}}{{/each}}', /widgets\/_shared\/n\.html: .*"who".*\{\{#each\}\}/],
    ['a hash argument as a block', '<p>{{> _shared/n who=text}}</p>', '{{#who}}x{{/who}}', /"who".*as a block/],
    ['a block param named like a hash argument', '<p>{{> _shared/n who=text}}</p>', '{{#each items as |who|}}{{who}}{{/each}}', /block param "who"/],
    // {{#if}} passes no block params, so the pasted {{node}} would read the empty "node", not the caller's
    ['a hash value the partial\'s own block params would shadow', '<p>{{> _shared/n who=node}}</p>', '{{#if show as |node|}}{{who}}{{/if}}', /"who" reads "node", which is a block param of the partial/],
    ['a hash subexpression the partial\'s own block params would shadow', '<p>{{> _shared/n who=(concat node "!")}}</p>', '{{#if show as |node|}}{{#if who}}y{{/if}}{{/if}}', /"who" reads "node", which is a block param of the partial/],
    ['this with hash arguments', '<p>{{> _shared/n who=text}}</p>', '{{json this}}', /reads this, which is the template's context/],
    ['a context argument', '<p>{{> _shared/n _.data}}</p>', '{{site}}', /context/],
    ['a name the caller\'s block params use', '{{#each _.data.site.products.edges as |edge|}}{{> _shared/n}}{{/each}}', '{{edge.node.name}}', /reads "edge", which is a block param of the template/],
    ['a hash argument named like a helper', '<p>{{> _shared/n json=text}}</p>', '{{json}}', /"json".*helper/],
    ['a literal read with a path after it', '<p>{{> _shared/n who="Bob"}}</p>', '{{who.length}}', /"who".*literal/],
    ['a literal that would become a tag', '<p>{{> _shared/n who="{{x}}"}}</p>', '{{who}}', /"who" is the literal "\{\{x\}\}", which would become a tag/],
    ['a partial inside the partial', '<p>{{> _shared/n}}</p>', '{{> _shared/m}}', /widgets\/_shared\/n\.html: .*one level/],
    ['an escaped mustache', '<p>{{> _shared/n}}</p>', '\\{{text}}', /widgets\/_shared\/n\.html: .*escape/],
    ['an inline partial Handlebars 3 can\'t parse', '<p>{{> _shared/n}}</p>', '{{#*inline "m"}}x{{/inline}}', /widgets\/_shared\/n\.html: Handlebars 3.*handlebars_v3.*Parse error on line 1/],
    ['a call alone on its line whose partial ends with a block', '<div>\n{{> _shared/n}}\n</div>\n', '<em>{{text}}</em>\n{{#if show}}\n<b>!</b>\n{{/if}}\n', /alone on its line.*line break/],
];

test('what pasting can\'t reproduce is refused, naming the file and the cause', () => {
    for (const [what, template, partial, error] of REFUSED) {
        assert.throws(() => pasteShared(template, { root: widgets(template, { n: partial, m: '<i></i>' }) }), error, what);
    }
});

test('a call to a theme partial, a dynamic partial or a missing _shared partial is refused', () => {
    const root = widgets('');
    assert.throws(() => pasteShared('{{> components/products/card}}', { root }), /a store widget can't include the theme partial components\/products\/card/);
    assert.throws(() => pasteShared('{{> (concat "_shared/" "n")}}', { root }), /dynamic partial/);
    assert.throws(() => pasteShared('{{> _shared/nope}}', { root }), /widgets\/_shared\/nope\.html doesn't exist/);
});

test('an error in a _shared partial names the partial file, with its own line numbers', () => {
    // The template has one line; the parse error is on the partial's fourth.
    const template = '<p>{{> _shared/n text=text}}</p>';
    const root = widgets(template, { n: '<em>\n{{#if text}}{{text}}\n</em>\n' });
    assert.throws(() => pasteShared(template, { root }), /^Error: widgets\/_shared\/n\.html: Handlebars 3, .*Parse error on line 4:/s);
});

test('a template Handlebars 3 can\'t parse is refused, with its own line numbers', () => {
    const template = '<p>{{text}}</p>\n{{#*inline "x"}}<i></i>{{/inline}}\n{{> x}}\n';
    assert.throws(() => pasteShared(template, { root: widgets(template) }), /Handlebars 3.*handlebars_v3.*Parse error on line 2/s);
});
