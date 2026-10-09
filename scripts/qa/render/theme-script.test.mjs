// Tests render/theme-script.mjs: theme modules as one script for a fixture page (ticket 41).
//
//   node --test scripts/qa/render/theme-script.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { themeScript } from './theme-script.mjs';

const run = (names, code) => {
    const sandbox = { result: null };
    vm.runInNewContext(themeScript(names, code), sandbox);
    return sandbox.result;
};

test('runs a module with its listed import, as the theme bundle would', () => {
    const groups = run(['reelflies/hook-order', 'reelflies/cart-groups'],
        "result = modules['reelflies/cart-groups'].groupCartLines([{ productId: '1', size: '14' }, { productId: '1', size: '12' }]);");
    assert.deepEqual(JSON.parse(JSON.stringify(groups)), [{ productId: '1', lines: [1, 0], pricesVary: false }]);
});

test('fails loudly on an import that isn\'t listed, and on a module that doesn\'t exist', () => {
    assert.throws(() => run(['reelflies/cart-groups'], ''), /reelflies\/cart-groups requires \.\/hook-order, which isn't a listed module/);
    assert.throws(() => themeScript(['reelflies/nothing-here']), /no theme module assets\/js\/theme\/reelflies\/nothing-here\.js/);
});
