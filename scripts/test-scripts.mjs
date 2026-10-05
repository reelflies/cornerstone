#!/usr/bin/env node
// Runs the unit tests for the tooling in scripts/ with Node's built-in test runner.
//
//   npm run test:scripts
//
// Tests are files named *.test.mjs anywhere under scripts/. Playwright specs are
// *.spec.mjs, so neither this runner nor Jest picks them up.
//
// The files are passed by path because `node --test <dir>` works only on Node 20,
// and `node --test '<glob>'` only on Node 21 and later.

import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = 'scripts';

const findTests = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : findTests(entryPath);
    return entry.name.endsWith('.test.mjs') ? [entryPath] : [];
});

const files = findTests(ROOT).sort();
if (!files.length) {
    console.log(`No *.test.mjs files under ${ROOT}/`);
    process.exit(0);
}

const { status } = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
