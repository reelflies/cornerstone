// Formats the push summary and the RELEASES.md entry for scripts/release.sh (ticket 05, step 7,
// with ticket 15's rf_* values, new switches and Switch toggles section), and reads the entries back
// (W0-2: step 1 compares with the channel's last release). Pure: no network, no files.
//
//   import { formatPushSummary, formatReleaseEntry, addReleaseEntry, releasedThemeUuids, releaseEntries, lastRelease } from './release-log.mjs';
//   import { describeConfirmation, describePairedRelease } from './release-log.mjs'; // W0-1
//
// A release: { timestamp, channel, channelName, variation, theme: { uuid, name, version },
//   git: { sha, branch }, bundle: { file, bytes, sha256, mainJsBytes },
//   step1: { replacing, overwritten: [keys], unpublished: [keys], changedInRepo: [keys],
//     base: { sha, timestamp } | null, baseNote }, guard: { values, newSwitches },
//   verify: { problems } | null, operator,
//   confirmation: { mode: 'typed' } | { mode: 'nonprod', channel }, calendar: { line },
//   pairedChannel1: { phase, since, t28, flip, status } | null }
// step1.base is the channel's last release, which step 1 compared with; baseNote says why there was
// none. confirmation, calendar and pairedChannel1 are W0-1's: how step 5 was confirmed, the release
// calendar's describePhase line, and the paired channel-1 release pending from T-28 (ticket 56).

import { formatBytes } from './lib/format.mjs';
import { describeLiveTheme } from './release-capture.mjs';
import { displayValue } from './release-diff.mjs';

export const RELEASES_TEMPLATE = `# Release log

Every theme push to a storefront goes through \`scripts/release.sh\` ([docs/releasing.md](docs/releasing.md)), which appends an entry under "Releases" after the push. Don't edit the entries by hand.

## Releases

## Switch toggles

Log every module switch (\`rf_*\`) toggled in a storefront's Theme Styles here, one row per toggle, in this format. From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through \`scripts/release.sh\` (SCOPE-3).

After a toggle, change \`config.json\` to match and commit it. Otherwise the next release stops on the difference (the release guard, ticket 15).

| Date | Channel | Switch | From | To | Who | Reason |
|---|---|---|---|---|---|---|
`;

const utc = iso => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const codeList = keys => keys.map(key => `\`${key}\``).join(', ');
const valueList = (values, code) => values.map(({ key, value }) => `${code ? `\`${key}\`` : key} = ${displayValue(key, value)}`).join(', ') || 'none';

export function describeStep1({
    replacing, overwritten, unpublished, changedInRepo = [],
}) {
    let text = 'no differences from the live saved settings';
    if (replacing) {
        text = `first release, replacing ${describeLiveTheme(replacing)}`;
    } else if (overwritten.length) {
        text = `overwrote the live values of ${codeList(overwritten)}`;
    } else if (changedInRepo.length) {
        text = 'no Theme Styles edits since the last release';
    }
    return unpublished.length && !replacing ? `${text} (the channel had unpublished Theme Styles edits in ${codeList(unpublished)})` : text;
}

// W0-2: the settings config.json changed since the channel's last release, which step 1 let through.
export function describeRepoChanges({
    replacing, changedInRepo = [], base = null, baseNote,
}, code = true) {
    const mark = text => (code ? `\`${text}\`` : text);
    if (replacing) return 'not compared: a first release replaces another theme';
    if (!base) return `not compared: ${baseNote || 'no last release to compare with'}`;
    const since = `${mark(base.sha.slice(0, 7))}, the channel's last release`;
    if (!changedInRepo.length) return `none since ${since}`;
    return `${changedInRepo.map(mark).join(', ')} (since ${since})`;
}

// W0-1: how step 5 was confirmed. `code` marks the flag as code for RELEASES.md.
export function describeConfirmation(confirmation, code = true) {
    if (confirmation.mode === 'typed') return 'channel id typed at the terminal';
    if (confirmation.mode !== 'nonprod') throw new Error(`unknown confirmation mode "${confirmation.mode}"`);
    const flag = `--confirm-nonprod ${confirmation.channel}`;
    return `non-interactive (agent), ${code ? `\`${flag}\`` : flag}`;
}

// W0-1: the paired channel-1 release a push queues for Shaun from T-28 (ticket 56).
export function describePairedRelease(paired) {
    return `pending (ticket 56): channel 1 runs the same build from T-28 (${paired.t28}) until the Flip, so push this commit there through ticket 53's target; calendar ${paired.phase}, Flip ${paired.flip}, ${paired.status}`;
}

function describeVerify(verify) {
    if (!verify) return 'not run (dry run)';
    if (!verify.problems.length) return 'the live saved settings match config.json';
    return `${verify.problems.length} problem(s): ${verify.problems.join('; ')}`;
}

export function formatReleaseEntry(release) {
    const { theme, git, bundle } = release;
    return [
        `### ${utc(release.timestamp)} · channel ${release.channel} (${release.channelName}) · ${release.variation}`,
        '',
        `- Theme: ${theme.name} ${theme.version}, uuid ${theme.uuid ? `\`${theme.uuid}\`` : 'assigned at push'}`,
        `- Commit: \`${git.sha}\` on \`${git.branch}\``,
        `- Bundle: \`${bundle.file}\`, ${formatBytes(bundle.bytes)}, sha256 \`${bundle.sha256}\``,
        `- main.js: ${formatBytes(bundle.mainJsBytes)}`,
        `- Step 1: ${describeStep1(release.step1)}`,
        `- Changed in repo: ${describeRepoChanges(release.step1)}`,
        `- rf_* values pushed: ${valueList(release.guard.values, true)}`,
        `- New switches: ${codeList(release.guard.newSwitches) || 'none'}`,
        `- Verify: ${describeVerify(release.verify)}`,
        `- Operator: ${release.operator}`,
        `- Confirmation: ${describeConfirmation(release.confirmation)}`,
        ...(release.pairedChannel1 ? [`- Paired channel-1 release: ${describePairedRelease(release.pairedChannel1)}`] : []),
        '',
    ].join('\n');
}

// Adds an entry at the end of the "## Releases" section, creating the file's text when it's missing.
export function addReleaseEntry(markdown, entry) {
    const text = markdown ?? RELEASES_TEMPLATE;
    const start = text.indexOf('\n## Releases\n');
    if (start === -1) throw new Error('RELEASES.md has no "## Releases" section');
    const next = text.indexOf('\n## ', start + 1);
    const end = next === -1 ? text.length : next + 1;
    const before = text.slice(0, end).replace(/\n*$/, '\n');
    const after = text.slice(end);
    return `${before}\n${entry}${after ? `\n${after}` : ''}`;
}

// The uuids of the themes the release pushed, from the entries' "- Theme:" lines.
export function releasedThemeUuids(markdown) {
    return [...(markdown || '').matchAll(/^- Theme: .*, uuid `([0-9a-f-]{36})`$/gm)].map(match => match[1]);
}

const ENTRY_HEADING = /^### (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) UTC · channel (\d+) \((.*)\) · (.+)$/;
const firstMatch = (text, pattern) => (pattern.exec(text) || [])[1] || null;

// The entries of the "## Releases" section, in file order: { timestamp ('YYYY-MM-DD HH:MM', UTC),
// channel, channelName, variation, sha, themeUuid }. sha and themeUuid are null when their line is
// missing or unreadable.
export function releaseEntries(markdown) {
    const text = markdown || '';
    const start = text.indexOf('\n## Releases\n');
    if (start === -1) return [];
    const next = text.indexOf('\n## ', start + 1);
    const section = text.slice(start, next === -1 ? text.length : next + 1);
    return section.split(/\n(?=### )/).slice(1).flatMap(block => {
        const heading = ENTRY_HEADING.exec(block.split('\n', 1)[0]);
        if (!heading) return [];
        return [{
            timestamp: heading[1],
            channel: Number(heading[2]),
            channelName: heading[3],
            variation: heading[4],
            sha: firstMatch(block, /^- Commit: `([0-9a-f]{7,40})`/m),
            themeUuid: firstMatch(block, /^- Theme: .*, uuid `([0-9a-f-]{36})`$/m),
        }];
    });
}

// W0-2: the channel's newest entry, or null when RELEASES.md records no release on it. Newest by
// its time, because a union merge of two release logs can leave an older entry further down; of two
// in the same minute, the one further down.
export function lastRelease(markdown, channel) {
    const entries = releaseEntries(markdown).filter(entry => entry.channel === Number(channel));
    return entries.reduce((newest, entry) => (!newest || entry.timestamp >= newest.timestamp ? entry : newest), null);
}

export function formatPushSummary(release) {
    const line = (label, value) => `  ${label.padEnd(11)} ${value}`;
    const { newSwitches } = release.guard;
    return [
        'Push summary',
        line('target', `channel ${release.channel} (${release.channelName})`),
        line('variation', release.variation),
        line('step 1', describeStep1(release.step1)),
        line('in repo', describeRepoChanges(release.step1, false)),
        line('rf_* values', valueList(release.guard.values, false)),
        ...(newSwitches.length ? newSwitches.map(key => line('new switch', key)) : [line('new switch', 'none')]),
        line('bundle', `${release.bundle.file}, ${formatBytes(release.bundle.bytes)}`),
        line('main.js', formatBytes(release.bundle.mainJsBytes)),
        line('confirm', release.confirmation.mode === 'nonprod'
            ? `${describeConfirmation(release.confirmation, false)}: no prompt; the gate still captures the channel again and checks everything before the push`
            : describeConfirmation(release.confirmation, false)),
        line('calendar', release.calendar.line.replace(/^Release calendar: /, '')),
        ...(release.pairedChannel1 ? [line('channel 1', `paired release ${describePairedRelease(release.pairedChannel1)}`)] : []),
    ].join('\n');
}
