// release.sh's arguments (tickets 05 and 15; W0-1's --confirm-nonprod). release-sh.test.mjs runs
// each refusal through release.sh itself; these check what parseReleaseArgs returns.

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReleaseArgs, USAGE } from './release-args.mjs';

const CA = ['--channel', '1895766', '--variation', 'ReelFlies CA'];

test('without --confirm-nonprod, the release is confirmed by typing the channel id, as before W0-1', () => {
    assert.deepEqual(parseReleaseArgs([...CA, '--dry-run']), {
        channel: 1895766,
        variation: 'ReelFlies CA',
        dryRun: true,
        firstRelease: false,
        acceptLive: false,
        overwriteLive: false,
        confirmNonprod: null,
    });
});

test('W0-1: --confirm-nonprod <channel> is read as a channel id, with a space or an equals sign', () => {
    assert.equal(parseReleaseArgs([...CA, '--confirm-nonprod', '1895766']).confirmNonprod, 1895766);
    assert.equal(parseReleaseArgs([...CA, '--confirm-nonprod=1895766']).confirmNonprod, 1895766);
    assert.equal(parseReleaseArgs(['--confirm-nonprod', '1895766', ...CA, '--dry-run']).dryRun, true);
});

test('W0-1: --confirm-nonprod refuses a missing, repeated or different channel, and a list', () => {
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod']), /--confirm-nonprod needs the channel id: --confirm-nonprod 1895766/);
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', '--dry-run']), /--confirm-nonprod needs the channel id/);
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', '1895766', '--confirm-nonprod', '1895766']), /--confirm-nonprod was given 2 times/);
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', '1855224']), /--confirm-nonprod 1855224 isn't --channel 1895766/);
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', '1895766,1']), /"1895766,1" isn't a channel id/);
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', 'yes']), /"yes" isn't a channel id/);
});

test('W0-1: --confirm-nonprod is refused with --overwrite-live or --first-release, because those choices stay with a person', () => {
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', '1895766', '--overwrite-live']), /--confirm-nonprod can't be combined with --overwrite-live/);
    assert.throws(() => parseReleaseArgs([...CA, '--confirm-nonprod', '1895766', '--first-release']), /--confirm-nonprod can't be combined with --first-release/);
});

test('W0-1: the usage line names --confirm-nonprod', () => {
    assert.match(USAGE, /\[--confirm-nonprod <id>\]/);
});
