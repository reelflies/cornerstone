// The gauge's geometry: the calibration it is drawn from, its scale, and its two layouts
// (ticket 35; CD-12 for the home band, which ticket 49 places).
//
//   node --test scripts/hook-gauge/geometry.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_SIZES, CHART_URL } from './sizes.mjs';
import {
    LAYOUTS, calibrationProblems, fitScale, hookBox, readCalibration, rowWidth,
} from './geometry.mjs';

const calibration = readCalibration();
const { lengths } = calibration;

describe('the calibration', () => {
    it('has a length for every chart size, and says where it came from', () => {
        // A plain object lists integer-like keys first, so compare the sets, not the order.
        assert.deepEqual(Object.keys(lengths).sort(), [...CHART_SIZES].sort());
        assert.equal(calibration.unit, 'mm');
        assert.ok(['provisional', 'checked'].includes(calibration.status));
        assert.match(calibration.source, /\S/);
        assert.deepEqual(calibrationProblems(calibration), []);
    });

    it('draws a bigger number as a smaller hook, and 1/0 to 6/0 as bigger than 1 (story 15)', () => {
        for (let i = 1; i < CHART_SIZES.length; i += 1) {
            const [bigger, smaller] = [CHART_SIZES[i - 1], CHART_SIZES[i]];
            assert.ok(lengths[bigger] > lengths[smaller], `${bigger} (${lengths[bigger]}) should be longer than ${smaller} (${lengths[smaller]})`);
        }
    });

    it('names each problem with a calibration it refuses', () => {
        const { 14: fourteen, ...missing14 } = lengths;
        assert.equal(fourteen, lengths['14']);
        assert.deepEqual(calibrationProblems({ ...calibration, lengths: missing14 }), ['no length for 14']);
        assert.deepEqual(calibrationProblems({ ...calibration, lengths: { ...lengths, 12: 9 } }), [
            '12 (9 mm) must be longer than 14 (10.5 mm): a bigger number is a smaller hook, and 1/0 to 6/0 are bigger than 1',
        ]);
        assert.deepEqual(calibrationProblems({ ...calibration, lengths: { ...lengths, '1/0': 25 } }), [
            '1/0 (25 mm) must be longer than 1 (26 mm): a bigger number is a smaller hook, and 1/0 to 6/0 are bigger than 1',
        ]);
        assert.deepEqual(calibrationProblems({ ...calibration, lengths: { ...lengths, 24: 0 } }), ['24 must be a positive number of mm, not 0']);
        assert.deepEqual(calibrationProblems({ ...calibration, lengths: { ...lengths, 26: 4 } }), ['26 isn\'t a chart size']);
        assert.deepEqual(calibrationProblems({ ...calibration, unit: 'in' }), ['the unit must be mm, not in']);
        assert.deepEqual(calibrationProblems({ ...calibration, status: 'final' }), ['the status must be provisional or checked, not final']);
    });
});

describe('hookBox', () => {
    it('draws every hook to one scale: the widths keep the lengths\' ratios', () => {
        for (const { k } of Object.values(LAYOUTS)) {
            for (const scale of Object.values(k)) {
                const widths = CHART_SIZES.map(size => hookBox(lengths[size], scale).width);
                CHART_SIZES.forEach((size, i) => {
                    // Rounded to 0.1 px, so within 0.05 px of the exact width.
                    assert.ok(Math.abs(widths[i] - lengths[size] * scale) <= 0.05 + 1e-9, `${size} at ${scale} px/mm`);
                });
            }
        }
    });

    it('keeps the hook drawing\'s 2:1 box', () => {
        assert.deepEqual(hookBox(42, 2.6), { width: 109.2, height: 54.6 });
        assert.deepEqual(hookBox(5, 2.1), { width: 10.5, height: 5.3 });
    });
});

describe('the layouts', () => {
    it('chart: 6/0 to 1, then 2 to 24, every chart size once, linking to the rows on the same page', () => {
        assert.deepEqual(LAYOUTS.chart.rows, [
            ['6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '1'],
            ['2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'],
        ]);
        assert.deepEqual(LAYOUTS.chart.rows.flat(), CHART_SIZES);
        assert.equal(LAYOUTS.chart.href, '');
    });

    it('band: CD-12\'s two deliberate phone rows, 2/0 to 6 then 8 to 20, linking to the chart page', () => {
        assert.deepEqual(LAYOUTS.band.rows, [
            ['2/0', '1/0', '1', '2', '4', '6'],
            ['8', '10', '12', '14', '16', '18', '20'],
        ]);
        assert.equal(LAYOUTS.band.href, CHART_URL);
    });

    it('band: each phone row fits the 343px column with 44px targets and no sideways scroll (CD-12)', () => {
        for (const row of LAYOUTS.band.rows) {
            const width = rowWidth(row, lengths, LAYOUTS.band.k.phone, { target: 44 });
            assert.ok(width <= 343, `${row.join(' ')}: ${width}px`);
        }
    });

    it('band: at 320px (a 288px column) both phone rows fit at the narrow scale with 36px targets (story 71; for ticket 49)', () => {
        // At the phone scale the first row is too wide for 288px, whatever the targets.
        assert.ok(rowWidth(LAYOUTS.band.rows[0], lengths, LAYOUTS.band.k.phone, { target: 0 }) > 288);
        for (const row of LAYOUTS.band.rows) {
            const width = rowWidth(row, lengths, LAYOUTS.band.k.narrow, { target: 36 });
            assert.ok(width <= 288, `${row.join(' ')}: ${width}px`);
        }
        assert.equal(fitScale(LAYOUTS.band.rows[0], lengths, 288, { target: 36 }), LAYOUTS.band.k.narrow, 'the narrow scale is the largest that fits');
    });

    it('chart: each desktop row fits a 960px column, and no single hook is wider than a 288px phone column, so wrapped rows never scroll', () => {
        for (const row of LAYOUTS.chart.rows) {
            assert.ok(rowWidth(row, lengths, LAYOUTS.chart.k.desktop) <= 960, row.join(' '));
            for (const size of row) assert.ok(hookBox(lengths[size], LAYOUTS.chart.k.phone).width <= 288, size);
        }
    });

    it('band: the phone scales count no side padding on the hook links; with the reference\'s 6px a side they need smaller ones (for ticket 49 and the template PR)', () => {
        const [first] = LAYOUTS.band.rows;
        // The reference's .gauge .hw has 6px of padding a side and no gap between links.
        assert.equal(rowWidth(first, lengths, LAYOUTS.band.k.phone, { pad: 6, gap: 0 }), 380.7);
        assert.equal(fitScale(first, lengths, 343, { pad: 6 }), 1.6);
        assert.equal(fitScale(first, lengths, 288, { pad: 6, target: 36 }), 1.3);
        assert.equal(fitScale(first, lengths, 343), 2.1, 'with no side padding, the phone scale is the largest that fits');
    });

    it('band: its one desktop row, 2/0 to 20, fits a 960px column', () => {
        assert.ok(rowWidth(LAYOUTS.band.rows.flat(), lengths, LAYOUTS.band.k.desktop) <= 960);
    });

    it('fitScale finds the largest scale that fits, in steps of 0.1 px/mm, or null when the targets alone are too wide', () => {
        const few = { 2: 25, 24: 5 };
        // 25k + 44 + 4 <= 98 up to k = 2.0.
        assert.equal(fitScale(['2', '24'], few, 98), 2);
        assert.equal(fitScale(['2', '24'], few, 97.9), 1.9);
        assert.equal(fitScale(['2', '24'], few, 98, { max: 1.5 }), 1.5);
        assert.equal(fitScale(['2', '24'], few, 91), null);
    });

    it('rowWidth counts each hook at its drawn width or the target, whichever is wider, plus the gaps', () => {
        const few = { 2: 25, 24: 5 };
        // 25 * 2 = 50 px, and 5 * 2 = 10 px widened to the 44 px target, plus one 4 px gap.
        assert.equal(rowWidth(['2', '24'], few, 2), 98);
        assert.equal(rowWidth(['2', '24'], few, 2, { target: 0, gap: 0 }), 60);
    });

    it('rowWidth adds each link\'s side padding to its hook before the target, and fitScale counts it', () => {
        const few = { 2: 25, 24: 5 };
        // 50 + 2 * 6 = 62 px, and 10 + 12 = 22 px widened to 44 px, plus one 4 px gap.
        assert.equal(rowWidth(['2', '24'], few, 2, { pad: 6 }), 110);
        // 25k + 12 + 44 + 4 <= 110 up to k = 2.0.
        assert.equal(fitScale(['2', '24'], few, 110, { pad: 6 }), 2);
        assert.equal(fitScale(['2', '24'], few, 109.9, { pad: 6 }), 1.9);
    });
});
