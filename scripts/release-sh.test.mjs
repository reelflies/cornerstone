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

function run(args, env = {}) {
    const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^RF_(RELEASE|BC)_/.test(key)));
    const result = spawnSync('bash', [SCRIPT, ...args], {
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

// Writes a repo config and a live capture (the shape release.sh writes to config.<slug>.live.json).
function fixtures({
    repo = {}, caSettings = {}, live = {}, liveTheme = 'Cornerstone', liveVariation = 'ReelFlies CA', savedEqualsActive = true, themeCount = 11,
} = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-release-test-'));
    tempDirs.push(dir);
    const config = {
        name: 'Cornerstone',
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
    const capture = {
        name: liveTheme,
        settings: { ...BASE_SETTINGS, ...live },
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

test('unpublished Theme Styles edits are reported, and the diff uses the saved settings', () => {
    const { env } = fixtures({ savedEqualsActive: false });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /unpublished Theme Styles edits/);
});

test('a full My Themes (20) is a warning in a dry run, because a real release would stop there', () => {
    const { env } = fixtures({ themeCount: 20 });
    const result = run([...CA, '--dry-run'], env);
    assert.equal(result.status, 0, result.output);
    assert.match(result.stdout, /My Themes holds 20 themes.*never deletes themes.*A real release stops here/);
});
