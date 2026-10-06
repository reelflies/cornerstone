// The stops that only a real release reaches (ticket 05), apart from scripts/release.mjs so they're
// tested offline: the setup refusals, the My Themes cap, the typed channel id and step 5's gate, and
// W0-1's non-interactive confirmation for a non-production target with the release calendar's limits.
//
//   import {
//       setupProblems, themeCapProblems, realReleaseStops, confirmChannel, pushGate,
//       confirmNonprodRefusals, pairedChannel1Release, pushConfirmation,
//   } from './release-checks.mjs';
//
// setupProblems and themeCapProblems return one line per problem. realReleaseStops turns them into
// stops for a real release and warnings for a dry run. confirmChannel and pushGate take their input,
// the capture and the readers of git and the zip as arguments, so no test needs a terminal or a store.
// confirmNonprodRefusals and pairedChannel1Release take the calendar's phase (scripts/lib/
// release-calendar.mjs phaseOn), so each date is tested with a calendar object, never the real file.

import readline from 'readline';
import { describePhase } from './lib/release-calendar.mjs';
import { describeLiveTheme } from './release-capture.mjs';
import { changedKeys } from './release-diff.mjs';
import { CONFIRM_NONPROD } from './release-targets.mjs';

export const MAX_THEMES = 20; // My Themes holds at most 20; the release never deletes one (-d)

export function setupProblems({ nodeVersion, nvmrc, dirty }) {
    const problems = [];
    if (nodeVersion !== `v${nvmrc}`) problems.push(`node is ${nodeVersion}, not ${nvmrc} from .nvmrc: source ~/.nvm/nvm.sh && nvm use ${nvmrc}`);
    if (dirty) problems.push('the git tree has uncommitted changes, and a real release pushes a committed tree only: commit or stash, then rerun');
    return problems;
}

export function themeCapProblems(count) {
    if (count < MAX_THEMES) return [];
    return [`My Themes holds ${count} themes, the limit is ${MAX_THEMES}: delete one by hand (Storefront > My Themes). The release never deletes themes.`];
}

export function realReleaseStops(problems, dryRun) {
    if (!dryRun) return { stops: problems, warnings: [] };
    return { stops: [], warnings: problems.map(problem => `${problem} (a dry run goes on; a real release stops here)`) };
}

// The operator types the channel id; anything else stops the release. So does closing stdin
// (Ctrl-D): readline never answers then, and node would exit 0, which release.sh reads as "go on".
export async function confirmChannel({
    channel, question, input = process.stdin, output = process.stdout,
}) {
    if (!input.isTTY) throw new Error('this confirmation needs an operator at a terminal, and stdin is not one');
    const prompt = readline.createInterface({ input, output });
    const answer = await new Promise(resolve => {
        prompt.on('close', () => resolve(null));
        prompt.question(question, resolve);
    });
    prompt.close();
    if (answer === null) throw new Error('no answer (stdin closed): stopped');
    if (answer.trim() !== String(channel)) throw new Error(`"${answer.trim()}" isn't ${channel}: stopped`);
}

const published = live => live.capture.publishedSettings ?? live.settings;
const short = sha => sha.slice(0, 7);

// Everything the push depends on that changed since step 1 (the channel) or step 4 (the zip).
function pushProblems({
    step1, live, git, bundle,
}) {
    const problems = [];
    if (git.now.sha !== git.step1.sha) problems.push(`the commit changed during the release: ${short(git.step1.sha)} then, ${short(git.now.sha)} now`);
    if (git.now.dirty) problems.push('the git tree has uncommitted changes now');
    if (!bundle.now) {
        problems.push(`${bundle.step4.file} is missing`);
    } else if (bundle.now.sha256 !== bundle.step4.sha256 || bundle.now.bytes !== bundle.step4.bytes) {
        problems.push(`${bundle.step4.file} changed after step 4 checked it: sha256 ${bundle.step4.sha256} then, ${bundle.now.sha256} now`);
    }
    problems.push(...themeCapProblems(live.capture.themeCount));
    if (live.capture.themeUuid !== step1.capture.themeUuid || live.capture.variationName !== step1.capture.variationName) {
        problems.push(`the channel now runs ${describeLiveTheme(live.capture)}, not the theme step 1 captured (${describeLiveTheme(step1.capture)})`);
        return problems;
    }
    const saved = changedKeys(step1.settings, live.settings);
    if (saved.length) problems.push(`the saved Theme Styles changed since step 1: ${saved.join(', ')}`);
    const shown = changedKeys(published(step1), published(live));
    if (shown.length) problems.push(`the published Theme Styles changed since step 1: ${shown.join(', ')}`);
    return problems;
}

// Step 5's gate. The operator answers first; then the channel is captured again and checked, so a
// change made while the prompt waited (a switch toggled in Theme Styles, say) stops the push, and
// nothing slow sits between the last check and the push.
//   step1: step 1's capture. git: { step1: { sha, dirty }, read }. bundle: { step4: { file, bytes, sha256 }, read }.
//   bundle.read returns { bytes, sha256 }, or null when the zip is missing.
// Returns the fresh capture, for step 6 to compare with, and one line per reason to stop.
export async function pushGate({
    confirm, capture, step1, git, bundle,
}) {
    await confirm();
    const live = await capture();
    const problems = pushProblems({
        step1,
        live,
        git: { step1: git.step1, now: git.read() },
        bundle: { step4: bundle.step4, now: bundle.read() },
    });
    return { live, problems };
}

// --- W0-1: --confirm-nonprod ----------------------------------------------------------------

// A target that doesn't say `production: false` counts as production: deny by default.
const isProduction = target => target.production !== false;
// Whether the release was given --confirm-nonprod (a state file without the key counts as typed).
export const hasConfirmNonprod = options => options.confirmNonprod !== null && options.confirmNonprod !== undefined;
const flipReached = phase => Boolean(phase.milestones) && phase.date >= phase.milestones['T-0'];

// Every reason --confirm-nonprod is refused for this release, or [] when it is allowed (or not
// given). release-args.mjs refuses a value that isn't --channel and the combinations with
// --overwrite-live and --first-release; they are checked again here, so step 5 never relies on
// the arguments alone. The rest needs the target and the calendar's phase for today:
//   - a production target is confirmed only by typing (channel 1, today and after ticket 53)
//   - from T-21 every push is typed (ticket 57: P1 fixes only, and Shaun decides what is P1)
//   - from the Flip, a target that becomes live reelflies.ca then (1895766) refuses it whatever its
//     `production` flag, as a second lock beside ticket 57's Flip-day change
export function confirmNonprodRefusals({ options, target, phase }) {
    if (!hasConfirmNonprod(options)) return [];
    const reasons = [];
    if (Number(options.confirmNonprod) !== Number(options.channel)) {
        reasons.push(`--confirm-nonprod ${options.confirmNonprod} isn't --channel ${options.channel}: it confirms only the channel this release targets`);
    }
    if (options.overwriteLive) reasons.push('--confirm-nonprod can\'t be combined with --overwrite-live: that choice stays with a person');
    if (options.firstRelease) reasons.push('--confirm-nonprod can\'t be combined with --first-release: that choice stays with a person');
    if (isProduction(target)) {
        reasons.push(`channel ${target.id} (${target.name}) is a production target: its push is confirmed only by typing the channel id at the terminal`);
    } else if (!(target.confirmation || []).includes(CONFIRM_NONPROD)) {
        reasons.push(`channel ${target.id} (${target.name}) takes only the typed confirmation`);
    }
    if (!phase.limits.confirmNonprod) {
        reasons.push(`${describePhase(phase)} --confirm-nonprod is refused from T-21: every push needs the channel id typed at the terminal`);
    }
    if (target.liveFromFlip && flipReached(phase)) {
        reasons.push(`from the Flip (${phase.milestones['T-0']}), ${target.name} is live reelflies.ca: agents never push to it, whatever its production flag (ticket 57)`);
    }
    return reasons;
}

// From T-28 until the Flip, channel 1 runs the same build as 1895766 (ticket 56), so each push to
// a non-production target queues a paired channel-1 release for Shaun: the RELEASES.md entry
// records it, and the review page lists it. Typed pushes too: from T-21 every push is typed, and
// those P1 fixes need channel 1 as well. Returns null when none is pending.
export function pairedChannel1Release({ target, phase }) {
    if (isProduction(target) || !phase.limits.pairedChannel1Release) return null;
    return {
        phase: phase.phase, since: phase.since, t28: phase.milestones['T-28'], flip: phase.flip, status: phase.status,
    };
}

// Step 5's confirmation (W0-1). Without --confirm-nonprod it is `typed`, the typed channel id
// exactly as before W0-1: no terminal still stops the release. With it there is no prompt and no
// stdin is read; instead the refusals are checked again with `phase()`, today's phase read at step
// 5, so a release whose build ran past midnight into T-21 stops before the push. Either way
// pushGate's re-capture and checks run in full after it.
export function pushConfirmation({
    options, target, phase, typed,
}) {
    if (!hasConfirmNonprod(options)) return typed;
    return async () => {
        const reasons = confirmNonprodRefusals({ options, target, phase: phase() });
        if (reasons.length) throw new Error(`--confirm-nonprod refused at step 5: ${reasons.join('; ')}`);
    };
}
