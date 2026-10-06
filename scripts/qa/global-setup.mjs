// Runs once before the Playwright gates, after the webServer: the local server, reused or
// just started, must render QA_CHANNEL and QA_VARIATION, or its screenshots would be
// compared with, or written as, another set's baselines.

import { assertLocalServer } from './storefront.mjs';

export default async function globalSetup() {
    await assertLocalServer();
}
