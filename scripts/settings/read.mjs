#!/usr/bin/env node
// Ticket 21's read-only reads: every store setting the settings checklist depends on, read
// globally and for channels 1 (reelflies.ca), 1855224 (reelflies.com) and 1895766 (ReelFlies_CA),
// with the read-only store API token and GETs only. It writes nothing to the store.
//
//   node scripts/settings/read.mjs
//
// It prints a Markdown report that research/21-store-settings.md quotes, and keeps the raw reads
// outside git with the store helper's snapshots:
// ~/reelflies/store-snapshots/store-wide/<object>/<time>-read-21.json (scripts/store/snapshot.mjs).
//
// For each channel-scoped settings endpoint, the report says which keys pass parts 1 and 2 of
// ticket 21's three-part test (plan/build-pipeline.md section 5), with the same proof plan.mjs
// repeats before a write (scripts/store/settings-proof.mjs):
//
// - channel: the 1895766 read shows the key (null, inheriting, or its own value), so a write of
//   it with ?channel_id=1895766 is lifted, once apply.mjs's part 3 shows the global value and
//   channels 1 and 1855224 unchanged.
// - store-wide: part 1 or 2 fails, so a write of it reaches .com and channel 1 and goes in
//   Shaun's approval batch (scripts/store/apply.mjs --approved).
// - unknown: a read it needs failed.
//
// Never read: Customers (allow_global_logins included), Orders, the catalogue, gift
// certificates, carts or payments. The read-only account has no Customers or Orders scope, and
// those reads carry personal data. The checklist records them as control-panel items.
//
// Test seams, as for the store helper and only under `node --test`: RF_STORE_ROOT moves the
// snapshots, RF_STORE_FIXTURES answers from a route file, RF_BC_READ_TOKEN gives the token.

import fs from 'fs';
import { redact } from '../release-redact.mjs';
import { isMain } from '../lib/is-main.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { CHANNEL_SETTINGS } from '../store/allowlist.mjs';
import { createClient, describeFailure, queryString } from '../store/client.mjs';
import { commandFetch, commandStoreHash, showValue } from '../store/plan.mjs';
import { proveSettingsWrite } from '../store/settings-proof.mjs';
import {
    canonicalJson, sha256 as hash, storeRoot, writeSnapshotFiles,
} from '../store/snapshot.mjs';

export const TICKET = '21';
export const LABEL = `read-${TICKET}`;

export const SCOPES = [
    { scope: 'global', channel: null },
    { scope: '1', channel: 1 },
    { scope: '1855224', channel: 1855224 },
    { scope: '1895766', channel: 1895766 },
];
const CHANNELS = SCOPES.filter(item => item.channel);
const TARGET = '1895766';

// The channel-scoped settings the checklist depends on: inventory (label_option), search
// (semantic search, Product Filtering's switch), product and category display (recorded; the
// category settings are refactor 07's), and the security headers.
export const SCOPED_SETTINGS = ['inventory', 'storefront/search', 'storefront/product', 'storefront/category', 'storefront/security'];

const PAGE_LIMIT = 50;
const MAX_PAGES = 20;

const spec = ({
    path, query = {}, object, scope, paginate = false,
}) => ({
    key: `GET ${path}${queryString(query)}`, path, query, object, scope, paginate,
});
const channelQuery = ({ channel }) => (channel ? { channel_id: channel } : {});

// Every read, in report order. Each key is read once.
export function readList() {
    return [
        ...SCOPED_SETTINGS.flatMap(settings => SCOPES.map(item => spec({
            path: `/v3/settings/${settings}`, query: channelQuery(item), object: `settings/${settings}`, scope: item.scope,
        }))),
        // Product Filtering's enabled list is store-wide: it takes no channel_id.
        spec({ path: '/v3/settings/search/filters', object: 'settings/search/filters', scope: 'global' }),
        // Probe 6's reads (ticket 07): the contextual overrides, with and without channel_id.
        ...SCOPES.map(item => spec({
            path: '/v3/settings/search/filters/contexts', query: channelQuery(item), object: 'settings/search/filters/contexts', scope: item.scope,
        })),
        ...SCOPES.map(item => spec({
            path: '/v3/settings/search/filters/available', query: channelQuery(item), object: 'settings/search/filters/available', scope: item.scope,
        })),
        ...CHANNELS.map(item => spec({ path: `/v3/channels/${item.channel}/currency-assignments`, object: 'channels/currency-assignments', scope: item.scope })),
        spec({
            path: '/v3/promotions', object: 'promotions', scope: 'global', paginate: true,
        }),
    ];
}

async function readPages(client, item) {
    const data = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
        // Pages are read one after another: each says how many there are.
        // eslint-disable-next-line no-await-in-loop
        const response = await client.get(item.path, { ...item.query, limit: PAGE_LIMIT, page });
        if (!response.ok) return { error: describeFailure(response) };
        data.push(...((response.body && response.body.data) || []));
        const total = response.body?.meta?.pagination?.total_pages ?? 1;
        if (page >= total) return { data };
    }
    return { data, error: `more than ${MAX_PAGES * PAGE_LIMIT} items: only the first ${MAX_PAGES} pages were read` };
}

async function readOne(client, item) {
    try {
        if (item.paginate) return await readPages(client, item);
        const response = await client.get(item.path, item.query);
        if (!response.ok) return { error: describeFailure(response) };
        return { data: response.body ? response.body.data : null };
    } catch (error) {
        return { error: error.message };
    }
}

// Takes every read in turn. A failed read is recorded with its error, and the rest still run.
export async function takeReads(client, list) {
    const reads = [];
    for (const item of list) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await readOne(client, item);
        reads.push({
            key: item.key, object: item.object, scope: item.scope, ...(error ? { error } : {}), ...(data !== undefined ? { data } : {}), sha256: hash(canonicalJson(error ? { error } : data)),
        });
    }
    return { reads, sha256: hash(canonicalJson(reads)) };
}

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const readFor = (reads, object, scope) => reads.find(read => read.object === object && read.scope === scope);

// One row per key of a channel-scoped settings endpoint: its value at each scope, and whether a
// write of it on 1895766 passes parts 1 and 2 of the three-part test.
export function settingsRows(reads, settingsPath) {
    const object = `settings/${settingsPath}`;
    const byScope = Object.fromEntries(SCOPES.map(({ scope }) => [scope, readFor(reads, object, scope)]));
    const keys = [...new Set(SCOPES.flatMap(({ scope }) => (isObject(byScope[scope]?.data) ? Object.keys(byScope[scope].data) : [])))];
    const globalOnly = CHANNEL_SETTINGS[settingsPath]?.globalOnly || [];
    const failed = ['global', TARGET].filter(scope => !byScope[scope] || byScope[scope].error);
    const proof = failed.length ? null : proveSettingsWrite({
        settingsPath, body: Object.fromEntries(keys.map(key => [key, null])), globalData: byScope.global.data, channelData: byScope[TARGET].data, globalOnly,
    });
    return keys.map(key => {
        const values = Object.fromEntries(SCOPES.map(({ scope }) => {
            const read = byScope[scope];
            if (!read || read.error) return [scope, undefined];
            return [scope, isObject(read.data) && Object.hasOwn(read.data, key) ? read.data[key] : undefined];
        }));
        if (!proof) {
            const scope = failed[0];
            return {
                key, values, verdict: 'unknown', evidence: `the ${scope} read failed: ${byScope[scope]?.error || 'not read'}`,
            };
        }
        const part2 = proof.part2.find(item => item.key === key);
        if (!proof.part1.proved) {
            return {
                key, values, verdict: 'store-wide', evidence: proof.part1.evidence,
            };
        }
        return {
            key, values, verdict: part2.proved ? 'channel' : 'store-wide', evidence: part2.evidence,
        };
    });
}

// --- The report ------------------------------------------------------------------------------

const cell = text => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const shown = (value, key, scope) => {
    if (value === undefined) return 'not shown';
    if (value === null && scope !== 'global') return 'inherits';
    return showValue(value, key);
};

function settingsTable(reads, settingsPath) {
    const rows = settingsRows(reads, settingsPath);
    const errors = SCOPES.map(({ scope }) => readFor(reads, `settings/${settingsPath}`, scope)).filter(read => read?.error);
    return [
        `### \`/v3/settings/${settingsPath}\``,
        '',
        ...errors.map(read => `- \`${read.key}\`: read failed: ${cell(read.error)}`),
        ...(errors.length ? [''] : []),
        '| Key | global | channel 1 | 1855224 | 1895766 | Parts 1 and 2 for 1895766 |',
        '|---|---|---|---|---|---|',
        ...rows.map(row => `| \`${row.key}\` | ${SCOPES.map(({ scope }) => cell(shown(row.values[scope], row.key, scope))).join(' | ')} | ${row.verdict}: ${cell(row.evidence)} |`),
        '',
    ];
}

function filtersTable(reads) {
    const read = readFor(reads, 'settings/search/filters', 'global');
    const head = ['### Product Filtering: the enabled filters (store-wide, `/v3/settings/search/filters`)', ''];
    if (!read || read.error) return [...head, `Read failed: ${cell(read?.error || 'not read')}`, ''];
    const list = Array.isArray(read.data) ? read.data : [];
    return [
        ...head,
        '| # | Filter | Type | Id | Enabled | Collapsed | Items shown | Sorted by |',
        '|---|---|---|---|---|---|---|---|',
        ...list.map((item, index) => `| ${index + 1} | ${cell(item.display_name ?? '')} | ${cell(item.type ?? '')} | \`${cell(item.id ?? '')}\` | ${item.is_enabled ?? ''} | ${item.collapsed_by_default ?? ''} | ${item.items_to_show === undefined ? '' : showValue(item.items_to_show)} | ${item.sort_by === undefined ? '' : showValue(item.sort_by)} |`),
        '',
    ];
}

function scopedList(reads, object, title, describe) {
    return [
        title,
        '',
        '| Scope | What it answered |',
        '|---|---|',
        ...SCOPES.map(({ scope }) => {
            const read = readFor(reads, object, scope);
            if (!read) return null;
            return `| ${scope} | ${read.error ? `read failed: ${cell(read.error)}` : cell(describe(read.data))} |`;
        }).filter(Boolean),
        '',
    ];
}

const describeContexts = data => {
    if (!Array.isArray(data) || !data.length) return 'no contextual overrides';
    return data.map(item => `channel ${item.context?.channel_id ?? '?'}, category ${item.context?.category_id ?? '?'}: ${(item.data || []).map(filter => filter.display_name).join(', ')}`).join('; ');
};
const describeAvailable = data => {
    if (!Array.isArray(data) || !data.length) return 'none';
    return data.map(item => `${item.name ?? item.display_name} (${item.type}, \`${item.id}\`)`).join(', ');
};

function currenciesTable(reads) {
    return [
        '### Currencies per channel (`/v3/channels/<id>/currency-assignments`)',
        '',
        '| Channel | Default | Enabled |',
        '|---|---|---|',
        ...CHANNELS.map(({ scope }) => {
            const read = readFor(reads, 'channels/currency-assignments', scope);
            if (!read || read.error) return `| ${scope} | read failed: ${cell(read?.error || 'not read')} | |`;
            return `| ${scope} | ${cell(read.data?.default_currency ?? '')} | ${cell((read.data?.enabled_currencies || []).join(', '))} |`;
        }),
        '',
    ];
}

const describeAction = action => {
    if (!isObject(action)) return '';
    return Object.keys(action).map(kind => (kind === 'shipping' && action.shipping?.free_shipping ? 'shipping (free)' : kind)).join(', ');
};

// Promotions, summarised: never their codes, and nothing about who used them.
function promotionsTable(reads) {
    const read = readFor(reads, 'promotions', 'global');
    const head = ['### Promotions (store-wide, `/v3/promotions`)', ''];
    if (!read || read.error) return [...head, `Read failed: ${cell(read?.error || 'not read')}`, ''];
    const list = Array.isArray(read.data) ? read.data : [];
    if (!list.length) return [...head, 'None.', ''];
    return [
        ...head,
        '| Id | Name | Status | Redemption | Currency | Channels | Actions |',
        '|---|---|---|---|---|---|---|',
        ...list.map(item => {
            const channels = Array.isArray(item.channels) && item.channels.length ? item.channels.map(channel => channel.id).join(', ') : 'all channels';
            const actions = [...new Set((item.rules || []).map(rule => describeAction(rule.action)).filter(Boolean))].join('; ');
            return `| ${item.id} | ${cell(item.name ?? '')} | ${cell(item.status ?? '')} | ${cell(item.redemption_type ?? '')} | ${cell(item.currency_code ?? '')} | ${cell(channels)} | ${cell(actions)} |`;
        }),
        '',
    ];
}

export function markdownReport(reads, { taken, sha256, files = [] }) {
    const failed = reads.filter(read => read.error).length;
    return [
        `## Reads, ${taken} (read-only token, GET only)`,
        '',
        `${reads.length} reads, ${failed} failed. Snapshot sha256 ${sha256}.`,
        ...files.map(file => `- \`${file.file}\``),
        '',
        ...SCOPED_SETTINGS.flatMap(settings => settingsTable(reads, settings)),
        ...filtersTable(reads),
        ...scopedList(reads, 'settings/search/filters/contexts', '### Product Filtering: contextual overrides (probe 6\'s reads, `/v3/settings/search/filters/contexts`)', describeContexts),
        ...scopedList(reads, 'settings/search/filters/available', '### Product Filtering: available filters (`/v3/settings/search/filters/available`)', describeAvailable),
        ...currenciesTable(reads),
        ...promotionsTable(reads),
    ];
}

// --- The command ------------------------------------------------------------------------------

const USAGE = 'usage: node scripts/settings/read.mjs';

export function parseArgs(argv) {
    const unknown = argv.find(arg => arg !== '--help');
    if (unknown) throw new Error(`unknown argument ${unknown}`);
    return argv.includes('--help') ? { help: true } : {};
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error(`${USAGE}\n  ${error.message}`);
        return 2;
    }
    if (options.help) {
        console.log(USAGE);
        return 0;
    }
    const secrets = [];
    const say = line => console.log(redact(line, secrets));
    try {
        const root = storeRoot();
        fs.mkdirSync(root, { recursive: true, mode: 0o700 });
        const { token, source } = readStoreToken('read');
        secrets.push(token);
        say(`Reading with ${source} (GET only)…`);
        const storeHash = await commandStoreHash();
        const client = createClient({
            storeHash, token, fetch: await commandFetch(root), readOnly: true,
        });
        const now = new Date();
        const { reads, sha256 } = await takeReads(client, readList());
        if (reads.every(read => read.error)) throw new Error(`every read failed, the first with ${reads[0].error}: nothing to report`);
        const snapshot = { reads, sha256 };
        const files = writeSnapshotFiles(root, { channel: 'store-wide', label: LABEL, now }, snapshot);
        say('');
        markdownReport(reads, { taken: now.toISOString(), sha256, files }).forEach(say);
        return 0;
    } catch (error) {
        error.message.split('\n').forEach(line => console.error(redact(`STOP     ${line}`, secrets)));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
