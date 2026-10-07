// The hook gauge's geometry (ticket 35): the calibration it is drawn from, the scale, and its
// two layouts. scripts/hook-gauge/gauge.mjs turns these into markup, and generate.mjs writes
// templates/components/reelflies/hook-gauge.html from it.
//
// - The calibration (calibration.json) gives each chart size's length in mm. Every hook is the
//   same drawing at one scale, k px per mm, so the drawn widths keep the lengths' ratios: the
//   gauge is drawn to relative scale, not actual size. Shaun checks it against the Mustad chart.
// - LAYOUTS: "chart" is the chart page's gauge (6/0 to 1, then 2 to 24, each hook linking to its
//   row on the same page). "band" is the home band's (ticket 49; CD-12): 2/0 to 6, then 8 to
//   20, linking to the chart page's rows. Each layout's scales are what the style layer sizes
//   the hooks with; the tests prove the rows fit their columns at them.

import fs from 'fs';
import { fileURLToPath } from 'url';
import { CHART_SIZES, isChartSize } from './sizes.mjs';

export const CALIBRATION_FILE = fileURLToPath(new URL('./calibration.json', import.meta.url));
const STATUSES = ['provisional', 'checked'];

// The hook drawing, from the reference design's #hook symbol: the eye on the right, the shank,
// the bend on the left, then the point and the barb. A hook's length is the box's width, so a
// hook of L mm at k px/mm is L * k px wide and half that high. The stroke stays 1.6 px at any
// size (vector-effect: non-scaling-stroke), as in the reference.
export const HOOK = Object.freeze({
    viewBox: '0 3 100 50',
    aspect: 0.5,
    eye: Object.freeze({ cx: 93, cy: 9, r: 4.6 }),
    path: 'M88.4 9H26A21 21 0 0 0 26 51L54 40.5L47.6 46.6',
    strokeWidth: 1.6,
});

const freezeRows = rows => Object.freeze(rows.map(row => Object.freeze(row)));

// k is in px per mm: desktop, phone (a 343px column at 375), and narrow (a 288px column at 320,
// story 71) where a layout needs one. The values are the reference design's (.chart-gauge,
// .gband and their phone rules), except band.narrow, which is the largest that fits at 320.
export const LAYOUTS = Object.freeze({
    chart: Object.freeze({
        rows: freezeRows([['6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '1'], ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24']]),
        href: '',
        k: Object.freeze({ desktop: 2.6, phone: 2.1 }),
    }),
    band: Object.freeze({
        rows: freezeRows([['2/0', '1/0', '1', '2', '4', '6'], ['8', '10', '12', '14', '16', '18', '20']]),
        href: '/fly-hook-size-chart/',
        k: Object.freeze({ desktop: 3, phone: 2.1, narrow: 1.7 }),
    }),
});

const isLength = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

// Everything wrong with a calibration, as sentences; empty when it can be drawn.
export function calibrationProblems(calibration) {
    const problems = [];
    const { unit, status, lengths = {} } = calibration;
    if (unit !== 'mm') problems.push(`the unit must be mm, not ${unit}`);
    if (!STATUSES.includes(status)) problems.push(`the status must be ${STATUSES.join(' or ')}, not ${status}`);
    for (const key of Object.keys(lengths)) {
        if (!isChartSize(key)) problems.push(`${key} isn't a chart size`);
    }
    for (const size of CHART_SIZES) {
        if (!(size in lengths)) problems.push(`no length for ${size}`);
        else if (!isLength(lengths[size])) problems.push(`${size} must be a positive number of mm, not ${lengths[size]}`);
    }
    for (let i = 1; i < CHART_SIZES.length; i += 1) {
        const [bigger, smaller] = [CHART_SIZES[i - 1], CHART_SIZES[i]];
        const [long, short] = [lengths[bigger], lengths[smaller]];
        if (isLength(long) && isLength(short) && !(long > short)) {
            problems.push(`${bigger} (${long} mm) must be longer than ${smaller} (${short} mm): a bigger number is a smaller hook, and 1/0 to 6/0 are bigger than 1`);
        }
    }
    return problems;
}

export function checkCalibration(calibration) {
    const problems = calibrationProblems(calibration);
    if (problems.length) throw new Error(`the hook gauge calibration can't be drawn:\n- ${problems.join('\n- ')}`);
    return calibration;
}

export function readCalibration(file = CALIBRATION_FILE) {
    let calibration;
    try {
        calibration = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        throw new Error(`can't read the hook gauge calibration ${file}: ${error.message}`);
    }
    return checkCalibration(calibration);
}

const round1 = value => Math.round(value * 10) / 10;

// The drawn box, in px, of a hook `length` mm long at k px/mm.
export function hookBox(length, k) {
    return { width: round1(length * k), height: round1(length * k * HOOK.aspect) };
}

// A row's width in px: each hook at its drawn width or the tap target, whichever is wider,
// plus the gaps between them.
export function rowWidth(sizes, lengths, k, { target = 44, gap = 4 } = {}) {
    const items = sizes.map(size => Math.max(hookBox(lengths[size], k).width, target));
    return round1(items.reduce((sum, width) => sum + width, 0) + gap * Math.max(sizes.length - 1, 0));
}

// The largest scale, in steps of 0.1 px/mm and at most `max`, at which the row fits `column`
// px, or null when the targets alone are too wide.
export function fitScale(sizes, lengths, column, { target = 44, gap = 4, max = 10 } = {}) {
    if (rowWidth(sizes, lengths, 0, { target, gap }) > column) return null;
    for (let tenths = Math.floor(max * 10); tenths > 0; tenths -= 1) {
        if (rowWidth(sizes, lengths, tenths / 10, { target, gap }) <= column) return tenths / 10;
    }
    return null;
}
