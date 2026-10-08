import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    buildPushArgs, CONFIRM_NONPROD, CONFIRM_TYPED, findTarget, RELEASE_TARGETS,
} from './release-targets.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

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

test('reelflies.com and unknown channels are refused, each with its reason', () => {
    assert.throws(() => findTarget(1855224), /\.com stays on its own theme/);
    assert.throws(() => findTarget(42), /not a release target/);
});

// --- Ticket 53: the guarded channel-1 target (Option A) ------------------------------------------

test('ticket 53: live reelflies.ca (channel 1) is a target for "ReelFlies CA channel 1" only, with its own capture file and bundle name', () => {
    const target = findTarget(1);
    assert.equal(target.id, 1);
    assert.equal(target.name, 'reelflies.ca');
    assert.deepEqual(target.variations, ['ReelFlies CA channel 1']);
    assert.equal(target.slug, 'ca-channel-1');
    assert.equal(target.liveFile, 'config.ca-channel-1.live.json');
    // The capture holds the live settings (Cavio's held a token), so git must ignore it.
    assert.equal(spawnSync('git', ['check-ignore', '-q', '--no-index', target.liveFile], { cwd: ROOT }).status, 0, `.gitignore ignores ${target.liveFile}`);
    assert.notEqual(target.liveFile, findTarget(1895766).liveFile);
    assert.notEqual(target.slug, findTarget(1895766).slug);
});

test('ticket 53: channel 1 is production and typed only, and never becomes an agent target at the Flip', () => {
    const target = findTarget('1');
    assert.equal(target.production, true);
    assert.deepEqual(target.confirmation, [CONFIRM_TYPED]);
    assert.equal(Boolean(target.liveFromFlip), false, 'liveFromFlip is for a non-production target that goes live at the Flip');
    assert.ok(!findTarget(1895766).variations.includes('ReelFlies CA channel 1'), 'the channel-1 variation never goes to ReelFlies_CA');
});

test('ticket 53: channel 1 and 1895766 are the only targets, so a new one is a reviewed change to this test', () => {
    assert.deepEqual(Object.keys(RELEASE_TARGETS).map(Number).sort((a, b) => a - b), [1, 1895766]);
    const production = Object.entries(RELEASE_TARGETS).filter(([, target]) => target.production !== false).map(([id]) => Number(id));
    assert.deepEqual(production, [1]);
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

test('W0-1: 1895766 is the only target that takes --confirm-nonprod, so a new non-production target is a reviewed change to this test', () => {
    const nonprod = Object.entries(RELEASE_TARGETS).filter(([, target]) => target.confirmation.includes(CONFIRM_NONPROD)).map(([id]) => Number(id));
    assert.deepEqual(nonprod, [1895766]);
    const notProduction = Object.entries(RELEASE_TARGETS).filter(([, target]) => target.production === false).map(([id]) => Number(id));
    assert.deepEqual(notProduction, [1895766]);
});
