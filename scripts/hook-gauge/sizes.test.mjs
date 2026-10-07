// The hook sizes the chart, the gauge and the rows share (ticket 35).
//
//   node --test scripts/hook-gauge/sizes.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHART_SIZES, FACET_NAME, anchorId, facetParam, isChartSize, normalizeSize,
} from './sizes.mjs';

describe('the chart sizes', () => {
    it('run from 6/0, the biggest hook, down to 1/0, then 1, 2, 4 … 24 (story 16)', () => {
        assert.deepEqual(CHART_SIZES, [
            '6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '1', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24',
        ]);
        assert.ok(Object.isFrozen(CHART_SIZES));
    });

    it('have the anchors fixed with ticket 49: size-6-0 … size-1-0, then size-1 … size-24 (build pipeline 6.9)', () => {
        assert.deepEqual(CHART_SIZES.map(anchorId), [
            'size-6-0', 'size-5-0', 'size-4-0', 'size-3-0', 'size-2-0', 'size-1-0',
            'size-1', 'size-2', 'size-4', 'size-6', 'size-8', 'size-10', 'size-12', 'size-14', 'size-16', 'size-18', 'size-20', 'size-22', 'size-24',
        ]);
    });

    it('refuses an anchor for a size the chart has no row for', () => {
        assert.throws(() => anchorId('26'), /26 isn't a chart size/);
        assert.throws(() => anchorId('2-0'), /2-0 isn't a chart size/);
    });
});

describe('the facet link value', () => {
    it("uses ticket 18's names, URL-encoded as BigCommerce's facet form writes them (SEO-6)", () => {
        assert.equal(FACET_NAME, 'Fly Sizes');
        assert.equal(facetParam('14'), 'Fly+Sizes=14');
        assert.equal(facetParam('2/0'), 'Fly+Sizes=2%2F0');
        assert.equal(facetParam('6/0'), 'Fly+Sizes=6%2F0');
    });
});

describe('normalizeSize', () => {
    it('reads the catalogue spellings of a hook size', () => {
        assert.equal(normalizeSize('14'), '14');
        assert.equal(normalizeSize(' 14 '), '14');
        assert.equal(normalizeSize('#14'), '14');
        assert.equal(normalizeSize('2/0'), '2/0');
        assert.equal(normalizeSize('2 / 0'), '2/0');
        // Before ticket 18's apply, the aught values are written with a hyphen.
        assert.equal(normalizeSize('2-0'), '2/0');
        assert.equal(normalizeSize('#6-0'), '6/0');
        assert.equal(normalizeSize(26), '26');
    });

    it('keeps a size the chart has no row for, so a run can report it', () => {
        assert.equal(normalizeSize('26'), '26');
        assert.equal(normalizeSize('3'), '3');
        assert.equal(isChartSize('26'), false);
        assert.equal(isChartSize('3'), false);
        assert.equal(isChartSize('14'), true);
        assert.equal(isChartSize('2/0'), true);
    });

    it('returns null for a value that is no hook size', () => {
        for (const value of ['', 'Large', '14mm', '0', '014', '7/0x', '1/2', null, undefined]) {
            assert.equal(normalizeSize(value), null, String(value));
        }
    });
});
