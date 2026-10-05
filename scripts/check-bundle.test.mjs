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

// A build the way webpack writes one. Each chunk file starts with its JSONP header,
// `(self.webpackChunk…||[]).push([[id],{…`, and a dynamic import compiles to `o.e(id)`,
// or to `Promise.all([o.e(a),o.e(b),…])` when it also needs shared chunks.
//   chunks:  { file: { id, size } or { id, content } }
//   imports: groups of ids, each one import() in main.js
const jsonpHeader = id => `(self.webpackChunkbigcommerce_cornerstone=self.webpackChunkbigcommerce_cornerstone||[]).push([[${id}],{`;
const loads = ids => (ids.length === 1 ? `o.e(${ids[0]})` : `Promise.all([${ids.map(id => `o.e(${id})`).join(',')}])`);

function writeBuild(chunks, imports = Object.values(chunks).map(({ id }) => [id]), { importsIn = 'theme-bundle.main.js' } = {}) {
    const dist = tempDir();
    for (const [file, { id, size, content }] of Object.entries(chunks)) {
        const body = content === undefined ? crypto.randomBytes(size) : Buffer.from(content);
        fs.writeFileSync(path.join(dist, file), Buffer.concat([Buffer.from(jsonpHeader(id)), body]));
    }
    const calls = imports.map(ids => `function(){return ${loads(ids)}.then(o.bind(o,4184))}`).join(',');
    const importer = path.join(dist, importsIn);
    const existing = fs.existsSync(importer) ? fs.readFileSync(importer) : Buffer.from('');
    fs.writeFileSync(importer, Buffer.concat([existing, Buffer.from(`;var L=[${calls}];`)]));
    if (!fs.existsSync(path.join(dist, 'theme-bundle.main.js'))) fs.writeFileSync(path.join(dist, 'theme-bundle.main.js'), '/* main */');
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
        const results = checkChunks(writeBuild({
            [MENU]: { id: 101, size: 8200 }, [QUICK_ADD]: { id: 102, size: 15200 }, [REGION]: { id: 103, size: 1100 },
        }));
        assert.equal(levelOf(results, MENU), 'fail');
        assert.equal(levelOf(results, QUICK_ADD), 'fail');
        assert.equal(levelOf(results, REGION), 'fail');
    });

    it('pass each chunk under its gzip limit', () => {
        const results = checkChunks(writeBuild({
            [MENU]: { id: 101, size: 7000 }, [QUICK_ADD]: { id: 102, size: 14000 }, [REGION]: { id: 103, size: 800 },
        }));
        assert.equal(levelOf(results, MENU), 'ok');
        assert.equal(levelOf(results, QUICK_ADD), 'ok');
        assert.equal(levelOf(results, REGION), 'ok');
    });

    it('measure gzip, not raw size, so a large chunk that compresses well passes', () => {
        const dist = writeBuild({ [MENU]: { id: 101, content: 'const a = 1;\n'.repeat(5000) } }); // 65,000 B raw
        assert.equal(levelOf(checkChunks(dist), MENU), 'ok');
    });

    it('skip a chunk that isn\'t built yet', () => {
        const results = checkChunks(writeBuild({ [MENU]: { id: 101, size: 7000 } }));
        assert.equal(levelOf(results, MENU), 'ok');
        assert.equal(levelOf(results, QUICK_ADD), 'skip');
        assert.equal(levelOf(results, REGION), 'skip');
        assert.ok(results.every(result => result.level !== 'fail'));
    });
});

describe('the per-chunk gzip limits count every chunk the import loads', () => {
    // webpack's splitChunks moves code an import shares with other chunks into numbered
    // chunks, which the same click fetches. Quick view's 782 B chunk loads with 311, 668
    // and 354, about 20 KB gzip more (ticket 16 review).
    const SHARED = 'theme-bundle.chunk.311.js';
    const OTHER_SHARED = 'theme-bundle.chunk.668.js';

    it('fail a chunk under its limit on its own whose import also loads a shared chunk that takes it over', () => {
        const dist = writeBuild(
            { [REGION]: { id: 52, size: 700 }, [SHARED]: { id: 311, size: 900 } },
            [[311, 52]],
        );
        const region = checkChunks(dist).find(result => result.file === REGION);
        assert.equal(region.level, 'fail');
        assert.ok(region.size > 1600, `size ${region.size}`);
        assert.match(region.message, /theme-bundle\.chunk\.rf-region-prompt\.js loads with 1 shared chunk: [\d,]+ B gzip in all, over its 1,000 B limit/);
        assert.match(region.message, /theme-bundle\.chunk\.311\.js [\d,]+ B/);
    });

    it('pass a chunk whose import and its shared chunks together stay under the limit', () => {
        const dist = writeBuild(
            { [QUICK_ADD]: { id: 970, size: 4000 }, [SHARED]: { id: 311, size: 5000 } },
            [[311, 970]],
        );
        const quickAdd = checkChunks(dist).find(result => result.file === QUICK_ADD);
        assert.equal(quickAdd.level, 'ok');
        assert.ok(quickAdd.size > 9000 && quickAdd.size < 15000, `size ${quickAdd.size}`);
    });

    it('measure the import that loads the most, when two imports load the chunk differently', () => {
        const dist = writeBuild(
            { [QUICK_ADD]: { id: 970, size: 4000 }, [SHARED]: { id: 311, size: 5000 }, [OTHER_SHARED]: { id: 668, size: 7000 } },
            [[311, 970], [311, 668, 970]],
        );
        const quickAdd = checkChunks(dist).find(result => result.file === QUICK_ADD);
        assert.equal(quickAdd.level, 'fail');
        assert.ok(quickAdd.size > 16000, `size ${quickAdd.size}`);
        assert.match(quickAdd.message, /loads with 2 shared chunks/);
    });

    it('find an import made inside another lazy chunk, such as a page class', () => {
        const dist = writeBuild(
            { 'theme-bundle.chunk.27.js': { id: 27, size: 100 }, [MENU]: { id: 88, size: 6000 }, [SHARED]: { id: 311, size: 3000 } },
            [[311, 88]],
            { importsIn: 'theme-bundle.chunk.27.js' },
        );
        const menu = checkChunks(dist).find(result => result.file === MENU);
        assert.equal(menu.level, 'fail');
        assert.ok(menu.size > 9000, `size ${menu.size}`);
    });

    it('fail a built chunk that no import in the build loads, rather than measure only its file', () => {
        const dist = writeBuild({ [MENU]: { id: 88, size: 100 } }, []);
        const menu = checkChunks(dist).find(result => result.file === MENU);
        assert.equal(menu.level, 'fail');
        assert.match(menu.message, /found no import\(\) that loads it/);
    });

    it('fail when the import loads a chunk that isn\'t in the build', () => {
        const dist = writeBuild({ [MENU]: { id: 88, size: 100 } }, [[311, 88]]);
        const menu = checkChunks(dist).find(result => result.file === MENU);
        assert.equal(menu.level, 'fail');
        assert.match(menu.message, /chunk 311, which isn't in/);
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

    // Zips manifest.json plus `files` ({ 'assets/dist/x.js': content }), as stencil bundle would.
    function run(dist, files = {}) {
        const dir = tempDir();
        const zip = path.join(dir, 'bundle.zip');
        const entries = { 'manifest.json': '{}', ...files };
        for (const [name, content] of Object.entries(entries)) {
            fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
            fs.writeFileSync(path.join(dir, name), content);
        }
        spawnSync('zip', ['-q', zip, ...Object.keys(entries)], { cwd: dir });
        return spawnSync(process.execPath, [SCRIPT, zip, '--dist', dist], {
            encoding: 'utf8',
            env: { ...process.env, GITHUB_ACTIONS: 'true' },
        });
    }

    it('exits 0 on a build within every limit', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stdout } = run(writeBuild({ [MENU]: { id: 88, size: 7000 } }));
        assert.equal(status, 0, stdout);
    });

    it('exits 1 with a GitHub error annotation on a chunk over its limit', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stderr } = run(writeBuild({ [REGION]: { id: 52, size: 1500 } }));
        assert.equal(status, 1);
        assert.match(stderr, /::error::theme-bundle\.chunk\.rf-region-prompt\.js is [\d,]+ B gzip, over its 1,000 B limit/);
    });

    it('exits 1 on a main.js over 307,200 B', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stderr } = run(writeDist({ 'theme-bundle.main.js': 307607 }));
        assert.equal(status, 1);
        assert.match(stderr, /::error::theme-bundle\.main\.js is 307,607 B, over the 307,200 B limit/);
    });

    // `stencil start` writes a webpack dev build into assets/dist, and the clean step never
    // removes it, so a bundle made afterwards without `rm -rf assets/dist` would ship it.
    const DEV_CHUNK = 'assets/dist/theme-bundle.chunk.assets_js_theme_brand_js.js';
    const devScript = `(self.webpackChunk=self.webpackChunk||[]).push([["brand"],{}]);\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Buffer.from('{"sources":["webpack:///./assets/js/theme/brand.js"]}').toString('base64')}`;
    const prodScript = '(self.webpackChunk=self.webpackChunk||[]).push([[27],{}]);\n//# sourceMappingURL=theme-bundle.chunk.27.js.map';

    it('exits 1 on a zip that ships a dev-build script with an inline source map', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stderr } = run(writeDist({ 'theme-bundle.main.js': 250000 }), {
            [DEV_CHUNK]: devScript,
            'assets/dist/theme-bundle.chunk.27.js': prodScript,
        });
        assert.equal(status, 1);
        assert.match(stderr, /::error::.*bundle\.zip ships 1 dev-build script with an inline source map.*theme-bundle\.chunk\.assets_js_theme_brand_js\.js/);
        assert.doesNotMatch(stderr, /chunk\.27\.js/);
    });

    it('exits 0 on a zip whose scripts link their source maps, as the production build does', { skip: !hasZip && 'zip is not installed' }, () => {
        const { status, stdout } = run(writeDist({ 'theme-bundle.main.js': 250000 }), { 'assets/dist/theme-bundle.chunk.27.js': prodScript });
        assert.equal(status, 0, stdout);
        assert.match(stdout, /no dev-build scripts/);
    });

    it('still runs from a checkout whose path has a # in it, instead of exiting 0 unchecked', () => {
        const dir = path.join(tempDir(), 'reel#flies');
        fs.mkdirSync(dir);
        const copy = path.join(dir, 'check-bundle.mjs');
        fs.copyFileSync(SCRIPT, copy);
        fs.cpSync(path.join(path.dirname(SCRIPT), 'lib'), path.join(dir, 'lib'), { recursive: true }); // its isMain and formatBytes
        const { status, stderr } = spawnSync(process.execPath, [copy], { encoding: 'utf8' });
        assert.equal(status, 2, 'no zip given: it prints its usage and exits 2');
        assert.match(stderr, /Usage: node scripts\/check-bundle\.mjs/);
    });
});
