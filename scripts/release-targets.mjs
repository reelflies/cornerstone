// The storefront channels scripts/release.sh may push to, and the exact push command (ticket 05).
//
//   import { findTarget, buildPushArgs } from './release-targets.mjs';
//
// Deny by default: a channel that isn't in RELEASE_TARGETS is refused. Every push is to one
// channel with one named variation, and never deletes a theme (-d) or targets all channels (-allc).

// How step 5 may be confirmed (W0-1): the operator types the channel id at the terminal, or, on a
// non-production target only, --confirm-nonprod <channel> stands in for the typing (an agent's push).
export const CONFIRM_TYPED = 'typed';
export const CONFIRM_NONPROD = 'nonprod';

// Channel id -> target. `slug` names the bundle and the live capture file.
//   production     true for a channel shoppers use. A production target is confirmed only by typing,
//                  and a target that doesn't say `production: false` counts as one (W0-1).
//   confirmation   the ways step 5 may be confirmed: [CONFIRM_TYPED], plus CONFIRM_NONPROD on a
//                  non-production target.
//   liveFromFlip   the channel becomes live reelflies.ca at the Flip, so --confirm-nonprod is refused
//                  there from the Flip whatever `production` says (W0-1; ticket 57 marks it production
//                  that day). Ticket 53's channel-1 entry will be production: true, typed only.
export const RELEASE_TARGETS = {
    1895766: {
        name: 'ReelFlies_CA',
        slug: 'ca',
        variations: ['ReelFlies CA'],
        liveFile: 'config.ca.live.json',
        production: false, // prelaunch until the Flip
        confirmation: [CONFIRM_TYPED, CONFIRM_NONPROD],
        liveFromFlip: true,
    },
};

// Channels that are refused on purpose, with the reason the operator sees.
const REFUSED_CHANNELS = {
    1: 'channel 1 is live reelflies.ca: it is pushed only through ticket 53\'s guarded channel-1 target, which doesn\'t exist yet',
    1855224: 'channel 1855224 is reelflies.com: .com stays on its own theme until it moves to the fork (out of scope)',
};

const isOneChannelId = channel => /^\d+$/.test(String(channel));

export function findTarget(channel) {
    if (!isOneChannelId(channel)) throw new Error(`"${channel}" isn't a channel id: name exactly one channel`);
    const id = Number(channel);
    if (REFUSED_CHANNELS[id]) throw new Error(REFUSED_CHANNELS[id]);
    const target = RELEASE_TARGETS[id];
    if (!target) throw new Error(`channel ${id} is not a release target (targets: ${Object.keys(RELEASE_TARGETS).join(', ')})`);
    return { id, ...target };
}

// The arguments for `npx stencil`. -c is variadic in stencil-cli, so it goes last.
export function buildPushArgs({ zip, variation, channel }) {
    if (!zip) throw new Error('the push needs a bundle zip');
    if (!variation) throw new Error('the push needs a named variation');
    if (Array.isArray(channel) || !isOneChannelId(channel)) throw new Error('the push needs exactly one channel id');
    return ['push', '-f', zip, '-a', variation, '-c', String(channel)];
}
