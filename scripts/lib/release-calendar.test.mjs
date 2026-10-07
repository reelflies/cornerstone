import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    CALENDAR_PATH, MILESTONES, describePhase, milestonesFor, parseCalendar, phaseOn, readCalendar, todayInToronto,
} from './release-calendar.mjs';

const FLIP = '2027-03-01';
const calendar = (flip = FLIP, status = 'provisional') => parseCalendar({ flip, status, source: 'ticket 10 comment, 2026-11-02' });

// The committed calendar. Every change to the file changes this pin too, so the diff shows it.
const COMMITTED = {
    flip: '2027-02-16',
    status: 'provisional',
    source: 'ticket 10 comment 2026-10-06: provisional window; Shaun sets the real date after ticket 26\'s re-estimate',
};

test('the committed calendar holds the provisional Flip date from ticket 10\'s lane-G comment', () => {
    assert.equal(CALENDAR_PATH, fileURLToPath(new URL('../release-calendar.json', import.meta.url)));
    assert.deepEqual(JSON.parse(fs.readFileSync(CALENDAR_PATH, 'utf8')), COMMITTED);
    assert.deepEqual(readCalendar(), COMMITTED);
    // The T-dates in ticket 10's 2026-10-06 lane-G comment.
    assert.deepEqual(milestonesFor(readCalendar().flip), {
        'T-35': '2027-01-12',
        'T-28': '2027-01-19',
        'T-21': '2027-01-26',
        'T-14': '2027-02-02',
        'T-0': '2027-02-16',
        'T+30': '2027-03-18',
    });
});

test('the milestones are worked back and forward from the Flip date in calendar days', () => {
    assert.deepEqual(MILESTONES.map(([name]) => name), ['T-35', 'T-28', 'T-21', 'T-14', 'T-0', 'T+30']);
    assert.deepEqual(milestonesFor(FLIP), {
        'T-35': '2027-01-25',
        'T-28': '2027-02-01',
        'T-21': '2027-02-08',
        'T-14': '2027-02-15',
        'T-0': '2027-03-01',
        'T+30': '2027-03-31',
    });
    // Across a year end and a leap day.
    assert.equal(milestonesFor('2028-01-10')['T-14'], '2027-12-27');
    assert.equal(milestonesFor('2028-02-15')['T+30'], '2028-03-16');
});

// [date, phase, confirmNonprod, pairedChannel1Release, widgetEdits, nonP1Tickets]
const PHASES = [
    ['2026-10-06', 'build', true, false, 'all', true],
    ['2027-01-24', 'build', true, false, 'all', true],
    ['2027-01-25', 'T-35', true, false, 'all', true],
    ['2027-01-31', 'T-35', true, false, 'all', true],
    ['2027-02-01', 'T-28', true, true, 'all', true],
    ['2027-02-07', 'T-28', true, true, 'all', true],
    ['2027-02-08', 'T-21', false, true, 'all', false],
    ['2027-02-14', 'T-21', false, true, 'all', false],
    ['2027-02-15', 'T-14', false, true, 'unpublish-only', false],
    ['2027-02-28', 'T-14', false, true, 'unpublish-only', false],
    ['2027-03-01', 'T-0', false, false, 'unpublish-only', false],
    ['2027-03-30', 'T-0', false, false, 'unpublish-only', false],
    ['2027-03-31', 'T+30', false, false, 'unpublish-only', false],
    ['2028-01-01', 'T+30', false, false, 'unpublish-only', false],
];

for (const [date, phase, confirmNonprod, pairedChannel1Release, widgetEdits, nonP1Tickets] of PHASES) {
    test(`on ${date}, with the Flip on ${FLIP}, the phase is ${phase}`, () => {
        const result = phaseOn(calendar(), date);
        assert.equal(result.phase, phase);
        assert.equal(result.date, date);
        assert.deepEqual(result.limits, {
            confirmNonprod, pairedChannel1Release, widgetEdits, nonP1Tickets,
        });
    });
}

test('a phase reports when it started and which milestone comes next', () => {
    const result = phaseOn(calendar(), '2027-02-03');
    assert.equal(result.since, '2027-02-01');
    assert.deepEqual(result.next, { phase: 'T-21', date: '2027-02-08' });
    assert.equal(result.flip, FLIP);
    assert.equal(result.status, 'provisional');
    assert.equal(result.daysToFlip, 26);
    assert.equal(phaseOn(calendar(), '2027-01-01').since, null, 'the build phase has no start milestone');
    assert.equal(phaseOn(calendar(), '2027-04-01').next, null, 'nothing comes after T+30');
});

test('a calendar with no Flip date limits nothing', () => {
    const result = phaseOn(calendar(null), '2027-02-20');
    assert.equal(result.phase, 'unset');
    assert.equal(result.milestones, null);
    assert.equal(result.daysToFlip, null);
    assert.deepEqual(result.limits, {
        confirmNonprod: true, pairedChannel1Release: false, widgetEdits: 'all', nonP1Tickets: true,
    });
});

test('a provisional date limits exactly as a set one does, and both say which they are', () => {
    const provisional = phaseOn(calendar(FLIP, 'provisional'), '2027-02-10');
    const set = phaseOn(calendar(FLIP, 'set'), '2027-02-10');
    assert.deepEqual(provisional.limits, set.limits);
    assert.match(describePhase(provisional), /provisional/);
    assert.match(describePhase(set), /\bset\b/);
    assert.doesNotMatch(describePhase(set), /provisional/);
});

test('the summary line names the Flip, the phase, its start and the next milestone', () => {
    const line = describePhase(phaseOn(calendar(), '2027-02-10'));
    assert.match(line, /Flip 2027-03-01 \(provisional; ticket 10 comment, 2026-11-02\)/);
    assert.match(line, /T-21 \(code freeze/);
    assert.match(line, /since 2027-02-08/);
    assert.match(line, /next: T-14 on 2027-02-15/);
    assert.match(describePhase(phaseOn(calendar(null), '2026-10-06')), /no Flip date yet .*nothing is limited/);
});

test('a bad calendar is refused, so a typo never reads as "no Flip date"', () => {
    const bad = [
        [{ flip: '2027-02-30', status: 'provisional', source: 'x' }, /isn't a real date/],
        [{ flip: '1/3/2027', status: 'provisional', source: 'x' }, /YYYY-MM-DD/],
        [{ flip: null, status: 'set', source: 'x' }, /"set" needs a Flip date/],
        [{ flip: FLIP, status: 'final', source: 'x' }, /status/],
        [{ flip: FLIP, status: 'set', source: '' }, /source/],
        [{ flip: FLIP, status: 'set' }, /source/],
        [{
            flipDate: FLIP, flip: null, status: 'provisional', source: 'x',
        }, /unknown key "flipDate"/],
        [{ status: 'provisional', source: 'x' }, /"flip"/],
        [[], /an object/],
    ];
    for (const [input, reason] of bad) assert.throws(() => parseCalendar(input), reason, JSON.stringify(input));
});

test('readCalendar names the file when it is missing or not JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-calendar-'));
    try {
        assert.throws(() => readCalendar(path.join(dir, 'missing.json')), /missing\.json/);
        const broken = path.join(dir, 'broken.json');
        fs.writeFileSync(broken, '{"flip": null,');
        assert.throws(() => readCalendar(broken), /broken\.json.*JSON/);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('phaseOn refuses a date that is not YYYY-MM-DD', () => {
    assert.throws(() => phaseOn(calendar(), '2027-2-1'), /YYYY-MM-DD/);
});

test('today is the date in Toronto, where the store is', () => {
    assert.equal(todayInToronto(new Date('2026-10-07T03:30:00Z')), '2026-10-06'); // 23:30 EDT
    assert.equal(todayInToronto(new Date('2026-10-07T04:30:00Z')), '2026-10-07'); // 00:30 EDT
    assert.equal(todayInToronto(new Date('2027-01-15T04:59:00Z')), '2027-01-14'); // 23:59 EST
});

test('the command prints the phase for a date, and --json the whole result', () => {
    const script = fileURLToPath(new URL('./release-calendar.mjs', import.meta.url));
    const text = spawnSync(process.execPath, [script, '--date', '2026-10-06'], { encoding: 'utf8' });
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^Release calendar: Flip 2027-02-16 \(provisional; ticket 10 comment 2026-10-06/);
    assert.match(text.stdout, /2026-10-06 is in build \(building, before code complete\); next: T-35 on 2027-01-12\./);
    assert.match(text.stdout, /^ {2}T-21 {2}2027-01-26$/m);
    const json = spawnSync(process.execPath, [script, '--date', '2026-10-06', '--json'], { encoding: 'utf8' });
    assert.equal(json.status, 0, json.stderr);
    assert.equal(JSON.parse(json.stdout).phase, 'build');
    assert.equal(JSON.parse(json.stdout).daysToFlip, 133);
    const bad = spawnSync(process.execPath, [script, '--date', 'tomorrow'], { encoding: 'utf8' });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /YYYY-MM-DD/);
});
