#!/usr/bin/env node
// The node steps of scripts/release.sh (tickets 05 and 15). release.sh calls one step at a time:
//
//   node scripts/release.mjs prepare <release.sh arguments>   refusals, step 1 (capture and diff), the guard
//   node scripts/release.mjs state <key>                      prints one value from the release state
//   node scripts/release.mjs validate-config                  step 3: config.json against stencil-cli's schema
//   node scripts/release.mjs bundle-info <zip>                step 4: records the zip's bytes and sha256
//   node scripts/release.mjs dry-run-report                   a dry run's push summary, command and log entry
//   node scripts/release.mjs pre-push                         step 5: capture again, summary, typed confirmation
//   node scripts/release.mjs push-args                        step 5: the push arguments, NUL-separated
//   node scripts/release.mjs redact                           step 5: filters tokens out of the push output
//   node scripts/release.mjs verify                           step 6: capture again and compare
//   node scripts/release.mjs log                              step 7: appends the entry to RELEASES.md
//
// Steps share a state file named by RF_RELEASE_STATE, which release.sh creates and removes.
// Exit codes: 0 go on, 1 the release stops, 2 the arguments or the setup are refused.
//
// Test-only overrides, refused without --dry-run (a real push always captures the live theme):
//   RF_RELEASE_CONFIG=<file>         a theme config to diff instead of config.json; the run stops
//                                    before the clean build, because the build would use config.json
//   RF_RELEASE_LIVE_FIXTURE=<file>   a capture (config.<slug>.live.json shape) instead of the store
//   RF_RELEASE_TREE_FIXTURE=<file>   a JSON array of the channel's category ids, instead of the
//                                    catalogue API, for the guard's menu id rule

import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import readline from 'readline';
import { isDeepStrictEqual } from 'util';
import { parseReleaseArgs, resolveTarget, USAGE } from './release-args.mjs';
import {
    captureLive, describeLiveTheme, getStoreHash, isThisFork,
} from './release-capture.mjs';
import {
    acceptLiveValues, blockingDifferences, diffSettings, displayValue, effectiveSettings, verifyRelease,
} from './release-diff.mjs';
import { checkRelease, menuIdsSet } from './release-guard.mjs';
import { addReleaseEntry, formatPushSummary, formatReleaseEntry } from './release-log.mjs';
import { redact } from './release-redact.mjs';
import { validateThemeConfig } from './release-schema.mjs';
import { buildPushArgs } from './release-targets.mjs';
import { fetchChannelCategoryIds, tokenGetJson } from './release-tree-ids.mjs';

const MAX_THEMES = 20; // My Themes holds at most 20; the release never deletes one (-d)
const MAIN_JS = 'assets/dist/theme-bundle.main.js';
const RELEASES = 'RELEASES.md';
const OVERRIDES = ['RF_RELEASE_CONFIG', 'RF_RELEASE_LIVE_FIXTURE', 'RF_RELEASE_TREE_FIXTURE'];

const inActions = Boolean(process.env.GITHUB_ACTIONS);
const say = (label, message) => console.log(`${label.padEnd(8)} ${message}`);
const warn = message => console.log(inActions ? `::warning::${message}` : `WARNING  ${message}`);
const heading = title => console.log(`\n== ${title}`);
const short = (key, value) => {
    const text = displayValue(key, value);
    return text.length > 80 ? `${text.slice(0, 77)}…` : text;
};

class Stop extends Error {
    constructor(message, code = 1) {
        super(message);
        this.code = code;
    }
}
const refuse = message => new Stop(message, 2);

function readState() {
    return JSON.parse(fs.readFileSync(process.env.RF_RELEASE_STATE, 'utf8'));
}

function writeState(state) {
    fs.writeFileSync(process.env.RF_RELEASE_STATE, `${JSON.stringify(state, null, 2)}\n`);
}

function readJson(file, what) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw refuse(`can't read ${what} ${file}: ${error.message}`);
    }
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function readGit() {
    return {
        sha: git('rev-parse', 'HEAD'),
        shortSha: git('rev-parse', '--short=7', 'HEAD'),
        branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
        dirty: git('status', '--porcelain') !== '',
    };
}

// The operator types the channel id; anything else stops the release.
async function confirmChannel(channel, question) {
    if (!process.stdin.isTTY) throw new Stop('this confirmation needs an operator at a terminal, and stdin is not one');
    const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => {
        prompt.question(question, resolve);
    });
    prompt.close();
    if (answer.trim() !== String(channel)) throw new Stop(`"${answer.trim()}" isn't ${channel}: stopped`);
}

// --- prepare: refusals ---------------------------------------------------------------------

function readOptions(argv) {
    let options;
    try {
        options = parseReleaseArgs(argv);
    } catch (error) {
        throw refuse(error.message);
    }
    const overrides = OVERRIDES.filter(name => process.env[name]);
    if (overrides.length && !options.dryRun) {
        throw refuse(`${overrides.join(' and ')} ${overrides.length > 1 ? 'are' : 'is'} test-only and need${overrides.length > 1 ? '' : 's'} --dry-run: a real push always captures the live theme`);
    }
    return options;
}

function checkSetup(options) {
    const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();
    if (process.version !== `v${nvmrc}`) {
        const message = `node is ${process.version}, not ${nvmrc} from .nvmrc (source ~/.nvm/nvm.sh && nvm use ${nvmrc})`;
        if (!options.dryRun) throw refuse(message);
        warn(message);
    }
    const repo = readGit();
    if (repo.dirty) {
        if (!options.dryRun) throw refuse('the git tree has uncommitted changes: a real release pushes a committed tree only (commit or stash, then rerun)');
        warn('the git tree has uncommitted changes: fine for a dry run, refused for a real release');
    }
    return repo;
}

// --- prepare: step 1, capture and diff ------------------------------------------------------

async function readLive(state) {
    const fixture = process.env.RF_RELEASE_LIVE_FIXTURE;
    if (fixture) {
        say('fixture', `live settings from ${fixture} (RF_RELEASE_LIVE_FIXTURE)`);
        return { live: readJson(fixture, 'the live fixture'), liveFile: fixture };
    }
    say('', `Capturing channel ${state.channel} (${state.target.name}) read-only…`);
    let live;
    try {
        live = await captureLive(state.channel);
    } catch (error) {
        throw new Stop(error.message);
    }
    fs.writeFileSync(state.target.liveFile, `${JSON.stringify(live, null, 2)}\n`);
    say('ok', `wrote ${state.target.liveFile}`);
    return { live, liveFile: state.target.liveFile };
}

function checkThemeCount(count, dryRun) {
    if (count < MAX_THEMES) return;
    const message = `My Themes holds ${count} themes, the limit is ${MAX_THEMES}: delete one by hand (Storefront > My Themes). The release never deletes themes.`;
    if (!dryRun) throw new Stop(message);
    warn(`${message} A real release stops here.`);
}

function reportCapture(live) {
    const { capture } = live;
    say('live', `${describeLiveTheme(live)}, ${Object.keys(live.settings).length} saved settings, captured ${capture.capturedAt}`);
    say('', `My Themes holds ${capture.themeCount} of ${MAX_THEMES} themes`);
    if (!capture.savedEqualsActive) {
        const keys = capture.unpublishedKeys || [];
        say('NOTE', `the channel has unpublished Theme Styles edits${keys.length ? ` in ${keys.length} setting(s): ${keys.slice(0, 10).join(', ')}` : ''}. The diff uses the saved settings.`);
    }
}

// A channel that runs another theme has no diff to run. Returns the theme being replaced.
function foreignTheme(state, live, config) {
    const fork = isThisFork(live, config);
    if (fork && state.firstRelease) {
        throw refuse(`--first-release refused: channel ${state.channel} already runs this fork (${describeLiveTheme(live)}), so the diff must run. Rerun without --first-release.`);
    }
    if (fork) return null;
    if (!state.firstRelease) {
        throw new Stop(`channel ${state.channel} runs ${describeLiveTheme(live)}, not this fork (${config.name} with ${config.variations.map(item => `"${item.name}"`).join(' or ')}), so a settings diff means nothing. If this release is meant to replace that theme, rerun with --first-release.`);
    }
    const { themeName, variationName, themeUuid } = live.capture;
    say('first', `first release: replacing ${describeLiveTheme(live)}. That theme keeps its own Theme Styles in My Themes.`);
    return { themeName, variationName, themeUuid };
}

function printEntries(entries) {
    for (const entry of entries) {
        if ('repo' in entry) console.log(`  changed    ${entry.key}: live ${short(entry.key, entry.live)}, config.json ${short(entry.key, entry.repo)}`);
        else console.log(`  live only  ${entry.key}: ${short(entry.key, entry.live)}`);
    }
}

function acceptLive(state, diff) {
    const entries = [...diff.changed, ...diff.liveOnly];
    if (!entries.length) throw new Stop('--accept-live: the live settings already match config.json, so there is nothing to accept. Rerun without it.');
    printEntries(entries);
    if (state.dryRun) throw new Stop(`--accept-live in a dry run writes nothing: rerun without --dry-run to write these ${entries.length} live value(s) into config.json's "${state.variation}" settings`);
    const text = fs.readFileSync(state.configPath, 'utf8');
    fs.writeFileSync(state.configPath, acceptLiveValues(text, state.variation, entries));
    throw new Stop(`wrote ${entries.length} live value(s) into ${state.configPath}'s "${state.variation}" settings. Review them (git diff ${state.configPath}), commit, and rerun the release.`);
}

async function diffStep(state, live, config) {
    const diff = diffSettings(effectiveSettings(config, state.variation), live.settings);
    if (state.acceptLive) acceptLive(state, diff);
    const blocking = blockingDifferences(diff);
    if (diff.repoOnly.length) say('new', `${diff.repoOnly.length} setting(s) only in config.json pass: ${diff.repoOnly.map(entry => entry.key).slice(0, 10).join(', ')}`);
    if (!blocking.length) {
        say('ok', 'no differences from the live saved settings, apart from the rf_* switches (the release guard checks those)');
        return [];
    }
    printEntries(blocking);
    if (!state.overwriteLive) {
        throw new Stop(`${blocking.length} live Theme Styles value(s) differ from config.json for "${state.variation}". Rerun with --accept-live to copy them into config.json, or with --overwrite-live to replace them on the channel.`);
    }
    if (state.dryRun) {
        say('dry run', `--overwrite-live: a real release asks you to type the channel id here, then overwrites these ${blocking.length} value(s)`);
    } else {
        await confirmChannel(state.channel, `Type the channel id (${state.channel}) to overwrite these ${blocking.length} live value(s): `);
    }
    return blocking.map(entry => entry.key);
}

// --- prepare: the release guard (ticket 15) -----------------------------------------------

async function readCategoryIds(state, repoSettings) {
    if (!menuIdsSet(repoSettings)) return null;
    const fixture = process.env.RF_RELEASE_TREE_FIXTURE;
    if (fixture) {
        say('fixture', `category ids from ${fixture} (RF_RELEASE_TREE_FIXTURE)`);
        return readJson(fixture, 'the category id fixture');
    }
    const token = process.env.RF_BC_API_TOKEN;
    if (!token) {
        throw new Stop(`a menu id is set, so the guard must read channel ${state.channel}'s category tree: set RF_BC_API_TOKEN to a store API token with Products: read-only (store_v2_products_read_only), created under Settings > Store-level API accounts`);
    }
    say('', `Reading channel ${state.channel}'s category tree read-only…`);
    try {
        return await fetchChannelCategoryIds({ channelId: state.channel, storeHash: await getStoreHash(), getJson: tokenGetJson(token) });
    } catch (error) {
        throw new Stop(`reading channel ${state.channel}'s category tree failed: ${error.message}`);
    }
}

async function guardStep(state, live, config) {
    heading(`Release guard: rf_* switches and menu ids for channel ${state.channel}`);
    const repoSettings = effectiveSettings(config, state.variation);
    const categoryIds = await readCategoryIds(state, repoSettings);
    const result = checkRelease({
        repoSettings, liveSettings: live.settings, channelId: state.channel, categoryIds,
    });
    result.reasons.forEach(reason => say('FAIL', reason));
    const values = result.values.map(({ key, value }) => `${key} = ${displayValue(key, value)}`);
    say('', `rf_* values to push: ${values.length ? values.join(', ') : 'none'}`);
    result.newSwitches.forEach(key => say('', `new switch  ${key} (only in config.json: its module's first release)`));
    if (!result.pass) throw new Stop(`release guard: ${result.reasons.length} reason(s) above, so nothing was built or pushed`);
    say('ok', 'guard: pass');
    return { values: result.values, newSwitches: result.newSwitches };
}

async function prepare(argv) {
    const options = readOptions(argv);
    const configPath = process.env.RF_RELEASE_CONFIG || 'config.json';
    const config = readJson(configPath, 'the theme config');
    let target;
    try {
        target = resolveTarget(options, config);
    } catch (error) {
        throw refuse(error.message);
    }
    const repo = checkSetup(options);
    const state = {
        ...options,
        configPath,
        target,
        git: repo,
        themeName: config.name,
        version: config.version,
        bundleName: `reelflies-${target.slug}-${config.version}-${repo.shortSha}${repo.dirty ? '-dirty' : ''}`,
        stopBeforeBuild: Boolean(process.env.RF_RELEASE_CONFIG),
    };
    writeState(state);

    heading(`Step 1 · Capture and diff: channel ${state.channel} (${target.name}), variation "${state.variation}"${state.dryRun ? ', dry run' : ''}`);
    const { live, liveFile } = await readLive(state);
    reportCapture(live);
    checkThemeCount(live.capture.themeCount, state.dryRun);
    const replacing = foreignTheme(state, live, config);
    const overwritten = replacing ? [] : await diffStep(state, live, config);
    const guard = await guardStep(state, live, config);
    writeState({
        ...state,
        liveFile,
        capture: live.capture,
        step1: { replacing, overwritten, unpublished: !live.capture.savedEqualsActive },
        guard,
    });
}

function printState([key]) {
    const value = readState()[key];
    console.log(typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
}

// --- steps 3 to 7 ---------------------------------------------------------------------------

function validateConfig() {
    const errors = validateThemeConfig(readJson('config.json', 'the theme config'));
    if (errors.length) {
        errors.forEach(error => console.log(`  ${error}`));
        throw new Stop(`config.json fails stencil-cli's theme config schema (${errors.length} error(s))`);
    }
    say('ok', 'config.json passes stencil-cli\'s theme config schema');
}

function bundleInfo([zip]) {
    const data = fs.readFileSync(zip);
    const bundle = {
        file: zip,
        bytes: data.length,
        sha256: crypto.createHash('sha256').update(data).digest('hex'),
        mainJsBytes: fs.statSync(MAIN_JS).size,
    };
    writeState({ ...readState(), bundle });
    say('ok', `${zip}: ${bundle.bytes.toLocaleString('en-CA')} B, sha256 ${bundle.sha256}`);
}

function operator() {
    try {
        return git('config', 'user.name') || 'unknown';
    } catch {
        return 'unknown';
    }
}

function releaseRecord(state, { themeUuid = null, verified = null } = {}) {
    return {
        timestamp: new Date().toISOString(),
        channel: state.channel,
        channelName: state.target.name,
        variation: state.variation,
        theme: { uuid: themeUuid, name: state.themeName, version: state.version },
        git: { sha: state.git.sha, branch: state.git.branch },
        bundle: state.bundle,
        step1: state.step1,
        guard: state.guard,
        verify: verified,
        operator: operator(),
    };
}

const shellQuote = arg => (/^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, "'\\''")}'`);

function pushArgs(state) {
    return buildPushArgs({ zip: state.bundle.file, variation: state.variation, channel: state.channel });
}

function dryRunReport() {
    const state = readState();
    const record = releaseRecord(state);
    heading('Step 5 · Push (dry run: nothing is pushed)');
    console.log(formatPushSummary(record));
    say('would run', ['npx', 'stencil', ...pushArgs(state)].map(shellQuote).join(' '));
    heading(`Step 7 · The entry a release would append to ${RELEASES} (dry run: not written)`);
    console.log(formatReleaseEntry(record));
    say('dry run', 'finished before the push. Nothing was pushed, and RELEASES.md is unchanged.');
}

async function captureOrStop(channel) {
    try {
        return await captureLive(channel);
    } catch (error) {
        throw new Stop(error.message);
    }
}

async function prePush() {
    const state = readState();
    heading(`Step 5 · Push to channel ${state.channel} (${state.target.name})`);
    const repo = readGit();
    if (repo.sha !== state.git.sha || repo.dirty) throw new Stop('the git tree changed during the release (a new commit or uncommitted files): rerun the release');
    say('', `Capturing channel ${state.channel} again…`);
    const live = await captureOrStop(state.channel);
    checkThemeCount(live.capture.themeCount, false);
    const before = readJson(state.liveFile, 'the step 1 capture');
    if (live.capture.themeUuid !== before.capture.themeUuid || !isDeepStrictEqual(live.settings, before.settings)) {
        throw new Stop('the live theme or its saved Theme Styles changed since step 1: rerun the release');
    }
    console.log(formatPushSummary(releaseRecord(state)));
    await confirmChannel(state.channel, `Type the channel id (${state.channel}) to push: `);
    writeState({ ...state, beforePush: live.capture });
}

function printPushArgs() {
    const state = readState();
    if (!fs.existsSync(state.bundle.file)) throw new Stop(`${state.bundle.file} is missing`);
    process.stdout.write(pushArgs(state).map(arg => `${arg}\0`).join(''));
}

// Secrets the push output must never show. Read here only to remove them.
function knownSecrets() {
    let accessToken;
    try {
        ({ accessToken } = JSON.parse(fs.readFileSync('secrets.stencil.json', 'utf8')));
    } catch {
        accessToken = undefined;
    }
    return [accessToken, process.env.RF_BC_API_TOKEN];
}

async function redactStream() {
    const secrets = knownSecrets();
    let pending = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
        pending += chunk;
        const cut = pending.lastIndexOf('\n');
        if (cut >= 0) {
            process.stdout.write(redact(pending.slice(0, cut + 1), secrets));
            pending = pending.slice(cut + 1);
        }
    }
    if (pending) process.stdout.write(redact(pending, secrets));
}

async function verify() {
    const state = readState();
    heading('Step 6 · Verify');
    let problems;
    let themeUuid = null;
    try {
        const after = await captureLive(state.channel);
        fs.writeFileSync(state.target.liveFile, `${JSON.stringify(after, null, 2)}\n`);
        themeUuid = after.capture.themeUuid;
        say('live', describeLiveTheme(after));
        problems = verifyRelease({
            before: state.beforePush, after, config: readJson('config.json', 'the theme config'), variation: state.variation,
        });
    } catch (error) {
        problems = [`the capture after the push failed: ${error.message}`];
    }
    problems.forEach(problem => console.log(`  ${problem}`));
    if (!problems.length) say('ok', 'the channel runs the new theme with the target variation, and its saved settings match config.json');
    writeState({ ...state, verify: { problems, themeUuid } });
}

function log() {
    const state = readState();
    heading('Step 7 · Log');
    const record = releaseRecord(state, { themeUuid: state.verify.themeUuid || 'unknown', verified: { problems: state.verify.problems } });
    const existing = fs.existsSync(RELEASES) ? fs.readFileSync(RELEASES, 'utf8') : null;
    fs.writeFileSync(RELEASES, addReleaseEntry(existing, formatReleaseEntry(record)));
    say('ok', `appended this release to ${RELEASES}: commit it`);
    if (state.verify.problems.length) {
        throw new Stop(`the push went through, but verify found ${state.verify.problems.length} problem(s), listed above and in ${RELEASES}`);
    }
}

const STEPS = {
    prepare,
    state: printState,
    'validate-config': validateConfig,
    'bundle-info': bundleInfo,
    'dry-run-report': dryRunReport,
    'pre-push': prePush,
    'push-args': printPushArgs,
    redact: redactStream,
    verify,
    log,
};

async function main([step, ...rest]) {
    if (!STEPS[step]) throw refuse(`unknown step "${step}" (steps: ${Object.keys(STEPS).join(', ')})`);
    await STEPS[step](rest);
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${fs.realpathSync(process.argv[1])}`).href;

if (isMain) {
    main(process.argv.slice(2)).catch(error => {
        if (!(error instanceof Stop)) throw error;
        const label = error.code === 2 ? 'REFUSED' : 'STOP';
        console.error(inActions ? `::error::${error.message}` : `${label.padEnd(8)} ${error.message}`);
        if (error.code === 2) console.error(`Usage:   ${USAGE}`);
        process.exit(error.code);
    });
}
