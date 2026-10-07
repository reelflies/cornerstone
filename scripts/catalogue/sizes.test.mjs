// Tests scripts/catalogue/sizes.mjs (ticket 18): reading Fly Sizes labels, the aught rename and hook order.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compareHook, hookLabel, hookOrder, isSuspectSize, parseHookSize,
} from './sizes.mjs';

test('plain hook numbers and both spellings of aught sizes are read', () => {
    assert.deepEqual(parseHookSize('12'), { kind: 'number', n: 12 });
    assert.deepEqual(parseHookSize(' 4 '), { kind: 'number', n: 4 });
    assert.deepEqual(parseHookSize('2-0'), { kind: 'aught', n: 2 });
    assert.deepEqual(parseHookSize('6/0'), { kind: 'aught', n: 6 });
    assert.equal(parseHookSize('XL'), null);
    assert.equal(parseHookSize('#12'), null);
    assert.equal(parseHookSize('0'), null);
    assert.equal(parseHookSize('2-1'), null);
    assert.equal(parseHookSize(''), null);
    assert.equal(parseHookSize(undefined), null);
});

test('the aught sizes are renamed 1/0 to 6/0, and every other label stays as it is', () => {
    assert.equal(hookLabel('1-0'), '1/0');
    assert.equal(hookLabel('6-0'), '6/0');
    assert.equal(hookLabel('2/0'), '2/0');
    assert.equal(hookLabel('14'), '14');
    assert.equal(hookLabel('XL'), 'XL');
});

test('hook order puts the largest hook first: 6/0 … 1/0, then 1, 2, 4 … 24', () => {
    const labels = ['10', '2-0', '1', '24', '6-0', '8', '1-0', '2', '4'];
    assert.deepEqual([...labels].sort(compareHook), ['6-0', '2-0', '1-0', '1', '2', '4', '8', '10', '24']);
});

test('hookOrder keeps the current order for labels it can\'t read, after the sizes it can', () => {
    assert.deepEqual(hookOrder(['12', 'odd', '8', '2-0']), ['2-0', '8', '12', 'odd']);
    assert.deepEqual(hookOrder(['b', 'a']), ['b', 'a']);
});

test('sizes that no hook has are suspect: odd numbers above 1 and anything past 28', () => {
    assert.equal(isSuspectSize('32'), true);
    assert.equal(isSuspectSize('33'), true);
    assert.equal(isSuspectSize('13'), true);
    assert.equal(isSuspectSize('1'), false);
    assert.equal(isSuspectSize('28'), false);
    assert.equal(isSuspectSize('5-0'), false);
    assert.equal(isSuspectSize('XL'), false);
});
