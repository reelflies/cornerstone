import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes } from './format.mjs';

test('a byte count is written in full, with en-CA digit grouping and a B unit', () => {
    assert.equal(formatBytes(0), '0 B');
    assert.equal(formatBytes(999), '999 B');
    assert.equal(formatBytes(307607), '307,607 B');
    assert.equal(formatBytes(9876543), '9,876,543 B');
});
