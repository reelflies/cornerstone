// The Script Manager sources in store-scripts/ run on every visitor's page, but CI's ESLint step
// (.github/workflows/reelflies-checks.yml) names only assets/js and scripts. This test lints
// store-scripts/ under the repo's own ESLint config, so npm run test:scripts, which CI and
// release.sh both run, covers it. store-scripts/.eslintrc leaves out only the vendored, minified
// web-vitals library, which web-vitals.test.mjs pins by sha256 instead.
//
//   node --test scripts/store-scripts/lint.test.mjs

import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { GLUE_FILE, ROOT, VENDOR } from './build.mjs';

describe('store-scripts/ under the repo\'s ESLint config', () => {
    it('lints clean, the glue included, with only the vendored library left out', async () => {
        const eslint = new ESLint({ cwd: ROOT, extensions: ['.js', '.mjs'] });
        const results = await eslint.lintFiles(['store-scripts']);
        const linted = results.map(result => path.relative(ROOT, result.filePath));
        assert.ok(!linted.includes(VENDOR.file), `${VENDOR.file} is left out of the lint (store-scripts/.eslintrc)`);
        assert.ok(linted.includes(GLUE_FILE), `${GLUE_FILE} is linted`);
        const errors = results.flatMap(result => result.messages
            .filter(message => message.severity === 2)
            .map(message => `${path.relative(ROOT, result.filePath)}:${message.line}:${message.column} ${message.message} (${message.ruleId})`));
        assert.deepEqual(errors, []);
    });
});
