// What a review page holds (W0-10), built from the screenshot manifest, the baselines git
// says changed, and the orchestrator's checkpoint notes. Pure: images are references,
// { kind: 'file', path } (relative to the repo) or { kind: 'git', ref, path }, which
// review.mjs encodes and render.mjs shows.
//
// A checkpoint page has seven sections, in this order (W0-10):
//   1. forShaun     approvals waiting, each with its diff; paired channel-1 releases
//                   pending; tokens and cookie sessions needed; DRAFT copy
//   2. defaults     defaults taken since the last checkpoint, each revisitable
//   3. templates    each template at 375 and 1280 beside its reference screen
//   4. changes      before and after for every baseline changed since the last checkpoint
//                   tag, grouped by ticket, with re-baseline epochs apart
//   5. com          .com renders (channel 1855224) and the uuid of the build to preview
//   6. liveHome     the live home page on 1895766 with its widgets, which baselines hide
//   7. waiting      criteria waiting on refactor 13 or 14, a token, the cookie or an approval

import { CHANNELS } from '../pages.mjs';
import { parseBaselinePath, ticketsOf } from './git.mjs';
import { REFERENCE_ANCHORS, anchorById, referenceFor } from './reference.mjs';

export const COM_CHANNEL = '1855224';
const CHANNEL_ORDER = ['1895766', '1', COM_CHANNEL];
const TEMPLATE_ORDER = ['home', 'fly-type', 'category', 'species', 'species-hub', 'product', 'cart', 'hook-chart', 'brand', '404'];
const CHANNEL_NAMES = { [COM_CHANNEL]: 'reelflies.com (local render)' };

// The checkpoint notes the orchestrator writes for each page (scripts/qa/README.md).
const INPUT_SHAPE = {
    title: 'string',
    intro: 'string',
    date: 'string',
    forShaun: {
        approvals: 'list', pairedReleases: 'list', access: 'list', draftCopy: 'list',
    },
    defaults: 'list',
    tickets: 'object',
    epochs: 'list',
    com: 'object',
    liveHome: 'object',
    waiting: 'list',
};

export function validateInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return ['the checkpoint notes must be a JSON object'];
    const problems = [];
    const check = (value, shape, prefix) => {
        for (const [key, inner] of Object.entries(value)) {
            const name = `${prefix}${key}`;
            const want = shape[key];
            if (!want) problems.push(`unknown key "${name}"`);
            else if (typeof want === 'object') {
                if (!inner || typeof inner !== 'object' || Array.isArray(inner)) problems.push(`"${name}" must be an object`);
                else check(inner, want, `${name}.`);
            } else if (want === 'list' && !Array.isArray(inner)) problems.push(`"${name}" must be a list`);
            else if (want === 'object' && (!inner || typeof inner !== 'object' || Array.isArray(inner))) problems.push(`"${name}" must be an object`);
            else if (want === 'string' && typeof inner !== 'string') problems.push(`"${name}" must be text`);
        }
    };
    check(input, INPUT_SHAPE, '');
    return problems;
}

const fileImage = file => (file ? { kind: 'file', path: file } : null);
const sideImage = side => {
    if (!side) return null;
    return side.ref ? { kind: 'git', ref: side.ref, path: side.path } : { kind: 'file', path: side.path };
};
const channelOrder = channel => {
    const at = CHANNEL_ORDER.indexOf(String(channel));
    return at < 0 ? CHANNEL_ORDER.length : at;
};
const templateOrder = page => {
    const at = TEMPLATE_ORDER.indexOf(String(page).split('@')[0]);
    return at < 0 ? TEMPLATE_ORDER.length : at;
};
export const channelName = channel => CHANNEL_NAMES[channel] || CHANNELS[channel]?.name || `channel ${channel}`;
export const widthLabel = width => (width < 641 ? `Phone ${width}` : `Desktop ${width}`);

function referenceImages(manifest) {
    const images = new Map();
    for (const entry of manifest.entries) {
        if (entry.kind === 'reference' && entry.image) images.set(`${entry.anchor}|${entry.width}`, fileImage(entry.image));
    }
    return images;
}

// One row per template (and overlay or state) and channel, with its widths side by side.
function templateRows(entries, references) {
    const rows = new Map();
    for (const entry of entries) {
        const key = [entry.channel, entry.variation, entry.overlay ?? '', entry.state ?? '', entry.page].join('|');
        if (!rows.has(key)) {
            const anchor = entry.reference ? anchorById(entry.reference) : null;
            rows.set(key, {
                channel: entry.channel,
                channelName: channelName(entry.channel),
                variation: entry.variation,
                overlay: entry.overlay ?? null,
                state: entry.state ?? null,
                page: entry.page,
                path: entry.path,
                reference: anchor && { id: anchor.id, label: anchor.label },
                widths: [],
            });
        }
        const row = rows.get(key);
        row.widths.push({
            width: entry.width,
            project: entry.project,
            theme: {
                image: fileImage(entry.baseline || entry.image),
                actual: entry.status === 'failed' ? fileImage(entry.actual) : null,
                status: entry.status,
                baseline: entry.baseline || null,
            },
            reference: entry.reference && references.get(`${entry.reference}|${entry.width}`)
                ? { image: references.get(`${entry.reference}|${entry.width}`) }
                : null,
        });
    }
    return [...rows.values()]
        .map(row => ({ ...row, widths: row.widths.sort((a, b) => a.width - b.width) }))
        .sort((a, b) => channelOrder(a.channel) - channelOrder(b.channel)
            || templateOrder(a.page) - templateOrder(b.page)
            || String(a.page).localeCompare(String(b.page))
            || String(a.overlay ?? a.state ?? '').localeCompare(String(b.overlay ?? b.state ?? '')));
}

function manifestNotes(manifest, head) {
    const notes = [];
    const shots = manifest.entries.filter(entry => entry.kind !== 'reference');
    for (const entry of shots) {
        if (entry.status && !['passed', 'skipped'].includes(entry.status)) {
            notes.push(`${channelName(entry.channel)}: ${entry.page} at ${entry.width} ${entry.status === 'failed' ? 'didn\'t match its baseline' : `ended "${entry.status}"`} in the last run. The page shows its baseline${entry.actual ? ', with that run\'s render beside it' : ''}.`);
        }
    }
    const stale = [...new Set(shots.filter(entry => entry.commit && head && entry.commit !== head.sha).map(entry => entry.commit))];
    for (const commit of stale) notes.push(`Some shots ran on ${commit.slice(0, 8)}, not ${head.short}. Run the screenshots again on this commit before publishing.`);
    if (shots.some(entry => entry.dirty)) notes.push('Some shots ran on a checkout with uncommitted changes.');
    if (!manifest.entries.some(entry => entry.kind === 'reference')) {
        notes.push('There are no reference screens in the manifest. Run `npm run qa:screens` on the Mac that has plan/design/reelflies-reference.html.');
    }
    return notes;
}

// A changed baseline, as one before-and-after item.
function changeItem(change, references) {
    const parsed = parseBaselinePath(change.path) || {};
    const anchor = parsed.page ? referenceFor(parsed.page) : null;
    return {
        path: change.path,
        status: change.status,
        page: parsed.page || change.path,
        width: parsed.width || null,
        channel: parsed.channel || null,
        set: parsed.set || null,
        commits: change.commits || [],
        before: sideImage(change.before),
        after: sideImage(change.after),
        referenceLabel: anchor ? anchorById(anchor).label : null,
        reference: anchor && parsed.width ? references.get(`${anchor}|${parsed.width}`) || null : null,
    };
}

const ticketOrder = ticket => {
    if (ticket === null) return [2, 0];
    const w0 = /^W0-(\d+)$/.exec(ticket);
    return w0 ? [0, Number(w0[1])] : [1, Number(ticket)];
};

function groupChanges(changes, references, input) {
    const epochCauses = (input.epochs || []).filter(epoch => epoch.commit);
    const groups = new Map();
    const epochs = new Map();
    for (const change of changes) {
        const item = changeItem(change, references);
        const [newest] = item.commits;
        const listed = newest && epochCauses.find(epoch => newest.sha.startsWith(epoch.commit) || epoch.commit.startsWith(newest.sha));
        if (listed || (newest && /\bepoch\b/i.test(newest.subject))) {
            const cause = listed?.cause || newest.subject;
            if (!epochs.has(cause)) epochs.set(cause, { cause, commit: newest.sha, items: [] });
            epochs.get(cause).items.push(item);
        } else {
            const tickets = newest ? ticketsOf(newest.subject) : [];
            const ticket = tickets.length ? tickets.join(', ') : null;
            if (!groups.has(ticket)) {
                const info = input.tickets?.[tickets[0]] || {};
                groups.set(ticket, {
                    ticket, wave: info.wave ?? null, title: info.title ?? null, items: [],
                });
            }
            groups.get(ticket).items.push(item);
        }
    }
    const sortedGroups = [...groups.values()].sort((a, b) => {
        const [x, y] = [ticketOrder(a.ticket && a.ticket.split(', ')[0]), ticketOrder(b.ticket && b.ticket.split(', ')[0])];
        return x[0] - y[0] || x[1] - y[1];
    });
    return { groups: sortedGroups, epochs: [...epochs.values()] };
}

export function buildCheckpointModel({
    name, since, head, manifest, changes, input = {}, generatedAt,
}) {
    const references = referenceImages(manifest);
    const themeEntries = manifest.entries.filter(entry => entry.kind === 'theme');
    const templates = templateRows(themeEntries.filter(entry => entry.channel !== COM_CHANNEL), references);
    const used = new Set(templates.map(row => row.reference?.id).filter(Boolean));
    const referenceOnly = REFERENCE_ANCHORS.filter(anchor => !used.has(anchor.id)).map(anchor => ({
        id: anchor.id,
        label: anchor.label,
        widths: [...references.entries()]
            .filter(([key]) => key.startsWith(`${anchor.id}|`))
            .map(([key, image]) => ({ width: Number(key.split('|')[1]), image }))
            .sort((a, b) => a.width - b.width),
    }));
    const liveEntries = manifest.entries.filter(entry => entry.kind === 'live');

    return {
        mode: 'checkpoint',
        name,
        title: input.title || `Review checkpoint ${name}`,
        intro: input.intro || '',
        date: input.date || generatedAt.slice(0, 10),
        generatedAt,
        since,
        head,
        forShaun: {
            approvals: input.forShaun?.approvals || [],
            pairedReleases: input.forShaun?.pairedReleases || [],
            access: input.forShaun?.access || [],
            draftCopy: input.forShaun?.draftCopy || [],
        },
        defaults: (input.defaults || []).map(entry => ({ ...entry, wave: entry.wave ?? input.tickets?.[entry.ticket]?.wave ?? null })),
        tickets: input.tickets || {},
        templates,
        referenceOnly,
        changes: { first: !since, since, ...groupChanges(changes, references, input) },
        com: {
            templates: templateRows(themeEntries.filter(entry => entry.channel === COM_CHANNEL), references),
            uuid: input.com?.uuid || null,
            commit: input.com?.commit || null,
            pushedAt: input.com?.pushedAt || null,
            note: input.com?.note || '',
        },
        liveHome: {
            shots: liveEntries
                .filter(entry => entry.page === 'home')
                .map(entry => ({
                    width: entry.width, channel: entry.channel, channelName: channelName(entry.channel), image: fileImage(entry.image), status: entry.status,
                }))
                .sort((a, b) => channelOrder(a.channel) - channelOrder(b.channel) || a.width - b.width),
            note: input.liveHome?.note || '',
        },
        waiting: input.waiting || [],
        notes: manifestNotes(manifest, head),
    };
}

export function buildPrModel({
    pr, head, manifest, changes, generatedAt,
}) {
    const references = referenceImages(manifest);
    return {
        mode: 'pr',
        name: pr.label,
        title: `${pr.label}: changed baselines`,
        generatedAt,
        head,
        pr,
        items: changes.map(change => changeItem(change, references)),
        notes: manifest.entries.some(entry => entry.kind === 'reference')
            ? []
            : ['There are no reference screens in the manifest. Run `npm run qa:screens` on the Mac that has plan/design/reelflies-reference.html.'],
    };
}
