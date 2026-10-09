// Theme modules as one browser script, for a fixture page (W0-9), which loads no theme bundle
// (render/widget-layout.html). A spec that needs a module's real code in the page, such as ticket
// 41's cart-groups.js sorting the cart's rows, injects this with page.addScriptTag:
//
//   const content = themeScript(['reelflies/hook-order', 'reelflies/cart-groups'],
//       "modules['reelflies/cart-groups'].sortCartRows(document);");
//   await page.addScriptTag({ content });
//
// - Each module, named by its path under assets/js/theme without .js, is turned into CommonJS by
//   Babel (only the module syntax changes) and wrapped in a function, in the order given.
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

function commonJs(name) {
    const file = path.join(JS_ROOT, `${name}.js`);
    if (!fs.existsSync(file)) throw new Error(`no theme module assets/js/theme/${name}.js`);
    return babel.transformFileSync(file, {
        // The theme's own preset, a direct dependency, kept to modules: the page is a current
        // Chromium, so nothing else needs rewriting.
        babelrc: false, configFile: false, presets: [['@babel/preset-env', { modules: 'commonjs', targets: { chrome: '120' } }]],
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
