// The stops that only a real release reaches (ticket 05). release-sh.test.mjs can't reach them,
// because every fixture run needs --dry-run, so they're tested here, offline: the setup refusals,
// the My Themes cap, the typed channel id and step 5's gate before the push.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
    confirmChannel, pushGate, realReleaseStops, setupProblems, themeCapProblems,
} from './release-checks.mjs';

// --- Setup and the My Themes cap: a dry run warns, a real release stops ---

test('the wrong Node version and a dirty tree are each a reason to stop', () => {
    assert.deepEqual(setupProblems({ nodeVersion: 'v20.18.1', nvmrc: '20.18.1', dirty: false }), []);
    const problems = setupProblems({ nodeVersion: 'v22.1.0', nvmrc: '20.18.1', dirty: true });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /node is v22\.1\.0, not 20\.18\.1 from \.nvmrc/);
    assert.match(problems[1], /uncommitted changes/);
});

test('My Themes stops the release at 20 themes, because the release never deletes one', () => {
    assert.deepEqual(themeCapProblems(19), []);
    assert.match(themeCapProblems(20)[0], /My Themes holds 20 themes, the limit is 20: delete one by hand/);
});

test('a real release stops on these problems; a dry run only warns, saying a real release would stop', () => {
    const problems = themeCapProblems(20);
    assert.deepEqual(realReleaseStops(problems, false), { stops: problems, warnings: [] });
    const dryRun = realReleaseStops(problems, true);
    assert.deepEqual(dryRun.stops, []);
    assert.match(dryRun.warnings[0], /^My Themes holds 20 themes.*a real release stops here/);
});

// --- The typed channel id ---

function terminal(isTTY = true) {
    const input = new PassThrough();
    input.isTTY = isTTY;
    return { input, output: new PassThrough() };
}

test('typing the channel id confirms', async () => {
    const io = terminal();
    const answered = confirmChannel({ channel: 1895766, question: 'Type the channel id: ', ...io });
    io.input.write(' 1895766\n');
    await answered;
});

test('any other answer stops the release', async () => {
    const io = terminal();
    const answered = confirmChannel({ channel: 1895766, question: 'Type the channel id: ', ...io });
    io.input.write('1\n');
    await assert.rejects(answered, /"1" isn't 1895766: stopped/);
});

test('closing stdin at the prompt (Ctrl-D) stops the release instead of ending it with exit code 0', async () => {
    const io = terminal();
    const answered = confirmChannel({ channel: 1895766, question: 'Type the channel id: ', ...io });
    io.input.end();
    await assert.rejects(answered, /no answer/);
});

test('stdin that isn\'t a terminal stops the release before asking', async () => {
    await assert.rejects(confirmChannel({ channel: 1895766, question: 'Type the channel id: ', ...terminal(false) }), /needs an operator at a terminal/);
});

// --- Step 5's gate: the operator answers, then the channel is captured again and checked ---

const SHA = '1be9fb20ffd985c26c59c5b5fcd28006418d9a08';
const ZIP = { file: 'reelflies-ca-6.22.0-1be9fb2.zip', bytes: 9876543, sha256: 'ab12' };

function capture({
    saved = {}, published = {}, themeUuid = 'fork', variationName = 'ReelFlies CA', themeCount = 12,
} = {}) {
    const settings = { 'body-bg': '#ffffff', rf_quick_add: true, ...saved };
    return {
        settings,
        capture: {
            themeUuid, themeName: 'Cornerstone', variationName, themeCount, publishedSettings: { ...settings, ...published },
        },
    };
}

// The store as the operator leaves it while the prompt waits: `duringPrompt` runs when they answer.
async function gate({
    duringPrompt = () => {}, gitNow = { sha: SHA, dirty: false }, bundleNow = { bytes: ZIP.bytes, sha256: ZIP.sha256 },
} = {}) {
    let store = capture();
    const step1 = capture();
    return pushGate({
        confirm: async () => {
            store = duringPrompt(store) || store;
        },
        capture: async () => store,
        step1,
        git: { step1: { sha: SHA, dirty: false }, read: () => gitNow },
        bundle: { step4: ZIP, read: () => bundleNow },
    });
}

test('when nothing changed since steps 1 and 4, the push goes ahead with the fresh capture', async () => {
    const { problems, live } = await gate();
    assert.deepEqual(problems, []);
    assert.equal(live.capture.themeUuid, 'fork');
});

test('a switch toggled while the operator prompt waits stops the push, naming it', async () => {
    const { problems } = await gate({ duringPrompt: () => capture({ saved: { rf_quick_add: false } }) });
    assert.deepEqual(problems, [
        'the saved Theme Styles changed since step 1: rf_quick_add',
        'the published Theme Styles changed since step 1: rf_quick_add',
    ]);
});

test('a draft published while the prompt waits stops the push, though the saved settings are unchanged', async () => {
    const step1Draft = capture({ saved: { 'body-bg': '#fafafa' }, published: { 'body-bg': '#ffffff' } });
    const { problems } = await pushGate({
        confirm: async () => {},
        capture: async () => capture({ saved: { 'body-bg': '#fafafa' } }),
        step1: step1Draft,
        git: { step1: { sha: SHA, dirty: false }, read: () => ({ sha: SHA, dirty: false }) },
        bundle: { step4: ZIP, read: () => ({ bytes: ZIP.bytes, sha256: ZIP.sha256 }) },
    });
    assert.deepEqual(problems, ['the published Theme Styles changed since step 1: body-bg']);
});

test('another theme or variation activated on the channel stops the push', async () => {
    const theme = await gate({ duringPrompt: () => capture({ themeUuid: 'cavio' }) });
    assert.match(theme.problems[0], /^the channel now runs Cornerstone · variation "ReelFlies CA" \(theme cavio\), not the theme step 1 captured/);
    const variation = await gate({ duringPrompt: () => capture({ variationName: 'ReelFlies US' }) });
    assert.match(variation.problems[0], /^the channel now runs Cornerstone · variation "ReelFlies US"/);
});

test('a full My Themes at the push stops it', async () => {
    const { problems } = await gate({ duringPrompt: () => capture({ themeCount: 20 }) });
    assert.match(problems[0], /My Themes holds 20 themes/);
});

test('a zip changed or deleted after step 4 checked it stops the push', async () => {
    const changed = await gate({ bundleNow: { bytes: ZIP.bytes, sha256: 'ff99' } });
    assert.deepEqual(changed.problems, [`${ZIP.file} changed after step 4 checked it: sha256 ab12 then, ff99 now`]);
    const missing = await gate({ bundleNow: null });
    assert.deepEqual(missing.problems, [`${ZIP.file} is missing`]);
});

test('a new commit or uncommitted files stop the push', async () => {
    const commit = await gate({ gitNow: { sha: '2222222000000000000000000000000000000000', dirty: false } });
    assert.deepEqual(commit.problems, ['the commit changed during the release: 1be9fb2 then, 2222222 now']);
    const dirty = await gate({ gitNow: { sha: SHA, dirty: true } });
    assert.deepEqual(dirty.problems, ['the git tree has uncommitted changes now']);
});
