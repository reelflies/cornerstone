#!/usr/bin/env node
// Applies an approved catalogue plan (ticket 18), or restores what one changed. Catalogue writes
// reach every channel (reelflies.ca, reelflies.com and ReelFlies_CA), so they are Shaun's alone
// (HANDOFF, "Rules for every session"; build pipeline decision 11): this runs only at a terminal,
// with a token pasted at a hidden prompt, and only after the start of the plan's sha256 is typed.
// The terminal check is a tripwire, not the limit: a pseudo-terminal can answer both prompts.
// What keeps agents from writing the catalogue is that no token they can reach has Products:
// modify (decision 11: neither Keychain account carries it). Shaun makes one for a run and
// revokes it when the run ends (docs/catalogue-jobs.md).
//
//   node scripts/catalogue/apply.mjs <plan file>                      Shaun: the plan's writes
//   node scripts/catalogue/apply.mjs <plan file> --product <id>       Shaun: one product's writes only (the restore trial)
//   node scripts/catalogue/apply.mjs --restore <snapshot> [--product <id>]   Shaun: put back what that apply changed
//   node scripts/catalogue/apply.mjs --check <plan file> [--product <id>]    anyone: GETs only, with the read-only token
//
// Plans are made by the dry run (dry-run.mjs --api) in ~/reelflies/catalog/plans/, and only
// there. In order, a write (prepareWrite for steps 1 to 4, then runWrites):
//
// 1. refuses without a terminal, and while ~/reelflies/store-snapshots/LOCKED exists. Prints the
//    release calendar, with a warning from T-14 (the jobs were meant to run before the freeze)
// 2. reads the plan and checks its digest and every request (apply-rules.mjs: four PUTs, each
//    with its own fields; no creates, no deletes), and writes the exact requests to a file. A
//    restore reads only a before-snapshot whose sha256 log.jsonl ties to that apply's writes
// 3. refuses unless this checkout's store and catalogue tooling are origin/master's
//    (apply-tooling.mjs), and unless the plan was made for this store
// 4. asks for the token at a hidden prompt (used for this run, never stored), and takes the
//    store-write lock (one store or catalogue write at a time on this Mac)
// 5. reads every object the plan writes, fresh, and refuses the whole plan if any of them changed
//    since the dry run, or if the plan is planned on another job's plan that isn't applied yet.
//    A request the store already reads as planned (an earlier, interrupted run of the same plan)
//    is skipped
// 6. prints the diff it derived from that read (never the plan's own copy), and asks Shaun to
//    type the first 8 characters of the plan's sha256 (confirmSourceSha)
// 7. writes the before-snapshot (~/reelflies/catalog/snapshots/), then sends the requests in
//    batches of 50: an intent row in ~/reelflies/store-snapshots/log.jsonl before each, then a
//    re-read of the batch and a result row for each. Nothing more is sent after an answer that
//    isn't a success; a request that doesn't read back as planned stops the run after its batch
// 8. writes the after-snapshot, and prints the restore command and the same-day smoke tests.
//
// A restore runs the same steps, from a before-snapshot: each object the apply sent goes back to
// what that snapshot read. If someone changed any of them again since, the whole restore is
// refused and nothing is sent; the other products are then restored one at a time with --product.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { setTimeout as pause } from 'timers/promises';
import { isMain } from '../lib/is-main.mjs';
import { acquireLock } from '../lib/lock.mjs';
import { describePhase, phaseOn, readCalendar } from '../lib/release-calendar.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { redact } from '../release-redact.mjs';
import { askApprovedToken, askAtTerminal, lockedProblem } from '../store/apply.mjs';
import { createClient, describeFailure, queryString } from '../store/client.mjs';
import {
    appendLogRow, logRow, readLogRows, unfinishedWarnings,
} from '../store/log.mjs';
import { commandFetch, commandStoreHash, operatorName } from '../store/plan.mjs';
import {
    canonicalJson, sha256, storeRoot, timeStamp,
} from '../store/snapshot.mjs';
import {
    Refused, SNAPSHOT_FORMAT, TICKET, checkRequests, classify, diffLine, judge, readBackProblem, readPlan, readsFor, restoreRequests,
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
    'Record each result, dated, in a ticket 18 comment, beside Shaun\'s approval of the plan. Then an agent confirms every request reads back as planned:',
];

const NO_TERMINAL = 'catalogue writes run only at Shaun\'s terminal: they ask him to paste a token at a hidden prompt and to type the start of the plan\'s sha256 (as with release.sh). Agents use --check, which sends GETs only';
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
    const reasons = list => [...list.slice(0, SHOWN).map(item => `  ${item.reason}`), ...(list.length > SHOWN ? [`  … and ${list.length - SHOWN} more`] : [])];
    const stale = judged.filter(item => item.status === 'stale');
    if (stale.length) {
        throw new Refused([mode === 'restore'
            ? `${stale.length} of ${items.length} objects no longer read as the apply left them: someone changed them since, so the whole restore is refused and nothing was sent. Restore the other products one at a time with --product, and check these by hand:`
            : `${stale.length} of ${items.length} objects changed since the dry run, so the plan is stale and nothing was written. Run the dry run again, and approve its new diff:`, ...reasons(stale)].join('\n'));
    }
    const waiting = judged.filter(item => item.status === 'waiting');
    if (waiting.length) {
        const jobs = [...new Set(waiting.map(item => item.request.prior.job))].join(' and ');
        throw new Refused([`${waiting.length} of ${items.length} requests are planned on the ${jobs} plan's result, which isn't applied yet, so nothing was written. Apply that plan first; this one stays valid as approved:`, ...reasons(waiting)].join('\n'));
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

// The writes log.jsonl holds for a before-snapshot: "METHOD path" of each ticket-18 intent row
// whose snapshot_sha256 is the snapshot's.
function loggedWrites(logRoot, snapshotSha) {
    const rows = readLogRows(logRoot).filter(row => row.row === 'intent' && row.ticket === TICKET && row.action === 'update' && row.snapshot_sha256 === snapshotSha);
    return new Set(rows.map(row => `${row.method} ${row.path}`));
}

const writeKey = request => `${request?.method} ${request?.path}`;

// The requests a run sends, from a plan or a before-snapshot. Returns { items, job, sourceSha,
// storeHash }. A restore is tied to a real apply: the snapshot's sha256 must be the one log.jsonl
// recorded for that apply's writes, it must hold every write logged under it, and only what was
// sent is put back.
export function loadSource({
    mode, file, product, root, logRoot,
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
        const sourceSha = sha256(textContent);
        const sent = loggedWrites(logRoot, sourceSha);
        if (!sent.size) throw new Refused(`log.jsonl has no ticket ${TICKET} write from this snapshot (sha256 ${sourceSha.slice(0, 8)}…): a restore puts back only what an apply wrote, and an apply logs each write before it sends it`);
        const held = new Set(snapshot.items.map(entry => writeKey(entry.request)));
        const missing = [...sent].filter(key => !held.has(key));
        if (missing.length) throw new Refused(`log.jsonl names a write this snapshot doesn't hold (${missing.join(', ')}), so it isn't the snapshot that apply wrote`);
        const restored = restoreRequests({ ...snapshot, items: snapshot.items.filter(entry => sent.has(writeKey(entry.request))) }, { productId: product });
        const neverSent = snapshot.items.filter(entry => !sent.has(writeKey(entry.request))).map(entry => classify(entry.request))
            .filter(what => product === null || what.productId === product)
            .map(what => `${what.key}: the apply never sent it (no intent row in log.jsonl), so there is nothing to put back`);
        const { requests } = restored;
        const skipped = [...restored.skipped, ...neverSent];
        if (!requests.length) {
            const why = product ? ` for product ${product}` : '';
            throw new Refused(`nothing to restore${skipped.length ? `: ${skipped.join('; ')}` : why}`);
        }
        return {
            items: checkRequests(requests, { mode: 'restore' }), job: `restore-${snapshot.job}`, sourceSha, file: real, skipped, storeHash: null,
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

// --check: GETs only, with the read-only token. Exits 1 if any request is stale. A request that
// waits for the plan it is planned on isn't stale: that plan applies first, and this one as it is.
async function check({
    file, product, root, say, secrets,
}) {
    const source = loadSource({
        mode: 'apply', file, product, root,
    });
    const storeHash = await commandStoreHash();
    if (source.storeHash && source.storeHash !== storeHash) throw new Refused(`the plan was made for store ${source.storeHash}, and this is ${storeHash}`);
    const { token, source: from } = readStoreToken('read');
    secrets.push(token);
    say(`Reading with ${from} (GET only)…`);
    const { fetch, tap } = tapped(await commandFetch(storeRoot()));
    const client = createClient({
        storeHash, token, fetch, readOnly: true,
    });
    const store = await readStore(client, tap, source.items);
    const judged = judge(source.items, store);
    const count = status => judged.filter(item => item.status === status).length;
    const waitingFor = [...new Set(judged.filter(item => item.status === 'waiting').map(item => item.request.prior.job))].join(' and ');
    const waiting = count('waiting') ? `${count('waiting')} waiting for the ${waitingFor} plan to be applied, ` : '';
    say(`${source.job}: ${judged.length} requests: ${count('done')} read as planned, ${count('pending')} not written yet, ${waiting}${count('stale')} changed since the plan`);
    judged.filter(item => item.status === 'stale').slice(0, SHOWN).forEach(item => say(`  stale: ${item.reason}`));
    return count('stale') ? 1 : 0;
}

// Steps 1 to 4 of a write, before the store is read: the terminal, LOCKED, the calendar, the plan
// or snapshot, the exact requests, the tooling, the store, then the token and the lock. Every
// refusal comes before the token is asked for. Each outside call is a seam for the tests.
export async function prepareWrite({
    options,
    root,
    logRoot,
    say,
    secrets,
    now = new Date(),
    terminal = () => Boolean(process.stdin.isTTY && process.stdout.isTTY),
    calendar = () => phaseOn(readCalendar()),
    toolingProblem = catalogueToolingProblem,
    storeHash: lookUpStoreHash = commandStoreHash,
    askToken = askApprovedToken,
    takeLock = label => acquireLock('store-write', label, { releaseOnExit: true, ticket: TICKET }),
}) {
    if (!terminal()) throw new Refused(NO_TERMINAL);
    const locked = lockedProblem(logRoot);
    if (locked) throw new Refused(locked);
    unfinishedWarnings(logRoot).forEach(say);
    // The jobs were meant to run before the T-14 freeze (ticket 18). Shaun may still run one
    // later: a warning, not a refusal, because the run is his and he types the go-ahead.
    const phase = calendar();
    say(describePhase(phase));
    const freeze = phase.milestones?.['T-14'];
    if (freeze && phase.date >= freeze) say(`WARN     the content and catalogue freeze began on ${freeze} (T-14), and ticket ${TICKET}'s jobs were meant to run before it. This run goes on only if Shaun types the sha256 below.`);
    const source = loadSource({ ...options, root, logRoot });
    source.skipped.forEach(line => say(`skipped  ${line}`));
    showRequests({
        items: source.items, root, label: source.job, now, say,
    });
    const problem = toolingProblem();
    if (problem) throw new Refused(problem);
    const storeHash = await lookUpStoreHash();
    if (source.storeHash && source.storeHash !== storeHash) throw new Refused(`the plan was made for store ${source.storeHash}, and this is ${storeHash}`);
    const token = await askToken();
    secrets.push(token);
    const lock = takeLock(`scripts/catalogue/apply.mjs ${path.basename(source.file)}`);
    return {
        source, token, storeHash, lock,
    };
}

// Shaun's go-ahead, once the diff is shown: the first 8 characters of the plan's sha256 (or, for a
// restore, the snapshot's). A wrong answer isn't repeated back, in case a token was pasted here.
export async function confirmSourceSha({ sha, what, ...io }) {
    const typed = await askAtTerminal({ ...io, question: `To send the writes above, type the first 8 characters of the ${what}'s sha256 (${what === 'plan' ? 'as the approval page shows it' : 'as the apply printed it'}): ` });
    if (typed === null) throw new Refused('no answer (stdin closed): stopped');
    if (typed.trim().toLowerCase() !== sha.slice(0, 8)) throw new Refused(`what was typed isn't the start of this ${what}'s sha256: stopped, nothing written`);
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
        const logRoot = storeRoot();
        const prepared = await prepareWrite({
            options, root, logRoot, say, secrets,
        });
        ({ lock } = prepared);
        const { source } = prepared;
        const { fetch, tap } = tapped(await commandFetch(logRoot));
        const client = createClient({ storeHash: prepared.storeHash, token: prepared.token, fetch });
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
            product: options.product,
            confirm: () => confirmSourceSha({ sha: source.sourceSha, what: options.mode === 'restore' ? 'snapshot' : 'plan' }),
        });
        return result.failed || result.halted ? 1 : 0;
    } catch (error) {
        const tag = ['Refused', 'LockHeldError'].includes(error.name) ? 'REFUSED' : 'STOP';
        error.message.split('\n').forEach(line => console.error(redact(`${tag.padEnd(8)} ${line}`, secrets)));
        return 1;
    } finally {
        if (lock) lock.release();
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
