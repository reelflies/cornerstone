// Theme modules as one browser script, for a fixture page (W0-9), which loads no theme bundle
// (render/widget-layout.html). A spec that needs a module's real code in the page, such as ticket
// 41's cart-groups.js sorting the cart's rows, injects this with page.addScriptTag:
//
//   const content = themeScript(['reelflies/hook-order', 'reelflies/cart-groups'],
//       "modules['reelflies/cart-groups'].sortCartRows(document);");
//   await page.addScriptTag({ content });
//
// - Each module, named by its path under assets/js/theme without .js, is built as the theme bundle
//   builds it, with webpack.common.js's own Babel options (loose mode and its assumptions, for the
//   browsers in package.json's browserslist), then turned into CommonJS, with no core-js imports,
//   and wrapped in a function, in the order given. A module that only breaks in the bundle's
//   build, such as a loose-mode spread, breaks here too, where Jest's Node build would pass it.
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

// The theme bundle's Babel options: babel-loader's in webpack.common.js.
export function bundleBabelOptions() {
    const common = require('../../../webpack.common');
    const { options } = common.module.rules.map(rule => rule.use).find(use => use && use.loader === 'babel-loader');
    const [[, env]] = options.presets.filter(([name]) => name === '@babel/preset-env');
    return { assumptions: options.assumptions, env };
}

function commonJs(name) {
    const file = path.join(JS_ROOT, `${name}.js`);
    if (!fs.existsSync(file)) throw new Error(`no theme module assets/js/theme/${name}.js`);
    const { assumptions, env } = bundleBabelOptions();
    const { useBuiltIns, corejs, ...rest } = env; // eslint-disable-line no-unused-vars
    return babel.transformFileSync(file, {
        babelrc: false,
        configFile: false,
        cwd: THEME_DIR,
        assumptions,
        presets: [['@babel/preset-env', { ...rest, modules: 'commonjs', useBuiltIns: false }]],
    }).code;
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
