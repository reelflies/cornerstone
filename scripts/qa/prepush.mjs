#!/usr/bin/env node
// The storefront gates before each push (ticket 16, "Where each gate runs"): axe, the
// raw-HTML check and the screenshot diffs, in that order. release.sh runs this in step 4,
// on the release's channel and variation, with QA_FRESH_SERVER=1.
//
//   npm run qa:prepush
//   QA_FRESH_SERVER=1 QA_CHANNEL=1895766 QA_VARIATION="ReelFlies CA" npm run qa:prepush
//
// - Every gate runs, even when one before it failed, so one run shows everything that
//   would stop the push. The run exits 1 if any gate failed.
// - Each gate uses its own local stencil start, or reuses a running one, as
//   scripts/qa/storefront.mjs decides.
// - With QA_FRESH_SERVER=1 nothing starts while anything answers on 3300 or 3301, and after
//   each gate its server must be gone, with both ports free, before the next one starts.

import { spawnSync } from 'child_process';
import { isMain } from '../lib/is-main.mjs';
import {
    FRESH_SERVER, IS_LOCAL, QA_CHANNEL, QA_VARIATION, checkEnv, planLocalServer, waitForFreePorts,
} from './storefront.mjs';

export const GATES = [
    { name: 'axe', script: 'qa:axe' },
    { name: 'raw HTML', script: 'qa:raw-html' },
    { name: 'screenshots', script: 'qa:screens' },
];

// Runs each gate in turn, whatever the ones before it did. runGate(gate) resolves to the
// gate's problems, empty when it passed.
export async function runGates(gates, runGate) {
    const results = [];
    for (const gate of gates) {
        results.push({ ...gate, problems: await runGate(gate) }); // eslint-disable-line no-await-in-loop
    }
    return results;
}

export function summary(results) {
    return {
        ok: results.every(({ problems }) => !problems.length),
        lines: results.map(({ name, problems }) => (problems.length ? `FAIL     ${name}: ${problems.join('; ')}` : `ok       ${name}`)),
    };
}

async function runNpmGate(gate) {
    console.log(`\n-- Storefront gate: ${gate.name} (npm run ${gate.script})\n`);
    const { status, signal } = spawnSync('npm', ['run', gate.script], { stdio: 'inherit' });
    const problems = status === 0 ? [] : [`npm run ${gate.script} ${signal ? `stopped on ${signal}` : `exited ${status}`}`];
    if (IS_LOCAL && FRESH_SERVER) {
        const left = await waitForFreePorts();
        if (left.length) problems.push(`something still answers on port ${left.join(' and ')} after it finished`);
    }
    return problems;
}

async function main() {
    try {
        checkEnv();
        if (IS_LOCAL && FRESH_SERVER) await planLocalServer();
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exit(1);
    }

    const { ok, lines } = summary(await runGates(GATES, runNpmGate));
    console.log(`\nStorefront gates on channel ${QA_CHANNEL}, "${QA_VARIATION}"${FRESH_SERVER ? ', each on a fresh stencil start' : ''}:`);
    lines.forEach(line => console.log(line));
    process.exit(ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
