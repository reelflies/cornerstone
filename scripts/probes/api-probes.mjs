// Ticket 07's API probes (6, 7, 10 and 12), and the reads behind probes 3, 4 and 15: GETs only,
// with the read-only store API token (scripts/lib/store-token.mjs), through the store helper's
// read-only client. Pure functions and the list of reads; run.mjs sends them.
//
// - Probe 6 is read-only for agents (plan/build-pipeline.md, lane G): the filter contexts are
//   read with and without channel_id. A trial PUT could reach channel 1 or every channel, so it
//   goes in Shaun's approval batch.
// - Probe 10 reads each setting at four scopes: global, 1895766, 1 and 1855224 (as ticket 21 does).
// - Probe 12 reads the promotions and keeps only the free-shipping ones' banners. Coupon codes
//   are a separate endpoint, which is never read, and no other field is kept.

export const CHANNEL_CA = 1895766;

export const SETTINGS_SCOPES = [{}, { channel_id: CHANNEL_CA }, { channel_id: 1 }, { channel_id: 1855224 }];

const scopeName = query => (query.channel_id ? String(query.channel_id) : 'global');

export const SETTINGS = [
    { name: 'storefront-category', path: '/v3/settings/storefront/category', probes: [2, 8, 10] },
    { name: 'storefront-search', path: '/v3/settings/storefront/search', probes: [7, 10] },
    { name: 'inventory', path: '/v3/settings/inventory', probes: [10] },
    { name: 'search-filters', path: '/v3/settings/search/filters', probes: [6, 10] },
];

export const READS = [
    ...SETTINGS.flatMap(setting => SETTINGS_SCOPES.map(query => ({
        id: `settings:${setting.name}:${scopeName(query)}`, method: 'GET', path: setting.path, query, probes: setting.probes,
    }))),
    ...[{}, { channel_id: CHANNEL_CA }, { channel_id: 1 }].map(query => ({
        id: `filter-contexts:${scopeName(query)}`, method: 'GET', path: '/v3/settings/search/filters/contexts', query, probes: [6],
    })),
    {
        id: 'trees', method: 'GET', path: '/v3/catalog/trees', query: {}, probes: [3],
    },
    {
        id: 'promotions', method: 'GET', path: '/v3/promotions', query: { limit: 50 }, probes: [12], pages: true,
    },
    {
        id: 'blog-posts', method: 'GET', path: '/v2/blog/posts', query: { limit: 250 }, probes: [15], pages: true,
    },
];

// The tree's categories (probe 3), read once run.mjs knows the channel's tree id.
export const treeCategoriesRead = treeId => ({
    id: `tree-categories:${treeId}`, method: 'GET', path: '/v3/catalog/trees/categories', query: { 'tree_id:in': treeId, limit: 250 }, probes: [3], pages: true,
});

// How many products are assigned to a category directly (probe 8): only the total is read.
export const directProductsRead = categoryId => ({
    id: `direct-products:${categoryId}`, method: 'GET', path: '/v3/catalog/products', query: { 'categories:in': categoryId, include_fields: 'id', limit: 1 }, probes: [8],
});

// A page of products with their custom fields (probe 4: a product that has one, to render its
// category). Only ids, names, categories and the fields are asked for.
export const productsWithFieldsRead = page => ({
    id: `products-custom-fields:${page}`,
    method: 'GET',
    path: '/v3/catalog/products',
    query: {
        include: 'custom_fields', include_fields: 'id,name,categories,is_visible', limit: 250, page,
    },
    probes: [4],
});

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Probe 10: a channel's settings read beside the global one. A null channel field inherits the
// global value (BigCommerce's documented meaning). `identical` is true when the whole channel
// answer equals the global one, which could mean the endpoint ignores channel_id.
export function settingsInheritance(globalBody, channelBody, { globalStatus = 200, channelStatus = 200 } = {}) {
    if (!globalBody || !globalBody.data) return { error: `global read answered ${globalStatus}`, fields: [], identical: false };
    if (!channelBody || !channelBody.data) return { error: `channel read answered ${channelStatus}`, fields: [], identical: false };
    const global = globalBody.data;
    const channel = channelBody.data;
    // A list setting (the enabled filters) is compared whole: its items have no channel nulls.
    if (Array.isArray(global) || Array.isArray(channel)) return { identical: sameValue(global, channel), fields: [], list: true };
    const keys = [...new Set([...Object.keys(global), ...Object.keys(channel)])].sort();
    const fields = keys.map(key => {
        let state;
        if (!Object.hasOwn(channel, key)) state = 'missing in channel read';
        else if (!Object.hasOwn(global, key)) state = 'missing in global read';
        else if (channel[key] === null) state = 'inherits';
        else if (sameValue(channel[key], global[key])) state = 'set, same as global';
        else state = 'overrides';
        return {
            key, global: global[key], channel: channel[key], state,
        };
    });
    return { identical: sameValue(global, channel), fields };
}

// Probe 6: the contextual filter overrides a read returns.
export function probeFilterContexts(body) {
    const rows = ((body && body.data) || []).map(({ context = {}, data = [] }) => ({
        channel_id: context.channel_id ?? null,
        category_id: context.category_id ?? null,
        filters: data.length,
        enabled: data.filter(filter => filter.is_enabled).map(filter => filter.display_name),
    }));
    return { contexts: rows.length, channels: [...new Set(rows.map(row => row.channel_id))].sort((a, b) => a - b), rows };
}

const PLACEHOLDER = /%%[^%\s]+%%|\{\{[^}]+\}\}|\{[a-z_]+\}/gi;

export const findPlaceholders = text => String(text || '').match(PLACEHOLDER) || [];

const textOf = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
    .trim();

const isFreeShipping = promotion => (promotion.rules || []).some(rule => rule.action && rule.action.shipping && rule.action.shipping.free_shipping === true);

// Probe 12: the free-shipping promotions and their banners, with any placeholder they use.
export function probeFreeShippingPromotions(body) {
    const all = (body && body.data) || [];
    const freeShipping = all.filter(isFreeShipping).map(promotion => ({
        id: promotion.id,
        name: promotion.name,
        redemption_type: promotion.redemption_type,
        status: promotion.status,
        channels: (promotion.channels || []).map(channel => channel.id),
        currency_code: promotion.currency_code ?? null,
        minimum_spend: (promotion.rules || []).map(rule => rule.condition && rule.condition.cart && rule.condition.cart.minimum_spend).filter(Boolean),
        notifications: (promotion.notifications || []).map(notification => ({
            type: notification.type,
            locations: notification.locations || [],
            text: textOf(notification.content),
            placeholders: findPlaceholders(notification.content),
        })),
    }));
    return { promotions: all.length, withNotifications: all.filter(promotion => (promotion.notifications || []).length).length, freeShipping };
}
