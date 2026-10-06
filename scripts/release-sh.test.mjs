// Tests scripts/release.sh as the operator runs it, offline (tickets 05 and 15, spec seam 5).
// Refusals must come before any network call or build. The fixture runs use the test-only
// overrides RF_RELEASE_CONFIG and RF_RELEASE_LIVE_FIXTURE, which need --dry-run and stop the
// run after the release guard, so no test reaches npm ci, the build or the store.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./release.sh', import.meta.url));
const NOTHING_RAN = /Step 1|Step 2|npm ci|Capturing/;
const CA = ['--channel', '1895766', '--variation', 'ReelFlies CA'];

function run(args, env = {}, script = SCRIPT) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^RF_(RELEASE|BC)_/.test(key)));
    const result = spawnSync('bash', [script, ...args], {
        encoding: 'utf8',
        env: { ...inherited, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`, ...env },
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

const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

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

// Writes a repo config and a live capture (the shape release.sh writes to config.<slug>.live.json).
// published: values where the published Theme Styles differ from the saved (live) ones.
function fixtures({
    name = 'Cornerstone', repo = {}, caSettings = {}, live = {}, published = null, liveTheme = 'Cornerstone', liveVariation = 'ReelFlies CA', themeCount = 11,
} = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-test-'));
    tempDirs.push(dir);
    const config = {
        name,
        version: '6.22.0',
        settings: { ...BASE_SETTINGS, ...repo },
        variations: [
            {
                name: 'ReelFlies CA', id: 'reelflies-ca', meta: VARIATION_META, settings: caSettings,
            },
            {
                name: 'ReelFlies US', id: 'reelflies-us', meta: VARIATION_META, settings: {},
            },
        ],
    };
    const settings = { ...BASE_SETTINGS, ...live };
    const savedEqualsActive = !published;
    const capture = {
        name: liveTheme,
        settings,
        variations: [{ name: liveVariation, settings: {} }],
        capture: {
            channelId: 1895766,
            themeUuid: '00000000-0000-0000-0000-00000000aaaa',
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
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
    fs.writeFileSync(livePath, `${JSON.stringify(capture, null, 2)}\n`);
    return { dir, configPath, env: { RF_RELEASE_CONFIG: configPath, RF_RELEASE_LIVE_FIXTURE: livePath } };
}

test('the test-only overrides are refused without --dry-run, so a real push always captures live', () => {
    const { env } = fixtures();
    assertRefused(run(CA, env), /RF_RELEASE_CONFIG.*--dry-run|--dry-run.*RF_RELEASE/);
    assertRefused(run(CA, { RF_RELEASE_LIVE_FIXTURE: env.RF_RELEASE_LIVE_FIXTURE }), /RF_RELEASE_LIVE_FIXTURE/);
    assertRefused(run(CA, { RF_RELEASE_TREE_FIXTURE: env.RF_RELEASE_LIVE_FIXTURE }), /RF_RELEASE_TREE_FIXTURE/);
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
});

test('every release.mjs step that release.sh calls is one release.mjs has', () => {
    const calls = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(line => !/^\s*#/.test(line))
        .flatMap(line => [...line.matchAll(/(?:^\s*|\$\(|\|\s*)release ([a-z-]+)/g)].map(match => match[1]));
    const listed = spawnSync(process.execPath, [fileURLToPath(new URL('./release.mjs', import.meta.url))], { encoding: 'utf8' });
    const steps = /\(steps: ([^)]+)\)/.exec(listed.stderr)[1].split(', ');
    assert.ok(calls.includes('prepare') && calls.includes('write-log'), `found ${calls.join(', ')}`);
    assert.deepEqual(calls.filter(call => !steps.includes(call)), [], `release.mjs steps: ${steps.join(', ')}`);
});
