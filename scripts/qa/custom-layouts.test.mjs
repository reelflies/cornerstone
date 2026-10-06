// Custom layouts (scripts/qa/custom-layouts.mjs, W0-8). stencil start renders a custom template
// (templates/pages/custom/<type>/<file>) for a URL only when config.stencil.json's
// customLayouts maps the file to that URL: the store's template associations belong to the
// uploaded theme, not to a local render. So the mappings the gates need are committed in
// scripts/qa/custom-layouts.json, and every stencil start the gates make merges them into the
// run's copy of config.stencil.json first (startCommand in storefront.mjs).
//
// - The committed file maps only stencil-cli's four custom page types, each file to one or more
//   root-relative URLs, and each file must exist.
// - The committed mappings come first, so they win over one made by hand for the same URL
//   (stencil-cli takes the first file that maps a URL). A hand mapping is kept, and named,
//   because no other checkout renders with it.
// - config.stencil.json that is a link (a worktree's, to the main clone's) is replaced by a
//   copy before it changes, so the main clone's file never changes through it. Nothing is
//   written when it already has the mappings.
//
//   node --test scripts/qa/custom-layouts.test.mjs

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    CUSTOM_LAYOUTS_FILE, customLayoutProblems, mergeCustomLayouts, prepareStencilConfig,
} from './custom-layouts.mjs';

const SCRIPT = fileURLToPath(new URL('custom-layouts.mjs', import.meta.url));
const temps = [];
after(() => temps.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
const tempDir = () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rf-layouts-')));
    temps.push(dir);
    return dir;
};
const EMPTY = {
    brand: {}, category: {}, page: {}, product: {},
};
const STENCIL_CONFIG = { normalStoreUrl: 'https://store.example', port: 3000, customLayouts: EMPTY };

// A theme folder with the custom templates `templates` (type/file), the committed `layouts`,
// and config.stencil.json, as a file or as a link to one outside it.
function theme({
    templates = ['category/rf-noindex.html', 'page/hook-size-chart.html'], layouts = EMPTY, stencilConfig = STENCIL_CONFIG, link = false,
} = {}) {
    const dir = tempDir();
    for (const template of templates) {
        fs.mkdirSync(path.join(dir, 'templates', 'pages', 'custom', path.dirname(template)), { recursive: true });
        fs.writeFileSync(path.join(dir, 'templates', 'pages', 'custom', template), '{{> layout/base}}\n');
    }
    fs.mkdirSync(path.join(dir, path.dirname(CUSTOM_LAYOUTS_FILE)), { recursive: true });
    fs.writeFileSync(path.join(dir, CUSTOM_LAYOUTS_FILE), `${JSON.stringify(layouts, null, 4)}\n`);
    const target = link ? path.join(tempDir(), 'config.stencil.json') : path.join(dir, 'config.stencil.json');
    fs.writeFileSync(target, `${JSON.stringify(stencilConfig, null, 2)}\n`);
    if (link) fs.symlinkSync(target, path.join(dir, 'config.stencil.json'));
    return { dir, target };
}
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const quiet = () => {};

describe('the committed custom layouts', () => {
    it('map a custom template that exists to root-relative URLs', () => {
        const { dir } = theme();
        assert.deepEqual(customLayoutProblems({
            ...EMPTY, category: { 'rf-noindex.html': '/flies/realistic-trout-flies/realistic-nymphs/' }, page: { 'hook-size-chart.html': ['/fly-hook-size-chart/', '/hook-chart/'] },
        }, { dir }), []);
    });

    it('name every problem: a page type stencil-cli has no custom templates for, a file that isn\'t there, a URL that isn\'t a path, one URL mapped twice', () => {
        const { dir } = theme();
        const problems = customLayoutProblems({
            ...EMPTY,
            cart: { 'rf-cart.html': '/cart.php' },
            category: { 'rf-noindex.html': 'https://reelflies.ca/flies/', 'missing.html': '/flies/' },
            page: { 'hook-size-chart.html': [] },
            product: { 'rf-a.html': '/p/', 'rf-b.html': '/p/' },
        }, { dir });
        assert.ok(problems.some(problem => /"cart" isn't a page type stencil-cli renders custom templates for \(brand, category, page, product\)/.test(problem)), problems.join('\n'));
        assert.ok(problems.some(problem => /category rf-noindex\.html: "https:\/\/reelflies\.ca\/flies\/" isn't a path/.test(problem)), problems.join('\n'));
        assert.ok(problems.some(problem => /templates\/pages\/custom\/category\/missing\.html doesn't exist/.test(problem)), problems.join('\n'));
        assert.ok(problems.some(problem => /page hook-size-chart\.html maps no URL/.test(problem)), problems.join('\n'));
        assert.ok(problems.some(problem => /product: \/p\/ is mapped to both rf-a\.html and rf-b\.html/.test(problem)), problems.join('\n'));
    });

    it('refuse a file name outside templates/pages/custom/<type>/', () => {
        const { dir } = theme();
        const problems = customLayoutProblems({ ...EMPTY, page: { '../../layout/base.html': '/x/' } }, { dir });
        assert.match(problems[0], /isn't a template file name/);
    });
});

describe('merging them into config.stencil.json\'s customLayouts', () => {
    it('puts the committed mappings first, keeps a hand mapping after them, and names it', () => {
        const local = { ...EMPTY, category: { 'rf-try.html': '/flies/', 'rf-noindex.html': '/old/' } };
        const committed = { ...EMPTY, category: { 'rf-noindex.html': '/flies/realistic-trout-flies/' } };
        const { customLayouts, localOnly } = mergeCustomLayouts(local, committed);
        assert.deepEqual(Object.entries(customLayouts.category), [['rf-noindex.html', '/flies/realistic-trout-flies/'], ['rf-try.html', '/flies/']]);
        assert.deepEqual(localOnly, [{ type: 'category', file: 'rf-try.html', urls: '/flies/' }]);
        assert.deepEqual(customLayouts.page, {});
    });

    it('drops a hand mapping of a URL the committed file maps, since stencil-cli would render either', () => {
        const local = { ...EMPTY, page: { 'rf-old.html': ['/fly-hook-size-chart/', '/other/'] } };
        const committed = { ...EMPTY, page: { 'hook-size-chart.html': '/fly-hook-size-chart' } };
        const { customLayouts, localOnly } = mergeCustomLayouts(local, committed);
        assert.deepEqual(customLayouts.page, { 'hook-size-chart.html': '/fly-hook-size-chart', 'rf-old.html': ['/other/'] });
        assert.deepEqual(localOnly, [{ type: 'page', file: 'rf-old.html', urls: ['/other/'] }]);
    });
});

describe('preparing the run\'s config.stencil.json', () => {
    const layouts = { ...EMPTY, category: { 'rf-noindex.html': '/flies/realistic-trout-flies/' } };

    it('writes the committed mappings in, keeping every other key', () => {
        const { dir } = theme({ layouts });
        const lines = [];
        assert.deepEqual(prepareStencilConfig({ dir, log: line => lines.push(line) }), { written: true, copied: false });
        const written = readJson(path.join(dir, 'config.stencil.json'));
        assert.deepEqual(written.customLayouts.category, { 'rf-noindex.html': '/flies/realistic-trout-flies/' });
        assert.equal(written.normalStoreUrl, 'https://store.example');
        assert.equal(written.port, 3000);
        assert.ok(lines.some(line => line.startsWith('LAYOUTS')), lines.join('\n'));
    });

    it('writes nothing when it already has them', () => {
        const { dir } = theme();
        const before = fs.statSync(path.join(dir, 'config.stencil.json')).mtimeMs;
        assert.deepEqual(prepareStencilConfig({ dir, log: quiet }), { written: false, copied: false });
        assert.equal(fs.statSync(path.join(dir, 'config.stencil.json')).mtimeMs, before);
    });

    it('replaces a link with a copy before it changes, so the file it points at never changes', () => {
        const { dir, target } = theme({ layouts, link: true });
        const original = fs.readFileSync(target, 'utf8');
        const lines = [];
        assert.deepEqual(prepareStencilConfig({ dir, log: line => lines.push(line) }), { written: true, copied: true });
        assert.equal(fs.readFileSync(target, 'utf8'), original, 'the linked file is as it was');
        const copy = path.join(dir, 'config.stencil.json');
        assert.ok(!fs.lstatSync(copy).isSymbolicLink(), 'the link is now a copy');
        assert.deepEqual(readJson(copy).customLayouts.category, { 'rf-noindex.html': '/flies/realistic-trout-flies/' });
        assert.ok(lines.some(line => line.startsWith('COPY') && line.includes(target)), lines.join('\n'));
    });

    it('leaves a link alone when nothing changes', () => {
        const { dir } = theme({ link: true });
        assert.deepEqual(prepareStencilConfig({ dir, log: quiet }), { written: false, copied: false });
        assert.ok(fs.lstatSync(path.join(dir, 'config.stencil.json')).isSymbolicLink());
    });

    it('names a hand mapping the committed file doesn\'t have, and keeps it', () => {
        const { dir } = theme({ stencilConfig: { ...STENCIL_CONFIG, customLayouts: { ...EMPTY, brand: { 'rf-try.html': '/brands/ReelFlies.html' } } } });
        const lines = [];
        prepareStencilConfig({ dir, log: line => lines.push(line) });
        assert.ok(lines.some(line => /^WARNING .*brand rf-try\.html \(\/brands\/ReelFlies\.html\).*scripts\/qa\/custom-layouts\.json/.test(line)), lines.join('\n'));
        assert.deepEqual(readJson(path.join(dir, 'config.stencil.json')).customLayouts.brand, { 'rf-try.html': '/brands/ReelFlies.html' });
    });

    it('stops on a problem in the committed file, before writing anything', () => {
        const { dir, target } = theme({ layouts: { ...EMPTY, page: { 'missing.html': '/x/' } } });
        const original = fs.readFileSync(target, 'utf8');
        assert.throws(() => prepareStencilConfig({ dir, log: quiet }), /scripts\/qa\/custom-layouts\.json: templates\/pages\/custom\/page\/missing\.html doesn't exist/);
        assert.equal(fs.readFileSync(target, 'utf8'), original);
    });

    it('stops when there is no config.stencil.json, which `npx stencil init` makes', () => {
        const { dir } = theme();
        fs.rmSync(path.join(dir, 'config.stencil.json'));
        assert.throws(() => prepareStencilConfig({ dir, log: quiet }), /no config\.stencil\.json/);
    });

    it('runs as the first step of every stencil start the gates make, in the folder it starts in, and stops it on a problem', () => {
        const good = theme({ layouts });
        const ok = spawnSync(process.execPath, [SCRIPT], { cwd: good.dir, encoding: 'utf8' });
        assert.equal(ok.status, 0, ok.stderr);
        assert.deepEqual(readJson(path.join(good.dir, 'config.stencil.json')).customLayouts.category, layouts.category);

        const bad = theme({ layouts: { ...EMPTY, page: { 'missing.html': '/x/' } } });
        const stopped = spawnSync(process.execPath, [SCRIPT], { cwd: bad.dir, encoding: 'utf8' });
        assert.equal(stopped.status, 1);
        assert.match(stopped.stderr, /^STOP {5}.*missing\.html doesn't exist/m);
    });
});
