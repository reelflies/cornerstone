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
import { phaseOn, readCalendar } from './lib/release-calendar.mjs';
import { originRepo } from './release-origin-fixture.mjs';

const SCRIPT = fileURLToPath(new URL('./release.sh', import.meta.url));
const RELEASE_MJS_PATH = fileURLToPath(new URL('./release.mjs', import.meta.url));
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
// An NVM_DIR with no nvm.sh, so release.sh never sources the developer's nvm (W0-1b): these runs
// use the Node that runs the tests, first on PATH.
const NO_NVM = path.join(LOCK_ROOT, 'no-nvm');

function run(args, env = {}, script = SCRIPT) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^RF_(RELEASE|BC)_/.test(key)));
    const result = spawnSync('bash', [script, ...args], {
        encoding: 'utf8',
        env: {
            ...inherited, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, RF_LOCK_ROOT: LOCK_ROOT, NVM_DIR: NO_NVM, ...env,
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
    // The guard's token loader (W0-3 points it at W0-11's) imports the store tooling check.
    fs.cpSync(path.join(scripts, 'store'), path.join(root, 'scripts', 'store'), { recursive: true });
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

test('a set menu id without the read-only store token stops before any catalogue call, naming the token scope and where it comes from', () => {
    const { env } = fixtures({ caSettings: { rf_menu_species_root_id: '25' } });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /a menu id is set, so the guard must read channel 1895766's category tree with the read-only store API token \(Products: read-only, store_v2_products_read_only\)/);
    // Under node --test the loader never reads the Keychain (scripts/lib/store-token.mjs).
    assert.match(result.stderr, /RF_BC_READ_TOKEN/);
    assert.doesNotMatch(result.output, /Reading channel 1895766's category tree/);
});

test('the guard takes its token from W0-11\'s loader, so RF_BC_API_TOKEN, RF_BC_READ_TOKEN and the Keychain item all reach it', () => {
    const source = fs.readFileSync(RELEASE_MJS_PATH, 'utf8');
    assert.doesNotMatch(source, /process\.env\.RF_BC_/, 'release.mjs reads no token variable itself, bar redacting them by name');
    assert.match(source, /readGuardToken\(\)/);
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
// file like the one prepare and bundle-info write. It runs in a clone of a local bare origin, on
// master at origin/master's tip (release-origin-fixture.mjs), which has no config.stencil.json, so
// a capture fails at once: no test here reaches the store or a real remote.
const RELEASE_MJS = fileURLToPath(new URL('./release.mjs', import.meta.url));

// The environment for release.mjs: none of the test-only overrides, tokens or GIT_* variables.
function cleanEnv(env) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(RF_(RELEASE|BC)_|GIT_)/.test(key)));
    return { ...inherited, ...env };
}

const gitRepo = files => {
    const repo = originRepo(files);
    tempDirs.push(repo.root);
    return repo;
};

function runReleaseMjs(step, args, { cwd, env = {}, state = null }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-state-'));
    tempDirs.push(dir);
    const statePath = path.join(dir, 'state.json');
    if (state) fs.writeFileSync(statePath, JSON.stringify(state));
    const result = spawnSync(process.execPath, [RELEASE_MJS, step, ...args], {
        cwd, encoding: 'utf8', input: '', env: cleanEnv({ ...env, RF_RELEASE_STATE: statePath }), timeout: 60000,
    });
    return {
        status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`,
    };
}

function stepFiveState(repo, changes) {
    return {
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
            sha: repo.head, shortSha: repo.head.slice(0, 7), branch: 'master', dirty: false,
        },
        bundle: {
            file: 'reelflies-ca-6.22.0-abc1234.zip', bytes: 100, sha256: 'ab12', mainJsBytes: 50,
        },
        step1: {
            replacing: null, overwritten: [], unpublished: [], changedInRepo: [], base: null, baseNote: 'test',
        },
        guard: { values: [], newSwitches: [] },
        ...changes,
    };
}

function stepFive(changes = {}, env = {}, repo = gitRepo()) {
    return runReleaseMjs('pre-push', [], { cwd: repo.clone, env, state: stepFiveState(repo, changes) });
}

test('W0-1: step 5 without --confirm-nonprod asks for the typed channel id, and no terminal stops it before any capture', () => {
    const repo = gitRepo();
    repo.git('remote', 'set-url', 'origin', path.join(repo.root, 'missing.git'));
    const result = stepFive({}, {}, repo);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, /^ {2}confirm {5}channel id typed at the terminal$/m);
    assert.match(result.stderr, /needs an operator at a terminal/);
    assert.doesNotMatch(result.output, /Capturing channel/);
    assert.doesNotMatch(result.output, /^origin |origin\/master|fetch/m, 'the typed path neither fetches nor checks origin/master');
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

test('W0-1: step 5 with --confirm-nonprod asks nothing, checks origin/master and today\'s calendar again, then the gate captures the channel', () => {
    const today = phaseOn(readCalendar());
    const repo = gitRepo();
    const result = stepFive({ confirmNonprod: 1895766 }, {}, repo);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stdout, new RegExp(`^ {2}calendar {4}${describeLine(today)}`, 'm'));
    assert.match(result.stdout, /^ {2}confirm {5}non-interactive \(agent\), --confirm-nonprod 1895766: requested; step 5 checks it again/m);
    assert.match(result.stdout, new RegExp(`^origin {3}${repo.head.slice(0, 7)} is still origin/master's tip$`, 'm'));
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
test('W0-1: step 5 ignores RF_RELEASE_CALENDAR_FIXTURE and RF_RELEASE_DATE, and reads the committed calendar and today', () => {
    const today = phaseOn(readCalendar());
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

// --- W0-1: an agent push runs only from master at origin/master's tip (release-origin.mjs) -------

// The calendar and targets that judge --confirm-nonprod are read from the checkout, so a stale
// checkout would be judged by stale rules (rf/safety and rf/skeptic on PR #18). These runs use a
// clone of a local bare origin, and `release.mjs prepare` as a real release (no test-only
// overrides): it stops at step 1's capture at the latest, because the clone has no
// config.stencil.json.

const releaseRepo = () => gitRepo({
    'config.json': `${JSON.stringify(themeConfig({ settings: BASE_SETTINGS }), null, 2)}\n`,
    '.nvmrc': `${process.version.slice(1)}\n`,
});
const AGENT_REAL = [...CA, '--confirm-nonprod', '1895766'];
const prepareIn = (repo, args, env) => runReleaseMjs('prepare', args, { cwd: repo.clone, env });
const flagAllowedToday = () => phaseOn(readCalendar()).limits.confirmNonprod;
const ORIGIN_REFUSED = /^REFUSED {2}--confirm-nonprod needs this checkout on master at origin\/master's tip, so that origin\/master's calendar and targets judge it: /m;
const NEW_CALENDAR = { 'scripts/release-calendar.json': '{"flip": "2026-10-27", "status": "set", "source": "ticket 10 comment, test"}\n' };

test('W0-1: a real release with --confirm-nonprod fetches origin, and goes on from master at origin/master\'s tip', () => {
    const repo = releaseRepo();
    const result = prepareIn(repo, AGENT_REAL);
    assert.match(result.stdout, new RegExp(`^origin {3}master at origin/master's tip ${repo.head.slice(0, 7)}, fetched just now`, 'm'));
    if (flagAllowedToday()) {
        assert.match(result.stdout, /Capturing channel 1895766/);
        assert.match(result.stderr, /can't read config\.stencil\.json/, 'step 1 ran, and stopped only because the clone has no stencil config');
    } else {
        assert.match(result.stderr, /--confirm-nonprod is refused from T-21/);
    }
});

test('W0-1: a real release with --confirm-nonprod is refused on a branch other than master, before step 1', () => {
    const repo = releaseRepo();
    repo.git('switch', '-q', '-c', 't99/old-ticket');
    const result = prepareIn(repo, AGENT_REAL);
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, ORIGIN_REFUSED);
    assert.match(result.stderr, /this checkout is on branch t99\/old-ticket, not master/);
    assert.doesNotMatch(result.output, /Capturing/);
});

test('W0-1: a real release with --confirm-nonprod is refused on a master that hasn\'t pulled a calendar change, whatever its own calendar says', () => {
    const repo = releaseRepo();
    const merged = repo.mergeOnOrigin(NEW_CALENDAR);
    const result = prepareIn(repo, AGENT_REAL);
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, ORIGIN_REFUSED);
    assert.match(result.stderr, new RegExp(`HEAD ${repo.head.slice(0, 7)} isn't origin/master's tip ${merged.slice(0, 7)}: git pull --ff-only origin master, then rerun`));
    assert.doesNotMatch(result.output, /Capturing/);
});

test('W0-1: a real release with --confirm-nonprod is refused when origin can\'t be fetched', () => {
    const repo = releaseRepo();
    repo.git('remote', 'set-url', 'origin', path.join(repo.root, 'missing.git'));
    const result = prepareIn(repo, AGENT_REAL);
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, ORIGIN_REFUSED);
    assert.match(result.stderr, /couldn't fetch origin's master \(.*missing\.git/);
    assert.doesNotMatch(result.output, /Capturing/);
});

test('W0-1: without the flag nothing is fetched or checked: a typed release runs from any checkout, as before', () => {
    const repo = releaseRepo();
    repo.git('switch', '-q', '-c', 't99/old-ticket');
    repo.git('remote', 'set-url', 'origin', path.join(repo.root, 'missing.git'));
    const result = prepareIn(repo, CA);
    assert.doesNotMatch(result.output, /^origin |origin\/master|fetch/m);
    assert.match(result.stdout, /Capturing channel 1895766/);
});

test('W0-1: a dry run with --confirm-nonprod fetches and checks too, but only warns, saying a real release stops there', () => {
    const repo = releaseRepo();
    repo.git('switch', '-q', '-c', 't99/old-ticket');
    const merged = repo.mergeOnOrigin({ 'README.md': 'later\n' });
    const result = prepareIn(repo, [...AGENT_REAL, '--dry-run']);
    assert.match(result.stdout, new RegExp(`^WARNING {2}--confirm-nonprod needs this checkout on master at origin/master's tip, so that origin/master's calendar and targets judge it: this checkout is on branch t99/old-ticket, not master: run the release from the main clone, on master; HEAD ${repo.head.slice(0, 7)} isn't origin/master's tip ${merged.slice(0, 7)}: .*\\(a dry run goes on; a real release stops here\\)$`, 'm'));
    assert.equal(repo.git('rev-parse', 'refs/remotes/origin/master'), merged, 'it fetched');
    if (flagAllowedToday()) assert.match(result.stdout, /Capturing channel 1895766/);
});

test('W0-1: a dry run on the test-only overrides stays offline: it compares with origin/master as last fetched', () => {
    const repo = releaseRepo();
    repo.mergeOnOrigin({ 'README.md': 'later\n' });
    const result = prepareIn(repo, AGENT, onDate('2026-10-06'));
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /^fixture {2}origin\/master as last fetched: a dry run on the test-only overrides doesn't fetch$/m);
    assert.match(result.stdout, new RegExp(`^origin {3}master at origin/master's tip ${repo.head.slice(0, 7)}: `, 'm'));
    assert.equal(repo.git('rev-parse', 'refs/remotes/origin/master'), repo.head, 'nothing was fetched');
});

test('W0-1: step 5 with --confirm-nonprod goes on when origin/master moved on without touching the release tooling or the calendar', () => {
    const repo = gitRepo();
    const merged = repo.mergeOnOrigin({ 'templates/pages/home.html': 'home\n' });
    const result = stepFive({ confirmNonprod: 1895766 }, {}, repo);
    assert.match(result.stdout, new RegExp(`^origin {3}origin/master moved on to ${merged.slice(0, 7)} while this release ran, but changed none of the release tooling or the calendar, so the push sends ${repo.head.slice(0, 7)} as checked$`, 'm'));
    if (flagAllowedToday()) assert.match(result.stdout, /Capturing channel 1895766 again/);
});

test('W0-1: step 5 with --confirm-nonprod stops before the capture when a calendar change merged while the release ran', () => {
    const repo = gitRepo();
    const merged = repo.mergeOnOrigin(NEW_CALENDAR);
    const result = stepFive({ confirmNonprod: 1895766 }, {}, repo);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, new RegExp(`--confirm-nonprod refused at step 5: origin/master moved on to ${merged.slice(0, 7)} while this release ran, and changed the release tooling or the calendar since ${repo.head.slice(0, 7)} \\(scripts/release-calendar\\.json\\): pull and rerun the release\\. Nothing was pushed`));
    assert.doesNotMatch(result.output, /Capturing channel/);
});

test('W0-1: step 5 with --confirm-nonprod stops before the capture when origin can\'t be fetched again', () => {
    const repo = gitRepo();
    repo.git('remote', 'set-url', 'origin', path.join(repo.root, 'missing.git'));
    const result = stepFive({ confirmNonprod: 1895766 }, {}, repo);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /--confirm-nonprod refused at step 5: couldn't fetch origin's master again \(.*missing\.git/);
    assert.doesNotMatch(result.output, /Capturing channel/);
});

// Step 7 as release.sh runs it after verify, in an empty folder: it writes RELEASES.md there.
test('W0-1: step 7\'s entry says whether the push made a new theme uuid, from step 5\'s capture and verify\'s (decision 9)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-step7-'));
    tempDirs.push(dir);
    const repo = gitRepo();
    const log = (before, now) => {
        fs.rmSync(path.join(dir, 'RELEASES.md'), { force: true });
        const result = runReleaseMjs('write-log', [], {
            cwd: dir,
            state: {
                ...stepFiveState(repo, { confirmNonprod: 1895766 }),
                confirmation: { mode: 'nonprod', channel: 1895766 },
                calendar: { line: 'Release calendar: no Flip date yet (provisional; test), so nothing is limited.' },
                pairedChannel1: null,
                beforePush: { themeUuid: before },
                verify: { problems: [], themeUuid: now },
            },
        });
        assert.equal(result.status, 0, result.output);
        return fs.readFileSync(path.join(dir, 'RELEASES.md'), 'utf8');
    };
    const same = log(LIVE_THEME_UUID, LIVE_THEME_UUID);
    assert.match(same, new RegExp(`\\n- Theme: ReelFlies 6\\.22\\.0, uuid \`${LIVE_THEME_UUID}\`\\n- New uuid: no, a new version of the theme the channel ran before the push\\n`));
    const fresh = log(LIVE_THEME_UUID, '00000000-0000-0000-0000-00000000ffff');
    assert.match(fresh, new RegExp(`\\n- New uuid: yes; before the push the channel ran theme \`${LIVE_THEME_UUID}\`\\n`));
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

// --- W0-3: pruning My Themes ---------------------------------------------------------------------

const PRUNE_REFUSALS = [
    ['--prune-only with a channel', ['--prune-only', '--channel', '1895766', '--dry-run'], /--prune-only takes only --dry-run/],
    ['--prune-only with a variation', ['--prune-only', '--variation', 'ReelFlies CA', '--dry-run'], /--prune-only takes only --dry-run/],
    ['--prune-only with --confirm-nonprod', ['--prune-only', '--confirm-nonprod', '1895766', '--dry-run'], /--prune-only takes only --dry-run/],
    ['--prune-only with -d', ['--prune-only', '-d', '--dry-run'], /stencil push -d/],
    ['--prune-only given a value', ['--prune-only=all', '--dry-run'], /--prune-only takes no value/],
    ['--prune-only with a release\'s arguments', [...CA, '--prune-only', '--dry-run'], /--prune-only takes only --dry-run: .*no channel or variation/],
    ['--upload-only', [...CA, '--upload-only', '--dry-run'], /there is no upload mode/],
];

for (const [name, args, reason] of PRUNE_REFUSALS) {
    test(`W0-3: release.sh refuses ${name} before anything runs`, () => {
        const result = run(args);
        assertRefused(result, reason);
        assert.doesNotMatch(result.output, /My Themes holds|Reading My Themes/);
    });
}

const uuidN = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

// RELEASES.md with builds 1 to n of "ReelFlies" 6.22.0 on 1895766, one a day, and My Themes as
// GET /v3/themes and the active-theme reads give it (RF_RELEASE_THEMES_FIXTURE). As in the store,
// My Themes names build 1 "ReelFlies" and each later upload "ReelFlies (1)", "ReelFlies (2)" and
// so on, because it already holds a "ReelFlies" (W0-3b).
function pruneFixtures(n = 5, { deletionLogged = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-prune-test-'));
    tempDirs.push(dir);
    const entries = Array.from({ length: n }, (_, i) => `### 2026-10-0${i + 1} 09:00 UTC · channel 1895766 (ReelFlies_CA) · ReelFlies CA

- Theme: ReelFlies 6.22.0, uuid \`${uuidN(i + 1)}\`
- Commit: \`${String(i + 1).repeat(40)}\` on \`master\`
- Bundle: \`reelflies-ca-6.22.0-${i + 1}.zip\`, 100 B, sha256 \`${String(i + 1).repeat(64)}\`
- Operator: test
`).join('\n');
    const deletion = deletionLogged ? `| 2026-10-01 10:00 | deleted (--prune-only) | \`${uuidN(99)}\` | ReelFlies 6.22.0 | \`${'9'.repeat(40)}\` | \`${'9'.repeat(64)}\` | test |\n` : '';
    const markdown = `# Release log\n\n## Releases\n\n${entries}\n## Switch toggles\n\n| Date | Channel | Switch | From | To | Who | Reason |\n|---|---|---|---|---|---|---|\n\n## My Themes\n\n| Time (UTC) | Action | Theme uuid | Name and version | Commit | Zip sha256 | Operator |\n|---|---|---|---|---|---|---|\n${deletion}`;
    const themes = {
        themes: [
            { uuid: 'e3d82ce0-9bae-0133-0de7-525400970412', name: 'Cornerstone', is_active: false },
            { uuid: '7c519850-0000-0000-0000-000000000000', name: 'Hero-2024-2.9.5-US', is_active: true },
            ...Array.from({ length: n }, (_, i) => ({ uuid: uuidN(i + 1), name: i ? `ReelFlies (${i})` : 'ReelFlies', is_active: false })),
        ],
        activeByChannel: { 1: '7c519850-0000-0000-0000-000000000000', 1855224: '7c519850-0000-0000-0000-000000000000', 1895766: uuidN(n) },
    };
    const logPath = path.join(dir, 'RELEASES.md');
    const themesPath = path.join(dir, 'themes.json');
    fs.writeFileSync(logPath, markdown);
    fs.writeFileSync(themesPath, `${JSON.stringify(themes, null, 2)}\n`);
    return { dir, logPath, env: { RF_RELEASE_LOG_FIXTURE: logPath, RF_RELEASE_THEMES_FIXTURE: themesPath } };
}

// release.sh runs in this checkout, so its dry --prune-only records its plan in this checkout's git
// folder. The test puts back whatever was there, so a record of a real dry run made before it (when
// release.sh's step 3 runs these tests) is kept.
function keepingDryRunRecord(body) {
    const file = path.resolve(path.dirname(SCRIPT), git('rev-parse', '--git-path', 'rf-prune-dry-run.json')); // relative to scripts/
    const saved = fs.existsSync(file) ? fs.readFileSync(file) : null;
    try {
        return body(file);
    } finally {
        if (saved) fs.writeFileSync(file, saved);
        else fs.rmSync(file, { force: true });
    }
}

test('W0-3: --prune-only --dry-run shows what it would delete, keeps the newest three, and deletes and logs nothing', () => {
    const { env, logPath } = pruneFixtures(5);
    const before = fs.readFileSync(logPath, 'utf8');
    const releases = fs.readFileSync(fileURLToPath(new URL('../RELEASES.md', import.meta.url)), 'utf8');
    const result = keepingDryRunRecord(file => {
        const output = run(['--prune-only', '--dry-run'], env);
        assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).source, 'fixture', 'a fixture\'s plan, which no real run accepts');
        return output;
    });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /== My Themes: prune \(dry run: nothing is deleted\)/);
    assert.match(result.stdout, /My Themes holds 7 of 20 themes; 5 named ReelFlies or "ReelFlies \(n\)"; channels checked: 1, 1855224, 1895766/);
    assert.match(result.stdout, new RegExp(`delete {3}${uuidN(1)} ReelFlies 6\\.22\\.0`));
    assert.match(result.stdout, new RegExp(`delete {3}${uuidN(2)} ReelFlies \\(1\\) 6\\.22\\.0`));
    assert.match(result.stdout, new RegExp(`keep {5}${uuidN(3)} ReelFlies \\(2\\) .*one of the newest 3`));
    assert.match(result.stdout, /dry run {2}would delete 2 theme\(s\); nothing was deleted, and RELEASES\.md is unchanged/);
    assert.equal(fs.readFileSync(logPath, 'utf8'), before);
    assert.equal(fs.readFileSync(fileURLToPath(new URL('../RELEASES.md', import.meta.url)), 'utf8'), releases);
    assert.doesNotMatch(result.output, /Step 1|Step 2|npm ci|Capturing/);
});

test('W0-3: the prune\'s store fixture is test-only, so a real --prune-only always reads the store', () => {
    const { env } = pruneFixtures(5);
    assertRefused(run(['--prune-only'], { RF_RELEASE_THEMES_FIXTURE: env.RF_RELEASE_THEMES_FIXTURE }), /RF_RELEASE_THEMES_FIXTURE is test-only and needs --dry-run/);
    assertRefused(run(['--prune-only'], { RF_RELEASE_LOG_FIXTURE: env.RF_RELEASE_LOG_FIXTURE }), /RF_RELEASE_LOG_FIXTURE is test-only and needs --dry-run/);
    assertRefused(run(CA, { RF_RELEASE_THEMES_FIXTURE: env.RF_RELEASE_THEMES_FIXTURE }), /RF_RELEASE_THEMES_FIXTURE/);
});

test('W0-3: --prune-only takes the release lock, so it never runs beside a release', () => {
    const root = lockRoot();
    const other = acquireLock('release', 'scripts/release.sh --channel 1895766 --variation ReelFlies CA', { root, ticket: 'orchestrator' });
    const result = run(['--prune-only', '--dry-run'], { ...pruneFixtures(5).env, RF_LOCK_ROOT: root });
    assertRefused(result, /the release lock is held by scripts\/release\.sh --channel 1895766/);
    assert.doesNotMatch(result.output, /My Themes holds/);
    other.release();
});

// A real --prune-only, in a clone of a local bare origin with no stencil config: the checkout checks
// run, and reading the store then fails at once, so nothing can be deleted.
const pruneRepo = () => gitRepo({ 'RELEASES.md': '# Release log\n\n## Releases\n\n## Switch toggles\n', '.nvmrc': `${process.version.slice(1)}\n` });

test('W0-3: a real --prune-only runs only from master at origin/master\'s tip, so origin/master\'s rules decide what is deleted', () => {
    const repo = pruneRepo();
    repo.git('switch', '-q', '-c', 't99/old-ticket');
    const branch = runReleaseMjs('prune', ['--prune-only'], { cwd: repo.clone });
    assert.equal(branch.status, 2, branch.output);
    assert.match(branch.stderr, /^REFUSED {2}a real prune needs this checkout on master at origin\/master's tip.*this checkout is on branch t99\/old-ticket, not master/m);
    assert.doesNotMatch(branch.output, /Reading My Themes/);

    repo.git('switch', '-q', 'master');
    const merged = repo.mergeOnOrigin({ 'README.md': 'later\n' });
    const behind = runReleaseMjs('prune', ['--prune-only'], { cwd: repo.clone });
    assert.equal(behind.status, 2, behind.output);
    assert.match(behind.stderr, new RegExp(`HEAD ${repo.head.slice(0, 7)} isn't origin/master's tip ${merged.slice(0, 7)}`));
});

test('W0-3: a real --prune-only refuses uncommitted changes besides RELEASES.md, and edits that change or remove a line of RELEASES.md', () => {
    const repo = pruneRepo();
    fs.writeFileSync(path.join(repo.clone, 'RELEASES.md'), '# Release log\n\n## Releases\n\n## Switch toggles\n\nedited\n');
    fs.writeFileSync(path.join(repo.clone, 'notes.txt'), 'x\n');
    const result = runReleaseMjs('prune', ['--prune-only'], { cwd: repo.clone });
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /uncommitted changes besides RELEASES\.md: notes\.txt/);
    assert.doesNotMatch(result.stderr, /RELEASES\.md has uncommitted edits/, 'an added line is a release\'s new entry, or a row');

    // An entry's line changed, as a time moved to rank a build newer would be.
    const edited = pruneRepo();
    fs.writeFileSync(path.join(edited.clone, 'RELEASES.md'), '# Release log\n\n## Releases (edited)\n\n## Switch toggles\n');
    const changed = runReleaseMjs('prune', ['--prune-only'], { cwd: edited.clone });
    assert.equal(changed.status, 2, changed.output);
    assert.match(changed.stderr, /RELEASES\.md has uncommitted edits that change or remove 1 line\(s\) since HEAD: a real prune lets it only gain lines/);
    assert.doesNotMatch(changed.output, /Reading My Themes/);
});

// The prune after a release: `release.mjs prune-after-push`, on a state file like prepare's.
function afterPush(state, { cwd, env = {} }) {
    return runReleaseMjs('prune-after-push', [], { cwd, env, state: { channel: 1895766, git: { sha: '0'.repeat(40) }, ...state } });
}

// Where a dry --prune-only records its plan: the checkout's own git folder, outside the tree.
const dryRunRecordPath = repo => path.resolve(repo.clone, repo.git('rev-parse', '--git-path', 'rf-prune-dry-run.json'));

test('W0-3: a dry --prune-only records its plan in the checkout\'s git folder for the real run, and leaves the checkout clean', () => {
    const { env } = pruneFixtures(5);
    const repo = pruneRepo();
    const result = runReleaseMjs('prune', ['--prune-only', '--dry-run'], { cwd: repo.clone, env });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /^recorded this plan, for the real --prune-only: it deletes only what this dry run planned, from this commit, within 60 minutes/m);
    const record = JSON.parse(fs.readFileSync(dryRunRecordPath(repo), 'utf8'));
    assert.deepEqual({ ...record, plannedAt: Number.isNaN(Date.parse(record.plannedAt)) }, {
        head: repo.head, toDelete: [uuidN(1), uuidN(2)], plannedAt: false, source: 'fixture',
    });
    assert.equal(repo.git('status', '--porcelain'), '');
    // The plan a release's dry run ends with is the one before its push, so it records nothing.
    fs.rmSync(dryRunRecordPath(repo));
    assert.equal(afterPush({ dryRun: true }, { cwd: repo.clone, env }).status, 0);
    assert.ok(!fs.existsSync(dryRunRecordPath(repo)));
});

test('W0-3: a real --prune-only needs a dry --prune-only of the store first, from this checkout, and uses its record up', () => {
    const repo = pruneRepo();
    const none = runReleaseMjs('prune', ['--prune-only'], { cwd: repo.clone });
    assert.equal(none.status, 2, none.output);
    assert.match(none.stderr, /^REFUSED {2}a real --prune-only deletes only what a --prune-only --dry-run in this checkout planned, from the same commit, within 60 minutes: no --prune-only --dry-run has run in this checkout since the last real one\. Run scripts\/release\.sh --prune-only --dry-run, check its plan, then run this again/m);
    assert.doesNotMatch(none.output, /Reading My Themes/);

    // A dry run on the store fixture doesn't count.
    assert.equal(runReleaseMjs('prune', ['--prune-only', '--dry-run'], { cwd: repo.clone, env: pruneFixtures(5).env }).status, 0);
    const fixture = runReleaseMjs('prune', ['--prune-only'], { cwd: repo.clone });
    assert.equal(fixture.status, 2, fixture.output);
    assert.match(fixture.stderr, /the dry run read RF_RELEASE_THEMES_FIXTURE, not the store/);
    assert.doesNotMatch(fixture.output, /Reading My Themes/);

    // The record of a dry run of the store (written here by hand: no test reads the store) lets the
    // real run go on to read the store, which fails here before anything is deleted. It is used up.
    fs.writeFileSync(dryRunRecordPath(repo), JSON.stringify({
        head: repo.head, toDelete: [], plannedAt: new Date().toISOString(), source: 'store',
    }));
    const real = runReleaseMjs('prune', ['--prune-only'], { cwd: repo.clone });
    assert.equal(real.status, 1, real.output);
    assert.match(real.stdout, new RegExp(`^origin {3}master at origin/master's tip ${repo.head.slice(0, 7)}, fetched just now`, 'm'));
    assert.match(real.stdout, /^dry run {2}this checkout's dry run at \d{4}-\d\d-\d\dT[\d:.]+Z planned to delete nothing: this run deletes only that/m);
    assert.match(real.stdout, /Reading My Themes and every channel's active theme read-only/);
    assert.match(real.stderr, /^STOP {5}reading My Themes failed, so nothing was deleted: can't read config\.stencil\.json/m);
    assert.ok(!fs.existsSync(dryRunRecordPath(repo)), 'each dry run serves one real run');
});

test('W0-3: a dry --prune-only off master only warns, and still deletes nothing', () => {
    const { env, logPath } = pruneFixtures(5);
    const before = fs.readFileSync(logPath, 'utf8');
    const repo = pruneRepo();
    repo.git('switch', '-q', '-c', 't99/old-ticket');
    const result = runReleaseMjs('prune', ['--prune-only', '--dry-run'], { cwd: repo.clone, env });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /^WARNING {2}a real prune needs this checkout on master at origin\/master's tip.*this checkout is on branch t99\/old-ticket, not master.*\(a dry run goes on; a real prune stops here\)/m);
    assert.match(result.stdout, /would delete 2 theme\(s\); nothing was deleted/);
    assert.equal(fs.readFileSync(logPath, 'utf8'), before);
});

test('W0-3: a dry run ends by showing the prune a real release would run after its push, and deletes nothing', () => {
    const { env, logPath } = pruneFixtures(5);
    const before = fs.readFileSync(logPath, 'utf8');
    const result = afterPush({ dryRun: true }, { cwd: path.dirname(SCRIPT), env });
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /== My Themes: prune after the push \(dry run: nothing is deleted\)/);
    assert.match(result.stdout, /a real release prunes My Themes here, after its push and its RELEASES\.md entry/);
    assert.match(result.stdout, /would delete 2 theme\(s\)/);
    assert.equal(fs.readFileSync(logPath, 'utf8'), before);
});

test('W0-3: the prune\'s store fixture needs a dry run after a push too', () => {
    const { env } = pruneFixtures(5);
    const result = afterPush({ dryRun: false }, { cwd: path.dirname(SCRIPT), env });
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /RF_RELEASE_LOG_FIXTURE and RF_RELEASE_THEMES_FIXTURE are test-only and need --dry-run/);
});

test('W0-3: until a --prune-only has deleted a theme, the prune after a real push only shows its plan: the first real prune runs dry first', () => {
    const repo = pruneRepo();
    const result = afterPush({ dryRun: false, git: { sha: repo.head } }, { cwd: repo.clone });
    assert.match(result.stdout, /^first {4}RELEASES\.md records no theme deleted from My Themes yet, so this prune only shows its plan: the first real prune is scripts\/release\.sh --prune-only, run with --dry-run first \(W0-3\)/m);
    assert.doesNotMatch(result.stdout, /^prune {4}deletes/m);
    assert.equal(result.status, 1, result.output);
    assert.match(result.stderr, /The release is pushed and logged in RELEASES\.md; only the prune stopped: reading My Themes failed, so nothing was deleted/);
});

test('W0-3: once a deletion is logged, the prune after a real push from origin/master\'s commit deletes', () => {
    const { logPath } = pruneFixtures(5, { deletionLogged: true });
    const repo = gitRepo({ 'RELEASES.md': fs.readFileSync(logPath, 'utf8'), '.nvmrc': `${process.version.slice(1)}\n` });
    const result = afterPush({ dryRun: false, git: { sha: repo.head } }, { cwd: repo.clone });
    assert.match(result.stdout, /^prune {4}deletes what the plan below marks "delete", and logs each in RELEASES\.md's My Themes section/m);
    assert.equal(result.status, 1, 'and then stops, here, at the store read');
    assert.match(result.stderr, /reading My Themes failed, so nothing was deleted/);
});

test('W0-3: the prune after a real push deletes only from the commit it pushed, with nothing uncommitted but new lines in RELEASES.md', () => {
    const { logPath } = pruneFixtures(5, { deletionLogged: true });
    const markdown = fs.readFileSync(logPath, 'utf8');
    const repo = () => gitRepo({ 'RELEASES.md': markdown, '.nvmrc': `${process.version.slice(1)}\n` });
    const planOnly = (result, why) => {
        assert.match(result.stdout, new RegExp(`^WARNING {2}this prune only shows its plan: .*${why}`, 'm'));
        assert.doesNotMatch(result.stdout, /^prune {4}deletes/m);
    };
    // The checkout moved on from the pushed commit (origin/master's tip, then pulled).
    const moved = repo();
    moved.mergeOnOrigin({ 'README.md': 'later\n' });
    moved.git('pull', '-q', '--ff-only', 'origin', 'master');
    planOnly(afterPush({ dryRun: false, git: { sha: moved.head } }, { cwd: moved.clone }), `this checkout is at ${moved.git('rev-parse', 'HEAD').slice(0, 7)}, not ${moved.head.slice(0, 7)}, the commit this release pushed`);
    // A rule edited after the push.
    const dirty = repo();
    fs.writeFileSync(path.join(dirty.clone, 'notes.txt'), 'x\n');
    planOnly(afterPush({ dryRun: false, git: { sha: dirty.head } }, { cwd: dirty.clone }), 'uncommitted changes besides RELEASES\\.md: notes\\.txt');
    // An entry changed, not added.
    const edited = repo();
    fs.writeFileSync(path.join(edited.clone, 'RELEASES.md'), markdown.replace('## Releases\n', '## Releases (edited)\n'));
    planOnly(afterPush({ dryRun: false, git: { sha: edited.head } }, { cwd: edited.clone }), 'RELEASES\\.md has uncommitted edits that change or remove 1 line');
    // The release's own entry, added: it deletes.
    const added = repo();
    fs.appendFileSync(path.join(added.clone, 'RELEASES.md'), '| 2026-10-02 10:00 | deleted (--prune-only) | `x` | ReelFlies 6.22.0 | `y` | `z` | test |\n');
    assert.match(afterPush({ dryRun: false, git: { sha: added.head } }, { cwd: added.clone }).stdout, /^prune {4}deletes/m);
});

test('W0-3: the prune after a real push only shows its plan when the release\'s commit isn\'t origin/master\'s', () => {
    const { logPath } = pruneFixtures(5, { deletionLogged: true });
    const repo = gitRepo({ 'RELEASES.md': fs.readFileSync(logPath, 'utf8') });
    repo.git('switch', '-q', '-c', 't99/typed-release');
    fs.writeFileSync(path.join(repo.clone, 'x.txt'), 'x\n');
    repo.git('add', 'x.txt');
    repo.git('commit', '-q', '-m', 'branch only');
    const result = afterPush({ dryRun: false, git: { sha: repo.git('rev-parse', 'HEAD') } }, { cwd: repo.clone });
    assert.match(result.stdout, /^WARNING {2}this prune only shows its plan: .*is no longer in origin\/master's history.*scripts\/release\.sh --prune-only/m);
    assert.doesNotMatch(result.stdout, /^prune {4}deletes/m);
});

test('W0-3: release.sh runs --prune-only on its own after taking the lock, and prunes after a push\'s log entry and at the end of a dry run', () => {
    const lines = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(line => !/^\s*#/.test(line));
    const lineOf = pattern => {
        const index = lines.findIndex(line => pattern.test(line));
        assert.notEqual(index, -1, `release.sh has no line matching ${pattern}`);
        return index;
    };
    const take = lineOf(/lock\.mjs take release/);
    const pruneOnly = lineOf(/^\s*release prune "\$@"$/);
    const prepare = lineOf(/^release prepare "\$@"$/);
    assert.ok(take < pruneOnly && pruneOnly < prepare, 'the lock, then --prune-only, then a release');
    assert.match(lines[pruneOnly + 1], /^\s*exit 0$/);
    const dryReport = lineOf(/^\s*release dry-run-report$/);
    assert.match(lines[dryReport + 1], /^\s*release prune-after-push$/);
    const writeLog = lineOf(/^release write-log$/);
    assert.match(lines[writeLog + 1], /^release prune-after-push$/);
    assert.equal(lines.filter(line => /release prune-after-push/.test(line)).length, 2);
});

// --- W0-1b: release.sh selects .nvmrc's Node itself --------------------------------------------
//
// Agents run the bare release commands that Claude Code's allow rules name, from a login shell whose
// Node is nvm's default, not .nvmrc's, and a real release refuses any Node but .nvmrc's. So
// release.sh selects .nvmrc's Node with nvm before anything else. These runs put a node of the wrong
// version first on PATH, and a fake NVM_DIR whose nvm.sh puts a node of .nvmrc's version first.
// Each fake node prints its version for --version, logs every run, and otherwise runs the real node
// with process.version set to its own, so release.mjs's Node check sees which one ran it. They run in
// a temp checkout whose copied scripts are uncommitted, so a real release stops at its setup checks,
// before step 1 (and the checkout has no stencil config either): nothing here reaches the network.

const NVMRC = fs.readFileSync(fileURLToPath(new URL('../.nvmrc', import.meta.url)), 'utf8').trim();
const WRONG_NODE = 'v19.0.0'; // an odd release, which .nvmrc never pins
const NODE_REFUSED = new RegExp(`node is ${WRONG_NODE.replace(/\./g, '\\.')}, not ${NVMRC.replace(/\./g, '\\.')} from \\.nvmrc`);
const SELECTED = new RegExp(`^node {5}v${NVMRC.replace(/\./g, '\\.')} from \\.nvmrc, selected with nvm \\(the shell had ${WRONG_NODE.replace(/\./g, '\\.')}\\)$`, 'm');

// A checkout of the release scripts and a config.json, with .nvmrc's version: the scripts are copied
// in uncommitted, so the tree is dirty.
function nodeCheckout() {
    const repo = gitRepo({
        'config.json': `${JSON.stringify(themeConfig({ settings: BASE_SETTINGS }), null, 2)}\n`,
        '.nvmrc': `${NVMRC}\n`,
    });
    const scripts = path.dirname(SCRIPT);
    const into = path.join(repo.clone, 'scripts');
    fs.mkdirSync(into);
    fs.readdirSync(scripts).filter(name => /^(release(-[a-z-]+)?\.(mjs|sh|json)|check-contrast\.mjs)$/.test(name)).forEach(name => {
        fs.copyFileSync(path.join(scripts, name), path.join(into, name));
    });
    ['lib', 'store'].forEach(dir => fs.cpSync(path.join(scripts, dir), path.join(into, dir), { recursive: true }));
    return { ...repo, script: path.join(into, 'release.sh') };
}

// A folder holding a fake `node` of `version`, which logs each run to `log` as "<version> <args>".
function fakeNode(root, name, version, log) {
    const bin = path.join(root, name, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const preload = path.join(root, name, 'version.cjs');
    fs.writeFileSync(preload, `Object.defineProperty(process, 'version', { value: ${JSON.stringify(version)} });\n`);
    fs.writeFileSync(path.join(bin, 'node'), [
        '#!/bin/sh',
        `printf '%s\\n' "${version} $*" >> '${log}'`,
        `if [ "$1" = --version ]; then echo '${version}'; exit 0; fi`,
        `exec '${process.execPath}' --require '${preload}' "$@"`,
        '',
    ].join('\n'), { mode: 0o755 });
    return bin;
}

// A fake NVM_DIR. Its nvm.sh logs how it was sourced and each `nvm` call, and trips set -u and set -e
// as the real one may. `nvm use --silent <.nvmrc's version>` then puts `good` first on PATH ("ok"),
// fails with PATH untouched, as for a version that isn't installed ("missing"), or puts it first
// and fails, as nvm does for an npm prefix it refuses ("broken").
function fakeNvm(root, mode, good, log) {
    const dir = path.join(root, 'nvm');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'nvm.sh'), [
        `printf '%s\\n' "sourced $*" >> '${log}'`,
        '[ -z "$RF_TEST_NEVER_SET" ] # unbound under set -u',
        'false # fatal under set -e',
        'nvm() {',
        `    printf '%s\\n' "nvm $*" >> '${log}'`,
        `    case '${mode}' in`,
        `        ok) [ "$*" = 'use --silent ${NVMRC}' ] || return 3; PATH='${good}':"$PATH"; export PATH ;;`,
        '        missing) return 3 ;;',
        `        broken) PATH='${good}':"$PATH"; export PATH; return 11 ;;`,
        '    esac',
        '}',
        '',
    ].join('\n'));
    return dir;
}

// release.sh from a shell with `first` first on PATH, `nvm` as NVM_DIR (none: unset, with a HOME
// that has no .nvm), and none of the caller's nvm variables.
function nodeRun(checkout, args, { first, nvm }) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(RF_(RELEASE|BC)_|NVM_|GIT_)/.test(key)));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-home-'));
    tempDirs.push(home);
    const env = {
        ...inherited, PATH: `${first}${path.delimiter}${process.env.PATH}`, RF_LOCK_ROOT: LOCK_ROOT, HOME: home, ...(nvm ? { NVM_DIR: nvm } : {}),
    };
    const result = spawnSync('bash', [checkout.script, ...args], { encoding: 'utf8', env, timeout: 60000 });
    return {
        status: result.status, stdout: result.stdout, stderr: result.stderr, output: `${result.stdout}\n${result.stderr}`,
    };
}

function nodeSetup(mode) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-node-'));
    tempDirs.push(root);
    const log = path.join(root, 'runs.log');
    fs.writeFileSync(log, '');
    const wrong = fakeNode(root, 'wrong', WRONG_NODE, log);
    const good = fakeNode(root, 'good', `v${NVMRC}`, log);
    const nvm = mode ? fakeNvm(root, mode, good, log) : null;
    const lines = () => fs.readFileSync(log, 'utf8').split('\n').filter(Boolean);
    return {
        wrong, good, nvm, lines, checkout: nodeCheckout(),
    };
}

// Every run of the wrong node was release.sh's --version check, and release.mjs ran on .nvmrc's.
function assertRanOnNvmrcNode(lines, step) {
    const wrong = lines.filter(line => line.startsWith(`${WRONG_NODE} `));
    assert.deepEqual([...new Set(wrong)], [`${WRONG_NODE} --version`], lines.join('\n'));
    assert.ok(lines.some(line => line.startsWith(`v${NVMRC} scripts/release.mjs ${step}`)), lines.join('\n'));
    assert.ok(lines.some(line => line.startsWith(`v${NVMRC} scripts/lib/lock.mjs take release`)), 'the lock is taken on .nvmrc\'s node too');
}

test('W0-1b: from a shell on another Node, release.sh selects .nvmrc\'s with nvm before anything else, and release.mjs runs on it', () => {
    const setup = nodeSetup('ok');
    const refused = nodeRun(setup.checkout, [...CA, '-allc'], { first: setup.wrong, nvm: setup.nvm });
    assertRefused(refused, /all channels/);
    assert.match(refused.stdout, SELECTED);
    assert.equal(refused.stdout.match(/from \.nvmrc/g).length, 1, 'one line, and nothing else new');
    assertRanOnNvmrcNode(setup.lines(), 'prepare');
});

test('W0-1b: so a real release run from a shell on another Node no longer meets the Node-version refusal', () => {
    const setup = nodeSetup('ok');
    const result = nodeRun(setup.checkout, CA, { first: setup.wrong, nvm: setup.nvm });
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /the git tree has uncommitted changes/, 'it reached the setup checks, which stop a real release before step 1');
    assert.doesNotMatch(result.output, NODE_REFUSED);
    assert.doesNotMatch(result.output, NOTHING_RAN);
    assert.match(result.stdout, SELECTED);
    assertRanOnNvmrcNode(setup.lines(), 'prepare');
});

test('W0-1b: --prune-only selects .nvmrc\'s Node the same way', () => {
    const setup = nodeSetup('ok');
    const result = nodeRun(setup.checkout, ['--prune-only', '--channel', '1895766'], { first: setup.wrong, nvm: setup.nvm });
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.stdout, SELECTED);
    assert.doesNotMatch(result.output, /Reading My Themes/);
    assertRanOnNvmrcNode(setup.lines(), 'prune');
});

test('W0-1b: with no nvm, a shell on another Node still has a real release refused, as before', () => {
    const setup = nodeSetup(null);
    for (const nvm of [null, path.join(setup.checkout.root, 'no-such-nvm')]) {
        const result = nodeRun(setup.checkout, CA, { first: setup.wrong, nvm });
        assert.equal(result.status, 2, result.output);
        assert.match(result.stderr, new RegExp(`${NODE_REFUSED.source}: source ~/\\.nvm/nvm\\.sh && nvm use ${NVMRC.replace(/\./g, '\\.')}`));
        assert.doesNotMatch(result.output, /from \.nvmrc, selected/);
        assert.doesNotMatch(result.output, NOTHING_RAN);
    }
    assert.ok(setup.lines().some(line => line.startsWith(`${WRONG_NODE} scripts/release.mjs prepare`)), 'release.mjs ran on the shell\'s node');
});

test('W0-1b: when nvm hasn\'t .nvmrc\'s version, or fails after changing PATH, PATH is left as it was and a real release is refused, as before', () => {
    for (const mode of ['missing', 'broken']) {
        const setup = nodeSetup(mode);
        const result = nodeRun(setup.checkout, CA, { first: setup.wrong, nvm: setup.nvm });
        assert.equal(result.status, 2, `${mode}: ${result.output}`);
        assert.match(result.stderr, NODE_REFUSED, mode);
        assert.doesNotMatch(result.output, /from \.nvmrc, selected/, mode);
        assert.ok(!setup.lines().some(line => line.startsWith(`v${NVMRC} `)), `${mode}: .nvmrc's node never ran`);
    }
});

test('W0-1b: nvm.sh is sourced with --no-use, never with release.sh\'s arguments, and nothing but `nvm use` is called: no Node is ever installed', () => {
    const setup = nodeSetup('ok');
    // nvm.sh installs its default when sourced with --install, so release.sh's arguments must never reach it.
    const result = nodeRun(setup.checkout, [...CA, '--install', '--dry-run'], { first: setup.wrong, nvm: setup.nvm });
    assertRefused(result, /unknown flag --install/);
    assert.deepEqual(setup.lines().filter(line => /^(sourced|nvm) /.test(line)), ['sourced --no-use', `nvm use --silent ${NVMRC}`]);
});

test('W0-1b: with .nvmrc\'s Node already first on PATH, release.sh leaves nvm alone and prints nothing new', () => {
    const setup = nodeSetup('ok');
    const result = nodeRun(setup.checkout, CA, { first: setup.good, nvm: setup.nvm });
    assert.equal(result.status, 2, result.output);
    assert.match(result.stderr, /the git tree has uncommitted changes/);
    assert.doesNotMatch(result.output, NODE_REFUSED);
    assert.doesNotMatch(result.output, /from \.nvmrc|nvm/);
    assert.ok(!setup.lines().some(line => /^(sourced|nvm) /.test(line)), 'nvm.sh wasn\'t sourced');
});

test('W0-1b: release.sh selects the Node before it runs node at all, the lock included', () => {
    const lines = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(line => !/^\s*#/.test(line));
    const select = lines.findIndex(line => /^select_nvmrc_node$/.test(line));
    assert.notEqual(select, -1, 'release.sh calls select_nvmrc_node at the top level');
    const firstNode = lines.findIndex((line, index) => index > select && !/^trap /.test(line) && /\bnode scripts\//.test(line));
    const take = lines.findIndex(line => /lock\.mjs take release/.test(line));
    assert.ok(select < take && take === firstNode, 'the selection, then the lock, the first node run');
    const before = lines.slice(0, select).join('\n');
    assert.match(before, /^set -euo pipefail$/m);
    assert.match(before, /^cd "\$\(dirname "\$\{BASH_SOURCE\[0\]\}"\)\/\.\."$/m);
    assert.doesNotMatch(before.replace(/^select_nvmrc_node\(\) \{[\s\S]*?^\}$/m, ''), /\bnode\b/, 'no node runs before the selection');
});
