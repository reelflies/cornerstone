// The rules a catalogue write runs by (ticket 18): which requests a plan may hold, how the store
// is read before and after them, and how a restore is built from the snapshot. Guarded
// (scripts/guarded-paths.txt: scripts/catalogue/apply*), because apply.mjs trusts nothing else:
// the dry run (dry-run.mjs, jobs.mjs) only proposes requests, and this module decides whether
// apply may send them.
//
// The only writes, all PUTs with no query:
//
//   PUT /v3/catalog/products/<id>/options/<id>   display_name and/or option_values, the whole
//                                                 list, every value by id (a value left out may
//                                                 be deleted, so the ids must be exactly the
//                                                 store's when apply reads it)
//   PUT /v3/catalog/products/<id>                 brand_id and/or categories
//   PUT /v3/catalog/products/<id>/images/<id>     is_thumbnail (true only) and/or description
//   PUT /v3/catalog/brands/<id>                   page_title and/or meta_description
//
// Never: a POST or a DELETE, variants, prices, inventory, categories, channels, or any other
// field of these objects. A restore may write the empty values the snapshot read (an empty
// description, no brand, no category); a plan may not.

import { isDeepStrictEqual } from 'util';
import { Refused } from '../store/allowlist.mjs';
import { canonicalJson, sha256 } from '../store/snapshot.mjs';

export { Refused };
export const PLAN_FORMAT = 'reelflies-catalogue-plan/1';
export const SNAPSHOT_FORMAT = 'reelflies-catalogue-snapshot/1';
export const TICKET = '18';
export const MAX_REQUESTS = 3000;
export const JOB = /^[a-z][a-z0-9-]{0,39}$/;

const KINDS = [
    { kind: 'option', pattern: /^\/v3\/catalog\/products\/([1-9]\d{0,9})\/options\/([1-9]\d{0,9})$/, fields: ['display_name', 'option_values'] },
    { kind: 'image', pattern: /^\/v3\/catalog\/products\/([1-9]\d{0,9})\/images\/([1-9]\d{0,9})$/, fields: ['description', 'is_thumbnail'] },
    { kind: 'product', pattern: /^\/v3\/catalog\/products\/([1-9]\d{0,9})$/, fields: ['brand_id', 'categories'] },
    { kind: 'brand', pattern: /^\/v3\/catalog\/brands\/([1-9]\d{0,9})$/, fields: ['meta_description', 'page_title'] },
];
const REQUEST_KEYS = ['before', 'body', 'method', 'path', 'product_id'];
const VALUE_KEYS = ['id', 'is_default', 'label', 'sort_order'];

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isId = value => Number.isInteger(value) && value > 0;
const sameKeys = (object, keys) => isDeepStrictEqual(Object.keys(object).sort(), [...keys].sort());
const text = (value, max, { empty }) => typeof value === 'string' && value.length <= max && (empty || value.trim() !== '');

function optionValuesProblems(values) {
    if (!Array.isArray(values) || !values.length) return ['option_values must be the whole, non-empty list of the option\'s values'];
    const problems = [];
    values.forEach((value, index) => {
        if (!isObject(value) || !sameKeys(value, VALUE_KEYS)) {
            problems.push(`option_values[${index}] must have exactly ${VALUE_KEYS.join(', ')}`);
            return;
        }
        if (!isId(value.id)) problems.push(`option_values[${index}].id must be a value id`);
        if (!text(value.label, 255, { empty: false })) problems.push(`option_values[${index}].label must be 1 to 255 characters`);
        if (!Number.isInteger(value.sort_order) || value.sort_order < 0 || value.sort_order > 100000) problems.push(`option_values[${index}].sort_order must be a whole number from 0`);
        if (typeof value.is_default !== 'boolean') problems.push(`option_values[${index}].is_default must be true or false`);
    });
    const ids = values.map(value => value && value.id);
    if (new Set(ids).size !== ids.length) problems.push('option_values names a value id twice');
    if (values.filter(value => value && value.is_default === true).length > 1) problems.push('option_values sets more than one default');
    return problems;
}

function bodyProblems(body, mode) {
    const empty = mode === 'restore';
    const problems = [];
    const check = (ok, message) => {
        if (!ok) problems.push(message);
    };
    if ('display_name' in body) check(text(body.display_name, 255, { empty: false }), 'display_name must be 1 to 255 characters');
    if ('option_values' in body) problems.push(...optionValuesProblems(body.option_values));
    if ('description' in body) check(text(body.description, 1000, { empty }), `description must be ${empty ? 'up to' : '1 to'} 1000 characters`);
    if ('is_thumbnail' in body) check(body.is_thumbnail === true, 'is_thumbnail may only be set to true (making another image the thumbnail clears this one)');
    if ('brand_id' in body) check(empty ? Number.isInteger(body.brand_id) && body.brand_id >= 0 : isId(body.brand_id), `brand_id must be a brand id${empty ? ', or 0 for none' : ''}`);
    if ('categories' in body) {
        const ok = Array.isArray(body.categories) && body.categories.every(isId) && new Set(body.categories).size === body.categories.length && body.categories.length <= 50 && (empty || body.categories.length > 0);
        check(ok, `categories must be a list of distinct category ids${empty ? '' : ', at least one'}`);
    }
    if ('page_title' in body) check(text(body.page_title, 255, { empty }), `page_title must be ${empty ? 'up to' : '1 to'} 255 characters`);
    if ('meta_description' in body) check(text(body.meta_description, 1000, { empty }), `meta_description must be ${empty ? 'up to' : '1 to'} 1000 characters`);
    return problems;
}

// What a request writes, or Refused. `mode` is "apply" or "restore".
export function classify(request, { mode = 'apply' } = {}) {
    if (!isObject(request)) throw new Refused('a request must be an object');
    const extra = Object.keys(request).filter(key => !REQUEST_KEYS.includes(key));
    if (extra.length) throw new Refused(`a request may hold only ${REQUEST_KEYS.join(', ')}, not ${extra.join(', ')}`);
    if (request.method !== 'PUT') throw new Refused(`${request.method} ${request.path}: catalogue writes are PUTs only (no creates, no deletes)`);
    const found = KINDS.map(spec => ({ spec, match: String(request.path).match(spec.pattern) })).find(({ match }) => match);
    if (!found) throw new Refused(`PUT ${request.path} isn't on the catalogue allowlist (a product option, a product's brand or categories, a product image, or a brand)`);
    const { spec, match } = found;
    if (!isObject(request.body) || !Object.keys(request.body).length) throw new Refused(`PUT ${request.path}: the body must write at least one of ${spec.fields.join(', ')}`);
    const unknown = Object.keys(request.body).filter(key => !spec.fields.includes(key));
    if (unknown.length) throw new Refused(`PUT ${request.path}: may write only ${spec.fields.join(', ')}, not ${unknown.join(', ')}`);
    const problems = bodyProblems(request.body, mode);
    if (problems.length) throw new Refused(`PUT ${request.path}: ${problems.join('; ')}`);
    if (!isObject(request.before)) throw new Refused(`PUT ${request.path}: the request has no "before" read to check the store against`);
    const ids = match.slice(1).map(Number);
    const what = { kind: spec.kind, path: request.path };
    if (spec.kind === 'brand') {
        return {
            ...what, brandId: ids[0], productId: null, key: `brand ${ids[0]}`,
        };
    }
    const [productId, childId] = ids;
    if (request.product_id !== undefined && request.product_id !== productId) throw new Refused(`PUT ${request.path}: product_id ${request.product_id} isn't the product in its path`);
    if (spec.kind === 'option') {
        return {
            ...what, productId, optionId: childId, key: `option ${productId}/${childId}`,
        };
    }
    if (spec.kind === 'image') {
        return {
            ...what, productId, imageId: childId, key: `image ${productId}/${childId}`,
        };
    }
    return { ...what, productId, key: `product ${productId}` };
}

// Every request checked, or Refused listing every problem. One request per object.
export function checkRequests(requests, { mode = 'apply' } = {}) {
    if (!Array.isArray(requests) || !requests.length || requests.length > MAX_REQUESTS) throw new Refused(`a plan needs 1 to ${MAX_REQUESTS} requests`);
    const problems = [];
    const items = [];
    const seen = new Map();
    requests.forEach((request, index) => {
        try {
            const what = classify(request, { mode });
            if (seen.has(what.key)) problems.push(`request ${index + 1}: ${what.key} is already written by request ${seen.get(what.key) + 1}: one request per object`);
            else seen.set(what.key, index);
            items.push({ index, request, what });
        } catch (error) {
            if (error.name !== 'Refused') throw error;
            problems.push(`request ${index + 1}: ${error.message}`);
        }
    });
    if (problems.length) throw new Refused(problems.join('\n'));
    return items;
}

export const planDigest = plan => sha256(canonicalJson({ ...plan, digest: null }));

// A plan file's text, read and checked: its format, ticket, job, digest and every request.
export function readPlan(textContent) {
    let plan;
    try {
        plan = JSON.parse(textContent);
    } catch {
        throw new Refused('this file isn\'t a catalogue plan: it isn\'t JSON');
    }
    if (!isObject(plan) || plan.format !== PLAN_FORMAT) throw new Refused(`this file isn't a catalogue plan (format ${PLAN_FORMAT})`);
    if (plan.digest !== planDigest(plan)) throw new Refused('the plan\'s digest doesn\'t match its contents: it was edited after the dry run made it. Run the dry run again');
    if (plan.ticket !== TICKET) throw new Refused(`the plan's ticket is ${JSON.stringify(plan.ticket)}, not ${TICKET}`);
    if (typeof plan.job !== 'string' || !JOB.test(plan.job)) throw new Refused(`the plan's job ${JSON.stringify(plan.job)} isn't a job name`);
    return { plan, items: checkRequests(plan.requests) };
}

// --- Reading the store -------------------------------------------------------------------------

// The store answers at most 10 products a page when their options are included (checked on the
// store, 2026-10-06), so a read asks for 10 at a time and apply.mjs refuses an answer in pages.
export const READ_BATCH = 10;
export const PRODUCT_READ_FIELDS = 'name,brand_id,categories';

// The GETs that read every object `items` write: products 10 at a time with their options and
// images, and each brand on its own.
export function readsFor(items) {
    const products = [...new Set(items.map(({ what }) => what.productId).filter(Boolean))].sort((a, b) => a - b);
    const brands = [...new Set(items.map(({ what }) => what.brandId).filter(Boolean))].sort((a, b) => a - b);
    const reads = [];
    for (let at = 0; at < products.length; at += READ_BATCH) {
        const ids = products.slice(at, at + READ_BATCH);
        reads.push({
            kind: 'products',
            ids,
            path: '/v3/catalog/products',
            query: {
                'id:in': ids.join(','), include: 'options,images', include_fields: PRODUCT_READ_FIELDS, limit: READ_BATCH,
            },
        });
    }
    for (const id of brands) {
        reads.push({
            kind: 'brand', ids: [id], path: `/v3/catalog/brands/${id}`, query: {},
        });
    }
    return reads;
}

const byOrder = (a, b) => a.sort_order - b.sort_order || a.id - b.id;
const valueState = value => ({
    id: value.id, label: value.label, sort_order: value.sort_order, is_default: value.is_default,
});

// The object a request writes, as the store reads now (from the products and brands read), in
// the shape of the request's `before`. null when the store doesn't have it.
export function stateOf(what, store) {
    if (what.kind === 'brand') {
        const brand = store.brands.get(what.brandId);
        return brand ? { page_title: brand.page_title ?? '', meta_description: brand.meta_description ?? '' } : null;
    }
    const product = store.products.get(what.productId);
    if (!product) return null;
    if (what.kind === 'product') return { brand_id: product.brand_id || 0, categories: product.categories || [] };
    if (what.kind === 'image') {
        const image = (product.images || []).find(candidate => candidate.id === what.imageId);
        if (!image) return null;
        return { description: image.description ?? '', is_thumbnail: image.is_thumbnail, thumbnail_id: (product.images || []).find(candidate => candidate.is_thumbnail)?.id ?? null };
    }
    const option = (product.options || []).find(candidate => candidate.id === what.optionId);
    if (!option) return null;
    return { display_name: option.display_name, option_values: [...(option.option_values || [])].sort(byOrder).map(valueState) };
}

// The state a request leaves: its `before` with the body written over it.
export function stateAfter({ request, what }) {
    const { before, body } = request;
    if (what.kind === 'image' && body.is_thumbnail) return { ...before, ...body, thumbnail_id: what.imageId };
    return { ...before, ...body };
}

// Only the fields the request writes, in an order-free shape, so two states compare as JSON.
export function written({ request }, state) {
    if (!state) return null;
    const out = {};
    for (const key of Object.keys(request.body).sort()) {
        if (key === 'option_values') out.option_values = [...(state.option_values || [])].map(valueState).sort((a, b) => a.id - b.id);
        else if (key === 'categories') out.categories = [...(state.categories || [])].sort((a, b) => a - b);
        else if (key === 'is_thumbnail') {
            out.is_thumbnail = state.is_thumbnail;
            out.thumbnail_id = state.thumbnail_id;
        } else out[key] = state[key] ?? '';
    }
    return out;
}

// For each item, against the store as read now:
// - "pending": the store reads as the plan's `before`, so the write goes ahead
// - "done": it already reads as the plan leaves it (an earlier run of the same plan), so it's skipped
// - "stale": neither, or the object is gone, or (for an option) its value ids differ from the
//   request's. apply refuses the plan.
export function judge(items, store) {
    return items.map(item => {
        const now = stateOf(item.what, store);
        if (!now) {
            return {
                ...item, status: 'stale', now, reason: `${item.what.key} isn't in the store's answer`,
            };
        }
        if (item.request.body.option_values) {
            const want = item.request.body.option_values.map(value => value.id).sort((a, b) => a - b);
            const have = now.option_values.map(value => value.id).sort((a, b) => a - b);
            if (!isDeepStrictEqual(want, have)) {
                return {
                    ...item, status: 'stale', now, reason: `${item.what.key}: its value ids are now ${have.join(', ')}, and the plan sends ${want.join(', ')}; sending it would delete or miss a value`,
                };
            }
        }
        const current = written(item, now);
        if (isDeepStrictEqual(current, written(item, stateAfter(item)))) return { ...item, status: 'done', now };
        if (isDeepStrictEqual(current, written(item, item.request.before))) return { ...item, status: 'pending', now };
        return {
            ...item, status: 'stale', now, reason: `${item.what.key} changed since the plan was made`,
        };
    });
}

// One line per change, derived from the store as read now (never from the plan's own copy).
const quote = value => JSON.stringify(value ?? '');
const labels = state => state.option_values.map(value => value.label).join(', ');
const defaults = state => state.option_values.filter(value => value.is_default).map(value => value.label).join(', ') || 'none';

export function diffLine({ what, request }, now, productName = '') {
    const after = stateAfter({ what, request });
    const name = productName ? ` ${quote(productName)}` : '';
    const changes = [];
    for (const key of Object.keys(request.body).sort()) {
        if (key === 'option_values') {
            if (labels(now) !== labels(after)) changes.push(`values ${labels(now)} -> ${labels(after)}`);
            if (defaults(now) !== defaults(after)) changes.push(`default ${defaults(now)} -> ${defaults(after)}`);
        } else if (key === 'is_thumbnail') changes.push(`thumbnail image ${now.thumbnail_id ?? 'none'} -> ${what.imageId}`);
        else if (key === 'categories') changes.push(`categories [${now.categories.join(', ')}] -> [${after.categories.join(', ')}]`);
        else if (key === 'brand_id') changes.push(`brand_id ${now.brand_id} -> ${after.brand_id}`);
        else changes.push(`${key} ${quote(now[key])} -> ${quote(after[key])}`);
    }
    const subject = {
        option: `product ${what.productId}${name}, option ${what.optionId}`,
        image: `product ${what.productId}${name}, image ${what.imageId}`,
        product: `product ${what.productId}${name}`,
        brand: `brand ${what.brandId}`,
    }[what.kind];
    return `${subject}: ${changes.join('; ') || 'no change'}`;
}

// After a write: does the store read back as the request leaves it?
export function readBackProblem(item, store) {
    const now = stateOf(item.what, store);
    if (!now) return `${item.what.key} wasn't in the re-read`;
    return isDeepStrictEqual(written(item, now), written(item, stateAfter(item))) ? null : `${item.what.key} reads back ${canonicalJson(written(item, now))}, not as planned`;
}

// --- Restoring ----------------------------------------------------------------------------------

// The requests that put back what a before-snapshot read, for each object its plan wrote. Each
// restore request's `before` is the state the plan left, so a restore refuses (as stale) an
// object someone changed again since. A thumbnail is restored by making the old thumbnail the
// thumbnail again; with no old thumbnail it can't be, and is listed.
export function restoreRequests(snapshot, { productId = null } = {}) {
    const requests = [];
    const skipped = [];
    for (const entry of snapshot.items) {
        const item = { request: entry.request, what: classify(entry.request) };
        if (productId !== null && item.what.productId !== productId) continue; // eslint-disable-line no-continue
        const before = entry.before;
        if (!before) {
            skipped.push(`${item.what.key}: the snapshot has no read of it`);
            continue; // eslint-disable-line no-continue
        }
        const after = stateAfter(item);
        const body = {};
        for (const key of Object.keys(item.request.body)) if (key !== 'is_thumbnail') body[key] = before[key];
        const owner = item.what.productId ? { product_id: item.what.productId } : {};
        if (item.request.body.is_thumbnail) {
            if (!before.thumbnail_id) skipped.push(`${item.what.key}: the product had no thumbnail before, so there is none to put back`);
            else if (before.thumbnail_id !== item.what.imageId) {
                requests.push({
                    method: 'PUT',
                    path: `/v3/catalog/products/${item.what.productId}/images/${before.thumbnail_id}`,
                    body: { is_thumbnail: true },
                    before: { is_thumbnail: false, thumbnail_id: item.what.imageId },
                    ...owner,
                });
            }
        }
        if (Object.keys(body).length) {
            requests.push({
                method: 'PUT', path: item.request.path, body, before: after, ...owner,
            });
        }
    }
    return { requests, skipped };
}
