// The catalogue jobs (ticket 18), as dry runs: each reads the model (from the export, csv.mjs, or
// the API, api-read.mjs) and returns the rows of its diff, and, from an API read only, the exact
// requests that would make the change. Nothing here writes: a plan file is applied only by
// scripts/catalogue/apply.mjs, at Shaun's terminal.
//
//   import { JOBS, runJobs } from './jobs.mjs';
//   const results = runJobs(model, { grounds, sales, brandCopy, sizeFixes });
//
// A result is { id, title, decision, rule, counts, rows, requests, notes, extra }:
// - rows: { product_id, product, live, what, before, after, note }, one per change or finding
// - requests: { method, path, body, before, product_id }. `before` is the read the request was
//   planned against; apply refuses the plan if the store no longer reads that way.
//
// Scope (the defaults taken, each revisitable): the Fly Sizes and option-name jobs and alt text
// cover every product, Live or not, so a hidden product shown again later doesn't bring back the
// old labels; the brand, thumbnail and single-size jobs cover Live products only. A Live product
// is visible and assigned to channel 1 (CONTEXT.md).

import {
    compareHook, hookLabel, isSuspectSize, parseHookSize,
} from './sizes.mjs';

export const FLY_SIZES = 'Fly Sizes';
// Tree 1's ReelFlies Signature Flies (434), its children 342, 277 and 262, and the hidden 357
// (refactor data/current-tree-1.md).
export const SIGNATURE_CATEGORIES = [434, 342, 277, 262, 357];
export const BRAND_NAME = 'ReelFlies';
// The re-export list's first tier, and a Fly Type listing's first page (24 per page, ticket 32).
const TOP_SELLERS = 200;
const PAGE_ONE = 24;
const SAMPLE_COLOUR = 'Colour';

export const isLive = product => product.isVisible && product.channels.includes(1);
const byOrder = (a, b) => a.sortOrder - b.sortOrder || (a.id ?? 0) - (b.id ?? 0);
const list = values => values.join(', ');
const row = (product, what, before, after, note = '') => ({
    product_id: product.id, product: product.name, live: isLive(product), what, before, after, note,
});

// --- Requests ---------------------------------------------------------------------------------

const optionValue = value => ({
    id: value.id, label: value.label, sort_order: value.sortOrder, is_default: value.isDefault,
});

// The whole option_values array, every value by id: a value left out of it may be deleted.
function optionRequest(product, option, values, { displayName } = {}) {
    const body = {};
    if (displayName !== undefined) body.display_name = displayName;
    if (values) body.option_values = values.map(optionValue);
    return {
        method: 'PUT',
        path: `/v3/catalog/products/${product.id}/options/${option.id}`,
        body,
        before: { display_name: option.displayName, option_values: [...option.values].sort(byOrder).map(optionValue) },
        product_id: product.id,
    };
}

const productRequest = (product, body) => ({
    method: 'PUT',
    path: `/v3/catalog/products/${product.id}`,
    body,
    before: { brand_id: product.brandId, categories: product.categories },
    product_id: product.id,
});

const imageRequest = (product, image, body) => ({
    method: 'PUT',
    path: `/v3/catalog/products/${product.id}/images/${image.id}`,
    body,
    before: { description: image.description, is_thumbnail: image.isThumbnail, thumbnail_id: product.images.find(other => other.isThumbnail)?.id ?? null },
    product_id: product.id,
});

const brandRequest = (record, body) => ({
    method: 'PUT',
    path: `/v3/catalog/brands/${record.id}`,
    body,
    before: { page_title: record.page_title, meta_description: record.meta_description },
    product_id: null,
});

const plannable = model => model.source === 'api';
const NO_PLAN = 'The export has no option, value or brand ids, so this run makes no plan: plans are made from the API read.';

// The proposal for a "Selection" Assortment with suspect sizes (the export's 32 and 33 on "Cray
// Fish Selection - 8 Flies"): what the other Live Selections do.
function selectionProposals(model, rows) {
    const flagged = rows.filter(item => /needs a person/.test(item.note) && /selection/i.test(item.product));
    if (!flagged.length) return [];
    const others = model.products.filter(product => isLive(product) && /selection/i.test(product.name) && !flagged.some(item => item.product_id === product.id));
    const plain = others.filter(product => !product.options.length).length;
    return flagged.map(item => `Proposal for ${item.product_id} "${item.product}" (values ${item.before}): ${plain} of the other ${others.length} Live "Selection" products have no option at all and sell as one item. Recommended: Shaun removes this option in the control panel so it sells like them (deleting an option or its variants is outside this job's writes), after checking which variant holds the stock. If he keeps two variants, he names their labels and the dry run plans the rename (\`--size-fixes\`).`);
}

// --- Fly Sizes: the aught rename and hook order ------------------------------------------------

function flySizes(model, { sizeFixes = {} } = {}) {
    const rows = [];
    const requests = [];
    const counts = {
        options: 0, live: 0, renamed: 0, reordered: 0, unchanged: 0, attention: 0,
    };
    const radio = [];
    const sizeOptions = [];
    for (const product of model.products) {
        for (const option of product.options) {
            if (option.displayName !== FLY_SIZES) {
                if (/size/i.test(option.displayName)) sizeOptions.push(row(product, `option "${option.displayName}"`, list(option.values.map(value => value.label)), '', 'not named Fly Sizes: see the option-names job'));
                continue; // eslint-disable-line no-continue
            }
            counts.options++;
            if (isLive(product)) counts.live++;
            if (option.type === 'radio_buttons') radio.push(row(product, 'Fly Sizes is a Radio list', option.type, '', 'for ticket 37: every other product uses a Rectangle list'));
            const current = [...option.values].sort(byOrder);
            const fix = sizeFixes[product.id] || {};
            const entries = current.map(value => ({ value, label: fix[value.label] ?? value.label }));
            const problems = entries.filter(entry => !parseHookSize(entry.label) || isSuspectSize(entry.label));
            if (problems.length) {
                counts.attention++;
                rows.push(row(product, 'Fly Sizes values', list(current.map(value => value.label)), '(unchanged)', `needs a person: ${list(problems.map(entry => entry.label))} ${problems.length === 1 ? 'isn\'t' : 'aren\'t'} a hook size this job can place`));
                continue; // eslint-disable-line no-continue
            }
            const sorted = [...entries].sort((a, b) => compareHook(a.label, b.label));
            const target = sorted.map((entry, index) => ({ ...entry.value, label: hookLabel(entry.label), sortOrder: index }));
            const renamed = sorted.some(entry => hookLabel(entry.label) !== entry.value.label);
            const reordered = sorted.some((entry, index) => entry !== entries[index]);
            if (!renamed && !reordered) {
                counts.unchanged++;
                continue; // eslint-disable-line no-continue
            }
            if (renamed) counts.renamed++;
            if (reordered) counts.reordered++;
            const note = [renamed && 'renamed', reordered && 'reordered', Object.keys(fix).length && 'with Shaun\'s fix'].filter(Boolean).join(', ');
            rows.push(row(product, 'Fly Sizes values', list(current.map(value => value.label)), list(target.map(value => value.label)), note));
            if (plannable(model)) requests.push(optionRequest(product, option, target));
        }
    }
    return {
        id: 'fly-sizes',
        title: 'Fly Sizes: 1/0 to 6/0, and hook order',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff',
        rule: [
            'Every product with a "Fly Sizes" option, Live or not, Gear (hook packs) included.',
            'Rename the aught values 1-0 … 6-0 to 1/0 … 6/0.',
            'Order the values largest hook first: 6/0 … 1/0, then 1, 2, 4 … 24. Each value\'s sort_order becomes its place in that order.',
            'A product with a value that isn\'t a hook size, or a suspect one (an odd number above 1, or above 28), is left alone and listed for a person.',
            'Each write is one PUT of the option with its whole option_values array (every value by id; labels, order and default flags as they are, bar the change), because a value left out of the array may be deleted.',
        ],
        counts,
        rows,
        requests,
        notes: [
            ...(plannable(model) ? [] : [NO_PLAN, 'The export lists values in variant-row order, not by sort_order, so its "reordered" count measures the same thing as the earlier "357 of 1,937 out of order" figure; the API read measures sort_order itself.']),
            ...(counts.attention ? ['The products "needing a person" are written only after Shaun names their values: rerun the dry run with `--size-fixes <file>`, a JSON object of product id to {"old label": "new label"}.'] : []),
            ...selectionProposals(model, rows),
        ],
        extra: { radio, sizeOptions },
    };
}

// --- Default sizes: none preselected on a multi-size product (UX-10) ----------------------------

function defaultSizes(model) {
    const rows = [];
    const requests = [];
    let unknown = 0;
    for (const product of model.products) {
        for (const option of product.options.filter(candidate => candidate.displayName === FLY_SIZES && candidate.values.length > 1)) {
            if (option.values.some(value => value.isDefault === null)) {
                unknown++;
                continue; // eslint-disable-line no-continue
            }
            const defaults = option.values.filter(value => value.isDefault);
            if (!defaults.length) continue; // eslint-disable-line no-continue
            rows.push(row(product, 'Fly Sizes default', `default: ${list(defaults.map(value => value.label))}`, 'no default'));
            if (plannable(model)) requests.push(optionRequest(product, option, [...option.values].sort(byOrder).map(value => ({ ...value, isDefault: false }))));
        }
    }
    return {
        id: 'default-sizes',
        title: 'Drop "default sizes" on multi-size products',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff',
        rule: [
            'Every product whose "Fly Sizes" option has more than one value: clear the default flag, so no size is preselected (UX-10).',
            'One PUT of the option per product, with its whole option_values array: labels and order as they read when the plan is made.',
            'Apply it after the Fly Sizes job, from a fresh dry run: both write the same options, so a plan made before the other was applied is refused as stale.',
        ],
        counts: { products: rows.length, unknown },
        rows,
        requests,
        notes: [
            ...(unknown ? ['The export has no default flags, so this job can only be measured from the API read.'] : []),
            ...(!unknown && !rows.length ? ['No multi-size product has a default size today, so the criterion already holds and there is nothing to write. A later dry run plans it again if a default appears.'] : []),
        ],
        extra: {},
    };
}

// --- Single-size products: preselect the only size (Shaun decides) -----------------------------

function singleSizeDefaults(model) {
    const rows = [];
    const requests = [];
    let alreadyDefault = 0;
    let unknown = 0;
    for (const product of model.products.filter(isLive)) {
        for (const option of product.options.filter(candidate => candidate.displayName === FLY_SIZES && candidate.values.length === 1)) {
            const [value] = option.values;
            if (value.isDefault === null) unknown++;
            else if (value.isDefault) alreadyDefault++;
            else {
                rows.push(row(product, 'Fly Sizes default', `${value.label}, not preselected`, `${value.label}, preselected`));
                if (plannable(model)) requests.push(optionRequest(product, option, [{ ...value, isDefault: true }]));
            }
        }
    }
    return {
        id: 'single-size-defaults',
        title: 'Preselect the only size on single-size products',
        decision: 'Shaun decides (not in decision 15). Recommended: yes. It is the roadmap\'s quick win: the old theme on .com and channel 1 then opens with the size chosen. Ticket 37 checks the only size in the template either way.',
        rule: ['Every Live product whose "Fly Sizes" option has exactly one value: set that value as the default.'],
        counts: {
            products: rows.length + alreadyDefault + unknown, toSet: rows.length, alreadyDefault, unknown,
        },
        rows,
        requests,
        notes: [
            ...(unknown ? ['The export has no default flags: this count is every single-size Live product.'] : []),
            'Ticket 18\'s criterion "No Fly Sizes value carries the default flag" is read as story 37 states it: a multi-size product opens with no size selected. A single size preselected doesn\'t break it. Revisitable: if Shaun reads it literally, this job doesn\'t run.',
        ],
        extra: {},
    };
}

// --- Option names: Color and Colour, Size and Fly Sizes (Shaun decides) -------------------------

function optionNames(model) {
    const rows = [];
    const requests = [];
    const names = {};
    for (const product of model.products) {
        for (const option of product.options) {
            names[option.displayName] = (names[option.displayName] || 0) + 1;
            let target = null;
            if (option.displayName === 'Color') target = SAMPLE_COLOUR;
            else if (option.displayName === 'Size' && option.values.length && option.values.every(value => parseHookSize(value.label))) target = FLY_SIZES;
            if (!target) continue; // eslint-disable-line no-continue
            rows.push(row(product, 'option name', option.displayName, target, `values ${list(option.values.map(value => value.label))}`));
            if (plannable(model)) requests.push(optionRequest(product, option, null, { displayName: target }));
        }
    }
    return {
        id: 'option-names',
        title: 'One name per option: Colour, and Fly Sizes',
        decision: 'Shaun decides (one of the two smaller fixes). Recommended: yes.',
        rule: [
            '"Color" becomes "Colour", the store\'s Canadian spelling and the name the newer products use.',
            '"Size" becomes "Fly Sizes" only where every value is a hook size. A "Size" or "Choose Size" holding box or sticker sizes keeps its name.',
            'A PUT of the option\'s display name only: its values aren\'t sent, so they don\'t change.',
        ],
        counts: { products: rows.length },
        rows,
        requests,
        notes: [`Option names on every product: ${Object.entries(names).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`).join(', ')}.`],
        extra: {},
    };
}

// --- The Live product with no category (Shaun decides) -----------------------------------------

function uncategorised(model) {
    const rows = [];
    const requests = [];
    const tree = new Map(model.categories.filter(category => category.treeId === 1).map(category => [category.id, category]));
    for (const product of model.products.filter(candidate => isLive(candidate) && !candidate.categories.length)) {
        const word = product.name.trim().split(/\s+/).pop().toLowerCase();
        const alike = model.products.filter(other => other !== product && isLive(other) && other.categories.length && other.name.toLowerCase().split(/\s+/).includes(word));
        const tally = new Map();
        for (const other of alike) for (const id of other.categories.filter(category => tree.has(category))) tally.set(id, (tally.get(id) || 0) + 1);
        const proposal = [...tally].filter(([, count]) => count * 2 >= alike.length).map(([id]) => id).sort((a, b) => a - b);
        const named = proposal.map(id => `${id} ${tree.get(id).name}`);
        rows.push(row(product, 'categories', '(none)', proposal.length ? list(named) : '(Shaun names one)', alike.length ? `the tree-1 categories shared by at least half of the ${alike.length} Live products named "…${word}…"` : 'no Live product with a similar name'));
        if (plannable(model) && proposal.length) requests.push(productRequest(product, { categories: proposal }));
    }
    return {
        id: 'uncategorised',
        title: 'A category for the Live product with none',
        decision: 'Shaun decides (one of the two smaller fixes). The proposal is the categories its namesakes share; he may name others.',
        rule: ['Every Live product with no category gets the tree-1 (live reelflies.ca) categories that at least half of the Live products with the same last word in their name share.'],
        counts: { products: rows.length },
        rows,
        requests,
        notes: tree.size ? [] : ['The export has no category tree, so this run makes no proposal: the API read does.'],
        extra: {},
    };
}

// --- The ReelFlies brand on in-house Live products ----------------------------------------------

function brand(model, { signatureCategories = SIGNATURE_CATEGORIES } = {}) {
    const rows = [];
    const requests = [];
    const record = model.brands.find(candidate => candidate.name.toLowerCase() === BRAND_NAME.toLowerCase());
    const live = model.products.filter(isLive);
    const inSet = product => product.categories.some(id => signatureCategories.includes(id));
    const signature = live.filter(inSet);
    const brandName = id => model.brands.find(candidate => candidate.id === id)?.name || (id ? `brand ${id}` : '(no brand)');
    const byBrand = {};
    for (const product of live) byBrand[brandName(product.brandId)] = (byBrand[brandName(product.brandId)] || 0) + 1;
    const counts = {
        live: live.length, signature: signature.length, alreadyBranded: 0, toAssign: 0, brandedOutside: 0,
    };
    for (const product of record ? signature : []) {
        if (product.brandId === record.id) {
            counts.alreadyBranded++;
            continue; // eslint-disable-line no-continue
        }
        counts.toAssign++;
        rows.push(row(product, 'brand', brandName(product.brandId), BRAND_NAME));
        if (plannable(model)) requests.push(productRequest(product, { brand_id: record.id }));
    }
    if (record) counts.brandedOutside = live.filter(product => !inSet(product) && product.brandId === record.id).length;
    const notes = record ? [
        `Found: the "${BRAND_NAME}" brand (id ${record.id}) is already on ${byBrand[BRAND_NAME] || 0} of ${live.length} Live products, not only the Signature set. Live products by brand: ${Object.entries(byBrand).map(([name, count]) => `${name} ${count}`).join(', ')}.`,
        `So /brands/ReelFlies.html lists every ReelFlies-branded product today: the ${counts.alreadyBranded} Signature products that carry it and ${counts.brandedOutside} others. The job as written (assign the brand to the Signature set) changes only the ${counts.toAssign} listed below.`,
        'Options for Shaun (default A, revisitable):',
        `A. Recommended: write only the rows below. Every ReelFlies fly keeps its brand, so the Google and Meta feeds and the product structured data keep "ReelFlies". The brand listing shows all of them; ticket 36 and ticket 48's Signature band gather the Signature patterns from the Signature categories (${signatureCategories.join(', ')}) instead of the brand.`,
        `B. A new "ReelFlies Signature" brand for the ${signature.length} Signature products. It changes their brand in both feeds, and creating a brand is outside this job's writes (Shaun creates it in the control panel; the dry run then plans the assignment).`,
        `C. Not recommended: clear the brand on the ${counts.brandedOutside} other products. Their feed entries would lose the brand Google expects.`,
    ] : [`No brand named "${BRAND_NAME}" in this read${model.source === 'csv' ? ' (the export has brand ids only: the API read names them)' : ''}.`];
    return {
        id: 'brand',
        title: 'The ReelFlies brand on in-house Live products',
        decision: 'approved in principle (ticket 13, decision 15); Shaun confirms the rule (options A to C below) and names any other in-house products',
        rule: [`Every Live product placed in tree-1 ReelFlies Signature Flies: categories ${signatureCategories.join(', ')}. Each gets the existing "${BRAND_NAME}" brand where it has another or none.`, 'A PUT of the product\'s brand_id only.'],
        counts,
        rows,
        requests,
        notes,
        extra: {},
    };
}

// --- The ReelFlies brand listing's fields (ticket 36) -------------------------------------------

function brandFields(model, { brandCopy = null } = {}) {
    const record = model.brands.find(candidate => candidate.name.toLowerCase() === BRAND_NAME.toLowerCase());
    const rows = [];
    const requests = [];
    const fields = ['page_title', 'meta_description'];
    if (record) {
        for (const field of fields) {
            const after = brandCopy ? brandCopy[field] : '(ticket 14\'s copy)';
            if (!brandCopy || after !== record[field]) {
                rows.push({
                    product_id: null, product: `brand ${record.id} ${record.name}`, live: null, what: field, before: record[field] || '(empty)', after: after || '(empty)', note: '',
                });
            }
        }
        if (brandCopy && plannable(model)) {
            const body = Object.fromEntries(fields.filter(field => typeof brandCopy[field] === 'string' && brandCopy[field] !== record[field]).map(field => [field, brandCopy[field]]));
            if (Object.keys(body).length) requests.push(brandRequest(record, body));
        }
    }
    return {
        id: 'brand-fields',
        title: 'The ReelFlies brand listing\'s page title and meta description',
        decision: brandCopy ? 'approved in principle (ticket 13, decision 15); Shaun approves the copy' : 'waiting: the copy is ticket 14\'s, not yet supplied',
        rule: ['Ticket 14\'s page title and meta description, written to the ReelFlies brand record, for /brands/ReelFlies.html (ticket 36).', 'Run with `--brand-copy <file>`, a JSON object {"page_title": …, "meta_description": …}.'],
        counts: { fields: rows.length },
        rows,
        requests,
        notes: [
            'The brand record has no field for an intro. BigCommerce\'s v3 brand holds name, page_title, meta_keywords, meta_description, image_url, search_keywords and custom_url, with no description. So ticket 36 renders the intro another way: a Page Builder text widget in the brand page\'s region on 1895766, as its own text says.',
            ...(record ? [`Today: page_title ${JSON.stringify(record.page_title || '')}, meta_description ${JSON.stringify(record.meta_description || '')}.`] : []),
        ],
        extra: {},
    };
}

// --- White-ground thumbnails (IMG-1), and the re-export list for ticket 14 ----------------------

function flyTypes(model) {
    const tree = model.categories.filter(category => category.treeId === 1);
    const flies = tree.find(category => category.parentId === 0 && category.name.trim().toLowerCase() === 'flies');
    if (!flies) return new Map();
    const roots = tree.filter(category => category.parentId === flies.id);
    const parent = new Map(tree.map(category => [category.id, category.parentId]));
    const rootIds = new Set(roots.map(root => root.id));
    const rootOf = id => {
        let at = id;
        for (let depth = 0; depth < 10 && at; depth++) {
            if (rootIds.has(at)) return at;
            at = parent.get(at);
        }
        return null;
    };
    return new Map(roots.map(root => [root.id, { name: root.name, rootOf }]));
}

function thumbnails(model, { grounds = null, sales = null } = {}) {
    const rows = [];
    const requests = [];
    const reexport = [];
    const counts = {
        live: 0, white: 0, swapped: 0, reexport: 0, unknown: 0, noThumbnail: 0,
    };
    const ground = image => (grounds && grounds.get(image.id)?.ground) || 'unknown';
    for (const product of model.products.filter(isLive)) {
        counts.live++;
        const thumb = product.images.find(image => image.isThumbnail);
        if (!thumb) {
            counts.noThumbnail++;
            rows.push(row(product, 'thumbnail', '(none)', '', product.images.length ? 'no image is the thumbnail' : 'no images'));
            continue; // eslint-disable-line no-continue
        }
        const own = ground(thumb);
        if (own === 'white') {
            counts.white++;
            continue; // eslint-disable-line no-continue
        }
        const alternative = product.images.filter(image => image !== thumb && ground(image) === 'white').sort(byOrder)[0];
        if (alternative) {
            counts.swapped++;
            rows.push(row(product, 'thumbnail', `image ${thumb.id} (${own})`, `image ${alternative.id} (white)`));
            if (plannable(model)) requests.push(imageRequest(product, alternative, { is_thumbnail: true }));
        } else if (own === 'unknown') {
            counts.unknown++;
            rows.push(row(product, 'thumbnail', `image ${thumb.id} (unread)`, '', grounds ? `check by eye: ${grounds.get(thumb.id)?.reason || 'unread'}` : 'photos not read in this run'));
        } else {
            counts.reexport++;
            reexport.push({ product, thumb, ground: own });
        }
    }
    const units = product => (sales && sales.get(product.id)) || 0;
    const top = new Set(model.products.filter(isLive).filter(product => units(product) > 0).sort((a, b) => units(b) - units(a)).slice(0, TOP_SELLERS).map(product => product.id));
    const types = flyTypes(model);
    const pageOne = new Map();
    for (const [rootId, { name, rootOf }] of types) {
        const members = model.products.filter(product => isLive(product) && product.categories.some(id => rootOf(id) === rootId));
        members.sort((a, b) => units(b) - units(a) || a.name.localeCompare(b.name)).slice(0, PAGE_ONE).forEach(product => {
            if (!pageOne.has(product.id)) pageOne.set(product.id, name);
        });
    }
    const tier = product => {
        if (top.has(product.id)) return 1;
        if (pageOne.has(product.id)) return 2;
        return 3;
    };
    reexport.sort((a, b) => tier(a.product) - tier(b.product) || units(b.product) - units(a.product) || a.product.name.localeCompare(b.product.name));
    const ranked = reexport.map(({ product, thumb, ground: own }, index) => ({
        rank: index + 1,
        tier: ['', `top ${TOP_SELLERS} seller`, `page 1 of ${pageOne.get(product.id)}`, 'the rest'][tier(product)],
        product_id: product.id,
        product: product.name,
        sku: product.sku,
        thumbnail_image_id: thumb.id,
        thumbnail_ground: own,
        thumbnail_url: thumb.url,
    }));
    return {
        id: 'thumbnails',
        title: 'White-ground thumbnails, and the re-export list for ticket 14',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff',
        rule: [
            'Every Live product whose thumbnail isn\'t on white, judged from the border of its 44 x 58 rendition (images.mjs), and that has another image on white: that image becomes the thumbnail (its lowest sort order first). Setting one image as the thumbnail clears the old one.',
            `Every other Live product whose thumbnail is on black or another colour goes on the re-export list for ticket 14, ranked: the top ${TOP_SELLERS} sellers by units in the last 365 days, then page 1 (${PAGE_ONE} products, best sellers first) of each tree-1 Fly Type, then the rest.`,
            'A thumbnail that couldn\'t be read is listed for a person to check by eye.',
        ],
        counts,
        rows,
        requests,
        notes: [
            ...(grounds ? [] : ['The photos weren\'t read in this run (`--images skip`), so every thumbnail counts as unread.']),
            ...(sales ? [] : ['No sales file was given, so the re-export list isn\'t ranked by sales.']),
            ...(types.size ? [] : ['No tree-1 Fly Types in this read, so the list has no "page 1" tier.']),
            ...(ranked.length ? [`The re-export list by tier: ${[`top ${TOP_SELLERS} seller`, 'page 1 of', 'the rest'].map(prefix => `${prefix.replace(' of', '')} ${ranked.filter(item => item.tier.startsWith(prefix)).length}`).join(', ')}.`] : []),
        ],
        extra: { reexport: ranked },
    };
}

// --- Alt text: no empty image descriptions (story 68) -------------------------------------------

function altText(model) {
    const rows = [];
    const requests = [];
    let images = 0;
    for (const product of model.products) {
        for (const image of [...product.images].sort(byOrder)) {
            images++;
            if (image.description.trim()) continue; // eslint-disable-line no-continue
            rows.push(row(product, `image ${image.id} description`, '(empty)', product.name));
            if (plannable(model)) requests.push(imageRequest(product, image, { description: product.name }));
        }
    }
    return {
        id: 'alt-text',
        title: 'Alt text: a description on every product image',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff (and may give better text for any row)',
        rule: ['Every product image, Live or not, whose description is empty gets the product\'s name, which Cornerstone uses as the image\'s alt text.', 'A PUT of the image\'s description only.'],
        counts: { images, empty: rows.length, live: rows.filter(item => item.live).length },
        rows,
        requests,
        notes: [],
        extra: {},
    };
}

export const JOBS = [
    ['fly-sizes', flySizes],
    ['default-sizes', defaultSizes],
    ['single-size-defaults', singleSizeDefaults],
    ['option-names', optionNames],
    ['uncategorised', uncategorised],
    ['brand', brand],
    ['brand-fields', brandFields],
    ['thumbnails', thumbnails],
    ['alt-text', altText],
];

export function runJobs(model, context = {}, only = null) {
    return JOBS.filter(([id]) => !only || only.includes(id)).map(([, job]) => job(model, context));
}
