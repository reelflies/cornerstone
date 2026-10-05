// The stops that only a real release reaches (ticket 05), apart from scripts/release.mjs so they're
// tested offline: the setup refusals, the My Themes cap, the typed channel id and step 5's gate.
//
//   import { setupProblems, themeCapProblems, realReleaseStops, confirmChannel, pushGate } from './release-checks.mjs';
//
// setupProblems and themeCapProblems return one line per problem. realReleaseStops turns them into
// stops for a real release and warnings for a dry run. confirmChannel and pushGate take their input,
// the capture and the readers of git and the zip as arguments, so no test needs a terminal or a store.

import readline from 'readline';
import { describeLiveTheme } from './release-capture.mjs';
import { changedKeys } from './release-diff.mjs';

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
