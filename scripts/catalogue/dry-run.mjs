#!/usr/bin/env node
// The catalogue jobs' dry runs (ticket 18). Read-only: the export is a file, the API is read with
// the read-only token through a client that refuses anything but GET, and the photos are read
// from the public CDN. Nothing is written to the store.
//
//   node scripts/catalogue/dry-run.mjs --csv ~/reelflies/catalog/product_20260907_030303.csv --out <dir>
//   node scripts/catalogue/dry-run.mjs --api --csv <export> --sales <product_metrics.csv> --out ~/reelflies/theme/plan/approvals
//
// Options:
//   --csv <file>         the product export (diffs only: it has no ids, so it makes no plan)
//   --api                read the catalogue through the API (the read-only token, scripts/lib/store-token.mjs);
//                        the read is kept as a snapshot, and each job with a change gets a plan file
//   --out <dir>          where the reports go (default ~/reelflies/catalog/dry-runs/<time>/)
//   --images fetch|skip  read the photos' grounds from the CDN (default fetch), cached in ~/reelflies/catalog/image-cache/
//   --sales <file>       per-product sales aggregates (id, units_365) to rank the re-export list
//   --brand-copy <file>  {"page_title", "meta_description"} for the ReelFlies brand (ticket 14's copy)
//   --size-fixes <file>  {"<product id>": {"<old label>": "<new label>"}} for sizes the job can't place
//   --signature-brand <name>  option B of the brand job: the brand Shaun made for the Signature set
//   --brand-products <ids>    other in-house products Shaun names for the brand, as 101,102
//   --jobs a,b           only these jobs
//
// Every line it prints goes through release-redact.mjs once the read token is in hand, its STOP
// line included.
//
// Plans go to ~/reelflies/catalog/plans/, snapshots to ~/reelflies/catalog/snapshots/, outside
// git. Shaun applies a plan at his terminal with scripts/catalogue/apply.mjs.

import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { redact } from '../release-redact.mjs';
import { createClient } from '../store/client.mjs';
import { commandFetch, commandStoreHash } from '../store/plan.mjs';
import { sha256, storeRoot, timeStamp } from '../store/snapshot.mjs';
import { modelFromReads, readCatalogue } from './api-read.mjs';
import { catalogueRoot } from './apply.mjs';
import { modelFromExport, parseCsv } from './csv.mjs';
import { classifyImages, decoderProblem } from './images.mjs';
import { JOBS, isLive, runJobs } from './jobs.mjs';
import { makePlan, writePlanFile } from './plans.mjs';
import { writeReports } from './report.mjs';

const USAGE = 'Usage: node scripts/catalogue/dry-run.mjs [--csv <export>] [--api] [--out <dir>] [--images fetch|skip] [--sales <file>] [--brand-copy <file>] [--size-fixes <file>] [--signature-brand <name>] [--brand-products <ids>] [--jobs a,b]';

export function parseArgs(argv) {
    const options = {
        csv: null, api: false, out: null, images: 'fetch', sales: null, brandCopy: null, sizeFixes: null, signatureBrand: null, brandProducts: null, jobs: null,
    };
    const valued = {
        '--csv': 'csv', '--out': 'out', '--images': 'images', '--sales': 'sales', '--brand-copy': 'brandCopy', '--size-fixes': 'sizeFixes', '--signature-brand': 'signatureBrand', '--brand-products': 'brandProducts', '--jobs': 'jobs',
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--api') options.api = true;
        else if (valued[arg]) {
            const next = argv[++i];
            if (!next || next.startsWith('--')) throw new Error(`${arg} needs a value`);
            options[valued[arg]] = next;
        } else throw new Error(`unknown argument ${arg}`);
    }
    if (!options.csv && !options.api) throw new Error('give --csv <export>, --api, or both');
    if (!['fetch', 'skip'].includes(options.images)) throw new Error('--images is fetch or skip');
    if (options.brandProducts) {
        options.brandProducts = options.brandProducts.split(',').map(Number);
        if (!options.brandProducts.every(id => Number.isInteger(id) && id > 0)) throw new Error('--brand-products takes product ids, as 101,102');
    }
    if (options.jobs) {
        options.jobs = options.jobs.split(',');
        const known = JOBS.map(([id]) => id);
        const unknown = options.jobs.filter(id => !known.includes(id));
        if (unknown.length) throw new Error(`unknown jobs ${unknown.join(', ')} (${known.join(', ')})`);
    }
    return options;
}

// Map(product id -> units sold in the last 365 days), from the aggregates file. Only those two
// columns are read.
export function readSales(textContent) {
    const [header, ...rows] = parseCsv(textContent);
    const id = header.indexOf('id');
    const units = header.indexOf('units_365');
    if (id === -1 || units === -1) throw new Error('the sales file needs the columns id and units_365');
    return new Map(rows.filter(row => row[id]).map(row => [Number(row[id]), Number(row[units]) || 0]));
}

const readJson = (file, what) => {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`${what} ${file} can't be read as JSON (${error.code || 'not JSON'})`);
    }
};

// `secrets` collects the read token as soon as it is read, so the caller can redact its own lines.
// `decoder` says why the photo read can't run (jpeg-js missing), or null; a seam for the tests.
export async function dryRun(options, {
    say: print = console.log, env = process.env, now = new Date(), fetchImages = fetch, secrets = [], decoder = decoderProblem,
} = {}) {
    const say = line => print(redact(line, secrets));
    const root = catalogueRoot(env);
    const stamp = timeStamp(now);
    const meta = {
        date: now.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }), api: null, csv: null, images: 'not read (--images skip)', sales: 'none given',
    };
    const csvModel = options.csv ? modelFromExport(fs.readFileSync(options.csv, 'utf8'), { file: options.csv }) : null;
    if (csvModel) meta.csv = { file: options.csv };
    let apiModel = null;
    let storeHash = null;
    if (options.api) {
        const { token, source } = readStoreToken('read', { env });
        secrets.push(token);
        say(`Reading the catalogue with ${source} (GET only)…`);
        storeHash = await commandStoreHash(env);
        const client = createClient({
            storeHash, token, fetch: await commandFetch(storeRoot(env), env), readOnly: true,
        });
        const reads = await readCatalogue(client, { now, onPage: (page, pages) => { if (page % 50 === 0) say(`  products: page ${page} of ${pages}`); } });
        const folder = path.join(root, 'snapshots');
        fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
        const file = path.join(folder, `${stamp}-18-dry-run-read.json`);
        const textContent = `${JSON.stringify(reads)}\n`;
        fs.writeFileSync(file, textContent, { flag: 'wx', mode: 0o600 });
        meta.api = { read_at: reads.read_at, file, sha256: sha256(textContent) };
        apiModel = modelFromReads(reads);
        say(`Read ${reads.products.length} products, ${reads.assignments.length} channel assignments, ${reads.brands.length} brands and ${reads.categories.length} tree-1 categories.`);
    }
    const primary = apiModel || csvModel;
    const context = {};
    if (options.images === 'fetch') {
        const problem = await decoder();
        if (problem) throw new Error(problem);
        const images = primary.products.filter(isLive).flatMap(product => product.images);
        say(`Reading the grounds of ${images.length} Live product photos from the CDN…`);
        context.grounds = await classifyImages(images, { fetch: fetchImages, cacheDir: path.join(root, 'image-cache'), onProgress: done => say(`  ${done} read`) });
        const tally = {};
        for (const { ground } of context.grounds.values()) tally[ground] = (tally[ground] || 0) + 1;
        meta.images = `${images.length} Live product photos read from the CDN at 44 x 58 (${Object.entries(tally).map(([ground, n]) => `${ground} ${n}`).join(', ')})`;
    }
    if (options.sales) {
        context.sales = readSales(fs.readFileSync(options.sales, 'utf8'));
        meta.sales = `units in the last 365 days per product, from \`${path.basename(options.sales)}\` (per-product aggregates only)`;
    }
    if (options.brandCopy) context.brandCopy = readJson(options.brandCopy, 'the brand copy');
    if (options.sizeFixes) context.sizeFixes = readJson(options.sizeFixes, 'the size fixes');
    if (options.signatureBrand) context.signatureBrand = options.signatureBrand;
    if (options.brandProducts) context.brandProducts = options.brandProducts;
    const results = runJobs(primary, context, options.jobs);
    const csvResults = apiModel && csvModel ? runJobs(csvModel, context, options.jobs) : null;
    const plans = {};
    for (const result of results.filter(item => item.requests.length)) {
        const plan = makePlan({
            job: result.id, requests: result.requests, storeHash, read: meta.api, now,
        });
        plans[result.id] = writePlanFile(root, plan, { now });
    }
    const out = options.out || path.join(root, 'dry-runs', stamp);
    const files = writeReports(out, results, { plans, csvResults, meta });
    say('');
    for (const result of results) {
        say(`${result.id.padEnd(22)} ${String(result.rows.length).padStart(5)} rows ${String(result.requests.length).padStart(5)} requests${plans[result.id] ? `  plan ${plans[result.id].sha256.slice(0, 8)} ${plans[result.id].file}` : ''}`);
    }
    say('');
    say(`Reports: ${out} (${files.length} files)`);
    return {
        results, csvResults, plans, out,
    };
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
    try {
        await dryRun(options, { secrets });
        return 0;
    } catch (error) {
        console.error(redact(`STOP     ${error.message}`, secrets));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
