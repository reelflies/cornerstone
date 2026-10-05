// Formats the push summary and the RELEASES.md entry for scripts/release.sh (ticket 05, step 7).
// Pure: no network, no files.
//
//   import { formatPushSummary, formatReleaseEntry, addReleaseEntry } from './release-log.mjs';
//
// A release: { timestamp, channel, channelName, variation, theme: { uuid, name, version },
//   git: { sha, branch }, bundle: { file, bytes, sha256, mainJsBytes },
//   step1: { replacing, overwritten, unpublished }, verify: { problems } | null, operator }

export const RELEASES_TEMPLATE = `# Release log

Every theme push to a storefront goes through \`scripts/release.sh\` ([docs/releasing.md](docs/releasing.md)), which appends an entry under "Releases" after the push. Don't edit the entries by hand.

## Releases
`;

const bytes = count => `${count.toLocaleString('en-CA')} B`;
const utc = iso => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const codeList = keys => keys.map(key => `\`${key}\``).join(', ');

export function describeStep1({ replacing, overwritten, unpublished }) {
    let text = 'no differences from the live saved settings';
    if (replacing) {
        text = `first release, replacing ${replacing.themeName} · variation "${replacing.variationName}" (theme ${replacing.themeUuid})`;
    } else if (overwritten.length) {
        text = `overwrote the live values of ${codeList(overwritten)}`;
    }
    return unpublished && !replacing ? `${text} (the channel had unpublished Theme Styles edits)` : text;
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

export function formatPushSummary(release) {
    const line = (label, value) => `  ${label.padEnd(10)} ${value}`;
    return [
        'Push summary',
        line('target', `channel ${release.channel} (${release.channelName})`),
        line('variation', release.variation),
        line('step 1', describeStep1(release.step1)),
        line('bundle', `${release.bundle.file}, ${bytes(release.bundle.bytes)}`),
        line('main.js', bytes(release.bundle.mainJsBytes)),
    ].join('\n');
}
