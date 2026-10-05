// Formats the push summary and the RELEASES.md entry for scripts/release.sh (ticket 05, step 7,
// with ticket 15's rf_* values, new switches and Switch toggles section). Pure: no network, no files.
//
//   import { formatPushSummary, formatReleaseEntry, addReleaseEntry, releasedThemeUuids } from './release-log.mjs';
//
// A release: { timestamp, channel, channelName, variation, theme: { uuid, name, version },
//   git: { sha, branch }, bundle: { file, bytes, sha256, mainJsBytes },
//   step1: { replacing, overwritten, unpublished: [keys] }, guard: { values, newSwitches },
//   verify: { problems } | null, operator }

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

const bytes = count => `${count.toLocaleString('en-CA')} B`;
const utc = iso => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const codeList = keys => keys.map(key => `\`${key}\``).join(', ');
const valueList = (values, code) => values.map(({ key, value }) => `${code ? `\`${key}\`` : key} = ${displayValue(key, value)}`).join(', ') || 'none';

export function describeStep1({ replacing, overwritten, unpublished }) {
    let text = 'no differences from the live saved settings';
    if (replacing) {
        text = `first release, replacing ${replacing.themeName} · variation "${replacing.variationName}" (theme ${replacing.themeUuid})`;
    } else if (overwritten.length) {
        text = `overwrote the live values of ${codeList(overwritten)}`;
    }
    return unpublished.length && !replacing ? `${text} (the channel had unpublished Theme Styles edits in ${codeList(unpublished)})` : text;
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
        `- Bundle: \`${bundle.file}\`, ${bytes(bundle.bytes)}, sha256 \`${bundle.sha256}\``,
        `- main.js: ${bytes(bundle.mainJsBytes)}`,
        `- Step 1: ${describeStep1(release.step1)}`,
        `- rf_* values pushed: ${valueList(release.guard.values, true)}`,
        `- New switches: ${codeList(release.guard.newSwitches) || 'none'}`,
        `- Verify: ${describeVerify(release.verify)}`,
        `- Operator: ${release.operator}`,
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

export function formatPushSummary(release) {
    const line = (label, value) => `  ${label.padEnd(11)} ${value}`;
    const { newSwitches } = release.guard;
    return [
        'Push summary',
        line('target', `channel ${release.channel} (${release.channelName})`),
        line('variation', release.variation),
        line('step 1', describeStep1(release.step1)),
        line('rf_* values', valueList(release.guard.values, false)),
        ...(newSwitches.length ? newSwitches.map(key => line('new switch', key)) : [line('new switch', 'none')]),
        line('bundle', `${release.bundle.file}, ${bytes(release.bundle.bytes)}`),
        line('main.js', bytes(release.bundle.mainJsBytes)),
    ].join('\n');
}
