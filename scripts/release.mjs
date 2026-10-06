#!/usr/bin/env node
// The node steps of scripts/release.sh (tickets 05 and 15). release.sh calls one step at a time:
//
//   node scripts/release.mjs prepare <release.sh arguments>   refusals, step 1 (capture, diff, live contrast), the guard
//   node scripts/release.mjs state <key>                      prints one value from the release state
//   node scripts/release.mjs validate-config                  step 3: config.json against stencil-cli's schema
//   node scripts/release.mjs bundle-info <zip>                step 4: records the zip's bytes and sha256
//   node scripts/release.mjs dry-run-report                   a dry run's push summary, command and log entry
//   node scripts/release.mjs pre-push                         step 5: summary, confirmation (typed, or W0-1's
//                                                             --confirm-nonprod), then the gate
//   node scripts/release.mjs push-args                        step 5: the push arguments, NUL-separated, once the gate passed
//   node scripts/release.mjs redact                           step 5: filters tokens out of the push output
//   node scripts/release.mjs verify                           step 6: capture again and compare
//   node scripts/release.mjs write-log                        step 7: appends the entry to RELEASES.md
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
//   RF_RELEASE_LOG_FIXTURE=<file>    a release log to read instead of RELEASES.md: the channel's last
//                                    release (W0-2) and the themes the release pushed
//   RF_RELEASE_BASE_FIXTURE=<file>   a theme config to use as config.json at the commit of the
//                                    channel's last release, instead of reading it with git (W0-2)
//   RF_RELEASE_CALENDAR_FIXTURE=<file>  a release calendar to read instead of
//                                    scripts/release-calendar.json (W0-1); step 5 never reads it
//   RF_RELEASE_DATE=<YYYY-MM-DD>     today's date for the calendar, instead of today in Toronto (W0-1);
//                                    step 5 never reads it

import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import { checkContrast } from './check-contrast.mjs';
import { formatBytes } from './lib/format.mjs';
import { isMain } from './lib/is-main.mjs';
import {
    describePhase, phaseOn, readCalendar, todayInToronto,
} from './lib/release-calendar.mjs';
import { parseReleaseArgs, resolveTarget, USAGE } from './release-args.mjs';
import {
    captureLive, describeLiveTheme, getStoreHash, isThisFork,
} from './release-capture.mjs';
import {
    confirmChannel, confirmNonprodRefusals, hasConfirmNonprod, MAX_THEMES, pairedChannel1Release, pushConfirmation, pushGate,
    realReleaseStops, setupProblems, themeCapProblems,
} from './release-checks.mjs';
import {
    acceptLiveValues, displayValue, effectiveSettings, threeWayDiff, verifyRelease,
} from './release-diff.mjs';
import { checkRelease, menuIdsSet } from './release-guard.mjs';
import {
    addReleaseEntry, describePairedRelease, formatPushSummary, formatReleaseEntry, lastRelease, releasedThemeUuids,
} from './release-log.mjs';
import {
    checkoutProblems, gitIn, readCheckout, stepFiveOrigin,
} from './release-origin.mjs';
import { redact } from './release-redact.mjs';
import { validateThemeConfig } from './release-schema.mjs';
import { buildPushArgs, findTarget } from './release-targets.mjs';
import { fetchChannelCategoryIds, tokenGetJson } from './release-tree-ids.mjs';

const MAIN_JS = 'assets/dist/theme-bundle.main.js';
const RELEASES = 'RELEASES.md';
const OVERRIDES = [
    'RF_RELEASE_CONFIG', 'RF_RELEASE_LIVE_FIXTURE', 'RF_RELEASE_TREE_FIXTURE', 'RF_RELEASE_LOG_FIXTURE', 'RF_RELEASE_BASE_FIXTURE', 'RF_RELEASE_CALENDAR_FIXTURE', 'RF_RELEASE_DATE',
];

const say = (label, message) => console.log(`${label.padEnd(8)} ${message}`);
const warn = message => console.log(`WARNING  ${message}`);
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

// The operator types the channel id; anything else, or closing stdin, stops the release.
async function confirmOrStop(channel, question) {
    try {
        await confirmChannel({ channel, question });
    } catch (error) {
        throw new Stop(error.message);
    }
}

// A real release stops on these problems; a dry run warns and goes on.
function stopOrWarn(problems, dryRun, stop) {
    const { stops, warnings } = realReleaseStops(problems, dryRun);
    if (stops.length) throw stop(stops.join('; '));
    warnings.forEach(warn);
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

// --- prepare and step 5: the confirmation and the release calendar (W0-1) --------------------

// Today's phase of the release calendar (scripts/release-calendar.json, W0-13; today in Toronto).
// A dry run may read RF_RELEASE_CALENDAR_FIXTURE and RF_RELEASE_DATE instead; step 5 never does.
// A calendar that can't be read refuses the release, so a typo never reads as "no Flip date".
function readPhase({ fixtures }) {
    const file = fixtures ? process.env.RF_RELEASE_CALENDAR_FIXTURE : undefined;
    const date = fixtures ? process.env.RF_RELEASE_DATE : undefined;
    if (file) say('fixture', `release calendar from ${file} (RF_RELEASE_CALENDAR_FIXTURE)`);
    if (date) say('fixture', `today is ${date} (RF_RELEASE_DATE)`);
    let calendar;
    try {
        calendar = file ? readCalendar(file) : readCalendar();
    } catch (error) {
        throw refuse(`the release calendar: ${error.message}`);
    }
    try {
        return phaseOn(calendar, date || todayInToronto());
    } catch (error) {
        throw refuse(`${date ? 'RF_RELEASE_DATE: ' : ''}${error.message}`);
    }
}

// What the push summary and the RELEASES.md entry say about step 5's confirmation, the calendar
// and the paired channel-1 release (ticket 56).
function calendarFields(options, target, phase) {
    return {
        confirmation: hasConfirmNonprod(options) ? { mode: 'nonprod', channel: options.confirmNonprod } : { mode: 'typed' },
        calendar: {
            line: describePhase(phase), phase: phase.phase, flip: phase.flip, status: phase.status,
        },
        pairedChannel1: pairedChannel1Release({ target, phase }),
    };
}

// An agent push runs only from master at origin/master's tip, so the calendar and targets that judge
// --confirm-nonprod are origin/master's, never a stale checkout's (release-origin.mjs). A real
// release refuses otherwise, and a dry run warns. A dry run on the test-only overrides stays
// offline: it compares with origin/master as last fetched.
function originStep(options) {
    const offline = OVERRIDES.some(name => process.env[name]);
    if (offline) say('fixture', 'origin/master as last fetched: a dry run on the test-only overrides doesn\'t fetch');
    const checkout = readCheckout({ git: gitIn(), fetch: !offline });
    const problems = checkoutProblems(checkout);
    if (problems.length) {
        stopOrWarn([`--confirm-nonprod needs this checkout on master at origin/master's tip, so that origin/master's calendar and targets judge it: ${problems.join('; ')}`], options.dryRun, refuse);
        return;
    }
    say('origin', `master at origin/master's tip ${checkout.head.slice(0, 7)}${offline ? '' : ', fetched just now'}: the calendar and targets that judge --confirm-nonprod are origin/master's`);
}

// Before step 1: how step 5 will be confirmed, and today's phase of the calendar. With
// --confirm-nonprod the checkout must be master at origin/master's tip, and the flag is refused on a
// production target and from T-21 (release-checks.mjs confirmNonprodRefusals), so a refused run
// captures nothing; step 5 checks both again before the push.
function confirmationStep(options, target) {
    heading('Confirmation and the release calendar');
    const phase = readPhase({ fixtures: true });
    const fields = calendarFields(options, target, phase);
    say('calendar', fields.calendar.line);
    if (hasConfirmNonprod(options)) originStep(options);
    const reasons = confirmNonprodRefusals({ options, target, phase });
    if (reasons.length) throw refuse(`--confirm-nonprod refused: ${reasons.join('; ')}`);
    say('confirm', hasConfirmNonprod(options)
        ? `non-interactive (agent): --confirm-nonprod ${options.confirmNonprod} replaces step 5's typed channel id; step 5's gate still captures the channel again and checks everything before the push`
        : 'typed: step 5 asks the operator to type the channel id, and stops without a terminal');
    if (fields.pairedChannel1) {
        say('paired', `a paired channel-1 release is ${describePairedRelease(fields.pairedChannel1)}. The ${RELEASES} entry records it for Shaun.`);
    }
    return fields;
}

function checkSetup(options) {
    const repo = readGit();
    const nvmrc = fs.readFileSync('.nvmrc', 'utf8').trim();
    stopOrWarn(setupProblems({ nodeVersion: process.version, nvmrc, dirty: repo.dirty }), options.dryRun, refuse);
    return repo;
}

// --- the live capture (steps 1, 5 and 6) ----------------------------------------------------

async function captureOrStop(channel) {
    try {
        return await captureLive(channel);
    } catch (error) {
        throw new Stop(error.message);
    }
}

// Writes the capture to config.<slug>.live.json (gitignored), which the operator can open and
// scripts/check-contrast.mjs can read.
function saveCapture(state, live) {
    fs.writeFileSync(state.target.liveFile, `${JSON.stringify(live, null, 2)}\n`);
    say('ok', `wrote ${state.target.liveFile}`);
}

// --- prepare: step 1, capture and diff ------------------------------------------------------

// The capture, and the file it's in: config.<slug>.live.json, or the test fixture.
async function readLive(state) {
    const fixture = process.env.RF_RELEASE_LIVE_FIXTURE;
    if (fixture) {
        say('fixture', `live settings from ${fixture} (RF_RELEASE_LIVE_FIXTURE)`);
        return { live: readJson(fixture, 'the live fixture'), file: fixture };
    }
    say('', `Capturing channel ${state.channel} (${state.target.name}) read-only…`);
    const live = await captureOrStop(state.channel);
    saveCapture(state, live);
    return { live, file: state.target.liveFile };
}

function reportCapture(live) {
    const { capture } = live;
    say('live', `${describeLiveTheme(capture)}, ${Object.keys(live.settings).length} saved settings, captured ${capture.capturedAt}`);
    say('', `My Themes holds ${capture.themeCount} of ${MAX_THEMES} themes`);
    if (!capture.savedEqualsActive) {
        const keys = capture.unpublishedKeys || [];
        say('NOTE', `the channel has unpublished Theme Styles edits${keys.length ? ` in ${keys.length} setting(s): ${keys.slice(0, 10).join(', ')}` : ''}. Step 1 diffs the saved settings; the release guard checks the rf_* switches against the published ones too.`);
    }
}

const readReleases = () => (fs.existsSync(RELEASES) ? fs.readFileSync(RELEASES, 'utf8') : null);

// The release log step 1 reads: RELEASES.md, or the test fixture. Step 7 always writes RELEASES.md.
function readReleaseLog() {
    const fixture = process.env.RF_RELEASE_LOG_FIXTURE;
    if (!fixture) return readReleases();
    say('fixture', `release log from ${fixture} (RF_RELEASE_LOG_FIXTURE)`);
    try {
        return fs.readFileSync(fixture, 'utf8');
    } catch (error) {
        throw refuse(`can't read the release log fixture ${fixture}: ${error.message}`);
    }
}

// A channel that runs another theme has no diff to run. Returns the theme being replaced.
function foreignTheme(state, live, config, releases) {
    const fork = isThisFork(live, config, releasedThemeUuids(releases));
    if (fork && state.firstRelease) {
        throw refuse(`--first-release refused: channel ${state.channel} already runs this fork (${describeLiveTheme(live.capture)}), so the diff must run. Rerun without --first-release.`);
    }
    if (fork) return null;
    if (!state.firstRelease) {
        throw new Stop(`channel ${state.channel} runs ${describeLiveTheme(live.capture)}, not this fork: its variation isn't ${config.variations.map(item => `"${item.name}"`).join(' or ')}, and ${RELEASES} records no push of its theme, so a settings diff means nothing. If this release is meant to replace that theme, rerun with --first-release.`);
    }
    const { themeName, variationName, themeUuid } = live.capture;
    const replacing = { themeName, variationName, themeUuid };
    say('first', `first release: replacing ${describeLiveTheme(replacing)}. That theme keeps its own Theme Styles in My Themes.`);
    return replacing;
}

// --- prepare: step 1's base, the channel's last release (W0-2) -------------------------------

// config.json as committed at `sha`, or an Error saying why it can't be read. git's own message
// goes into the Error, not straight to the terminal.
function configAtCommit(sha) {
    try {
        return JSON.parse(execFileSync('git', ['show', `${sha}:config.json`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) {
        const reason = String(error.stderr || error.message).trim().split('\n')[0];
        return new Error(reason);
    }
}

// The settings the channel's last release pushed: config.json at the commit of its newest
// RELEASES.md entry, for that entry's variation. Returns { base: { sha, timestamp, variation,
// themeUuid, settings } } or, when there is nothing to compare with, { base: null, note } and step 1
// compares two ways as it did before W0-2: every live difference stops it.
function readBase(state, releases) {
    const entry = lastRelease(releases, state.channel);
    if (!entry) return { base: null, note: `RELEASES.md records no release on channel ${state.channel}` };
    if (!entry.sha) return { base: null, note: `the channel's last release in RELEASES.md (${entry.timestamp} UTC) has no readable commit` };
    const sha7 = entry.sha.slice(0, 7);
    const fixture = process.env.RF_RELEASE_BASE_FIXTURE;
    let config;
    if (fixture) {
        say('fixture', `config.json at ${sha7} from ${fixture} (RF_RELEASE_BASE_FIXTURE)`);
        config = readJson(fixture, 'the last-released config fixture');
    } else {
        config = configAtCommit(entry.sha);
        if (config instanceof Error) return { base: null, note: `can't read config.json at ${sha7} (the channel's last release in RELEASES.md): ${config.message}` };
    }
    let settings;
    try {
        settings = effectiveSettings(config, entry.variation);
    } catch {
        return { base: null, note: `"${entry.variation}" isn't a variation in config.json at ${sha7}, the channel's last release` };
    }
    return {
        base: {
            sha: entry.sha, timestamp: entry.timestamp, variation: entry.variation, themeUuid: entry.themeUuid, settings,
        },
    };
}

function reportBase(base, note, live) {
    if (!base) {
        say('base', `none: ${note}, so every live difference stops step 1, as before W0-2`);
        return;
    }
    say('base', `config.json at ${base.sha.slice(0, 7)}, the channel's last release (${base.timestamp} UTC, ${base.variation}). A key whose live value is still the one released there, and that config.json changed since, passes as "in repo".`);
    if (base.themeUuid && base.themeUuid !== live.capture.themeUuid) {
        say('NOTE', `the channel runs theme ${live.capture.themeUuid}, not ${base.themeUuid}, the theme its last release pushed. Step 1 still compares with that release: a live value that differs from it stops step 1.`);
    }
}

// --- prepare: step 1, the diff ----------------------------------------------------------------

function printEntries(entries) {
    for (const entry of entries) {
        const extra = [
            'released' in entry ? `last released ${short(entry.key, entry.released)}` : null,
            'published' in entry ? `published ${short(entry.key, entry.published)}` : null,
        ].filter(Boolean).map(text => `, ${text}`).join('');
        if ('repo' in entry) console.log(`  changed    ${entry.key}: live ${short(entry.key, entry.live)}, config.json ${short(entry.key, entry.repo)}${extra}`);
        else console.log(`  live only  ${entry.key}: ${short(entry.key, entry.live)}${extra}`);
    }
}

function printRepoChanges(entries) {
    for (const entry of entries) {
        if ('repo' in entry) console.log(`  in repo    ${entry.key}: live ${short(entry.key, entry.live)} (as last released), config.json ${short(entry.key, entry.repo)}`);
        else console.log(`  in repo    ${entry.key}: removed from config.json; live ${short(entry.key, entry.live)} (as last released)`);
    }
}

// Copies the live values of every differing key into config.json, except the ones config.json
// changed since the last release (W0-2): taking those would undo the repo's own change.
function acceptLive(state, diff, changedInRepo) {
    const repoChanges = new Set(changedInRepo.map(entry => entry.key));
    const entries = [...diff.changed, ...diff.liveOnly].filter(entry => !repoChanges.has(entry.key));
    if (!entries.length && repoChanges.size) throw new Stop('--accept-live: there is nothing to accept: every live difference is a change made in the repo since the last release, which the push carries. Rerun without it.');
    if (!entries.length) throw new Stop('--accept-live: the live settings already match config.json, so there is nothing to accept. Rerun without it.');
    printEntries(entries);
    if (state.dryRun) throw new Stop(`--accept-live in a dry run writes nothing: rerun without --dry-run to write these ${entries.length} live value(s) into config.json's "${state.variation}" settings`);
    const text = fs.readFileSync(state.configPath, 'utf8');
    fs.writeFileSync(state.configPath, acceptLiveValues(text, state.variation, entries));
    throw new Stop(`wrote ${entries.length} live value(s) into ${state.configPath}'s "${state.variation}" settings. Review them (git diff ${state.configPath}), commit, and rerun the release.`);
}

// Step 1 (ticket 05; three-way since W0-2). Returns step 1's outcome for the push summary and the
// RELEASES.md entry: the overwritten keys, the keys changed in the repo since the last release, and
// that release (or why there was none).
async function diffStep(state, live, config, releases) {
    const { base, note = null } = readBase(state, releases);
    reportBase(base, note, live);
    const { diff, blocking, changedInRepo } = threeWayDiff({
        repo: effectiveSettings(config, state.variation),
        live: live.settings,
        published: live.capture.publishedSettings ?? live.settings,
        released: base && base.settings,
    });
    const outcome = overwritten => ({
        overwritten, changedInRepo: changedInRepo.map(entry => entry.key), base: base && { sha: base.sha, timestamp: base.timestamp }, baseNote: note,
    });
    if (state.acceptLive) acceptLive(state, diff, changedInRepo);
    if (diff.repoOnly.length) say('new', `${diff.repoOnly.length} setting(s) only in config.json pass: ${diff.repoOnly.map(entry => entry.key).slice(0, 10).join(', ')}`);
    if (changedInRepo.length) {
        say('in repo', `${changedInRepo.length} setting(s) changed in the repo since the last release pass; the push summary and the ${RELEASES} entry list them:`);
        printRepoChanges(changedInRepo);
    }
    if (!blocking.length) {
        say('ok', `${changedInRepo.length ? 'no Theme Styles edits since the last release' : 'no differences from the live saved settings'}, apart from the rf_* switches (the release guard checks those)`);
        return outcome([]);
    }
    printEntries(blocking);
    if (!state.overwriteLive) {
        const differ = base
            ? `differ from both config.json and the channel's last release (${base.sha.slice(0, 7)}) for "${state.variation}": they were edited in the control panel`
            : `differ from config.json for "${state.variation}"`;
        throw new Stop(`${blocking.length} live Theme Styles value(s) ${differ}. Rerun with --accept-live to copy them into config.json, or with --overwrite-live to replace them on the channel.`);
    }
    if (state.dryRun) {
        say('dry run', `--overwrite-live: a real release asks you to type the channel id here, then overwrites these ${blocking.length} value(s)`);
    } else {
        await confirmOrStop(state.channel, `Type the channel id (${state.channel}) to overwrite these ${blocking.length} live value(s): `);
    }
    return outcome(blocking.map(entry => entry.key));
}

// Spec seam 3: the contrast check on each pulled config. It only reports: the push replaces the
// live colours with config.json's, which step 3 checks and stops on, so a stop here would only ever
// block a release that fixes a live failure. Another theme's colours (a first release) say nothing
// about this one, so they aren't checked.
function reportLiveContrast(file, replacing) {
    if (replacing) {
        say('skipped', 'live contrast: the live theme\'s colours aren\'t checked, because it\'s another theme, which this release replaces');
        return;
    }
    say('', 'Checking the live colours\' contrast (a report: it never stops the release)…');
    const { unexpected, unreadable } = checkContrast(file);
    const problems = [
        unexpected && `${unexpected} pair(s) fail WCAG contrast`,
        unreadable && `${unreadable} pair(s) can't be read`,
    ].filter(Boolean);
    if (!problems.length) {
        say('ok', 'live contrast: no failures beyond the KNOWN_FAILURES in scripts/check-contrast.mjs');
        return;
    }
    warn(`the live colours: ${problems.join(' and ')}, listed above. This doesn't stop the release: the push replaces them with config.json's, which step 3 checks`);
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
        repoSettings, liveSettings: live.settings, publishedSettings: live.capture.publishedSettings, channelId: state.channel, categoryIds,
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
    const confirmation = confirmationStep(options, target);
    const repo = checkSetup(options);
    const state = {
        ...options,
        ...confirmation,
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
    const { live, file } = await readLive(state);
    reportCapture(live);
    stopOrWarn(themeCapProblems(live.capture.themeCount), state.dryRun, message => new Stop(message));
    const releases = readReleaseLog();
    const replacing = foreignTheme(state, live, config, releases);
    const compared = replacing ? {
        overwritten: [], changedInRepo: [], base: null, baseNote: null,
    } : await diffStep(state, live, config, releases);
    reportLiveContrast(file, replacing);
    const guard = await guardStep(state, live, config);
    writeState({
        ...state,
        liveAtStep1: { settings: live.settings, capture: live.capture }, // step 5's gate compares with it
        step1: { replacing, ...compared, unpublished: live.capture.savedEqualsActive ? [] : live.capture.unpublishedKeys || [] },
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

// The zip's size and sha256, or null when it's missing.
function readBundle(zip) {
    if (!fs.existsSync(zip)) return null;
    const data = fs.readFileSync(zip);
    return { bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
}

function bundleInfo([zip]) {
    const bundle = { file: zip, ...readBundle(zip), mainJsBytes: fs.statSync(MAIN_JS).size };
    writeState({ ...readState(), bundle });
    say('ok', `${zip}: ${formatBytes(bundle.bytes)}, sha256 ${bundle.sha256}`);
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
        previousThemeUuid: state.beforePush ? state.beforePush.themeUuid : null, // step 5's capture
        git: { sha: state.git.sha, branch: state.git.branch },
        bundle: state.bundle,
        step1: state.step1,
        guard: state.guard,
        verify: verified,
        operator: operator(),
        confirmation: state.confirmation,
        calendar: state.calendar,
        pairedChannel1: state.pairedChannel1,
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

// Today's phase, read again at step 5 from the committed calendar: a release can run past
// midnight into another phase. The target comes from release-targets.mjs again, not the state file.
function stepFiveCalendar(state) {
    try {
        const target = findTarget(state.channel);
        const phase = readPhase({ fixtures: false });
        return { target, phase, fields: calendarFields(state, target, phase) };
    } catch (error) {
        throw new Stop(`step 5: ${error.message}. Nothing was pushed`);
    }
}

// The operator confirms first (or, with --confirm-nonprod on a non-production target, no one is
// asked: origin/master is fetched again and the flag's refusals are checked again with today's
// calendar, W0-1). Then the gate captures the channel again and checks it, the commit and the zip,
// so nothing slow sits between the last check and the push.
async function prePush() {
    const readBack = readState();
    heading(`Step 5 · Push to channel ${readBack.channel} (${readBack.target.name})`);
    const { target, phase, fields } = stepFiveCalendar(readBack);
    const state = { ...readBack, ...fields };
    console.log(formatPushSummary(releaseRecord(state)));
    const confirm = pushConfirmation({
        options: state,
        target,
        phase: () => phase,
        typed: () => confirmOrStop(state.channel, `Type the channel id (${state.channel}) to push: `),
        origin: () => {
            const { problems, note } = stepFiveOrigin({ git: gitIn(), sha: state.git.sha });
            if (note) say('origin', note);
            return problems;
        },
    });
    const { live, problems } = await pushGate({
        confirm: async () => {
            try {
                await confirm();
            } catch (error) {
                throw error instanceof Stop ? error : new Stop(`${error.message}. Nothing was pushed`);
            }
            if (state.confirmation.mode === 'nonprod') say('confirm', `non-interactive (agent): --confirm-nonprod ${state.confirmNonprod}, checked again with ${phase.date}'s calendar`);
        },
        capture: () => {
            say('', `Capturing channel ${state.channel} again, and checking the commit and the zip…`);
            return captureOrStop(state.channel);
        },
        step1: state.liveAtStep1,
        git: { step1: state.git, read: readGit },
        bundle: { step4: state.bundle, read: () => readBundle(state.bundle.file) },
    });
    if (problems.length) {
        problems.forEach(problem => console.log(`  ${problem}`));
        throw new Stop(`${problems.length} thing(s) changed since the release checked them, listed above. Nothing was pushed: rerun the release`);
    }
    say('ok', 'nothing changed since steps 1 and 4');
    writeState({ ...state, beforePush: live.capture });
}

function printPushArgs() {
    const state = readState();
    if (!state.beforePush) throw new Stop('step 5\'s confirmation and gate haven\'t passed, so there is nothing to push');
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
        saveCapture(state, after);
        themeUuid = after.capture.themeUuid;
        say('live', describeLiveTheme(after.capture));
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

function writeReleaseLog() {
    const state = readState();
    heading('Step 7 · Log');
    const record = releaseRecord(state, { themeUuid: state.verify.themeUuid || 'unknown', verified: { problems: state.verify.problems } });
    fs.writeFileSync(RELEASES, addReleaseEntry(readReleases(), formatReleaseEntry(record)));
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
    'write-log': writeReleaseLog,
};

async function main([step, ...rest]) {
    if (!STEPS[step]) throw refuse(`unknown step "${step}" (steps: ${Object.keys(STEPS).join(', ')})`);
    await STEPS[step](rest);
}

if (isMain(import.meta.url)) {
    main(process.argv.slice(2)).catch(error => {
        if (!(error instanceof Stop)) throw error;
        const label = error.code === 2 ? 'REFUSED' : 'STOP';
        console.error(`${label.padEnd(8)} ${error.message}`);
        if (error.code === 2) console.error(`Usage:   ${USAGE}`);
        process.exit(error.code);
    });
}
