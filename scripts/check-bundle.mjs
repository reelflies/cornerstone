#!/usr/bin/env node
// Checks a built theme before it ships. Run after `npm run build` and `npx stencil bundle`.
//
//   node scripts/check-bundle.mjs <bundle.zip>
//
// - Warns when theme-bundle.main.js is over MAIN_JS_BUDGET. Stock 6.22.0 is 307,607 B;
//   lower the budget as the skin work trims the bundle.
// - Fails when config.json is over CONFIG_LIMIT (the store rejects larger uploads).
// - Fails when the zip contains the bundle analyser's report or a secrets file.

import { execFileSync } from 'child_process';
import fs from 'fs';

const MAIN_JS_BUDGET = 310 * 1024;
const CONFIG_LIMIT = 64000; // the handoff's "64 KB" upload limit, read conservatively
// stencil-cli zips a fixed list of paths (PATHS_TO_ZIP in lib/stencil-bundle.js) and generates
// parsed/ and manifest.json itself, so those belong in the zip. Junk gets in only under assets/.
const FORBIDDEN = [/(^|\/)report\.html$/, /(^|\/)secrets\.stencil\.json$/, /(^|\/)config\.stencil\.json$/, /\.env$/];

const inActions = Boolean(process.env.GITHUB_ACTIONS);
const warn = message => console.log(inActions ? `::warning::${message}` : `WARNING  ${message}`);
const fail = message => console.error(inActions ? `::error::${message}` : `ERROR    ${message}`);

const zip = process.argv[2];
if (!zip) {
    console.error('Usage: node scripts/check-bundle.mjs <bundle.zip>');
    process.exit(2);
}

let failed = false;

const mainJs = fs.statSync('assets/dist/theme-bundle.main.js').size;
if (mainJs > MAIN_JS_BUDGET) {
    warn(`theme-bundle.main.js is ${mainJs.toLocaleString('en-CA')} B, over the ${MAIN_JS_BUDGET.toLocaleString('en-CA')} B budget`);
} else {
    console.log(`ok       theme-bundle.main.js is ${mainJs.toLocaleString('en-CA')} B (budget ${MAIN_JS_BUDGET.toLocaleString('en-CA')} B)`);
}

const configSize = fs.statSync('config.json').size;
if (configSize > CONFIG_LIMIT) {
    fail(`config.json is ${configSize.toLocaleString('en-CA')} B, over the ${CONFIG_LIMIT.toLocaleString('en-CA')} B upload limit`);
    failed = true;
} else {
    console.log(`ok       config.json is ${configSize.toLocaleString('en-CA')} B (limit ${CONFIG_LIMIT.toLocaleString('en-CA')} B)`);
}

const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
const shipped = entries.filter(entry => FORBIDDEN.some(pattern => pattern.test(entry)));
if (shipped.length) {
    fail(`${zip} contains files that must not ship: ${shipped.slice(0, 10).join(', ')}${shipped.length > 10 ? ', …' : ''}`);
    failed = true;
} else {
    console.log(`ok       ${zip}: ${entries.length} files, none forbidden`);
}

process.exit(failed ? 1 : 0);
