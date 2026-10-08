#!/usr/bin/env node
// The node steps of scripts/release.sh (tickets 05 and 15). release.sh calls one step at a time:
//
//   node scripts/release.mjs prepare <release.sh arguments>   refusals, step 1 (capture, diff, live contrast), the guard;
//                                                             on a production target (channel 1, ticket 53) the refusals
//                                                             include the operator rule and merged code only
//   node scripts/release.mjs state <key>                      prints one value from the release state
//   node scripts/release.mjs validate-config                  step 3: config.json against stencil-cli's schema
//   node scripts/release.mjs bundle-info <zip>                step 4: records the zip's bytes and sha256
//   node scripts/release.mjs dry-run-report                   a dry run's push summary, command and log entry
//   node scripts/release.mjs pre-push                         step 5: summary, confirmation (typed, or W0-1's
//                                                             --confirm-nonprod; the operator rule again on a
//                                                             production target), then the gate
//   node scripts/release.mjs push-args                        step 5: the push arguments, NUL-separated, once the gate passed
//   node scripts/release.mjs redact                           step 5: filters tokens out of the push output
//   node scripts/release.mjs verify                           step 6: capture again and compare
//   node scripts/release.mjs lighthouse                       step 6b (ticket 17): Lighthouse on the prelaunch
//                                                             host with the shell's preview cookie, or "pending
//                                                             host batch" without it; never stops the release itself
//   node scripts/release.mjs write-log                        step 7: appends the entry to RELEASES.md
//   node scripts/release.mjs prune-after-push                 after step 7, or at the end of a dry run: prunes
//                                                             My Themes (W0-3; a plan only, until a --prune-only
//                                                             has deleted a theme)
//   node scripts/release.mjs prune --prune-only [--dry-run]   W0-3: prunes My Themes on its own
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
//                                    release (W0-2) and the themes the release pushed; and instead of
//                                    origin/master's RELEASES.md for channel 1's prelaunch line (ticket 53)
//   RF_RELEASE_BASE_FIXTURE=<file>   a theme config to use as config.json at the commit of the
//                                    channel's last release, instead of reading it with git (W0-2)
//   RF_RELEASE_CALENDAR_FIXTURE=<file>  a release calendar to read instead of
//                                    scripts/release-calendar.json (W0-1); step 5 never reads it
//   RF_RELEASE_DATE=<YYYY-MM-DD>     today's date for the calendar, instead of today in Toronto (W0-1);
//                                    step 5 never reads it
//   RF_RELEASE_THEMES_FIXTURE=<file> My Themes and every channel's active theme, { themes,
//                                    activeByChannel }, instead of the store, for the prune (W0-3)

import { execFileSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { checkContrast } from './check-contrast.mjs';
import { formatBytes } from './lib/format.mjs';
import { isMain } from './lib/is-main.mjs';
import {
    describePhase, phaseOn, readCalendar, todayInToronto,
} from './lib/release-calendar.mjs';
import {
    parsePruneArgs, parseReleaseArgs, PRUNE_USAGE, resolveTarget, USAGE,
} from './release-args.mjs';
import {
    captureLive, describeLiveTheme, getStoreHash, isThisFork, stencilApi,
} from './release-capture.mjs';
import {
    confirmChannel, confirmNonprodRefusals, hasConfirmNonprod, isProductionTarget, MAX_THEMES, operatorProblems, operatorRefusal, pairedChannel1Release,
    pushConfirmation, pushGate, realReleaseStops, setupProblems, themeCapProblems, typedQuestion,
} from './release-checks.mjs';
import {
    acceptLiveValues, changedKeys, displayValue, effectiveSettings, hasSetting, threeWayDiff, verifyRelease,
} from './release-diff.mjs';
import { checkRelease, menuIdsSet } from './release-guard.mjs';
import {
    cookieSecrets, describeLighthouse, lighthouseEnv, lighthouseOutcome, lighthousePlan, resultsDirFor, runCommand, stopReason,
} from './release-lighthouse.mjs';
import {
    addMyThemesRow, addReleaseEntry, describePairedRelease, describePrelaunch, formatMyThemesRow, formatPushSummary, formatReleaseEntry, lastRelease, myThemesRows,
    prelaunchBuild, releasedThemeUuids, releaseEntries,
} from './release-log.mjs';
import {
    checkoutProblems, gitIn, mergedCheckoutProblems, ORIGIN_MASTER, readCheckout, readMergedCheckout, stepFiveOrigin,
} from './release-origin.mjs';
import {
    describePlan, describeRunProblems, DRY_RUN_MINUTES, dryRunProblems, dryRunRecord, planPrune, releasesEditProblems, REQUIRED_CHANNELS, runPrune, uncommittedProblems,
} from './release-prune.mjs';
import { redact } from './release-redact.mjs';
import { validateThemeConfig } from './release-schema.mjs';
import { buildPushArgs, findTarget, RELEASE_TARGETS } from './release-targets.mjs';
import { readMyThemes, themeDeleter, themeReader } from './release-themes.mjs';
import { fetchChannelCategoryIds, readGuardToken, tokenGetJson } from './release-tree-ids.mjs';

const MAIN_JS = 'assets/dist/theme-bundle.main.js';
const RELEASES = 'RELEASES.md';
const OVERRIDES = [
    'RF_RELEASE_CONFIG', 'RF_RELEASE_LIVE_FIXTURE', 'RF_RELEASE_TREE_FIXTURE', 'RF_RELEASE_LOG_FIXTURE', 'RF_RELEASE_BASE_FIXTURE', 'RF_RELEASE_CALENDAR_FIXTURE', 'RF_RELEASE_DATE',
    'RF_RELEASE_THEMES_FIXTURE',
];
// The store token variables, read here only to redact them from the output. The guard reads its
// token through scripts/lib/store-token.mjs (readGuardToken), never from here.
const TOKEN_VARIABLES = ['RF_BC_API_TOKEN', 'RF_BC_READ_TOKEN'];

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

// The test-only overrides need --dry-run: a real run always reads the store, git and RELEASES.md.
function refuseOverrides(dryRun, why) {
    const overrides = OVERRIDES.filter(name => process.env[name]);
    if (overrides.length && !dryRun) {
        throw refuse(`${overrides.join(' and ')} ${overrides.length > 1 ? 'are' : 'is'} test-only and need${overrides.length > 1 ? '' : 's'} --dry-run: ${why}`);
    }
}

function readOptions(argv) {
    let options;
    try {
        options = parseReleaseArgs(argv);
    } catch (error) {
        throw refuse(error.message);
    }
    refuseOverrides(options.dryRun, 'a real push always captures the live theme');
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
// and the paired channel-1 release (ticket 56), and what step 6b will do about Lighthouse after the
// push (ticket 17), from the target, today's phase and the shell's preview cookie.
function calendarFields(options, target, phase) {
    return {
        confirmation: hasConfirmNonprod(options) ? { mode: 'nonprod', channel: options.confirmNonprod } : { mode: 'typed' },
        calendar: {
            line: describePhase(phase), phase: phase.phase, flip: phase.flip, status: phase.status,
        },
        pairedChannel1: pairedChannel1Release({ target, phase }),
        lighthouse: lighthousePlan({ channel: target.id, phase: phase.phase, cookie: process.env.QA_PREVIEW_COOKIE }),
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

// Ticket 53: a push to a production target (channel 1, live reelflies.ca) sends merged code only:
// HEAD in a freshly fetched origin/master's history, on master or detached at it
// (release-origin.mjs mergedCheckoutProblems). Not only the tip: the paired channel-1 release
// pushes the commit the 1895766 build ran, which the release-log PR has already left behind. A real
// release refuses otherwise, and a dry run warns. Returns the checkout.
function mergedOriginStep(options, target) {
    const offline = OVERRIDES.some(name => process.env[name]);
    if (offline) say('fixture', 'origin/master as last fetched: a dry run on the test-only overrides doesn\'t fetch');
    const checkout = readMergedCheckout({ git: gitIn(), fetch: !offline });
    const problems = mergedCheckoutProblems(checkout);
    if (problems.length) {
        stopOrWarn([`a push to channel ${target.id} (${target.name}), a live storefront, sends merged code only: ${problems.join('; ')}`], options.dryRun, refuse);
        return checkout;
    }
    const head = `HEAD ${checkout.head.slice(0, 7)} ${checkout.branch === 'HEAD' ? '(detached)' : 'on master'}`;
    const where = checkout.head === checkout.originMaster
        ? 'origin/master\'s tip'
        : `in origin/master's history, ${checkout.behind} commit(s) behind its tip ${checkout.originMaster.slice(0, 7)}`;
    say('origin', `${head} is ${where}${offline ? '' : ', fetched just now'}: only merged code goes live on ${target.name}`);
    return checkout;
}

// The release log the prelaunch check reads: origin/master's RELEASES.md, where each build's
// release-log PR records it, or the test fixture. { markdown, source } or { error }.
function readPrelaunchLog() {
    const fixture = process.env.RF_RELEASE_LOG_FIXTURE;
    if (fixture) {
        try {
            return { markdown: fs.readFileSync(fixture, 'utf8'), source: `release log from ${fixture}, RF_RELEASE_LOG_FIXTURE` };
        } catch (error) {
            return { error: `can't read the release log fixture ${fixture}: ${error.message}` };
        }
    }
    try {
        return { markdown: gitIn()('show', `${ORIGIN_MASTER}:${RELEASES}`), source: `origin/master's ${RELEASES}` };
    } catch (error) {
        return { error: `origin/master's ${RELEASES} can't be read: ${String(error.stderr || error.message).trim().split('\n')[0]}` };
    }
}

// Ticket 53: on channel 1, whether HEAD ran on prelaunch (1895766), and if not, which commit did
// last. A report that never stops the release: the paired release pushes the 1895766 build's commit
// (ticket 56:37), and ticket 56 reads that entry's Lighthouse line. The push summary repeats it at
// step 5. Returns the result for the state, or null on any other target.
function prelaunchStep(target, checkout) {
    if (Number(target.id) !== 1 || !checkout.head) return null;
    const { markdown, source, error } = readPrelaunchLog();
    const prelaunch = error ? { sha: checkout.head, error } : prelaunchBuild(markdown, checkout.head);
    say('prelaunch', `${describePrelaunch(prelaunch)}${source ? ` (${source})` : ''}`);
    return prelaunch;
}

// The fixtures with which a dry run reads nothing from the store and stops before the build: the
// theme config (which stops it before the build), the capture and the category tree.
const OFFLINE_FIXTURES = ['RF_RELEASE_CONFIG', 'RF_RELEASE_LIVE_FIXTURE', 'RF_RELEASE_TREE_FIXTURE'];

// Ticket 53: a production target (channel 1, live reelflies.ca) is released only by an operator
// typing at their own terminal, never by an agent, dry runs included (release-checks.mjs
// operatorProblems). The one exception is a dry run on all three offline fixtures, which reads
// nothing from the store and stops before the build: the tests' runs. Step 5 checks again, with no
// exception.
function operatorStep(target) {
    const problems = operatorProblems({ target });
    if (!problems.length) {
        say('operator', `an operator at a terminal: channel ${target.id} (${target.name}) is released only by a person typing, never by an agent`);
        return;
    }
    if (OFFLINE_FIXTURES.every(name => process.env[name])) {
        say('fixture', `no operator check: this dry run reads nothing from the store (${OFFLINE_FIXTURES.slice(0, -1).join(', ')} and ${OFFLINE_FIXTURES.at(-1)}) and stops before the build`);
        return;
    }
    throw refuse(operatorRefusal(target, problems));
}

// Before step 1: how step 5 will be confirmed, and today's phase of the calendar. With
// --confirm-nonprod the checkout must be master at origin/master's tip, and the flag is refused on a
// production target and from T-21 (release-checks.mjs confirmNonprodRefusals), so a refused run
// captures nothing; step 5 checks both again before the push. A production target (ticket 53)
// refuses the flag before anything is fetched, then needs an operator at a terminal, then merged
// code; on channel 1 it also says whether the commit ran on prelaunch.
function confirmationStep(options, target) {
    heading('Confirmation and the release calendar');
    const phase = readPhase({ fixtures: true });
    const fields = calendarFields(options, target, phase);
    say('calendar', fields.calendar.line);
    const production = isProductionTarget(target);
    if (hasConfirmNonprod(options) && !production) originStep(options);
    const reasons = confirmNonprodRefusals({ options, target, phase });
    if (reasons.length) throw refuse(`--confirm-nonprod refused: ${reasons.join('; ')}`);
    let prelaunch = null;
    if (production) {
        operatorStep(target);
        prelaunch = prelaunchStep(target, mergedOriginStep(options, target));
    }
    say('confirm', hasConfirmNonprod(options)
        ? `non-interactive (agent): --confirm-nonprod ${options.confirmNonprod} replaces step 5's typed channel id; step 5's gate still captures the channel again and checks everything before the push`
        : 'typed: step 5 asks the operator to type the channel id, and stops without a terminal');
    if (fields.pairedChannel1) {
        say('paired', `a paired channel-1 release is ${describePairedRelease(fields.pairedChannel1)}. The ${RELEASES} entry records it for Shaun.`);
    }
    say('lighthouse', describeLighthouse(fields.lighthouse));
    return prelaunch ? { ...fields, prelaunch } : fields;
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

// A first release runs no diff, because the live theme is another one, but the push still replaces
// the live value of every setting both themes name. They are listed, as a report that never stops
// the release, so the operator sees them before step 5: on channel 1, the Hero-2024 values ticket
// 53's carry-over decisions didn't keep (the first push's diff, 53:42). A setting only the live
// theme has isn't replaced by a value: it stays with that theme in My Themes.
function reportReplaced(state, live, config) {
    const repo = effectiveSettings(config, state.variation);
    const keys = changedKeys(repo, live.settings).filter(key => hasSetting(repo, key) && hasSetting(live.settings, key));
    if (!keys.length) {
        say('replaces', 'no setting both themes name differs');
        return;
    }
    say('replaces', `${keys.length} setting(s) both themes name differ: the push replaces their live values with config.json's (a report: it never stops the release)`);
    for (const key of keys) console.log(`  replaced   ${key}: live ${short(key, live.settings[key])}, config.json ${short(key, repo[key])}`);
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
    // W0-11's loader: RF_BC_READ_TOKEN, then RF_BC_API_TOKEN, then the Keychain item
    // "reelflies-bc-read" (scripts/lib/store-token.mjs). The token is never printed.
    let token;
    try {
        ({ token } = readGuardToken());
    } catch (error) {
        throw new Stop(`a menu id is set, so the guard must read channel ${state.channel}'s category tree with ${error.message}`);
    }
    say('', `Reading channel ${state.channel}'s category tree read-only…`);
    try {
        return await fetchChannelCategoryIds({ channelId: state.channel, storeHash: await getStoreHash(), getJson: tokenGetJson(token) });
    } catch (error) {
        // The token may come from the Keychain, which the push output's filter can't see.
        throw new Stop(`reading channel ${state.channel}'s category tree failed: ${redact(error.message, [token])}`);
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
    // Ticket 53: a production target has no live value to hold these to, so the operator confirms them.
    if (result.newSwitches.length && isProductionTarget(state.target)) {
        say('confirm', `channel ${state.channel} has no live value for ${result.newSwitches.length} rf_* setting(s) above (its first push, or a module's first release there): step 5 asks you to confirm them by typing the channel id`);
    }
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
    if (replacing) reportReplaced(state, live, config);
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
        lighthouse: state.lighthouse,
        prelaunch: state.prelaunch || null, // ticket 53: the push summary's prelaunch line, on channel 1
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
// midnight into another phase. The target comes from release-targets.mjs again, not the state file,
// and so does the variation it takes (ticket 53): an edited state file can't send another
// variation's settings, such as tree 4's menu ids, to channel 1.
function stepFiveCalendar(state) {
    try {
        const target = findTarget(state.channel);
        if (!target.variations.includes(state.variation)) {
            throw new Error(`the release state's variation "${state.variation}" isn't released to channel ${target.id}: ${target.name} takes ${target.variations.map(name => `"${name}"`).join(', ')}`);
        }
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
    // Ticket 53: a production target is the operator's alone, checked again here with no exception.
    const notOperator = operatorProblems({ target });
    if (notOperator.length) throw new Stop(`${operatorRefusal(target, notOperator)}. Nothing was pushed`);
    const confirm = pushConfirmation({
        options: state,
        target,
        phase: () => phase,
        typed: () => confirmOrStop(state.channel, typedQuestion({ target, variation: state.variation, newSwitches: state.guard.newSwitches })),
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
    return [accessToken, ...TOKEN_VARIABLES.map(name => process.env[name])];
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

// --- Step 6b: Lighthouse on the prelaunch host (ticket 17) ----------------------------------

const LIGHTHOUSE_HISTORY = 'scripts/qa/lighthouse-history.json';

// The values the runner's output must never show: the tokens, and the preview cookie whole and
// each of its values.
function lighthouseSecrets(cookie) {
    return [...cookieSecrets(cookie), ...knownSecrets()];
}

function readLighthouseSummary(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

// What the step does (release-lighthouse.mjs lighthousePlan), and, when it runs the gate, what it
// measured. The runner is `npm run qa:lighthouse` (scripts/qa/lighthouse.mjs) on the prelaunch host,
// filing its results under the pushed theme's uuid.
async function measureLighthouse(state) {
    const cookie = process.env.QA_PREVIEW_COOKIE;
    const plan = lighthousePlan({
        channel: state.channel, phase: state.calendar.phase, cookie, verify: state.verify,
    });
    say('lighthouse', describeLighthouse(plan));
    if (plan.result !== 'run') return plan;
    const uuid = state.verify.themeUuid;
    const startedAt = new Date().toISOString();
    const run = await runCommand({
        command: 'npm',
        args: ['run', 'qa:lighthouse'],
        cwd: process.cwd(),
        env: lighthouseEnv({
            env: process.env, variation: state.variation, uuid, commit: state.git.sha,
        }),
        secrets: lighthouseSecrets(cookie),
    });
    const summary = readLighthouseSummary(path.join(resultsDirFor(uuid), 'lighthouse', 'summary.json'));
    const outcome = lighthouseOutcome({
        ...run, summary, startedAt, uuid, secrets: lighthouseSecrets(cookie),
    });
    if (outcome.result === 'pending') {
        say('pending', outcome.reason);
        return outcome;
    }
    say(outcome.result === 'pass' ? 'ok' : 'FAIL', describeLighthouse(outcome));
    if (outcome.result === 'fail') say('', `the ${RELEASES} entry records the failure, and the release stops once it is written`);
    if (outcome.accepted) say('NOTE', `${LIGHTHOUSE_HISTORY} changed: commit it with ${RELEASES} through the release-log PR. Until it is committed, the prune after this push only shows its plan.`);
    return outcome;
}

// Step 6b, between verify and the log entry, so the entry records Lighthouse. The push is done and
// RELEASES.md has no entry yet, so this step never stops the release itself: whatever goes wrong
// here (Ctrl-C included, which stops only the runner) is recorded as "pending host batch", and a
// failed gate, or a run the operator stopped, stops the release only once step 7 has written its
// entry.
async function lighthouseStep() {
    const state = readState();
    heading('Step 6b · Lighthouse on the prelaunch host (ticket 17)');
    let lighthouse;
    try {
        lighthouse = await measureLighthouse(state);
    } catch (error) {
        lighthouse = { result: 'pending', reason: `the Lighthouse step couldn't run (${redact(String((error && error.message) || error), lighthouseSecrets(process.env.QA_PREVIEW_COOKIE))}). The next host batch of this build (npm run qa:prelaunch) measures it` };
        say('pending', lighthouse.reason);
    }
    writeState({ ...state, lighthouse });
}

function writeReleaseLog() {
    const state = readState();
    heading('Step 7 · Log');
    // Step 6b replaces the plan with what it did; without it, Lighthouse is still owed.
    const lighthouse = state.lighthouse && state.lighthouse.result !== 'run' ? state.lighthouse : { result: 'pending', reason: 'step 6b recorded nothing' };
    const record = releaseRecord({ ...state, lighthouse }, { themeUuid: state.verify.themeUuid || 'unknown', verified: { problems: state.verify.problems } });
    fs.writeFileSync(RELEASES, addReleaseEntry(readReleases(), formatReleaseEntry(record)));
    say('ok', `appended this release to ${RELEASES}: commit it`);
    const stops = [
        state.verify.problems.length ? `the push went through, but verify found ${state.verify.problems.length} problem(s), listed above and in ${RELEASES}` : null,
        stopReason(lighthouse),
    ].filter(Boolean);
    if (stops.length) throw new Stop(stops.join('. '));
}

// --- W0-3: pruning My Themes ------------------------------------------------------------------

// My Themes and every channel's active theme: the store, read-only, or RF_RELEASE_THEMES_FIXTURE in a
// dry run. A deleter is made only for a real prune, so a dry run has no way to delete. Every store
// error comes back from release-themes.mjs as a message only, never with the request.
async function readStoreThemes(releases, deleting) {
    const fixture = process.env.RF_RELEASE_THEMES_FIXTURE;
    if (fixture) {
        say('fixture', `My Themes and the channels' active themes from ${fixture} (RF_RELEASE_THEMES_FIXTURE)`);
        const { themes, activeByChannel } = readJson(fixture, 'the My Themes fixture');
        return { themes, activeByChannel };
    }
    say('', 'Reading My Themes and every channel\'s active theme read-only…');
    try {
        const { client, api } = await stencilApi();
        const knownChannels = [...REQUIRED_CHANNELS, ...Object.keys(RELEASE_TARGETS).map(Number), ...releaseEntries(releases).map(entry => entry.channel)];
        const { themes, activeByChannel } = await readMyThemes({ client, api, knownChannels });
        if (!deleting) return { themes, activeByChannel };
        return {
            themes, activeByChannel, deleteTheme: themeDeleter({ client, api }), readThemes: themeReader({ client, api }),
        };
    } catch (error) {
        throw new Stop(`reading My Themes failed, so nothing was deleted: ${redact(error.message, knownSecrets())}`);
    }
}

// Logs one deletion in RELEASES.md's My Themes section, right after the store answered it. The
// operator cell says "(no terminal)" when stdin isn't one, as for an agent's run.
function logDeletion(build, action) {
    const row = formatMyThemesRow({
        timestamp: new Date().toISOString(),
        action,
        uuid: build.uuid,
        name: build.name,
        version: build.record.version,
        sha: build.record.sha,
        zipSha256: build.record.zipSha256,
        operator: operator(),
        terminal: Boolean(process.stdin.isTTY),
    });
    try {
        fs.writeFileSync(RELEASES, addMyThemesRow(readReleases(), row));
    } catch (error) {
        throw new Error(`${error.message}; the row is ${row}`);
    }
    say('deleted', `${build.uuid}, released ${build.record.timestamp} UTC: logged in ${RELEASES}`);
}

// Reads the store, plans (scripts/release-prune.mjs) and, when `deleting`, deletes the plan's
// themes one at a time, logging each. `releases` is RELEASES.md, or the fixture in a dry run.
// beforeDeleting(plan) runs once the plan is shown, before the first deletion. Returns the plan.
async function pruneSteps({
    releases, deleting, action, beforeDeleting,
}) {
    const store = await readStoreThemes(releases, deleting);
    let plan;
    try {
        plan = planPrune({ themes: store.themes, activeByChannel: store.activeByChannel, markdown: releases });
    } catch (error) {
        throw new Stop(`${error.message}: nothing was deleted`);
    }
    describePlan(plan).forEach(line => console.log(line));
    if (!plan.toDelete.length) {
        say('ok', 'nothing to delete');
        return plan;
    }
    if (!deleting) {
        say('dry run', `would delete ${plan.toDelete.length} theme(s); nothing was deleted, and ${RELEASES} is unchanged`);
        return plan;
    }
    beforeDeleting(plan);
    const result = await runPrune({
        plan, deleteTheme: store.deleteTheme, readThemes: store.readThemes, record: build => logDeletion(build, action),
    });
    const problems = describeRunProblems(result);
    if (problems) throw new Stop(redact(problems, knownSecrets()));
    say('ok', `deleted ${result.deleted.length} theme(s), each logged in ${RELEASES}'s My Themes section: commit it`);
    return plan;
}

// Any error that isn't a Stop goes on as a Stop with its message only, the tokens taken out: Node
// prints an uncaught error whole, and a store error's request holds the token.
async function prune({
    releases, deleting, action, beforeDeleting = () => {},
}) {
    try {
        return await pruneSteps({
            releases, deleting, action, beforeDeleting,
        });
    } catch (error) {
        if (error instanceof Stop) throw error;
        throw new Stop(`the prune stopped: ${redact(String((error && error.message) || error), knownSecrets())}`);
    }
}

// Why this checkout's own state shouldn't decide a real prune, or []: an uncommitted file besides
// RELEASES.md, or a line of RELEASES.md changed or removed since HEAD (only new lines, such as a
// release's entry or the prune's rows, are allowed).
function uncommittedPruneProblems() {
    const porcelain = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
    const numstat = execFileSync('git', ['diff', '--numstat', 'HEAD', '--', RELEASES], { encoding: 'utf8' });
    return [...uncommittedProblems(porcelain), ...releasesEditProblems(numstat)];
}

// A real --prune-only runs from master at origin/master's tip, with nothing uncommitted but new
// lines in RELEASES.md, so origin/master's rules decide what is deleted (as for W0-1's agent push).
// A dry run warns instead; on the test-only overrides it doesn't fetch. Returns HEAD's sha.
function pruneCheckout(dryRun) {
    const offline = OVERRIDES.some(name => process.env[name]);
    if (offline) say('fixture', 'origin/master as last fetched: a dry run on the test-only overrides doesn\'t fetch');
    const checkout = readCheckout({ git: gitIn(), fetch: !offline });
    const problems = [...checkoutProblems(checkout), ...uncommittedPruneProblems()];
    if (!problems.length) {
        say('origin', `master at origin/master's tip ${checkout.head.slice(0, 7)}${offline ? '' : ', fetched just now'}: origin/master's rules decide what the prune deletes`);
        return checkout.head;
    }
    const message = `a real prune needs this checkout on master at origin/master's tip, with nothing uncommitted but new lines in ${RELEASES}, so that origin/master's rules decide what is deleted: ${problems.join('; ')}`;
    if (!dryRun) throw refuse(message);
    warn(`${message} (a dry run goes on; a real prune stops here)`);
    return checkout.head;
}

// The record of this checkout's last dry --prune-only, in its git folder (never in the tree, so the
// checkout stays clean). See release-prune.mjs, "The dry run before a real --prune-only".
const dryRunFile = () => git('rev-parse', '--git-path', 'rf-prune-dry-run.json');

function readDryRun(file) {
    if (!fs.existsSync(file)) return null;
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        return { unreadable: error.message };
    }
}

function refuseWithoutDryRun(problems) {
    if (!problems.length) return;
    throw refuse(`a real --prune-only deletes only what a --prune-only --dry-run in this checkout planned, from the same commit, within ${DRY_RUN_MINUTES} minutes: ${problems.join('; ')}. Run ${PRUNE_USAGE.replace('[--dry-run]', '--dry-run')}, check its plan, then run this again`);
}

// release.sh --prune-only [--dry-run]: the prune on its own (W0-3). A dry run records its plan; a
// real run needs that record, uses it up before it reads the store, and deletes only that plan.
async function pruneOnly(argv) {
    let options;
    try {
        options = parsePruneArgs(argv);
    } catch (error) {
        throw refuse(error.message);
    }
    refuseOverrides(options.dryRun, 'a real prune always reads the store, git and RELEASES.md');
    heading(`My Themes: prune${options.dryRun ? ' (dry run: nothing is deleted)' : ''}`);
    const head = pruneCheckout(options.dryRun);
    const file = dryRunFile();
    if (options.dryRun) {
        const plan = await prune({ releases: readReleaseLog(), deleting: false, action: null });
        const source = process.env.RF_RELEASE_THEMES_FIXTURE ? 'fixture' : 'store';
        fs.writeFileSync(file, `${JSON.stringify(dryRunRecord({ plan, head, source }), null, 2)}\n`);
        say('recorded', `this plan, for the real --prune-only: it deletes only what this dry run planned, from this commit, within ${DRY_RUN_MINUTES} minutes${source === 'fixture' ? ' (a fixture\'s plan, which no real run accepts)' : ''}`);
        return;
    }
    const record = readDryRun(file);
    refuseWithoutDryRun(dryRunProblems({ record, head }));
    fs.rmSync(file, { force: true });
    say('dry run', `this checkout's dry run at ${record.plannedAt} planned to delete ${record.toDelete.length ? record.toDelete.join(', ') : 'nothing'}: this run deletes only that`);
    await prune({
        releases: readReleaseLog(),
        deleting: true,
        action: 'deleted (--prune-only)',
        beforeDeleting: plan => refuseWithoutDryRun(dryRunProblems({ record, head, plan })),
    });
}

const hasLoggedDeletion = releases => myThemesRows(releases).some(row => row.action.startsWith('deleted'));

// Why the prune after a real push only shows its plan, or []: the commit it pushed is no longer
// judged by origin/master's rules (release-origin.mjs stepFiveOrigin), this checkout isn't at that
// commit, or anything but new lines in RELEASES.md is uncommitted. Prints stepFiveOrigin's note.
function afterPushProblems(state) {
    const { problems, note } = stepFiveOrigin({ git: gitIn(), sha: state.git.sha });
    if (problems.length) return problems;
    const head = git('rev-parse', 'HEAD');
    const moved = head === state.git.sha ? [] : [`this checkout is at ${head.slice(0, 7)}, not ${state.git.sha.slice(0, 7)}, the commit this release pushed`];
    const all = [...moved, ...uncommittedPruneProblems()];
    if (!all.length && note) say('origin', note);
    return all;
}

// After step 7, or at the end of a dry run. A real release deletes only once RELEASES.md logs a
// deletion, so the first real prune is a --prune-only, which needs its dry run first (W0-3), and
// only from the commit it pushed, still judged by origin/master's rules, with nothing uncommitted
// but new lines in RELEASES.md. Otherwise it shows the plan. Verify's problems stop release.sh at
// step 7, before this.
async function pruneAfterPush() {
    const state = readState();
    refuseOverrides(state.dryRun, 'a real release always reads the store and RELEASES.md');
    heading(`My Themes: prune after the push${state.dryRun ? ' (dry run: nothing is deleted)' : ''}`);
    const releases = readReleaseLog();
    let deleting = false;
    if (state.dryRun) {
        say('dry run', `a real release prunes My Themes here, after its push and its ${RELEASES} entry. This is what it would do now, before the push.`);
    } else if (!hasLoggedDeletion(releases)) {
        say('first', `${RELEASES} records no theme deleted from My Themes yet, so this prune only shows its plan: the first real prune is ${PRUNE_USAGE.replace(' [--dry-run]', '')}, run with --dry-run first (W0-3)`);
    } else {
        const problems = afterPushProblems(state);
        if (problems.length) {
            warn(`this prune only shows its plan: ${problems.join('; ')}. Prune from the main clone, on master, with ${PRUNE_USAGE}`);
        } else {
            say('prune', `deletes what the plan below marks "delete", and logs each in ${RELEASES}'s My Themes section`);
            deleting = true;
        }
    }
    try {
        await prune({ releases, deleting, action: 'deleted (prune after a release)' });
    } catch (error) {
        if (!(error instanceof Stop) || state.dryRun) throw error;
        throw new Stop(`The release is pushed and logged in ${RELEASES}; only the prune stopped: ${error.message}`);
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
    lighthouse: lighthouseStep,
    'write-log': writeReleaseLog,
    'prune-after-push': pruneAfterPush,
    prune: pruneOnly,
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
        if (error.code === 2) console.error(`Usage:   ${USAGE}\n         ${PRUNE_USAGE}`);
        process.exit(error.code);
    });
}
