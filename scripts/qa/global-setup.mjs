// Runs once before the Playwright gates: a reused local server must render QA_CHANNEL,
// or its screenshots would be compared with, or written as, another channel's baselines.

import { assertLocalChannel } from './storefront.mjs';

export default async function globalSetup() {
    await assertLocalChannel();
}
