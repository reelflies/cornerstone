// The switch matrix (ticket 54a; scripts/qa/switch-matrix.mjs): which rows it renders, how it
// reads each row's Playwright report, what it runs for a row and in what environment, and what
// it prints. Nothing here starts a server: the runs are stand-ins.
//
//   node --test scripts/qa/switch-matrix.test.mjs

import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MATRIX_SPECS, RAW_HTML_GATE, gateResults, matrixEnvProblem, matrixLines, matrixPlan, playwrightArgs, runMatrix,
} from './switch-matrix.mjs';

const CONFIG = {
    settings: {
        rf_rise: true, rf_cart_state: true, rf_quick_add: true, rf_region_prompt: false, rf_menu_type_ids: '',
    },
    variations: [{ name: 'ReelFlies CA', settings: {} }, { name: 'ReelFlies CA channel 1', settings: { rf_quick_add: false } }],
};
const OVERLAYS = [
    { name: 'menu-ids-empty', settings: { rf_menu_type_ids: '' } },
    { name: 'rf_rise-off', settings: { rf_rise: false } },
    { name: 'rf_quick_add-off', settings: { rf_quick_add: false } },
    { name: 'rf_region_prompt-on', settings: { rf_region_prompt: true } },
];

describe('the matrix plan', () => {
    it('renders the plain run, then each landed switch flipped by its overlay', () => {
        const plan = matrixPlan({
            config: CONFIG, variation: 'ReelFlies CA', overlays: OVERLAYS, reading: new Set(['rf_rise', 'rf_quick_add', 'rf_region_prompt']),
        });
        assert.deepEqual(plan.rows.map(({ name, overlay }) => [name, overlay]), [
            ['plain', null],
            ['rf_rise off', 'rf_rise-off'],
            ['rf_quick_add off', 'rf_quick_add-off'],
            ['rf_region_prompt on', 'rf_region_prompt-on'],
        ]);
        assert.deepEqual(plan.rows[0].values, {
            rf_rise: true, rf_cart_state: true, rf_quick_add: true, rf_region_prompt: false,
        });
        assert.equal(plan.rows[2].values.rf_quick_add, false);
        assert.deepEqual(plan.problems, []);
    });

    it('leaves out a switch no template reads yet, and says whose module it waits for', () => {
        const plan = matrixPlan({
            config: CONFIG, variation: 'ReelFlies CA', overlays: OVERLAYS, reading: new Set(['rf_rise']),
        });
        assert.deepEqual(plan.rows.map(({ name }) => name), ['plain', 'rf_rise off']);
        assert.deepEqual(plan.waiting.map(({ key, ticket }) => [key, ticket]), [['rf_cart_state', '42'], ['rf_quick_add', '43'], ['rf_region_prompt', '52']]);
        assert.match(plan.waiting[0].reason, /no template reads theme_settings\.rf_cart_state yet, so ticket 42's module hasn't landed/);
    });

    it('flips the variation\'s value, and fails a landed switch with no overlay to flip it', () => {
        const plan = matrixPlan({
            config: CONFIG, variation: 'ReelFlies CA channel 1', overlays: OVERLAYS, reading: new Set(['rf_quick_add', 'rf_cart_state']),
        });
        assert.deepEqual(plan.rows.map(({ name }) => name), ['plain']);
        assert.deepEqual(plan.problems, [
            'no overlay renders rf_cart_state off: add scripts/qa/overlays/rf_cart_state-off.json, setting "rf_cart_state" to false and nothing else (ticket 42)',
            'no overlay renders rf_quick_add on: add scripts/qa/overlays/rf_quick_add-on.json, setting "rf_quick_add" to true and nothing else (ticket 43)',
        ]);
    });

    it('fails a boolean rf_* setting the registry doesn\'t know', () => {
        const config = { ...CONFIG, settings: { ...CONFIG.settings, rf_new_thing: true } };
        const plan = matrixPlan({
            config, variation: 'ReelFlies CA', overlays: OVERLAYS, reading: new Set(),
        });
        assert.match(plan.problems[0], /rf_new_thing is a module switch in config\.json, and SWITCHES in scripts\/qa\/switches\.mjs has no entry for it/);
    });
});

describe('a row\'s Playwright run', () => {
    it('runs every matrix spec, and only those, with this folder\'s config', () => {
        const args = playwrightArgs();
        assert.deepEqual(args.slice(0, 4), ['playwright', 'test', '--config', 'scripts/qa/playwright.config.mjs']);
        const filters = args.slice(4).map(filter => new RegExp(filter));
        const runs = file => filters.some(filter => filter.test(path.resolve('scripts/qa', file)));
        for (const { file } of MATRIX_SPECS) assert.ok(runs(file), file);
        for (const file of ['widget-screens.spec.mjs', 'screens-selftest.spec.mjs', 'screens-reference.spec.mjs', 'quick-view.spec.mjs', 'review-live.spec.mjs']) {
            assert.ok(!runs(file), `${file} isn't a matrix spec`);
        }
    });

    const test = (title, projectName, status, message) => ({
        title,
        tests: [{ projectName, status, results: [{ status: status === 'unexpected' ? 'failed' : 'passed', ...(message ? { error: { message } } : {}) }] }],
    });
    const REPORT = {
        suites: [
            { file: 'axe.spec.mjs', specs: [test('home (/) has no serious or critical axe issues', 'phone-375', 'expected'), test('cart', 'desktop-1280', 'expected')] },
            {
                file: 'reduced-motion.spec.mjs',
                specs: [],
                suites: [{ specs: [test('home (/) runs and declares no motion under reduced motion', 'phone-375', 'unexpected', '\u001b[31mError: home under reduced motion\u001b[39m\nexpected [] got [...]')] }],
            },
            { file: 'focus.spec.mjs', specs: [test('cart (/cart.php)', 'desktop-1280', 'skipped'), test('cart (/cart.php)', 'phone-375', 'expected')] },
        ],
        errors: [],
    };

    it('reads each spec\'s results from the JSON report, nested suites included', () => {
        const gates = gateResults(REPORT);
        const byGate = Object.fromEntries(gates.map(gate => [gate.gate, gate]));
        assert.deepEqual(gates.map(({ gate }) => gate), MATRIX_SPECS.map(({ gate }) => gate));
        assert.deepEqual([byGate.axe.ok, byGate.axe.passed, byGate.axe.failed], [true, 2, 0]);
        assert.deepEqual([byGate['reduced motion'].ok, byGate['reduced motion'].failed], [false, 1]);
        assert.deepEqual(byGate['reduced motion'].failures, ['home (/) runs and declares no motion under reduced motion [phone-375]: Error: home under reduced motion']);
        const long = gateResults({ suites: [{ file: 'reflow.spec.mjs', specs: [test('home', 'phone-375', 'unexpected', `Error: home at 320 wide: ${'x'.repeat(400)}`)] }], errors: [] });
        assert.equal(long.find(({ gate }) => gate === 'reflow at 320').failures[0].length, 'home [phone-375]: '.length + 240);
        assert.match(long.find(({ gate }) => gate === 'reflow at 320').failures[0], /x…$/);
        assert.deepEqual([byGate.focus.ok, byGate.focus.passed, byGate.focus.skipped], [true, 1, 1]);
        assert.deepEqual([byGate.screenshots.ok, byGate.screenshots.summary], [true, 'no tests']);
    });

    it('fails every spec when the run stopped before it reported, or reported an error of its own', () => {
        for (const gate of gateResults(null, { status: 1 })) {
            assert.equal(gate.ok, false);
            assert.match(gate.summary, /Playwright exited 1 without a report/);
        }
        for (const gate of gateResults({ suites: [], errors: [{ message: 'Error: Timed out waiting 180000ms from config.webServer.\nmore' }] })) {
            assert.equal(gate.ok, false);
            assert.equal(gate.summary, 'the run failed before its tests: Error: Timed out waiting 180000ms from config.webServer.');
        }
    });
});

describe('running the matrix', () => {
    const plan = matrixPlan({
        config: CONFIG, variation: 'ReelFlies CA', overlays: OVERLAYS, reading: new Set(['rf_rise']),
    });
    const passing = { suites: MATRIX_SPECS.map(({ file }) => ({ file, specs: [{ title: 't', tests: [{ projectName: 'phone-375', status: 'expected', results: [{ status: 'passed' }] }] }] })), errors: [] };

    it('runs Playwright and the raw-HTML check for each row, the plain one without an overlay', async () => {
        const calls = [];
        const results = await runMatrix(plan, {
            env: { QA_PORT: '4300', RF_QA_PORTS_CHECKED: '1', PATH: '/bin' },
            runPlaywright: ({ row, env }) => {
                calls.push(['playwright', row.name, env.QA_OVERLAY, env.QA_PORT, env.RF_QA_PORTS_CHECKED]);
                return { status: 0, report: passing };
            },
            runRawHtml: ({ row, env }) => {
                calls.push(['raw HTML', row.name, env.QA_OVERLAY, env.QA_PORT]);
                return { status: row.overlay ? 1 : 0 };
            },
            log: () => {},
        });
        assert.deepEqual(calls, [
            ['playwright', 'plain', undefined, '4300', undefined],
            ['raw HTML', 'plain', undefined, '4300'],
            ['playwright', 'rf_rise off', 'rf_rise-off', '4300', undefined],
            ['raw HTML', 'rf_rise off', 'rf_rise-off', '4300'],
        ]);
        const rawHtml = results.map(({ gates }) => gates.find(({ gate }) => gate === RAW_HTML_GATE));
        assert.deepEqual(rawHtml.map(({ ok }) => ok), [true, false]);
        assert.equal(rawHtml[1].summary, 'a raw-HTML assertion failed (its output is above)');
    });

    it('prints the rows, the switches not in it yet, and each gate of each row', async () => {
        const results = await runMatrix(plan, {
            env: {},
            runPlaywright: () => ({ status: 0, report: passing }),
            runRawHtml: ({ row }) => ({ status: row.overlay ? 2 : 0 }),
            log: () => {},
        });
        const lines = matrixLines({
            plan, results, channel: '1895766', variation: 'ReelFlies CA', port: 4300,
        });
        const text = lines.join('\n');
        assert.match(text, /^Switch matrix on channel 1895766, "ReelFlies CA", port 4300 \(overlays on 4310\)/);
        assert.match(text, /\n {2}plain +rf_rise on, rf_cart_state on, rf_quick_add on, rf_region_prompt off\n/);
        assert.match(text, /\n {2}rf_rise off +the overlay rf_rise-off\n/);
        assert.match(text, /\nNot in the matrix yet:\n {2}rf_cart_state \(ticket 42\): no template reads/);
        assert.match(text, /\nok {7}plain · axe: 1 passed\n/);
        assert.match(text, /\nFAIL {5}rf_rise off · raw HTML: the storefront couldn't be reached, or a port was busy \(its output is above\)\n/);
        assert.match(text, /\nThe matrix failed: 1 of 16 gates\.$/);
    });

    it('passes when every gate of every row passed and the plan has no problem', async () => {
        const results = await runMatrix(plan, {
            env: {}, runPlaywright: () => ({ status: 0, report: passing }), runRawHtml: () => ({ status: 0 }), log: () => {},
        });
        const lines = matrixLines({
            plan, results, channel: '1895766', variation: 'ReelFlies CA', port: 3300,
        });
        assert.equal(lines.at(-1), 'Every gate passed in 2 rows (16 gates).');
    });

    it('fails a plan with a problem, even with every gate passed', () => {
        const broken = { ...plan, problems: ['no overlay renders rf_rise off: …'] };
        const lines = matrixLines({
            plan: broken, results: [], channel: '1895766', variation: 'ReelFlies CA', port: 3300,
        });
        assert.ok(lines.includes('FAIL     no overlay renders rf_rise off: …'));
        assert.equal(lines.at(-1), 'The matrix failed: 1 problem in its plan.');
    });
});

describe('where the matrix runs', () => {
    it('only through local stencil starts that it sets the overlay of itself', () => {
        assert.equal(matrixEnvProblem({}), null);
        assert.equal(matrixEnvProblem({ QA_PORT: '4300' }), null);
        assert.match(matrixEnvProblem({ QA_OVERLAY: 'rf_rise-off' }), /sets QA_OVERLAY itself, row by row/);
        assert.match(matrixEnvProblem({ QA_BASE_URL: 'https://reelflies_ca-1895766.mybigcommerce.com' }), /local stencil start/);
        assert.match(matrixEnvProblem({ QA_FRESH_SERVER: '1' }), /QA_FRESH_SERVER=1/);
    });
});
