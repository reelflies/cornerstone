// The dead ends' whole pages, rendered from fixture data (ticket 51), for the fixture render test
// (dead-ends.test.mjs) and the raw-HTML assertion's test (raw-html/assertions/dead-ends.test.mjs):
// the 404 page, the empty cart and a search with no results, each as the store's page context
// gives it, with tree 4's menu ids and categories, tree 1's, or none.

import { renderPartial } from '../../render.mjs';

// Tree 4's shape (refactor 06): the six Fly Types and Flies by Species at the top level, among
// other top-level categories, in an order unlike the menu's, as category-page's fixture has them.
export const category = (id, name, url, children = []) => ({
    id, name, url, children,
});
export const TREE_4 = [
    category('540', 'Fly Selections & Assortments', '/fly-selections-assortments/'),
    category('503', 'Streamers', '/streamers/'),
    category('520', 'Flies by Species', '/species/', [category('521', 'Trout Flies', '/species/trout-flies/')]),
    category('501', 'Dry Flies', '/dry-flies/', [category('511', 'Caddis Dry Flies', '/dry-flies/caddis/')]),
    category('502', 'Nymphs', '/nymphs/'),
    category('550', 'Fly Gear', '/fly-gear/'),
    category('506', 'Saltwater Flies', '/saltwater-flies/'),
    category('504', 'Eggs & Worms', '/eggs-worms/'),
    category('505', 'Warmwater Flies', '/warmwater-flies/'),
];
export const TREE_4_IDS = { rf_menu_type_ids: '501,502,503,504,505,506', rf_menu_species_root_id: '520' };
export const TREE_4_LINKS = ['501', '502', '503', '504', '505', '506', '520'];
export const TREE_4_NAMES = 'Dry Flies Nymphs Streamers Eggs & Worms Warmwater Flies Saltwater Flies Flies by Species';
// Tree 1 (channel 1, ticket 53): the Fly Types one level under Flies, and no Species root.
export const TREE_1 = [category('10', 'Flies', '/flies/', [
    category('298', 'Dry Flies', '/flies/dry-flies/'),
    category('251', 'Nymphs & Sub Surface Flies', '/flies/nymphs/'),
])];
export const EMPTY_IDS = { rf_menu_type_ids: '', rf_menu_species_root_id: '' };

const URLS = {
    home: '/', search: '/search.php', cart: '/cart.php', checkout: { single_address: '/checkout' }, auth: { login: '/login.php' },
};
const base = (settings, categories) => ({
    breadcrumbs: [], categories, urls: URLS, settings: {}, theme_settings: settings,
});

export const notFound = (settings = TREE_4_IDS, categories = TREE_4, options = {}) => renderPartial('pages/errors/404', {
    ...base(settings, categories), page_type: 'page_not_found',
}, options);
export const emptyCart = (settings = TREE_4_IDS, categories = TREE_4) => renderPartial('pages/cart', {
    ...base(settings, categories),
    page_type: 'cart',
    cart: {
        items: [], quantity: 0, sub_total: { formatted: '$0.00' }, grand_total: { formatted: '$0.00' }, taxes: [],
    },
});
export const search = ({
    query = 'qzxjv', count = 0, suggestions = false, error = false, settings = TREE_4_IDS, categories = TREE_4,
} = {}) => renderPartial('pages/search', {
    ...base(settings, categories),
    page_type: 'search',
    result_count: count,
    product_results: { products: [], faceted_search_enabled: false },
    category_results: suggestions ? [[{ name: 'Dry Flies', url: '/dry-flies/' }]] : [],
    brand_results: [],
    pagination: { product_results: { links: [] }, content_results: { links: [] } },
    forms: {
        search: {
            query,
            section: 'product',
            product_url: '/search.php?section=product',
            content_url: '/search.php?section=content',
            has_suggestions: suggestions,
            search_error: error,
            ...(suggestions && { suggested_query: { query: 'caddis', url: '/search.php?search_query=caddis' } }),
        },
    },
});
