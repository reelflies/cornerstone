// Every widget shot has a baseline in every variation the screenshot gates render (ticket 46;
// W0-9). widget-screens.spec.mjs shoots every shot fixture for the run's QA_VARIATION and fails
// when a baseline is missing, so a widget recorded for ReelFlies CA alone passes its own PR's
// 1895766 run and then fails every `QA_CHANNEL=1 npm run qa:screens`: checkpoint step 2 on
// master, and section 7 step 5 on every branch that merges it. CI renders nothing, so this
// checks the files instead.
//
// The variations are those of the channels that keep page baselines (scripts/qa/baselines/
// <channel>-<variation>/), each run as its own (pages.mjs, defaultVariation): ReelFlies CA on
// 1895766 and ReelFlies CA channel 1 on channel 1. reelflies.com (1855224) has no baselines and
// no gate runs on it, so it needs no widget shots.
//
//   node --test scripts/qa/widget-baselines.test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHANNELS, defaultVariation } from './pages.mjs';
import { ROOT, slug } from './storefront.mjs';
import { WIDGETS_DIR, widgetCases } from './render/render.mjs';
import { SELFTEST_WIDGETS } from './render/widget-page.mjs';

const BASELINES = path.join(ROOT, 'scripts/qa/baselines');
// playwright.config.mjs's projects, and the platform the baselines are made on (HANDOFF).
const PROJECTS = ['phone-375', 'desktop-1280'];
const PLATFORM = 'darwin';

const gatedVariations = () => [...new Set(Object.keys(CHANNELS)
    .filter(channel => fs.existsSync(path.join(BASELINES, `${channel}-${slug(defaultVariation(channel))}`)))
    .map(channel => defaultVariation(channel)))].sort();

describe('widget shot baselines', () => {
    it('are kept for ReelFlies CA and ReelFlies CA channel 1, the variations the gates render', () => {
        assert.deepEqual(gatedVariations(), ['ReelFlies CA', 'ReelFlies CA channel 1']);
    });

    it('exist for every shot fixture, in every gated variation, at both widths', () => {
        const cases = widgetCases([WIDGETS_DIR, SELFTEST_WIDGETS]).filter(({ shot }) => shot);
        assert.ok(cases.some(({ widget }) => widget === 'home-lead'), 'the hero has a shot fixture');
        const missing = gatedVariations().flatMap(variation => cases.flatMap(({ widget, name }) => PROJECTS
            .map(project => path.join(BASELINES, 'widgets', slug(variation), `${widget}-${name}-${project}-${PLATFORM}.png`))
            .filter(file => !fs.existsSync(file))
            .map(file => path.relative(ROOT, file))));
        assert.deepEqual(missing, [], 'record each with `QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs widget-screens -g \'widget <name>\' --update-snapshots`');
    });
});
