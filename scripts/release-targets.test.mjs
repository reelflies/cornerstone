import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPushArgs, CONFIRM_NONPROD, CONFIRM_TYPED, findTarget, RELEASE_TARGETS,
} from './release-targets.mjs';

test('the push command names one zip, one variation and one channel', () => {
    assert.deepEqual(
        buildPushArgs({ zip: 'reelflies-ca-6.22.0-abc1234.zip', variation: 'ReelFlies CA', channel: 1895766 }),
        ['push', '-f', 'reelflies-ca-6.22.0-abc1234.zip', '-a', 'ReelFlies CA', '-c', '1895766'],
    );
});

test('the push command never deletes themes or targets every channel', () => {
    const args = buildPushArgs({ zip: 'x.zip', variation: 'ReelFlies CA', channel: '1895766' });
    for (const flag of ['-d', '--delete', '-allc', '--all_channels']) assert.ok(!args.includes(flag), flag);
    assert.equal(args.filter(arg => arg === '-c').length, 1);
    assert.equal(args.at(-1), '1895766', 'the channel comes last, so the variadic -c takes only it');
});

test('the push command refuses a channel list, a missing variation or a missing zip', () => {
    assert.throws(() => buildPushArgs({ zip: 'x.zip', variation: 'ReelFlies CA', channel: '1895766,1' }), /one channel/);
    assert.throws(() => buildPushArgs({ zip: 'x.zip', variation: 'ReelFlies CA', channel: [1895766, 1] }), /one channel/);
    assert.throws(() => buildPushArgs({ zip: 'x.zip', variation: '', channel: 1895766 }), /variation/);
    assert.throws(() => buildPushArgs({ zip: '', variation: 'ReelFlies CA', channel: 1895766 }), /zip/);
});

test('ReelFlies_CA is a release target for the ReelFlies CA variation', () => {
    const target = findTarget(1895766);
    assert.equal(target.name, 'ReelFlies_CA');
    assert.deepEqual(target.variations, ['ReelFlies CA']);
    assert.equal(target.liveFile, 'config.ca.live.json');
});

test('live reelflies.ca, reelflies.com and unknown channels are refused, each with its reason', () => {
    assert.throws(() => findTarget(1), /ticket 53/);
    assert.throws(() => findTarget(1855224), /\.com stays on its own theme/);
    assert.throws(() => findTarget(42), /not a release target/);
});

// --- W0-1: production flags and confirmation modes ---------------------------------------------

test('W0-1: every target declares production and its confirmation modes; a production target is typed only', () => {
    for (const [id, target] of Object.entries(RELEASE_TARGETS)) {
        assert.equal(typeof target.production, 'boolean', `channel ${id} declares production: true|false`);
        assert.ok(Array.isArray(target.confirmation) && target.confirmation.includes(CONFIRM_TYPED), `channel ${id} can always be confirmed by typing`);
        assert.deepEqual(target.confirmation.filter(mode => ![CONFIRM_TYPED, CONFIRM_NONPROD].includes(mode)), [], `channel ${id} has only known modes`);
        if (target.production) assert.deepEqual(target.confirmation, [CONFIRM_TYPED], `production channel ${id} is typed only`);
    }
});

test('W0-1: ReelFlies_CA is non-production while it is prelaunch, takes --confirm-nonprod, and becomes live reelflies.ca at the Flip', () => {
    const target = findTarget(1895766);
    assert.equal(target.production, false);
    assert.deepEqual(target.confirmation, [CONFIRM_TYPED, CONFIRM_NONPROD]);
    assert.equal(target.liveFromFlip, true);
});
