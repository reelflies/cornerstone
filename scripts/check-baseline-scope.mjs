#!/usr/bin/env node
// The baseline-scope check (W0-13; plan section 6.6): a PR may change a screenshot baseline
// only if its body's "Baselines:" line declares that page kind, overlay or widget. CI runs it
// on every PR (.github/workflows/reelflies-baseline-scope.yml), and scripts/merge.sh runs it
// again on the PR's current body and files before merging.
//
//   PR_BODY="$body" node scripts/check-baseline-scope.mjs --base <sha> --head <sha>
//   node scripts/check-baseline-scope.mjs --body-file body.md --files changed.txt
//
// The line, one per PR body:
//   Baselines: none                                      no baseline changes
//   Baselines: product, product@sold-out, overlay rf_rise-off
//   Baselines: home, widget home-lead, widget rf-selftest
//   Baselines: epoch <cause>                             a re-baseline epoch (section 6.6)
//
// A page baseline is scripts/qa/baselines/<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png.
// A kind covers its plain pin on every channel and in every UI state; kind@pin covers that pin;
// "overlay <name>" covers every baseline under that overlay.
//
// A widget shot (W0-9) is scripts/qa/baselines/widgets/<variation>/<widget>-<case>-<project>-<platform>.png.
// "widget <name>" covers that widget's shots in every fixture case, variation and width. Widget
// and case names may both hold hyphens, so the check reads the shot against the widgets that
// exist (knownWidgets): a shot that two widgets could own (rf-hero's banner-default, or
// rf-hero-banner's default) needs both declared, and one that no widget owns needs an epoch.
// Page kinds and overlays never cover a widget shot, and a widget never covers a page baseline.
//
// A path in any other shape, including the folder or extension in another case (the Mac's file
// system ignores case), is covered only by an epoch, and an epoch PR changes nothing but
// baselines. scripts/qa/README.md, "Declaring changed baselines", has more.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isMain } from './lib/is-main.mjs';

export const BASELINES_DIR = 'scripts/qa/baselines/';
// This script's checkout: in CI the PR's merge commit, and for merge.sh the main clone.
const THEME_ROOT = fileURLToPath(new URL('..', import.meta.url));

const LINE = /^[ \t]*(?:[-*+][ \t]+)?(?:\*\*|__)?Baselines(?::(?:\*\*|__)?|(?:\*\*|__)?:)[ \t]*(.*)$/gm;
const KIND = /^([a-z0-9][a-z0-9-]*)(?:@([A-Za-z0-9_-]+))?$/;
const OVERLAY = /^overlay(?:\s+(.*))?$/;
const WIDGET = /^widget(?:\s+(.*))?$/;
const NAME_PART = /^[A-Za-z0-9_-]+$/;
const FILE = /^(?<kind>[a-z0-9][a-z0-9-]*?)(?:@(?<pin>[A-Za-z0-9_-]+))?(?:~(?<state>[A-Za-z0-9_-]+))?(?:\+(?<overlay>[A-Za-z0-9_-]+))?-(?<project>[a-z]+-\d+)-(?<platform>darwin|linux|win32)\.png$/;
// Widget element shots (W0-9; scripts/qa/widget-screens.spec.mjs): the set folder is "widgets",
// then the variation's slug, then <widget>-<case>-<project>-<platform>.png.
export const WIDGET_SET = 'widgets';
// Where widgets live: the theme's widgets/ (ticket 46), and the shot self-test's widget, which
// lives outside it so no sync uploads it (scripts/qa/render/widget-page.mjs, SELFTEST_WIDGETS).
export const WIDGETS_DIR = 'widgets/';
export const SELFTEST_WIDGETS_DIR = 'scripts/qa/render/selftest/widgets/';
const VARIATION = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WIDGET_FILE = /^(?<shot>[A-Za-z0-9_-]+)-(?<project>[a-z]+-\d+)-(?<platform>darwin|linux|win32)\.png$/;

function parseWidget(item, name) {
    if (!name) throw new Error('a widget needs its name, as in "widget home-lead"');
    const names = name.split(/\s+/);
    if (names.length > 1) throw new Error(`"${item}": one widget per item, comma-separated, as in "${names.map(each => `widget ${each}`).join(', ')}"`);
    if (!NAME_PART.test(name)) throw new Error(`"${item}": a widget's name is its folder under widgets/, in letters, digits, _ and -`);
    if (name.startsWith('_')) throw new Error(`"${item}": widgets/${name}/ holds shared partials, not a widget`);
    return {
        kind: null, pin: null, overlay: null, widget: name,
    };
}

function parseItem(item) {
    const overlay = OVERLAY.exec(item);
    if (overlay) {
        const name = (overlay[1] || '').trim();
        if (!name) throw new Error('an overlay needs a name, as in "overlay rf_rise-off"');
        if (!NAME_PART.test(name)) throw new Error(`"${item}": an overlay name is letters, digits, _ and -`);
        return {
            kind: null, pin: null, overlay: name, widget: null,
        };
    }
    const widget = WIDGET.exec(item);
    if (widget) return parseWidget(item, (widget[1] || '').trim());
    const kind = KIND.exec(item);
    if (!kind) throw new Error(`"${item}" isn't a page kind, kind@pin, "overlay <name>" or "widget <name>"`);
    return {
        kind: kind[1], pin: kind[2] || null, overlay: null, widget: null,
    };
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

// Anything under the baselines folder, in any case.
const underBaselines = file => file.toLowerCase().startsWith(BASELINES_DIR);

function folders(dir) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
        throw error;
    }
}

// The widget names a widget shot may belong to: each folder in widgets/ and the self-test
// folder in this checkout, and each widget folder the PR's own files name, so a widget the PR
// adds or deletes counts too. Folders starting with "_" (widgets/_shared/) aren't widgets. A
// name too many only asks for one more declaration; a name missing could let a shorter
// widget's declaration cover a longer one's shot, which is why both sources count.
export function knownWidgets(files = [], root = THEME_ROOT) {
    const names = new Set();
    for (const dir of [WIDGETS_DIR, SELFTEST_WIDGETS_DIR]) {
        folders(path.join(root, dir)).forEach(name => names.add(name));
        for (const file of files.filter(each => each.toLowerCase().startsWith(dir))) {
            const parts = file.slice(dir.length).split('/');
            if (parts.length > 1) names.add(parts[0]);
        }
    }
    return [...names].filter(name => NAME_PART.test(name) && !name.startsWith('_')).sort();
}

// A widget shot's parts. Widget and case names may both hold hyphens, so the shot's name alone
// can't say where one ends: each widget whose name, plus "-", starts the shot's name is a
// possible owner, with the rest as its fixture case. Usually there is one.
function parseWidgetShot(parts, widgets) {
    if (parts.length !== 3 || parts[0] !== WIDGET_SET || !VARIATION.test(parts[1])) return null;
    const match = WIDGET_FILE.exec(parts[2]);
    if (!match) return null;
    const { shot, project, platform } = match.groups;
    const owners = [...new Set(widgets)].sort()
        .filter(widget => shot.length > widget.length + 1 && shot.startsWith(`${widget}-`))
        .map(widget => ({ widget, case: shot.slice(widget.length + 1) }));
    return {
        set: WIDGET_SET, variation: parts[1], shot, owners, project, platform,
    };
}

// The parts of a baseline's path, or null when it isn't in the shape the check knows.
// widgets: the widget names a widget shot may belong to (knownWidgets()).
export function parseBaselinePath(file, { widgets = [] } = {}) {
    if (!file.startsWith(BASELINES_DIR)) return null;
    const parts = file.slice(BASELINES_DIR.length).split('/');
    // widgets/ holds widget shots only, in any case, so no page set can be named "widgets".
    if (parts[0].toLowerCase() === WIDGET_SET) return parseWidgetShot(parts, widgets);
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

const PAGE_SHAPE = '<set>/<kind>[@pin][~state][+overlay]-<project>-<platform>.png';
const WIDGET_SHAPE = 'widgets/<variation>/<widget>-<case>-<project>-<platform>.png';
const shapeOf = file => (file.slice(BASELINES_DIR.length).toLowerCase().startsWith(`${WIDGET_SET}/`) ? WIDGET_SHAPE : PAGE_SHAPE);
const isWidgetShot = parsed => parsed?.set === WIDGET_SET;
const ownedAs = owners => owners.map(owner => `widget ${owner.widget}'s ${owner.case}`).join(' or ');
const widgetList = names => names.map(name => `widget ${name}`).join(' and ');

// A widget shot is covered when every widget that could own it is declared.
function coverWidgetShot(declaration, file, parsed) {
    const { owners, variation } = parsed;
    if (!owners.length) {
        return {
            file, parsed, covered: false, reason: `no widget folder (in widgets/, ${SELFTEST_WIDGETS_DIR} or this PR's files) owns the shot ${parsed.shot}, so only an epoch covers it`,
        };
    }
    const declared = new Set(declaration.items.map(item => item.widget).filter(Boolean));
    const missing = owners.map(owner => owner.widget).filter(widget => !declared.has(widget));
    if (!missing.length) {
        const [only] = owners;
        const reason = owners.length === 1 ? `widget ${only.widget}, fixture ${only.case}, variation ${variation}` : `${ownedAs(owners)}, variation ${variation}`;
        return {
            file, parsed, covered: true, reason,
        };
    }
    const notDeclared = `${widgetList(missing)} ${missing.length === 1 ? 'isn\'t' : 'aren\'t'} declared`;
    return {
        file, parsed, covered: false, reason: owners.length === 1 ? notDeclared : `the shot could be ${ownedAs(owners)}, so each must be declared, and ${notDeclared}`,
    };
}

function cover(declaration, file, widgets) {
    const parsed = parseBaselinePath(file, { widgets });
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
            file, parsed, covered: false, reason: `not a ${shapeOf(file)} path, so only an epoch covers it`,
        };
    }
    if (isWidgetShot(parsed)) return coverWidgetShot(declaration, file, parsed);
    const covered = declaration.items.some(item => {
        if (item.widget) return false;
        if (item.overlay) return parsed.overlay === item.overlay;
        return parsed.overlay === null && parsed.kind === item.kind && parsed.pin === item.pin;
    });
    return {
        file, parsed, covered, reason: covered ? describeBaseline(parsed) : `${declaredName(parsed)} isn't declared`,
    };
}

// files: every path the PR changes, adds, deletes or renames (both names of a rename).
// widgets: the widget names a widget shot may belong to; knownWidgets() by default.
export function checkScope({ body, files, widgets: given }) {
    const unique = [...new Set(files)];
    const widgets = given ?? knownWidgets(unique);
    const pngs = unique.filter(file => underBaselines(file) && file.toLowerCase().endsWith('.png'));
    const refuseAll = (declaration, error, reason) => ({
        ok: false,
        declaration,
        error,
        files: pngs.map(file => ({
            file, parsed: parseBaselinePath(file, { widgets }), covered: false, reason,
        })),
    });
    let declaration;
    try {
        declaration = parseDeclaration(body);
    } catch (error) {
        return refuseAll(null, error.message, 'the "Baselines:" line is malformed');
    }
    if (declaration?.type === 'epoch') {
        // Section 6.6: an epoch PR re-records baselines and carries nothing else, so the line
        // can't wave through a code PR's baselines.
        const others = unique.filter(file => !underBaselines(file));
        if (others.length) {
            const named = others.slice(0, 5).join(', ') + (others.length > 5 ? `, and ${others.length - 5} more` : '');
            return refuseAll(declaration, `"Baselines: epoch" is for the orchestrator's re-baseline epoch PRs, which change baselines only, and this PR also changes ${named}`, 'an epoch covers baselines only in a baselines-only PR');
        }
    }
    if (!pngs.length) {
        return {
            ok: true, declaration, error: null, files: [],
        };
    }
    if (!declaration) {
        return refuseAll(declaration, `the PR changes ${pngs.length} baseline${pngs.length === 1 ? '' : 's'} but its body has no "Baselines:" line`, 'not declared');
    }
    const results = pngs.map(file => cover(declaration, file, widgets));
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
