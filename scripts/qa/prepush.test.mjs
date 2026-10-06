// The storefront gates before a push (scripts/qa/prepush.mjs): axe, the raw-HTML check and
// the screenshot diffs, every one of them even when one before it fails, and a run that
// fails if any of them failed. With QA_FRESH_SERVER=1 it stops at once on a busy port, unless
// another gate run holds that port pair (W0-7): then each gate waits for it.
//
//   node --test scripts/qa/prepush.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    GATES, gateEnv, prepushStart, runGates, summary,
} from './prepush.mjs';

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

describe('before the first gate', () => {
    const never = async () => { throw new Error('the ports were checked'); };
    const other = { owner: 'the gates on port 3400 in /worktrees/t25', pid: 4242 };

    it('checks nothing on a remote host, or when a run may reuse a server', async () => {
        assert.deepEqual(await prepushStart({
            local: false, fresh: true, holder: () => other, plan: never,
        }), { action: 'none' });
        assert.deepEqual(await prepushStart({
            local: true, fresh: false, holder: () => other, plan: never,
        }), { action: 'none' });
    });

    it('waits, without checking the ports, while another gate run holds this port pair', async () => {
        assert.deepEqual(await prepushStart({
            local: true, fresh: true, holder: () => other, plan: never,
        }), { action: 'wait', holder: other });
    });

    it('checks the ports when no run holds them', async () => {
        let checked = 0;
        const start = await prepushStart({
            local: true, fresh: true, holder: () => null, plan: async () => { checked += 1; return 'start'; },
        });
        assert.deepEqual(start, { action: 'checked' });
        assert.equal(checked, 1);
    });

    it('stops at once on a busy port that no gate run holds, naming it', async () => {
        const busy = async () => { throw new Error('QA_FRESH_SERVER=1, and something already answers on port 3401.'); };
        await assert.rejects(prepushStart({
            local: true, fresh: true, holder: () => null, plan: busy,
        }), /already answers on port 3401/);
    });
});

it('runs each gate without an RF_QA_PORTS_CHECKED from the shell, so its Playwright runner always takes its locks', () => {
    const env = gateEnv({
        PATH: '/usr/bin', QA_PORT: '3400', QA_FRESH_SERVER: '1', RF_QA_PORTS_CHECKED: '1',
    });
    assert.deepEqual(env, { PATH: '/usr/bin', QA_PORT: '3400', QA_FRESH_SERVER: '1' });
});
