// The template engine the store renders widget templates with (ticket 46), shared by the widget
// sync (source.mjs, paste.mjs, sync.mjs) and the fixture renderer (scripts/qa/render/render.mjs).
//
// - The store saved the hero's template with "template_engine": "handlebars_v3" (--record,
//   snapshot 2026-10-07T20-30-58.455Z).
// - The Widgets API reference lists template_engine only in its responses: a create takes name,
//   template, schema, storefront_api_query and channel_id, and an update adds create_new_version.
//   So a sync can't ask for v4, and widgets are rendered and checked with v3. Theme pages stay
//   on config.json's handlebars_v4.
// - sync.mjs stops when a recorded template reports any other engine, so a change on the store's
//   side is caught by the next dry run or --verify, not by a broken home page.

import { createRequire } from 'module';

export const STORE_ENGINE = 'handlebars_v3';

const require = createRequire(import.meta.url);
// The Handlebars build Paper renders handlebars_v3 with: the one stencil-paper-handlebars itself
// requires (3.0.8), resolved from its own folder so npm's hoisting can't swap it.
const paperHandlebars = require.resolve('@bigcommerce/stencil-paper-handlebars'); // eslint-disable-line import/no-extraneous-dependencies
export const Handlebars3 = createRequire(paperHandlebars)('handlebars');

let helpers;
// Every helper name a widget template can call on the store: Paper's (stencil-paper-handlebars'
// list, deprecated ones included) and Handlebars' own.
export function helperNames() {
    if (!helpers) {
        const paper = createRequire(paperHandlebars)('./helpers.js').map(helper => helper.name);
        helpers = new Set([...paper, ...Object.keys(Handlebars3.create().helpers)]);
    }
    return helpers;
}
