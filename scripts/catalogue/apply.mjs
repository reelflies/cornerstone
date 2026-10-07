#!/usr/bin/env node
// Applies an approved catalogue plan (ticket 18), or restores what one changed. Catalogue writes
// reach every channel (reelflies.ca, reelflies.com and ReelFlies_CA), so they are Shaun's alone
// (HANDOFF, "Rules for every session"; build pipeline decision 11): this runs only at his
// terminal, with a token he pastes at a hidden prompt, and only after he types the start of the
// plan's sha256. An agent's shell isn't a terminal, so no agent can run it.
//
//   node scripts/catalogue/apply.mjs <plan file>                      Shaun: the plan's writes
//   node scripts/catalogue/apply.mjs <plan file> --product <id>       Shaun: one product's writes only (the restore trial)
//   node scripts/catalogue/apply.mjs --restore <snapshot> [--product <id>]   Shaun: put back what that apply changed
//   node scripts/catalogue/apply.mjs --check <plan file> [--product <id>]    anyone: GETs only, with the read-only token
//
// Plans are made by the dry run (dry-run.mjs --api) in ~/reelflies/catalog/plans/, and only
// there. In order, a write:
//
// 1. refuses without a terminal, and while ~/reelflies/store-snapshots/LOCKED exists
// 2. reads the plan and checks its digest and every request (apply-rules.mjs: four PUTs, each
//    with its own fields; no creates, no deletes), and writes the exact requests to a file
// 3. refuses unless this checkout's store and catalogue tooling are origin/master's
//    (apply-tooling.mjs), and unless the plan was made for this store
// 4. asks for the token at a hidden prompt (used for this run, never stored), and takes the
//    store-write lock (one store or catalogue write at a time on this Mac)
// 5. reads every object the plan writes, fresh, and refuses the whole plan if any of them changed
//    since the dry run. A request the store already reads as planned (an earlier, interrupted run
//    of the same plan) is skipped
// 6. prints the diff it derived from that read (never the plan's own copy), and asks Shaun to
//    type the first 8 characters of the plan's sha256
// 7. writes the before-snapshot (~/reelflies/catalog/snapshots/), then sends the requests in
//    batches of 50: an intent row in ~/reelflies/store-snapshots/log.jsonl before each, then a
//    re-read of the batch and a result row for each. Nothing more is sent after an answer that
//    isn't a success; a request that doesn't read back as planned stops the run after its batch
// 8. writes the after-snapshot, and prints the restore command and the same-day smoke tests.
//
// A restore runs the same steps, from a before-snapshot: each object goes back to what that
// snapshot read, unless someone changed it again since the apply (it is then listed, not sent).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { setTimeout as pause } from 'timers/promises';
import { isMain } from '../lib/is-main.mjs';
import { acquireLock } from '../lib/lock.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { redact } from '../release-redact.mjs';
import { askApprovedToken, askAtTerminal, lockedProblem } from '../store/apply.mjs';
import { createClient, describeFailure, queryString } from '../store/client.mjs';
import { appendLogRow, logRow, unfinishedWarnings } from '../store/log.mjs';
import { commandFetch, commandStoreHash, operatorName } from '../store/plan.mjs';
import {
    canonicalJson, sha256, storeRoot, timeStamp,
} from '../store/snapshot.mjs';
import {
    Refused, SNAPSHOT_FORMAT, TICKET, checkRequests, diffLine, judge, readBackProblem, readPlan, readsFor, restoreRequests,
} from './apply-rules.mjs';
import { catalogueToolingProblem } from './apply-tooling.mjs';

export const BATCH = 50;
const SHOWN = 20;
const RATE_LIMIT_TRIES = 5;

export const SMOKE_TESTS = [
    'Same-day smoke tests (the catalogue is shared by every channel; ticket 18):',
    '  - reelflies.com (1855224): a product page this run changed renders its sizes (and its thumbnail and brand where they changed), and adds to the cart',
    '  - reelflies.ca (channel 1): the same product page, and a Fly Type listing with the product on it',
    '  - ReelFlies_CA (1895766): the same, through the preview cookie',
    'Record each result, dated, in ticket 18 (research/18-catalogue-jobs/). Then an agent confirms every request reads back as planned:',
];

const NO_TERMINAL = 'catalogue writes run only at Shaun\'s terminal: they ask him to paste a token at a hidden prompt and to type the start of the plan\'s sha256, which no agent can answer (as with release.sh). Agents use --check, which sends GETs only';
const USAGE = `Usage:
  node scripts/catalogue/apply.mjs <plan file> [--product <id>]
  node scripts/catalogue/apply.mjs --restore <snapshot file> [--product <id>]
  node scripts/catalogue/apply.mjs --check <plan file> [--product <id>]`;

// Where the plans and snapshots live: ~/reelflies/catalog, outside git. RF_CATALOGUE_ROOT moves it
// for the tests, and only under node --test.
export function catalogueRoot(env = process.env) {
    if (env.RF_CATALOGUE_ROOT) {
        if (!env.NODE_TEST_CONTEXT) throw new Error(`RF_CATALOGUE_ROOT is a test seam for node --test, and a real run keeps its plans and snapshots in ~/reelflies/catalog: unset it (it is ${env.RF_CATALOGUE_ROOT})`);
        return env.RF_CATALOGUE_ROOT;
    }
    return path.join(os.homedir(), 'reelflies', 'catalog');
}

export function parseArgs(argv) {
    const options = { mode: 'apply', file: null, product: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--restore' || arg === '--check') {
            if (options.mode !== 'apply' || options.file) throw new Error('give one of: a plan file, --restore <snapshot> or --check <plan>');
            options.mode = arg.slice(2);
            options.file = argv[++i];
            if (!options.file) throw new Error(`${arg} needs a file`);
        } else if (arg === '--product') {
            options.product = Number(argv[++i]);
            if (!Number.isInteger(options.product) || options.product <= 0) throw new Error('--product needs a product id');
        } else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
        else if (!options.file) options.file = arg;
        else throw new Error(`one file only (${arg})`);
    }
    if (!options.file) throw new Error('no plan file given');
    return options;
}

// The file, if it is inside `folder` (judged by where a link leads), or Refused.
export function fileInside(file, folder, what) {
    let real;
    try {
        real = fs.realpathSync(file);
    } catch {
        throw new Refused(`${file} can't be read`);
    }
    const base = fs.existsSync(folder) ? fs.realpathSync(folder) : folder;
    const relative = path.relative(base, real);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Refused(`${what} is read only from ${folder}, and ${file} isn't there`);
    return real;
}

// --- The store, through the client ------------------------------------------------------------

// A fetch that keeps the last response's headers, for the rate limit's reset time.
export function tapped(fetchImpl) {
    const tap = { headers: null };
    const wrapped = async (url, init) => {
        const response = await fetchImpl(url, init);
        tap.headers = response.headers;
        return response;
    };
    return { fetch: wrapped, tap };
}

// One request, tried again while the store answers 429, waiting as long as it says.
export async function send(client, tap, request, { wait = pause } = {}) {
    for (let attempt = 1; ; attempt++) {
        const response = await client.request(request); // eslint-disable-line no-await-in-loop
        if (response.status !== 429 || attempt >= RATE_LIMIT_TRIES) return response;
        const reset = Number(tap?.headers?.get('x-rate-limit-time-reset-ms')) || Number(tap?.headers?.get('retry-after')) * 1000 || 1000 * 2 ** attempt;
        await wait(Math.min(reset, 60000)); // eslint-disable-line no-await-in-loop
    }
}

// Every object `items` write, read now: { products: Map(id -> product), brands: Map(id -> brand), sha256 }.
export async function readStore(client, tap, items, { wait } = {}) {
    const products = new Map();
    const brands = new Map();
    const raw = [];
    for (const read of readsFor(items)) {
        const response = await send(client, tap, { method: 'GET', path: read.path, query: read.query }, { wait }); // eslint-disable-line no-await-in-loop
        const where = `GET ${read.path}${queryString(read.query)}`;
        if (!response.ok) throw new Error(`${where} answered ${describeFailure(response)}`);
        const data = response.body?.data;
        if (read.kind === 'products') {
            if (!Array.isArray(data)) throw new Error(`${where} answered with no product list`);
            if (response.body?.meta?.pagination?.total_pages > 1) throw new Error(`${where} answered in ${response.body.meta.pagination.total_pages} pages: the store's page size is now smaller than the read's ${read.ids.length} products, so the read can't see them all`);
            for (const product of data) if (read.ids.includes(product.id)) products.set(product.id, product);
        } else if (data && data.id === read.ids[0]) brands.set(data.id, data);
        raw.push({ key: where, data });
    }
    return {
        products, brands, raw, sha256: sha256(canonicalJson(raw)),
    };
}

// --- The run ------------------------------------------------------------------------------------

const productName = (store, item) => store.products.get(item.what.productId)?.name || '';

function writeJson(folder, name, value) {
    fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, name);
    const textContent = `${JSON.stringify(value, null, 2)}\n`;
    fs.writeFileSync(file, textContent, { flag: 'wx', mode: 0o600 });
    return { file, sha256: sha256(textContent) };
}

// Prints the exact requests: the first few, and all of them to a file beside the snapshots.
export function showRequests({
    items, root, label, now, say,
}) {
    const lines = items.map(({ request }, index) => `  ${index + 1}. ${request.method} ${request.path} ${JSON.stringify(request.body)}`);
    const { file } = writeJson(path.join(root, 'snapshots'), `${timeStamp(now)}-${TICKET}-${label}-requests.json`, items.map(({ request }) => ({ method: request.method, path: request.path, body: request.body })));
    say(`The exact requests (${items.length}):`);
    lines.slice(0, SHOWN).forEach(say);
    if (lines.length > SHOWN) say(`  … and ${lines.length - SHOWN} more`);
    say(`  every one: ${file}`);
}

// Steps 5 to 8, once the token is in hand and the lock taken. `confirm()` asks for the go-ahead.
export async function runWrites({
    items, client, tap, mode, job, sourceFile, sourceSha, root, logRoot, operator, confirm, say, now = new Date(), wait, product = null,
}) {
    const action = mode === 'restore' ? 'restore' : 'update';
    const store = await readStore(client, tap, items, { wait });
    const judged = judge(items, store);
    const stale = judged.filter(item => item.status === 'stale');
    if (stale.length) {
        const shown = stale.slice(0, SHOWN).map(item => `  ${item.reason}`);
        if (stale.length > SHOWN) shown.push(`  … and ${stale.length - SHOWN} more`);
        throw new Refused([mode === 'restore'
            ? `${stale.length} of ${items.length} objects no longer read as the apply left them: someone changed them since. Restore the rest with --product, or check these by hand:`
            : `${stale.length} of ${items.length} objects changed since the dry run, so the plan is stale and nothing was written. Run the dry run again, and approve its new diff:`, ...shown].join('\n'));
    }
    const pending = judged.filter(item => item.status === 'pending');
    const done = judged.length - pending.length;
    if (done) say(`${done} of ${judged.length} requests already read as planned (an earlier run): skipped`);
    if (!pending.length) {
        say('Nothing to write.');
        return { written: 0, failed: 0, pending: 0 };
    }
    say('');
    say(`The diff, from the store as read now (${pending.length} objects):`);
    pending.forEach(item => say(`  ${diffLine(item, item.now, productName(store, item))}`));
    say('');
    await confirm();
    const before = writeJson(path.join(root, 'snapshots'), `${timeStamp(now)}-${TICKET}-${job}-before.json`, {
        format: SNAPSHOT_FORMAT,
        ticket: TICKET,
        job,
        mode,
        source: sourceFile,
        source_sha256: sourceSha,
        product,
        taken_at: now.toISOString(),
        reads_sha256: store.sha256,
        items: pending.map(item => ({ request: item.request, before: item.now })),
    });
    say(`snapshot ${before.file}`);
    say(`sha256   ${before.sha256}`);
    const base = {
        channel: 'store-wide', action, snapshot_sha256: before.sha256, ticket: TICKET, operator, mode: 'approved', plan_sha256: sourceSha,
    };
    let written = 0;
    let failed = 0;
    let halted = null;
    const afterReads = [];
    for (let at = 0; at < pending.length && !failed && !halted; at += BATCH) {
        const answers = [];
        for (const item of pending.slice(at, at + BATCH)) {
            const fields = {
                ...base, object: `catalog/${item.what.kind}`, id: item.what.key, request: item.index, method: item.request.method, path: item.request.path,
            };
            appendLogRow(logRoot, logRow({ ...fields, row: 'intent', date: new Date().toISOString() }));
            let response;
            try {
                response = await send(client, tap, { method: item.request.method, path: item.request.path, body: item.request.body }, { wait }); // eslint-disable-line no-await-in-loop
            } catch (error) {
                response = { status: null, ok: false, error: error.message };
            }
            answers.push({ item, fields, response });
            // Nothing more is sent after an answer that isn't a success: the store refused it,
            // or it may have landed (a 5xx, or no answer). The re-read below decides which.
            if (!response.ok) {
                halted = `${item.what.key} got ${response.status === null ? `no answer (${response.error})` : describeFailure(response)}`;
                break;
            }
        }
        const sent = answers.map(answer => answer.item);
        let reread;
        try {
            reread = await readStore(client, tap, sent, { wait }); // eslint-disable-line no-await-in-loop
        } catch (error) {
            for (const { fields, response } of answers) {
                appendLogRow(logRoot, logRow({
                    ...fields, row: 'result', date: new Date().toISOString(), status: response.status, outcome: 'stopped', message: `sent, but the re-read failed (${error.message}): check the object on the store before writing it again`,
                }));
            }
            throw new Error(`the re-read after ${sent.length} writes failed (${error.message}). Each one is logged as stopped: run --check on the plan to see what landed, then run it again (what landed is skipped)`);
        }
        afterReads.push(...reread.raw);
        for (const { item, fields, response } of answers) {
            const problem = readBackProblem(item, reread);
            const answered = response.status === null ? `no answer (${response.error})` : `${response.status}`;
            const outcome = problem ? 'failed' : 'ok';
            const message = problem
                ? `${response.ok ? '' : `the store answered ${response.status === null ? answered : describeFailure(response)}; `}${problem}`
                : `${response.ok ? '' : `answered ${answered}, but `}reads back as planned`;
            appendLogRow(logRoot, logRow({
                ...fields, row: 'result', date: new Date().toISOString(), status: response.status, outcome, after_sha256: reread.sha256, message,
            }));
            if (problem) {
                failed++;
                say(`FAILED   ${item.what.key}: ${message}`);
            } else written++;
        }
        say(`batch    ${at + answers.length} of ${pending.length} sent; ${written} read back as planned`);
    }
    const after = writeJson(path.join(root, 'snapshots'), `${timeStamp(new Date())}-${TICKET}-${job}-after.json`, {
        format: SNAPSHOT_FORMAT, ticket: TICKET, job, mode, before: before.file, taken_at: new Date().toISOString(), reads: afterReads,
    });
    say('');
    const stopped = [failed && `${failed} failed`, halted && `the run stopped at the first answer that wasn't a success (${halted})`].filter(Boolean).join('; ');
    say(`${written} of ${pending.length} written and read back as planned${stopped ? `; ${stopped}. Run --check, then run the plan again: what landed is skipped` : ''}.`);
    say(`after    ${after.file}`);
    if (mode === 'apply') say(`To put it back: node scripts/catalogue/apply.mjs --restore ${before.file}${product ? ` --product ${product}` : ''}`);
    SMOKE_TESTS.forEach(say);
    if (mode === 'apply') say(`  node ~/reelflies/theme/cornerstone/scripts/catalogue/apply.mjs --check ${sourceFile}${product ? ` --product ${product}` : ''}`);
    return {
        written, failed, halted, pending: pending.length, snapshot: before.file, snapshotSha: before.sha256,
    };
}

// The requests a run sends, from a plan or a before-snapshot. Returns { items, job, sourceSha, storeHash }.
export function loadSource({
    mode, file, product, root,
}) {
    if (mode === 'restore') {
        const real = fileInside(file, path.join(root, 'snapshots'), 'a snapshot');
        const textContent = fs.readFileSync(real, 'utf8');
        let snapshot;
        try {
            snapshot = JSON.parse(textContent);
        } catch {
            throw new Refused('this file isn\'t a catalogue snapshot: it isn\'t JSON');
        }
        if (snapshot?.format !== SNAPSHOT_FORMAT || !Array.isArray(snapshot.items) || snapshot.mode !== 'apply') throw new Refused(`this file isn't a catalogue before-snapshot of an apply (format ${SNAPSHOT_FORMAT})`);
        const { requests, skipped } = restoreRequests(snapshot, { productId: product });
        if (!requests.length) {
            const why = product ? ` for product ${product}` : '';
            throw new Refused(`nothing to restore${skipped.length ? `: ${skipped.join('; ')}` : why}`);
        }
        return {
            items: checkRequests(requests, { mode: 'restore' }), job: `restore-${snapshot.job}`, sourceSha: sha256(textContent), file: real, skipped, storeHash: null,
        };
    }
    const real = fileInside(file, path.join(root, 'plans'), 'a plan');
    const textContent = fs.readFileSync(real, 'utf8');
    const { plan, items } = readPlan(textContent);
    const chosen = product ? items.filter(item => item.what.productId === product) : items;
    if (!chosen.length) throw new Refused(`the plan writes nothing for product ${product}`);
    return {
        items: chosen, job: plan.job, sourceSha: sha256(textContent), file: real, skipped: [], storeHash: plan.store_hash,
    };
}

// --check: GETs only, with the read-only token. Exits 1 if any request is stale.
async function check({
    file, product, root, say, secrets,
}) {
    const source = loadSource({
        mode: 'apply', file, product, root,
    });
    const { token, source: from } = readStoreToken('read');
    secrets.push(token);
    say(`Reading with ${from} (GET only)…`);
    const storeHash = await commandStoreHash();
    if (source.storeHash && source.storeHash !== storeHash) throw new Refused(`the plan was made for store ${source.storeHash}, and this is ${storeHash}`);
    const { fetch, tap } = tapped(await commandFetch(storeRoot()));
    const client = createClient({
        storeHash, token, fetch, readOnly: true,
    });
    const store = await readStore(client, tap, source.items);
    const judged = judge(source.items, store);
    const count = status => judged.filter(item => item.status === status).length;
    say(`${source.job}: ${judged.length} requests: ${count('done')} read as planned, ${count('pending')} not written yet, ${count('stale')} changed since the plan`);
    judged.filter(item => item.status === 'stale').slice(0, SHOWN).forEach(item => say(`  stale: ${item.reason}`));
    return count('stale') ? 1 : 0;
}

async function main(argv) {
    let options;
    try {
        options = parseArgs(argv);
    } catch (error) {
        console.error(`${USAGE}\n  ${error.message}`);
        return 2;
    }
    const secrets = [];
    const say = line => console.log(redact(line, secrets));
    let lock = null;
    try {
        const root = catalogueRoot();
        if (options.mode === 'check') {
            return await check({
                ...options, root, say, secrets,
            });
        }
        if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Refused(NO_TERMINAL);
        const logRoot = storeRoot();
        const locked = lockedProblem(logRoot);
        if (locked) throw new Refused(locked);
        unfinishedWarnings(logRoot).forEach(say);
        const source = loadSource({ ...options, root });
        source.skipped.forEach(line => say(`skipped  ${line}`));
        const now = new Date();
        showRequests({
            items: source.items, root, label: source.job, now, say,
        });
        const problem = catalogueToolingProblem();
        if (problem) throw new Refused(problem);
        const storeHash = await commandStoreHash();
        if (source.storeHash && source.storeHash !== storeHash) throw new Refused(`the plan was made for store ${source.storeHash}, and this is ${storeHash}`);
        const token = await askApprovedToken();
        secrets.push(token);
        lock = acquireLock('store-write', `scripts/catalogue/apply.mjs ${path.basename(source.file)}`, { releaseOnExit: true, ticket: TICKET });
        const { fetch, tap } = tapped(await commandFetch(logRoot));
        const client = createClient({ storeHash, token, fetch });
        const what = options.mode === 'restore' ? 'snapshot' : 'plan';
        const result = await runWrites({
            items: source.items,
            client,
            tap,
            mode: options.mode,
            job: source.job,
            sourceFile: source.file,
            sourceSha: source.sourceSha,
            root,
            logRoot,
            operator: operatorName(),
            say,
            now,
            product: options.product,
            confirm: async () => {
                const typed = await askAtTerminal({ question: `To send the writes above, type the first 8 characters of the ${what}'s sha256 (${what === 'plan' ? 'as the approval page shows it' : 'as the apply printed it'}): ` });
                if (typed === null) throw new Refused('no answer (stdin closed): stopped');
                if (typed.trim().toLowerCase() !== source.sourceSha.slice(0, 8)) throw new Refused(`what was typed isn't the start of this ${what}'s sha256: stopped, nothing written`);
            },
        });
        return result.failed || result.halted ? 1 : 0;
    } catch (error) {
        const tag = error.name === 'Refused' ? 'REFUSED' : 'STOP';
        error.message.split('\n').forEach(line => console.error(redact(`${tag.padEnd(8)} ${line}`, secrets)));
        return 1;
    } finally {
        if (lock) lock.release();
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
