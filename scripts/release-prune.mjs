// W0-3: prunes old ReelFlies builds from My Themes, which holds at most 20 themes (HANDOFF, "Rules
// for every session": only themes named ReelFlies, active on no channel, always keeping the newest
// three, each deletion logged). The selection is pure and decided here; scripts/release-themes.mjs
// reads the store and deletes, and scripts/release.mjs runs the two (`release.sh --prune-only
// [--dry-run]`, and after each push).
//
//   import { planPrune, describePlan, runPrune, describeRunProblems } from './release-prune.mjs';
//   import { uncommittedProblems, releasesEditProblems, dryRunRecord, dryRunProblems } from './release-prune.mjs';
//   import { isPruneName } from './release-prune.mjs';             // "ReelFlies" or "ReelFlies (n)" (W0-3b)
//   const plan = planPrune({ themes, activeByChannel, markdown });   // markdown: RELEASES.md
//   describePlan(plan).forEach(line => console.log(line));
//   const result = await runPrune({ plan, deleteTheme, readThemes, record }); // a real prune only; never throws
//   const stop = describeRunProblems(result);                        // null, or why the prune stops
//
// A theme is deleted only when every rule below lets it go. Each rule keeps a theme on its own:
//   - its name in My Themes is exactly "ReelFlies", or "ReelFlies (n)": the store names an upload
//     that way while My Themes already holds a "ReelFlies", as it did the first agent push (W0-3b;
//     release-diff.mjs isStoreNameFor). No other theme is ever a candidate: not Hero-2024, Cavio
//     or the Marketplace Cornerstone, whatever RELEASES.md says
//   - RELEASES.md records its uuid as a release (an unknown ReelFlies uuid is kept)
//   - it is active on no channel: every channel's active theme was read (activeByChannel), and
//     channels 1, 1855224, 1895766 and every channel RELEASES.md names must be among them
//   - My Themes doesn't flag it is_active. That is the store's own "active somewhere" signal: on
//     2026-10-05 it was true on exactly the three themes a channel ran, including the Cavio copy on
//     channel 1861300, which has no site and which that day's channel reads missed. So it keeps a
//     theme even when no channel read shows it running (revisitable, on a dry run showing a flagged
//     build that no channel runs)
//   - it isn't the latest or the previous release on 1895766 or channel 1, nor the theme either
//     ran before its latest release: those are the rollback (ticket 53 reader)
//   - it isn't one of the newest three, ranked by its newest entry's time in RELEASES.md (the file's
//     order for two in the same minute, as W0-2's lastRelease), never by name (nor the n in
//     "ReelFlies (n)"), version or the store's updated_at: every build is "ReelFlies" 6.22.0
//     today (decision 9)

import { LIVE_CHANNELS, MAX_THEMES } from './release-checks.mjs';
import { isStoreNameFor } from './release-diff.mjs';
import { releaseBuilds } from './release-log.mjs';

export const PRUNE_NAME = 'ReelFlies';
// A ReelFlies build is a theme My Themes names PRUNE_NAME, or PRUNE_NAME followed by " (n)", the
// name the store gives a repeat upload while My Themes holds a "ReelFlies" (W0-3b).
export const isPruneName = name => isStoreNameFor(name, PRUNE_NAME);
// How the plan's text names them.
const PRUNE_NAMES = `${PRUNE_NAME} or "${PRUNE_NAME} (n)"`;
export const KEEP_NEWEST = 3;
// The channels whose previous release is the rollback (ticket 53 reader).
export const ROLLBACK_CHANNELS = Object.freeze([1895766, 1]);
// Channels whose active theme every plan must have read, besides the ones RELEASES.md names.
export const REQUIRED_CHANNELS = Object.freeze([...new Set([...Object.keys(LIVE_CHANNELS).map(Number), ...ROLLBACK_CHANNELS])].sort((a, b) => a - b));
// The keep reason for a theme My Themes flags is_active.
const FLAGGED_ACTIVE = 'My Themes flags it is_active (active on a channel, perhaps one the reads didn\'t list)';

const newerFirst = (a, b) => (a.timestamp === b.timestamp ? b.order - a.order : b.timestamp.localeCompare(a.timestamp));

// Each recorded uuid's newest entry, newest first.
function newestRecords(markdown) {
    const records = new Map();
    for (const build of releaseBuilds(markdown).filter(item => item.themeUuid).sort(newerFirst)) {
        if (!records.has(build.themeUuid)) records.set(build.themeUuid, build);
    }
    return records;
}

// uuid -> reasons the rollback keeps it: on each rollback channel, its latest release, the newest
// earlier release of another theme, and the theme the channel ran before its latest release.
function rollbackReasons(markdown) {
    const reasons = new Map();
    const add = (id, reason) => {
        if (id) reasons.set(id, [...(reasons.get(id) || []), reason]);
    };
    const builds = releaseBuilds(markdown);
    for (const channel of ROLLBACK_CHANNELS) {
        const [latest, ...earlier] = builds.filter(build => build.channel === channel).sort(newerFirst);
        if (latest) {
            add(latest.themeUuid, `the latest release on channel ${channel}`);
            add(latest.ranBefore, `the theme channel ${channel} ran before its latest release (the rollback)`);
            const previous = earlier.find(entry => entry.themeUuid && entry.themeUuid !== latest.themeUuid);
            if (previous) add(previous.themeUuid, `the previous release on channel ${channel} (the rollback)`);
        }
    }
    return reasons;
}

// Every channel the plan must have read: the required ones and every one RELEASES.md names.
function requiredChannels(markdown) {
    return [...new Set([...REQUIRED_CHANNELS, ...releaseBuilds(markdown).map(build => build.channel)])].sort((a, b) => a - b);
}

// themes: GET /v3/themes's data. activeByChannel: { channelId: active theme uuid } for every
// channel read. markdown: RELEASES.md. Returns { themeCount, channels, running, builds, toDelete, others }:
// builds are the ReelFlies themes, recorded ones newest first and then the unknown ones, each
// { uuid, name, record, action: 'keep' | 'delete', reasons }; toDelete lists the ones to delete,
// oldest first; others are the themes not named ReelFlies or "ReelFlies (n)", which the prune never touches, each
// { uuid, name, flaggedActive }; running is each channel's active theme, { channel, uuid, name },
// for the plan's text.
// Throws when a required channel wasn't read, or a channel read has no active theme: the prune
// never guesses a theme is unused.
export function planPrune({ themes, activeByChannel, markdown }) {
    const channels = Object.keys(activeByChannel).map(Number).sort((a, b) => a - b);
    for (const channel of requiredChannels(markdown)) {
        if (!channels.includes(channel)) throw new Error(`the prune didn't check channel ${channel}'s active theme, so it can't tell what is unused`);
    }
    for (const channel of channels) {
        if (!activeByChannel[channel]) throw new Error(`couldn't read channel ${channel}'s active theme, so the prune can't tell what is unused`);
    }
    const activeOn = id => channels.filter(channel => activeByChannel[channel] === id);
    const records = newestRecords(markdown);
    const rollback = rollbackReasons(markdown);
    const candidates = themes.filter(item => isPruneName(item.name));
    const recorded = candidates.filter(item => records.has(item.uuid)).sort((a, b) => newerFirst(records.get(a.uuid), records.get(b.uuid)));
    const unknown = candidates.filter(item => !records.has(item.uuid));
    const builds = [...recorded, ...unknown].map(item => {
        const record = records.get(item.uuid) || null;
        const reasons = [
            ...activeOn(item.uuid).map(channel => `active on channel ${channel}`),
            ...(item.is_active === true ? [FLAGGED_ACTIVE] : []),
            ...(record ? [] : ['RELEASES.md doesn\'t record it as a release']),
            ...(rollback.get(item.uuid) || []),
            ...(record && recorded.indexOf(item) < KEEP_NEWEST ? [`one of the newest ${KEEP_NEWEST}`] : []),
        ];
        return {
            uuid: item.uuid, name: item.name, record, action: reasons.length ? 'keep' : 'delete', reasons,
        };
    });
    const names = new Map(themes.map(item => [item.uuid, item.name]));
    return {
        themeCount: themes.length,
        channels,
        running: channels.map(channel => ({ channel, uuid: activeByChannel[channel], name: names.get(activeByChannel[channel]) || null })),
        builds,
        toDelete: builds.filter(build => build.action === 'delete').reverse(),
        others: themes.filter(item => !isPruneName(item.name)).map(item => ({ uuid: item.uuid, name: item.name, flaggedActive: item.is_active === true })),
    };
}

const describeBuild = ({ uuid, name, record }) => (record
    ? `${uuid} ${name} ${record.version || '(version unknown)'}, released ${record.timestamp} UTC from ${record.sha ? record.sha.slice(0, 7) : 'an unknown commit'}`
    : `${uuid} ${name}`);

// The plan as lines for the terminal: one per ReelFlies theme, then the others and the count.
export function describePlan(plan) {
    const lines = [
        `My Themes holds ${plan.themeCount} of ${MAX_THEMES} themes; ${plan.builds.length} named ${PRUNE_NAMES}; channels checked: ${plan.channels.join(', ')}`,
        `  each channel runs: ${plan.running.map(({ channel, uuid, name }) => `${channel} ${name || 'a theme not in My Themes'} (${uuid.slice(0, 8)})`).join(', ')}`,
    ];
    for (const build of plan.builds) {
        const why = build.action === 'delete'
            ? `older than the newest ${KEEP_NEWEST}, active on no channel, not flagged is_active, and not a rollback`
            : build.reasons.join('; ');
        lines.push(`  ${build.action.padEnd(8)} ${describeBuild(build)}: ${why}`);
    }
    if (plan.others.length) {
        const others = plan.others.map(other => `${other.name} (${other.uuid.slice(0, 8)}${other.flaggedActive ? ', flagged is_active' : ''})`);
        lines.push(`  ${plan.others.length} other theme(s) aren't named ${PRUNE_NAMES}, so the prune never touches them: ${others.join(', ')}`);
    }
    lines.push(`  ${plan.toDelete.length} to delete, ${plan.builds.length - plan.toDelete.length} ${PRUNE_NAME} theme(s) kept`);
    return lines;
}

// Only an error's message leaves runPrune: the store's theme API client rejects with axios's
// error, whose config and request hold the Stencil-CLI token in a header.
const messageOf = error => String((error && error.message) || error);

// Deletes the plan's themes one at a time, oldest first, and calls record(build) right after each
// deletion answers, so the log keeps every theme deleted even if a later one fails. The first
// failure stops the run: a deletion the store refused (failed), or a row record() couldn't write
// (unlogged: the store deleted that theme, but the log doesn't say so). Then My Themes is read
// again: a theme still there is reported in stillThere, and a read that fails in rereadFailed.
// Never throws for the store or the log; each failure comes back as its message only. Returns
// { deleted: [uuid], failed: { uuid, message } | null, unlogged: { uuid, message } | null,
// stillThere: [uuid], rereadFailed: message | null }.
export async function runPrune({
    plan, deleteTheme, readThemes, record,
}) {
    const deleted = [];
    let failed = null;
    let unlogged = null;
    for (const build of plan.toDelete) {
        try {
            // One at a time, so a failure stops the rest.
            // eslint-disable-next-line no-await-in-loop
            await deleteTheme(build.uuid);
        } catch (error) {
            failed = { uuid: build.uuid, message: messageOf(error) };
            break;
        }
        deleted.push(build.uuid);
        try {
            record(build);
        } catch (error) {
            unlogged = { uuid: build.uuid, message: messageOf(error) };
            break;
        }
    }
    const result = {
        deleted, failed, unlogged, stillThere: [], rereadFailed: null,
    };
    if (!deleted.length) return result;
    try {
        const after = new Set((await readThemes()).map(item => item.uuid));
        result.stillThere = deleted.filter(id => after.has(id));
    } catch (error) {
        result.rereadFailed = messageOf(error);
    }
    return result;
}

// A real prune's stop after runPrune: every deletion the log misses, a failed deletion, a failed
// re-read and a theme still listed, then the deletions that are logged. null when there is no
// problem.
export function describeRunProblems({
    deleted, failed, unlogged, stillThere, rereadFailed,
}) {
    const problems = [];
    if (unlogged) problems.push(`the store deleted ${unlogged.uuid}, but its row couldn't be written in RELEASES.md (${unlogged.message}): add the row to RELEASES.md by hand; nothing after it was tried`);
    if (failed) problems.push(`deleting ${failed.uuid} failed: ${failed.message}; nothing after it was tried`);
    if (rereadFailed) problems.push(`My Themes couldn't be read again to check the deletions (${rereadFailed}): check My Themes by hand`);
    if (stillThere.length) problems.push(`My Themes still lists ${stillThere.join(', ')} after the store answered its deletion: check My Themes by hand`);
    if (!problems.length) return null;
    const logged = deleted.filter(id => !unlogged || id !== unlogged.uuid);
    return `${problems.join('; ')}. Say so in the release-log PR. ${logged.length} deleted theme(s) logged in RELEASES.md${logged.length ? `: ${logged.join(', ')}` : ''}`;
}

// A real --prune-only may leave only RELEASES.md uncommitted (git status --porcelain), so no edited
// rule decides what is deleted. Returns one line, or [].
export function uncommittedProblems(porcelain) {
    const files = porcelain.split('\n').filter(Boolean).map(line => line.slice(3).replace(/^"|"$/g, '')).filter(file => file !== 'RELEASES.md');
    return files.length ? [`uncommitted changes besides RELEASES.md: ${files.join(', ')}`] : [];
}

// And RELEASES.md may only gain lines since HEAD (`git diff --numstat HEAD -- RELEASES.md`): a
// release's new entry, or the prune's own rows. An edited or removed line, such as an entry's time
// moved, would change what is recorded, the rollback or the ranking. Returns one line, or [].
export function releasesEditProblems(numstat) {
    const why = 'a real prune lets it only gain lines, such as a release\'s new entry';
    const [added, removed] = numstat.trim().split('\t');
    if (!numstat.trim()) return [];
    if (!/^\d+$/.test(added) || !/^\d+$/.test(removed)) return [`RELEASES.md has uncommitted edits git can't count: ${why}`];
    return Number(removed) ? [`RELEASES.md has uncommitted edits that change or remove ${removed} line(s) since HEAD: ${why}`] : [];
}

// --- The dry run before a real --prune-only ------------------------------------------------------
//
// Each real --prune-only needs a --prune-only --dry-run first, from the same checkout and commit,
// within DRY_RUN_MINUTES, and deletes only what that dry run planned. The dry run records its plan
// (dryRunRecord) in the checkout's git folder; the real run checks the record before it reads the
// store, then its plan against the record's (dryRunProblems), and uses the record up. So the first
// deletion, and every one after it from --prune-only, is shown dry before it runs (W0-3).

export const DRY_RUN_MINUTES = 60;

// What a dry --prune-only records: { head, toDelete: [uuid], plannedAt, source: 'store' | 'fixture' }.
export function dryRunRecord({
    plan, head, source, now = new Date(),
}) {
    return {
        head, toDelete: plan.toDelete.map(build => build.uuid), plannedAt: now.toISOString(), source,
    };
}

// Why a real --prune-only may not go on, or []. record is the dry run's, null when there is none,
// or { unreadable: message }. Without `plan`, it checks the record alone (before the store is
// read); with it, also that the plan deletes what the dry run planned. A plan that deletes nothing
// matches any record.
export function dryRunProblems({
    record, head, plan = null, now = new Date(),
}) {
    if (!record) return ['no --prune-only --dry-run has run in this checkout since the last real one'];
    if (record.unreadable) return [`the dry run's record can't be read (${record.unreadable})`];
    if (!Array.isArray(record.toDelete)) return ['the dry run\'s record holds no plan'];
    const problems = [];
    if (record.source !== 'store') problems.push('the dry run read RF_RELEASE_THEMES_FIXTURE, not the store');
    if (record.head !== head) problems.push(`the dry run ran at ${String(record.head).slice(0, 7)}, and this checkout is at ${String(head).slice(0, 7)}`);
    const age = now.getTime() - Date.parse(record.plannedAt);
    if (Number.isNaN(age) || age < 0) problems.push('the dry run\'s time is later than now, or can\'t be read');
    else if (age >= DRY_RUN_MINUTES * 60000) problems.push(`the dry run planned this ${DRY_RUN_MINUTES} minutes ago or more`);
    if (plan && plan.toDelete.length) {
        const real = plan.toDelete.map(build => build.uuid);
        if (record.toDelete.join() !== real.join()) problems.push(`the dry run planned to delete ${record.toDelete.join(', ') || 'nothing'}, and this plan deletes ${real.join(', ')}`);
    }
    return problems;
}
