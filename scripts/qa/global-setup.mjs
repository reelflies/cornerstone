// Runs once before the Playwright gates, after the webServer: the local server, reused or
// just started, must render QA_CHANNEL and QA_VARIATION, or its screenshots would be
// compared with, or written as, another set's baselines. Then it says whether the run blocks
// the analytics tags and refuses writes (W0-6).

import { analyticsMode } from './analytics-hosts.mjs';
import { guardNotice, refusesWrites } from './network-guard.mjs';
import {
    BASE_URL, IS_LOCAL, QA_CHANNEL, assertLocalServer,
} from './storefront.mjs';

export default async function globalSetup() {
    await assertLocalServer();
    const run = { channel: QA_CHANNEL, storefront: BASE_URL, local: IS_LOCAL };
    guardNotice({ ...run, blockAnalytics: analyticsMode().blocked, refuseWrites: refusesWrites(run) }).forEach(line => console.log(line));
}
