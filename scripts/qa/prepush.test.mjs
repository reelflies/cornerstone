// The storefront gates before a push (scripts/qa/prepush.mjs): axe, the raw-HTML check and
// the screenshot diffs, every one of them even when one before it fails, and a run that
// fails if any of them failed.
//
//   node --test scripts/qa/prepush.test.mjs

import { it } from 'node:test';
import assert from 'node:assert/strict';
import { GATES, runGates, summary } from './prepush.mjs';

it('runs axe, then the raw-HTML check, then the screenshot diffs', () => {
    assert.deepEqual(GATES.map(gate => gate.script), ['qa:axe', 'qa:raw-html', 'qa:screens']);
});

it('runs every gate even when the ones before it fail', async () => {
    const ran = [];
    const results = await runGates(GATES, async gate => {
        ran.push(gate.script);
        return gate.script === 'qa:screens' ? [] : [`npm run ${gate.script} exited 1`];
    });
    assert.deepEqual(ran, ['qa:axe', 'qa:raw-html', 'qa:screens']);
    assert.deepEqual(results.map(({ script, problems }) => [script, problems.length]), [['qa:axe', 1], ['qa:raw-html', 1], ['qa:screens', 0]]);
});

it('fails when any gate failed, and names it', async () => {
    const results = await runGates(GATES, async gate => (gate.script === 'qa:screens' ? ['npm run qa:screens exited 1'] : []));
    const { ok, lines } = summary(results);
    assert.equal(ok, false);
    assert.deepEqual(lines, [
        'ok       axe',
        'ok       raw HTML',
        'FAIL     screenshots: npm run qa:screens exited 1',
    ]);
});

it('passes only when every gate passed', async () => {
    assert.equal(summary(await runGates(GATES, async () => [])).ok, true);
});
