import test from 'node:test';
import assert from 'node:assert/strict';
import {
    flattenCategories,
    probeBlogPaths,
    probeCardCustomFields,
    probeCarousel,
    probeFlags,
    probeMenuDepth,
    probeMenuImages,
    probeMenuOrder,
    probeRootRollup,
    probeSubcategoryImages,
} from './context-probes.mjs';

// Shaped on stencil start's ?debug=context: the categories global nests `children`, and a leaf
// may have no `children` key at all.
const home = {
    settings: { channel_id: 1 },
    categories: [
        {
            id: '398',
            name: 'Flies',
            url: 'https://reelflies.ca/flies/',
            image: { data: 'https://cdn.example/flies.jpg', alt: 'Flies' },
            children: [
                {
                    id: '298', name: 'Dry Flies', url: 'https://reelflies.ca/flies/dry-flies/', image: { data: 'https://cdn.example/dry.jpg' },
                },
                {
                    id: '251', name: 'Nymphs', url: 'https://reelflies.ca/flies/nymphs/', image: null,
                },
            ],
        },
        {
            id: '400', name: 'Fly Gear', url: 'https://reelflies.ca/fly-gear/', children: [],
        },
    ],
    carousel: { slides: [{ heading: 'One' }, { heading: 'Two' }], swap_frequency: 10000 },
};

test('flattenCategories walks the categories global depth first, with depth and parent', () => {
    const rows = flattenCategories(home.categories);
    assert.deepEqual(rows.map(({ id, depth, parentId }) => [id, depth, parentId]), [
        ['398', 1, null],
        ['298', 2, '398'],
        ['251', 2, '398'],
        ['400', 1, null],
    ]);
    assert.deepEqual(rows.map(row => row.image), ['https://cdn.example/flies.jpg', 'https://cdn.example/dry.jpg', null, null]);
    assert.deepEqual(rows.map(row => row.hasImageKey), [true, true, true, false]);
});

test('probe 1 passes when every menu category carries an image field, and names those without a value', () => {
    const result = probeMenuImages(home);
    assert.equal(result.categories, 4);
    assert.equal(result.withImageKey, 3);
    assert.equal(result.withImage, 2);
    assert.equal(result.verdict, 'fail');
    assert.deepEqual(result.withoutImageKey, ['Fly Gear (400)']);

    const all = probeMenuImages({ categories: [{ id: '1', name: 'A', image: null }, { id: '2', name: 'B', image: { data: 'x' } }] });
    assert.equal(all.verdict, 'pass');
    assert.deepEqual(all.withoutImage, ['A (1)']);
});

test('probe 1 has no data on a channel whose menu is empty', () => {
    const result = probeMenuImages({ categories: [] });
    assert.equal(result.verdict, 'no data');
    assert.equal(result.categories, 0);
});

test('probe 2 records the depth the categories global renders, and the count per level', () => {
    assert.deepEqual(probeMenuDepth(home), { depth: 2, perLevel: { 1: 2, 2: 2 }, categories: 4 });
    assert.deepEqual(probeMenuDepth({ categories: [] }), { depth: 0, perLevel: {}, categories: 0 });
});

const tree = [
    {
        category_id: 398, parent_id: 0, name: 'Flies', sort_order: 1, is_visible: true,
    },
    {
        category_id: 400, parent_id: 0, name: 'Fly Gear', sort_order: 3, is_visible: true,
    },
    {
        category_id: 401, parent_id: 0, name: 'Hidden', sort_order: 2, is_visible: false,
    },
    {
        category_id: 298, parent_id: 398, name: 'Dry Flies', sort_order: 0, is_visible: true,
    },
    {
        category_id: 251, parent_id: 398, name: 'Nymphs', sort_order: 0, is_visible: true,
    },
];

test('probe 3 passes when every sibling group follows sort_order, then name, and counts the ties that test the name rule', () => {
    const result = probeMenuOrder(home, tree);
    assert.equal(result.verdict, 'pass');
    assert.equal(result.groups, 2);
    assert.equal(result.mismatches.length, 0);
    assert.equal(result.tieGroups, 1, 'Dry Flies and Nymphs share sort_order 0, so the name decides');
    assert.equal(result.missingFromTree.length, 0);
});

test('probe 3 fails a sibling group out of order and shows both orders', () => {
    const swapped = tree.map(row => (row.category_id === 298 ? { ...row, sort_order: 5 } : row));
    const result = probeMenuOrder(home, swapped);
    assert.equal(result.verdict, 'fail');
    assert.deepEqual(result.mismatches, [{ parent: 'Flies (398)', rendered: ['Dry Flies', 'Nymphs'], expected: ['Nymphs', 'Dry Flies'] }]);
});

test('probe 3 compares names without regard to case, as the menu reads them', () => {
    const rows = [
        {
            category_id: 1, parent_id: 0, name: 'beta', sort_order: 0, is_visible: true,
        },
        {
            category_id: 2, parent_id: 0, name: 'Alpha', sort_order: 0, is_visible: true,
        },
    ];
    const context = { categories: [{ id: '2', name: 'Alpha' }, { id: '1', name: 'beta' }] };
    assert.equal(probeMenuOrder(context, rows).verdict, 'pass');
});

test('probe 3 names a rendered category the tree read lacks, and has no data without a menu', () => {
    const result = probeMenuOrder({ categories: [{ id: '9', name: 'Stray' }] }, tree);
    assert.deepEqual(result.missingFromTree, ['Stray (9)']);
    assert.equal(probeMenuOrder({ categories: [] }, tree).verdict, 'no data');
});

const category = {
    template_file: 'pages/category',
    category: {
        products: [
            { id: 1, name: 'A', custom_fields: null },
            { id: 2, name: 'B', custom_fields: [{ name: 'Sold by', value: 'fly' }] },
            { id: 3, name: 'C' },
        ],
        subcategories: [
            { id: 11, name: 'Sub one', image: { data: 'x' } },
            { id: 12, name: 'Sub two', image: null },
        ],
    },
};

test('probe 4 passes when a card carries custom field values, and counts cards with the key', () => {
    const result = probeCardCustomFields(category);
    assert.deepEqual(result, {
        cards: 3, withKey: 2, withValues: 1, verdict: 'pass', fieldNames: ['Sold by'],
    });
});

test('probe 4 is partial when cards carry the key but every value is null', () => {
    const result = probeCardCustomFields({ category: { products: [{ id: 1, custom_fields: null }] } });
    assert.equal(result.verdict, 'partial');
    assert.equal(probeCardCustomFields({ category: { products: [{ id: 1 }] } }).verdict, 'fail');
    assert.equal(probeCardCustomFields({ category: { products: [] } }).verdict, 'no data');
});

test('probe 5 counts the carousel slides the home front matter returns', () => {
    assert.deepEqual(probeCarousel(home), { slides: 2, verdict: 'informational', present: true });
    assert.deepEqual(probeCarousel({}), { slides: 0, verdict: 'informational', present: false });
});

test('probe 7 reads the multi-coupon flag from the cart and semantic search from the page', () => {
    assert.deepEqual(probeFlags({ cart: { multi_coupon_ui_enabled: true } }, { semantic_search_enabled: null }), {
        multiCouponUiEnabled: true, semanticSearchEnabled: false, semanticSearchKey: false,
    });
    assert.deepEqual(probeFlags({ cart: {} }, { semantic_search_enabled: true }), {
        multiCouponUiEnabled: null, semanticSearchEnabled: true, semanticSearchKey: true,
    });
});

test('probe 14 counts subcategories with an image field and with a value', () => {
    assert.deepEqual(probeSubcategoryImages(category), {
        subcategories: 2, withImageKey: 2, withImage: 1, verdict: 'pass', withoutImage: ['Sub two (12)'],
    });
    assert.equal(probeSubcategoryImages({ category: { subcategories: [{ id: 1, name: 'X' }] } }).verdict, 'fail');
    assert.equal(probeSubcategoryImages({ category: { subcategories: [] } }).verdict, 'no data');
});

test('probe 15 turns the blog context posts into paths on the local server', () => {
    const blog = {
        blog: {
            url: 'https://store.example/blog/',
            posts: [{ url: 'https://store.example/blog/one/' }, { url: 'https://store.example/blog/two/?x=1' }],
        },
    };
    assert.deepEqual(probeBlogPaths(blog), ['/blog/', '/blog/one/', '/blog/two/?x=1']);
    assert.deepEqual(probeBlogPaths({}), []);
});

test('probe 8 passes when every root with no products of its own still lists products', () => {
    const roots = [
        {
            id: '398', name: 'Flies', path: '/flies/', listed: 2215, cards: 12,
        },
        {
            id: '400', name: 'Fly Gear', path: '/fly-gear/', listed: 40, cards: 12,
        },
    ];
    const result = probeRootRollup(roots, { 398: 0, 400: 5 });
    assert.equal(result.verdict, 'pass');
    assert.deepEqual(result.rows.map(row => [row.id, row.direct, row.rollsUp]), [['398', 0, true], ['400', 5, null]]);
});

test('probe 8 fails a root with no products of its own that lists none, and is partial when every root has its own', () => {
    const empty = probeRootRollup([{
        id: '1', name: 'Species', path: '/species/', listed: 0, cards: 0,
    }], { 1: 0 });
    assert.equal(empty.verdict, 'fail');
    const own = probeRootRollup([{
        id: '1', name: 'A', path: '/a/', listed: 3, cards: 3,
    }], { 1: 3 });
    assert.equal(own.verdict, 'partial');
    assert.equal(probeRootRollup([], {}).verdict, 'no data');
});
