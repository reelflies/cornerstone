import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    addMyThemesRow, addReleaseEntry, describeStep1, formatMyThemesRow, formatPushSummary, formatReleaseEntry, lastRelease, MY_THEMES_HEADER, myThemesRows,
    releaseBuilds, releaseEntries, releasedThemeUuids, RELEASES_TEMPLATE,
} from './release-log.mjs';

const release = {
    timestamp: '2026-10-05T18:04:09.123Z',
    channel: 1895766,
    channelName: 'ReelFlies_CA',
    variation: 'ReelFlies CA',
    theme: { uuid: '9f0c2a10-0000-0000-0000-000000000001', name: 'Cornerstone', version: '6.22.0' },
    previousThemeUuid: '9f0c2a10-0000-0000-0000-000000000001',
    git: { sha: '1be9fb20ffd985c26c59c5b5fcd28006418d9a08', branch: 'master' },
    bundle: {
        file: 'reelflies-ca-6.22.0-1be9fb2.zip', bytes: 9876543, sha256: 'ab12', mainJsBytes: 307607,
    },
    step1: {
        replacing: null, overwritten: [], unpublished: [], changedInRepo: [], base: { sha: '0a1b2c3d4e5f60718293a4b5c6d7e8f901234567', timestamp: '2026-10-04 10:00' },
    },
    guard: { values: [], newSwitches: [] },
    verify: { problems: [] },
    operator: 'Shaun Bathgate',
    confirmation: { mode: 'typed' },
    calendar: { line: 'Release calendar: no Flip date yet (provisional; ticket 10: Flip date after ticket 26), so nothing is limited.' },
    pairedChannel1: null,
};
const withSwitches = {
    ...release,
    guard: {
        values: [{ key: 'rf_cart_state', value: true }, { key: 'rf_menu_type_ids', value: '' }, { key: 'rf_quick_add', value: false }],
        newSwitches: ['rf_cart_state'],
    },
};

test('a release entry records where, what, from which commit and bundle, step 1 and who', () => {
    assert.equal(formatReleaseEntry(release), [
        '### 2026-10-05 18:04 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA',
        '',
        '- Theme: Cornerstone 6.22.0, uuid `9f0c2a10-0000-0000-0000-000000000001`',
        '- New uuid: no, a new version of the theme the channel ran before the push',
        '- Commit: `1be9fb20ffd985c26c59c5b5fcd28006418d9a08` on `master`',
        '- Bundle: `reelflies-ca-6.22.0-1be9fb2.zip`, 9,876,543 B, sha256 `ab12`',
        '- main.js: 307,607 B',
        '- Step 1: no differences from the live saved settings',
        '- Changed in repo: none since `0a1b2c3`, the channel\'s last release',
        '- rf_* values pushed: none',
        '- New switches: none',
        '- Verify: the live saved settings match config.json',
        '- Operator: Shaun Bathgate',
        '- Confirmation: channel id typed at the terminal',
        '',
    ].join('\n'));
});

test('the entry lists every rf_* value pushed and the new switches (ticket 15)', () => {
    const entry = formatReleaseEntry(withSwitches);
    assert.match(entry, /\n- rf_\* values pushed: `rf_cart_state` = true, `rf_menu_type_ids` = "", `rf_quick_add` = false\n/);
    assert.match(entry, /\n- New switches: `rf_cart_state`\n/);
});

test('a dry-run entry says the theme uuid is assigned at push and that nothing was verified', () => {
    const entry = formatReleaseEntry({ ...release, theme: { ...release.theme, uuid: null }, verify: null });
    assert.match(entry, /- Theme: Cornerstone 6\.22\.0, uuid assigned at push\n/);
    assert.match(entry, /- Verify: not run \(dry run\)\n/);
});

test('step 1 says which theme a first release replaced, or which live values it overwrote', () => {
    assert.equal(
        describeStep1({ replacing: { themeName: 'Cavio', variationName: 'Natural', themeUuid: '25121d00' }, overwritten: [], unpublished: [] }),
        'first release, replacing Cavio · variation "Natural" (theme 25121d00)',
    );
    assert.equal(
        describeStep1({ replacing: null, overwritten: ['body-bg', 'logo_size'], unpublished: ['body-bg'] }),
        'overwrote the live values of `body-bg`, `logo_size` (the channel had unpublished Theme Styles edits in `body-bg`)',
    );
});

test('verify problems are listed in the entry', () => {
    const entry = formatReleaseEntry({ ...release, verify: { problems: ['live variation is "Natural", not "ReelFlies CA"'] } });
    assert.match(entry, /- Verify: 1 problem\(s\): live variation is "Natural", not "ReelFlies CA"\n/);
});

test('the first entry creates RELEASES.md with its header and a Releases section; later entries append', () => {
    const first = addReleaseEntry(null, formatReleaseEntry(release));
    assert.match(first, /^# Release log\n/);
    assert.match(first, /\n## Releases\n\n### 2026-10-05 18:04 UTC/);

    const second = addReleaseEntry(first, formatReleaseEntry({ ...release, timestamp: '2026-10-06T09:00:00.000Z' }));
    assert.ok(second.indexOf('2026-10-05 18:04 UTC') < second.indexOf('2026-10-06 09:00 UTC'), 'entries are in date order');
    assert.match(second, /Confirmation: channel id typed at the terminal\n\n### 2026-10-06 09:00 UTC/);
});

test('RELEASES.md gives the uuids of the themes the release pushed', () => {
    const unknown = formatReleaseEntry({ ...release, timestamp: '2026-10-06T09:00:00.000Z', theme: { ...release.theme, uuid: 'unknown' } });
    const markdown = addReleaseEntry(addReleaseEntry(null, formatReleaseEntry(release)), unknown);
    assert.deepEqual(releasedThemeUuids(markdown), ['9f0c2a10-0000-0000-0000-000000000001']);
    assert.deepEqual(releasedThemeUuids(null), []);
});

const CAVIO = '25121d00-0000-0000-0000-00000000cafe';

test('W0-1: the entry says whether the push made a new theme uuid, or a new version of the theme the channel ran before it (decision 9)', () => {
    assert.match(formatReleaseEntry(release), /\n- Theme: Cornerstone 6\.22\.0, uuid `9f0c2a10-0000-0000-0000-000000000001`\n- New uuid: no, a new version of the theme the channel ran before the push\n/);
    assert.match(formatReleaseEntry({ ...release, previousThemeUuid: CAVIO }), new RegExp(`\\n- New uuid: yes; before the push the channel ran theme \`${CAVIO}\`\\n`));
    assert.match(formatReleaseEntry({ ...release, theme: { ...release.theme, uuid: 'unknown' } }), /\n- New uuid: unknown: verify couldn't read the channel's theme after the push\n/);
    assert.match(formatReleaseEntry({ ...release, previousThemeUuid: null }), /\n- New uuid: unknown: step 5 didn't record the channel's theme before the push\n/);
    assert.match(formatReleaseEntry({ ...release, theme: { ...release.theme, uuid: null }, verify: null }), /\n- New uuid: known after the push \(dry run\)\n/);
});

test('W0-1: the theme the channel ran before the push never counts as one the release pushed', () => {
    const markdown = addReleaseEntry(null, formatReleaseEntry({ ...release, previousThemeUuid: CAVIO }));
    assert.deepEqual(releasedThemeUuids(markdown), ['9f0c2a10-0000-0000-0000-000000000001']);
    assert.equal(lastRelease(markdown, 1895766).themeUuid, '9f0c2a10-0000-0000-0000-000000000001');
});

test('the push summary shows the target, the variation, step 1 and the sizes before the operator confirms', () => {
    const summary = formatPushSummary({ ...release, bundle: { ...release.bundle } });
    assert.match(summary, /target {6}channel 1895766 \(ReelFlies_CA\)/);
    assert.match(summary, /variation {3}ReelFlies CA/);
    assert.match(summary, /step 1 {6}no differences from the live saved settings/);
    assert.match(summary, /bundle {6}reelflies-ca-6\.22\.0-1be9fb2\.zip, 9,876,543 B/);
    assert.match(summary, /main\.js {5}307,607 B/);
});

test('the push summary lists the rf_* values and each new switch', () => {
    const summary = formatPushSummary(withSwitches);
    assert.match(summary, /rf_\* values rf_cart_state = true, rf_menu_type_ids = "", rf_quick_add = false/);
    assert.match(summary, /new switch {2}rf_cart_state/);
    assert.match(formatPushSummary(release), /new switch {2}none/);
});

test('a release entry goes at the end of Releases, before the Switch toggles section', () => {
    const markdown = addReleaseEntry(null, formatReleaseEntry(release));
    const toggles = markdown.indexOf('\n## Switch toggles\n');
    assert.ok(toggles > markdown.indexOf('### 2026-10-05 18:04 UTC'), 'the entry is above Switch toggles');
    assert.match(markdown, /- Confirmation: channel id typed at the terminal\n\n## Switch toggles\n/);
});

test('the Switch toggles section has its fixed format: date, channel, switch, from, to, who, reason', () => {
    for (const markdown of [addReleaseEntry(null, formatReleaseEntry(release)), fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8')]) {
        assert.match(markdown, /\n## Switch toggles\n(.|\n)*\n\| Date \| Channel \| Switch \| From \| To \| Who \| Reason \|\n\|---\|---\|---\|---\|---\|---\|---\|\n/);
    }
});

test('the repo\'s RELEASES.md takes a release entry at the end of its Releases section', () => {
    const markdown = fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8');
    const updated = addReleaseEntry(markdown, formatReleaseEntry(release));
    assert.ok(updated.startsWith(markdown.slice(0, markdown.indexOf('## Releases'))));
    assert.match(updated, /## Releases\n(.|\n)*### 2026-10-05 18:04 UTC/);
});

// --- W0-2: the channel's last release, and the settings changed in the repo since ----------

const SHA_A = 'aaaaaaa000000000000000000000000000000001';
const SHA_B = 'bbbbbbb000000000000000000000000000000002';
const at = (timestamp, sha, extra = {}) => formatReleaseEntry({
    ...release, timestamp, git: { sha, branch: 'master' }, ...extra,
});

test('W0-2: RELEASES.md gives each release\'s time, channel, variation, commit and theme, starting with the first real one', () => {
    const [first] = releaseEntries(fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8'));
    assert.deepEqual(first, {
        timestamp: '2026-10-06 14:30',
        channel: 1895766,
        channelName: 'ReelFlies_CA',
        variation: 'ReelFlies CA',
        sha: '5d0d0cb8ca42405d8555de6a84f20843060d7cde',
        themeUuid: '58abad50-a3c0-013f-e2b6-2ec98cc9ce73',
    });
    assert.deepEqual(releaseEntries(null), []);
    assert.deepEqual(releaseEntries(RELEASES_TEMPLATE), []);
});

test('W0-2: what formatReleaseEntry writes, lastRelease reads back', () => {
    const markdown = addReleaseEntry(null, formatReleaseEntry(release));
    assert.deepEqual(lastRelease(markdown, 1895766), {
        timestamp: '2026-10-05 18:04',
        channel: 1895766,
        channelName: 'ReelFlies_CA',
        variation: 'ReelFlies CA',
        sha: '1be9fb20ffd985c26c59c5b5fcd28006418d9a08',
        themeUuid: '9f0c2a10-0000-0000-0000-000000000001',
    });
    assert.equal(lastRelease(markdown, '1895766').sha, '1be9fb20ffd985c26c59c5b5fcd28006418d9a08', 'the channel may be a string');
});

test('W0-2: the channel\'s last release is its latest by time, wherever a merge put it; other channels don\'t count', () => {
    let markdown = addReleaseEntry(null, at('2026-10-07T09:00:00.000Z', SHA_B));
    markdown = addReleaseEntry(markdown, at('2026-10-06T18:00:00.000Z', SHA_A)); // a union merge can put an older entry last
    markdown = addReleaseEntry(markdown, at('2026-10-08T09:00:00.000Z', SHA_A, { channel: 1, channelName: 'reelflies.ca' }));
    assert.equal(lastRelease(markdown, 1895766).sha, SHA_B);
    assert.equal(lastRelease(markdown, 1).sha, SHA_A);
    assert.equal(lastRelease(markdown, 1855224), null);
    assert.equal(lastRelease(null, 1895766), null);
});

test('W0-2: two releases in the same minute: the one further down RELEASES.md is the later', () => {
    let markdown = addReleaseEntry(null, at('2026-10-07T09:00:10.000Z', SHA_A));
    markdown = addReleaseEntry(markdown, at('2026-10-07T09:00:50.000Z', SHA_B));
    assert.equal(lastRelease(markdown, 1895766).sha, SHA_B);
});

test('W0-2: only the Releases section holds releases, and an entry without a readable commit has no sha', () => {
    const later = '### 2026-10-09 09:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA\n\n- Commit: `bbbbbbb000000000000000000000000000000002` on `master`\n';
    const broken = '### 2026-10-08 09:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA\n\n- Theme: ReelFlies 6.22.0, uuid unknown\n';
    const markdown = `${addReleaseEntry(addReleaseEntry(null, formatReleaseEntry(release)), broken)}\n## Later section\n\n${later}`;
    assert.deepEqual(releaseEntries(markdown).map(entry => [entry.timestamp, entry.sha, entry.themeUuid]), [
        ['2026-10-05 18:04', '1be9fb20ffd985c26c59c5b5fcd28006418d9a08', '9f0c2a10-0000-0000-0000-000000000001'],
        ['2026-10-08 09:00', null, null],
    ]);
    assert.equal(lastRelease(markdown, 1895766).sha, null);
});

const changed = {
    ...release,
    step1: { ...release.step1, changedInRepo: ['body-bg', 'fontSize-root'] },
};

test('W0-2: the entry lists the settings changed in the repo since the channel\'s last release, with its commit', () => {
    const entry = formatReleaseEntry(changed);
    assert.match(entry, /\n- Step 1: no Theme Styles edits since the last release\n/);
    assert.match(entry, /\n- Changed in repo: `body-bg`, `fontSize-root` \(since `0a1b2c3`, the channel's last release\)\n/);
});

test('W0-2: the push summary lists them too', () => {
    const summary = formatPushSummary(changed);
    assert.match(summary, /\n {2}step 1 {6}no Theme Styles edits since the last release\n/);
    assert.match(summary, /\n {2}in repo {5}body-bg, fontSize-root \(since 0a1b2c3, the channel's last release\)\n/);
    assert.match(formatPushSummary(release), /\n {2}in repo {5}none since 0a1b2c3, the channel's last release\n/);
});

test('W0-2: a release with no last release to compare with says why, and a first release says so', () => {
    const none = { ...release, step1: { ...release.step1, base: null, baseNote: 'RELEASES.md records no release on channel 1895766' } };
    assert.match(formatReleaseEntry(none), /\n- Changed in repo: not compared: RELEASES\.md records no release on channel 1895766\n/);
    assert.match(formatPushSummary(none), /\n {2}in repo {5}not compared: RELEASES\.md records no release on channel 1895766\n/);
    const first = {
        ...release,
        step1: {
            replacing: { themeName: 'Cavio', variationName: 'Natural', themeUuid: '25121d00' }, overwritten: [], unpublished: [], changedInRepo: [], base: null,
        },
    };
    assert.match(formatReleaseEntry(first), /\n- Changed in repo: not compared: a first release replaces another theme\n/);
});

test('W0-2: step 1 names the overwritten control-panel edits beside the repo\'s changes', () => {
    const both = { ...release, step1: { ...release.step1, overwritten: ['logo_size'], changedInRepo: ['body-bg'] } };
    assert.match(formatReleaseEntry(both), /\n- Step 1: overwrote the live values of `logo_size`\n- Changed in repo: `body-bg` \(since `0a1b2c3`, the channel's last release\)\n/);
    assert.equal(describeStep1({
        replacing: null, overwritten: [], unpublished: [], changedInRepo: [], base: null,
    }), 'no differences from the live saved settings');
});

// --- W0-1: the confirmation, the release calendar and the paired channel-1 release ----------

const agentPush = {
    ...release,
    confirmation: { mode: 'nonprod', channel: 1895766 },
    calendar: { line: 'Release calendar: Flip 2027-03-01 (provisional; ticket 10 comment). 2027-02-03 is in T-28 (channel-1 parity) since 2027-02-01; next: T-21 on 2027-02-08.' },
    pairedChannel1: {
        phase: 'T-28', since: '2027-02-01', t28: '2027-02-01', flip: '2027-03-01', status: 'provisional',
    },
};

test('W0-1: an agent push records "Confirmation: non-interactive (agent)" beside the operator, and the paired channel-1 release pending', () => {
    const entry = formatReleaseEntry(agentPush);
    assert.match(entry, /\n- Operator: Shaun Bathgate\n- Confirmation: non-interactive \(agent\), `--confirm-nonprod 1895766`\n/);
    assert.match(entry, /\n- Paired channel-1 release: pending \(ticket 56\): channel 1 runs the same build from T-28 \(2027-02-01\) until the Flip, so push this commit there through ticket 53's target; calendar T-28, Flip 2027-03-01, provisional\n$/);
});

test('W0-1: a typed release records how it was confirmed, and no paired release when the calendar doesn\'t ask for one', () => {
    const entry = formatReleaseEntry(release);
    assert.match(entry, /\n- Confirmation: channel id typed at the terminal\n$/);
    assert.doesNotMatch(entry, /Paired channel-1 release/);
    const typedAtT21 = formatReleaseEntry({ ...agentPush, confirmation: { mode: 'typed' }, pairedChannel1: { ...agentPush.pairedChannel1, phase: 'T-21', since: '2027-02-08' } });
    assert.match(typedAtT21, /\n- Confirmation: channel id typed at the terminal\n- Paired channel-1 release: pending \(ticket 56\).*calendar T-21, Flip 2027-03-01, provisional\n$/);
});

test('W0-1: the push summary says how the push is confirmed, and whether the calendar\'s dates are provisional or set', () => {
    const summary = formatPushSummary(agentPush);
    // "requested", not "no prompt": step 5 prints the summary before it checks the flag again, and a
    // calendar that has moved into T-21 by then stops the push right after this line.
    assert.match(summary, /\n {2}confirm {5}non-interactive \(agent\), --confirm-nonprod 1895766: requested; step 5 checks it again against origin\/master and today's calendar and asks no one, and the gate still captures the channel again and checks everything before the push\n/);
    assert.doesNotMatch(summary, /no prompt/);
    assert.match(summary, /\n {2}calendar {4}Flip 2027-03-01 \(provisional; ticket 10 comment\)\. 2027-02-03 is in T-28/);
    assert.match(summary, /\n {2}channel 1 {3}paired release pending \(ticket 56\): channel 1 runs the same build from T-28/);
    const typed = formatPushSummary(release);
    assert.match(typed, /\n {2}confirm {5}channel id typed at the terminal\n/);
    assert.match(typed, /\n {2}calendar {4}no Flip date yet \(provisional; ticket 10: Flip date after ticket 26\), so nothing is limited\.$/);
    assert.doesNotMatch(typed, /channel 1 {3}/);
    const set = formatPushSummary({ ...agentPush, calendar: { line: 'Release calendar: Flip 2027-03-01 (set; ticket 10 comment). 2027-01-02 is in build (building, before code complete); next: T-35 on 2027-01-25.' }, pairedChannel1: null });
    assert.match(set, /calendar {4}Flip 2027-03-01 \(set;/);
});

// --- W0-3: the builds RELEASES.md records, and its "My Themes" section ------------------------

test('W0-3: RELEASES.md gives each release\'s build: theme name, version and uuid, commit, zip sha256, and the theme the channel ran before', () => {
    const [first] = releaseBuilds(fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8'));
    assert.deepEqual(first, {
        timestamp: '2026-10-06 14:30',
        order: 0,
        channel: 1895766,
        sha: '5d0d0cb8ca42405d8555de6a84f20843060d7cde',
        themeUuid: '58abad50-a3c0-013f-e2b6-2ec98cc9ce73',
        themeName: 'ReelFlies',
        version: '6.22.0',
        zipSha256: '367071ace794697e59a36129ba4f958a2d27daf85aa9bf73411d42c6cfc763dc',
        ranBefore: null,
    });
    const markdown = addReleaseEntry(addReleaseEntry(null, formatReleaseEntry(release)), formatReleaseEntry({
        ...release, timestamp: '2026-10-06T09:00:00.000Z', theme: { uuid: '9f0c2a10-0000-0000-0000-000000000002', name: 'Reel Flies CA', version: '6.22.0-rf.1' }, previousThemeUuid: CAVIO,
    }));
    assert.deepEqual(releaseBuilds(markdown).map(build => [build.order, build.themeName, build.version, build.themeUuid, build.zipSha256, build.ranBefore]), [
        [0, 'Cornerstone', '6.22.0', '9f0c2a10-0000-0000-0000-000000000001', 'ab12', null],
        [1, 'Reel Flies CA', '6.22.0-rf.1', '9f0c2a10-0000-0000-0000-000000000002', 'ab12', CAVIO],
    ]);
    assert.deepEqual(releaseBuilds(null), []);
});

test('W0-3: a release entry without a readable theme or bundle line gives nulls, never a guess', () => {
    const broken = '### 2026-10-08 09:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA\n\n- Theme: ReelFlies 6.22.0, uuid unknown\n- Commit: `bbbbbbb000000000000000000000000000000002` on `master`\n';
    const [build] = releaseBuilds(addReleaseEntry(null, broken));
    assert.equal(build.themeUuid, null);
    assert.equal(build.themeName, null);
    assert.equal(build.zipSha256, null);
});

const deletion = {
    timestamp: '2026-10-09T10:15:42.000Z',
    action: 'deleted (--prune-only)',
    uuid: '9f0c2a10-0000-0000-0000-000000000001',
    name: 'ReelFlies',
    version: '6.22.0',
    sha: '1be9fb20ffd985c26c59c5b5fcd28006418d9a08',
    zipSha256: 'ab12',
    operator: 'Shaun Bathgate',
};

test('W0-3: a My Themes row records the time, the action, the theme uuid, name and version, commit, zip sha256 and operator', () => {
    assert.equal(MY_THEMES_HEADER, '| Time (UTC) | Action | Theme uuid | Name and version | Commit | Zip sha256 | Operator |');
    assert.equal(formatMyThemesRow(deletion), '| 2026-10-09 10:15 | deleted (--prune-only) | `9f0c2a10-0000-0000-0000-000000000001` | ReelFlies 6.22.0 | `1be9fb20ffd985c26c59c5b5fcd28006418d9a08` | `ab12` | Shaun Bathgate |');
    const unknown = {
        ...deletion, sha: null, zipSha256: null, operator: 'a | b',
    };
    assert.match(formatMyThemesRow(unknown), /\| unknown \| unknown \| a \\\| b \|$/);
    assert.equal(myThemesRows(addMyThemesRow(null, formatMyThemesRow(unknown)))[0].operator, 'a | b', 'and reads back');
});

const MY_THEMES_TABLE = `\n${MY_THEMES_HEADER}\n|---|---|---|---|---|---|---|\n`;

// A RELEASES.md's My Themes section: after Switch toggles, with its header and separator, and rows
// that read back. It may hold rows, and sections may follow it (the orchestrator's "Store writes"),
// so only the template is held to an empty table at the end of the file.
function assertMyThemesSection(markdown) {
    const toggles = markdown.indexOf('\n## Switch toggles\n');
    const start = markdown.indexOf('\n## My Themes\n');
    assert.ok(toggles !== -1 && start > toggles, 'My Themes comes after Switch toggles');
    const next = markdown.indexOf('\n## ', start + 1);
    const section = markdown.slice(start, next === -1 ? markdown.length : next + 1);
    assert.ok(section.includes(MY_THEMES_TABLE), 'the section has its header and separator');
    for (const row of myThemesRows(markdown)) {
        assert.match(row.time, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
        assert.match(row.action, /^deleted \(/);
        assert.match(row.uuid, /^[0-9a-f-]{36}$/);
        assert.ok(row.operator, 'every row names its operator');
    }
}

const repoReleases = () => fs.readFileSync(new URL('../RELEASES.md', import.meta.url), 'utf8');

test('W0-3: the template ends with an empty "My Themes" table, after Switch toggles', () => {
    assertMyThemesSection(RELEASES_TEMPLATE);
    assert.ok(RELEASES_TEMPLATE.endsWith(MY_THEMES_TABLE));
    assert.deepEqual(myThemesRows(RELEASES_TEMPLATE), []);
});

test('W0-3: the repo\'s RELEASES.md has its My Themes section after Switch toggles, and keeps passing once it logs deletions and a section follows', () => {
    const repo = repoReleases();
    assertMyThemesSection(repo);
    // The states the prune and the orchestrator's mirror bring it to: rows, then a later section.
    const logged = addMyThemesRow(repo, formatMyThemesRow(deletion));
    const later = `${logged}\n## Store writes\n\n| Date | Channel |\n|---|---|\n| 2026-10-09 | 1895766 |\n`;
    for (const markdown of [logged, later, addMyThemesRow(later, formatMyThemesRow({ ...deletion, uuid: '9f0c2a10-0000-0000-0000-000000000002' }))]) {
        assertMyThemesSection(markdown);
    }
    assert.equal(myThemesRows(logged).length, myThemesRows(repo).length + 1);
});

test('W0-3: rows go at the end of the My Themes table, wherever the section is, and read back', () => {
    const repo = repoReleases();
    const before = myThemesRows(repo).length;
    const one = addMyThemesRow(repo, formatMyThemesRow(deletion));
    const two = addMyThemesRow(one, formatMyThemesRow({ ...deletion, timestamp: '2026-10-09T10:16:00.000Z', uuid: '9f0c2a10-0000-0000-0000-000000000002' }));
    assert.ok(two.startsWith(repo.slice(0, repo.indexOf('## My Themes'))), 'nothing above the section changes');
    assert.deepEqual(myThemesRows(two).slice(before).map(row => [row.time, row.action, row.uuid, row.nameAndVersion, row.sha, row.zipSha256, row.operator]), [
        ['2026-10-09 10:15', 'deleted (--prune-only)', '9f0c2a10-0000-0000-0000-000000000001', 'ReelFlies 6.22.0', '1be9fb20ffd985c26c59c5b5fcd28006418d9a08', 'ab12', 'Shaun Bathgate'],
        ['2026-10-09 10:16', 'deleted (--prune-only)', '9f0c2a10-0000-0000-0000-000000000002', 'ReelFlies 6.22.0', '1be9fb20ffd985c26c59c5b5fcd28006418d9a08', 'ab12', 'Shaun Bathgate'],
    ]);
    assert.equal(myThemesRows(two).length, before + 2);
    // A section added later below it (the orchestrator's "Store writes") keeps the rows in My Themes.
    const later = `${addMyThemesRow(RELEASES_TEMPLATE, formatMyThemesRow(deletion))}\n## Store writes\n\n| Date | Channel |\n|---|---|\n| 2026-10-09 | 1895766 |\n`;
    const added = addMyThemesRow(later, formatMyThemesRow({ ...deletion, uuid: '9f0c2a10-0000-0000-0000-000000000003' }));
    assert.equal(myThemesRows(added).length, 2);
    assert.match(added, /`9f0c2a10-0000-0000-0000-000000000003`[^\n]*\n\n## Store writes\n/);
    // Release entries still go into Releases, and the rows never count as releases.
    const withEntry = addReleaseEntry(two, formatReleaseEntry(release));
    assert.equal(releaseEntries(withEntry).length, releaseEntries(repo).length + 1);
    assert.equal(myThemesRows(withEntry).length, before + 2);
    assert.ok(!releasedThemeUuids(two).includes('9f0c2a10-0000-0000-0000-000000000002'), 'a deleted theme isn\'t a release');
});

test('W0-3: a RELEASES.md from before W0-3 gets its My Themes section with the first row', () => {
    const old = addReleaseEntry(null, formatReleaseEntry(release)).replace(/\n## My Themes\n[^]*$/, '\n');
    assert.doesNotMatch(old, /## My Themes/);
    const added = addMyThemesRow(old, formatMyThemesRow(deletion));
    assert.equal(myThemesRows(added).length, 1);
    assert.match(added, /\n## Switch toggles\n[^]*\n## My Themes\n[^]*\| deleted \(--prune-only\) \|/);
    assert.throws(() => addMyThemesRow('# Release log\n\n## My Themes\n\nNo table here.\n', formatMyThemesRow(deletion)), /My Themes section has no table/);
});
