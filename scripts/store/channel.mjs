// The channel check (W0-11): a store API token can't be limited to one channel, so the helper
// holds the line itself. Every lifted write names ReelFlies_CA (1895766), and a response that
// names any other channel stops the run.
//
//   import { CHANNEL, requestChannelProblems, responseChannelProblems } from './channel.mjs';
//
// - Widgets, widget templates, placements, Web Pages and scripts carry channel_id in their body,
//   as a number (each item of an array body). Without it BigCommerce puts the object on the
//   store's first channel, which is live reelflies.ca (HANDOFF; ticket 46).
// - A settings write carries channel_id=1895766 in its query and nowhere else. Without it, the
//   write changes the global value, which reaches .com and channel 1.
// - Any channel named anywhere else in a body (channel_id, channel_ids, channels) must be 1895766.

export const CHANNEL = 1895766;
// The live channels: reelflies.ca and reelflies.com. Part 3 of ticket 21's test reads them.
export const LIVE_CHANNELS = [1, 1855224];

const CHANNEL_KEYS = ['channel_id', 'channel_ids', 'channels'];
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const show = value => (typeof value === 'number' ? String(value) : JSON.stringify(value));

// Every channel a JSON value names, at any depth, as written: channel_id values, channel_ids
// items, and channels items (a number, or an object's id or channel_id). Text never counts.
export function channelsNamed(value) {
    const found = [];
    const walk = node => {
        if (Array.isArray(node)) {
            node.forEach(walk);
            return;
        }
        if (!isObject(node)) return;
        for (const [key, child] of Object.entries(node)) {
            if (key === 'channel_id') {
                found.push(child);
            } else if (key === 'channel_ids' && Array.isArray(child)) {
                found.push(...child);
            } else if (key === 'channels' && Array.isArray(child)) {
                for (const item of child) {
                    if (isObject(item)) {
                        found.push('channel_id' in item ? item.channel_id : item.id);
                        walk(Object.fromEntries(Object.entries(item).filter(([name]) => !['id', 'channel_id'].includes(name))));
                    } else {
                        found.push(item);
                    }
                }
            }
            if (!CHANNEL_KEYS.includes(key)) walk(child);
        }
    };
    walk(value);
    return found;
}

const isTheChannel = value => value === CHANNEL || (typeof value === 'string' && value === String(CHANNEL));

// Inside an entity body, every channel named besides the item's own channel_id.
function nestedProblems(item, where) {
    const rest = Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'channel_id'));
    return [...new Set(channelsNamed(rest).filter(value => value !== CHANNEL).map(show))].map(value => `${where} names channel ${value} inside the body: only 1895766 may be named`);
}

// The problems with a lifted write's channel, given what classify() made of it. Empty means it
// names 1895766 where it must and no other channel anywhere.
export function requestChannelProblems(request, what) {
    const label = `${request.method} ${request.path}`;
    if (what.kind === 'settings') {
        const problems = [];
        const query = request.query || {};
        if (!('channel_id' in query)) {
            problems.push(`${label}: no channel_id in the query: a settings write without one changes the global value, which reaches .com and channel 1`);
        } else if (!isTheChannel(query.channel_id)) {
            problems.push(`${label}: channel_id ${show(query.channel_id)} isn't 1895766`);
        }
        const extra = Object.keys(query).filter(key => key !== 'channel_id');
        if (extra.length) problems.push(`${label}: only channel_id in the query, not ${extra.join(', ')}`);
        problems.push(...nestedProblems(request.body, label));
        return problems;
    }
    const items = Array.isArray(request.body) ? request.body : [request.body];
    const several = Array.isArray(request.body);
    return items.flatMap((item, index) => {
        const where = several ? `${label} item ${index + 1}` : label;
        const whose = several ? `${label} item ${index + 1}'s` : `${label}:`;
        if (!('channel_id' in item)) return [`${where} has no channel_id: every write names 1895766`];
        if (item.channel_id !== CHANNEL) return [`${whose} channel_id ${show(item.channel_id)} isn't 1895766`];
        return nestedProblems(item, where);
    });
}

// The problems with a response: any channel but 1895766 named anywhere stops the run. With
// requireOnData, each object in `data` must also carry channel_id 1895766 itself, as every
// widget, template, placement, page and script does.
export function responseChannelProblems(body, { requireOnData = false } = {}) {
    const others = [...new Set(channelsNamed(body).filter(value => Number(value) !== CHANNEL || value === null).map(show))];
    const problems = others.map(value => `the response names channel ${value}, not 1895766`);
    if (requireOnData) {
        const data = isObject(body) ? body.data : undefined;
        const items = Array.isArray(data) ? data : [data];
        if (!items.length || items.every(item => item === undefined)) {
            problems.push('the response has no data to check for channel 1895766');
        } else if (items.some(item => !isObject(item) || Number(item.channel_id) !== CHANNEL)) {
            problems.push('the response doesn\'t name channel 1895766 on every object it returns');
        }
    }
    return problems;
}
