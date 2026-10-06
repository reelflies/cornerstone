#!/usr/bin/env node
// The review-page generator (W0-10). It writes a local page with its images; it never
// publishes anything and never tags. The orchestrator publishes a checkpoint page as a
// private claude.ai artifact and cuts the checkpoint tag.
//
// Checkpoint mode (the default), from a clean master after the screenshot runs:
//
//   node scripts/qa/review/review.mjs [--name review-NN] [--since <tag>|none] [--input notes.json] [--inline]
//
//   - The page covers everything merged since the last checkpoint tag (review-00,
//     review-01 …) up to HEAD, and each baseline changed in that range, grouped by ticket.
//     --name defaults to the next number, --since to the newest tag numbered below it.
//   - A checkpoint that is already tagged is regenerated only from its tag's commit, and
//     covers the range up to its tag: check the tag out in a worktree, and point --root at it.
//   - --input is the orchestrator's checkpoint notes (scripts/qa/README.md, "Review pages").
//   - Output: scripts/qa/results/review/<name>/index.html (the page to publish), images/,
//     and preview.html (the page inside the document claude.ai adds, to view locally).
//     --inline puts the images inside index.html instead.
//
// PR mode, in a ticket's worktree, for the skeptic's side-by-side (section 7, step 6):
//
//   node scripts/qa/review/review.mjs --pr [<number>] [--base origin/master]
//
//   - Each baseline the working tree changes against its merge base with --base, before
//     and after, beside its reference screen. Output: scripts/qa/results/review/pr-<number>/.
//     Never published.
//
// Both read scripts/qa/results/manifest.json, which every screenshot run writes. Exits 1
// when the manifest is missing or the page is over the artifact limit, 2 on bad options
// or notes, or for a tagged checkpoint run from another commit.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isMain } from '../../lib/is-main.mjs';
import { formatBytes } from '../../lib/format.mjs';
import {
    changedBaselines, checkpointTags, headInfo, latestCheckpoint, mergeBase, mergedSince, nextCheckpointName, showFile, tagCommit,
} from './git.mjs';
import {
    PAGE_LIMIT_BYTES, checkBudget, copyEncoder, createChromiumEncoder, fitImage, imageFileName,
} from './images.mjs';
import { readManifest } from './manifest.mjs';
import { buildCheckpointModel, buildPrModel, validateInput } from './model.mjs';
import { ROOT } from './reference.mjs';
import { renderReviewPage, wrapDocument } from './render.mjs';

const USAGE = `Usage:
  node scripts/qa/review/review.mjs [--name review-NN] [--since <tag>|none] [--input notes.json] [--out <dir>] [--inline]
  node scripts/qa/review/review.mjs --pr [<number>] [--base origin/master] [--out <dir>] [--inline]`;

class UsageError extends Error {}

export function parseArgs(argv) {
    const args = { inline: false };
    const VALUE = ['--name', '--since', '--input', '--out', '--base', '--manifest', '--root'];
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (VALUE.includes(arg)) {
            const value = argv[i + 1];
            if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
            args[arg.slice(2)] = value;
            i += 1;
        } else if (arg === '--inline') args.inline = true;
        else if (arg === '--pr') {
            const value = argv[i + 1];
            if (value !== undefined && !value.startsWith('--')) {
                if (!/^\d+$/.test(value)) throw new UsageError(`--pr takes a PR number, not "${value}"`);
                args.pr = value;
                i += 1;
            } else args.pr = '';
        } else if (arg === '--help' || arg === '-h') args.help = true;
        else throw new UsageError(`unknown option ${arg}`);
    }
    if (args.name && !/^review-\d{2,}$/.test(args.name)) throw new UsageError(`--name must look like review-00, not "${args.name}"`);
    if (args.pr !== undefined && (args.name || args.since || args.input)) throw new UsageError('--pr takes no --name, --since or --input');
    return args;
}

const imageKey = image => `${image.kind}|${image.ref ?? ''}|${image.path}`;
const isImage = value => value && typeof value === 'object' && (value.kind === 'file' || value.kind === 'git') && typeof value.path === 'string';

// Every image reference in the model, and the model with each replaced by map(image).
function collectImages(value, found = new Map()) {
    if (isImage(value)) found.set(imageKey(value), value);
    else if (Array.isArray(value)) value.forEach(item => collectImages(item, found));
    else if (value && typeof value === 'object') Object.values(value).forEach(item => collectImages(item, found));
    return found;
}
function mapImages(value, map) {
    if (isImage(value)) return map(value);
    if (Array.isArray(value)) return value.map(item => mapImages(item, map));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapImages(item, map)]));
    return value;
}

function readImage(image, root) {
    if (image.kind === 'git') return showFile(image.ref, image.path, { cwd: root });
    const file = path.join(root, image.path);
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

// Encodes every image once, writes it (or keeps it for inlining), and returns the model with
// missing images set to null, the href function and the files written.
async function prepareImages(model, {
    root, outDir, inline, encoder,
}) {
    const sources = collectImages(model);
    const resolved = new Map();
    const byContent = new Map();
    const files = [];
    const missing = [];
    for (const [key, image] of sources) {
        const png = readImage(image, root);
        if (!png) {
            missing.push(image.kind === 'git' ? `${image.ref}:${image.path}` : image.path);
            continue; // eslint-disable-line no-continue
        }
        const fitted = await fitImage(png, { encoder }); // eslint-disable-line no-await-in-loop
        const name = imageFileName(image, fitted.bytes, fitted.type);
        const content = crypto.createHash('sha256').update(fitted.bytes).digest('hex');
        if (!byContent.has(content)) {
            const src = inline ? `data:${fitted.type};base64,${fitted.bytes.toString('base64')}` : `images/${name}`;
            if (!inline) {
                fs.mkdirSync(path.join(outDir, 'images'), { recursive: true });
                fs.writeFileSync(path.join(outDir, 'images', name), fitted.bytes);
                files.push({ name: `images/${name}`, bytes: fitted.bytes.length, overTarget: fitted.overTarget });
            }
            byContent.set(content, { src, width: fitted.width, height: fitted.height });
        }
        resolved.set(key, byContent.get(content));
    }
    const kept = mapImages(model, image => (resolved.has(imageKey(image)) ? image : null));
    const notes = missing.map(file => `The image ${file} doesn't exist, so it isn't shown.`);
    return {
        model: { ...kept, notes: [...kept.notes, ...notes] },
        href: image => resolved.get(imageKey(image)),
        files,
        count: byContent.size,
    };
}

function cleanOutput(outDir) {
    fs.mkdirSync(outDir, { recursive: true });
    fs.rmSync(path.join(outDir, 'images'), { recursive: true, force: true });
    for (const file of ['index.html', 'preview.html']) fs.rmSync(path.join(outDir, file), { force: true });
}

async function main() {
    let args;
    try {
        args = parseArgs(process.argv.slice(2));
    } catch (error) {
        if (!(error instanceof UsageError)) throw error;
        console.error(`${error.message}\n${USAGE}`);
        process.exit(2);
    }
    if (args.help) {
        console.log(USAGE);
        return;
    }

    const root = path.resolve(args.root || ROOT);
    const manifestFile = path.resolve(args.manifest || path.join(root, 'scripts', 'qa', 'results', 'manifest.json'));
    if (!fs.existsSync(manifestFile)) {
        console.error(`There is no screenshot manifest at ${manifestFile}. Run \`npm run qa:screens\` (and \`QA_CHANNEL=1 npm run qa:screens\`) first: every screenshot run writes it.`);
        process.exit(1);
    }
    const manifest = readManifest(manifestFile);

    let input = {};
    if (args.input) {
        try {
            input = JSON.parse(fs.readFileSync(args.input, 'utf8'));
        } catch (error) {
            console.error(`The checkpoint notes ${args.input} can't be read: ${error.message}`);
            process.exit(2);
        }
        const problems = validateInput(input);
        if (problems.length) {
            console.error(`The checkpoint notes ${args.input} have problems:\n${problems.map(problem => `  - ${problem}`).join('\n')}`);
            process.exit(2);
        }
    }

    const head = headInfo({ cwd: root });
    const generatedAt = new Date().toISOString();
    const reviewDir = path.join(root, 'scripts', 'qa', 'results', 'review');
    let model;
    let name;
    let tagged = null;
    if (args.pr !== undefined) {
        const base = args.base || 'origin/master';
        const since = mergeBase(base, 'HEAD', { cwd: root });
        const label = args.pr ? `PR #${args.pr}` : `Branch ${head.branch}`;
        model = buildPrModel({
            pr: {
                label, branch: head.branch, base, mergeBase: since,
            },
            head,
            manifest,
            changes: changedBaselines({ since, until: null, cwd: root }),
            generatedAt,
        });
        name = args.pr ? `pr-${args.pr}` : `branch-${head.branch.replace(/[^A-Za-z0-9]+/g, '-')}`;
    } else {
        const tags = checkpointTags({ cwd: root });
        name = args.name || nextCheckpointName(tags);
        const number = Number(name.slice('review-'.length));
        const earlier = tags.filter(tag => Number(tag.slice('review-'.length)) < number);
        const since = args.since === 'none' ? null : (args.since || latestCheckpoint(earlier));
        // A tagged checkpoint is remade only as it was: its range ends at its tag, and its
        // screenshots and baselines are that commit's.
        tagged = tagCommit(name, { cwd: root });
        if (tagged && tagged !== head.sha) {
            console.error(`${name} is tagged at ${tagged.slice(0, 8)}, and this checkout is at ${head.short}. Regenerate it from its tag's commit: `
                + `git worktree add <dir> ${name}, run the screenshots there, then node scripts/qa/review/review.mjs --root <dir> --name ${name} …`);
            process.exit(2);
        }
        const until = tagged ? name : 'HEAD';
        model = buildCheckpointModel({
            name,
            since,
            head,
            manifest,
            changes: since ? changedBaselines({ since, until, cwd: root }) : [],
            merged: since ? mergedSince({ since, until, cwd: root }) : [],
            input,
            generatedAt,
        });
    }
    const outDir = path.resolve(args.out || path.join(reviewDir, name));

    cleanOutput(outDir);
    const encoder = process.env.RF_REVIEW_ENCODER === 'copy' ? copyEncoder : await createChromiumEncoder();
    let prepared;
    try {
        prepared = await prepareImages(model, {
            root, outDir, inline: args.inline, encoder,
        });
    } finally {
        await encoder.close();
    }
    const html = renderReviewPage(prepared.model, { href: prepared.href });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    fs.writeFileSync(path.join(outDir, 'preview.html'), wrapDocument(html));

    const budget = checkBudget([{ name: 'index.html', bytes: Buffer.byteLength(html) }, ...prepared.files]);
    const shown = path.relative(process.cwd(), outDir);
    const where = !shown || shown.startsWith('..') ? outDir : shown;
    console.log(`${model.mode === 'pr' ? 'PR side by side' : `Review page ${name}`}: ${path.join(where, 'index.html')}`);
    console.log(`  ${prepared.count} image${prepared.count === 1 ? '' : 's'}${args.inline ? ' inside the page' : ` in ${path.join(where, 'images')}`}; ${formatBytes(budget.total)} in all, ${budget.ok ? 'under' : 'OVER'} the ${formatBytes(PAGE_LIMIT_BYTES)} limit`);
    console.log(`  To view it here: ${path.join(where, 'preview.html')}`);
    for (const note of prepared.model.notes) console.log(`  NOTE  ${note}`);
    for (const problem of budget.problems) console.log(`  ${budget.ok ? 'WARN' : 'FAIL'}  ${problem}`);
    if (model.mode === 'pr') {
        console.log('  Local only: never publish this page.');
    } else if (tagged) {
        console.log(`  ${name} is already tagged at ${tagged.slice(0, 8)}: republish it in place, to the same artifact (the orchestrator does).`);
    } else {
        console.log(`  Publish index.html${args.inline ? '' : ' with its images/ folder'} as a private claude.ai artifact (the orchestrator does), then tag the checkpoint: git tag ${name} ${head.short} && git push origin ${name}`);
    }
    if (!budget.ok) process.exit(1);
}

if (isMain(import.meta.url)) {
    main().catch(error => {
        console.error(error.stack || error.message);
        process.exit(1);
    });
}
