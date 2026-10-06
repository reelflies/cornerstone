// The release calendar (W0-13): the Flip date in scripts/release-calendar.json, the
// milestones worked back and forward from it, and the limits each phase puts on agents.
// W0-1 (release.sh's --confirm-nonprod), W0-11 (scripts/store/) and the orchestrator read it.
//
//   import { readCalendar, phaseOn, describePhase } from './lib/release-calendar.mjs';
//   const phase = phaseOn(readCalendar());       // today, in Toronto
//   if (!phase.limits.confirmNonprod) refuse(`${describePhase(phase)}`);
//
//   node scripts/lib/release-calendar.mjs [--date YYYY-MM-DD] [--json]
//
// The file is {"flip": "YYYY-MM-DD" or null, "status": "provisional" or "set", "source": "..."}.
// It is a guarded path: the orchestrator writes the provisional date (lane G, then ticket 26's
// re-estimate) and Shaun sets the real one in ticket 10. docs/guardrails.md has the phases.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { isMain } from './is-main.mjs';

export const CALENDAR_PATH = fileURLToPath(new URL('../release-calendar.json', import.meta.url));

// Milestone -> days from the Flip (tickets 10, 56 and 57).
export const MILESTONES = [
    ['T-35', -35],
    ['T-28', -28],
    ['T-21', -21],
    ['T-14', -14],
    ['T-0', 0],
    ['T+30', 30],
];

const LABELS = {
    unset: 'no Flip date yet',
    build: 'building, before code complete',
    'T-35': 'code complete',
    'T-28': 'channel-1 parity: each agent push to 1895766 queues a paired channel-1 release for Shaun',
    'T-21': 'code freeze: P1 fixes only, and every push is typed by Shaun',
    'T-14': 'content freeze: widgets may only be unpublished, and only P1 pushes',
    'T-0': 'after the Flip: 1895766 is live reelflies.ca, and agents never push to it',
    'T+30': 'after the day-30 review: the freezes stay until ticket 58 lifts them',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = ['flip', 'status', 'source'];
const DAY_MS = 86400000;

function checkDate(value, what) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) throw new Error(`${what} must be a date as YYYY-MM-DD, not ${JSON.stringify(value)}`);
    const time = Date.parse(`${value}T00:00:00Z`);
    if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) throw new Error(`${what} ${value} isn't a real date`);
    return time;
}

const addDays = (date, days) => new Date(checkDate(date, 'the date') + days * DAY_MS).toISOString().slice(0, 10);

// Validates the file's object. A typo must never read as "no Flip date", which limits nothing.
export function parseCalendar(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('the release calendar must be an object');
    const unknown = Object.keys(input).find(key => !KEYS.includes(key));
    if (unknown) throw new Error(`the release calendar has an unknown key "${unknown}" (keys: ${KEYS.join(', ')})`);
    if (!('flip' in input)) throw new Error('the release calendar needs "flip": a date as YYYY-MM-DD, or null');
    if (input.flip !== null) checkDate(input.flip, 'the Flip date');
    if (!['provisional', 'set'].includes(input.status)) throw new Error(`the release calendar's status must be "provisional" or "set", not ${JSON.stringify(input.status)}`);
    if (input.status === 'set' && input.flip === null) throw new Error('a calendar whose status is "set" needs a Flip date');
    if (typeof input.source !== 'string' || !input.source.trim()) throw new Error('the release calendar needs a "source": the ticket 10 comment that gave the date');
    return { flip: input.flip, status: input.status, source: input.source };
}

export function readCalendar(file = CALENDAR_PATH) {
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch (error) {
        throw new Error(`can't read the release calendar ${file}: ${error.code || error.message}`);
    }
    let json;
    try {
        json = JSON.parse(text);
    } catch (error) {
        throw new Error(`the release calendar ${file} isn't valid JSON: ${error.message}`);
    }
    return parseCalendar(json);
}

export function milestonesFor(flip) {
    return Object.fromEntries(MILESTONES.map(([name, days]) => [name, addDays(flip, days)]));
}

// Today's date where the store is. A phase starts at midnight in Toronto on its milestone.
export function todayInToronto(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
}

// The limits only tighten as the dates pass. Lifting one after T+30 is a code change (ticket 58).
function limitsFor(phase) {
    const reached = name => phase !== 'unset' && phase !== 'build' && MILESTONES.findIndex(([m]) => m === phase) >= MILESTONES.findIndex(([m]) => m === name);
    return {
        // W0-1: release.sh --confirm-nonprod is refused from T-21 (and so after the Flip too).
        confirmNonprod: !reached('T-21'),
        // W0-1: from T-28 until the Flip, each agent push to 1895766 adds a "paired channel-1
        // release pending" row for Shaun (ticket 56).
        pairedChannel1Release: reached('T-28') && !reached('T-0'),
        // W0-11: from T-14, widgets may only be unpublished (ticket 57).
        widgetEdits: reached('T-14') ? 'unpublish-only' : 'all',
        // The orchestrator: no new non-P1 tickets from T-21.
        nonP1Tickets: !reached('T-21'),
    };
}

export function phaseOn(calendar, date = todayInToronto()) {
    checkDate(date, 'the date');
    if (calendar.flip === null) {
        return {
            date, flip: null, status: calendar.status, source: calendar.source, phase: 'unset', label: LABELS.unset, since: null, next: null, milestones: null, daysToFlip: null, limits: limitsFor('unset'),
        };
    }
    const milestones = milestonesFor(calendar.flip);
    const passed = MILESTONES.filter(([name]) => milestones[name] <= date);
    const phase = passed.length ? passed.at(-1)[0] : 'build';
    const upcoming = MILESTONES.find(([name]) => milestones[name] > date);
    return {
        date,
        flip: calendar.flip,
        status: calendar.status,
        source: calendar.source,
        phase,
        label: LABELS[phase],
        since: phase === 'build' ? null : milestones[phase],
        next: upcoming ? { phase: upcoming[0], date: milestones[upcoming[0]] } : null,
        milestones,
        daysToFlip: Math.round((checkDate(calendar.flip, 'the Flip date') - checkDate(date, 'the date')) / DAY_MS),
        limits: limitsFor(phase),
    };
}

// One line for the push summary, the store helper and the orchestrator.
export function describePhase(result) {
    if (result.phase === 'unset') {
        return `Release calendar: no Flip date yet (${result.status}; ${result.source}), so nothing is limited.`;
    }
    const since = result.since ? ` since ${result.since}` : '';
    const next = result.next ? `; next: ${result.next.phase} on ${result.next.date}` : '';
    return `Release calendar: Flip ${result.flip} (${result.status}; ${result.source}). ${result.date} is in ${result.phase} (${result.label})${since}${next}.`;
}

function main(argv) {
    const json = argv.includes('--json');
    const dateIndex = argv.indexOf('--date');
    const unknown = argv.filter((arg, i) => arg !== '--json' && arg !== '--date' && !(dateIndex >= 0 && i === dateIndex + 1));
    if (unknown.length || (dateIndex >= 0 && !argv[dateIndex + 1])) {
        console.error('usage: node scripts/lib/release-calendar.mjs [--date YYYY-MM-DD] [--json]');
        process.exit(2);
    }
    try {
        const result = phaseOn(readCalendar(), dateIndex >= 0 ? argv[dateIndex + 1] : todayInToronto());
        console.log(json ? JSON.stringify(result, null, 2) : describePhase(result));
        if (!json && result.milestones) {
            for (const [name] of MILESTONES) console.log(`  ${name.padEnd(5)} ${result.milestones[name]}${name === result.phase ? '  <- now' : ''}`);
        }
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        process.exit(1);
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2));
