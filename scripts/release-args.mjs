// Reads scripts/release.sh's arguments and refuses anything but one channel and one named
// variation (tickets 05 and 15), and --confirm-nonprod that doesn't name that channel (W0-1). Pure:
// no network, no files. Whether the target and the release calendar allow --confirm-nonprod is
// release-checks.mjs's confirmNonprodRefusals. W0-3's --prune-only runs on its own, with only
// --dry-run (parsePruneArgs).
//
//   import { parseReleaseArgs, resolveTarget, USAGE } from './release-args.mjs';
//   import { parsePruneArgs, PRUNE_USAGE } from './release-args.mjs'; // W0-3
//
// Each refusal throws an Error whose message is the one-line reason the operator sees.

import { findTarget } from './release-targets.mjs';

export const USAGE = 'scripts/release.sh --channel <id> --variation "<name>" [--dry-run] [--first-release] [--accept-live | --overwrite-live] [--confirm-nonprod <id>]';
export const PRUNE_USAGE = 'scripts/release.sh --prune-only [--dry-run]';

// Flags that take no value (not the rf_* module switches, which the release guard checks).
const BOOLEAN_FLAGS = {
    '--dry-run': 'dryRun',
    '--first-release': 'firstRelease',
    '--accept-live': 'acceptLive',
    '--overwrite-live': 'overwriteLive',
};
const VALUE_FLAGS = { '--channel': 'channels', '--variation': 'variations', '--confirm-nonprod': 'confirmNonprods' };

// stencil push flags (and look-alikes) that must never reach a release.
const ALL_CHANNELS = 'pushing to all channels is never allowed: name one channel with --channel <id>';
const ACTIVATE = 'name the variation with --variation "<name>" (a bare -a activates whichever variation comes first)';
const DELETE = `the release never deletes themes with stencil push -d: old ReelFlies builds are pruned after each push, or with ${PRUNE_USAGE} (W0-3)`;
const FORBIDDEN = {
    '-allc': ALL_CHANNELS,
    '--all-channels': ALL_CHANNELS,
    '--all_channels': ALL_CHANNELS,
    '-a': ACTIVATE,
    '--activate': ACTIVATE,
    '-d': DELETE,
    '--delete': DELETE,
    '-c': 'name the channel with --channel <id>',
    '--channel_ids': 'name the channel with --channel <id>',
    // W0-3 builds an upload mode only if a 1895766 push's uuid doesn't preview on reelflies.com.
    '--upload-only': 'there is no upload mode: each push to 1895766 already puts its build in My Themes, where reelflies.com can preview it. W0-3 adds --upload-only only if that build doesn\'t preview there (W0-1\'s watched push)',
};
const PRUNE_ALONE = `--prune-only runs on its own: ${PRUNE_USAGE}, with no channel, variation or other flag (My Themes is store-wide)`;

function splitFlag(arg) {
    const equals = arg.indexOf('=');
    return arg.startsWith('--') && equals > 0 ? [arg.slice(0, equals), arg.slice(equals + 1)] : [arg, undefined];
}

function readFlags(argv) {
    const found = { channels: [], variations: [], confirmNonprods: [] };
    for (let i = 0; i < argv.length; i++) {
        const [flag, inline] = splitFlag(argv[i]);
        if (FORBIDDEN[flag]) throw new Error(`${flag}: ${FORBIDDEN[flag]}`);
        if (flag === '--prune-only') throw new Error(PRUNE_ALONE);
        if (BOOLEAN_FLAGS[flag]) {
            if (inline !== undefined) throw new Error(`${flag} takes no value`);
            found[BOOLEAN_FLAGS[flag]] = true;
        } else if (VALUE_FLAGS[flag]) {
            let value = inline;
            if (value === undefined) {
                const next = argv[i + 1];
                value = next === undefined || next.startsWith('--') ? '' : next;
                if (next !== undefined && !next.startsWith('--')) i++;
            }
            found[VALUE_FLAGS[flag]].push(value);
        } else if (flag.startsWith('-')) {
            throw new Error(`unknown flag ${flag}`);
        } else {
            throw new Error(`unexpected argument "${flag}"`);
        }
    }
    return found;
}

// The channel id is taken only as written canonically: its digits alone, with no space or leading
// zero (ticket 53). Claude Code's deny rules match a command's text, so "--channel 01" or
// "--channel ' 1'" mustn't stand for channel 1 where a rule for "--channel 1" wouldn't match.
function readChannel(channels) {
    if (!channels.length) throw new Error('name one channel with --channel <id>');
    if (channels.length > 1) throw new Error(`one channel per release: --channel was given ${channels.length} times`);
    const written = channels[0];
    const channel = written.trim();
    if (/[\s,;]/.test(channel)) throw new Error(`one channel per release: "${channel}" is a list`);
    if (!/^\d+$/.test(channel)) throw new Error(`"${channel}" isn't a channel id`);
    if (!/^[1-9]\d*$/.test(written)) throw new Error(`--channel "${written}" isn't a channel id as written: give the id's digits alone, with no space or leading zero`);
    return Number(channel);
}

function readVariation(variations) {
    if (!variations.length) throw new Error('name the variation with --variation "<name>"');
    if (variations.length > 1) throw new Error(`one variation per release: --variation was given ${variations.length} times`);
    if (!variations[0].trim()) throw new Error('--variation is empty: name the variation with --variation "<name>"');
    return variations[0];
}

// W0-1: --confirm-nonprod <channel> stands in for step 5's typed channel id. Its value must be
// --channel's, so the flag confirms only the channel the release targets. Returns null without it.
function readConfirmNonprod(values, channel) {
    if (!values.length) return null;
    if (values.length > 1) throw new Error(`one confirmation per release: --confirm-nonprod was given ${values.length} times`);
    const value = values[0].trim();
    if (!value) throw new Error(`--confirm-nonprod needs the channel id: --confirm-nonprod ${channel}, the same as --channel`);
    if (!/^\d+$/.test(value)) throw new Error(`--confirm-nonprod: "${value}" isn't a channel id`);
    if (Number(value) !== channel) throw new Error(`--confirm-nonprod ${value} isn't --channel ${channel}: it confirms only the channel this release targets`);
    return channel;
}

export function parseReleaseArgs(argv) {
    const found = readFlags(argv);
    const channel = readChannel(found.channels);
    const options = {
        channel,
        variation: readVariation(found.variations),
        dryRun: Boolean(found.dryRun),
        firstRelease: Boolean(found.firstRelease),
        acceptLive: Boolean(found.acceptLive),
        overwriteLive: Boolean(found.overwriteLive),
        confirmNonprod: readConfirmNonprod(found.confirmNonprods, channel),
    };
    if (options.acceptLive && options.overwriteLive) throw new Error('use either --accept-live or --overwrite-live, not both');
    if (options.firstRelease && (options.acceptLive || options.overwriteLive)) {
        throw new Error('--first-release can\'t be combined with --accept-live or --overwrite-live: a first release has no diff to accept or overwrite');
    }
    // Overwriting a control-panel edit and replacing another theme stay a person's choices.
    for (const [flag, set] of [['--overwrite-live', options.overwriteLive], ['--first-release', options.firstRelease]]) {
        if (options.confirmNonprod !== null && set) {
            throw new Error(`--confirm-nonprod can't be combined with ${flag}: that choice stays with a person, who types the channel id at the terminal`);
        }
    }
    return options;
}

// --- W0-3: --prune-only --------------------------------------------------------------------

// `--prune-only [--dry-run]`, and nothing else: the prune is store-wide, so it names no channel or
// variation. Returns { pruneOnly: true, dryRun }.
export function parsePruneArgs(argv) {
    const seen = { '--prune-only': 0, '--dry-run': 0 };
    for (const arg of argv) {
        const [flag, inline] = splitFlag(arg);
        if (FORBIDDEN[flag]) throw new Error(`${flag}: ${FORBIDDEN[flag]}`);
        if (flag in seen) {
            if (inline !== undefined) throw new Error(`${flag} takes no value`);
            seen[flag] += 1;
            if (seen[flag] > 1) throw new Error(`${flag} was given ${seen[flag]} times`);
        } else if (flag.startsWith('-')) {
            throw new Error(`--prune-only takes only --dry-run: it prunes My Themes, which is store-wide, so it names no channel or variation (${flag})`);
        } else {
            throw new Error(`unexpected argument "${flag}"`);
        }
    }
    if (!seen['--prune-only']) throw new Error(`this isn't a prune: ${PRUNE_USAGE}`);
    return { pruneOnly: true, dryRun: seen['--dry-run'] === 1 };
}

// Checks the variation against config.json and the channel against the release targets.
export function resolveTarget({ channel, variation }, config) {
    const names = (config.variations || []).map(item => item.name);
    if (!names.includes(variation)) throw new Error(`"${variation}" isn't a variation in config.json (variations: ${names.join(', ')})`);
    const target = findTarget(channel);
    if (!target.variations.includes(variation)) {
        throw new Error(`"${variation}" isn't released to channel ${channel}: ${target.name} takes ${target.variations.map(name => `"${name}"`).join(', ')}`);
    }
    return target;
}
