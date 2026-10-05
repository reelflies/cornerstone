#!/usr/bin/env node
// Checks a built theme before it ships. Run after `npm run build` and `npx stencil bundle`.
// CI runs it on every pull request, and release.sh before every push.
//
//   node scripts/check-bundle.mjs <bundle.zip> [--dist <dir>]
//
// --dist is where webpack wrote the bundles (default assets/dist).
//
// - Fails when theme-bundle.main.js is over MAIN_JS_LIMIT, 300 KiB (307,200 B) raw.
//   Stock 6.22.0 was 307,607 B; ticket 16 moved Quick view into its own chunk.
// - Fails when a ReelFlies chunk is over its gzip limit in CHUNK_GZIP_LIMITS. A chunk
//   that isn't built yet is skipped. A module gets its chunk name from the comment in
//   its dynamic import, which webpack turns into theme-bundle.chunk.<name>.js:
//     import(/* webpackChunkName: "rf-menu" */ './reelflies/menu')
//   - rf-menu           the grouped menu and phone drawer (ticket 28)        8,000 B
//   - rf-quick-add      quick add on cards (ticket 43, measured in 45)      15,000 B
//   - rf-region-prompt  the outside-Canada prompt (ticket 52)                1,000 B
//   KB is read conservatively as 1,000 B, like CONFIG_LIMIT. gzip is zlib's default level.
//   The limit covers everything the import loads: the named file plus the shared chunks
//   webpack's splitChunks moved out of it, which the same first use fetches. Each file is
//   gzipped on its own, as it is served. A shared chunk the page may have loaded already
//   still counts, so the figure can be high but never low. When two imports load the
//   chunk with different shared chunks, the larger total counts.
// - Reports the compiled ReelFlies CSS layer (the reelflies/ imports in theme.scss)
//   against the design's estimate of about 12 KB. It warns and never fails, until
//   ticket 26's spike sets a real figure.
// - Fails when config.json is over CONFIG_LIMIT (the store rejects larger uploads).
// - Fails when the zip contains the bundle analyser's report or a secrets file.
// - Fails when the zip ships a dev-build script: one under assets/dist whose source map,
//   with the original sources, is inlined as a data: URL. `stencil start` (and so every QA
//   gate run) writes a dev build there, the webpack clean step never removes its files,
//   and `stencil bundle` zips all of assets/. The production build links .map files.
//
// The checks are exported for scripts/check-bundle.test.mjs.

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import zlib from 'zlib';

export const MAIN_JS_LIMIT = 300 * 1024;
export const CHUNK_GZIP_LIMITS = {
    'theme-bundle.chunk.rf-menu.js': 8000,
    'theme-bundle.chunk.rf-quick-add.js': 15000,
    'theme-bundle.chunk.rf-region-prompt.js': 1000,
};
export const CSS_LAYER_ESTIMATE = 12000;
const CONFIG_LIMIT = 64000; // the handoff's "64 KB" upload limit, read conservatively
// stencil-cli zips a fixed list of paths (PATHS_TO_ZIP in lib/stencil-bundle.js) and generates
// parsed/ and manifest.json itself, so those belong in the zip. Junk gets in only under assets/.
const FORBIDDEN = [/(^|\/)report\.html$/, /(^|\/)secrets\.stencil\.json$/, /(^|\/)config\.stencil\.json$/, /\.env$/];
const REELFLIES_IMPORT = /^[ \t]*@import\s+["']reelflies\/[^"']*["'].*$/gm;
// webpack's production output: a lazy chunk file starts `(self.webpackChunk…||[]).push([[ids],{`,
// and a dynamic import compiles to `X.e(id)`, or to `Promise.all([X.e(a),X.e(b),…])` when it
// needs shared chunks too.
const CHUNK_HEADER = /\.push\(\[\[(\d+(?:,\d+)*)\]/;
const LOADS_TOGETHER = /Promise\.all\(\[((?:[\w$]+\.e\(\d+\),?)+)\]\)/g;
const LOAD = /[\w$]+\.e\((\d+)\)/g;
const SHIPPED_SCRIPT = /^assets\/dist\/.*\.js$/;
const INLINE_SOURCE_MAP = /\/\/# sourceMappingURL=data:/;

const bytes = n => `${n.toLocaleString('en-CA')} B`;

// Each check returns a result: level is ok, info, skip, warn or fail, and only fail
// fails the run. Chunk and size checks add the file and its measured size.
const result = (level, message, extra = {}) => ({ level, message, ...extra });

export function checkMainJs(dist) {
    const file = path.join(dist, 'theme-bundle.main.js');
    if (!fs.existsSync(file)) {
        return result('fail', `${file} is missing; run the build first`, { file: 'theme-bundle.main.js' });
    }
    const size = fs.statSync(file).size;
    return size > MAIN_JS_LIMIT
        ? result('fail', `theme-bundle.main.js is ${bytes(size)}, over the ${bytes(MAIN_JS_LIMIT)} limit`, { file: 'theme-bundle.main.js', size })
        : result('ok', `theme-bundle.main.js is ${bytes(size)} (limit ${bytes(MAIN_JS_LIMIT)})`, { file: 'theme-bundle.main.js', size });
}

// Every script in the build, by file name, with the chunk ids its JSONP header registers.
function readScripts(dist) {
    return new Map(fs.readdirSync(dist).filter(name => name.endsWith('.js')).map(name => {
        const code = fs.readFileSync(path.join(dist, name));
        const header = code.subarray(0, 1000).toString('latin1').match(CHUNK_HEADER);
        return [name, { code, ids: header ? header[1].split(',') : [] }];
    }));
}

// The chunk ids each import() of one of `ids` loads at once, from every script in the build.
function importsOf(scripts, ids) {
    const groups = [];
    for (const { code } of scripts.values()) {
        const text = code.toString('latin1');
        for (const [, calls] of text.matchAll(LOADS_TOGETHER)) {
            const group = [...calls.matchAll(LOAD)].map(([, id]) => id);
            if (group.some(id => ids.includes(id))) groups.push(group);
        }
        const alone = [...text.replace(LOADS_TOGETHER, '').matchAll(LOAD)].map(([, id]) => id);
        ids.filter(id => alone.includes(id)).forEach(id => groups.push([id]));
    }
    return groups;
}

// webpack names a chunk's file after the chunk's name, or else its id.
function fileOf(scripts, id) {
    const numbered = `theme-bundle.chunk.${id}.js`;
    if (scripts.has(numbered)) return numbered;
    return [...scripts].find(([name, { ids }]) => !/^theme-bundle\.chunk\.\d+\.js$/.test(name) && ids.includes(id))?.[0];
}

function checkChunk(scripts, file, limit) {
    const gzip = name => zlib.gzipSync(scripts.get(name).code).length;
    const groups = importsOf(scripts, scripts.get(file).ids);
    if (!groups.length) {
        return result('fail', `${file}: found no import() that loads it in the build, so its ${bytes(limit)} gzip limit can't be checked`, { file });
    }
    const loads = groups.map(group => group.map(id => ({ id, name: fileOf(scripts, id) })));
    const missing = loads.flat().find(({ name }) => !name);
    if (missing) {
        return result('fail', `${file}: its import also loads chunk ${missing.id}, which isn't in the build, so its ${bytes(limit)} gzip limit can't be checked`, { file });
    }

    const totals = loads.map(group => {
        const names = [...new Set([file, ...group.map(({ name }) => name)])];
        return { names, size: names.reduce((sum, name) => sum + gzip(name), 0) };
    });
    const { names, size } = totals.reduce((most, total) => (total.size > most.size ? total : most));
    const shared = names.filter(name => name !== file);
    const verdict = size > limit ? `over its ${bytes(limit)} limit` : `(limit ${bytes(limit)})`;
    const message = shared.length
        ? `${file} loads with ${shared.length} shared chunk${shared.length > 1 ? 's' : ''}: ${bytes(size)} gzip in all, ${verdict} (${names.map(name => `${name} ${bytes(gzip(name))}`).join(', ')})`
        : `${file} is ${bytes(size)} gzip${size > limit ? ', ' : ' '}${verdict}`;
    return result(size > limit ? 'fail' : 'ok', message, { file, size });
}

export function checkChunks(dist, limits = CHUNK_GZIP_LIMITS) {
    const built = Object.keys(limits).filter(file => fs.existsSync(path.join(dist, file)));
    const scripts = built.length ? readScripts(dist) : null;
    return Object.entries(limits).map(([file, limit]) => (built.includes(file)
        ? checkChunk(scripts, file, limit)
        : result('skip', `${file} isn't built yet (limit ${bytes(limit)} gzip)`, { file })));
}

export function checkConfig(configPath) {
    const size = fs.statSync(configPath).size;
    return size > CONFIG_LIMIT
        ? result('fail', `${configPath} is ${bytes(size)}, over the ${bytes(CONFIG_LIMIT)} upload limit`)
        : result('ok', `${configPath} is ${bytes(size)} (limit ${bytes(CONFIG_LIMIT)})`);
}

export function checkZipEntries(zip, entries) {
    const shipped = entries.filter(entry => FORBIDDEN.some(pattern => pattern.test(entry)));
    return shipped.length
        ? result('fail', `${zip} contains files that must not ship: ${shipped.slice(0, 10).join(', ')}${shipped.length > 10 ? ', …' : ''}`)
        : result('ok', `${zip}: ${entries.length} files, none forbidden`);
}

const readZipEntry = zip => entry => execFileSync('unzip', ['-p', zip, entry], { maxBuffer: 256 * 1024 * 1024 });

export function checkZipScripts(zip, entries, read = readZipEntry(zip)) {
    const dev = entries.filter(entry => SHIPPED_SCRIPT.test(entry) && INLINE_SOURCE_MAP.test(read(entry).toString('latin1')));
    const list = `${dev.slice(0, 5).join(', ')}${dev.length > 5 ? ', …' : ''}`;
    return dev.length
        ? result('fail', `${zip} ships ${dev.length} dev-build script${dev.length > 1 ? 's' : ''} with an inline source map, left in assets/dist by stencil start: ${list}. Run rm -rf assets/dist, then bundle again`)
        : result('ok', `${zip}: no dev-build scripts in assets/dist`);
}

// Compiles theme.scss with stencil-cli's own compiler. It uses the dart-sass engine,
// which is plain JavaScript and so runs the same in CI as on a Mac; stencil start's
// default, node-sass, needs a native binary per platform. The two differ by about 2%.
// Dart Sass warns at length about upstream's @import rules, and stencil-styles doesn't
// pass its logger option on, so stderr is muted while it compiles. A compile error
// still rejects, and is reported.
async function compileThemeCss(themeDir, settings) {
    // A deep import into the pinned devDependency; Node's ESM loader needs the .js.
    const { default: cssCompiler } = await import('@bigcommerce/stencil-cli/lib/css/compile.js'); // eslint-disable-line import/extensions, import/no-extraneous-dependencies
    const write = process.stderr.write;
    process.stderr.write = () => true;
    try {
        const css = await cssCompiler.compile(settings, path.join(themeDir, 'assets'), 'theme.css', 'dart-sass');
        return Buffer.from(css.replace(/\/\*# sourceMappingURL=[\s\S]*?\*\//g, ''));
    } finally {
        process.stderr.write = write;
    }
}

// The layer's size is the difference between theme.css compiled as it is and compiled
// from a copy of assets/scss without the reelflies/ imports. The copy sits in a temp dir
// at the same depth, with node_modules linked, so upstream's ../../node_modules imports resolve.
export async function measureCssLayer(themeDir = '.') {
    const scssDir = path.join(themeDir, 'assets/scss');
    const themeScss = fs.readFileSync(path.join(scssDir, 'theme.scss'), 'utf8');
    if (!themeScss.match(REELFLIES_IMPORT)) {
        return { level: 'info', message: `no ReelFlies CSS layer yet: theme.scss imports nothing from reelflies/ (estimate about ${bytes(CSS_LAYER_ESTIMATE)})` };
    }

    const config = JSON.parse(fs.readFileSync(path.join(themeDir, 'config.json'), 'utf8'));
    const configuration = { ...config, settings: { ...config.settings, ...config.variations?.[0]?.settings } };
    const stockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-css-layer-'));
    try {
        fs.cpSync(scssDir, path.join(stockDir, 'assets/scss'), { recursive: true });
        fs.writeFileSync(path.join(stockDir, 'assets/scss/theme.scss'), themeScss.replace(REELFLIES_IMPORT, ''));
        const modules = path.resolve(themeDir, 'node_modules');
        if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(stockDir, 'node_modules'), 'dir');

        const withLayer = await compileThemeCss(themeDir, configuration);
        const stock = await compileThemeCss(stockDir, configuration);
        const size = withLayer.length - stock.length;
        const gzip = zlib.gzipSync(withLayer).length - zlib.gzipSync(stock).length;
        const detail = `the ReelFlies CSS layer compiles to ${bytes(size)} (${bytes(gzip)} gzip)`;
        return size > CSS_LAYER_ESTIMATE
            ? result('warn', `${detail}, over the design's estimate of about ${bytes(CSS_LAYER_ESTIMATE)}`, { size, gzip })
            : result('ok', `${detail} (estimate about ${bytes(CSS_LAYER_ESTIMATE)})`, { size, gzip });
    } finally {
        fs.rmSync(stockDir, { recursive: true, force: true });
    }
}

function parseArgs(argv) {
    const args = { dist: 'assets/dist', zip: null };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--dist') args.dist = argv[++i];
        else if (!args.zip) args.zip = argv[i];
    }
    return args;
}

function report({ level, message }) {
    const inActions = Boolean(process.env.GITHUB_ACTIONS);
    if (level === 'fail') console.error(inActions ? `::error::${message}` : `ERROR    ${message}`);
    else if (level === 'warn') console.log(inActions ? `::warning::${message}` : `WARNING  ${message}`);
    else console.log(`${{ ok: 'ok', info: 'info', skip: 'skipped' }[level].padEnd(8)} ${message}`);
}

async function main() {
    const { dist, zip } = parseArgs(process.argv.slice(2));
    if (!zip || !dist) {
        console.error('Usage: node scripts/check-bundle.mjs <bundle.zip> [--dist <dir>]');
        process.exit(2);
    }

    const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
    const cssLayer = await measureCssLayer('.')
        .catch(error => result('warn', `couldn't compile theme.scss to measure the ReelFlies CSS layer: ${error.message.split('\n')[0]}`));
    const results = [
        checkMainJs(dist),
        ...checkChunks(dist),
        cssLayer,
        checkConfig('config.json'),
        checkZipEntries(zip, entries),
        checkZipScripts(zip, entries),
    ];
    results.forEach(report);
    process.exit(results.some(({ level }) => level === 'fail') ? 1 : 0);
}

// pathToFileURL escapes '#' and '%' in the checkout's path the way import.meta.url does.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (isMain) main();
