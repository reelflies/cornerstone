// Widgets API list responses for the widget sync's tests (ticket 46): what
// GET /v3/content/{widget-templates,widgets,placements}?channel_id:in=1895766 answers.
//
// - `empty` is what the first real dry run read on 2026-10-06 (snapshot sha256 4aeecbee…,
//   ~/reelflies/store-snapshots/1895766/<object>/2026-10-07T03-52-39.208Z-widgets-sync.json):
//   no widget template, widget or placement on 1895766. The snapshot keeps each list's data,
//   not its meta, so the pagination here is BigCommerce's documented shape.
// - `placed` has the shape of the first `--record` after an apply (2026-10-07, snapshot sha256
//   562d7d4f…, ~/reelflies/store-snapshots/1895766/<object>/2026-10-07T20-30-58.455Z-widgets-sync.json).
//   The store adds "_": { "id": <the widget's uuid> } to each widget_configuration, saves each
//   template with "template_engine": "handlebars_v3", and gives each placement an empty entity_id.
// - The rest are shaped on BigCommerce's documented responses and the store helper's fixtures
//   (scripts/store/fixtures/widgets.json).

const CH = 1895766;
export const T = 'c0ffee00-1234-4abc-8def-0123456789ab';
export const W = 'd00dfeed-1234-4abc-8def-0123456789ab';
export const P = 'e1e1e1e1-1234-4abc-8def-0123456789ab';

const page = data => ({
    data,
    meta: {
        pagination: {
            total: data.length, count: data.length, per_page: 250, current_page: 1, total_pages: data.length ? 1 : 0,
        },
    },
});

// A channel with no widgets yet.
export const empty = { templates: page([]), widgets: page([]), placements: page([]) };

// A filtered list that still returns an object on channel 1, which must stop the sync.
export const templatesWithChannel1 = page([{
    uuid: 'bbbbbbbb-0000-4000-8000-000000000001', name: 'Hero (live reelflies.ca)', kind: 'custom', channel_id: 1, schema: [], template: '', storefront_api_query: '',
}]);

// The channel after an apply of the widget as the repo has it: its template, widget and placement.
export function placed(widget, configuration, placement) {
    return {
        templates: page([{
            uuid: T,
            name: widget.templateName,
            schema: widget.schema,
            template: widget.template,
            storefront_api_query: widget.query,
            kind: 'custom',
            channel_id: CH,
            date_created: '2026-10-06T20:00:00.000Z',
            date_modified: '2026-10-06T20:00:00.000Z',
            current_version_uuid: '0a1b2c3d-2222-4222-8333-444455556666',
            icon_name: 'default',
            template_engine: 'handlebars_v3',
            client_rerender: false,
            schema_translations: {},
        }]),
        widgets: page([{
            uuid: W,
            name: widget.widgetName,
            description: '',
            widget_configuration: { ...configuration, _: { id: W } },
            widget_template: {
                uuid: T, name: widget.templateName, kind: 'custom', channel_id: CH,
            },
            channel_id: CH,
            date_created: '2026-10-06T20:00:01.000Z',
            date_modified: '2026-10-06T20:00:01.000Z',
            version_uuid: '0a1b2c3d-2222-4222-8333-444455556666',
        }]),
        placements: page([{
            uuid: P,
            ...placement,
            entity_id: '',
            channel_id: CH,
            widget: { uuid: W, name: widget.widgetName, channel_id: CH },
            date_created: '2026-10-06T20:00:02.000Z',
            date_modified: '2026-10-06T20:00:02.000Z',
        }]),
    };
}
