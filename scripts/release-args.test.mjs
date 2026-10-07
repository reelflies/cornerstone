// release.sh's arguments (tickets 05 and 15; W0-1's --confirm-nonprod). release-sh.test.mjs runs
// each refusal through release.sh itself; these check what parseReleaseArgs returns.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parsePruneArgs, parseReleaseArgs, PRUNE_USAGE, USAGE,
} from './release-args.mjs';

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

// --- W0-3: --prune-only ------------------------------------------------------------------------

test('W0-3: --prune-only runs on its own, with or without --dry-run', () => {
    assert.deepEqual(parsePruneArgs(['--prune-only']), { pruneOnly: true, dryRun: false });
    assert.deepEqual(parsePruneArgs(['--dry-run', '--prune-only']), { pruneOnly: true, dryRun: true });
    assert.match(PRUNE_USAGE, /^scripts\/release\.sh --prune-only \[--dry-run\]$/);
});

test('W0-3: --prune-only takes no channel, variation or other flag: My Themes is store-wide', () => {
    assert.throws(() => parsePruneArgs(['--prune-only', ...CA]), /--prune-only takes only --dry-run/);
    assert.throws(() => parsePruneArgs(['--prune-only', '--confirm-nonprod', '1895766']), /--prune-only takes only --dry-run/);
    assert.throws(() => parsePruneArgs(['--prune-only', '--first-release']), /--prune-only takes only --dry-run/);
    assert.throws(() => parsePruneArgs(['--prune-only', '-d']), /stencil push -d/);
    assert.throws(() => parsePruneArgs(['--prune-only', '-allc']), /all channels/);
    assert.throws(() => parsePruneArgs(['--prune-only=yes']), /--prune-only takes no value/);
    assert.throws(() => parsePruneArgs(['--prune-only', '--prune-only']), /--prune-only was given 2 times/);
    assert.throws(() => parsePruneArgs(['--prune-only', 'now']), /unexpected argument "now"/);
    assert.throws(() => parsePruneArgs(['--dry-run']), /--prune-only/);
});

test('W0-3: a release refuses --prune-only among its arguments, and there is no upload mode', () => {
    assert.throws(() => parseReleaseArgs([...CA, '--prune-only']), /--prune-only runs on its own: scripts\/release\.sh --prune-only \[--dry-run\]/);
    assert.throws(() => parseReleaseArgs([...CA, '--prune-only=1']), /--prune-only runs on its own/);
    assert.throws(() => parseReleaseArgs([...CA, '--upload-only']), /there is no upload mode.*W0-1's watched push/);
    assert.throws(() => parsePruneArgs(['--prune-only', '--upload-only']), /there is no upload mode/);
});
