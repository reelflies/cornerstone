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
// - Reports the compiled ReelFlies CSS layer (the reelflies/ imports in theme.scss)
//   against the design's estimate of about 12 KB. It warns and never fails, until
//   ticket 26's spike sets a real figure.
// - Fails when config.json is over CONFIG_LIMIT (the store rejects larger uploads).
// - Fails when the zip contains the bundle analyser's report or a secrets file.
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

export function checkChunks(dist, limits = CHUNK_GZIP_LIMITS) {
    return Object.entries(limits).map(([file, limit]) => {
        const chunk = path.join(dist, file);
        if (!fs.existsSync(chunk)) {
            return result('skip', `${file} isn't built yet (limit ${bytes(limit)} gzip)`, { file });
        }
        const size = zlib.gzipSync(fs.readFileSync(chunk)).length;
        return size > limit
            ? result('fail', `${file} is ${bytes(size)} gzip, over its ${bytes(limit)} limit`, { file, size })
            : result('ok', `${file} is ${bytes(size)} gzip (limit ${bytes(limit)})`, { file, size });
    });
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
    ];
    results.forEach(report);
    process.exit(results.some(({ level }) => level === 'fail') ? 1 : 0);
}

// pathToFileURL escapes '#' and '%' in the checkout's path the way import.meta.url does.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (isMain) main();
