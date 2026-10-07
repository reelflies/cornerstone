#!/usr/bin/env node
// A stencil start by hand, under the same cap as the gates (W0-7). Before it starts the server
// it takes the port pair's lock and a stencil start slot, waiting for them as a gate does, and it
// refuses while anything answers on QA_PORT or QA_PORT + 1. It runs stencil start on QA_PORT
// until you stop it (Ctrl-C), then stops the server's whole process group and releases both.
//
//   QA_PORT=3400 node scripts/qa/serve.mjs                                                  # ReelFlies_CA
//   QA_PORT=3400 QA_CHANNEL=1 node scripts/qa/serve.mjs                                     # reelflies.ca's data as "ReelFlies CA channel 1" (read-only)
//   QA_PORT=3400 QA_CHANNEL=1855224 QA_VARIATION="ReelFlies US" node scripts/qa/serve.mjs   # .com's data (read-only)
//   QA_PORT=3400 QA_OVERLAY=rf_rise-off node scripts/qa/serve.mjs                           # an overlay, on 3410 (W0-8)
//
// With QA_OVERLAY it serves the overlay from its throwaway worktree (overlays.mjs), on QA_PORT
// + 10 and the port after it, and removes the worktree when it stops.
//
// Like the gates, it starts from an empty assets/dist and leaves its dev build there, so run
// `rm -rf assets/dist` before you bundle by hand (scripts/qa/README.md).

import { isMain } from '../lib/is-main.mjs';
import {
    IS_LOCAL, LOCAL_URL, QA_OVERLAY, QA_PORT, ROOT, START_COMMAND, checkEnv, claimLocalServer, planLocalServer, startOverlayCheckout, startProcessGroup,
    stopProcessGroup,
} from './storefront.mjs';

// Claims the server (`claim`: the port lock and a slot), starts it (`start`), and once it has
// exited stops what is left of its group (`stop`) and releases the claim. Resolves to the
// server's exit code.
export async function serve({
    claim, start, stop = stopProcessGroup, log = console.log,
}) {
    const claimed = await claim();
    try {
        const server = start();
        log(`SERVING  ${LOCAL_URL} (Browsersync on ${QA_PORT}). Ctrl-C stops it and releases its locks.`);
        const code = await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.once('exit', (exitCode, signal) => resolve(exitCode ?? (signal ? 1 : 0)));
        });
        await stop(server);
        return code;
    } finally {
        claimed.release();
    }
}

async function main() {
    try {
        checkEnv();
        if (!IS_LOCAL) throw new Error('serve.mjs runs a local stencil start, so QA_BASE_URL must be unset');
        console.log(`Starting: ${START_COMMAND}`);
        let overlay = null;
        process.exitCode = await serve({
            claim: () => claimLocalServer({ plan: () => planLocalServer({ fresh: true }) }),
            start: () => {
                if (QA_OVERLAY) overlay = startOverlayCheckout();
                return startProcessGroup(START_COMMAND, { cwd: overlay?.dir ?? ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
            },
            // The overlay's worktree goes with its server, before the locks are released.
            stop: async server => {
                await stopProcessGroup(server);
                overlay?.remove();
            },
        });
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exitCode = 1;
    }
}

if (isMain(import.meta.url)) main();
