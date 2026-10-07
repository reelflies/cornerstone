import test from 'node:test';
import assert from 'node:assert/strict';
import {
    READS,
    SETTINGS_SCOPES,
    findPlaceholders,
    probeFilterContexts,
    probeFreeShippingPromotions,
    settingsInheritance,
} from './api-probes.mjs';

test('every read is a GET on a settings, catalogue tree, promotion or blog path, never a write', () => {
    assert.ok(READS.length > 0);
    READS.forEach(read => {
        assert.equal(read.method, 'GET', read.id);
        assert.match(read.path, /^\/(v3\/settings\/|v3\/catalog\/trees|v3\/promotions$|v2\/blog\/posts$|v3\/catalog\/products$)/, read.id);
        assert.ok(!/codes|customers|orders/i.test(read.path), read.id);
    });
});

test('the reads name only the three storefronts\' channels, or none (the global value)', () => {
    READS.forEach(read => {
        const channel = read.query && (read.query.channel_id ?? null);
        assert.ok(channel === null || [1, 1855224, 1895766].includes(channel), `${read.id}: ${channel}`);
    });
    assert.deepEqual(SETTINGS_SCOPES.map(scope => scope.channel_id ?? 'global'), ['global', 1895766, 1, 1855224]);
});

test('the read ids are unique, so the evidence can key on them', () => {
    const ids = READS.map(read => read.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('settingsInheritance marks null channel fields as inherited and names an override', () => {
    const global = { data: { listing_mode: 'current_category_only', default_product_sort: 'featured', category_tree_depth: 3 } };
    const channel = { data: { listing_mode: null, default_product_sort: 'bestselling', category_tree_depth: 3 } };
    const result = settingsInheritance(global, channel);
    assert.equal(result.identical, false);
    assert.deepEqual(result.fields, [
        {
            key: 'category_tree_depth', global: 3, channel: 3, state: 'set, same as global',
        },
        {
            key: 'default_product_sort', global: 'featured', channel: 'bestselling', state: 'overrides',
        },
        {
            key: 'listing_mode', global: 'current_category_only', channel: null, state: 'inherits',
        },
    ]);
});

test('settingsInheritance flags a channel read identical to the global one, which proves nothing about channel_id', () => {
    const body = { data: { a: 1, b: 'x' } };
    assert.equal(settingsInheritance(body, structuredClone(body)).identical, true);
});

test('settingsInheritance compares a list setting whole', () => {
    const list = { data: [{ id: 'a', is_enabled: true }] };
    assert.deepEqual(settingsInheritance(list, structuredClone(list)), { identical: true, fields: [], list: true });
    assert.equal(settingsInheritance(list, { data: [] }).identical, false);
});

test('settingsInheritance names fields only one side has', () => {
    const result = settingsInheritance({ data: { a: 1 } }, { data: { b: 2 } });
    assert.deepEqual(result.fields.map(field => [field.key, field.state]), [['a', 'missing in channel read'], ['b', 'missing in global read']]);
});

test('settingsInheritance turns an error response into its status', () => {
    const result = settingsInheritance({ data: { a: 1 } }, null, { channelStatus: 422 });
    assert.equal(result.error, 'channel read answered 422');
});

test('probeFilterContexts lists each context\'s channel, category and enabled filters', () => {
    const body = {
        data: [
            {
                context: { channel_id: 1, category_id: 21 },
                data: [{
                    id: 'cHJpY2U=', display_name: 'Price', type: 'price', is_enabled: true,
                }, {
                    id: 'x', display_name: 'Size', type: 'product', is_enabled: false,
                }],
            },
            { context: { channel_id: 1 }, data: [] },
        ],
    };
    assert.deepEqual(probeFilterContexts(body), {
        contexts: 2,
        channels: [1],
        rows: [
            {
                channel_id: 1, category_id: 21, filters: 2, enabled: ['Price'],
            },
            {
                channel_id: 1, category_id: null, filters: 0, enabled: [],
            },
        ],
    });
});

test('findPlaceholders finds %%…%%, {{…}} and {…} tokens in banner text', () => {
    assert.deepEqual(findPlaceholders('Spend %%REMAINING%% more for {{ promotion.name }} or {amount_left}.'), ['%%REMAINING%%', '{{ promotion.name }}', '{amount_left}']);
    assert.deepEqual(findPlaceholders('Free shipping over $99!<div>&nbsp;</div>'), []);
});

const promotions = {
    data: [
        {
            id: 7,
            name: 'Free shipping $99',
            redemption_type: 'AUTOMATIC',
            status: 'ENABLED',
            channels: [{ id: 1 }, { id: 1895766 }],
            currency_code: 'CAD',
            rules: [{ action: { shipping: { free_shipping: true, zone_ids: '*' } }, condition: { cart: { minimum_spend: '99' } } }],
            notifications: [
                { type: 'UPSELL', content: '<p>Spend %%X%% more</p>', locations: ['CART_PAGE'] },
                { type: 'APPLIED', content: 'You got free shipping', locations: ['CART_PAGE'] },
            ],
            codes: [{ code: 'NEVER-PRINTED' }],
        },
        {
            id: 8, name: '10% off', redemption_type: 'COUPON', status: 'ENABLED', rules: [{ action: { cart_value: { discount: { percentage_amount: '10' } } } }],
        },
    ],
};

test('probeFreeShippingPromotions keeps free-shipping promotions only, with their banners and placeholders', () => {
    const result = probeFreeShippingPromotions(promotions);
    assert.equal(result.promotions, 2);
    assert.equal(result.withNotifications, 1);
    assert.deepEqual(result.freeShipping, [{
        id: 7,
        name: 'Free shipping $99',
        redemption_type: 'AUTOMATIC',
        status: 'ENABLED',
        channels: [1, 1895766],
        currency_code: 'CAD',
        minimum_spend: ['99'],
        notifications: [
            {
                type: 'UPSELL', locations: ['CART_PAGE'], text: 'Spend %%X%% more', placeholders: ['%%X%%'],
            },
            {
                type: 'APPLIED', locations: ['CART_PAGE'], text: 'You got free shipping', placeholders: [],
            },
        ],
    }]);
    assert.ok(!JSON.stringify(result).includes('NEVER-PRINTED'), 'coupon codes are never kept');
});
