// The redesign's home page rendered from fixed data, for the home assertions' tests
// (scripts/qa/raw-html/assertions/home-*.test.mjs). templates/pages/home.html renders inside the
// fixture layout (scripts/qa/render/widget-layout.html: components/reelflies/head sets the page
// variables the partials read, the icon sheet, and the header and footer only with `chrome`),
// with the store data the real page gets: the categories tree the menu ids name, the six best
// sellers as Stencil cards (products.top_sellers) and the GraphQL front matter's results
// (gql.data.site: best, hatch, sig, sel), so every band renders as stencil start serves it.
//
//   const page = await homePage();                       // every band, quick add on
//   const page = await homePage({ theme_settings: { rf_quick_add: false } });
//   const page = await homePage({ chrome: true });       // with the header's menu panes
//
// A test breaks one promise at a time by editing page.html, as the widget-era tests edited a
// widget's render. The ids are tree 1's where the real page has them (the Fly Types, the
// Signature category 434, the Selections category 399, the hatch rows' flies in config.json),
// so the channel-1 variation's settings find them too.

import fs from 'fs';
import { renderPartial } from '../render/render.mjs';

const LAYOUT = fs.readFileSync(new URL('../render/widget-layout.html', import.meta.url), 'utf8');
export const CDN = 'https://cdn11.bigcommerce.com/s-fixture/images/stencil';
const stencilImage = file => ({ data: `${CDN}/{:size}/${file}`, alt: '' });

// The categories tree: Flies with the five Fly Types under it (tree 1 files them under Flies,
// each a level deeper than the menu's depth would show without Menu Display Depth 3), the
// Species root with six species, and the Selections category.
const kids = (parent, names) => names.map(([id, name], index) => ({
    id, name, url: `${parent}${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}/`, count: 40 + index, children: [],
}));
export const TYPES = [
    {
        id: 298, name: 'Dry Flies', url: '/flies/dry-flies/', count: 501, image: stencilImage('i/dry-flies.jpg'), children: kids('/flies/dry-flies/', [[301, 'Parachutes'], [302, 'Caddis'], [303, 'Mayflies'], [304, 'Terrestrials'], [305, 'Attractors'], [306, 'Midges']]),
    },
    {
        id: 251, name: 'Nymphs & Sub Surface Flies', url: '/flies/nymphs-sub-surface-flies/', count: 1446, image: stencilImage('n/nymphs.jpg'), children: kids('/flies/nymphs-sub-surface-flies/', [[311, 'Beadheads'], [312, 'Emergers'], [313, 'Stoneflies']]),
    },
    {
        id: 255,
        name: 'Streamers & Buggers',
        url: '/flies/streamers-buggers/',
        count: 389,
        image: stencilImage('l/streamers.jpg'),
        children: [...kids('/flies/streamers-buggers/', [[321, 'Woolly Buggers'], [322, 'Leeches']]), {
            id: 434, name: 'ReelFlies Signature Flies', url: '/flies/streamers-buggers/reelflies-signature-flies/', count: 432, children: [],
        }],
    },
    {
        id: 272, name: 'Saltwater, Warmwater & Salmon', url: '/flies/saltwater-warmwater-salmon/', count: 309, image: stencilImage('d/saltwater.jpg'), children: kids('/flies/saltwater-warmwater-salmon/', [[331, 'Bass'], [332, 'Pike'], [333, 'Salmon']]),
    },
    {
        id: 438, name: 'Realistic Trout Flies', url: '/flies/realistic-trout-flies/', count: 76, image: stencilImage('r/realistic.jpg'), children: kids('/flies/realistic-trout-flies/', [[341, 'Realistic Nymphs'], [342, 'Realistic Dries']]),
    },
];
export const SPECIES_ROOT_ID = 600;
export const SPECIES = kids('/species/', [[601, 'Brook Trout'], [602, 'Brown Trout'], [603, 'Rainbow Trout'], [604, 'Steelhead'], [605, 'Smallmouth Bass'], [606, 'Pike']]);
export const CATEGORIES = [
    {
        id: 398, name: 'Flies', url: '/flies/', count: 2000, children: TYPES,
    },
    {
        id: SPECIES_ROOT_ID, name: 'Species', url: '/species/', count: 900, children: SPECIES,
    },
    {
        id: 399, name: 'Fly Selections & Fly Boxes', url: '/fly-selections/', count: 40, children: [],
    },
];

// The flies: each as the GraphQL fragment RfFly gives it and, for the best sellers, as a Stencil
// product card. The hatch rows' flies are config.json's ids; a fly in several rows (4675, the
// Adams) is by design, and the Signature fly (3899) is in the caddis row too.
const FLIES = {
    4877: ['Adams Parachute Dry Fly', '/adams-parachute-dry-fly/', 0.95, ['12', '14', '16', '18']],
    5835: ['Elk Hair Caddis', '/elk-hair-caddis/', 0.85, ['12', '14', '16']],
    4507: ['Prince Nymph', '/prince-nymph/', 0.95, ['10', '12', '14', '16']],
    4675: ['Adams', '/adams/', 0.95, ['12', '14', '16', '18', '20']],
    4979: ['Royal Wulff', '/royal-wulff/', 0.95, ['10', '12', '14']],
    4754: ['BH Pheasant Tail Nymph', '/bh-pheasant-tail-nymph/', 0.95, ['12', '14', '16', '18']],
    4001: ['Mosquito', '/mosquito/', 0.85, ['16', '18', '20']],
    5118: ['Chironomid Assortment', '/chironomid-assortment/', 12.95, []],
    5608: ['Adams Hi-Viz', '/adams-hi-viz/', 0.95, ['14', '16', '18']],
    4941: ['Elk Hair Caddis Black', '/elk-hair-caddis-black/', 0.85, ['14', '16']],
    4333: ['BWO Parachute', '/bwo-parachute/', 0.95, ['16', '18', '20']],
    5558: ['Goddard Caddis', '/goddard-caddis/', 0.95, ['14']],
    3899: ['Psycho Caddis Black', '/psycho-caddis-black/', 1.25, ['12', '14', '16']],
    4368: ['Adams Irresistible', '/adams-irresistible/', 0.95, ['12', '14']],
    5745: ['Hares Ear', '/hares-ear/', 0.95, ['12', '14', '16']],
    5663: ['Fat Albert', '/fat-albert/', 1.45, ['8', '10']],
    6178: ['Realistic Hot Butt Hopper Brown', '/realistic-flying-hot-butt-hopper-brown/', 2.25, ['8', '10', '12']],
    3886: ['42 Mayfly Assortment', '/42-mayfly-assortment/', 34.95, []],
    5445: ['Nymph Selection', '/nymph-selection/', 24.95, []],
    3870: ['Streamer Selection', '/streamer-selection/', 29.95, []],
    4251: ['Dry Fly Selection', '/dry-fly-selection/', 27.95, []],
};
export const BEST_SELLER_IDS = [4877, 5835, 4507, 4675, 4979, 4754];
export const SIGNATURE_ID = 3899;
export const SELECTION_IDS = [3886, 5445, 3870, 4251];
const photoFile = id => `products/${id}/1/${FLIES[id][1].replace(/\//g, '')}.jpg`;

export const gqlNode = id => {
    const [name, path, price, sizes] = FLIES[id];
    return {
        node: {
            entityId: id,
            name,
            path,
            brand: { name: 'ReelFlies' },
            prices: { price: { value: price } },
            defaultImage: { small: `${CDN}/160w/${photoFile(id)}`, card: `${CDN}/360w/${photoFile(id)}`, large: `${CDN}/720w/${photoFile(id)}` },
            productOptions: {
                edges: sizes.length ? [{
                    node: {
                        entityId: id * 10, displayName: 'Fly Sizes', values: { edges: sizes.map((label, index) => ({ node: { entityId: id * 100 + index, label } })) },
                    },
                }] : [],
            },
            variants: {
                edges: (sizes.length ? sizes : ['']).map((label, index) => ({
                    node: {
                        entityId: id * 1000 + index, isPurchasable: true, inventory: { isInStock: true }, options: { edges: label ? [{ node: { entityId: id * 10, values: { edges: [{ node: { entityId: id * 100 + index, label } }] } } }] : [] },
                    },
                })),
            },
        },
    };
};

export const stencilCard = id => {
    const [name, url, price, sizes] = FLIES[id];
    return {
        id,
        name,
        url,
        price: { without_tax: { formatted: `$${price.toFixed(2)}`, value: price } },
        image: stencilImage(photoFile(id)),
        has_options: sizes.length > 0,
        category: ['Flies/Dry Flies'],
        brand: { name: 'ReelFlies' },
    };
};

// The flies every hatch row in config.json names, by id.
const hatchIds = themeSettings => [...new Set(Object.entries(themeSettings)
    .filter(([key]) => /^rf_hatch_[a-z_]+$/.test(key) && !key.endsWith('_more') && key !== 'rf_hatch_to_try')
    .flatMap(([, value]) => String(value).split(',')).map(id => Number(id.trim())).filter(id => FLIES[id]))];

// The home page as the gate sees it: { key, kind, path, url, status, html }.
//
// options:
//   theme_settings  laid over the variation's (the channel-1 variation's by default, whose menu
//                   ids and categories the tree above holds)
//   variation       the config.json variation (default "ReelFlies CA channel 1")
//   chrome          true renders the header and footer round the page, as base.html does
//   context         more store data for the page (shipping_messages, say)
//   best            the best sellers' ids (default the six above; [] leaves the lay out)
//   signature       the Signature fly's id, or null for no Signature band
//   selections      the Selections' ids ([] leaves the band out)
export async function homePage({
    theme_settings: themeSettings = {}, variation = 'ReelFlies CA channel 1', chrome = false, context = {},
    best = BEST_SELLER_IDS, signature = SIGNATURE_ID, selections = SELECTION_IDS,
} = {}) {
    const settings = {
        rf_menu_species_root_id: String(SPECIES_ROOT_ID),
        rf_home_signature_id: signature === null ? '' : String(signature),
        rf_home_selection_ids: selections.join(','),
        ...themeSettings,
    };
    const { themeConfig } = await import('../render/render.mjs');
    const config = themeConfig(variation);
    const hatch = hatchIds({ ...config.settings, ...settings }).map(gqlNode);
    const html = await renderPartial('pages/home', {
        rf_fixture_chrome: chrome,
        theme_settings: settings,
        settings: { money: { currency_token: '$' }, phone_number: '1-866-250-4071', store_logo: { title: 'ReelFlies.ca' } },
        urls: { home: '/', cart: '/cart.php', checkout: { single_address: '/checkout' } },
        categories: CATEGORIES,
        products: { top_sellers: best.map(stencilCard) },
        gql: {
            data: {
                site: {
                    best: { edges: best.map(gqlNode) },
                    hatch: { edges: hatch },
                    sig: { edges: signature === null ? [] : [gqlNode(signature)] },
                    sel: { edges: selections.map(gqlNode) },
                },
            },
        },
        shipping_messages: [],
        ...context,
    }, { variation, overrides: { 'layout/base': LAYOUT } });
    return {
        key: 'home', kind: 'home', path: '/', url: 'http://localhost:3301/', status: 200, html,
    };
}
