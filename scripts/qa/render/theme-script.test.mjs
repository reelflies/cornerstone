// Tests render/theme-script.mjs: theme modules as one script for a fixture page (ticket 41), built
// with the theme bundle's Babel options; and those options, and babel.config.js's, spreading a
// NodeList, a Set or a Map whole, which loose mode alone made [x] (ticket 41's follow-up).
//
//   node --test scripts/qa/render/theme-script.test.mjs

import path from 'path';
import { createRequire } from 'module';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { THEME_DIR } from './render.mjs';
import { bundleBabelOptions, fixtureBabelOptions, themeScript } from './theme-script.mjs';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

const run = (names, code) => {
    const sandbox = { result: null };
    vm.runInNewContext(themeScript(names, code), sandbox);
    return sandbox.result;
};

test('runs a module with its listed import, as the theme bundle would', () => {
    const order = run(['reelflies/hook-order', 'reelflies/cart-groups'], "result = modules['reelflies/cart-groups'].rowOrder(['14', '12', '16']);");
    assert.deepEqual(JSON.parse(JSON.stringify(order)), [1, 0, 2]);
});

test('fails loudly on an import that isn\'t listed, and on a module that doesn\'t exist', () => {
    assert.throws(() => run(['reelflies/cart-groups'], ''), /reelflies\/cart-groups requires \.\/hook-order, which isn't a listed module/);
    assert.throws(() => themeScript(['reelflies/nothing-here']), /no theme module assets\/js\/theme\/reelflies\/nothing-here\.js/);
});

// What each build makes of spreads, destructuring and for…of over iterables that aren't arrays.
const SPREADS = `module.exports = function (list, set, map) {
    var out = [];
    for (var item of set) out.push(item);
    var [first, ...rest] = list;
    return { list: [...list], set: [...set], map: [...map.keys()], first, rest, loop: out };
};`;
// A NodeList as the page has one: indexed, with a length and an iterator, but not an array.
const nodeList = (...items) => Object.assign(Object.create({ [Symbol.iterator]: Array.prototype[Symbol.iterator] }), items, { length: items.length });
const runCompiled = code => {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: () => ({}) });
    const result = module.exports(nodeList('a', 'b'), new Set(['c', 'd']), new Map([['e', 1]]));
    return JSON.parse(JSON.stringify(result));
};
const WHOLE = {
    list: ['a', 'b'], set: ['c', 'd'], map: ['e'], first: 'a', rest: ['b'], loop: ['c', 'd'],
};

test('the bundle\'s Babel options, as babel-loader resolves them, are loose with babel.config.js\'s assumption', () => {
    const { assumptions, env } = bundleBabelOptions();
    assert.equal(env.loose, true);
    assert.deepEqual(assumptions, { iterableIsArray: false });
});

test('a fixture page\'s modules, built with those options, spread, destructure and loop over a NodeList, a Set and a Map whole', () => {
    const options = fixtureBabelOptions();
    assert.deepEqual(options.assumptions, bundleBabelOptions().assumptions);
    const { code } = babel.transformSync(SPREADS, { ...options, filename: 'probe.js' });
    assert.doesNotMatch(code, /\[\]\.concat\(/);
    assert.deepEqual(runCompiled(code), WHOLE);
});

test('so does babel.config.js, which the theme\'s own builds read', () => {
    const { code } = babel.transformSync(SPREADS, {
        cwd: THEME_DIR, filename: path.join(THEME_DIR, 'assets/js/theme/probe.js'), envName: 'production', babelrc: false, configFile: path.join(THEME_DIR, 'babel.config.js'),
    });
    assert.doesNotMatch(code, /\[\]\.concat\(/);
    assert.deepEqual(runCompiled(code), WHOLE);
});

test('without the assumption, loose mode spreads a NodeList as one element, the bug this guards', () => {
    const { assumptions, ...options } = fixtureBabelOptions();
    const { code } = babel.transformSync(SPREADS, { ...options, filename: 'probe.js' });
    assert.match(code, /\[\]\.concat\(list\)/);
});

test('themeScript builds each module with fixtureBabelOptions: a module\'s spread goes through the iterator helper', () => {
    // open-state.js spreads an array; with loose mode alone that would be [].concat(tokens).
    const script = themeScript(['reelflies/open-state']);
    assert.match(script, /_toConsumableArray\(tokens\)/);
    assert.doesNotMatch(script, /\[\]\.concat\(tokens/);
});
