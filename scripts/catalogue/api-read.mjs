// Reads the catalogue through the store API for the dry runs (ticket 18), with the read-only
// token and a read-only client: GETs only.
//
//   import { readCatalogue, modelFromReads } from './api-read.mjs';
//   const client = createClient({ storeHash, token, readOnly: true });   // scripts/store/client.mjs
//   const reads = await readCatalogue(client);                            // the raw answers, kept as the snapshot
//   const model = modelFromReads(reads);                                  // the jobs' model, as csv.mjs makes it
//
// It reads every product with its options and images, every product's channel assignments, the
// brands, and tree 1's categories (channel 1, live reelflies.ca: the tree the Signature and Fly
// Type category ids come from).

import { describeFailure, queryString } from '../store/client.mjs';
import { send } from './apply.mjs';

export const PRODUCT_FIELDS = 'name,sku,is_visible,categories,brand_id,sort_order';
const PAGE_SIZE = 250;
// The store answers 10 products a page when options are included, so about 230 pages.
const MAX_PAGES = 500;

async function readAll(client, path, query = {}, { wait, onPage = () => {} } = {}) {
    const data = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        const full = { ...query, limit: PAGE_SIZE, page };
        const response = await send(client, null, { method: 'GET', path, query: full }, { wait }); // eslint-disable-line no-await-in-loop
        const where = `GET ${path}${queryString(full)}`;
        if (!response.ok) throw new Error(`${where} answered ${describeFailure(response)}`);
        const body = response.body || {};
        if (!Array.isArray(body.data)) throw new Error(`${where} answered with no data list`);
        data.push(...body.data);
        const pages = body.meta?.pagination?.total_pages;
        if (!Number.isInteger(pages)) throw new Error(`${where} answered with no pagination, so the read can't tell whether it has every page`);
        onPage(page, pages);
        if (page >= pages) return data;
    }
    throw new Error(`GET ${path} has more than ${MAX_PAGES} pages of ${PAGE_SIZE}`);
}

export async function readCatalogue(client, { now = new Date(), wait, onPage } = {}) {
    const products = await readAll(client, '/v3/catalog/products', { include: 'options,images', include_fields: PRODUCT_FIELDS }, { wait, onPage });
    const assignments = await readAll(client, '/v3/catalog/products/channel-assignments', {}, { wait });
    const brands = await readAll(client, '/v3/catalog/brands', {}, { wait });
    const categories = await readAll(client, '/v3/catalog/trees/categories', { 'tree_id:in': 1 }, { wait });
    return {
        read_at: now.toISOString(), products, assignments, brands, categories,
    };
}

export function modelFromReads(reads) {
    const channels = new Map();
    for (const { product_id: productId, channel_id: channelId } of reads.assignments) {
        if (!channels.has(productId)) channels.set(productId, []);
        channels.get(productId).push(channelId);
    }
    return {
        source: 'api',
        read_at: reads.read_at,
        products: reads.products.map(product => ({
            id: product.id,
            name: product.name,
            sku: product.sku,
            isVisible: product.is_visible,
            channels: (channels.get(product.id) || []).sort((a, b) => a - b),
            categories: product.categories || [],
            brandId: product.brand_id || 0,
            sortOrder: product.sort_order || 0,
            options: (product.options || []).map(option => ({
                id: option.id,
                displayName: option.display_name,
                type: option.type,
                values: (option.option_values || []).map(value => ({
                    id: value.id, label: value.label, sortOrder: value.sort_order, isDefault: value.is_default,
                })),
            })),
            images: (product.images || []).map(image => ({
                id: image.id,
                isThumbnail: image.is_thumbnail,
                description: image.description ?? '',
                sortOrder: image.sort_order,
                url: image.url_standard,
                urlTiny: image.url_tiny || null,
            })),
        })),
        brands: reads.brands.map(brand => ({
            id: brand.id, name: brand.name, page_title: brand.page_title ?? '', meta_description: brand.meta_description ?? '',
        })),
        categories: reads.categories.map(category => ({
            id: category.category_id, parentId: category.parent_id, name: category.name, treeId: category.tree_id,
        })),
    };
}
