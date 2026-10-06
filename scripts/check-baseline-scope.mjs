#!/usr/bin/env node
// The baseline-scope check (W0-13; plan section 6.6): a PR may change a screenshot baseline
// only if its body's "Baselines:" line declares that page kind or overlay. CI runs it on every
// PR (.github/workflows/reelflies-baseline-scope.yml), and scripts/merge.sh runs it again on
// the PR's current body and files before merging.
//
//   PR_BODY="$body" node scripts/check-baseline-scope.mjs --base <sha> --head <sha>
//   node scripts/check-baseline-scope.mjs --body-file body.md --files changed.txt
//
// The line, one per PR body:
//   Baselines: none                                      no baseline changes
//   Baselines: product, product@sold-out, overlay rf_rise-off
//   Baselines: epoch <cause>                             a re-baseline epoch (section 6.6)
//
// A baseline is scripts/qa/baselines/<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png.
// A kind covers its plain pin on every channel and in every UI state; kind@pin covers that pin;
// "overlay <name>" covers every baseline under that overlay. A path in any other shape is
// covered only by an epoch. scripts/qa/README.md, "Declaring changed baselines", has more.

import { spawnSync } from 'child_process';
import fs from 'fs';
import { isMain } from './lib/is-main.mjs';

export const BASELINES_DIR = 'scripts/qa/baselines/';

const LINE = /^[ \t]*(?:[-*+][ \t]+)?(?:\*\*|__)?Baselines(?::(?:\*\*|__)?|(?:\*\*|__)?:)[ \t]*(.*)$/gm;
const KIND = /^([a-z0-9][a-z0-9-]*)(?:@([A-Za-z0-9_-]+))?$/;
const OVERLAY = /^overlay(?:\s+(.*))?$/;
const NAME_PART = /^[A-Za-z0-9_-]+$/;
const FILE = /^(?<kind>[a-z0-9][a-z0-9-]*?)(?:@(?<pin>[A-Za-z0-9_-]+))?(?:~(?<state>[A-Za-z0-9_-]+))?(?:\+(?<overlay>[A-Za-z0-9_-]+))?-(?<project>[a-z]+-\d+)-(?<platform>darwin|linux|win32)\.png$/;

function parseItem(item) {
    const overlay = OVERLAY.exec(item);
    if (overlay) {
        const name = (overlay[1] || '').trim();
        if (!name) throw new Error('an overlay needs a name, as in "overlay rf_rise-off"');
        if (!NAME_PART.test(name)) throw new Error(`"${item}": an overlay name is letters, digits, _ and -`);
        return { kind: null, pin: null, overlay: name };
    }
    const kind = KIND.exec(item);
    if (!kind) throw new Error(`"${item}" isn't a page kind, kind@pin or "overlay <name>"`);
    return { kind: kind[1], pin: kind[2] || null, overlay: null };
}

// The PR body's declaration, or null when it has no Baselines line.
export function parseDeclaration(body) {
    const lines = [...String(body ?? '').matchAll(LINE)];
    if (!lines.length) return null;
    if (lines.length > 1) throw new Error(`the PR body has more than one "Baselines:" line (${lines.length}); keep one`);
    const line = lines[0][0].trim();
    const value = lines[0][1].trim();
    if (!value) throw new Error('the "Baselines:" line names nothing; write "Baselines: none" if no baseline changes');
    const epoch = /^epoch\b(.*)$/.exec(value);
    if (epoch) {
        const cause = epoch[1].trim();
        if (!cause) throw new Error('"Baselines: epoch" needs its cause, as in "Baselines: epoch 18\'s apply"');
        return { type: 'epoch', line, cause };
    }
    const items = value.split(',').map(item => item.trim()).filter(Boolean);
    if (items.includes('none')) {
        if (items.length > 1) throw new Error('"none" stands alone on the "Baselines:" line');
        return { type: 'none', line };
    }
    if (items.some(item => /^epoch\b/.test(item))) throw new Error('"epoch" stands alone on the "Baselines:" line, as "Baselines: epoch <cause>"');
    return { type: 'list', line, items: items.map(parseItem) };
}

// The parts of a baseline's path, or null when it isn't in the shape the check knows.
export function parseBaselinePath(file) {
    if (!file.startsWith(BASELINES_DIR)) return null;
    const parts = file.slice(BASELINES_DIR.length).split('/');
    if (parts.length !== 2 || !parts[0]) return null;
    const match = FILE.exec(parts[1]);
    if (!match) return null;
    const {
        kind, pin = null, state = null, overlay = null, project, platform,
    } = match.groups;
    return {
        set: parts[0], kind, pin: pin ?? null, state: state ?? null, overlay: overlay ?? null, project, platform,
    };
}

const describeBaseline = parsed => `${parsed.kind}${parsed.pin ? `@${parsed.pin}` : ''}${parsed.state ? ` in state ${parsed.state}` : ''}${parsed.overlay ? ` under overlay ${parsed.overlay}` : ''}`;
const declaredName = parsed => (parsed.overlay ? `overlay ${parsed.overlay}` : `${parsed.kind}${parsed.pin ? `@${parsed.pin}` : ''}`);

function cover(declaration, file) {
    const parsed = parseBaselinePath(file);
    if (declaration.type === 'epoch') {
        return {
            file, parsed, covered: true, reason: `epoch: ${declaration.cause}`,
        };
    }
    if (declaration.type === 'none') {
        return {
            file, parsed, covered: false, reason: 'the PR declares "Baselines: none"',
        };
    }
    if (!parsed) {
        return {
            file, parsed, covered: false, reason: 'not a <set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png path, so only an epoch covers it',
        };
    }
    const covered = declaration.items.some(item => (item.overlay
        ? parsed.overlay === item.overlay
        : parsed.overlay === null && parsed.kind === item.kind && parsed.pin === item.pin));
    return {
        file, parsed, covered, reason: covered ? describeBaseline(parsed) : `${declaredName(parsed)} isn't declared`,
    };
}

// files: every path the PR changes, adds, deletes or renames (both names of a rename).
export function checkScope({ body, files }) {
    const pngs = [...new Set(files)].filter(file => file.startsWith(BASELINES_DIR) && file.endsWith('.png'));
    let declaration;
    try {
        declaration = parseDeclaration(body);
    } catch (error) {
        return {
            ok: false,
            declaration: null,
            error: error.message,
            files: pngs.map(file => ({
                file, parsed: parseBaselinePath(file), covered: false, reason: 'the "Baselines:" line is malformed',
            })),
        };
    }
    if (!pngs.length) {
        return {
            ok: true, declaration, error: null, files: [],
        };
    }
    if (!declaration) {
        return {
            ok: false,
            declaration,
            error: `the PR changes ${pngs.length} baseline${pngs.length === 1 ? '' : 's'} but its body has no "Baselines:" line`,
            files: pngs.map(file => ({
                file, parsed: parseBaselinePath(file), covered: false, reason: 'not declared',
            })),
        };
    }
    const results = pngs.map(file => cover(declaration, file));
    return {
        ok: results.every(result => result.covered), declaration, error: null, files: results,
    };
}

// One line for merge.sh's refusal.
export function summarizeScope(result) {
    if (result.ok) return 'baseline scope: every changed baseline is declared';
    if (result.error) return `baseline scope: ${result.error}`;
    const outside = result.files.filter(file => !file.covered).map(file => file.file);
    return `baseline scope: ${outside.length} changed baseline${outside.length === 1 ? '' : 's'} outside "${result.declaration.line}": ${outside.join(', ')}`;
}

export function report(result) {
    const lines = [];
    if (result.declaration) lines.push(`${result.declaration.line}   (from the PR body)`);
    else if (!result.error) lines.push('No "Baselines:" line in the PR body.');
    for (const file of result.files) lines.push(`  ${(file.covered ? 'ok' : 'OUTSIDE').padEnd(8)}  ${file.file}  (${file.reason})`);
    if (result.ok) lines.push(result.files.length ? 'PASS: every changed baseline is declared.' : 'PASS: no baseline changed.');
    else if (result.error) lines.push(`FAIL: ${result.error}.`);
    else lines.push(`FAIL: ${result.files.filter(file => !file.covered).length} changed baseline(s) outside the declared set. Declare them on the "Baselines:" line (scripts/qa/README.md, "Declaring changed baselines"), or drop the change.`);
    return lines.join('\n');
}

function gitChangedFiles(base, head) {
    const result = spawnSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`git diff ${base}...${head} failed: ${result.stderr.trim()}`);
    return result.stdout.split('\0').filter(Boolean);
}

function main(argv) {
    const value = flag => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : undefined);
    const base = value('--base');
    const head = value('--head');
    const filesPath = value('--files');
    const bodyPath = value('--body-file');
    if (!(base && head) && !filesPath) {
        console.error('usage: node scripts/check-baseline-scope.mjs (--base <sha> --head <sha> | --files <list>) [--body-file <body.md>]\n'
            + '  needs --base and --head, or --files; the body is --body-file or $PR_BODY');
        process.exit(2);
    }
    try {
        const files = filesPath ? fs.readFileSync(filesPath, 'utf8').split('\n').map(line => line.trim()).filter(Boolean) : gitChangedFiles(base, head);
        const body = bodyPath ? fs.readFileSync(bodyPath, 'utf8') : (process.env.PR_BODY ?? '');
        const result = checkScope({ body, files });
        console.log(report(result));
        process.exit(result.ok ? 0 : 1);
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exit(2);
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
