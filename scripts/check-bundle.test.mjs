// Tests for scripts/check-bundle.mjs: the main.js limit, the per-chunk gzip limits,
// the CSS layer report and the command line CI and release.sh run.
//
//   node --test scripts/check-bundle.test.mjs

import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHUNK_GZIP_LIMITS, MAIN_JS_LIMIT, checkChunks, checkMainJs, measureCssLayer,
} from './check-bundle.mjs';

const SCRIPT = path.resolve('scripts/check-bundle.mjs');
const tempDirs = [];
after(() => tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

function tempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-bundle-'));
    tempDirs.push(dir);
    return dir;
}

// Random bytes don't compress, so a file of n random bytes gzips to a little over n.
function writeDist(files) {
    const dist = tempDir();
    for (const [name, size] of Object.entries(files)) {
        fs.writeFileSync(path.join(dist, name), crypto.randomBytes(size));
    }
    return dist;
}

const levelOf = (results, file) => results.find(result => result.file === file)?.level;
const MENU = 'theme-bundle.chunk.rf-menu.js';
const QUICK_ADD = 'theme-bundle.chunk.rf-quick-add.js';
const REGION = 'theme-bundle.chunk.rf-region-prompt.js';

describe('the main.js limit', () => {
    it('is 300 KiB raw', () => {
        assert.equal(MAIN_JS_LIMIT, 307200);
    });

    it('fails a main.js one byte over 307,200 B', () => {
        const dist = writeDist({ 'theme-bundle.main.js': 307201 });
        assert.equal(checkMainJs(dist).level, 'fail');
    });

    it('passes a main.js of exactly 307,200 B', () => {
        const dist = writeDist({ 'theme-bundle.main.js': 307200 });
        assert.equal(checkMainJs(dist).level, 'ok');
    });

    it('fails when main.js is missing, because the build didn\'t run', () => {
        assert.equal(checkMainJs(tempDir()).level, 'fail');
    });
});

describe('the per-chunk gzip limits', () => {
    it('limit the menu to 8,000 B, quick add to 15,000 B and the region prompt to 1,000 B', () => {
        assert.deepEqual(CHUNK_GZIP_LIMITS, { [MENU]: 8000, [QUICK_ADD]: 15000, [REGION]: 1000 });
    });

    it('fail each chunk over its gzip limit', () => {
        const results = checkChunks(writeDist({ [MENU]: 8200, [QUICK_ADD]: 15200, [REGION]: 1100 }));
        assert.equal(levelOf(results, MENU), 'fail');
        assert.equal(levelOf(results, QUICK_ADD), 'fail');
        assert.equal(levelOf(results, REGION), 'fail');
    });

    it('pass each chunk under its gzip limit', () => {
        const results = checkChunks(writeDist({ [MENU]: 7000, [QUICK_ADD]: 14000, [REGION]: 800 }));
        assert.equal(levelOf(results, MENU), 'ok');
        assert.equal(levelOf(results, QUICK_ADD), 'ok');
        assert.equal(levelOf(results, REGION), 'ok');
    });

    it('measure gzip, not raw size, so a large chunk that compresses well passes', () => {
        const dist = tempDir();
        fs.writeFileSync(path.join(dist, MENU), 'const a = 1;\n'.repeat(5000)); // 65,000 B raw
        assert.equal(levelOf(checkChunks(dist), MENU), 'ok');
    });

    it('skip a chunk that isn\'t built yet', () => {
        const results = checkChunks(writeDist({ [MENU]: 7000 }));
        assert.equal(levelOf(results, MENU), 'ok');
        assert.equal(levelOf(results, QUICK_ADD), 'skip');
        assert.equal(levelOf(results, REGION), 'skip');
        assert.ok(results.every(result => result.level !== 'fail'));
    });
});

describe('the CSS layer report', () => {
    function writeTheme(themeScss, layer) {
        const dir = tempDir();
        fs.mkdirSync(path.join(dir, 'assets/scss'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'assets/scss/theme.scss'), themeScss);
        if (layer !== undefined) {
            fs.mkdirSync(path.join(dir, 'assets/scss/reelflies'));
            fs.writeFileSync(path.join(dir, 'assets/scss/reelflies/_index.scss'), layer);
        }
        fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ settings: {}, variations: [{ name: 'ReelFlies CA', settings: {} }] }));
        return dir;
    }

    const stock = '.stock { color: red; }\n';
    const rules = count => Array.from({ length: count }, (_, i) => `.rf-rule-${i} { margin: ${i}px; padding: ${i}px; }`).join('\n');

    it('says plainly that there is no layer yet', async () => {
        const result = await measureCssLayer(writeTheme(stock));
        assert.equal(result.level, 'info');
        assert.match(result.message, /no ReelFlies CSS layer yet/);
    });

    it('reports a small layer as ok', async () => {
        const result = await measureCssLayer(writeTheme(`${stock}@import "reelflies/index";\n`, rules(10)));
        assert.equal(result.level, 'ok');
        assert.ok(result.size > 0 && result.size < 12000, `size ${result.size}`);
    });

    it('warns, and never fails, on a layer over the estimate', async () => {
        const result = await measureCssLayer(writeTheme(`${stock}@import "reelflies/index";\n`, rules(400)));
        assert.equal(result.level, 'warn');
        assert.ok(result.size > 12000, `size ${result.size}`);
    });
});

describe('the command line', () => {
    const hasZip = spawnSync('zip', ['-v']).status === 0;

    function run(dist) {
        const dir = tempDir();
        const zip = path.join(dir, 'bundle.zip');
        fs.writeFileSync(path.join(dir, 'manifest.json'), '{}');
        spawnSync('zip', ['-q', zip, 'manifest.json'], { cwd: dir });
        return spawnSync(process.execPath, [SCRIPT, zip, '--dist', dist], {
            encoding: 'utf8',
            env: { ...process.env, GITHUB_ACTIONS: 'true' },
        });
    }

    it('exits 0 on a build within every limit', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stdout } = run(writeDist({ 'theme-bundle.main.js': 250000, [MENU]: 7000 }));
        assert.equal(status, 0, stdout);
    });

    it('exits 1 with a GitHub error annotation on a chunk over its limit', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stderr } = run(writeDist({ 'theme-bundle.main.js': 250000, [REGION]: 1500 }));
        assert.equal(status, 1);
        assert.match(stderr, /::error::theme-bundle\.chunk\.rf-region-prompt\.js is [\d,]+ B gzip, over its 1,000 B limit/);
    });

    it('exits 1 on a main.js over 307,200 B', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stderr } = run(writeDist({ 'theme-bundle.main.js': 307607 }));
        assert.equal(status, 1);
        assert.match(stderr, /::error::theme-bundle\.main\.js is 307,607 B, over the 307,200 B limit/);
    });
});
