// The stops that only a real release reaches (ticket 05). release-sh.test.mjs can't reach them,
// because every fixture run needs --dry-run, so they're tested here, offline: the setup refusals,
// the My Themes cap, the typed channel id and step 5's gate before the push, and W0-1's
// --confirm-nonprod with a calendar object for each phase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
    confirmChannel, confirmNonprodRefusals, pairedChannel1Release, pushConfirmation, pushGate, realReleaseStops, setupProblems, themeCapProblems,
} from './release-checks.mjs';
import { parseCalendar, phaseOn } from './lib/release-calendar.mjs';

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

// --- W0-1: --confirm-nonprod, the non-interactive confirmation for a non-production target ---

const CA_TARGET = {
    id: 1895766, name: 'ReelFlies_CA', production: false, confirmation: ['typed', 'nonprod'], liveFromFlip: true,
};
// Ticket 53's channel-1 entry, as it will be declared: production, typed only.
const CHANNEL_1 = {
    id: 1, name: 'reelflies.ca', production: true, confirmation: ['typed'],
};
const FLIP = '2027-03-01';
const on = (date, flip = FLIP, status = 'provisional') => phaseOn(parseCalendar({ flip, status, source: 'ticket 10 comment' }), date);
const agent = (extra = {}) => ({
    channel: 1895766, confirmNonprod: 1895766, overwriteLive: false, firstRelease: false, ...extra,
});

test('W0-1: without --confirm-nonprod there is nothing to refuse, whatever the target or the date', () => {
    for (const target of [CA_TARGET, CHANNEL_1]) {
        assert.deepEqual(confirmNonprodRefusals({ options: agent({ confirmNonprod: null }), target, phase: on('2027-03-10') }), []);
    }
});

// [date, the calendar phase, refused?, the paired channel-1 release pending?]
const CALENDAR_DATES = [
    ['2026-10-06', 'build', false, false],
    ['2027-01-25', 'T-35', false, false],
    ['2027-02-01', 'T-28', false, true],
    ['2027-02-07', 'T-28', false, true],
    ['2027-02-08', 'T-21', true, true],
    ['2027-02-15', 'T-14', true, true],
    ['2027-03-01', 'T-0', true, false],
    ['2027-03-31', 'T+30', true, false],
];

for (const [date, phase, refused, paired] of CALENDAR_DATES) {
    test(`W0-1: on ${date} (${phase}, Flip ${FLIP}) --confirm-nonprod is ${refused ? 'refused' : 'allowed'} on 1895766, and a paired channel-1 release is ${paired ? '' : 'not '}pending`, () => {
        const result = on(date);
        assert.equal(result.phase, phase);
        const reasons = confirmNonprodRefusals({ options: agent(), target: CA_TARGET, phase: result });
        assert.equal(reasons.length > 0, refused, reasons.join('; '));
        if (refused) assert.match(reasons[0], new RegExp(`${date} is in ${phase.replace('+', '\\+')}.*--confirm-nonprod is refused from T-21: every push needs the channel id typed at the terminal`));
        const row = pairedChannel1Release({ target: CA_TARGET, phase: result });
        assert.equal(Boolean(row), paired);
        if (paired) {
            assert.deepEqual(row, {
                phase, since: result.since, t28: '2027-02-01', flip: FLIP, status: 'provisional',
            });
        }
    });
}

test('W0-1: a calendar with no Flip date limits nothing: the flag is allowed and no paired release is pending', () => {
    const result = phaseOn(parseCalendar({ flip: null, status: 'provisional', source: 'ticket 10: Flip date after ticket 26' }), '2027-03-10');
    assert.deepEqual(confirmNonprodRefusals({ options: agent(), target: CA_TARGET, phase: result }), []);
    assert.equal(pairedChannel1Release({ target: CA_TARGET, phase: result }), null);
});

test('W0-1: from the Flip, the flag is refused on 1895766 whatever its production flag, as a second lock beside ticket 57', () => {
    // Even if ticket 58 lifted the calendar's limit after T+30, 1895766 stays refused: it is live reelflies.ca.
    const lifted = { ...on('2027-04-15'), limits: { ...on('2027-04-15').limits, confirmNonprod: true } };
    const reasons = confirmNonprodRefusals({ options: agent(), target: CA_TARGET, phase: lifted });
    assert.equal(reasons.length, 1);
    assert.match(reasons[0], /from the Flip \(2027-03-01\), ReelFlies_CA is live reelflies\.ca: agents never push to it, whatever its production flag/);
    const flipDay = confirmNonprodRefusals({ options: agent(), target: CA_TARGET, phase: on(FLIP) });
    assert.equal(flipDay.length, 2, 'the calendar and the Flip lock both refuse it');
    assert.match(flipDay[1], /is live reelflies\.ca/);
    const before = confirmNonprodRefusals({ options: agent(), target: CA_TARGET, phase: on('2027-02-28') });
    assert.doesNotMatch(before.join('; '), /is live reelflies\.ca/, 'the day before the Flip, only the calendar refuses');
});

test('W0-1: a production target is refused, so channel 1 keeps its typed prompt today and after ticket 53', () => {
    const reasons = confirmNonprodRefusals({ options: agent({ channel: 1, confirmNonprod: 1 }), target: CHANNEL_1, phase: on('2026-10-06') });
    assert.deepEqual(reasons, ['channel 1 (reelflies.ca) is a production target: its push is confirmed only by typing the channel id at the terminal']);
    // A production entry that lists the non-production mode by mistake is still refused.
    const mistaken = { ...CHANNEL_1, confirmation: ['typed', 'nonprod'] };
    assert.match(confirmNonprodRefusals({ options: agent({ channel: 1, confirmNonprod: 1 }), target: mistaken, phase: on('2026-10-06') })[0], /production target/);
});

test('W0-1: a target that doesn\'t declare production: false counts as production (deny by default)', () => {
    const undeclared = { id: 7, name: 'New', confirmation: ['typed', 'nonprod'] };
    assert.match(confirmNonprodRefusals({ options: agent({ channel: 7, confirmNonprod: 7 }), target: undeclared, phase: on('2026-10-06') })[0], /production target/);
});

test('W0-1: a non-production target that takes only the typed confirmation refuses the flag', () => {
    const typedOnly = { ...CA_TARGET, confirmation: ['typed'] };
    assert.deepEqual(confirmNonprodRefusals({ options: agent(), target: typedOnly, phase: on('2026-10-06') }), [
        'channel 1895766 (ReelFlies_CA) takes only the typed confirmation',
    ]);
});

test('W0-1: the flag is refused when its value isn\'t --channel, or with --overwrite-live or --first-release, checked again here', () => {
    const phase = on('2026-10-06');
    assert.match(confirmNonprodRefusals({ options: agent({ confirmNonprod: 1 }), target: CA_TARGET, phase })[0], /--confirm-nonprod 1 isn't --channel 1895766/);
    assert.match(confirmNonprodRefusals({ options: agent({ overwriteLive: true }), target: CA_TARGET, phase })[0], /--overwrite-live.*a person/);
    assert.match(confirmNonprodRefusals({ options: agent({ firstRelease: true }), target: CA_TARGET, phase })[0], /--first-release.*a person/);
});

test('W0-1: a production target never queues a paired channel-1 release: it is channel 1', () => {
    assert.equal(pairedChannel1Release({ target: CHANNEL_1, phase: on('2027-02-03') }), null);
});

// Step 5's confirmation: the typed prompt without the flag, and none with it.

test('W0-1: without the flag, step 5 asks for the typed channel id exactly as before, and no terminal still stops the release', async () => {
    const typed = () => confirmChannel({ channel: 1895766, question: 'Type the channel id: ', ...terminal(false) });
    const confirm = pushConfirmation({
        options: agent({ confirmNonprod: null }), target: CA_TARGET, phase: () => on('2026-10-06'), typed,
    });
    assert.equal(confirm, typed);
    await assert.rejects(confirm(), /needs an operator at a terminal/);
});

test('W0-1: with the flag, step 5 asks nothing and reads no stdin, and the gate still runs in full', async () => {
    let typedAsked = false;
    const confirm = pushConfirmation({
        options: agent(),
        target: CA_TARGET,
        phase: () => on('2026-10-06'),
        typed: async () => {
            typedAsked = true;
        },
    });
    const store = capture();
    const result = await pushGate({
        confirm,
        capture: async () => capture({ saved: { rf_quick_add: false } }),
        step1: store,
        git: { step1: { sha: SHA, dirty: false }, read: () => ({ sha: SHA, dirty: true }) },
        bundle: { step4: ZIP, read: () => ({ bytes: ZIP.bytes, sha256: 'ff99' }) },
    });
    assert.equal(typedAsked, false);
    assert.deepEqual(result.problems, [
        'the git tree has uncommitted changes now',
        `${ZIP.file} changed after step 4 checked it: sha256 ab12 then, ff99 now`,
        'the saved Theme Styles changed since step 1: rf_quick_add',
        'the published Theme Styles changed since step 1: rf_quick_add',
    ]);
});

test('W0-1: with the flag, step 5 checks the calendar again, so a release that runs past midnight into T-21 stops before the push', async () => {
    const confirm = pushConfirmation({
        options: agent(), target: CA_TARGET, phase: () => on('2027-02-08'), typed: async () => {},
    });
    let captured = false;
    await assert.rejects(pushGate({
        confirm,
        capture: async () => {
            captured = true;
            return capture();
        },
        step1: capture(),
        git: { step1: { sha: SHA, dirty: false }, read: () => ({ sha: SHA, dirty: false }) },
        bundle: { step4: ZIP, read: () => ({ bytes: ZIP.bytes, sha256: ZIP.sha256 }) },
    }), /--confirm-nonprod refused at step 5: .*T-21/);
    assert.equal(captured, false, 'nothing is captured or pushed after the refusal');
});
