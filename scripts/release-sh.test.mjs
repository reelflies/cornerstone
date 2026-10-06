// Tests scripts/release.sh as the operator runs it, offline (tickets 05 and 15, spec seam 5).
// Refusals must come before any network call or build. The fixture runs use the test-only
// overrides RF_RELEASE_CONFIG and RF_RELEASE_LIVE_FIXTURE, which need --dry-run and stop the
// run after the release guard, so no test reaches npm ci, the build or the store. W0-1's runs add
// RF_RELEASE_CALENDAR_FIXTURE and RF_RELEASE_DATE, one calendar date per phase.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireLock, readHolder } from './lib/lock.mjs';

const SCRIPT = fileURLToPath(new URL('./release.sh', import.meta.url));
const NOTHING_RAN = /Step 1|Step 2|npm ci|Capturing/;
const CA = ['--channel', '1895766', '--variation', 'ReelFlies CA'];

const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
// A folder for the release lock (W0-7), so no test takes ~/reelflies/theme/.locks/release.
const lockRoot = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-locks-'));
    tempDirs.push(dir);
    return dir;
};
const LOCK_ROOT = lockRoot();

function run(args, env = {}, script = SCRIPT) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^RF_(RELEASE|BC)_/.test(key)));
    const result = spawnSync('bash', [script, ...args], {
        encoding: 'utf8',
        env: {
            ...inherited, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, RF_LOCK_ROOT: LOCK_ROOT, ...env,
        },
        timeout: 60000,
    });
    return {
        status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`,
    };
}

function assertRefused(result, reason) {
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.stderr, reason);
    assert.doesNotMatch(result.output, NOTHING_RAN);
}

const refusals = [
    ['no channel', ['--variation', 'ReelFlies CA', '--dry-run'], /--channel/],
    ['more than one channel', ['--channel', '1895766', '--channel', '1', '--variation', 'ReelFlies CA', '--dry-run'], /one channel per release/],
    ['a comma-separated channel list', ['--channel', '1895766,1', '--variation', 'ReelFlies CA', '--dry-run'], /one channel per release/],
    ['a space-separated channel list', ['--channel', '1895766 1', '--variation', 'ReelFlies CA', '--dry-run'], /one channel per release/],
    ['-allc', [...CA, '-allc', '--dry-run'], /all channels/],
    ['--all-channels', [...CA, '--all-channels', '--dry-run'], /all channels/],
    ['a bare -a', ['--channel', '1895766', '-a', '--dry-run'], /--variation/],
    ['-d', [...CA, '-d', '--dry-run'], /never deletes themes/],
    ['an unknown flag', [...CA, '--force', '--dry-run'], /unknown flag --force/],
    ['no named variation', ['--channel', '1895766', '--dry-run'], /name the variation with --variation/],
    ['an empty variation', ['--channel', '1895766', '--variation', '', '--dry-run'], /--variation is empty/],
    ['a variation that is not in config.json', ['--channel', '1895766', '--variation', 'Light', '--dry-run'], /"Light" isn't a variation in config\.json/],
    ['a channel that is not a release target', ['--channel', '42', '--variation', 'ReelFlies CA', '--dry-run'], /not a release target/],
    ['channel 1 (live reelflies.ca)', ['--channel', '1', '--variation', 'ReelFlies CA', '--dry-run'], /ticket 53/],
    ['channel 1855224 (reelflies.com)', ['--channel', '1855224', '--variation', 'ReelFlies US', '--dry-run'], /\.com stays on its own theme/],
    ['a variation not allowed for the channel', ['--channel', '1895766', '--variation', 'ReelFlies US', '--dry-run'], /"ReelFlies US" isn't released to channel 1895766/],
    ['--accept-live with --overwrite-live', [...CA, '--accept-live', '--overwrite-live', '--dry-run'], /either --accept-live or --overwrite-live/],
    ['--first-release with --accept-live', [...CA, '--first-release', '--accept-live', '--dry-run'], /--first-release can't be combined/],
    // W0-1: --confirm-nonprod replaces the typed channel id only on a non-production target that it names.
    ['--confirm-nonprod with no channel id', [...CA, '--confirm-nonprod', '--dry-run'], /--confirm-nonprod needs the channel id/],
    ['--confirm-nonprod naming another channel than --channel', [...CA, '--confirm-nonprod', '1855224', '--dry-run'], /--confirm-nonprod 1855224 isn't --channel 1895766/],
    ['--confirm-nonprod given twice', [...CA, '--confirm-nonprod', '1895766', '--confirm-nonprod', '1895766', '--dry-run'], /--confirm-nonprod was given 2 times/],
    ['--confirm-nonprod with --overwrite-live', [...CA, '--confirm-nonprod', '1895766', '--overwrite-live', '--dry-run'], /--confirm-nonprod can't be combined with --overwrite-live/],
    ['--confirm-nonprod with --first-release', [...CA, '--confirm-nonprod', '1895766', '--first-release', '--dry-run'], /--confirm-nonprod can't be combined with --first-release/],
    ['--confirm-nonprod on channel 1 (live reelflies.ca: typed only)', ['--channel', '1', '--variation', 'ReelFlies CA', '--confirm-nonprod', '1', '--dry-run'], /ticket 53/],
    ['--confirm-nonprod on channel 1855224, which isn\'t a target', ['--channel', '1855224', '--variation', 'ReelFlies US', '--confirm-nonprod', '1855224', '--dry-run'], /\.com stays on its own theme/],
];

for (const [name, args, reason] of refusals) {
    test(`release.sh refuses ${name} before anything runs`, () => {
        assertRefused(run(args), reason);
    });
}

// --- Fixture runs ------------------------------------------------------------------------

const VARIATION_META = {
    desktop_screenshot: 'd.png', mobile_screenshot: 'm.png', description: 'x', demo_url: 'https://example.com', optimized_for: ['mobile'],
};
const BASE_SETTINGS = { 'body-bg': '#ffffff', 'color-textBase': '#545454', show_accept_amex: true };

test('release.sh and step 3\'s contrast check still run from a checkout whose path has # or % in it', () => {
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-test-')), 'theme #1 %41');
    tempDirs.push(path.dirname(root));
    fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
    const scripts = path.dirname(SCRIPT);
    fs.readdirSync(scripts).filter(name => /^(release(-[a-z-]+)?\.(mjs|sh)|check-contrast\.mjs)$/.test(name)).forEach(name => {
        fs.copyFileSync(path.join(scripts, name), path.join(root, 'scripts', name));
    });
    fs.cpSync(path.join(scripts, 'lib'), path.join(root, 'scripts', 'lib'), { recursive: true }); // isMain and formatBytes
    assertRefused(run([...CA, '-allc', '--dry-run'], {}, path.join(root, 'scripts', 'release.sh')), /all channels/);

    const config = fileURLToPath(new URL('../config.json', import.meta.url));
    const contrast = spawnSync(process.execPath, [path.join(root, 'scripts', 'check-contrast.mjs'), config], { encoding: 'utf8' });
    assert.match(contrast.stdout, /ReelFlies CA: \d+\/\d+ pass/, 'the check ran instead of exiting 0 with no output');
});

const themeConfig = ({
    name = 'Cornerstone', settings, caSettings = {}, caName = 'ReelFlies CA',
}) => ({
    name,
    version: '6.22.0',
    settings,
    variations: [
        {
            name: caName, id: 'reelflies-ca', meta: VARIATION_META, settings: caSettings,
        },
        {
            name: 'ReelFlies US', id: 'reelflies-us', meta: VARIATION_META, settings: {},
        },
    ],
});

const RELEASED_SHA = 'abc1234000000000000000000000000000000000';

const LIVE_THEME_UUID = '00000000-0000-0000-0000-00000000aaaa';

// A RELEASES.md with one release on channel 1895766 at `sha`, of theme `uuid`, or none.
function releaseLog(sha, uuid) {
    const template = '# Release log\n\n## Releases\n\n## Switch toggles\n';
    if (!sha) return template;
    return template.replace('## Releases\n', `## Releases\n\n### 2026-10-06 14:30 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: Cornerstone 6.22.0, uuid \`${uuid}\`
- Commit: \`${sha}\` on \`master\`
- Operator: test
`);
}

// Writes a repo config and a live capture (the shape release.sh writes to config.<slug>.live.json),
// and the release log the run reads instead of RELEASES.md (W0-2), with no release on the channel.
// published: values where the published Theme Styles differ from the saved (live) ones.
// released: the base settings at the channel's last release, which adds that release to the log
// and writes its config.json as RF_RELEASE_BASE_FIXTURE. releasedSha: the release's commit.
// baseFixture: false leaves RF_RELEASE_BASE_FIXTURE unset, so the run reads the commit with git.
// releasedVariation: the name of the CA variation in the last release's config.json.
// releasedUuid: the theme the last release pushed, by default the live one.
function fixtures({
    name = 'Cornerstone', repo = {}, caSettings = {}, live = {}, published = null, liveTheme = 'Cornerstone', liveVariation = 'ReelFlies CA', themeCount = 11,
    released = null, releasedSha = RELEASED_SHA, baseFixture = true, releasedVariation = 'ReelFlies CA', releasedUuid = LIVE_THEME_UUID,
} = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-test-'));
    tempDirs.push(dir);
    const config = themeConfig({ name, settings: { ...BASE_SETTINGS, ...repo }, caSettings });
    const settings = { ...BASE_SETTINGS, ...live };
    const savedEqualsActive = !published;
    const capture = {
        name: liveTheme,
        settings,
        variations: [{ name: liveVariation, settings: {} }],
        capture: {
            channelId: 1895766,
            themeUuid: LIVE_THEME_UUID,
            themeName: liveTheme,
            variationName: liveVariation,
            variationUuid: '00000000-0000-0000-0000-00000000bbbb',
            activeConfigurationUuid: '00000000-0000-0000-0000-00000000cccc',
            savedConfigurationUuid: savedEqualsActive ? '00000000-0000-0000-0000-00000000cccc' : '00000000-0000-0000-0000-00000000dddd',
            savedEqualsActive,
            unpublishedKeys: Object.keys(published || {}).sort(),
            publishedSettings: { ...settings, ...published },
            themeCount,
            capturedAt: '2026-10-05T12:00:00.000Z',
        },
    };
    const configPath = path.join(dir, 'config.json');
    const livePath = path.join(dir, 'config.ca.live.json');
    const logPath = path.join(dir, 'RELEASES.md');
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    fs.writeFileSync(livePath, `${JSON.stringify(capture, null, 2)}\n`);
    fs.writeFileSync(logPath, releaseLog(released && releasedSha, releasedUuid));
    const env = { RF_RELEASE_CONFIG: configPath, RF_RELEASE_LIVE_FIXTURE: livePath, RF_RELEASE_LOG_FIXTURE: logPath };
    if (released && baseFixture) {
        const basePath = path.join(dir, 'config.released.json');
        fs.writeFileSync(basePath, `${JSON.stringify(themeConfig({ name, settings: { ...BASE_SETTINGS, ...released }, caName: releasedVariation }), null, 2)}\n`);
        env.RF_RELEASE_BASE_FIXTURE = basePath;
    }
    return { dir, configPath, env };
}

test('the test-only overrides are refused without --dry-run, so a real push always captures live', () => {
    const { env } = fixtures();
    assertRefused(run(CA, env), /RF_RELEASE_CONFIG.*--dry-run|--dry-run.*RF_RELEASE/);
    assertRefused(run(CA, { RF_RELEASE_LIVE_FIXTURE: env.RF_RELEASE_LIVE_FIXTURE }), /RF_RELEASE_LIVE_FIXTURE/);
    assertRefused(run(CA, { RF_RELEASE_TREE_FIXTURE: env.RF_RELEASE_LIVE_FIXTURE }), /RF_RELEASE_TREE_FIXTURE/);
    assertRefused(run(CA, { RF_RELEASE_LOG_FIXTURE: env.RF_RELEASE_LOG_FIXTURE }), /RF_RELEASE_LOG_FIXTURE/);
    assertRefused(run(CA, { RF_RELEASE_BASE_FIXTURE: env.RF_RELEASE_CONFIG }), /RF_RELEASE_BASE_FIXTURE/);
    assertRefused(run(CA, { RF_RELEASE_CALENDAR_FIXTURE: env.RF_RELEASE_CONFIG }), /RF_RELEASE_CALENDAR_FIXTURE/);
    assertRefused(run(CA, { RF_RELEASE_DATE: '2026-10-06' }), /RF_RELEASE_DATE/);
    assertRefused(run([...CA, '--confirm-nonprod', '1895766'], { RF_RELEASE_DATE: '2026-10-06' }), /RF_RELEASE_DATE.*--dry-run/);
});

test('with no live differences, step 1 passes and a fixture run stops before the clean build', () => {
    const { env } = fixtures();
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /no differences/);
    assert.match(result.stdout, /stopped before the clean build/);
    assert.doesNotMatch(result.output, /Step 2|npm ci/);
});

test('a channel that runs another theme stops step 1 unless --first-release is given', () => {
    const { env } = fixtures({ liveTheme: 'Cavio', liveVariation: 'Natural', live: { cavio_only: 1 } });
    const stopped = run([...CA, '--dry-run'], env);
    assert.equal(stopped.status, 1, stopped.output);
    assert.match(stopped.stderr, /runs Cavio · variation "Natural".*not this fork.*--first-release/);

    const first = run([...CA, '--dry-run', '--first-release'], env);
    assert.equal(first.status, 0, first.output);
    assert.match(first.stdout, /first release: replacing Cavio · variation "Natural" \(theme 00000000-0000-0000-0000-00000000aaaa\)/);
});

test('--first-release is refused on a channel that already runs this fork, because it would skip the diff', () => {
    const { env } = fixtures();
    const result = run([...CA, '--dry-run', '--first-release'], env);
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /already runs this fork/);
});

test('a channel that runs this fork under the theme\'s old name still gets the diff, and --first-release is refused', () => {
    const { env } = fixtures({ name: 'ReelFlies', live: { 'body-bg': '#fafafa' } });
    const stopped = run([...CA, '--dry-run'], env);
    assert.equal(stopped.status, 1, stopped.output);
    assert.match(stopped.stdout, /changed {4}body-bg: live "#fafafa", config\.json "#ffffff"/);

    const first = run([...CA, '--dry-run', '--first-release'], env);
    assert.equal(first.status, 2, first.output);
    assert.match(first.stderr, /already runs this fork/);
});

test('a live Theme Styles edit stops the release, naming the key and both values', () => {
    const { env } = fixtures({ live: { 'body-bg': '#fafafa' } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /changed {4}body-bg: live "#fafafa", config\.json "#ffffff"/);
    assert.match(result.stderr, /--accept-live.*--overwrite-live/);
    assert.doesNotMatch(result.output, /Step 2/);
});

test('a live-only setting stops the release too; a setting only in config.json passes as new', () => {
    const liveOnly = run([...CA, '--dry-run'], fixtures({ live: { old_setting: 'x' } }).env);
    assert.equal(liveOnly.status, 1, liveOnly.output);
    assert.match(liveOnly.stdout, /live only {2}old_setting: "x"/);

    const repoOnly = run([...CA, '--dry-run'], fixtures({ caSettings: { new_setting: 3 } }).env);
    assert.equal(repoOnly.status, 0, repoOnly.output);
    assert.match(repoOnly.stdout, /1 setting\(s\) only in config\.json pass: new_setting/);
});

test('--overwrite-live lists the values a real release would overwrite; a dry run asks nothing', () => {
    const { env } = fixtures({ live: { 'body-bg': '#fafafa' } });
    const result = run([...CA, '--dry-run', '--overwrite-live'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /body-bg: live "#fafafa"/);
    assert.match(result.stdout, /a real release asks you to type the channel id/);
});

test('--accept-live in a dry run shows the live values and leaves config.json alone', () => {
    const { env, configPath } = fixtures({ live: { 'body-bg': '#fafafa' } });
    const before = fs.readFileSync(configPath, 'utf8');
    const result = run([...CA, '--dry-run', '--accept-live'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /body-bg: live "#fafafa"/);
    assert.match(result.stderr, /writes nothing/);
    assert.equal(fs.readFileSync(configPath, 'utf8'), before);
});

test('unpublished Theme Styles edits are reported by key, and step 1 diffs the saved settings', () => {
    const { env } = fixtures({ published: { 'body-bg': '#eeeeee' } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /unpublished Theme Styles edits in 1 setting\(s\): body-bg/);
});

test('a full My Themes (20) is a warning in a dry run, because a real release would stop there', () => {
    const { env } = fixtures({ themeCount: 20 });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /My Themes holds 20 themes.*never deletes themes.*a real release stops here/);
});

// --- The live contrast report (spec seam 3, ticket 06) -------------------------------------

// config.json's colours for ReelFlies CA, so every pair the contrast check reads is there.
function caColours() {
    const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
    return { ...config.settings, ...config.variations.find(variation => variation.name === 'ReelFlies CA').settings };
}

test('a live colour pair that fails contrast is reported as a warning, and the release goes on', () => {
    const colours = { ...caColours(), 'color-textHeading': '#bbbbbb' };
    const { env } = fixtures({ repo: colours, live: colours });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /config\.ca\.live\.json · ReelFlies CA: \d+\/\d+ pass/);
    assert.match(result.stdout, /FAIL {5}heading: #bbbbbb on #ffffff/);
    assert.match(result.stdout, /WARNING {2}the live colours: 1 pair\(s\) fail WCAG contrast.*doesn't stop the release.*step 3/);
    assert.match(result.stdout, /guard: pass/);
    assert.match(result.stdout, /stopped before the clean build/);
});

test('live colours that pass, apart from the known failures, get no contrast warning', () => {
    const { env } = fixtures({ repo: caColours(), live: caColours() });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /ReelFlies CA: \d+\/\d+ pass/);
    assert.doesNotMatch(result.stdout, /WARNING .*live colours/);
});

test('a first release doesn\'t check the live colours, because they belong to another theme', () => {
    const { env } = fixtures({ liveTheme: 'Cavio', liveVariation: 'Natural', live: { 'color-textHeading': '#bbbbbb' } });
    const result = run([...CA, '--dry-run', '--first-release'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /first release: replacing Cavio[^\n]*\nskipped {2}live contrast: the live theme's colours aren't checked, because it's another theme/);
    assert.doesNotMatch(result.stdout, /\d+\/\d+ pass|heading:/);
});

// --- The release guard (ticket 15) ----------------------------------------------------------

test('with today\'s config.json (no rf_* keys, no menu ids) the guard passes', () => {
    const config = JSON.parse(fs.readFileSync(new URL('../config.json', import.meta.url), 'utf8'));
    const ca = config.variations.find(variation => variation.name === 'ReelFlies CA');
    const { env } = fixtures({ live: { ...config.settings, ...ca.settings } });
    const result = run([...CA, '--dry-run'], { ...env, RF_RELEASE_CONFIG: fileURLToPath(new URL('../config.json', import.meta.url)) });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /rf_\* values to push: none/);
    assert.match(result.stdout, /guard: pass/);
});

test('a live rf_quick_add that is off while config.json has it on stops release.sh before the build', () => {
    const { env } = fixtures({ repo: { rf_quick_add: true }, live: { rf_quick_add: false } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /rf_quick_add: live false, config\.json true/);
    assert.match(result.stderr, /release guard.*nothing was built or pushed/);
    assert.doesNotMatch(result.output, /Step 2|npm ci|stopped before the clean build/);
});

test('a published rf_quick_add that is off stops release.sh, though the saved draft has it on like config.json', () => {
    const { env } = fixtures({ repo: { rf_quick_add: true }, live: { rf_quick_add: true }, published: { rf_quick_add: false } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /rf_quick_add: published false \(what shoppers see\), config\.json true; the saved draft has true/);
    assert.match(result.stderr, /release guard.*nothing was built or pushed/);
});

test('a switch only in config.json passes and is listed as a new switch', () => {
    const { env } = fixtures({ caSettings: { rf_cart_state: true } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /new switch {2}rf_cart_state/);
    assert.match(result.stdout, /rf_\* values to push: rf_cart_state = true/);
});

test('a switch only on the live side stops the release', () => {
    const { env } = fixtures({ live: { rf_region_prompt: true } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /rf_region_prompt is only on the live theme \(true\): removing a switch must be deliberate/);
});

function treeFixture(ids) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-test-')), 'tree.json');
    tempDirs.push(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(ids));
    return file;
}

test('a set menu id that isn\'t in the channel\'s tree stops the release, naming the id', () => {
    const { env } = fixtures({ caSettings: { rf_menu_type_ids: '23,77', rf_menu_species_root_id: '' } });
    const result = run([...CA, '--dry-run'], { ...env, RF_RELEASE_TREE_FIXTURE: treeFixture([23, 24, 25]) });
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /rf_menu_type_ids: category 77 isn't in channel 1895766's category tree/);
});

test('set menu ids that are in the channel\'s tree pass', () => {
    const { env } = fixtures({ caSettings: { rf_menu_type_ids: '23,24', rf_menu_species_root_id: '25' } });
    const result = run([...CA, '--dry-run'], { ...env, RF_RELEASE_TREE_FIXTURE: treeFixture([23, 24, 25]) });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /guard: pass/);
});

test('a live menu id that differs from config.json stops step 1, like any other Theme Styles edit', () => {
    const { env } = fixtures({ caSettings: { rf_menu_type_ids: '24' }, live: { rf_menu_type_ids: '23' } });
    const result = run([...CA, '--dry-run'], { ...env, RF_RELEASE_TREE_FIXTURE: treeFixture([23, 24]) });
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /changed {4}rf_menu_type_ids: live "23", config\.json "24"/);
    assert.match(result.stderr, /--accept-live.*--overwrite-live/);
    assert.doesNotMatch(result.output, /guard: pass|Step 2/);
});

test('a menu id only on the live side stops step 1, so the push can\'t drop it unannounced', () => {
    const { env } = fixtures({ live: { rf_menu_species_root_id: '25' } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /live only {2}rf_menu_species_root_id: "25"/);
    assert.doesNotMatch(result.output, /guard: pass/);
});

test('--overwrite-live lists a differing menu id, and the guard still checks config.json\'s ids', () => {
    const { env } = fixtures({ caSettings: { rf_menu_type_ids: '24' }, live: { rf_menu_type_ids: '23' } });
    const result = run([...CA, '--dry-run', '--overwrite-live'], { ...env, RF_RELEASE_TREE_FIXTURE: treeFixture([23, 24]) });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /rf_menu_type_ids: live "23", config\.json "24"/);
    assert.match(result.stdout, /a real release asks you to type the channel id here, then overwrites these 1 value/);
    assert.match(result.stdout, /guard: pass/);
});

test('a set menu id without RF_BC_API_TOKEN stops before any catalogue call, naming the token scope', () => {
    const { env } = fixtures({ caSettings: { rf_menu_species_root_id: '25' } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /RF_BC_API_TOKEN.*Products: read-only/);
});

// --- W0-2: step 1's three-way diff, with config.json at the channel's last release ----------

const git = (...args) => spawnSync('git', args, { encoding: 'utf8', cwd: path.dirname(SCRIPT) }).stdout.trim();

test('W0-2: a setting changed in the repo since the channel\'s last release passes step 1 as "changed in repo", and is listed', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, released: {} });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /base {5}config\.json at abc1234, the channel's last release \(2026-10-06 14:30 UTC, ReelFlies CA\)/);
    assert.match(result.stdout, /in repo {4}body-bg: live "#ffffff" \(as last released\), config\.json "#000000"/);
    assert.match(result.stdout, /1 setting\(s\) changed in the repo since the last release pass/);
    assert.match(result.stdout, /no Theme Styles edits since the last release/);
    assert.match(result.stdout, /stopped before the clean build/);
});

test('W0-2: a live value that differs from the last release stops step 1, because it was edited in the control panel', () => {
    const { env } = fixtures({ live: { 'body-bg': '#fafafa' }, released: {} });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /changed {4}body-bg: live "#fafafa", config\.json "#ffffff", last released "#ffffff"/);
    assert.match(result.stderr, /1 live Theme Styles value\(s\) differ from both config\.json and the channel's last release \(abc1234\).*--accept-live.*--overwrite-live/);
    assert.doesNotMatch(result.output, /Step 2|stopped before the clean build/);
});

test('W0-2: a key changed in both the repo and the control panel stops step 1, naming all three values', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, live: { 'body-bg': '#fafafa' }, released: {} });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /changed {4}body-bg: live "#fafafa", config\.json "#000000", last released "#ffffff"/);
    assert.doesNotMatch(result.stdout, /in repo {4}body-bg/);
});

test('W0-2: a repo change and a control-panel edit on different keys: the edit stops step 1, and only the edit', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, live: { 'color-textBase': '#111111' }, released: {} });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /in repo {4}body-bg/);
    assert.match(result.stdout, /changed {4}color-textBase: live "#111111", config\.json "#545454", last released "#545454"/);
    assert.match(result.stderr, /1 live Theme Styles value\(s\) differ/);
});

test('W0-2: with no release of the channel in RELEASES.md, step 1 compares two ways as before: a repo change stops it', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /base {5}none: RELEASES\.md records no release on channel 1895766, so every live difference stops step 1/);
    assert.match(result.stdout, /changed {4}body-bg: live "#ffffff", config\.json "#000000"\n/);
    assert.match(result.stderr, /1 live Theme Styles value\(s\) differ from config\.json for "ReelFlies CA"\. Rerun with --accept-live/);
});

test('W0-2: a first release skips step 1\'s diff, so the last release isn\'t read', () => {
    const { env } = fixtures({
        liveTheme: 'Cavio',
        liveVariation: 'Natural',
        live: { 'body-bg': '#123456' },
        released: {},
        baseFixture: false,
        releasedSha: '0000000000000000000000000000000000000bad',
        releasedUuid: '00000000-0000-0000-0000-0000000000ff',
    });
    const result = run([...CA, '--dry-run', '--first-release'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /first release: replacing Cavio/);
    assert.doesNotMatch(result.stdout, /^base |^in repo|can't read/m);
});

test('W0-2: the menu ids follow the three-way rule, so wave R1\'s new ids pass step 1 and the guard checks them', () => {
    const empty = { rf_menu_type_ids: '', rf_menu_species_root_id: '' };
    const ids = { caSettings: { rf_menu_type_ids: '23,24', rf_menu_species_root_id: '25' }, live: empty, released: empty };
    const passed = run([...CA, '--dry-run'], { ...fixtures(ids).env, RF_RELEASE_TREE_FIXTURE: treeFixture([23, 24, 25]) });
    assert.equal(passed.status, 0, passed.output);
    assert.match(passed.stdout, /in repo {4}rf_menu_species_root_id: live "" \(as last released\), config\.json "25"/);
    assert.match(passed.stdout, /in repo {4}rf_menu_type_ids: live "" \(as last released\), config\.json "23,24"/);
    assert.match(passed.stdout, /guard: pass/);

    const missing = run([...CA, '--dry-run'], { ...fixtures(ids).env, RF_RELEASE_TREE_FIXTURE: treeFixture([23, 24]) });
    assert.equal(missing.status, 1, missing.output);
    assert.match(missing.stdout, /rf_menu_species_root_id: category 25 isn't in channel 1895766's category tree/);
});

test('W0-2: a switch changed in the repo still stops at the release guard, whatever the last release had (rule 1 is unchanged)', () => {
    const { env } = fixtures({ repo: { rf_quick_add: true }, live: { rf_quick_add: false }, released: { rf_quick_add: false } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.doesNotMatch(result.stdout, /in repo {4}rf_quick_add/);
    assert.match(result.stdout, /rf_quick_add: live false, config\.json true\. No flag overrides this/);
    assert.match(result.stderr, /release guard.*nothing was built or pushed/);
});

test('W0-2: a published value that differs from the last release stops step 1, though the saved draft still has the released value', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, published: { 'body-bg': '#eeeeee' }, released: {} });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /changed {4}body-bg: live "#ffffff", config\.json "#000000", last released "#ffffff", published "#eeeeee"/);
});

test('W0-2: --accept-live takes only the control-panel edits, never the repo\'s own changes since the last release', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, live: { 'color-textBase': '#111111' }, released: {} });
    const result = run([...CA, '--dry-run', '--accept-live'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /changed {4}color-textBase: live "#111111"/);
    assert.doesNotMatch(result.stdout, /changed {4}body-bg/);
    assert.match(result.stderr, /write these 1 live value\(s\)/);

    const onlyRepo = run([...CA, '--dry-run', '--accept-live'], fixtures({ repo: { 'body-bg': '#000000' }, released: {} }).env);
    assert.equal(onlyRepo.status, 1, onlyRepo.output);
    assert.match(onlyRepo.stderr, /nothing to accept: every live difference is a change made in the repo since the last release/);
});

test('W0-2: --overwrite-live lists only the control-panel edits it would overwrite', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, live: { 'color-textBase': '#111111' }, released: {} });
    const result = run([...CA, '--dry-run', '--overwrite-live'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /overwrites these 1 value\(s\)/);
});

test('W0-2: a last release whose commit git can\'t read leaves step 1 two-way, and says why', () => {
    const { env } = fixtures({
        repo: { 'body-bg': '#000000' }, released: {}, baseFixture: false, releasedSha: '0000000000000000000000000000000000000bad',
    });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /base {5}none: can't read config\.json at 0000000 \(the channel's last release in RELEASES\.md\)/);
    assert.match(result.stderr, /differ from config\.json for "ReelFlies CA"/);
});

test('W0-2: a last release whose variation isn\'t in its config.json leaves step 1 two-way, and says why', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, released: {}, releasedVariation: 'Light' });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /base {5}none: "ReelFlies CA" isn't a variation in config\.json at abc1234/);
});

test('W0-2: without RF_RELEASE_BASE_FIXTURE, the last release\'s config.json comes from git at the entry\'s commit', () => {
    const head = git('rev-parse', 'HEAD');
    const atHead = JSON.parse(git('show', `${head}:config.json`));
    const ca = { ...atHead.settings, ...atHead.variations.find(variation => variation.name === 'ReelFlies CA').settings };
    const bodyBg = ca['body-bg'] === '#010101' ? '#020202' : '#010101';
    const ids = ['rf_menu_type_ids', 'rf_menu_species_root_id'].flatMap(key => String(ca[key] ?? '').split(',')).map(id => id.trim()).filter(Boolean).map(Number);
    const { env } = fixtures({
        repo: { ...ca, 'body-bg': bodyBg }, live: ca, released: {}, baseFixture: false, releasedSha: head,
    });
    const result = run([...CA, '--dry-run'], { ...env, RF_RELEASE_TREE_FIXTURE: treeFixture(ids) });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, new RegExp(`base {5}config\\.json at ${head.slice(0, 7)}, the channel's last release`));
    assert.match(result.stdout, new RegExp(`in repo {4}body-bg: live "${ca['body-bg']}" \\(as last released\\), config\\.json "${bodyBg}"`));
});

test('W0-2: a live theme that isn\'t the last release\'s is noted, and step 1 still compares with that release', () => {
    const { env } = fixtures({ repo: { 'body-bg': '#000000' }, released: {}, releasedUuid: '00000000-0000-0000-0000-0000000000ff' });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /NOTE {5}the channel runs theme 00000000-0000-0000-0000-00000000aaaa, not 00000000-0000-0000-0000-0000000000ff/);
    assert.match(result.stdout, /in repo {4}body-bg/);
});

// --- W0-1: --confirm-nonprod and the release calendar ---------------------------------------

const FLIP = '2027-03-01';

// A release calendar (scripts/release-calendar.json's shape) for RF_RELEASE_CALENDAR_FIXTURE.
function calendarFixture(calendar = { flip: FLIP, status: 'provisional', source: 'ticket 10 comment, test' }) {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-test-')), 'release-calendar.json');
    tempDirs.push(path.dirname(file));
    fs.writeFileSync(file, `${JSON.stringify(calendar, null, 2)}\n`);
    return file;
}

const AGENT = [...CA, '--dry-run', '--confirm-nonprod', '1895766'];
const onDate = (date, calendar) => ({ ...fixtures().env, RF_RELEASE_CALENDAR_FIXTURE: calendarFixture(calendar), RF_RELEASE_DATE: date });

// [date, phase, refused?, paired channel-1 release pending?], with the Flip on 2027-03-01.
const CALENDAR_RUNS = [
    ['2026-10-06', 'build', false, false],
    ['2027-01-25', 'T-35', false, false],
    ['2027-02-01', 'T-28', false, true],
    ['2027-02-08', 'T-21', true, true],
    ['2027-02-15', 'T-14', true, true],
    ['2027-03-01', 'T-0', true, false],
    ['2027-03-31', 'T+30', true, false],
];

for (const [date, phase, refused, paired] of CALENDAR_RUNS) {
    test(`W0-1: on ${date} (${phase}) release.sh ${refused ? 'refuses' : 'takes'} --confirm-nonprod 1895766${paired && !refused ? ', and records a paired channel-1 release pending' : ''}`, () => {
        const result = run(AGENT, onDate(date));
        if (refused) {
            assertRefused(result, /--confirm-nonprod is refused from T-21: every push needs the channel id typed at the terminal/);
            assert.ok(result.stderr.includes(`${date} is in ${phase}`), result.stderr);
            if (phase === 'T-0' || phase === 'T+30') assert.match(result.stderr, /ReelFlies_CA is live reelflies\.ca: agents never push to it, whatever its production flag/);
            return;
        }
        assert.equal(result.status, 0, result.output);
        assert.match(result.stdout, /^calendar Release calendar: Flip 2027-03-01 \(provisional; ticket 10 comment, test\)\./m);
        assert.ok(result.stdout.includes(`${date} is in ${phase}`), result.stdout);
        assert.match(result.stdout, /^confirm {2}non-interactive \(agent\): --confirm-nonprod 1895766 replaces step 5's typed channel id; step 5's gate still captures the channel again and checks everything before the push/m);
        if (paired) assert.match(result.stdout, /^paired {3}a paired channel-1 release is pending \(ticket 56\): channel 1 runs the same build from T-28 \(2027-02-01\)/m);
        else assert.doesNotMatch(result.stdout, /^paired /m);
        assert.match(result.stdout, /Step 1 · Capture and diff/);
        assert.match(result.stdout, /stopped before the clean build/);
    });
}

test('W0-1: a calendar with no Flip date limits nothing: --confirm-nonprod is taken, and the run says the date is provisional', () => {
    const result = run(AGENT, onDate('2027-03-10', { flip: null, status: 'provisional', source: 'ticket 10: Flip date after ticket 26' }));
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /^calendar Release calendar: no Flip date yet \(provisional; ticket 10: Flip date after ticket 26\), so nothing is limited\./m);
    assert.match(result.stdout, /^confirm {2}non-interactive \(agent\)/m);
    assert.doesNotMatch(result.stdout, /^paired /m);
});

test('W0-1: a set Flip date limits exactly as a provisional one, and the run says it is set', () => {
    const result = run(AGENT, onDate('2027-02-08', { flip: FLIP, status: 'set', source: 'ticket 10 comment, Shaun' }));
    assertRefused(result, /Flip 2027-03-01 \(set; ticket 10 comment, Shaun\)\. 2027-02-08 is in T-21/);
});

test('W0-1: without the flag, the typed prompt stays: no calendar date refuses a release, and from T-28 a paired channel-1 release is still recorded', () => {
    for (const date of ['2027-02-08', '2027-03-10']) {
        const result = run([...CA, '--dry-run'], onDate(date));
        assert.equal(result.status, 0, result.output);
        assert.match(result.stdout, /^confirm {2}typed: step 5 asks the operator to type the channel id, and stops without a terminal/m);
    }
    assert.match(run([...CA, '--dry-run'], onDate('2027-02-08')).stdout, /^paired {3}a paired channel-1 release is pending/m);
    assert.doesNotMatch(run([...CA, '--dry-run'], onDate('2027-03-10')).stdout, /^paired /m);
});

test('W0-1: a calendar that can\'t be read refuses every release, so a typo never reads as "no Flip date"', () => {
    for (const args of [AGENT, [...CA, '--dry-run']]) {
        assertRefused(run(args, onDate('2026-10-06', { flip: '2027-02-30', status: 'provisional', source: 'x' })), /the release calendar: the Flip date 2027-02-30 isn't a real date/);
        assertRefused(run(args, { ...fixtures().env, RF_RELEASE_CALENDAR_FIXTURE: path.join(os.tmpdir(), 'rf-no-such-calendar.json') }), /can't read the release calendar/);
    }
    assertRefused(run(AGENT, { ...fixtures().env, RF_RELEASE_DATE: '6/10/2026' }), /RF_RELEASE_DATE.*YYYY-MM-DD/);
});

test('W0-1: without the fixtures, a dry run reads scripts/release-calendar.json and today\'s date in Toronto', () => {
    const result = run(AGENT, fixtures().env);
    assert.match(result.output, /Release calendar: /);
    assert.doesNotMatch(result.output, /RF_RELEASE_CALENDAR_FIXTURE|RF_RELEASE_DATE/);
});

// Step 5 as release.sh runs it after a real release's build: `release.mjs pre-push`, on a state
// file like the one prepare and bundle-info write. It runs in an empty folder, so a capture would
// fail at once on the missing config.stencil.json: no test here reaches the store.
const RELEASE_MJS = fileURLToPath(new URL('./release.mjs', import.meta.url));

function stepFive(changes = {}, env = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-step5-'));
    tempDirs.push(dir);
    const statePath = path.join(dir, 'state.json');
    fs.writeFileSync(statePath, JSON.stringify({
        channel: 1895766,
        variation: 'ReelFlies CA',
        dryRun: false,
        firstRelease: false,
        acceptLive: false,
        overwriteLive: false,
        confirmNonprod: null,
        target: {
            id: 1895766, name: 'ReelFlies_CA', slug: 'ca', variations: ['ReelFlies CA'], liveFile: 'config.ca.live.json',
        },
        themeName: 'ReelFlies',
        version: '6.22.0',
        git: {
            sha: RELEASED_SHA, shortSha: 'abc1234', branch: 'master', dirty: false,
        },
        bundle: {
            file: 'reelflies-ca-6.22.0-abc1234.zip', bytes: 100, sha256: 'ab12', mainJsBytes: 50,
        },
        step1: {
            replacing: null, overwritten: [], unpublished: [], changedInRepo: [], base: null, baseNote: 'test',
        },
        guard: { values: [], newSwitches: [] },
        ...changes,
    }));
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^RF_(RELEASE|BC)_/.test(key)));
    const result = spawnSync(process.execPath, [RELEASE_MJS, 'pre-push'], {
        cwd: dir, encoding: 'utf8', input: '', env: { ...inherited, ...env, RF_RELEASE_STATE: statePath }, timeout: 60000,
    });
    return {
        status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`,
    };
}

test('W0-1: step 5 without --confirm-nonprod asks for the typed channel id, and no terminal stops it before any capture', () => {
    const result = stepFive();
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /^ {2}confirm {5}channel id typed at the terminal$/m);
    assert.match(result.stderr, /needs an operator at a terminal/);
    assert.doesNotMatch(result.output, /Capturing channel/);
});

test('W0-1: step 5 checks --confirm-nonprod again from the code, so an edited state file can\'t slip a refused flag past it', () => {
    const otherChannel = stepFive({ confirmNonprod: 1855224 });
    assert.equal(otherChannel.status, 1, otherChannel.output);
    assert.match(otherChannel.stderr, /--confirm-nonprod refused at step 5: --confirm-nonprod 1855224 isn't --channel 1895766.*Nothing was pushed/);
    assert.doesNotMatch(otherChannel.output, /Capturing channel/);

    const overwrite = stepFive({ confirmNonprod: 1895766, overwriteLive: true });
    assert.equal(overwrite.status, 1, overwrite.output);
    assert.match(overwrite.stderr, /--confirm-nonprod can't be combined with --overwrite-live/);
    assert.doesNotMatch(overwrite.output, /Capturing channel/);

    // The target's production flag comes from release-targets.mjs, never from the state file.
    const production = stepFive({ confirmNonprod: 1895766, target: { id: 1895766, name: 'ReelFlies_CA', production: true } });
    assert.match(production.stdout, /^ {2}confirm {5}non-interactive \(agent\)/m);
    assert.doesNotMatch(production.stderr, /production target/);
});

// The start of the push summary's calendar line: describePhase without its "Release calendar: " prefix.
function describeLine(phase) {
    const text = phase.phase === 'unset' ? 'no Flip date yet' : `Flip ${phase.flip}`;
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('W0-1: step 5 with --confirm-nonprod asks nothing, reads today\'s calendar again, then the gate captures the channel', async () => {
    const { readCalendar: read, phaseOn: on } = await import('./lib/release-calendar.mjs');
    const today = on(read());
    const result = stepFive({ confirmNonprod: 1895766 });
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, new RegExp(`^ {2}calendar {4}${describeLine(today)}`, 'm'));
    assert.match(result.stdout, /^ {2}confirm {5}non-interactive \(agent\), --confirm-nonprod 1895766: requested; step 5 checks it again/m);
    if (today.limits.confirmNonprod) {
        assert.match(result.stdout, new RegExp(`^confirm {2}non-interactive \\(agent\\): --confirm-nonprod 1895766, checked again with ${today.date}'s calendar`, 'm'));
        assert.match(result.stdout, /Capturing channel 1895766 again/);
        assert.match(result.stderr, /can't read config\.stencil\.json/, 'the capture ran, and failed here only because the folder is empty');
        assert.doesNotMatch(result.output, /needs an operator at a terminal/);
    } else {
        assert.match(result.stderr, /--confirm-nonprod refused at step 5/);
        assert.doesNotMatch(result.output, /Capturing channel/);
    }
});

// A real release refuses the calendar overrides at prepare. Step 5 doesn't read them either, as a
// second lock: with a T-21 fixture calendar and date set, it still reads the committed calendar.
test('W0-1: step 5 ignores RF_RELEASE_CALENDAR_FIXTURE and RF_RELEASE_DATE, and reads the committed calendar and today', async () => {
    const { readCalendar: read, phaseOn: on } = await import('./lib/release-calendar.mjs');
    const today = on(read());
    const result = stepFive({ confirmNonprod: 1895766 }, {
        RF_RELEASE_CALENDAR_FIXTURE: calendarFixture({ flip: FLIP, status: 'set', source: 'ticket 10 comment, test' }),
        RF_RELEASE_DATE: '2027-02-08', // T-21 on that calendar
    });
    assert.equal(result.status, 1, result.output);
    assert.doesNotMatch(result.output, /^fixture /m);
    assert.doesNotMatch(result.output, /2027-02-08|ticket 10 comment, test/);
    assert.match(result.stdout, new RegExp(`^ {2}calendar {4}${describeLine(today)}`, 'm'));
    if (today.limits.confirmNonprod) {
        assert.match(result.stdout, new RegExp(`checked again with ${today.date}'s calendar`));
        assert.match(result.stdout, /Capturing channel 1895766 again/);
    }
});

// --- Order of the build steps ---------------------------------------------------------------

test('the storefront gates (axe, raw HTML and screenshots) run on a fresh server for the target, after the bundle check and before the dry-run exit and the push', () => {
    const lines = fs.readFileSync(SCRIPT, 'utf8').split('\n');
    const lineOf = pattern => {
        const index = lines.findIndex(line => pattern.test(line) && !/^\s*#/.test(line));
        assert.notEqual(index, -1, `release.sh has no line matching ${pattern}`);
        return index;
    };
    const bundleCheck = lineOf(/node scripts\/check-bundle\.mjs "\$zip"/);
    const gates = lineOf(/npm run qa:prepush/);
    const dryRunExit = lineOf(/release dry-run-report/);
    const push = lineOf(/release pre-push/);
    // The gates' stencil start swaps assets/dist for a dev build, so they come after the zip is
    // checked; the push sends that checked zip (stencil push -f).
    assert.ok(bundleCheck < gates && gates < dryRunExit && dryRunExit < push, 'check-bundle, then qa:prepush, then the dry-run exit, then the push');
    // A server someone left running could serve another checkout or a stale build.
    assert.match(lines[gates], /QA_FRESH_SERVER=1 /);
    assert.match(lines[gates], /QA_CHANNEL="\$\(release state channel\)"/);
    assert.match(lines[gates], /QA_VARIATION="\$\(release state variation\)"/);
    // The release keeps the default port pair; agents' worktrees get their own (W0-7).
    assert.match(lines[gates], /QA_PORT=3300 /);
});

// stencil push asks nothing with -a and -c, except when My Themes is full: then it shows a checkbox,
// "Which theme(s) would you like to delete?" (stencil-cli lib/stencil-push.utils.js). With
// --confirm-nonprod no one is at a terminal, and piped keystrokes could pick a theme to delete
// (rf/safety, PR #18). The push reads /dev/null instead, so any prompt fails closed.
test('the push reads its stdin from /dev/null, so a stencil-cli prompt can\'t be answered by piped input', () => {
    const lines = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(line => !/^\s*#/.test(line));
    const pushes = lines.filter(line => /npx stencil /.test(line) && /push_args/.test(line));
    assert.equal(pushes.length, 1, pushes.join('\n'));
    assert.match(pushes[0], /^npx stencil "\$\{push_args\[@\]\}" <\/dev\/null 2>&1 \| release redact$/);
});

test('stencil-cli\'s theme-deletion prompt, given /dev/null, deletes nothing: it exits non-zero with no answer', () => {
    const stencilCli = fileURLToPath(new URL('../node_modules/@bigcommerce/stencil-cli/package.json', import.meta.url));
    const probe = `
        const { createRequire } = require('module');
        const inquirer = createRequire(${JSON.stringify(stencilCli)}).resolve('inquirer');
        import(require('url').pathToFileURL(inquirer).href).then(({ default: Inquirer }) => Inquirer.prompt([{
            type: 'checkbox', name: 'themeIdsToDelete', message: 'Which theme(s) would you like to delete?',
            choices: [{ name: 'ReelFlies', value: 'uuid-1' }], validate: val => val.length > 0 || 'You must delete at least one theme',
        }])).then(answers => console.log('ANSWERED', JSON.stringify(answers)));
    `;
    const result = spawnSync(process.execPath, ['-e', probe], {
        encoding: 'utf8', stdio: [fs.openSync('/dev/null', 'r'), 'pipe', 'pipe'], timeout: 20000,
    });
    assert.match(result.stdout, /Which theme\(s\) would you like to delete\?/, `the prompt ran: ${result.stderr}`);
    assert.doesNotMatch(result.stdout, /ANSWERED/);
    assert.notEqual(result.status, 0, `exit ${result.status}, signal ${result.signal}`);
});

// --- The release lock (W0-7) -------------------------------------------------------------------

// A pid no process can have, so it is never running.
const DEAD_PID = 2 ** 22 + 12345;

test('release.sh takes the release lock before anything else runs, and drops it when it exits', () => {
    const lines = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(line => !/^\s*#/.test(line));
    const take = lines.findIndex(line => /node scripts\/lib\/lock\.mjs take release --pid "\$\$"/.test(line));
    const prepare = lines.findIndex(line => /^release prepare/.test(line));
    assert.ok(take !== -1 && take < prepare, 'the lock is taken before release prepare');
    assert.match(lines.find(line => /^trap /.test(line)), /lock\.mjs drop release --pid "\$\$"/);
});

test('a release or dry run already running stops release.sh before anything runs, naming its holder and start time', () => {
    const root = lockRoot();
    const other = acquireLock('release', 'scripts/release.sh --channel 1895766 --variation ReelFlies CA --dry-run', { root, ticket: 'orchestrator' });
    const { started } = readHolder(other.dir);
    const result = run([...CA, '--dry-run'], { RF_LOCK_ROOT: root });
    assertRefused(result, /the release lock is held by scripts\/release\.sh --channel 1895766 --variation ReelFlies CA --dry-run \(ticket orchestrator\)/);
    assert.ok(result.stderr.includes(`since ${started}`), result.stderr);
    assert.match(result.stderr, /Another release or dry run is running on this Mac/);
    assert.ok(fs.existsSync(other.dir), 'the other run keeps its lock');
    other.release();
});

test('a release lock taken by hand under wave 0\'s rule stops it too, and says release.sh takes it itself now', () => {
    const root = lockRoot();
    fs.mkdirSync(path.join(root, 'release'));
    fs.writeFileSync(path.join(root, 'release', 'owner.txt'), 'orchestrator 2026-10-06T16:00 dry run\n');
    const result = run([...CA, '--dry-run'], { RF_LOCK_ROOT: root });
    assertRefused(result, /held by orchestrator 2026-10-06T16:00 dry run/);
    assert.match(result.stderr, /release\.sh takes this lock itself/);
    assert.ok(fs.existsSync(path.join(root, 'release', 'owner.txt')));
});

test('a stale release lock (over 90 minutes old, its pid gone) is broken with a STALE line, and the release goes on', () => {
    const root = lockRoot();
    acquireLock('release', 'scripts/release.sh --channel 1895766 (killed)', { root, pid: DEAD_PID, now: Date.now() - 91 * 60000 });
    const result = run([...CA, '-allc', '--dry-run'], { RF_LOCK_ROOT: root });
    assert.match(result.stdout, /^STALE {4}broke the release lock \(91 min old.*killed/m);
    assertRefused(result, /all channels/);
    assert.deepEqual(fs.readdirSync(root), [], 'and dropped its own lock when it ended');
});

test('a real run refuses RF_LOCK_ROOT, so no release takes a lock, or gate slots, that other runs can\'t see', () => {
    const root = path.join(lockRoot(), 'private');
    // Outside node --test: NODE_TEST_CONTEXT is what node --test gives the processes it runs.
    const result = run([...CA, '--dry-run'], { RF_LOCK_ROOT: root, NODE_TEST_CONTEXT: '' });
    assertRefused(result, /RF_LOCK_ROOT is a test seam.*unset it/);
    assert.doesNotMatch(result.stderr, /Another release or dry run is running/, 'it doesn\'t blame another release');
    assert.match(result.stderr, /the release lock couldn't be taken, so nothing ran/);
    assert.ok(!fs.existsSync(root), 'no lock was taken there');
});

test('release.sh drops its lock when it ends, after a refusal or a fixture run', () => {
    const root = lockRoot();
    assertRefused(run([...CA, '-allc', '--dry-run'], { RF_LOCK_ROOT: root }), /all channels/);
    assert.deepEqual(fs.readdirSync(root), []);
    const { env } = fixtures();
    const result = run([...CA, '--dry-run'], { ...env, RF_LOCK_ROOT: root });
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(fs.readdirSync(root), []);
});

test('every release.mjs step that release.sh calls is one release.mjs has', () => {
    const calls = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(line => !/^\s*#/.test(line))
        .flatMap(line => [...line.matchAll(/(?:^\s*|\$\(|\|\s*)release ([a-z-]+)/g)].map(match => match[1]));
    const listed = spawnSync(process.execPath, [fileURLToPath(new URL('./release.mjs', import.meta.url))], { encoding: 'utf8' });
    const steps = /\(steps: ([^)]+)\)/.exec(listed.stderr)[1].split(', ');
    assert.ok(calls.includes('prepare') && calls.includes('write-log'), `found ${calls.join(', ')}`);
    assert.deepEqual(calls.filter(call => !steps.includes(call)), [], `release.mjs steps: ${steps.join(', ')}`);
});
