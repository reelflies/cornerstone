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
//   scripts/qa/storefront.mjs decides, on QA_PORT and QA_PORT + 1 (3300 and 3301 by default).
//   Each holds the port pair's lock while it runs, and a stencil start slot while its server
//   runs (W0-7).
// - With QA_FRESH_SERVER=1 nothing starts while anything answers on those ports, and after
//   each gate its server must be gone, with both ports free, before the next one starts. A busy
//   port stops the run at once, unless another gate run holds that port pair: then each gate
//   waits for its lock (prepushStart).

import { spawnSync } from 'child_process';
import { describeHolder, heldBy, portLockName } from '../lib/lock.mjs';
import { isMain } from '../lib/is-main.mjs';
import {
    FRESH_SERVER, IS_LOCAL, QA_CHANNEL, QA_PORT, QA_VARIATION, checkEnv, planLocalServer, waitForFreePorts,
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

// What the run does before its first gate, from QA_BASE_URL (`local`), QA_FRESH_SERVER
// (`fresh`), the gate run holding this port pair's lock, if any (`holder()`), and the port
// check (`plan()`: planLocalServer, which throws naming a busy port):
//   'none'     nothing to check: a remote host, or a run that may reuse a server
//   'wait'     another gate run holds the port pair, so its server answering there is expected;
//              each gate waits for the lock and checks the ports then
//   'checked'  no gate run holds them, and nothing answers on them
// A busy port that no gate run holds rejects, so the run stops before its first gate.
export async function prepushStart({
    local, fresh, holder, plan,
}) {
    if (!local || !fresh) return { action: 'none' };
    const held = holder();
    if (held) return { action: 'wait', holder: held };
    await plan();
    return { action: 'checked' };
}

// The environment each gate runs in: this one, without RF_QA_PORTS_CHECKED. Only a Playwright
// runner sets that, for its own workers; inherited from a shell, it would let a gate's runner
// skip its port lock and stencil start slot.
export const gateEnv = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([name]) => name !== 'RF_QA_PORTS_CHECKED'));

async function runNpmGate(gate) {
    console.log(`\n-- Storefront gate: ${gate.name} (npm run ${gate.script})\n`);
    const { status, signal } = spawnSync('npm', ['run', gate.script], { stdio: 'inherit', env: gateEnv() });
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
        const start = await prepushStart({
            local: IS_LOCAL, fresh: FRESH_SERVER, holder: () => heldBy(portLockName(QA_PORT)), plan: () => planLocalServer(),
        });
        if (start.action === 'wait') console.log(`WAIT     port ${QA_PORT} is in use by ${describeHolder(start.holder)}; each gate waits for it`);
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exit(1);
    }

    const { ok, lines } = summary(await runGates(GATES, runNpmGate));
    console.log(`\nStorefront gates on channel ${QA_CHANNEL}, "${QA_VARIATION}"${IS_LOCAL ? `, port ${QA_PORT}` : ''}${FRESH_SERVER ? ', each on a fresh stencil start' : ''}:`);
    lines.forEach(line => console.log(line));
    process.exit(ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
