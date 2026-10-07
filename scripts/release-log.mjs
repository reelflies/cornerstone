// Formats the push summary and the RELEASES.md entry for scripts/release.sh (ticket 05, step 7,
// with ticket 15's rf_* values, new switches and Switch toggles section), and reads the entries back
// (W0-2: step 1 compares with the channel's last release). W0-3 adds the builds the entries record,
// which the prune ranks, and the "My Themes" section it logs each deletion in. Pure: no network,
// no files.
//
//   import { formatPushSummary, formatReleaseEntry, addReleaseEntry, releasedThemeUuids, releaseEntries, lastRelease } from './release-log.mjs';
//   import { describeConfirmation, describePairedRelease } from './release-log.mjs'; // W0-1
//   import { releaseBuilds, formatMyThemesRow, addMyThemesRow, myThemesRows } from './release-log.mjs'; // W0-3
//
// A release: { timestamp, channel, channelName, variation, theme: { uuid, name, version },
//   previousThemeUuid, git: { sha, branch }, bundle: { file, bytes, sha256, mainJsBytes },
//   step1: { replacing, overwritten: [keys], unpublished: [keys], changedInRepo: [keys],
//     base: { sha, timestamp } | null, baseNote }, guard: { values, newSwitches },
//   verify: { problems } | null, operator,
//   confirmation: { mode: 'typed' } | { mode: 'nonprod', channel }, calendar: { line },
//   pairedChannel1: { phase, since, t28, flip, status } | null }
// step1.base is the channel's last release, which step 1 compared with; baseNote says why there was
// none. previousThemeUuid, confirmation, calendar and pairedChannel1 are W0-1's: the theme the
// channel ran just before the push (step 5's capture), how step 5 was confirmed, the release
// calendar's describePhase line, and the paired channel-1 release pending from T-28 (ticket 56).

import { formatBytes } from './lib/format.mjs';
import { describeLiveTheme } from './release-capture.mjs';
import { displayValue } from './release-diff.mjs';

// W0-3: every theme the release tooling deletes from My Themes (and uploads, if the upload mode is
// ever built), one row each. The prune writes a row right after each deletion.
export const MY_THEMES_HEADER = '| Time (UTC) | Action | Theme uuid | Name and version | Commit | Zip sha256 | Operator |';
const MY_THEMES_SECTION = `
## My Themes

Every theme the release tooling deletes from My Themes, one row each, written by \`scripts/release.sh\`'s prune right after the deletion (W0-3, [docs/releasing.md](docs/releasing.md#pruning-my-themes)). The prune runs after each push, and on its own with \`--prune-only\`. It deletes only themes named ReelFlies that this file records as a release, active on no channel and not flagged \`is_active\` in My Themes, never the latest or previous release on 1895766 or channel 1, and always keeps the newest three. The commit and zip sha256 are the deleted build's, from its release entry. The operator is \`git config user.name\`, with "(no terminal)" when the prune ran without one, as an agent's does. Don't edit the rows by hand.

${MY_THEMES_HEADER}
|---|---|---|---|---|---|---|
`;

export const RELEASES_TEMPLATE = `# Release log

Every theme push to a storefront goes through \`scripts/release.sh\` ([docs/releasing.md](docs/releasing.md)), which appends an entry under "Releases" after the push. Don't edit the entries by hand.

## Releases

## Switch toggles

Log every module switch (\`rf_*\`) toggled in a storefront's Theme Styles here, one row per toggle, in this format. From T-14 to T+30, switch toggles and widget unpublishing are the only changes allowed, apart from P1 fixes through \`scripts/release.sh\` (SCOPE-3).

After a toggle, change \`config.json\` to match and commit it. Otherwise the next release stops on the difference (the release guard, ticket 15).

| Date | Channel | Switch | From | To | Who | Reason |
|---|---|---|---|---|---|---|
${MY_THEMES_SECTION}`;

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

// W0-1 (decision 9): whether the push made a new theme in My Themes, or a new version of the theme
// the channel ran before it. The earlier uuid isn't written as "uuid `…`", so releasedThemeUuids and
// releaseEntries never take it for a theme the release pushed.
function describeNewUuid({ theme, previousThemeUuid, verify }) {
    if (!verify) return 'known after the push (dry run)';
    if (!theme.uuid || theme.uuid === 'unknown') return 'unknown: verify couldn\'t read the channel\'s theme after the push';
    if (!previousThemeUuid) return 'unknown: step 5 didn\'t record the channel\'s theme before the push';
    if (previousThemeUuid === theme.uuid) return 'no, a new version of the theme the channel ran before the push';
    return `yes; before the push the channel ran theme \`${previousThemeUuid}\``;
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
        `- New uuid: ${describeNewUuid(release)}`,
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
const THEME_LINE = /^- Theme: (.+) (\S+), uuid `([0-9a-f-]{36})`$/m;
const firstMatch = (text, pattern) => (pattern.exec(text) || [])[1] || null;

// The text of a "## <title>" section, from its heading to the next one, or null.
function section(markdown, title) {
    const text = markdown || '';
    const start = text.indexOf(`\n## ${title}\n`);
    if (start === -1) return null;
    const next = text.indexOf('\n## ', start + 1);
    return { start, end: next === -1 ? text.length : next + 1, text: text.slice(start, next === -1 ? text.length : next + 1) };
}

// Each entry block of the "## Releases" section, in file order, with its heading read.
function entryBlocks(markdown) {
    const releases = section(markdown, 'Releases');
    if (!releases) return [];
    return releases.text.split(/\n(?=### )/).slice(1).flatMap(block => {
        const heading = ENTRY_HEADING.exec(block.split('\n', 1)[0]);
        return heading ? [{ block, heading }] : [];
    });
}

// The entries of the "## Releases" section, in file order: { timestamp ('YYYY-MM-DD HH:MM', UTC),
// channel, channelName, variation, sha, themeUuid }. sha and themeUuid are null when their line is
// missing or unreadable.
export function releaseEntries(markdown) {
    return entryBlocks(markdown).map(({ block, heading }) => ({
        timestamp: heading[1],
        channel: Number(heading[2]),
        channelName: heading[3],
        variation: heading[4],
        sha: firstMatch(block, /^- Commit: `([0-9a-f]{7,40})`/m),
        themeUuid: firstMatch(block, /^- Theme: .*, uuid `([0-9a-f-]{36})`$/m),
    }));
}

// W0-3: the build each entry records, in file order, for the prune: { timestamp, order (its place
// among the entries), channel, sha, themeUuid, themeName, version, zipSha256, ranBefore }.
// ranBefore is the theme the channel ran before that push when it was another one (W0-1's "New
// uuid: yes" line), else null. A line that can't be read gives nulls, never a guess.
export function releaseBuilds(markdown) {
    return entryBlocks(markdown).map(({ block, heading }, order) => {
        const theme = THEME_LINE.exec(block);
        return {
            timestamp: heading[1],
            order,
            channel: Number(heading[2]),
            sha: firstMatch(block, /^- Commit: `([0-9a-f]{7,40})`/m),
            themeUuid: theme ? theme[3] : null,
            themeName: theme ? theme[1] : null,
            version: theme ? theme[2] : null,
            zipSha256: firstMatch(block, /^- Bundle: `[^`]+`, .*, sha256 `([0-9a-f]+)`$/m),
            ranBefore: firstMatch(block, /^- New uuid: yes; before the push the channel ran theme `([0-9a-f-]{36})`$/m),
        };
    });
}

// --- W0-3: the "My Themes" section ----------------------------------------------------------

const cell = text => String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const codeCell = text => (text ? `\`${text}\`` : 'unknown');

// One row: { timestamp (ISO), action, uuid, name, version, sha, zipSha256, operator, terminal }.
// terminal false (stdin wasn't one, as for an agent's run) adds "(no terminal)" to the operator,
// whose git user.name is the same for Shaun and an agent in the main clone.
export function formatMyThemesRow({
    timestamp, action, uuid, name, version, sha, zipSha256, operator, terminal = true,
}) {
    const who = terminal ? operator : `${operator} (no terminal)`;
    return `| ${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} | ${cell(action)} | ${codeCell(uuid)} | ${cell(`${name} ${version}`)} | ${codeCell(sha)} | ${codeCell(zipSha256)} | ${cell(who)} |`;
}

// Adds a row at the end of the My Themes table, adding the section at the end of the file when a
// RELEASES.md from before W0-3 has none.
export function addMyThemesRow(markdown, row) {
    const text = markdown ?? RELEASES_TEMPLATE;
    const found = section(text, 'My Themes');
    if (!found) return addMyThemesRow(`${text.replace(/\n*$/, '\n')}${MY_THEMES_SECTION}`, row);
    const lines = found.text.split('\n');
    const last = lines.reduce((index, line, i) => (line.startsWith('|') ? i : index), -1);
    if (last === -1 || !lines.includes(MY_THEMES_HEADER)) throw new Error('RELEASES.md\'s My Themes section has no table to add a row to');
    lines.splice(last + 1, 0, row);
    return `${text.slice(0, found.start)}${lines.join('\n')}${text.slice(found.end)}`;
}

const unquote = text => text.replace(/^`(.*)`$/, '$1');

// The rows of the My Themes table, in file order: { time, action, uuid, nameAndVersion, sha,
// zipSha256, operator }.
export function myThemesRows(markdown) {
    const found = section(markdown, 'My Themes');
    if (!found) return [];
    return found.text.split('\n')
        .filter(line => line.startsWith('|') && line !== MY_THEMES_HEADER && !/^\|[-|]+\|$/.test(line))
        .map(line => {
            const cells = line.slice(1, -1).split(/(?<!\\)\|/).map(text => text.trim().replace(/\\\|/g, '|'));
            const [time, action, uuid, nameAndVersion, sha, zipSha256, operator] = cells;
            return {
                time, action, uuid: unquote(uuid), nameAndVersion, sha: unquote(sha), zipSha256: unquote(zipSha256), operator,
            };
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
            ? `${describeConfirmation(release.confirmation, false)}: requested; step 5 checks it again against origin/master and today's calendar and asks no one, and the gate still captures the channel again and checks everything before the push`
            : describeConfirmation(release.confirmation, false)),
        line('calendar', release.calendar.line.replace(/^Release calendar: /, '')),
        ...(release.pairedChannel1 ? [line('channel 1', `paired release ${describePairedRelease(release.pairedChannel1)}`)] : []),
    ].join('\n');
}
