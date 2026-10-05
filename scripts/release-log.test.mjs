import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    addReleaseEntry, describeStep1, formatPushSummary, formatReleaseEntry,
} from './release-log.mjs';

const release = {
    timestamp: '2026-10-05T18:04:09.123Z',
    channel: 1895766,
    channelName: 'ReelFlies_CA',
    variation: 'ReelFlies CA',
    theme: { uuid: '9f0c2a10-0000-0000-0000-000000000001', name: 'Cornerstone', version: '6.22.0' },
    git: { sha: '1be9fb20ffd985c26c59c5b5fcd28006418d9a08', branch: 'master' },
    bundle: {
        file: 'reelflies-ca-6.22.0-1be9fb2.zip', bytes: 9876543, sha256: 'ab12', mainJsBytes: 307607,
    },
    step1: { replacing: null, overwritten: [], unpublished: [] },
    guard: { values: [], newSwitches: [] },
    verify: { problems: [] },
    operator: 'Shaun Bathgate',
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
        '- Commit: `1be9fb20ffd985c26c59c5b5fcd28006418d9a08` on `master`',
        '- Bundle: `reelflies-ca-6.22.0-1be9fb2.zip`, 9,876,543 B, sha256 `ab12`',
        '- main.js: 307,607 B',
        '- Step 1: no differences from the live saved settings',
        '- rf_* values pushed: none',
        '- New switches: none',
        '- Verify: the live saved settings match config.json',
        '- Operator: Shaun Bathgate',
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
    assert.match(second, /Operator: Shaun Bathgate\n\n### 2026-10-06 09:00 UTC/);
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
    assert.match(markdown, /- Operator: Shaun Bathgate\n\n## Switch toggles\n/);
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
