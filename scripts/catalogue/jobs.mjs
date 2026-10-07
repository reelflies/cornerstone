// The catalogue jobs (ticket 18), as dry runs: each reads the model (from the export, csv.mjs, or
// the API, api-read.mjs) and returns the rows of its diff, and, from an API read only, the exact
// requests that would make the change. Nothing here writes: a plan file is applied only by
// scripts/catalogue/apply.mjs, at Shaun's terminal.
//
//   import { JOBS, runJobs } from './jobs.mjs';
//   const results = runJobs(model, { grounds, sales, brandCopy, sizeFixes, signatureBrand, brandProducts });
//
// A result is { id, title, decision, rule, counts, rows, requests, notes, extra, measured? }:
// - measured: false when this model can't measure the job (the export has no default flags and
//   no brand names), so the batch page says "not in the export" rather than 0
// - rows: { product_id, product, live, what, before, after, note }, one per change or finding
// - requests: { method, path, body, before, product_id }. `before` is the read the request was
//   planned against; apply refuses the plan if the store no longer reads that way. A request for
//   an option the Fly Sizes job also writes is planned on that job's result, and carries
//   `prior: { job: 'fly-sizes', before }` (the option as it reads now), so each approved plan
//   applies as approved, Fly Sizes first.
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
// The brand listing's URL as spec module 12, tickets 36 and 48 and ticket 03's amendment name it.
// The store's URL for the brand is its custom_url, which the API read gives.
export const PLANNED_BRAND_URL = '/brands/ReelFlies.html';
// The re-export list's first tier, and a Fly Type listing's first page (24 per page, ticket 32).
const TOP_SELLERS = 200;
const PAGE_ONE = 24;
const COLOUR = 'Colour';

export const isLive = product => product.isVisible && product.channels.includes(1);
// A Fly Sizes option: one named so, or a "Size" whose every value is a hook size (the option-names
// job renames those, and the Fly Sizes jobs take them as they are: the two write different fields).
const hookSizes = option => option.values.length > 0 && option.values.every(value => parseHookSize(value.label));
export const isFlySizes = option => option.displayName === FLY_SIZES || (option.displayName === 'Size' && hookSizes(option));
const optionsOf = (products, keep) => products.flatMap(product => product.options.filter(keep).map(option => ({ product, option })));
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
// `base` is the values another job's plan leaves (`priorJob`'s): the request is planned on them.
const currentValues = option => [...option.values].sort(byOrder).map(optionValue);
function optionRequest(product, option, values, { displayName, base = null, priorJob = null } = {}) {
    const body = {};
    if (displayName !== undefined) body.display_name = displayName;
    if (values) body.option_values = values.map(optionValue);
    const now = { display_name: option.displayName, option_values: currentValues(option) };
    return {
        method: 'PUT',
        path: `/v3/catalog/products/${product.id}/options/${option.id}`,
        body,
        before: base ? { display_name: option.displayName, option_values: base.map(optionValue) } : now,
        ...(base ? { prior: { job: priorJob, before: now } } : {}),
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
    const howOthersSell = plain === others.length
        ? `none of the other ${others.length} Live "Selection" products has an option: each sells as one item`
        : `${plain} of the other ${others.length} Live "Selection" products have no option at all and sell as one item`;
    return flagged.map(item => `Proposal for ${item.product_id} "${item.product}" (values ${item.before}): ${howOthersSell}. Recommended: Shaun removes this option in the control panel so it sells like them (deleting an option or its variants is outside this job's writes), after checking which variant holds the stock. If he keeps two variants, he names their labels and the dry run plans the rename (\`--size-fixes\`).`);
}

// --- Fly Sizes: the aught rename and hook order ------------------------------------------------

// What the Fly Sizes job does to one option: { problems } for values it can't place, or
// { target, renamed, reordered }, with target null when the option is already right.
function flySizesChange(product, option, sizeFixes = {}) {
    const current = [...option.values].sort(byOrder);
    const fix = sizeFixes[product.id] || {};
    const entries = current.map(value => ({ value, label: fix[value.label] ?? value.label }));
    const problems = entries.filter(entry => !parseHookSize(entry.label) || isSuspectSize(entry.label));
    if (problems.length) {
        return {
            current, fix, problems, target: null,
        };
    }
    const sorted = [...entries].sort((a, b) => compareHook(a.label, b.label));
    const renamed = sorted.some(entry => hookLabel(entry.label) !== entry.value.label);
    const reordered = sorted.some((entry, index) => entry !== entries[index]);
    const target = renamed || reordered ? sorted.map((entry, index) => ({ ...entry.value, label: hookLabel(entry.label), sortOrder: index })) : null;
    return {
        current, fix, problems, target, renamed, reordered,
    };
}

// The option's values once the Fly Sizes plan is applied, or null if that plan doesn't write it.
const afterFlySizes = (product, option, sizeFixes) => (isFlySizes(option) ? flySizesChange(product, option, sizeFixes).target : null);

// A request for a Fly Sizes option, planned on the Fly Sizes job's result where that job writes it.
function onFlySizes(product, option, sizeFixes, values) {
    const base = afterFlySizes(product, option, sizeFixes);
    return optionRequest(product, option, values(base || [...option.values].sort(byOrder)), { base, priorJob: base ? 'fly-sizes' : null });
}

function flySizes(model, { sizeFixes = {} } = {}) {
    const rows = [];
    const requests = [];
    const counts = {
        options: 0, live: 0, renamed: 0, reordered: 0, unchanged: 0, attention: 0,
    };
    const radio = [];
    const sizeOptions = optionsOf(model.products, option => option.displayName !== FLY_SIZES && /size/i.test(option.displayName)).map(({ product, option }) => row(
        product,
        `option "${option.displayName}"`,
        list(option.values.map(value => value.label)),
        '',
        isFlySizes(option) ? 'hook sizes under another name: this job orders them, and the option-names job renames the option (they write different fields, so either may run first)' : 'not named Fly Sizes, and not all hook sizes: see the option-names job',
    ));
    for (const { product, option } of optionsOf(model.products, isFlySizes)) {
        counts.options++;
        if (isLive(product)) counts.live++;
        if (option.type === 'radio_buttons') radio.push(row(product, 'Fly Sizes is a Radio list', option.type, '', 'for ticket 37: every other product uses a Rectangle list'));
        const change = flySizesChange(product, option, sizeFixes);
        const labels = values => list(values.map(value => value.label));
        if (change.problems.length) {
            counts.attention++;
            rows.push(row(product, 'Fly Sizes values', labels(change.current), '(unchanged)', `needs a person: ${list(change.problems.map(entry => entry.label))} ${change.problems.length === 1 ? 'isn\'t' : 'aren\'t'} a hook size this job can place`));
        } else if (!change.target) counts.unchanged++;
        else {
            if (change.renamed) counts.renamed++;
            if (change.reordered) counts.reordered++;
            const note = [change.renamed && 'renamed', change.reordered && 'reordered', Object.keys(change.fix).length && 'with Shaun\'s fix'].filter(Boolean).join(', ');
            rows.push(row(product, 'Fly Sizes values', labels(change.current), labels(change.target), note));
            if (plannable(model)) requests.push(optionRequest(product, option, change.target));
        }
    }
    const reorderedNote = plannable(model)
        ? `The API read counts ${counts.reordered} options out of hook order by sort_order, the order the storefront shows: that is the real figure. An export (its counts are shown beside these when the dry run is given one) lists values in variant-row order instead, so its "reordered" count is larger, and measures the same thing as the ticket's "357 of 1,937 Live products out of order" (content-manifest), which came from an export. The two don't conflict.`
        : 'The export lists values in variant-row order, not by sort_order, so its "reordered" count measures the same thing as the ticket\'s "357 of 1,937 Live products out of order" figure (content-manifest); the API read measures sort_order itself, the order the storefront shows, and is the real figure.';
    return {
        id: 'fly-sizes',
        title: 'Fly Sizes: 1/0 to 6/0, and hook order',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff',
        rule: [
            'Every product with a "Fly Sizes" option, Live or not, Gear (hook packs) included, and every "Size" option whose values are all hook sizes (the option-names job renames those to "Fly Sizes").',
            'Rename the aught values 1-0 … 6-0 to 1/0 … 6/0.',
            'Order the values largest hook first: 6/0 … 1/0, then 1, 2, 4 … 24. Each value\'s sort_order becomes its place in that order.',
            'A product with a value that isn\'t a hook size, or a suspect one (an odd number above 1, or above 28), is left alone and listed for a person.',
            'Each write is one PUT of the option with its whole option_values array (every value by id; labels, order and default flags as they are, bar the change), because a value left out of the array may be deleted.',
            'Apply this plan first: the default-size jobs are planned on its result for the options both write.',
        ],
        counts,
        rows,
        requests,
        notes: [
            ...(plannable(model) ? [] : [NO_PLAN]),
            reorderedNote,
            ...(counts.attention ? ['The products "needing a person" are written only after Shaun names their values: rerun the dry run with `--size-fixes <file>`, a JSON object of product id to {"old label": "new label"}.'] : []),
            ...selectionProposals(model, rows),
        ],
        extra: { radio, sizeOptions },
    };
}

// --- Default sizes: none preselected on a multi-size product (UX-10) ----------------------------

const ON_FLY_SIZES = 'Planned on the Fly Sizes job\'s result for every option that job also writes (the request carries it as `prior`): apply this plan after the Fly Sizes plan, as approved. Until then apply refuses it, writing nothing, and it stays valid.';

function defaultSizes(model, { sizeFixes = {} } = {}) {
    const rows = [];
    const requests = [];
    const multi = optionsOf(model.products, option => isFlySizes(option) && option.values.length > 1);
    const unknown = multi.filter(({ option }) => option.values.some(value => value.isDefault === null)).length;
    const flagged = multi.filter(({ option }) => option.values.every(value => value.isDefault !== null) && option.values.some(value => value.isDefault));
    for (const { product, option } of flagged) {
        rows.push(row(product, 'Fly Sizes default', `default: ${list(option.values.filter(value => value.isDefault).map(value => value.label))}`, 'no default', afterFlySizes(product, option, sizeFixes) ? 'planned on the Fly Sizes job\'s result: apply it after that job' : ''));
        if (plannable(model)) requests.push(onFlySizes(product, option, sizeFixes, values => values.map(value => ({ ...value, isDefault: false }))));
    }
    return {
        id: 'default-sizes',
        title: 'Drop "default sizes" on multi-size products',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff',
        rule: [
            'Every product whose Fly Sizes option has more than one value: clear the default flag, so no size is preselected (UX-10).',
            'One PUT of the option per product, with its whole option_values array: labels and order as the Fly Sizes job leaves them.',
            ON_FLY_SIZES,
        ],
        counts: { products: rows.length, unknown },
        rows,
        requests,
        measured: !unknown,
        notes: [
            ...(unknown ? ['The export has no default flags, so this job can only be measured from the API read.'] : []),
            ...(!unknown && !rows.length ? ['No multi-size product has a default size today, so the criterion already holds and there is nothing to write. A later dry run plans it again if a default appears.'] : []),
        ],
        extra: {},
    };
}

// --- Single-size products: preselect the only size (Shaun decides) -----------------------------

function singleSizeDefaults(model, { sizeFixes = {} } = {}) {
    const rows = [];
    const requests = [];
    const single = optionsOf(model.products.filter(isLive), option => isFlySizes(option) && option.values.length === 1);
    const unknown = single.filter(({ option }) => option.values[0].isDefault === null).length;
    const alreadyDefault = single.filter(({ option }) => option.values[0].isDefault === true).length;
    for (const { product, option } of single.filter(({ option: candidate }) => candidate.values[0].isDefault === false)) {
        const [value] = option.values;
        const base = afterFlySizes(product, option, sizeFixes);
        const label = base ? base[0].label : value.label;
        rows.push(row(product, 'Fly Sizes default', `${label}, not preselected`, `${label}, preselected`, base ? `planned on the Fly Sizes job's result (${value.label} is renamed there): apply it after that job` : ''));
        if (plannable(model)) requests.push(onFlySizes(product, option, sizeFixes, values => values.map(entry => ({ ...entry, isDefault: true }))));
    }
    return {
        id: 'single-size-defaults',
        title: 'Preselect the only size on single-size products',
        decision: 'Shaun decides (not in decision 15). Recommended: yes. It is the roadmap\'s quick win: the old theme on .com and channel 1 then opens with the size chosen. Ticket 37 checks the only size in the template either way.',
        rule: ['Every Live product whose Fly Sizes option has exactly one value: set that value as the default.', ON_FLY_SIZES],
        counts: {
            products: rows.length + alreadyDefault + unknown, toSet: rows.length, alreadyDefault, unknown, onFlySizes: requests.filter(request => request.prior).length,
        },
        rows,
        requests,
        measured: !unknown,
        notes: [
            ...(unknown ? ['The export has no default flags: this count is every single-size Live product.'] : []),
            'Ticket 18\'s criterion "No Fly Sizes value carries the default flag" is read as story 37 states it: a multi-size product opens with no size selected. A single size preselected doesn\'t break it. Revisitable: if Shaun reads it literally, this job doesn\'t run.',
        ],
        extra: {},
    };
}

// --- Option names: Color and Colour, Size and Fly Sizes (Shaun decides) -------------------------

function optionNames(model) {
    const names = {};
    for (const { option } of optionsOf(model.products, () => true)) names[option.displayName] = (names[option.displayName] || 0) + 1;
    const targetOf = option => {
        if (option.displayName === 'Color') return COLOUR;
        return option.displayName === 'Size' && hookSizes(option) ? FLY_SIZES : null;
    };
    const renamed = optionsOf(model.products, option => targetOf(option) !== null);
    const rows = renamed.map(({ product, option }) => row(product, 'option name', option.displayName, targetOf(option), `values ${list(option.values.map(value => value.label))}`));
    const requests = plannable(model) ? renamed.map(({ product, option }) => optionRequest(product, option, null, { displayName: targetOf(option) })) : [];
    return {
        id: 'option-names',
        title: 'One name per option: Colour, and Fly Sizes',
        decision: 'Shaun decides (one of the two smaller fixes). Recommended: yes.',
        rule: [
            '"Color" becomes "Colour", the store\'s Canadian spelling and the name the newer products use.',
            '"Size" becomes "Fly Sizes" only where every value is a hook size. A "Size" or "Choose Size" holding box or sticker sizes keeps its name.',
            'A PUT of the option\'s display name only: its values aren\'t sent, so they don\'t change. The Fly Sizes jobs already take a "Size" of hook sizes, and write only its values, so this plan may run before or after them.',
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

const findBrand = (model, name) => model.brands.find(candidate => candidate.name.toLowerCase() === name.toLowerCase());

// A brand's listing URL, as the store gives it (custom_url), for the brand page and the batch.
const urlOf = record => ({
    id: record.id, name: record.name, url: record.url ?? null, customized: record.urlCustomized ?? null,
});
const howMade = record => (record.urlCustomized ? 'custom_url, set by hand' : 'custom_url, not customized');
const urlText = record => (record.url ? `${record.url}` : '(not in this read)');

// The URL every option shares: the store's, which the plans don't name. No change is proposed.
function urlNote(record) {
    const subject = `The URL: the "${record.name}" brand's listing is at ${urlText(record)}`;
    if (record.url === PLANNED_BRAND_URL) return `${subject} (${howMade(record)}), the URL spec module 12, tickets 36 and 48 and ticket 03's amendment name.`;
    if (!record.url) return `${subject}: the export has no brand URLs, so the API read says which URL the listing has.`;
    return [
        `${subject}, the URL the store made from its name (${howMade(record)}), not the ${PLANNED_BRAND_URL} that spec module 12, tickets 36 and 48 and ticket 03's amendment name.`,
        `Under every option below that listing keeps ${record.url} (under B, the new brand's listing has its own store-made URL), and tickets 36 and 48 and this ticket's criterion 3 are read against it.`,
        'No URL change is proposed, so ticket 36 needs none approved: refactor 09\'s Signature rows are dynamic Brand rows, which follow the brand\'s URL, and only their text naming the old URL needs correcting.',
        `Setting custom_url to ${PLANNED_BRAND_URL} instead would be a store-wide catalogue write (the brand page moves on reelflies.com and live reelflies.ca too), outside this job's writes: it is Shaun's to ask for, and not recommended.`,
    ].join(' ');
}

// Options A to C, with what each costs. No agent default: A changes an owner decision (spec module
// 12, HANDOFF's "Signature patterns are also gathered on the ReelFlies brand page"), and B and C
// change the feeds. The agent's recommendation is B, as the one that keeps module 12.
function brandOptions(counts) {
    return [
        `That breaks what four plans count on. Spec module 12 says "The brand page at ${PLANNED_BRAND_URL} gathers the Signature patterns", and that "the home Signature band and the Signature redirect both point here". Ticket 36 builds that page, ticket 48's Signature band links to it, and ticket 03's amendment maps refactor 09's Signature Redirect rows (categories 434 and 357) to brand ${counts.brandId}. A brand listing lists the brand's products: the theme can't make it list a category's, and tree 4 on 1895766 has no Signature category (ticket 03 item 10; ticket 48 never links to one).`,
        'Shaun picks A, B or C. No agent default is taken, because each option changes an owner decision or the feeds; until he picks, the dry run plans only the job as written (the rows below).',
        `A. No more brand writes. The ${BRAND_NAME} listing (${counts.url}) stays a listing of every ReelFlies product (${counts.branded} Live today), not a Signature page. Spec module 12 then changes: ticket 36's page, ticket 48's "See all ReelFlies originals" button and refactor 09's Signature Redirects (staged by refactor 15) all land on almost the whole catalogue, so 48 needs another target or label, and refactor 09 another target for the old Signature URLs. The feeds and the structured data don't change.`,
        `B. The agent's recommendation: a new brand (for example "ReelFlies Signature") on the ${counts.signature} Signature products, so its listing gathers exactly the Signature patterns, as module 12 intends. The costs: the new brand's own URL, which the store makes from its name in the same short form as ${counts.url} (for example /reelflies-signature/, with a number if that is taken), so ticket 36's page, ticket 48's button and ticket 03's Signature Redirect rows (refactor 09, staged by refactor 15) move to it, and ticket 18's criteria 3 and 4 are read against the new brand (its page title and meta description go on it); and the ${counts.signature} products' brand changes in the Google and Meta feeds and in their structured data, so the feed notice before the brand job says so. Creating a brand is outside this job's writes: Shaun creates it in the control panel, then the dry run with \`--signature-brand "<its name>"\` reads its URL and plans the ${counts.signature} assignments and its page title and meta description for his approval.`,
        `C. Not recommended: keep the ${BRAND_NAME} listing (${counts.url}) for the Signature set by clearing or moving the brand on the ${counts.brandedOutside} other products. Their feed entries would lose or change the brand Google expects: ${counts.brandedOutside} products, against B's ${counts.signature}.`,
    ];
}

function brand(model, {
    signatureCategories = SIGNATURE_CATEGORIES, signatureBrand = null, brandProducts = [],
} = {}) {
    const record = findBrand(model, BRAND_NAME);
    const target = signatureBrand ? findBrand(model, signatureBrand) : record;
    const live = model.products.filter(isLive);
    const inSet = product => product.categories.some(id => signatureCategories.includes(id));
    const signature = live.filter(inSet);
    // Other in-house products Shaun names (--brand-products): Live ones join the set.
    const named = brandProducts.map(id => ({ id, product: model.products.find(product => product.id === id) }));
    const namedLive = named.filter(({ product }) => product && isLive(product) && !inSet(product)).map(({ product }) => product);
    const notNamed = named.filter(({ product }) => !product || !isLive(product)).map(({ id, product }) => `${id} (${product ? 'not Live' : 'not in this read'})`);
    const set = [...signature, ...namedLive];
    const brandName = id => model.brands.find(candidate => candidate.id === id)?.name || (id ? `brand ${id}` : '(no brand)');
    const byBrand = {};
    for (const product of live) byBrand[brandName(product.brandId)] = (byBrand[brandName(product.brandId)] || 0) + 1;
    const toAssign = target ? set.filter(product => product.brandId !== target.id) : [];
    const counts = {
        live: live.length,
        signature: signature.length,
        alreadyBranded: target ? signature.length - toAssign.filter(inSet).length : 0,
        toAssign: toAssign.length,
        brandedOutside: record ? live.filter(product => !inSet(product) && product.brandId === record.id).length : 0,
        ...(brandProducts.length ? { named: namedLive.length } : {}),
    };
    const rows = toAssign.map(product => row(product, 'brand', brandName(product.brandId), target.name, namedLive.includes(product) ? 'named by Shaun (--brand-products)' : ''));
    const requests = plannable(model) ? toAssign.map(product => productRequest(product, { brand_id: target.id })) : [];
    const notes = [];
    if (signatureBrand && !target) notes.push(`No brand named "${signatureBrand}" in this read: Shaun creates it in the control panel first (option B), then the dry run plans it.`);
    if (signatureBrand && target) notes.push(`The "${target.name}" brand's listing is at ${urlText(target)} (${howMade(target)}): ticket 36's page, ticket 48's button, refactor 09's Signature rows and this ticket's criteria 3 and 4 are read against it.`);
    if (notNamed.length) notes.push(`Named by Shaun and not in the set: ${notNamed.join(', ')}.`);
    if (record) {
        notes.push(
            `Found: the "${BRAND_NAME}" brand (id ${record.id}) is already on ${byBrand[BRAND_NAME] || 0} of ${live.length} Live products, not only the Signature set. Live products by brand: ${Object.entries(byBrand).map(([name, count]) => `${name} ${count}`).join(', ')}.`,
            urlNote(record),
            `So its listing (${urlText(record)}) lists every ReelFlies-branded product today: the ${signature.filter(product => product.brandId === record.id).length} Signature products that carry it and ${counts.brandedOutside} others.${signatureBrand ? '' : ` The job as written (assign the brand to the Signature set) changes only the ${counts.toAssign} listed below.`}`,
            ...(signatureBrand ? [] : brandOptions({
                brandId: record.id, branded: byBrand[BRAND_NAME] || 0, signature: signature.length, brandedOutside: counts.brandedOutside, url: urlText(record),
            })),
        );
    } else notes.push(`No brand named "${BRAND_NAME}" in this read${model.source === 'csv' ? ' (the export has brand ids only: the API read names them)' : ''}.`);
    return {
        id: 'brand',
        title: 'The ReelFlies brand on in-house Live products',
        decision: signatureBrand
            ? `option B, which Shaun picked: "${signatureBrand}" on the Signature set; Shaun approves this diff`
            : 'approved in principle (ticket 13, decision 15), but Shaun first picks A, B or C (the notes on the brand page): no agent default is taken. He also names any other in-house products (`--brand-products`)',
        rule: [
            `Every Live product placed in tree-1 ReelFlies Signature Flies: categories ${signatureCategories.join(', ')}${brandProducts.length ? `, and the products Shaun names (--brand-products): ${brandProducts.join(', ')}` : ''}. Each gets the ${signatureBrand ? `"${signatureBrand}" brand (option B)` : `existing "${BRAND_NAME}" brand`} where it has another or none.`,
            'A PUT of the product\'s brand_id only.',
        ],
        counts,
        rows,
        requests,
        notes,
        measured: model.source !== 'csv',
        extra: { url: target ? urlOf(target) : null },
    };
}

// --- The brand listing's fields (ticket 36) -----------------------------------------------------

// On the ReelFlies brand, or under option B on the brand Shaun made for the Signature set, whose
// listing is then ticket 36's page.
function brandFields(model, { brandCopy = null, signatureBrand = null } = {}) {
    const name = signatureBrand || BRAND_NAME;
    const record = findBrand(model, name);
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
        rule: [
            `Ticket 14's page title and meta description, written to the "${name}" brand record, for its listing at ${record ? urlText(record) : '(the brand isn\'t in this read)'} (ticket 36).${signatureBrand ? ' Option B: the new brand\'s listing is ticket 36\'s page, so the copy goes on it, not on the ReelFlies brand.' : ''}`,
            'Run with `--brand-copy <file>`, a JSON object {"page_title": …, "meta_description": …}.',
        ],
        counts: { fields: rows.length },
        rows,
        requests,
        measured: model.source !== 'csv',
        notes: [
            'The brand record has no field for an intro. BigCommerce\'s v3 brand holds name, page_title, meta_keywords, meta_description, image_url, search_keywords and custom_url, with no description. So ticket 36 renders the intro another way: a Page Builder text widget in the brand page\'s region on 1895766, as its own text says.',
            ...(record ? [`Today: page_title ${JSON.stringify(record.page_title || '')}, meta_description ${JSON.stringify(record.meta_description || '')}.`] : []),
            ...(!record && model.source !== 'csv' ? [`No brand named "${name}" in this read${signatureBrand ? ': Shaun creates it in the control panel first (option B)' : ''}.`] : []),
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

// A Live product's thumbnail, judged: 'none' (no photo at all), 'unset' (photos, none the
// thumbnail), 'white', 'swap' (another photo is on white), 'unknown' (unread), or 'reexport'.
function thumbnailCase(product, ground) {
    const thumb = product.images.find(image => image.isThumbnail);
    if (!product.images.length) return { kind: 'none', thumb: null, ground: 'none' };
    if (!thumb) return { kind: 'unset', thumb };
    const own = ground(thumb);
    if (own === 'white') return { kind: 'white', thumb };
    const alternative = product.images.filter(image => image !== thumb && ground(image) === 'white').sort(byOrder)[0];
    if (alternative) {
        return {
            kind: 'swap', thumb, ground: own, alternative,
        };
    }
    return { kind: own === 'unknown' ? 'unknown' : 'reexport', thumb, ground: own };
}

function thumbnails(model, { grounds = null, sales = null } = {}) {
    const rows = [];
    const requests = [];
    const reexport = [];
    const counts = {
        live: 0, white: 0, swapped: 0, reexport: 0, unknown: 0, noThumbnail: 0, noImages: 0,
    };
    const ground = image => (grounds && grounds.get(image.id)?.ground) || 'unknown';
    for (const product of model.products.filter(isLive)) {
        counts.live++;
        const found = thumbnailCase(product, ground);
        if (found.kind === 'none') {
            counts.noImages++;
            counts.reexport++;
            rows.push(row(product, 'thumbnail', '(none)', '', 'no images: on the re-export list for ticket 14 (ground "none")'));
            reexport.push({ product, thumb: null, ground: 'none' });
        } else if (found.kind === 'unset') {
            counts.noThumbnail++;
            rows.push(row(product, 'thumbnail', '(none)', '', 'no image is the thumbnail'));
        } else if (found.kind === 'white') counts.white++;
        else if (found.kind === 'swap') {
            counts.swapped++;
            rows.push(row(product, 'thumbnail', `image ${found.thumb.id} (${found.ground})`, `image ${found.alternative.id} (white)`));
            if (plannable(model)) requests.push(imageRequest(product, found.alternative, { is_thumbnail: true }));
        } else if (found.kind === 'unknown') {
            counts.unknown++;
            rows.push(row(product, 'thumbnail', `image ${found.thumb.id} (unread)`, '', grounds ? `check by eye: ${grounds.get(found.thumb.id)?.reason || 'unread'}` : 'photos not read in this run'));
        } else {
            counts.reexport++;
            reexport.push({ product, thumb: found.thumb, ground: found.ground });
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
        thumbnail_image_id: thumb ? thumb.id : '',
        thumbnail_ground: own,
        thumbnail_url: thumb ? thumb.url : '',
    }));
    return {
        id: 'thumbnails',
        title: 'White-ground thumbnails, and the re-export list for ticket 14',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff',
        rule: [
            'Every Live product whose thumbnail isn\'t on white, judged from the border of its 44 x 58 rendition (images.mjs), and that has another image on white: that image becomes the thumbnail (its lowest sort order first). Setting one image as the thumbnail clears the old one.',
            `Every other Live product whose thumbnail is on black or another colour, and every Live product with no photo at all (ground "none"), goes on the re-export list for ticket 14, ranked: the top ${TOP_SELLERS} sellers by units in the last 365 days, then page 1 (${PAGE_ONE} products, best sellers first) of each tree-1 Fly Type, then the rest.`,
            'A thumbnail that couldn\'t be read is listed for a person to check by eye.',
        ],
        counts,
        rows,
        requests,
        notes: [
            ...(grounds ? [] : ['The photos weren\'t read in this run (`--images skip`), so every thumbnail counts as unread.']),
            ...(sales ? [] : ['No sales file was given, so the re-export list isn\'t ranked by sales.']),
            ...(types.size ? [] : ['No tree-1 Fly Types in this read, so the list has no "page 1" tier.']),
            ...(counts.noImages ? [`${counts.noImages} Live ${counts.noImages === 1 ? 'product has' : 'products have'} no photo at all, so ${counts.noImages === 1 ? 'it is' : 'they are'} on the re-export list with ground "none": ${list(reexport.filter(item => !item.thumb).map(item => `${item.product.id} ${item.product.name}`))}.`] : []),
            ...(ranked.length ? [`The re-export list by tier: ${[`top ${TOP_SELLERS} seller`, 'page 1 of', 'the rest'].map(prefix => `${prefix.replace(' of', '')} ${ranked.filter(item => item.tier.startsWith(prefix)).length}`).join(', ')}.`] : []),
        ],
        extra: { reexport: ranked },
    };
}

// --- Alt text: no empty image descriptions (story 68) -------------------------------------------

function altText(model) {
    const images = model.products.flatMap(product => [...product.images].sort(byOrder).map(image => ({ product, image })));
    const empty = images.filter(({ image }) => !image.description.trim());
    const rows = empty.map(({ product, image }) => row(product, `image ${image.id} description`, '(empty)', product.name));
    const requests = plannable(model) ? empty.map(({ product, image }) => imageRequest(product, image, { description: product.name })) : [];
    return {
        id: 'alt-text',
        title: 'Alt text: a description on every product image',
        decision: 'approved in principle (ticket 13, decision 15); Shaun approves this diff (and may give better text for any row)',
        rule: ['Every product image, Live or not, whose description is empty gets the product\'s name, which Cornerstone uses as the image\'s alt text.', 'A PUT of the image\'s description only.'],
        counts: { images: images.length, empty: rows.length, live: rows.filter(item => item.live).length },
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
