// The store-write helper's endpoint allowlist (W0-11, plan/build-pipeline.md section 2), with
// Shaun's answers of 2026-10-06 applied (decisions 3 and 4: yes).
//
//   import { classify, calendarRefusal } from './allowlist.mjs';
//   const what = classify({ method, path, query, body }, { mode: 'lifted' });   // or throws Refused
//
// Two modes:
//
// - lifted: what agents may write on ReelFlies_CA (1895766) under Shaun's 2026-10-06 grant.
//   - widget templates, widgets and placements (Widgets and Page Builder content)
//   - Web Pages, Script Manager scripts (created disabled) and custom template associations
//     (decision 4; decision 3 gives the writer account Themes: modify for the associations)
//   - the channel settings below, each only once plan.mjs has proved parts 1 and 2 of ticket
//     21's three-part test by its own reads (settings-proof.mjs)
// - approved: store-wide settings and promotions that Shaun approved on a review page. Only he
//   runs them, with `apply.mjs --approved` at his own terminal and a token he pastes there.
//
// Never, in either mode: Customers, Orders, the catalogue, theme activation or deletion, the
// storefront's status. Never in lifted mode: promotions. Anything not listed is refused, so the
// list is deny-by-default. DELETE isn't listed yet: no ticket needs one, and a DELETE carries
// no channel_id to check. Add it with a snapshot-proved channel when one does.
//
// The channel check (every write names 1895766) is channel.mjs's; this file says what may be
// written at all.

import { describePhase } from '../lib/release-calendar.mjs';

export class Refused extends Error {
    constructor(message) {
        super(message);
        this.name = 'Refused';
    }
}

// Created with POST to `base`, updated with PUT to `base/<id>`. A list read filtered to the
// channel (`listChannelQuery`) is a create's snapshot; the item read is an update's.
export const ENTITIES = {
    'widget-templates': {
        base: '/v3/content/widget-templates', kind: 'widget', idField: 'uuid', listChannelQuery: 'channel_id:in', nameField: 'name',
    },
    widgets: {
        base: '/v3/content/widgets', kind: 'widget', idField: 'uuid', listChannelQuery: 'channel_id:in', nameField: 'name',
    },
    placements: {
        base: '/v3/content/placements', kind: 'widget', idField: 'uuid', listChannelQuery: 'channel_id:in', nameField: 'region',
    },
    pages: {
        base: '/v3/content/pages', kind: 'page', idField: 'id', listChannelQuery: 'channel_id', nameField: 'name', arrayCreate: true,
    },
    scripts: {
        base: '/v3/content/scripts', kind: 'script', idField: 'uuid', listChannelQuery: 'channel_id:in', nameField: 'name',
    },
};

// One upsert of an array of { channel_id, entity_type, entity_id, file_name }. Its reads need
// the Themes scope, which only the writer account has (W0-12), so plans read it with that token.
export const TEMPLATE_ASSOCIATIONS = {
    base: '/v3/storefront/custom-template-associations', kind: 'template-association', listChannelQuery: 'channel_id', readToken: 'write',
};
const ENTITY_TYPES = ['product', 'category', 'brand', 'page'];
const ASSOCIATION_KEYS = ['channel_id', 'entity_type', 'entity_id', 'file_name'];

// PUT /v3/settings/<path>?channel_id=1895766. Each is written only after the three-part test's
// parts 1 and 2 are proved by reads (settings-proof.mjs). `globalOnly` lists the fields
// BigCommerce documents as global-only, refused whatever the reads say.
export const CHANNEL_SETTINGS = {
    inventory: { globalOnly: [] },
    'storefront/category': { globalOnly: [] },
    'storefront/search': { globalOnly: ['product_filtering_enabled'] },
    'storefront/product': { globalOnly: [] },
    'storefront/security': { globalOnly: [] },
    'storefront/seo': { globalOnly: [] },
    'storefront/robotstxt': { globalOnly: [] },
    'store/profile': { globalOnly: ['store_address_type', 'store_country'] },
    logo: { globalOnly: [] },
};

// Approved mode: the same settings written store-wide (no channel_id), plus Product Filtering's
// store-wide list (ticket 21), whose reads take no channel.
export const APPROVED_SETTINGS = {
    ...Object.fromEntries(Object.keys(CHANNEL_SETTINGS).map(key => [key, { channelReads: true }])),
    'search/filters': { channelReads: false },
};

export const PROMOTIONS = {
    base: '/v3/promotions', kind: 'promotion', idField: 'id', nameField: 'name',
};

// Checked first, case-insensitively, in both modes (promotions in lifted mode only).
export const NEVER = [
    { prefixes: ['/v2/customers', '/v3/customers', '/v2/customer_groups', '/v3/customer'], what: 'Customers' },
    { prefixes: ['/v2/orders', '/v3/orders'], what: 'Orders' },
    { prefixes: ['/v3/catalog', '/v2/products', '/v2/categories', '/v2/brands', '/v2/options', '/v2/option_sets', '/v3/settings/catalog', '/v3/inventory', '/v3/pricelists'], what: 'the catalogue' },
    {
        prefixes: ['/v3/promotions', '/v2/coupons'], what: 'promotions', lifted: true,
    },
    { prefixes: ['/v3/themes', '/v3/channels'], what: 'themes and channels (activation, deletion, uploads, channel status)' },
    { prefixes: ['/v3/settings/storefront/status'], what: 'the storefront\'s status (prelaunch, maintenance or live)' },
    { prefixes: ['/v3/payments', '/v3/checkouts', '/v3/carts', '/v2/gift_certificates'], what: 'checkout, carts and payments' },
];

const PATH = /^\/v[23](\/[a-z0-9_-]+)+$/;
const ID = /^[A-Za-z0-9-]{1,64}$/;

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const label = request => `${request.method} ${request.path}`;

function neverReason(path, mode) {
    const lower = path.toLowerCase();
    const hit = NEVER.find(({ prefixes, lifted }) => (!lifted || mode === 'lifted') && prefixes.some(prefix => lower === prefix || lower.startsWith(`${prefix}/`) || lower.startsWith(`${prefix}_`)));
    return hit ? `${label({ method: '', path }).trim()} is never written by the helper: ${hit.what}` : null;
}

function checkShape(request) {
    if (!isObject(request)) throw new Refused('a request must be an object with method, path, query and body');
    const unknown = Object.keys(request).find(key => !['method', 'path', 'query', 'body'].includes(key));
    if (unknown) throw new Refused(`${label(request)}: unknown field "${unknown}" (a request has method, path, query and body)`);
    if (typeof request.path !== 'string' || !PATH.test(request.path.toLowerCase())) {
        throw new Refused(`${JSON.stringify(request.path)} isn't a plain API path: /v3/… with no "..", query, "#", "%", repeated or trailing slash`);
    }
    if (request.query !== undefined && !isObject(request.query)) throw new Refused(`${label(request)}: the query must be an object`);
}

function checkMethod(request, mode) {
    const never = neverReason(request.path, mode);
    if (never) throw new Refused(never);
    if (request.method === 'GET') throw new Refused(`${label(request)}: a plan holds writes (POST or PUT) only; its reads are the snapshot`);
    if (request.method !== 'POST' && request.method !== 'PUT') throw new Refused(`${label(request)}: ${request.method} isn't on the allowlist (scripts/store/allowlist.mjs)`);
    if (request.path !== request.path.toLowerCase()) throw new Refused(`${label(request)}: paths are lower-case`);
}

const noQuery = request => {
    if (request.query && Object.keys(request.query).length) throw new Refused(`${label(request)} takes no query: the channel goes in the body`);
};

function entityRules(object, action, request) {
    const { body } = request;
    const { arrayCreate } = ENTITIES[object];
    const items = action === 'create' && arrayCreate && Array.isArray(body) ? body : [body];
    if (!items.length || !items.every(isObject)) throw new Refused(`${label(request)} needs a JSON object body${arrayCreate ? ' (or a non-empty array of objects)' : ''}`);
    if (object === 'scripts') {
        if (action === 'create' && body.enabled !== false) throw new Refused(`${label(request)}: scripts are created disabled: "enabled": false (decision 4)`);
        if (action === 'update' && 'enabled' in body && body.enabled !== false) throw new Refused(`${label(request)}: enabling a script is Shaun's, in the control panel; an update may only keep it disabled`);
    }
}

function associationRules(request) {
    const { body } = request;
    if (!Array.isArray(body) || !body.length) throw new Refused(`${label(request)} needs a non-empty array of associations`);
    body.forEach((item, index) => {
        const where = `${label(request)} item ${index + 1}`;
        if (!isObject(item)) throw new Refused(`${where} isn't an object`);
        const unknown = Object.keys(item).find(key => !ASSOCIATION_KEYS.includes(key));
        if (unknown) throw new Refused(`${where}: unknown field "${unknown}" (${ASSOCIATION_KEYS.join(', ')})`);
        if (!ENTITY_TYPES.includes(item.entity_type)) throw new Refused(`${where}: entity_type ${JSON.stringify(item.entity_type)} isn't product, category, brand or page`);
        if (!Number.isInteger(item.entity_id) || item.entity_id < 1) throw new Refused(`${where}: entity_id must be a positive integer`);
        if (typeof item.file_name !== 'string' || !item.file_name.trim()) throw new Refused(`${where}: file_name must name the custom template`);
    });
}

function settingsRules(request, mode) {
    const { body } = request;
    const takesArray = mode === 'approved' && request.path === '/v3/settings/search/filters';
    if (takesArray ? !Array.isArray(body) || !body.length : !isObject(body) || !Object.keys(body).length) {
        throw new Refused(`${label(request)}: the body must name at least one setting`);
    }
    if (!takesArray && 'channel_id' in body) throw new Refused(`${label(request)}: channel_id goes in the query, not the body`);
    const keys = Object.keys(request.query || {});
    if (mode === 'approved' && keys.length) throw new Refused(`${label(request)}: an approved settings write is store-wide: no query`);
}

function classifyLifted(request) {
    const { path, method } = request;
    for (const [object, entity] of Object.entries(ENTITIES)) {
        const id = path.startsWith(`${entity.base}/`) ? path.slice(entity.base.length + 1) : null;
        if (path === entity.base || (id && ID.test(id))) {
            if (path === entity.base && method !== 'POST') throw new Refused(`${label(request)} isn't on the allowlist: a create is POST to ${entity.base}`);
            if (id && method !== 'PUT') throw new Refused(`${label(request)} isn't on the allowlist: an update is PUT to ${entity.base}/<id>`);
            const action = id ? 'update' : 'create';
            noQuery(request);
            entityRules(object, action, request);
            return {
                object, kind: entity.kind, action, id, entity,
            };
        }
    }
    if (path === TEMPLATE_ASSOCIATIONS.base && method === 'PUT') {
        noQuery(request);
        associationRules(request);
        return {
            object: 'custom-template-associations', kind: TEMPLATE_ASSOCIATIONS.kind, action: 'upsert', id: null, entity: TEMPLATE_ASSOCIATIONS,
        };
    }
    const settingsPath = path.startsWith('/v3/settings/') ? path.slice('/v3/settings/'.length) : null;
    if (settingsPath && CHANNEL_SETTINGS[settingsPath] && method === 'PUT') {
        settingsRules(request, 'lifted');
        return {
            object: `settings/${settingsPath}`, kind: 'settings', action: 'settings', id: null, settingsPath, entity: CHANNEL_SETTINGS[settingsPath],
        };
    }
    throw new Refused(`${label(request)} isn't on the allowlist (scripts/store/allowlist.mjs): lifted writes are widgets, placements, widget templates, Web Pages, scripts, template associations and the listed channel settings`);
}

function classifyApproved(request) {
    const { path, method } = request;
    const settingsPath = path.startsWith('/v3/settings/') ? path.slice('/v3/settings/'.length) : null;
    if (settingsPath && APPROVED_SETTINGS[settingsPath] && method === 'PUT') {
        settingsRules(request, 'approved');
        return {
            object: `settings/${settingsPath}`, kind: 'settings', action: 'settings', id: null, settingsPath, entity: APPROVED_SETTINGS[settingsPath],
        };
    }
    const id = path.startsWith(`${PROMOTIONS.base}/`) ? path.slice(PROMOTIONS.base.length + 1) : null;
    if ((path === PROMOTIONS.base && method === 'POST') || (id && ID.test(id) && method === 'PUT')) {
        if (request.query && Object.keys(request.query).length) throw new Refused(`${label(request)} takes no query`);
        if (!isObject(request.body)) throw new Refused(`${label(request)} needs a JSON object body`);
        return {
            object: 'promotions', kind: 'promotion', action: id ? 'update' : 'create', id, entity: PROMOTIONS,
        };
    }
    throw new Refused(`${label(request)}: approved mode covers store-wide settings and promotions only (scripts/store/allowlist.mjs)`);
}

// What a request writes, or Refused naming why it may not.
export function classify(request, { mode = 'lifted' } = {}) {
    if (mode !== 'lifted' && mode !== 'approved') throw new Refused(`unknown mode ${JSON.stringify(mode)} (lifted or approved)`);
    checkShape(request);
    checkMethod(request, mode);
    return mode === 'lifted' ? classifyLifted(request) : classifyApproved(request);
}

// Unpublishing a widget: its placement set inactive, and nothing else changed (ticket 57:22).
export function isUnpublish(what, request) {
    return what.object === 'placements' && what.action === 'update' && isObject(request.body)
        && request.body.status === 'inactive' && Object.keys(request.body).every(key => key === 'status' || key === 'channel_id');
}

// The phases from the Flip on (scripts/lib/release-calendar.mjs).
const AFTER_FLIP = ['T-0', 'T+30'];

// The release calendar (W0-13), for lifted writes:
// - from T-14, new widgets, placements and widget content edits are refused, and only
//   unpublishing is allowed (ticket 57).
// - from the Flip, 1895766 is live reelflies.ca, so every other lifted write is refused too, as
//   writes to channel 1 are Shaun's (HANDOFF), until he says otherwise (ticket 58). Revisitable.
// The limits only tighten. Shaun's approved writes aren't limited by the calendar.
export function calendarRefusal(what, request, phase, mode = 'lifted') {
    if (mode !== 'lifted' || isUnpublish(what, request)) return null;
    if (what.kind === 'widget' && phase.limits.widgetEdits === 'unpublish-only') {
        return `${label(request)}: from T-14 widgets may only be unpublished (ticket 57): a placement PUT with only "status": "inactive". ${describePhase(phase)}`;
    }
    if (AFTER_FLIP.includes(phase.phase)) {
        return `${label(request)}: after the Flip 1895766 is live reelflies.ca: lifted writes there are refused, bar unpublishing a widget, until Shaun says otherwise (ticket 58). ${describePhase(phase)}`;
    }
    return null;
}
