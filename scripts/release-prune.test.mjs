// Tests W0-3's prune of My Themes (scripts/release-prune.mjs) offline: the selection on recorded
// GET /v3/themes and active-theme shapes, the log rows, and the deletions with a stubbed client.
// No test reaches the store.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { inspect } from 'node:util';
import {
    DRY_RUN_MINUTES, KEEP_NEWEST, PRUNE_NAME, REQUIRED_CHANNELS, describePlan, describeRunProblems, dryRunProblems, dryRunRecord, planPrune, releasesEditProblems, runPrune,
    uncommittedProblems,
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

test('W0-3: a recorded uuid whose My Themes name isn\'t exactly ReelFlies or "ReelFlies (n)" is never deleted: it isn\'t a candidate at all', () => {
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
    // W0-3b: only the store's own suffix counts, once, with a whole number from 1. Twelve recorded
    // builds whose names only look like it: none is a candidate, so none is deleted.
    const lookalikes = [
        'ReelFlies(1)', 'ReelFlies  (1)', 'ReelFlies (0)', 'ReelFlies (01)', 'ReelFlies (x)', 'ReelFlies ()',
        'ReelFlies (1) (1)', 'ReelFlies (1) copy', 'reelflies (1)', 'ReelFlies US (1)', 'Cavio (1)', 'ReelFlies (１)',
    ];
    const markdown = log(...lookalikes.map((name, i) => entry(i + 1, day(i + 1))));
    const named = [...OTHERS, ...lookalikes.map((name, i) => theme(uuid(i + 1), name))];
    const lookalikePlan = planPrune({ themes: named, activeByChannel: active(HERO_US), markdown });
    assert.deepEqual(lookalikePlan.builds, []);
    assert.deepEqual(deleted(lookalikePlan), []);
    assert.deepEqual(lookalikePlan.others.map(other => other.name), [...OTHERS.map(other => other.name), ...lookalikes]);
});

// W0-3b: the store named the first agent push "ReelFlies (1)", because My Themes already held a
// "ReelFlies" (RELEASES.md 2026-10-07 03:07 UTC), and later uploads are expected to be numbered on,
// "ReelFlies (2)" and so on (unseen until the next push; default 1, revisitable). Those are
// ReelFlies builds too, and the number in the name ranks nothing: RELEASES.md doesn't record it, and
// only RELEASES.md ranks builds.
const SUFFIXES = {
    1: 'ReelFlies (4)', 2: 'ReelFlies', 3: 'ReelFlies (1)', 4: 'ReelFlies (2)', 5: 'ReelFlies (12)', 6: 'ReelFlies (3)',
};
const suffixedThemes = () => [...OTHERS, ...[1, 2, 3, 4, 5, 6].map(n => theme(uuid(n), SUFFIXES[n]))];

test('W0-3b: themes named "ReelFlies (n)" are ReelFlies builds, ranked by RELEASES.md like the others, never by the number in their name', () => {
    const plan = planPrune({ themes: suffixedThemes(), activeByChannel: active(), markdown: SIX });
    assert.deepEqual(plan.builds.map(build => [build.uuid, build.name]), [6, 5, 4, 3, 2, 1].map(n => [uuid(n), SUFFIXES[n]]));
    assert.deepEqual(deleted(plan), [uuid(1), uuid(2), uuid(3)], 'oldest first, by RELEASES.md');
    assert.deepEqual(plan.others.map(other => other.name), ['Cornerstone', 'Hero-2024-2.9.5', 'Hero-2024-2.9.5-US', 'Cavio']);
    // The plan shows each build under its name in My Themes.
    const text = describePlan(plan).join('\n');
    assert.match(text, /6 named ReelFlies or "ReelFlies \(n\)"/);
    assert.match(text, new RegExp(`1895766 ReelFlies \\(3\\) \\(${uuid(6).slice(0, 8)}\\)`));
    assert.match(text, new RegExp(`delete {3}${uuid(1)} ReelFlies \\(4\\) 6\\.22\\.0, released 2026-10-01 09:00 UTC from 1111111: older than the newest 3`));
    assert.match(text, new RegExp(`delete {3}${uuid(2)} ReelFlies 6\\.22\\.0, released 2026-10-02 09:00 UTC`));
    assert.match(text, new RegExp(`keep {5}${uuid(5)} ReelFlies \\(12\\) 6\\.22\\.0, released 2026-10-05 09:00 UTC from 5555555: .*the previous release on channel 1895766 \\(the rollback\\); one of the newest 3`));
});

test('W0-3b: every other rule still keeps a "ReelFlies (n)" build: recorded by uuid, inactive everywhere, not is_active, not a rollback, outside the newest three', () => {
    // Builds 1 to 9 on 1895766, one a day, all suffixed but build 2; build 9 runs there now.
    const NINE = log(...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => entry(n, day(n), { ranBefore: uuid(n - 1) })));
    const named = n => (n === 2 ? 'ReelFlies' : `ReelFlies (${n})`);
    const themes = [...OTHERS, ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => theme(uuid(n), named(n), n === 3 ? { is_active: true } : {})), theme(uuid(99), 'ReelFlies (99)')];
    const plan = planPrune({ themes, activeByChannel: active(uuid(9), { 1855224: uuid(4) }), markdown: NINE });
    const reasons = Object.fromEntries(plan.builds.map(build => [build.uuid, build.reasons.join('; ')]));
    assert.match(reasons[uuid(99)], /RELEASES\.md doesn't record it as a release/, 'an unrecorded uuid');
    assert.match(reasons[uuid(4)], /active on channel 1855224/, 'active on a channel');
    assert.match(reasons[uuid(3)], /My Themes flags it is_active/, 'is_active');
    assert.match(reasons[uuid(9)], /the latest release on channel 1895766/, 'the latest release');
    assert.match(reasons[uuid(8)], /the previous release on channel 1895766 \(the rollback\)/, 'the rollback');
    assert.deepEqual([9, 8, 7].map(n => /one of the newest 3/.test(reasons[uuid(n)])), [true, true, true], 'the newest three');
    assert.deepEqual(deleted(plan), [uuid(1), uuid(2), uuid(5), uuid(6)], 'only builds no rule keeps, "ReelFlies" and "ReelFlies (n)" alike, oldest first');
});

// The repo's first two RELEASES.md entries, verbatim: 58abad50 pushed as "ReelFlies" on 2026-10-06,
// then 174ad580, which the store named "ReelFlies (1)", on 2026-10-07 (the first agent push). They
// are frozen here, not read from RELEASES.md, because the next 1895766 entry changes the rollback.
const FIRST_AGENT_PUSH_ENTRIES = [
    [
        '### 2026-10-06 14:30 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
        '',
        '- Theme: ReelFlies 6.22.0, uuid `58abad50-a3c0-013f-e2b6-2ec98cc9ce73`',
        '- Commit: `5d0d0cb8ca42405d8555de6a84f20843060d7cde` on `master`',
        '- Bundle: `reelflies-ca-6.22.0-5d0d0cb.zip`, 10,940,174 B, sha256 `367071ace794697e59a36129ba4f958a2d27daf85aa9bf73411d42c6cfc763dc`',
        '- main.js: 245,069 B',
        '- Step 1: first release, replacing Cavio · variation "Natural" (theme 25121d00-dd0c-013d-4919-76cf528056e2)',
        '- rf_* values pushed: none',
        '- New switches: none',
        '- Verify: the live saved settings match config.json',
        '- Operator: Shaun Bathgate',
        '',
    ].join('\n'),
    [
        '### 2026-10-07 03:07 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
        '',
        '- Theme: ReelFlies 6.22.0, uuid `174ad580-a42a-013f-3c01-06627e5707c7`',
        '- New uuid: yes; before the push the channel ran theme `58abad50-a3c0-013f-e2b6-2ec98cc9ce73`',
        '- Commit: `a30586f5913f2ae391729c9fe0c05885e8712326` on `master`',
        '- Bundle: `reelflies-ca-6.22.0-a30586f.zip`, 10,938,401 B, sha256 `5ae0f7917aa83549954f5f1c9a58bfe548820e9c6a4df4dd0bac77757c6ed1f2`',
        '- main.js: 245,069 B',
        '- Step 1: no differences from the live saved settings',
        '- Changed in repo: none since `5d0d0cb`, the channel\'s last release',
        '- rf_* values pushed: none',
        '- New switches: none',
        '- Verify: 1 problem(s): the live theme is "ReelFlies (1)", not "ReelFlies"',
        '- Operator: Shaun Bathgate',
        '- Confirmation: non-interactive (agent), `--confirm-nonprod 1895766`',
        '',
    ].join('\n'),
];

test('W0-3b: the store as the first agent push left it: "ReelFlies" and "ReelFlies (1)" are both ReelFlies builds, and both stay', () => {
    // The fixture is still the repo's own record: RELEASES.md only gains entries, so both stay in it.
    const repo = fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8');
    for (const text of FIRST_AGENT_PUSH_ENTRIES) assert.ok(repo.includes(text), `RELEASES.md no longer holds, verbatim:\n${text}`);
    const first = '58abad50-a3c0-013f-e2b6-2ec98cc9ce73';
    const second = '174ad580-a42a-013f-3c01-06627e5707c7';
    // 1895766 runs 174ad580.
    const plan = planPrune({ themes: [...OTHERS, theme(first), theme(second, 'ReelFlies (1)')], activeByChannel: active(second), markdown: log(...FIRST_AGENT_PUSH_ENTRIES) });
    assert.deepEqual(plan.builds.map(build => [build.uuid, build.name, build.action]), [[second, 'ReelFlies (1)', 'keep'], [first, 'ReelFlies', 'keep']]);
    assert.match(plan.builds[1].reasons.join('; '), /the theme channel 1895766 ran before its latest release \(the rollback\)/);
    assert.deepEqual(deleted(plan), []);
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
    assert.match(text, /My Themes holds 10 of 20 themes; 6 named ReelFlies or "ReelFlies \(n\)"; channels checked: 1, 1855224, 1895766/);
    // Which theme each channel runs, so a channel the store lists without a site shows what it runs.
    assert.match(text, new RegExp(`\\n {2}each channel runs: 1 Hero-2024-2\\.9\\.5-US \\(7c519850\\), 1855224 Hero-2024-2\\.9\\.5-US \\(7c519850\\), 1895766 ReelFlies \\(${uuid(6).slice(0, 8)}\\)\\n`));
    const unlisted = describePlan(planPrune({ themes: sixThemes(), activeByChannel: active(uuid(6), { 1861300: 'ffffffff-0000-0000-0000-000000000000' }), markdown: SIX })).join('\n');
    assert.match(unlisted, /1861300 a theme not in My Themes \(ffffffff\)/);
    assert.match(text, new RegExp(`keep {5}${uuid(6)} ReelFlies 6\\.22\\.0, released 2026-10-06 09:00 UTC from 6666666: active on channel 1895766; the latest release on channel 1895766; one of the newest 3`));
    assert.match(text, new RegExp(`delete {3}${uuid(1)} ReelFlies 6\\.22\\.0, released 2026-10-01 09:00 UTC from 1111111: older than the newest 3, active on no channel, not flagged is_active, and not a rollback`));
    // Each other theme with its uuid, and the flag, so a dry run shows whether a theme no channel
    // runs any more (Cavio 25121d00 since 2026-10-06) is still flagged.
    assert.match(text, /4 other theme\(s\) aren't named ReelFlies or "ReelFlies \(n\)", so the prune never touches them: Cornerstone \(e3d82ce0\), Hero-2024-2\.9\.5 \(786ab980\), Hero-2024-2\.9\.5-US \(7c519850, flagged is_active\), Cavio \(25121d00, flagged is_active\)/);
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
    assert.deepEqual(result, {
        deleted: [uuid(1), uuid(2), uuid(3)], failed: null, unlogged: null, stillThere: [], rereadFailed: null,
    });
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
    }), {
        deleted: [], failed: null, unlogged: null, stillThere: [], rereadFailed: null,
    });
    assert.deepEqual(store.calls, []);
});

// stencil-cli's client rejects with axios's error, whose config and request hold the Stencil-CLI
// token in a header. Node prints all of that for an error nobody catches.
const FAKE = 'faketoken0123456789abcdefghijkl';
function axiosError(message, status) {
    const config = { method: 'get', url: 'https://api.bigcommerce.com/stores/abc123/v3/themes', headers: { Accept: 'application/json', 'x-auth-token': FAKE } };
    return Object.assign(new Error(message), {
        name: 'AxiosError', code: 'ERR_BAD_RESPONSE', config, request: { _header: `GET /stores/abc123/v3/themes HTTP/1.1\r\nx-auth-token: ${FAKE}\r\n` }, response: { status, config },
    });
}
const shows = value => inspect(value, { depth: 10, showHidden: true });

test('W0-3: a failed re-read of My Themes after a deletion comes back as its message only: the error, with the token in its request, never leaves runPrune', async () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const store = stubStore(sixThemes());
    const recorded = [];
    const result = await runPrune({
        plan,
        deleteTheme: store.deleteTheme,
        readThemes: async () => { throw axiosError('Request failed with status code 502', 502); },
        record: build => recorded.push(build.uuid),
    });
    assert.deepEqual(recorded, [uuid(1), uuid(2), uuid(3)], 'every deletion is still logged');
    assert.deepEqual(result, {
        deleted: [uuid(1), uuid(2), uuid(3)], failed: null, unlogged: null, stillThere: [], rereadFailed: 'Request failed with status code 502',
    });
    assert.ok(!shows(result).includes(FAKE));
});

test('W0-3: a failed deletion keeps only its message too', async () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const result = await runPrune({
        plan, deleteTheme: async () => { throw axiosError('Request failed with status code 429', 429); }, readThemes: async () => assert.fail('nothing was deleted, so nothing is read again'), record: () => assert.fail('nothing to record'),
    });
    assert.deepEqual(result.failed, { uuid: uuid(1), message: 'Request failed with status code 429' });
    assert.ok(!shows(result).includes(FAKE));
});

test('W0-3: a deletion whose log row can\'t be written stops the prune, naming the uuid the store deleted', async () => {
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const store = stubStore(sixThemes());
    const result = await runPrune({
        plan,
        deleteTheme: store.deleteTheme,
        readThemes: store.readThemes,
        record: build => {
            if (build.uuid === uuid(2)) throw new Error('ENOSPC: no space left on device, write');
        },
    });
    assert.deepEqual(store.calls, [uuid(1), uuid(2)], 'nothing after it is tried');
    assert.deepEqual(result.deleted, [uuid(1), uuid(2)], 'the store deleted both');
    assert.deepEqual(result.unlogged, { uuid: uuid(2), message: 'ENOSPC: no space left on device, write' });
    assert.equal(result.failed, null);
    assert.deepEqual(result.stillThere, [], 'My Themes is still read again');
});

test('W0-3: a real prune\'s stop names every deletion the log misses, a failed re-read and a theme still listed, and what is logged', () => {
    const none = {
        deleted: [], failed: null, unlogged: null, stillThere: [], rereadFailed: null,
    };
    assert.equal(describeRunProblems({ ...none, deleted: [uuid(1)] }), null, 'no problem, no stop');
    const unlogged = describeRunProblems({ ...none, deleted: [uuid(1), uuid(2)], unlogged: { uuid: uuid(2), message: 'ENOSPC: no space left on device' } });
    assert.match(unlogged, new RegExp(`the store deleted ${uuid(2)}, but its row couldn't be written in RELEASES\\.md \\(ENOSPC: no space left on device\\): add the row to RELEASES\\.md by hand; nothing after it was tried`));
    assert.match(unlogged, new RegExp(`1 deleted theme\\(s\\) logged in RELEASES\\.md: ${uuid(1)}`));
    const failed = describeRunProblems({ ...none, deleted: [uuid(1)], failed: { uuid: uuid(2), message: 'Request failed with status code 500' } });
    assert.match(failed, new RegExp(`deleting ${uuid(2)} failed: Request failed with status code 500; nothing after it was tried`));
    const reread = describeRunProblems({ ...none, deleted: [uuid(1)], rereadFailed: 'GET /v3/themes failed: Request failed with status code 502' });
    assert.match(reread, /My Themes couldn't be read again to check the deletions \(GET \/v3\/themes failed: Request failed with status code 502\): check My Themes by hand/);
    const still = describeRunProblems({ ...none, deleted: [uuid(1), uuid(3)], stillThere: [uuid(3)] });
    assert.match(still, new RegExp(`My Themes still lists ${uuid(3)} after the store answered its deletion: check My Themes by hand`));
    assert.match(still, /2 deleted theme\(s\) logged in RELEASES\.md/);
    assert.match(describeRunProblems({ ...none, failed: { uuid: uuid(1), message: 'x' } }), /0 deleted theme\(s\) logged in RELEASES\.md$/);
});

// --- What a real --prune-only may run from ------------------------------------------------------

test('W0-3: a real --prune-only may leave only RELEASES.md uncommitted, so no edited rule decides what is deleted', () => {
    assert.deepEqual(uncommittedProblems(''), []);
    assert.deepEqual(uncommittedProblems(' M RELEASES.md\n'), []);
    assert.deepEqual(uncommittedProblems(' M RELEASES.md\n M scripts/release-prune.mjs\n?? notes.txt\n'), [
        'uncommitted changes besides RELEASES.md: scripts/release-prune.mjs, notes.txt',
    ]);
});

test('W0-3: a real prune lets RELEASES.md only gain lines since HEAD (a release\'s new entry, the prune\'s own rows), so an edited or removed line never decides what is deleted', () => {
    // `git diff --numstat HEAD -- RELEASES.md`
    assert.deepEqual(releasesEditProblems(''), []);
    assert.deepEqual(releasesEditProblems('16\t0\tRELEASES.md\n'), []);
    assert.deepEqual(releasesEditProblems('1\t1\tRELEASES.md\n'), [
        'RELEASES.md has uncommitted edits that change or remove 1 line(s) since HEAD: a real prune lets it only gain lines, such as a release\'s new entry',
    ]);
    assert.deepEqual(releasesEditProblems('-\t-\tRELEASES.md\n'), ['RELEASES.md has uncommitted edits git can\'t count: a real prune lets it only gain lines, such as a release\'s new entry']);
});

test('W0-3: a real --prune-only needs a dry --prune-only from this checkout, at the same commit, within the hour, and deletes only what it planned', () => {
    assert.equal(DRY_RUN_MINUTES, 60);
    const plan = planPrune({ themes: sixThemes(), activeByChannel: active(), markdown: SIX });
    const head = sha(9);
    const record = dryRunRecord({
        plan, head, source: 'store', now: new Date('2026-10-07T10:00:00Z'),
    });
    assert.deepEqual(record, {
        head, toDelete: [uuid(1), uuid(2), uuid(3)], plannedAt: '2026-10-07T10:00:00.000Z', source: 'store',
    });
    const later = new Date('2026-10-07T10:59:00Z');
    // Before the store is read (no plan yet), and after.
    assert.deepEqual(dryRunProblems({ record, head, now: later }), []);
    assert.deepEqual(dryRunProblems({
        record, head, plan, now: later,
    }), []);
    const problems = changes => dryRunProblems({
        record, head, plan, now: later, ...changes,
    }).join('\n');
    assert.match(problems({ record: null }), /no --prune-only --dry-run has run in this checkout since the last real one/);
    assert.match(problems({ record: null, plan: null }), /no --prune-only --dry-run/, 'checked before the store is read');
    assert.match(problems({ record: { unreadable: 'Unexpected token' } }), /the dry run's record can't be read \(Unexpected token\)/);
    assert.match(problems({ record: { ...record, source: 'fixture' } }), /the dry run read RF_RELEASE_THEMES_FIXTURE, not the store/);
    assert.match(problems({ head: sha(8) }), new RegExp(`the dry run ran at ${sha(9).slice(0, 7)}, and this checkout is at ${sha(8).slice(0, 7)}`));
    assert.match(problems({ now: new Date('2026-10-07T11:00:00Z') }), /the dry run planned this 60 minutes ago or more/);
    assert.match(problems({ now: new Date('2026-10-07T09:59:00Z') }), /the dry run's time is later than now/);
    assert.match(problems({ record: { ...record, plannedAt: 'soon' } }), /can't be read/);
    assert.deepEqual(dryRunProblems({ record: { ...record, toDelete: undefined }, head, now: later }), ['the dry run\'s record holds no plan']);
    // The store changed since: build 2 runs on a channel now, so this plan deletes 1 and 3 only.
    const fewer = planPrune({ themes: sixThemes(), activeByChannel: active(uuid(6), { 2000001: uuid(2) }), markdown: SIX });
    assert.match(problems({ plan: fewer }), new RegExp(`the dry run planned to delete ${uuid(1)}, ${uuid(2)}, ${uuid(3)}, and this plan deletes ${uuid(1)}, ${uuid(3)}`));
    assert.match(problems({ record: { ...record, toDelete: [] } }), /the dry run planned to delete nothing, and this plan deletes/);
    // A plan that deletes nothing matches any record.
    const nothing = planPrune({ themes: sixThemes().slice(0, 7), activeByChannel: active(uuid(3)), markdown: log(...[1, 2, 3].map(n => entry(n, day(n)))) });
    assert.deepEqual(dryRunProblems({
        record, head, plan: nothing, now: later,
    }), []);
});

// --- What the prune modules may call ----------------------------------------------------------

test('W0-3: the prune modules never activate or upload a theme, and only release-themes.mjs talks to the store', () => {
    for (const file of ['./release-prune.mjs', './release-themes.mjs']) {
        const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /activateTheme|postTheme|actions\/activate/, `${file} activates or uploads nothing`);
    }
    const imports = source => [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1]).sort();
    const prune = fs.readFileSync(new URL('./release-prune.mjs', import.meta.url), 'utf8');
    assert.deepEqual(imports(prune), ['./release-checks.mjs', './release-diff.mjs', './release-log.mjs']);
    assert.doesNotMatch(prune, /fetch\(|stencil-cli|deleteThemeById/);
    // W0-3b: release-diff.mjs, for isStoreNameFor, stays pure: Node's util only, and no store call.
    const diff = fs.readFileSync(new URL('./release-diff.mjs', import.meta.url), 'utf8');
    assert.deepEqual(imports(diff), ['util']);
    assert.doesNotMatch(diff, /fetch\(|stencil-cli|deleteThemeById|activateTheme|postTheme|actions\/activate/);
});
