#!/usr/bin/env node
// The switch matrix (ticket 54a; spec stories 35 and 73; SCOPE-3 part 3, "QA screenshots every key
// page with each switch on and off"): every pinned page with each module switch on and off, on a
// local stencil start, through W0-8's overlays.
//
//   export QA_PORT=4300          # the worktree's own pair; the overlay rows take 4310 and 4311
//   npm run qa:matrix            # every row
//   npm run qa:matrix -- --list  # the plan only: which rows, and which switches wait
//
// - The rows: the plain run, with every switch at its value for QA_VARIATION, then one row per
//   switch whose module has landed, rendered with the overlay that flips it (switches.mjs:
//   flippingOverlays). So each switch is seen once on and once off.
// - A switch is in the matrix once a template reads theme_settings.<switch>. One no template
//   reads is listed as waiting for its module's ticket, and isn't a failure: a switchable module
//   that isn't ready ships switched off (ticket 10's rule).
// - A landed switch with no overlay to flip it, or a boolean rf_* setting SWITCHES doesn't know,
//   fails the matrix.
// - Each row runs two commands, each with its own stencil start (an overlay never reuses a
//   server, W0-8; the plain row reuses one that renders it):
//     Playwright, with the specs in MATRIX_SPECS: the screenshot diffs and axe of the gates,
//       switch-stock (nothing of a switched-off module on the page), reflow at 320, reduced
//       motion, the focus tab-through, and the network guard's self-test. Its JSON report
//       (RF_QA_JSON_REPORT, playwright.config.mjs) gives each spec its own result.
//     the raw-HTML check (raw-html.mjs).
//   Every row runs, whatever the ones before it did, and the run prints one line per gate per
//   row, then exits 1 if any failed or the plan has a problem, and 2 if it couldn't start.
// - It writes scripts/qa/results/matrix/summary.json (ignored by git) for ticket 54b's report,
//   and each row's screenshots go into the screenshot manifest with their overlay's name, for
//   the review pages (W0-10).
// - It refuses QA_OVERLAY (it sets that itself, row by row), QA_BASE_URL and QA_FRESH_SERVER=1:
//   an overlay renders only on a local stencil start, and never in a release.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { isMain } from '../lib/is-main.mjs';
import { listOverlays, readOverlay } from './overlays.mjs';
import { gateEnv } from './prepush.mjs';
import {
    QA_CHANNEL, QA_PORT, QA_VARIATION, ROOT, checkEnv, slug,
} from './storefront.mjs';
import {
    SWITCHES, describeValues, flippingOverlays, moduleSwitches, switchValues, templatesReading,
} from './switches.mjs';

// The Playwright specs each row runs, one gate each, in the order they are reported.
export const MATRIX_SPECS = [
    { gate: 'screenshots', file: 'screens.spec.mjs' },
    { gate: 'axe', file: 'axe.spec.mjs' },
    { gate: 'stock markup', file: 'switch-stock.spec.mjs' },
    { gate: 'reflow at 320', file: 'reflow.spec.mjs' },
    { gate: 'reduced motion', file: 'reduced-motion.spec.mjs' },
    { gate: 'focus', file: 'focus.spec.mjs' },
    { gate: 'network guard', file: 'harness-selftest.spec.mjs' },
];
export const RAW_HTML_GATE = 'raw HTML';
export const MATRIX_DIR = path.join(ROOT, 'scripts', 'qa', 'results', 'matrix');
const OVERLAY_OFFSET = 10; // overlays.mjs, OVERLAY_PORT_OFFSET

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const onOff = value => (value ? 'on' : 'off');

// The rows, the switches that wait for their module, and the problems that fail the matrix.
// `overlays` are read overlays ({ name, settings }); `reading` is the set of switches a template
// reads (switches.mjs, templatesReading).
export function matrixPlan({
    config, variation, overlays, reading, switches = SWITCHES,
}) {
    const values = switchValues({ config, variation });
    const rows = [{
        name: 'plain', overlay: null, switch: null, values,
    }];
    const waiting = [];
    const problems = [];
    const notes = [];
    for (const key of moduleSwitches(config)) {
        const entry = switches[key];
        if (!entry) {
            problems.push(`${key} is a module switch in config.json, and SWITCHES in scripts/qa/switches.mjs has no entry for it: add one, with the ticket that owns it`);
        } else if (!reading.has(key)) {
            waiting.push({ key, ticket: entry.ticket, reason: `no template reads theme_settings.${key} yet, so ticket ${entry.ticket}'s module hasn't landed` });
        } else {
            const flipped = !values[key];
            const [overlay, ...others] = flippingOverlays(key, flipped, overlays);
            if (!overlay) {
                problems.push(`no overlay renders ${key} ${onOff(flipped)}: add scripts/qa/overlays/${key}-${onOff(flipped)}.json, setting "${key}" to ${flipped} and nothing else (ticket ${entry.ticket})`);
            } else {
                if (others.length) notes.push(`${key}: ${[overlay, ...others].join(', ')} all render it ${onOff(flipped)}; the matrix uses ${overlay}`);
                rows.push({
                    name: `${key} ${onOff(flipped)}`, overlay, switch: key, values: { ...values, [key]: flipped },
                });
            }
        }
    }
    return {
        rows, waiting, problems, notes,
    };
}

// `npx playwright test` with this folder's config and the matrix specs only. Playwright reads each
// filter as a regular expression on the spec's path, so each is anchored to its file name:
// "screens.spec" alone would run widget-screens.spec.mjs too.
export const playwrightArgs = (specs = MATRIX_SPECS) => [
    'playwright', 'test', '--config', 'scripts/qa/playwright.config.mjs',
    ...specs.map(({ file }) => `/${file.replace(/\./g, '\\.')}$`),
];

const stripColour = text => String(text).replace(/\u001b\[[0-9;]*m/g, ''); // eslint-disable-line no-control-regex
const firstLine = text => stripColour(text).split('\n').find(line => line.trim()) || '';
// A failure's first line, cut to fit one line of the matrix's output. The JSON report and
// Playwright's HTML report (results/report) keep the whole message.
const clip = (text, length = 240) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);
const testsOf = suite => [
    ...(suite.specs || []).flatMap(spec => (spec.tests || []).map(item => ({ title: spec.title, ...item }))),
    ...(suite.suites || []).flatMap(testsOf),
];

// Each matrix spec's result, from a row's Playwright JSON report. A report that is missing (the
// run stopped before it wrote one; `status` is its exit) or that holds an error of the run's own
// (the webServer didn't start, say) fails every spec.
export function gateResults(report, { status = null, specs = MATRIX_SPECS } = {}) {
    const failAll = summary => specs.map(({ gate, file }) => ({
        gate, file, ok: false, passed: 0, failed: 0, skipped: 0, failures: [], summary,
    }));
    if (!report) return failAll(`Playwright exited ${status} without a report (its output is above)`);
    if (report.errors?.length) return failAll(`the run failed before its tests: ${firstLine(report.errors[0].message || report.errors[0].value || '')}`);
    const suites = new Map((report.suites || []).map(suite => [path.basename(suite.file || suite.title || ''), suite]));
    return specs.map(({ gate, file }) => {
        const tests = suites.has(file) ? testsOf(suites.get(file)) : [];
        const failed = tests.filter(({ status: state }) => state === 'unexpected');
        const skipped = tests.filter(({ status: state }) => state === 'skipped').length;
        const passed = tests.length - failed.length - skipped;
        const failures = failed.map(({ title, projectName, results = [] }) => {
            const error = results.at(-1)?.error?.message;
            return `${title} [${projectName}]${error ? `: ${clip(firstLine(error))}` : ''}`;
        });
        const parts = [failed.length && `${failed.length} failed`, passed && `${passed} passed`, skipped && `${skipped} skipped`].filter(Boolean);
        return {
            gate, file, ok: !failed.length, passed, failed: failed.length, skipped, failures, summary: parts.length ? parts.join(', ') : 'no tests',
        };
    });
}

// The raw-HTML check's exit (raw-html.mjs) as a gate.
export function rawHtmlGate(status) {
    const summaries = {
        0: 'passed',
        1: 'a raw-HTML assertion failed (its output is above)',
        2: 'the storefront couldn\'t be reached, or a port was busy (its output is above)',
    };
    return {
        gate: RAW_HTML_GATE, ok: status === 0, failures: [], summary: summaries[status] ?? `stopped (${status})`,
    };
}

// A row's environment: this one without the variables only a Playwright runner sets
// (prepush.mjs, gateEnv), with the row's overlay or none.
export function rowEnvironment(env, row) {
    const out = gateEnv(env);
    delete out.QA_OVERLAY;
    if (row.overlay) out.QA_OVERLAY = row.overlay;
    return out;
}

function defaultRunPlaywright({ env, reportFile }) {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.rmSync(reportFile, { force: true });
    const { status, signal } = spawnSync('npx', playwrightArgs(), { cwd: ROOT, stdio: 'inherit', env });
    let report = null;
    try {
        report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    } catch {
        // no report: gateResults fails every spec with the exit status
    }
    return { status: status ?? signal, report };
}

function defaultRunRawHtml({ env }) {
    const { status, signal } = spawnSync(process.execPath, ['scripts/qa/raw-html.mjs'], { cwd: ROOT, stdio: 'inherit', env });
    return { status: status ?? signal };
}

// Runs every row of the plan, whatever the rows before it did. Resolves to [{ row, gates }].
// runPlaywright({ row, env, reportFile }) and runRawHtml({ row, env }) are stand-ins in the tests.
export async function runMatrix(plan, {
    env = process.env, runPlaywright = defaultRunPlaywright, runRawHtml = defaultRunRawHtml, log = console.log,
} = {}) {
    const results = [];
    for (const row of plan.rows) {
        const rowEnv = rowEnvironment(env, row);
        log(`\n-- Switch matrix row: ${row.name}${row.overlay ? ` (QA_OVERLAY=${row.overlay})` : ''}\n`);
        const reportFile = path.join(MATRIX_DIR, `${slug(row.name)}.json`);
        const { status, report } = await runPlaywright({ row, env: { ...rowEnv, RF_QA_JSON_REPORT: reportFile }, reportFile }); // eslint-disable-line no-await-in-loop
        const gates = gateResults(report, { status });
        gates.push(rawHtmlGate((await runRawHtml({ row, env: rowEnv })).status)); // eslint-disable-line no-await-in-loop
        results.push({ row, gates });
    }
    return results;
}

// What the run prints: the plan, then (with `results`) one line per gate per row and the verdict.
export function matrixLines({
    plan, results, channel, variation, port,
}) {
    const lines = [`Switch matrix on channel ${channel}, "${variation}", port ${port} (overlays on ${port + OVERLAY_OFFSET})`, '', 'Rows:'];
    const width = Math.max(...plan.rows.map(({ name }) => name.length)) + 2;
    for (const row of plan.rows) lines.push(`  ${row.name.padEnd(width)}${row.overlay ? `the overlay ${row.overlay}` : describeValues(row.values)}`);
    if (plan.waiting.length) {
        lines.push('', 'Not in the matrix yet:');
        for (const { key, ticket, reason } of plan.waiting) lines.push(`  ${key} (ticket ${ticket}): ${reason}`);
    }
    for (const note of plan.notes || []) lines.push(`NOTE     ${note}`);
    if (plan.problems.length) lines.push('');
    for (const problem of plan.problems) lines.push(`FAIL     ${problem}`);
    if (!results) {
        lines.push('', `Plan only (--list): ${count(plan.rows.length, 'row')}, nothing ran.`);
        return lines;
    }

    let gates = 0;
    let failed = 0;
    if (results.length) lines.push('', 'Results:');
    for (const { row, gates: rowGates } of results) {
        for (const gate of rowGates) {
            gates += 1;
            if (!gate.ok) failed += 1;
            lines.push(`${gate.ok ? 'ok      ' : 'FAIL    '} ${row.name} · ${gate.gate}: ${gate.summary}`);
            for (const failure of gate.failures.slice(0, 5)) lines.push(`           ${failure}`);
            if (gate.failures.length > 5) lines.push(`           and ${gate.failures.length - 5} more`);
        }
    }
    lines.push('');
    if (!plan.problems.length && !failed) {
        lines.push(`Every gate passed in ${count(results.length, 'row')} (${count(gates, 'gate')}).`);
    } else {
        const parts = [plan.problems.length && `${count(plan.problems.length, 'problem')} in its plan`, failed && `${failed} of ${count(gates, 'gate')}`].filter(Boolean);
        lines.push(`The matrix failed: ${parts.join(', and ')}.`);
    }
    return lines;
}

// Why the matrix can't run in this environment, or null.
export function matrixEnvProblem(env = process.env) {
    if (env.QA_OVERLAY) return `the switch matrix sets QA_OVERLAY itself, row by row: unset it (it is "${env.QA_OVERLAY}")`;
    if (env.QA_BASE_URL) return 'the switch matrix renders each row on a local stencil start, because an overlay renders only there (W0-8): unset QA_BASE_URL';
    if (env.QA_FRESH_SERVER === '1') return 'the switch matrix renders overlays, which QA_FRESH_SERVER=1 refuses (release.sh sets it, and a release never renders one): unset it';
    return null;
}

function commit() {
    const { stdout } = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
    return stdout.trim() || null;
}

async function main() {
    const listOnly = process.argv.slice(2).includes('--list');
    let plan;
    try {
        const problem = matrixEnvProblem();
        if (problem) throw new Error(problem);
        checkEnv();
        const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
        plan = matrixPlan({
            config, variation: QA_VARIATION, overlays: listOverlays().map(name => readOverlay(name)), reading: templatesReading(moduleSwitches(config)),
        });
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exit(2);
    }
    const header = {
        plan, channel: QA_CHANNEL, variation: QA_VARIATION, port: QA_PORT,
    };
    if (listOnly) {
        matrixLines({ ...header, results: null }).forEach(line => console.log(line));
        process.exit(plan.problems.length ? 1 : 0);
    }

    const results = await runMatrix(plan);
    const lines = matrixLines({ ...header, results });
    console.log('');
    lines.forEach(line => console.log(line));
    const ok = !plan.problems.length && results.every(({ gates }) => gates.every(gate => gate.ok));
    fs.mkdirSync(MATRIX_DIR, { recursive: true });
    fs.writeFileSync(path.join(MATRIX_DIR, 'summary.json'), `${JSON.stringify({
        ranAt: new Date().toISOString(),
        commit: commit(),
        channel: QA_CHANNEL,
        variation: QA_VARIATION,
        ok,
        rows: results.map(({ row, gates }) => ({ ...row, gates })),
        waiting: plan.waiting,
        problems: plan.problems,
        notes: plan.notes,
    }, null, 2)}\n`);
    process.exit(ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
