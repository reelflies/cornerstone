// Ticket 07's probes that read a page's Stencil context (`?debug=context` from a local
// `stencil start`, because the prelaunch host doesn't answer it). Pure functions: run.mjs fetches
// the contexts, these turn each into the evidence research/07-prelaunch-probes.md records.
//
//   import { probeMenuImages } from './context-probes.mjs';
//   probeMenuImages(homeContext)   // { categories, withImageKey, withImage, verdict, … }
//
// Verdicts: "pass" and "fail" answer the probe's question; "partial" means the field exists but
// the store has no data that shows it filled; "no data" means the page had nothing to probe (an
// empty menu on 1895766 before tree 4); "informational" is probe 5's.
//
// Nothing here keeps the context itself: it carries the storefront API token and the visitor's
// IP address (settings.storefront_api, settings.client_ip_address), so only these summaries are
// printed or written.

const label = node => `${node.name} (${node.id})`;

// The categories global, depth first: { id, name, depth, parentId, hasImageKey, image, url }.
export function flattenCategories(categories, depth = 1, parentId = null) {
    return (categories || []).flatMap(node => [
        {
            id: String(node.id),
            name: node.name,
            url: node.url,
            depth,
            parentId,
            hasImageKey: Object.hasOwn(node, 'image'),
            image: node.image && node.image.data ? node.image.data : null,
        },
        ...flattenCategories(node.children, depth + 1, String(node.id)),
    ]);
}

// Probe 1: does the `categories` global carry `image` for menu categories? It passes when every
// rendered category has the field; those without a value are listed, because the desktop banner
// strip (ticket 29) shows an image only where one is set.
export function probeMenuImages(context) {
    const rows = flattenCategories(context.categories);
    const withKey = rows.filter(row => row.hasImageKey);
    const withImage = rows.filter(row => row.image);
    let verdict = 'pass';
    if (!rows.length) verdict = 'no data';
    else if (withKey.length < rows.length) verdict = 'fail';
    return {
        categories: rows.length,
        withImageKey: withKey.length,
        withImage: withImage.length,
        verdict,
        withoutImageKey: rows.filter(row => !row.hasImageKey).map(label),
        withoutImage: withKey.filter(row => !row.image).map(label),
    };
}

// Probe 2 (recorded only): how many levels the categories global renders, and how many per level.
export function probeMenuDepth(context) {
    const rows = flattenCategories(context.categories);
    const perLevel = {};
    rows.forEach(({ depth }) => { perLevel[depth] = (perLevel[depth] || 0) + 1; });
    return { depth: rows.reduce((max, row) => Math.max(max, row.depth), 0), perLevel, categories: rows.length };
}

const byOrderThenName = (a, b) => (a.sort_order - b.sort_order)
    || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    || a.category_id - b.category_id;

// Probe 3: does the menu follow sort_order, then name? `treeRows` is the channel's tree as
// GET /v3/catalog/trees/categories returns it. Each sibling group the menu renders is compared
// with its visible siblings in the tree, sorted by sort_order and then by name. `tieGroups` counts
// the groups where two siblings share a sort_order, the only place the name rule is tested.
export function probeMenuOrder(context, treeRows) {
    const rows = flattenCategories(context.categories);
    if (!rows.length) {
        return {
            verdict: 'no data', groups: 0, tieGroups: 0, mismatches: [], missingFromTree: [],
        };
    }
    const byId = new Map(treeRows.map(row => [String(row.category_id), row]));
    const missingFromTree = rows.filter(row => !byId.has(row.id)).map(label);
    const groups = new Map();
    rows.forEach(row => {
        const key = row.parentId || 'root';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
    });
    const mismatches = [];
    let tieGroups = 0;
    groups.forEach((rendered, key) => {
        const ids = new Set(rendered.map(row => row.id));
        const expected = treeRows.filter(row => ids.has(String(row.category_id))).sort(byOrderThenName);
        const orders = expected.map(row => row.sort_order);
        if (new Set(orders).size < orders.length) tieGroups += 1;
        const renderedNames = rendered.map(row => row.name);
        const expectedNames = expected.map(row => row.name);
        if (renderedNames.join('\n') !== expectedNames.join('\n')) {
            const parent = key === 'root' ? 'top level' : label(rows.find(row => row.id === key));
            mismatches.push({ parent, rendered: renderedNames, expected: expectedNames });
        }
    });
    return {
        verdict: mismatches.length || missingFromTree.length ? 'fail' : 'pass',
        groups: groups.size,
        tieGroups,
        mismatches,
        missingFromTree,
    };
}

// Probe 8: do root pages roll up their children's products (listing_mode), or show the empty
// "no products" alert? `roots` are the top-level pages as rendered: { id, name, path, listed,
// cards }, where `listed` is category.total_products. `direct` maps a category id to the number of
// products assigned to it directly (the API's categories:in count). Only a root with no products
// of its own tests the roll-up; if every root has its own, the probe is "partial".
export function probeRootRollup(roots, direct) {
    const rows = roots.map(root => {
        const own = direct[root.id] ?? null;
        return { ...root, direct: own, rollsUp: own === 0 ? root.listed > 0 : null };
    });
    const tested = rows.filter(row => row.rollsUp !== null);
    let verdict = 'pass';
    if (!rows.length) verdict = 'no data';
    else if (!tested.length) verdict = 'partial';
    else if (tested.some(row => !row.rollsUp)) verdict = 'fail';
    return { verdict, rows };
}

// Probe 4: do category cards carry `custom_fields`? "pass" needs a card with values; cards that
// carry the key with null everywhere are "partial", because no product on the page has a field.
export function probeCardCustomFields(context) {
    const cards = (context.category && context.category.products) || [];
    const withKey = cards.filter(card => Object.hasOwn(card, 'custom_fields'));
    const withValues = withKey.filter(card => Array.isArray(card.custom_fields) && card.custom_fields.length);
    let verdict = 'pass';
    if (!cards.length) verdict = 'no data';
    else if (!withKey.length) verdict = 'fail';
    else if (!withValues.length) verdict = 'partial';
    const fieldNames = [...new Set(withValues.flatMap(card => card.custom_fields.map(field => field.name)))].sort();
    return {
        cards: cards.length, withKey: withKey.length, withValues: withValues.length, verdict, fieldNames,
    };
}

// Probe 5 (informational): the slides the home page's `carousel` front matter returns.
export function probeCarousel(context) {
    const present = Boolean(context.carousel);
    return { slides: present && Array.isArray(context.carousel.slides) ? context.carousel.slides.length : 0, verdict: 'informational', present };
}

// Probe 7: `cart.multi_coupon_ui_enabled` from the cart page, and `semantic_search_enabled`,
// which quick-search.html reads from the page context.
export function probeFlags(cartContext, pageContext) {
    const cart = cartContext.cart || {};
    return {
        multiCouponUiEnabled: Object.hasOwn(cart, 'multi_coupon_ui_enabled') ? cart.multi_coupon_ui_enabled : null,
        semanticSearchEnabled: Boolean(pageContext.semantic_search_enabled),
        semanticSearchKey: pageContext.semantic_search_enabled !== null && pageContext.semantic_search_enabled !== undefined,
    };
}

// Probe 14: does `category.subcategories` carry `image`?
export function probeSubcategoryImages(context) {
    const subs = (context.category && context.category.subcategories) || [];
    const withKey = subs.filter(sub => Object.hasOwn(sub, 'image'));
    const withImage = withKey.filter(sub => sub.image && sub.image.data);
    let verdict = 'pass';
    if (!subs.length) verdict = 'no data';
    else if (withKey.length < subs.length) verdict = 'fail';
    return {
        subcategories: subs.length,
        withImageKey: withKey.length,
        withImage: withImage.length,
        verdict,
        withoutImage: withKey.filter(sub => !(sub.image && sub.image.data)).map(label),
    };
}

const pathOf = url => {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
};

// Probe 15: the blog page and every post the blog context lists, as paths to request.
export function probeBlogPaths(context) {
    if (!context.blog || !context.blog.url) return [];
    return [pathOf(context.blog.url), ...(context.blog.posts || []).map(post => pathOf(post.url))];
}
