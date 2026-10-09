// Theme modules as one browser script, for a fixture page (W0-9), which loads no theme bundle
// (render/widget-layout.html). A spec that needs a module's real code in the page, such as ticket
// 41's cart-groups.js sorting the cart's rows, injects this with page.addScriptTag:
//
//   const content = themeScript(['reelflies/hook-order', 'reelflies/cart-groups'],
//       "modules['reelflies/cart-groups'].sortCartRows(document);");
//   await page.addScriptTag({ content });
//
// - Each module, named by its path under assets/js/theme without .js, is built as the theme bundle
//   builds it (fixtureBabelOptions): the Babel options babel-loader resolves, webpack.common.js's
//   own merged with the root babel.config.js, so loose mode and its assumptions, for preset-env's
//   default targets (the repo sets no browserslist). Then it is turned into CommonJS, with no
//   core-js imports, and wrapped in a function, in the order given. A module that only breaks in
//   the bundle's build, such as a loose-mode spread, breaks here too, where Jest's Node build
//   would pass it.
// - A module's `require('./x')` finds another listed module by its path; anything else throws,
//   so a module whose imports aren't listed fails loudly rather than half-working.
// - `run` is code that runs last, with `modules` holding each module's exports by name.

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { THEME_DIR } from './render.mjs';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

const JS_ROOT = path.join(THEME_DIR, 'assets/js/theme');

// The theme bundle's Babel options, as babel-loader resolves them: webpack.common.js's loader
// options merged with the root babel.config.js, whose assumptions they carry.
export function bundleBabelOptions() {
    const common = createRequire(import.meta.url)(path.join(THEME_DIR, 'webpack.common.js'));
    const loader = common.module.rules.map(rule => rule.use).find(use => use && use.loader === 'babel-loader');
    if (!loader) throw new Error('webpack.common.js has no babel-loader rule: render/theme-script.mjs builds as the bundle does, so update bundleBabelOptions() with it');
    const { options } = babel.loadPartialConfig({ ...loader.options, cwd: THEME_DIR, filename: path.join(THEME_DIR, 'assets/js/app.js') });
    const env = options.presets.find(item => item.file && item.file.request === '@babel/preset-env');
    if (!env) throw new Error('the bundle\'s Babel options have no @babel/preset-env: update bundleBabelOptions() with webpack.common.js');
    return { assumptions: options.assumptions, env: env.options };
}

// What a fixture page's modules are built with: the bundle's preset-env options and assumptions,
// with CommonJS for themeScript's wrapper and no core-js imports, which the page couldn't load.
export function fixtureBabelOptions() {
    const { assumptions, env } = bundleBabelOptions();
    const { useBuiltIns, corejs, ...rest } = env;
    return {
        babelrc: false, configFile: false, cwd: THEME_DIR, assumptions, presets: [['@babel/preset-env', { ...rest, modules: 'commonjs' }]],
    };
}

function commonJs(name) {
    const file = path.join(JS_ROOT, `${name}.js`);
    if (!fs.existsSync(file)) throw new Error(`no theme module assets/js/theme/${name}.js`);
    return babel.transformFileSync(file, fixtureBabelOptions()).code;
}

export function themeScript(names, run = '') {
    const wrapped = names.map(name => `
    (function (exports, require) {
${commonJs(name)}
    })(modules[${JSON.stringify(name)}] = {}, function (request) {
        var target = (${JSON.stringify(path.posix.dirname(name))} + '/' + request).split('/').reduce(function (parts, part) {
            if (part === '..') parts.pop(); else if (part !== '.' && part !== '') parts.push(part);
            return parts;
        }, []).join('/');
        if (!(target in modules)) throw new Error(${JSON.stringify(`${name} requires `)} + request + ', which isn\\'t a listed module');
        return modules[target];
    });`).join('\n');
    return `(function () {\n    var modules = {};\n${wrapped}\n    ${run}\n})();\n`;
}
