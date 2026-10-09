// The widget sync's plan (ticket 46): from the repo's widgets (source.mjs) and a snapshot of one
// channel's widget templates, widgets and placements, the store-write helper's requests that
// bring the channel in step with the repo, and the diff a person reads first.
//
//   import { planSync, recordUuids, storeChannelProblems } from './widgets/sync.mjs';
//   const { requests, lines, problems } = planSync({ channel: 1895766, entries, store });
//
// - Every request names its channel_id, on creates and updates alike. A widget template,
//   widget or placement created without one lands on the store's first channel, which is live
//   reelflies.ca (O21, HOME-2). buildRequest is the only way a request is made, and it refuses
//   to make one without the channel.
// - A create of the widget refers to the template created before it in the same plan, and the
//   placement to the widget, with the store-write helper's {"$created": n} (docs/store-writes.md).
// - An update sends only the fields that changed, with the channel.
// - A recorded template the store saves with another engine than STORE_ENGINE (engine.mjs) stops
//   the sync: the fixture renders and the store copy's checks model Handlebars 3. An unpublish
//   still goes ahead, because switching a widget off doesn't depend on how it renders.
// - Nothing here reads or writes the store. widgets-sync.mjs reads the snapshot with GETs only,
//   and every write goes through the store-write helper (W0-11), which checks the channel again
//   on every request, response and re-read.

import { isDeepStrictEqual } from 'util';
import { channelsNamed } from '../store/channel.mjs';
import { showValue } from '../store/plan.mjs';
import { STORE_ENGINE } from './engine.mjs';
import { placementsOf } from './source.mjs';

export const PATHS = {
    'widget-templates': '/v3/content/widget-templates',
    widgets: '/v3/content/widgets',
    placements: '/v3/content/placements',
};
const LABEL = { 'widget-templates': 'template', widgets: 'widget', placements: 'placement' };
const INDENT = '     ';
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const short = uuid => String(uuid).slice(0, 8);

// One store-write helper request for a widget object. A create is POST to its base, an update
// PUT to base/<uuid>. The body always gets the channel's channel_id; a body that names any other
// channel anywhere is refused.
export function buildRequest({
    object, id = null, body, channel,
}) {
    if (!PATHS[object]) throw new Error(`"${object}" isn't a widget object (${Object.keys(PATHS).join(', ')})`);
    if (channel === undefined || channel === null) throw new Error('no channel: every widget request names its channel_id, or the store puts the object on its first channel, live reelflies.ca');
    if (!Number.isInteger(channel) || channel < 1) throw new Error(`channel ${JSON.stringify(channel)} isn't a channel id`);
    if (!isObject(body)) throw new Error(`a ${object} request needs a body`);
    const others = channelsNamed(body).filter(value => value !== channel);
    if (others.length) throw new Error(`the ${object} body names channel ${others.map(value => JSON.stringify(value)).join(', ')}, not ${channel}`);
    return {
        method: id ? 'PUT' : 'POST',
        path: id ? `${PATHS[object]}/${id}` : PATHS[object],
        query: {},
        body: { ...body, channel_id: channel },
    };
}

// Every object read from the store must belong to the channel: its own channel_id, and any
// template or widget it links to. A list filtered by channel that returns anything else stops
// the sync before anything is planned.
export function storeChannelProblems(store, channel) {
    const problems = [];
    for (const [object, key] of [['widget-templates', 'templates'], ['widgets', 'widgets'], ['placements', 'placements']]) {
        for (const item of store[key] || []) {
            const name = `${object} ${short(item?.uuid)}`;
            if (!isObject(item) || !('channel_id' in item) || item.channel_id === undefined) {
                problems.push(`${name} doesn't name its channel: every object read must say it belongs to ${channel}`);
            } else {
                const others = [...new Set(channelsNamed(item).filter(value => Number(value) !== channel || value === null).map(value => JSON.stringify(value)))];
                if (others.length) problems.push(`${name} names channel ${others.join(', ')}, not ${channel}`);
            }
        }
    }
    return problems;
}

const desiredTemplate = widget => ({
    name: widget.templateName, template: widget.template, schema: widget.schema, storefront_api_query: widget.query,
});

// A widget_configuration without the "_": { "id": <the widget's uuid> } the store adds to each one
// (a template reads it as {{_.id}}). Any other "_" stays, so it reads as drift.
function withoutStoreId(configuration, uuid) {
    if (!isObject(configuration) || !isDeepStrictEqual(configuration._, { id: uuid })) return configuration;
    return Object.fromEntries(Object.entries(configuration).filter(([key]) => key !== '_'));
}

// The store's value of a field, as a create or update would set it.
const storeValue = {
    'widget-templates': (item, key) => (key === 'storefront_api_query' ? item[key] ?? '' : item[key]),
    widgets: (item, key) => {
        if (key === 'widget_template_uuid') return item.widget_template?.uuid;
        return key === 'widget_configuration' ? withoutStoreId(item[key], item.uuid) : item[key];
    },
    placements: (item, key) => (key === 'widget_uuid' ? item.widget?.uuid : item[key]),
};

const changedFields = (object, item, desired) => Object.fromEntries(Object.entries(desired)
    .filter(([key, value]) => !isDeepStrictEqual(storeValue[object](item, key), value)));

// The diff lines for a changed field: an object compared key by key, so a changed heading in
// widget_configuration reads as one line, not the whole configuration. A key one side lacks
// reads as (none), so a key an update leaves out doesn't read as a null it would send.
function fieldLines(key, from, to) {
    if (isObject(from) && isObject(to)) {
        const side = (object, name) => (name in object ? showValue(object[name], name) : '(none)');
        return [...new Set([...Object.keys(from), ...Object.keys(to)])]
            .filter(name => !isDeepStrictEqual(from[name], to[name]))
            .map(name => `${INDENT}${key}.${name}: ${side(from, name)} -> ${side(to, name)}`);
    }
    return [`${INDENT}${key}: ${from === undefined ? '(none)' : showValue(from, key)} -> ${showValue(to, key)}`];
}

// One object's step: create it, update it, or leave it, given its recorded uuid and the
// channel's list. Pushes to `requests`, `lines` and `problems`; returns the uuid (or the
// {"$created": n} reference) the next object links to, or null when there is none.
function step(context, {
    object, name, recorded, desired, twin, twinWhat,
}) {
    const {
        channel, requests, lines, problems, store, where, entryName,
    } = context;
    const list = store[{ 'widget-templates': 'templates', widgets: 'widgets', placements: 'placements' }[object]] || [];
    const label = `${LABEL[object]} ${name}`;
    if (recorded) {
        const item = list.find(candidate => candidate.uuid === recorded);
        if (!item) {
            problems.push(`${entryName}: ${LABEL[object]} ${recorded} is recorded in ${where}, but channel ${channel} has no such ${object}: was it deleted? Fix the record (--record) before syncing`);
            return null;
        }
        const changed = changedFields(object, item, desired);
        if (!Object.keys(changed).length) {
            lines.push(`  ${label} (${short(recorded)}): no change`);
            return recorded;
        }
        lines.push(`  ${label} (${short(recorded)}): update`);
        Object.entries(changed).forEach(([key, value]) => lines.push(...fieldLines(key, storeValue[object](item, key), value)));
        requests.push(buildRequest({
            object, id: recorded, body: changed, channel,
        }));
        return recorded;
    }
    const existing = list.find(twin);
    if (existing) {
        problems.push(`${entryName}: channel ${channel} already has ${twinWhat} (${existing.uuid}), which ${where} doesn't record: run with --record first, so nothing is made twice`);
        return null;
    }
    lines.push(`  ${label}: create`);
    Object.entries(desired).forEach(([key, value]) => lines.push(`${INDENT}${key}: (none) -> ${showValue(value, key)}`));
    requests.push(buildRequest({ object, body: desired, channel }));
    return { $created: requests.length - 1 };
}

// Any placement of the recorded widget on the channel that the channel file doesn't record, and
// the twin check in step() doesn't already name (a placement on a listed template file, in the
// listed region, with no recorded uuid): a second one on a listed file, one in another region, or
// one on a file the list leaves out. Each would show the widget where the repo doesn't say, and
// --verify would never see it.
function unrecordedPlacements({
    channel, problems, store, where, entryName,
}, widgetUuid, placements) {
    const recorded = new Map(placements.map(placement => [placement.template_file, placement]));
    const recordedUuids = placements.map(placement => placement.uuid).filter(Boolean);
    for (const item of store.placements || []) {
        if (item.widget?.uuid !== widgetUuid || recordedUuids.includes(item.uuid)) continue; // eslint-disable-line no-continue
        const twin = recorded.get(item.template_file);
        if (twin && !twin.uuid && twin.region === item.region) continue; // eslint-disable-line no-continue
        const listed = recorded.has(item.template_file);
        problems.push(`${entryName}: channel ${channel} has placement ${item.uuid} of the widget on ${item.template_file} ${item.region}, which ${where} doesn't record: delete it in the control panel${listed ? '' : ', or list its template file and run --record'}`);
    }
}

// The requests that bring the channel in step with the repo, the diff and any problems. With
// problems, `requests` is empty: nothing is half-synced.
//
//   only       'all' (default), 'content' (templates and widgets: ticket 53 makes channel-1
//              widgets before ticket 56 places them) or 'placement' (placements of widgets
//              already recorded)
//   unpublish  a widget name: only the status of each of its placements on the channel, set
//              inactive (R12; allowed from T-14)
export function planSync({
    channel, entries, store, only = 'all', unpublish = null,
}) {
    const requests = [];
    const lines = [];
    const problems = [...storeChannelProblems(store, channel)];
    if (problems.length) return { requests: [], lines, problems };
    for (const { widget, channelFile } of entries) {
        if (unpublish && widget.name !== unpublish) continue; // eslint-disable-line no-continue
        const saved = !unpublish && channelFile.uuids.template && (store.templates || []).find(item => item.uuid === channelFile.uuids.template);
        if (saved && saved.template_engine !== STORE_ENGINE) {
            problems.push(`${widget.name}: template ${short(saved.uuid)} on channel ${channel} is saved with template_engine ${saved.template_engine === undefined ? '(none)' : JSON.stringify(saved.template_engine)}, not "${STORE_ENGINE}", the engine the fixture renderer and the store copy's checks use (scripts/widgets/engine.mjs): check how the store renders the widgets now, and update engine.mjs, before syncing`);
        }
        lines.push(`${widget.name} on channel ${channel} (${channelFile.where})`);
        const context = {
            channel, requests, lines, problems, store, where: channelFile.where, entryName: widget.name,
        };
        const { uuids } = channelFile;
        const placements = placementsOf(channelFile);
        if (unpublish) {
            // Every placement of the widget on the channel, recorded or not, so the off switch
            // leaves nothing on: a template file listed but not placed yet, or placed but not
            // recorded, never stops it. A widget the channel file doesn't record yet (an apply
            // whose --record PR hasn't merged) is found by its name.
            const byName = uuids.widget ? null : (store.widgets || []).find(item => item.name === widget.widgetName);
            const widgetUuid = uuids.widget || byName?.uuid;
            const ofWidget = widgetUuid ? (store.placements || []).filter(item => item.widget?.uuid === widgetUuid) : [];
            const recordedUuids = placements.map(placement => placement.uuid).filter(Boolean);
            if (!widgetUuid) {
                problems.push(`${widget.name}: channel ${channel} has no widget named ${widget.widgetName}, and ${channelFile.where} records none, so there is nothing to unpublish`);
            } else if (!ofWidget.length) {
                problems.push(`${widget.name}: channel ${channel} has no placement of widget ${widgetUuid}, so there is nothing to unpublish`);
            }
            if (byName) lines.push(`  widget ${widget.widgetName} (${short(byName.uuid)}), found by name: not recorded yet in ${channelFile.where}`);
            for (const item of ofWidget) {
                const label = `  placement ${item.template_file} ${item.region} (${short(item.uuid)}${recordedUuids.includes(item.uuid) ? '' : ', not recorded'})`;
                if (item.status === 'inactive') {
                    lines.push(`${label}: already inactive`);
                } else {
                    lines.push(`${label}: unpublish`, `${INDENT}status: ${showValue(item.status)} -> "inactive"`);
                    requests.push(buildRequest({
                        object: 'placements', id: item.uuid, body: { status: 'inactive' }, channel,
                    }));
                }
            }
        } else {
            let template = uuids.template;
            let widgetRef = uuids.widget;
            if (only !== 'placement') {
                template = step(context, {
                    object: 'widget-templates',
                    name: widget.templateName,
                    recorded: uuids.template,
                    desired: desiredTemplate(widget),
                    twin: item => item.name === widget.templateName,
                    twinWhat: `a widget template named ${widget.templateName}`,
                });
                if (template) {
                    widgetRef = step(context, {
                        object: 'widgets',
                        name: widget.widgetName,
                        recorded: uuids.widget,
                        desired: { name: widget.widgetName, widget_configuration: channelFile.configuration, widget_template_uuid: template },
                        twin: item => item.name === widget.widgetName,
                        twinWhat: `a widget named ${widget.widgetName}`,
                    });
                }
            }
            if (only === 'placement' && !uuids.widget) {
                problems.push(`${widget.name}: the widget isn't recorded in ${channelFile.where} yet, so it can't be placed on its own: create it (--only content), then --record`);
            } else if (only !== 'content' && widgetRef) {
                for (const { uuid, ...placement } of placements) {
                    step(context, {
                        object: 'placements',
                        name: `${placement.template_file} ${placement.region}`,
                        recorded: uuid,
                        desired: { widget_uuid: widgetRef, ...placement },
                        twin: item => typeof widgetRef === 'string' && item.widget?.uuid === widgetRef && item.template_file === placement.template_file && item.region === placement.region,
                        twinWhat: `a placement of widget ${widgetRef} in ${placement.template_file} ${placement.region}`,
                    });
                }
                if (typeof widgetRef === 'string') unrecordedPlacements(context, widgetRef, placements);
            }
        }
    }
    if (unpublish && !entries.some(({ widget }) => widget.name === unpublish)) problems.push(`no widget ${unpublish} is synced to channel ${channel}`);
    return { requests: problems.length ? [] : requests, lines, problems };
}

function findOne(list, match, what) {
    const found = list.filter(match);
    if (found.length > 1) return { problem: `${found.length} ${what}: ${found.map(item => item.uuid).join(', ')}. Delete the extra ones in the control panel, then record again` };
    return { uuid: found[0]?.uuid ?? null };
}

// The uuids of each widget's template, widget and placement on the channel, found in the
// snapshot by name and by link, for widgets-sync.mjs --record to write into the channel files
// after an apply. A uuid already recorded must be the one found.
export function recordUuids({ channel, entries, store }) {
    const channelProblems = storeChannelProblems(store, channel);
    return entries.map(({ widget, channelFile }) => {
        const problems = [...channelProblems];
        const template = findOne(store.templates || [], item => item.name === widget.templateName, `widget-templates named ${widget.templateName}`);
        const widgetFound = template.uuid
            ? findOne(store.widgets || [], item => item.name === widget.widgetName && item.widget_template?.uuid === template.uuid, `widgets named ${widget.widgetName} on template ${template.uuid}`)
            : { uuid: null };
        const placements = placementsOf(channelFile).map(placement => ({
            placement,
            found: widgetFound.uuid
                ? findOne(store.placements || [], item => item.widget?.uuid === widgetFound.uuid && item.template_file === placement.template_file && item.region === placement.region, `placements of widget ${widgetFound.uuid} in ${placement.template_file} ${placement.region}`)
                : { uuid: null },
        }));
        // Checks one found uuid against the one recorded, and returns the uuid to record.
        const settle = (what, found, now) => {
            if (found.problem) problems.push(`${widget.name}: ${found.problem}`);
            if (now && found.uuid && now !== found.uuid) problems.push(`${widget.name}: ${channelFile.where} records ${what} ${now}, but the channel's is ${found.uuid}`);
            if (now && !found.uuid && !found.problem) problems.push(`${widget.name}: ${channelFile.where} records ${what} ${now}, and channel ${channel} has none: check the store before recording again`);
            return found.uuid ?? now ?? null;
        };
        const uuids = {
            template: settle('template', template, channelFile.uuids.template),
            widget: settle('widget', widgetFound, channelFile.uuids.widget),
        };
        if (channelFile.placement.template_files) {
            uuids.placements = Object.fromEntries(placements.map(({ placement, found }) => [placement.template_file, settle(`placement ${placement.template_file}`, found, placement.uuid)]));
        } else {
            uuids.placement = settle('placement', placements[0].found, placements[0].placement.uuid);
        }
        // A template file left out of uuids.placements reads as null, so recording null for it is no change.
        const recordedNow = channelFile.placement.template_files
            ? { ...channelFile.uuids, placements: Object.fromEntries(placements.map(({ placement }) => [placement.template_file, placement.uuid])) }
            : channelFile.uuids;
        return {
            entry: { widget, channelFile }, uuids, problems, changed: !isDeepStrictEqual(uuids, recordedNow),
        };
    });
}
