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
//                   tag, grouped by ticket, with re-baseline epochs apart. A baseline that
//                   several owners changed in turn gets one before-and-after per owner.
//   5. com          .com review renders (channel 1855224, no baselines) and the uuid of the
//                   build to preview
//   6. liveHome     the live home page on 1895766 with its widgets, which baselines hide
//
// Above them, `merged` lists every PR merged since the last checkpoint, by ticket with its
// wave, whether or not it changed a baseline.
//   7. waiting      criteria waiting on refactor 13 or 14, a token, the cookie or an approval

import { CHANNELS } from '../pages.mjs';
import { parseBaselinePath, ticketsOf } from './git.mjs';
import { COM_CHANNEL } from './manifest.mjs';
import { REFERENCE_ANCHORS, anchorById, referenceFor } from './reference.mjs';

export { COM_CHANNEL };
export const HOME_CHANNEL = '1895766';
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
        // A live render records no reference anchor of its own: it takes its page's.
        const referenceId = entry.reference === undefined ? referenceFor(entry.page) : entry.reference;
        const key = [entry.kind, entry.channel, entry.variation, entry.overlay ?? '', entry.state ?? '', entry.page].join('|');
        if (!rows.has(key)) {
            const anchor = referenceId ? anchorById(referenceId) : null;
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
                // A failed shot with a render failed its comparison; one without failed before it.
                mismatch: entry.status === 'failed' && Boolean(entry.actual),
                error: entry.error || null,
                baseline: entry.baseline || null,
            },
            reference: referenceId && references.get(`${referenceId}|${entry.width}`)
                ? { image: references.get(`${referenceId}|${entry.width}`) }
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

const list = items => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

// Theme and live shots of pages scripts/qa/pages.mjs no longer pins (a renamed or removed
// pin) stay in the manifest, because runs only add to it. They are left out of the page.
function currentEntries(entries, pinned) {
    const kept = [];
    const dropped = [];
    for (const entry of entries) {
        const shot = entry.kind === 'theme' || entry.kind === 'live';
        if (shot && pinned[entry.channel]?.pages?.[entry.page] === undefined) dropped.push(entry);
        else kept.push(entry);
    }
    return { kept, dropped };
}

function failureNote(entry) {
    const where = `${channelName(entry.channel)}: ${entry.page} at ${entry.width}`;
    const shows = entry.kind === 'theme' ? ' The page shows its baseline' : '';
    if (entry.status !== 'failed') return `${where} ended "${entry.status}" in the last run.${shows && `${shows}.`}`;
    if (entry.actual) return `${where} didn't match its baseline in the last run.${shows}, with that run's render beside it.`;
    return `${where} failed in the last run before its screenshot was compared${entry.error ? `: ${entry.error}` : ''}.${shows && `${shows}.`}`;
}

function manifestNotes(entries, dropped, head) {
    const notes = [];
    const shots = entries.filter(entry => entry.kind !== 'reference');
    for (const entry of shots) {
        if (entry.status && !['passed', 'skipped'].includes(entry.status)) notes.push(failureNote(entry));
    }
    const stale = [...new Set(shots.filter(entry => entry.commit && head && entry.commit !== head.sha).map(entry => entry.commit))];
    for (const commit of stale) notes.push(`Some shots ran on ${commit.slice(0, 8)}, not ${head.short}. Run the screenshots again on this commit before publishing.`);
    if (shots.some(entry => entry.dirty)) notes.push('Some shots ran on a checkout with uncommitted changes.');
    if (dropped.length) {
        const pages = [...new Set(dropped.map(entry => `${channelName(entry.channel)} ${entry.page}`))];
        notes.push(`Left out ${dropped.length} shot${dropped.length === 1 ? '' : 's'} of pages scripts/qa/pages.mjs no longer pins: ${list(pages)}.`);
    }
    // The reference spec records a screen it couldn't shoot instead of failing the run.
    const problems = new Map();
    for (const entry of entries.filter(item => item.kind === 'reference' && item.problem && anchorById(item.anchor))) {
        if (!problems.has(entry.problem)) problems.set(entry.problem, { labels: new Set(), widths: new Set() });
        problems.get(entry.problem).labels.add(anchorById(entry.anchor).label);
        problems.get(entry.problem).widths.add(entry.width);
    }
    for (const [problem, { labels, widths }] of problems) {
        notes.push(`Reference screens not shot in the last run: ${list([...labels])} at ${list([...widths].sort((a, b) => a - b).map(String))}. Why: ${problem}`);
    }
    if (!entries.some(entry => entry.kind === 'reference')) {
        notes.push('There are no reference screens in the manifest. Run `npm run qa:screens` on the Mac that has plan/design/reelflies-reference.html.');
    }
    return notes;
}

// A changed baseline, as one before-and-after item: the whole range, or one run of it.
function changeItem(change, references, run = null) {
    const parsed = parseBaselinePath(change.path) || {};
    const anchor = parsed.page ? referenceFor(parsed.page) : null;
    return {
        path: change.path,
        status: change.status,
        page: parsed.page || change.path,
        width: parsed.width || null,
        channel: parsed.channel || null,
        set: parsed.set || null,
        commits: run ? run.commits : change.commits || [],
        before: sideImage(run ? run.before : change.before),
        after: sideImage(run ? run.after : change.after),
        // Labels for the sides when they aren't the checkpoint tag and the head.
        beforeLabel: run?.beforeLabel ?? null,
        afterLabel: run?.afterLabel ?? null,
        part: run?.part ?? 1,
        parts: run?.parts ?? 1,
        referenceLabel: anchor ? anchorById(anchor).label : null,
        reference: anchor && parsed.width ? references.get(`${anchor}|${parsed.width}`) || null : null,
    };
}

const ticketOrder = ticket => {
    if (ticket === null) return [2, 0];
    const w0 = /^W0-(\d+)$/.exec(ticket);
    return w0 ? [0, Number(w0[1])] : [1, Number(ticket)];
};

const firstTicket = ticket => ticket && ticket.split(', ')[0];
const byTicket = (a, b) => {
    const [x, y] = [ticketOrder(firstTicket(a.ticket)), ticketOrder(firstTicket(b.ticket))];
    return x[0] - y[0] || x[1] - y[1];
};
// A wave 0 item is in wave 0; any other ticket's wave comes from the notes' `tickets` map.
const waveOf = (ticket, input) => input.tickets?.[ticket]?.wave ?? (/^W0-\d+$/.test(ticket || '') ? '0' : null);

// A commit is a re-baseline epoch's when the notes list it, when its message has a
// "Baselines: epoch <cause>" line (build pipeline 6.6), or when its title says "epoch".
const EPOCH_LINE = /^Baselines:\s*epoch\b[\s:]*(.*)$/im;
const sameCommit = (sha, listed) => sha.startsWith(listed) || listed.startsWith(sha);

function ownerOf(commit, listedEpochs) {
    const listed = listedEpochs.find(epoch => sameCommit(commit.sha, epoch.commit));
    const declared = EPOCH_LINE.exec(commit.body || '');
    if (listed || declared || /\bepoch\b/i.test(commit.subject)) {
        const cause = listed?.cause || declared?.[1]?.trim() || commit.subject;
        return { key: `epoch|${cause}`, epoch: cause };
    }
    const tickets = ticketsOf(commit.subject);
    const ticket = tickets.length ? tickets.join(', ') : null;
    return { key: `ticket|${ticket}`, ticket };
}

// A changed baseline's commits, split into runs of consecutive commits with one owner, oldest
// first. Each run is one before-and-after, from where the run before it left the file (the
// checkpoint tag, for the first) to its own last commit (the head, for the last). So a
// ticket's change, an epoch on top of it and the next ticket's change each show alone.
function runsOf(change, listedEpochs) {
    const runs = [];
    for (const commit of [...(change.commits || [])].reverse()) {
        const owner = ownerOf(commit, listedEpochs);
        const last = runs[runs.length - 1];
        if (last && last.owner.key === owner.key) last.commits.unshift(commit);
        else runs.push({ owner, commits: [commit] });
    }
    if (!runs.length) {
        return [{
            owner: { key: 'ticket|null', ticket: null }, commits: [], before: change.before, after: change.after, part: 1, parts: 1,
        }];
    }
    return runs.map((run, index) => {
        const [newest] = run.commits;
        const oldest = run.commits[run.commits.length - 1];
        const previous = runs[index - 1]?.commits[0];
        const last = index === runs.length - 1;
        let before = oldest.status === 'A' ? null : change.before;
        if (previous) before = previous.status === 'D' ? null : { ref: previous.sha, path: change.path };
        let after = newest.status === 'D' ? null : { ref: newest.sha, path: change.path };
        if (last) after = change.after;
        return {
            ...run,
            before,
            after,
            beforeLabel: previous ? previous.sha.slice(0, 8) : null,
            afterLabel: last ? null : newest.sha.slice(0, 8),
            part: index + 1,
            parts: runs.length,
        };
    });
}

function groupChanges(changes, references, input) {
    const listedEpochs = (input.epochs || []).filter(epoch => epoch.commit);
    const groups = new Map();
    const epochs = new Map();
    const commitsSeen = [];
    for (const change of changes) {
        for (const run of runsOf(change, listedEpochs)) {
            const item = changeItem(change, references, run);
            commitsSeen.push(...run.commits.map(({ sha }) => sha));
            if (run.owner.epoch) {
                const { epoch: cause } = run.owner;
                if (!epochs.has(cause)) epochs.set(cause, { cause, commit: run.commits[0].sha, items: [] });
                epochs.get(cause).items.push(item);
            } else {
                const { ticket } = run.owner;
                if (!groups.has(ticket)) {
                    groups.set(ticket, {
                        ticket, wave: waveOf(firstTicket(ticket), input), title: input.tickets?.[firstTicket(ticket)]?.title ?? null, items: [],
                    });
                }
                groups.get(ticket).items.push(item);
            }
        }
    }
    const notes = listedEpochs
        .filter(epoch => !commitsSeen.some(sha => sameCommit(sha, epoch.commit)))
        .map(epoch => `The notes list epoch ${epoch.commit} (${epoch.cause}), but no baseline change in this range comes from it.`);
    return { groups: [...groups.values()].sort(byTicket), epochs: [...epochs.values()], notes };
}

// Every PR merged since the last checkpoint (git.mjs mergedSince), by ticket, so a ticket
// that changed no baseline is on the page too. A PR naming two tickets is under both.
function mergedGroups(merged, input) {
    const groups = new Map();
    for (const entry of merged) {
        for (const ticket of entry.tickets.length ? entry.tickets : [null]) {
            if (!groups.has(ticket)) {
                groups.set(ticket, {
                    ticket, wave: waveOf(ticket, input), title: input.tickets?.[ticket]?.title ?? null, merges: [],
                });
            }
            groups.get(ticket).merges.push({ pr: entry.pr, title: entry.title, sha: entry.sha });
        }
    }
    const prs = merged.filter(entry => entry.pr).length;
    return {
        count: merged.length, prs, direct: merged.length - prs, groups: [...groups.values()].sort(byTicket),
    };
}

// The tickets on the page whose wave the notes don't give, so the page can't say it.
function waveNotes(groups) {
    const missing = [...new Set(groups.filter(group => group.wave === null && group.ticket).flatMap(group => group.ticket.split(', ')))]
        .filter(ticket => waveOf(ticket, {}) === null)
        .sort((a, b) => ticketOrder(a)[0] - ticketOrder(b)[0] || ticketOrder(a)[1] - ticketOrder(b)[1]);
    return missing.length
        ? [`No wave is given for ticket${missing.length === 1 ? '' : 's'} ${list(missing)} in the checkpoint notes' \`tickets\` map, so the page shows none.`]
        : [];
}

export function buildCheckpointModel({
    name, since, head, manifest, changes, merged = [], input = {}, generatedAt, pinned = CHANNELS,
}) {
    const { kept: entries, dropped } = currentEntries(manifest.entries, pinned);
    const references = referenceImages({ entries });
    const themeEntries = entries.filter(entry => entry.kind === 'theme');
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
    const liveEntries = entries.filter(entry => entry.kind === 'live');
    const changeGroups = groupChanges(changes, references, input);
    const mergedList = mergedGroups(merged, input);

    return {
        mode: 'checkpoint',
        name,
        title: input.title || `Review checkpoint ${name}`,
        intro: input.intro || '',
        date: input.date || generatedAt.slice(0, 10),
        generatedAt,
        since,
        head,
        merged: mergedList,
        forShaun: {
            approvals: input.forShaun?.approvals || [],
            pairedReleases: input.forShaun?.pairedReleases || [],
            access: input.forShaun?.access || [],
            draftCopy: input.forShaun?.draftCopy || [],
        },
        defaults: (input.defaults || []).map(entry => ({ ...entry, wave: entry.wave ?? waveOf(entry.ticket, input) })),
        tickets: input.tickets || {},
        templates,
        referenceOnly,
        changes: {
            first: !since, since, groups: changeGroups.groups, epochs: changeGroups.epochs,
        },
        com: {
            // .com has no baselines: its renders are review-live.spec.mjs's shots of the
            // pages pinned for 1855224, with a theme baseline only if one is ever made.
            templates: templateRows(entries.filter(entry => (entry.kind === 'theme' || entry.kind === 'live') && entry.channel === COM_CHANNEL), references),
            uuid: input.com?.uuid || null,
            commit: input.com?.commit || null,
            pushedAt: input.com?.pushedAt || null,
            note: input.com?.note || '',
        },
        liveHome: {
            shots: liveEntries
                .filter(entry => entry.page === 'home' && entry.channel === HOME_CHANNEL)
                .map(entry => ({
                    width: entry.width, channel: entry.channel, channelName: channelName(entry.channel), image: fileImage(entry.image), status: entry.status,
                }))
                .sort((a, b) => a.width - b.width),
            note: input.liveHome?.note || '',
        },
        waiting: input.waiting || [],
        notes: [
            ...manifestNotes(entries, dropped, head),
            ...changeGroups.notes,
            ...waveNotes([...changeGroups.groups, ...mergedList.groups]),
        ],
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
