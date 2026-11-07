// What a fly is, for the size strip and the re-laid cards: the Storefront GraphQL API, read with
// the storefront's public token (context.rfStorefrontToken), and the home page's server seed.
//
// - productsById(ids): the products, each normalised once and cached for the page.
// - bestOf(categoryId, n): a category's n best sellers and its count of products, its
//   subcategories' included (search, BEST_SELLING).
// - seed(edges): products the server already sent (home.html's GraphQL `best`), so the strip on
//   a best seller opens with no request.
//
// A product normalises to { id, name, url, price, brand, img: { small, card, large }, sizes,
// single, complex }: sizes are { label, variantId, inStock } in hook order, biggest first;
// single is the variant to add when there is no size to choose; complex is a product whose
// options the strip can't offer (more than one option, or one that isn't a list of sizes), which
// is chosen on its own page.

import { sortByHookOrder } from './hook-order';

const FLY = `entityId name path brand { name }
prices { price { value } }
defaultImage { small: url(width: 160) card: url(width: 360) large: url(width: 720) }
productOptions(first: 2) { edges { node { entityId ... on MultipleChoiceOption { values(first: 30) { edges { node { entityId label } } } } } } }
variants(first: 30) { edges { node { entityId isPurchasable inventory { isInStock } options(first: 1) { edges { node { values(first: 1) { edges { node { label } } } } } } } } }`;

const cache = new Map();
let token = '';

export function setToken(value) {
    token = value || '';
}

const edges = connection => (connection && Array.isArray(connection.edges) ? connection.edges.map(edge => edge.node) : []);

function oneToAdd(options, variants, sizes) {
    if (options.length === 0 && variants.length === 1) return variants[0];
    if (sizes.length === 1) return sizes[0];
    return null;
}

export function normalise(node) {
    const options = edges(node.productOptions);
    const variants = edges(node.variants).map(variant => ({
        variantId: variant.entityId,
        inStock: Boolean(variant.inventory ? variant.inventory.isInStock : true) && variant.isPurchasable !== false,
        label: (edges(edges(variant.options)[0] && edges(variant.options)[0].values)[0] || {}).label || '',
    }));
    const sized = options.length === 1 ? variants.filter(variant => variant.label) : [];
    const seen = new Set();
    const sizes = sortByHookOrder(sized.filter(variant => !seen.has(variant.label) && seen.add(variant.label)), variant => variant.label);
    const image = node.defaultImage || {};
    return {
        id: String(node.entityId),
        name: node.name,
        url: node.path,
        price: node.prices && node.prices.price ? node.prices.price.value : 0,
        brand: node.brand ? node.brand.name : '',
        img: { small: image.small || '', card: image.card || '', large: image.large || '' },
        sizes,
        single: oneToAdd(options, variants, sizes),
        complex: options.length > 1 || (options.length === 1 && sizes.length === 0),
    };
}

export function seed(nodeEdges) {
    (nodeEdges || []).forEach(edge => {
        if (edge && edge.node && edge.node.variants) cache.set(String(edge.node.entityId), Promise.resolve(normalise(edge.node)));
    });
}

async function query(text) {
    if (!token) throw new Error('No storefront token');
    const response = await fetch('/graphql', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: text }),
    });
    const body = await response.json();
    if (!response.ok || body.errors) throw new Error((body.errors && body.errors[0] && body.errors[0].message) || `GraphQL ${response.status}`);
    return body.data;
}

export function productsById(ids) {
    const wanted = ids.map(String).filter(id => /^\d+$/.test(id));
    const missing = wanted.filter(id => !cache.has(id));
    if (missing.length) {
        const batch = query(`{ site { products(entityIds: [${missing.join(',')}], first: 50) { edges { node { ${FLY} } } } } }`)
            .then(data => new Map(edges(data.site.products).map(node => [String(node.entityId), normalise(node)])));
        missing.forEach(id => {
            const one = batch.then(found => {
                if (!found.has(id)) throw new Error(`Product ${id} not found`);
                return found.get(id);
            });
            one.catch(() => cache.delete(id));
            cache.set(id, one);
        });
    }
    return Promise.all(wanted.map(id => cache.get(id)));
}

export function productById(id) {
    return productsById([id]).then(found => found[0]);
}

const lays = new Map();

export function bestOf(categoryId, n) {
    const key = `${categoryId}:${n}`;
    if (!lays.has(key)) {
        const lay = query(`{ site { search { searchProducts(filters: { categoryEntityId: ${Number(categoryId)} }, sort: BEST_SELLING) { products(first: ${Number(n)}) { collectionInfo { totalItems } edges { node { ${FLY} } } } } } } }`)
            .then(data => {
                const found = data.site.search.searchProducts.products;
                const products = edges(found).map(normalise);
                products.forEach(product => { if (!cache.has(product.id)) cache.set(product.id, Promise.resolve(product)); });
                return { total: found.collectionInfo ? found.collectionInfo.totalItems : null, products };
            });
        lay.catch(() => lays.delete(key));
        lays.set(key, lay);
    }
    return lays.get(key);
}
