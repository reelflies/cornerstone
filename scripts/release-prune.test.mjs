// Tests W0-3's prune of My Themes (scripts/release-prune.mjs) offline: the selection on recorded
// GET /v3/themes and active-theme shapes, the log rows, and the deletions with a stubbed client.
// No test reaches the store.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    KEEP_NEWEST, PRUNE_NAME, REQUIRED_CHANNELS, describePlan, planPrune, runPrune, uncommittedProblems,
} from './release-prune.mjs';
import {
    addMyThemesRow, addReleaseEntry, formatMyThemesRow, formatReleaseEntry, myThemesRows, RELEASES_TEMPLATE,
} from './release-log.mjs';

const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const sha = n => `${String(n).repeat(7).slice(0, 7)}${'0'.repeat(33)}`;
const zip = n => `${String(n).repeat(64).slice(0, 64)}`;

// A RELEASES.md entry, as release.sh step 7 writes it: build n pushed at `timestamp`.
function entry(n, timestamp, {
    channel = 1895766, ranBefore = uuid(n), name = 'ReelFlies', version = '6.22.0', themeUuid = uuid(n),
} = {}) {
    return formatReleaseEntry({
        timestamp,
        channel,
        channelName: channel === 1 ? 'reelflies.ca' : 'ReelFlies_CA',
        variation: channel === 1 ? 'ReelFlies CA channel 1' : 'ReelFlies CA',
        theme: { uuid: themeUuid, name, version },
        previousThemeUuid: ranBefore,
        git: { sha: sha(n), branch: 'master' },
        bundle: {
            file: `reelflies-ca-6.22.0-${n}.zip`, bytes: 100, sha256: zip(n), mainJsBytes: 50,
        },
        step1: {
            replacing: null, overwritten: [], unpublished: [], changedInRepo: [], base: null, baseNote: 'test',
        },
        guard: { values: [], newSwitches: [] },
        verify: { problems: [] },
        operator: 'test',
        confirmation: { mode: 'typed' },
        calendar: { line: 'Release calendar: test' },
        pairedChannel1: null,
    });
}

const log = (...entries) => entries.reduce((markdown, text) => addReleaseEntry(markdown, text), RELEASES_TEMPLATE);
const day = n => `2026-10-${String(n).padStart(2, '0')}T09:00:00.000Z`;

// GET /v3/themes rows (trimmed), as the store returned them on 2026-10-05
// (plan/reference/theme-configs-2026-10-05/themes.json): is_active was true on exactly the themes a
// channel ran (Hero-2024-2.9.5-US on 1 and 1855224, Cavio on 1895766), and false on the old Hero
// builds. is_private is another column: true on the pushed Hero builds, false on Cavio.
const theme = (id, name = PRUNE_NAME, extra = {}) => ({
    uuid: id, name, is_private: true, is_active: false, variations: [], updated_at: '2026-10-06T14:30:00Z', ...extra,
});
const OTHERS = [
    theme('e3d82ce0-9bae-0133-0de7-525400970412', 'Cornerstone', { is_private: false }),
    theme('786ab980-0000-0000-0000-000000000000', 'Hero-2024-2.9.5'),
    theme('7c519850-0000-0000-0000-000000000000', 'Hero-2024-2.9.5-US', { is_active: true }),
    theme('25121d00-dd0c-013d-4919-76cf528056e2', 'Cavio', { is_private: false, is_active: true }),
];
const HERO_US = '7c519850-0000-0000-0000-000000000000';

// Six builds, all "ReelFlies" 6.22.0, pushed to 1895766 one a day; build 6 runs there now.
const SIX = log(...[1, 2, 3, 4, 5, 6].map(n => entry(n, day(n), { ranBefore: n === 1 ? '25121d00-dd0c-013d-4919-76cf528056e2' : uuid(n - 1) })));
const sixThemes = () => [...OTHERS, ...[1, 2, 3, 4, 5, 6].map(n => theme(uuid(n)))];
const active = (ca = uuid(6), extra = {}) => ({
    1: HERO_US, 1855224: HERO_US, 1895766: ca, ...extra,
});

const decisions = plan => Object.fromEntries(plan.builds.map(build => [build.uuid, build.action]));
const deleted = plan => plan.toDelete.map(build => build.uuid);

test('W0-3: the prune deletes only themes named ReelFlies, keeps the newest three, and never touches another theme', () => {
    assert.equal(PRUNE_NAME, 'ReelFlies');
    assert.equal(KEEP_NEWEST, 3);
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    assert.deepEqual(deleted(plan), [uuid(1), uuid(2), uuid(3)], 'oldest first');
    assert.deepEqual(decisions(plan), {
        [uuid(6)]: 'keep', [uuid(5)]: 'keep', [uuid(4)]: 'keep', [uuid(3)]: 'delete', [uuid(2)]: 'delete', [uuid(1)]: 'delete',
    });
    assert.deepEqual(plan.others.map(other => other.name), ['Cornerstone', 'Hero-2024-2.9.5', 'Hero-2024-2.9.5-US', 'Cavio']);
    assert.equal(plan.themeCount, 10);
    assert.deepEqual(plan.channels, [1, 1855224, 1895766]);
});

test('W0-3: two builds with the same name and version are told apart by uuid, and ranked by RELEASES.md, never by name, version or updated_at', () => {
    // My Themes says build 1 was updated last and lists it first; RELEASES.md says it is the oldest.
    const themes = sixThemes().map(item => (item.uuid === uuid(1) ? { ...item, updated_at: '2026-12-31T00:00:00Z' } : item)).reverse();
    const plan = planPrune({ themes, activeByChannel: active(), markdown: SIX });
    assert.deepEqual(deleted(plan), [uuid(1), uuid(2), uuid(3)]);
    assert.ok(plan.builds.every(build => build.name === 'ReelFlies' && build.record.version === '6.22.0'));
});

test('W0-3: ranking goes by each entry\'s time, so an older entry a union merge left further down still ranks as older', () => {
    const merged = log(...[1, 2, 3, 5, 6, 4].map(n => entry(n, day(n))));
    assert.deepEqual(deleted(planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: merged })), [uuid(1), uuid(2), uuid(3)]);
    // Two in the same minute: the one further down is the newer, as for the channel's last release (W0-2).
    const sameMinute = log(...[1, 2, 3].map(n => entry(n, day(1))), entry(4, day(1)), entry(5, day(2)), entry(6, day(3)));
    assert.deepEqual(deleted(planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: sameMinute })), [uuid(1), uuid(2), uuid(3)]);
});

test('W0-3: a uuid pushed twice (a new version of the same theme) counts once, at its newest entry', () => {
    const markdown = log(...[1, 2, 3, 4, 5, 6].map(n => entry(n, day(n))), entry(1, day(7)));
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(uuid(1)), markdown });
    assert.deepEqual(deleted(plan), [uuid(2), uuid(3), uuid(4)]);
    assert.equal(plan.builds.find(build => build.uuid === uuid(1)).record.timestamp, '2026-10-07 09:00');
});

test('W0-3: a theme active on any channel is kept, however old', () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(uuid(6), { 1855224: uuid(1), 2000001: uuid(3) }), markdown: SIX });
    assert.deepEqual(deleted(plan), [uuid(2)]);
    const reasons = Object.fromEntries(plan.builds.map(build => [build.uuid, build.reasons.join('; ')]));
    assert.match(reasons[uuid(1)], /active on channel 1855224/);
    assert.match(reasons[uuid(3)], /active on channel 2000001/);
    assert.match(reasons[uuid(6)], /active on channel 1895766/);
});

// My Themes' is_active flag is the store's own "active somewhere" signal: on 2026-10-05 it was the
// only thing that flagged channel 1861300 (no site), which the channel reads missed then. So it keeps
// a theme, even one no channel read shows running, and the plan says so. It never deletes one.
test('W0-3: a ReelFlies build My Themes flags is_active is kept, even when no channel read shows it running', () => {
    const themes = sixThemes().map(item => (item.uuid === uuid(2) ? { ...item, is_active: true } : item));
    const plan = planPrune({ themes, activeByChannel: active(), markdown: SIX });
    assert.deepEqual(deleted(plan), [uuid(1), uuid(3)]);
    const kept = plan.builds.find(build => build.uuid === uuid(2));
    assert.equal(kept.action, 'keep');
    assert.deepEqual(kept.reasons, ['My Themes flags it is_active (active on a channel, perhaps one the reads didn\'t list)']);
    const text = describePlan(plan).join('\n');
    assert.match(text, new RegExp(`keep {5}${uuid(2)} ReelFlies 6\\.22\\.0, released 2026-10-02 09:00 UTC from 2222222: My Themes flags it is_active`));
    // A flag of false, or none at all, keeps nothing on its own.
    const unflagged = sixThemes().map(item => (item.uuid === uuid(1) ? { ...item, is_active: undefined } : item));
    assert.deepEqual(deleted(planPrune({ themes: unflagged, activeByChannel: active(), markdown: SIX })), [uuid(1), uuid(2), uuid(3)]);
});

test('W0-3: a ReelFlies theme RELEASES.md doesn\'t record is never deleted', () => {
    const themes = [...sixThemes(), theme(uuid(99)), theme(uuid(98))];
    const plan = planPrune({ themes, activeByChannel: active(), markdown: SIX });
    assert.deepEqual(deleted(plan), [uuid(1), uuid(2), uuid(3)]);
    const unknown = plan.builds.filter(build => !build.record);
    assert.deepEqual(unknown.map(build => [build.uuid, build.action]), [[uuid(99), 'keep'], [uuid(98), 'keep']]);
    assert.match(unknown[0].reasons.join(), /RELEASES\.md doesn't record it/);
    // Nor are they counted among the newest three.
    assert.ok(plan.builds.filter(build => build.reasons.some(reason => /newest 3/.test(reason))).every(build => build.record));
});

test('W0-3: a recorded uuid whose My Themes name isn\'t exactly ReelFlies is never deleted: it isn\'t a candidate at all', () => {
    const themes = sixThemes().map(item => {
        if (item.uuid === uuid(1)) return { ...item, name: 'Hero-2024' };
        if (item.uuid === uuid(2)) return { ...item, name: 'reelflies' };
        if (item.uuid === uuid(3)) return { ...item, name: 'ReelFlies ' };
        return item;
    });
    const plan = planPrune({ themes, activeByChannel: active(), markdown: SIX });
    assert.deepEqual(deleted(plan), []);
    assert.deepEqual(plan.builds.map(build => build.uuid), [uuid(6), uuid(5), uuid(4)]);
    assert.ok(plan.others.some(other => other.name === 'Hero-2024'));
});

test('W0-3: the rollback is kept: the previous release on 1895766 and on channel 1, and the theme each ran before its latest release', () => {
    // Builds 7 to 9 are newer; 1 and 2 are each channel's previous release, and 3 the theme
    // channel 1 ran before its latest release (pushed by hand there, say).
    const markdown = log(
        entry(1, day(1)),
        entry(2, day(2), { channel: 1, ranBefore: uuid(3) }),
        entry(4, day(4), { channel: 1, ranBefore: uuid(3) }),
        entry(5, day(5)),
        ...[7, 8, 9].map(n => entry(n, day(n), { channel: 1855225 })),
        entry(10, day(10)),
    );
    const themes = [...OTHERS, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => theme(uuid(n)))];
    const plan = planPrune({ themes, activeByChannel: active(uuid(10), { 1: uuid(4), 1855225: uuid(9) }), markdown });
    const reasons = Object.fromEntries(plan.builds.map(build => [build.uuid, build.reasons.join('; ')]));
    assert.match(reasons[uuid(5)], /the previous release on channel 1895766 \(the rollback\)/);
    assert.match(reasons[uuid(2)], /the previous release on channel 1 \(the rollback\)/);
    assert.match(reasons[uuid(10)], /the latest release on channel 1895766/);
    assert.deepEqual(deleted(plan), [uuid(1), uuid(7)], 'build 3 and build 6 aren\'t recorded as releases, so they stay too');
});

test('W0-3: the prune refuses a plan that didn\'t check channels 1, 1855224 and 1895766, and every channel RELEASES.md names', () => {
    assert.deepEqual(REQUIRED_CHANNELS, [1, 1855224, 1895766]);
    assert.throws(() => planPrune({ themes: sixThemes(), activeByChannel: { 1: HERO_US, 1895766: uuid(6) }, markdown: SIX }), /didn't check channel 1855224/);
    const markdown = log(entry(1, day(1), { channel: 1855225 }), ...[2, 3, 4, 5, 6].map(n => entry(n, day(n))));
    assert.throws(() => planPrune({ themes: sixThemes(), activeByChannel: active(), markdown }), /didn't check channel 1855225/);
    assert.throws(() => planPrune({ themes: sixThemes(), activeByChannel: { ...active(), 1855224: null }, markdown: SIX }), /channel 1855224's active theme/);
    assert.throws(() => planPrune({ themes: sixThemes(), activeByChannel: { ...active(), 1861300: '' }, markdown: SIX }), /couldn't read channel 1861300's active theme/, 'any channel read, not only the required ones');
});

test('W0-3: with three ReelFlies builds or fewer, nothing is deleted', () => {
    const markdown = log(...[1, 2, 3].map(n => entry(n, day(n))));
    const plan = planPrune({ themes: [...OTHERS, ...[1, 2, 3].map(n => theme(uuid(n)))], activeByChannel: active(uuid(3)), markdown });
    assert.deepEqual(deleted(plan), []);
    // The repo's own RELEASES.md: one build, which runs on 1895766.
    const repo = fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8');
    const live = '58abad50-a3c0-013f-e2b6-2ec98cc9ce73';
    assert.deepEqual(deleted(planPrune({ themes: [...OTHERS, theme(live)], activeByChannel: active(live), markdown: repo })), []);
});

test('W0-3: the plan names each ReelFlies theme with its decision and reasons, and counts the others', () => {
    const text = describePlan(planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX })).join('\n');
    assert.match(text, /My Themes holds 10 of 20 themes; 6 named ReelFlies; channels checked: 1, 1855224, 1895766/);
    // Which theme each channel runs, so a channel the store lists without a site shows what it runs.
    assert.match(text, new RegExp(`\\n {2}each channel runs: 1 Hero-2024-2\\.9\\.5-US \\(7c519850\\), 1855224 Hero-2024-2\\.9\\.5-US \\(7c519850\\), 1895766 ReelFlies \\(${uuid(6).slice(0, 8)}\\)\\n`));
    const unlisted = describePlan(planPrune({ themes: sixThemes(), activeByChannel: active(uuid(6), { 1861300: 'ffffffff-0000-0000-0000-000000000000' }), markdown: SIX })).join('\n');
    assert.match(unlisted, /1861300 a theme not in My Themes \(ffffffff\)/);
    assert.match(text, new RegExp(`keep {5}${uuid(6)} ReelFlies 6\\.22\\.0, released 2026-10-06 09:00 UTC from 6666666: active on channel 1895766; the latest release on channel 1895766; one of the newest 3`));
    assert.match(text, new RegExp(`delete {3}${uuid(1)} ReelFlies 6\\.22\\.0, released 2026-10-01 09:00 UTC from 1111111: older than the newest 3, active on no channel, not flagged is_active, and not a rollback`));
    // Each other theme with its uuid, and the flag, so a dry run shows whether a theme no channel
    // runs any more (Cavio 25121d00 since 2026-10-06) is still flagged.
    assert.match(text, /4 other theme\(s\) aren't named ReelFlies, so the prune never touches them: Cornerstone \(e3d82ce0\), Hero-2024-2\.9\.5 \(786ab980\), Hero-2024-2\.9\.5-US \(7c519850, flagged is_active\), Cavio \(25121d00, flagged is_active\)/);
    assert.match(text, /3 to delete/);
});

// --- Deleting --------------------------------------------------------------------------------

function stubStore(themes, { failOn = null, keep = [] } = {}) {
    const present = new Set(themes.map(item => item.uuid));
    const calls = [];
    return {
        calls,
        deleteTheme: async id => {
            calls.push(id);
            if (id === failOn) throw new Error('Request failed with status code 500');
            if (!keep.includes(id)) present.delete(id);
        },
        readThemes: async () => themes.filter(item => present.has(item.uuid)),
    };
}

test('W0-3: a real prune deletes the planned themes oldest first, logs a row after each, and checks each is gone', async () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const store = stubStore(sixThemes());
    let markdown = SIX;
    const result = await runPrune({
        plan,
        deleteTheme: store.deleteTheme,
        readThemes: store.readThemes,
        record: build => {
            markdown = addMyThemesRow(markdown, formatMyThemesRow({
                timestamp: '2026-10-07T10:00:00.000Z', action: 'deleted (--prune-only)', uuid: build.uuid, name: build.name, version: build.record.version, sha: build.record.sha, zipSha256: build.record.zipSha256, operator: 'test',
            }));
        },
    });
    assert.deepEqual(store.calls, [uuid(1), uuid(2), uuid(3)]);
    assert.deepEqual(result, { deleted: [uuid(1), uuid(2), uuid(3)], failed: null, stillThere: [] });
    assert.deepEqual(myThemesRows(markdown).map(row => [row.uuid, row.sha, row.zipSha256]), [1, 2, 3].map(n => [uuid(n), sha(n), zip(n)]));
});

test('W0-3: a failed deletion stops the prune: nothing after it is tried, and what was deleted is logged', async () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const store = stubStore(sixThemes(), { failOn: uuid(2) });
    const recorded = [];
    const result = await runPrune({
        plan, deleteTheme: store.deleteTheme, readThemes: store.readThemes, record: build => recorded.push(build.uuid),
    });
    assert.deepEqual(store.calls, [uuid(1), uuid(2)]);
    assert.deepEqual(recorded, [uuid(1)]);
    assert.deepEqual(result.deleted, [uuid(1)]);
    assert.equal(result.failed.uuid, uuid(2));
    assert.match(result.failed.message, /status code 500/);
});

test('W0-3: a theme still in My Themes after its deletion answered is reported, not logged as gone', async () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const store = stubStore(sixThemes(), { keep: [uuid(3)] });
    const result = await runPrune({
        plan, deleteTheme: store.deleteTheme, readThemes: store.readThemes, record: () => {},
    });
    assert.deepEqual(result.stillThere, [uuid(3)]);
});

test('W0-3: a plan with nothing to delete calls nothing', async () => {
    const plan = planPrune({ themes: sixThemes().slice(0, 7), activeByChannel: active(uuid(3)), markdown: log(...[1, 2, 3].map(n => entry(n, day(n)))) });
    const store = stubStore([]);
    assert.deepEqual(await runPrune({
        plan, deleteTheme: store.deleteTheme, readThemes: store.readThemes, record: () => assert.fail('nothing to record'),
    }), { deleted: [], failed: null, stillThere: [] });
    assert.deepEqual(store.calls, []);
});

// --- What a real --prune-only may run from ------------------------------------------------------

test('W0-3: a real --prune-only may leave only RELEASES.md uncommitted, so no edited rule decides what is deleted', () => {
    assert.deepEqual(uncommittedProblems(''), []);
    assert.deepEqual(uncommittedProblems(' M RELEASES.md\n'), []);
    assert.deepEqual(uncommittedProblems(' M RELEASES.md\n M scripts/release-prune.mjs\n?? notes.txt\n'), [
        'uncommitted changes besides RELEASES.md: scripts/release-prune.mjs, notes.txt',
    ]);
});

// --- What the prune modules may call ----------------------------------------------------------

test('W0-3: the prune modules never activate or upload a theme, and only release-themes.mjs talks to the store', () => {
    for (const file of ['./release-prune.mjs', './release-themes.mjs']) {
        const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /activateTheme|postTheme|actions\/activate/, `${file} activates or uploads nothing`);
    }
    const prune = fs.readFileSync(new URL('./release-prune.mjs', import.meta.url), 'utf8');
    assert.deepEqual([...prune.matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1]).sort(), ['./release-checks.mjs', './release-log.mjs']);
    assert.doesNotMatch(prune, /fetch\(|stencil-cli|deleteThemeById/);
});
