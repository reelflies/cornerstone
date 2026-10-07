// The hook chart's size rows (ticket 35): a size × Fly Type table from the catalogue's reads,
// rendered as one anchored row per size with facet links, and spliced into the chart's Web Page
// between two fixed markers, as a changes file for the store-write helper (W0-11).
//
//   node --test scripts/hook-chart/rows.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../qa/raw-html/html.mjs';
import { unbalancedTags } from '../qa/render/html-checks.mjs';
import { classify } from '../store/allowlist.mjs';
import { requestChannelProblems } from '../store/channel.mjs';
import { CHART_SIZES, anchorId } from '../hook-gauge/sizes.mjs';
import {
    CHART_URL, MARKERS, buildTable, catalogueProducts, chartPageRequest, flyTypesFromTree, readRowsConfig, renderRows, rowsConfigProblems, spliceRows,
} from './rows.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, 'fixtures');
const read = name => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
const config = readRowsConfig();
const products = catalogueProducts(read('products.json'), read('assignments.json'));
const flyTypes = flyTypesFromTree(read('tree.json'), config.flyTypes);
const table = buildTable(products, flyTypes);
const names = rows => rows.map(({ size, links }) => [size, links.map(link => link.name)]);
const decode = value => value.replace(/&amp;/g, '&');
const scratch = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rf-hook-chart-'));

describe('the rows config (scripts/hook-chart/rows.json)', () => {
    it('lists the six Fly Types in ticket 28\'s rf_menu_type_ids order', () => {
        assert.deepEqual(config.flyTypes.map(({ name }) => name), ['Dry Flies', 'Nymphs', 'Streamers', 'Eggs & Worms', 'Warmwater Flies', 'Saltwater Flies']);
    });

    it('gives every chart size one "common uses" line, and is marked as draft copy until Shaun approves it', () => {
        const covered = config.uses.flatMap(({ sizes }) => sizes);
        assert.deepEqual(covered, CHART_SIZES);
        assert.equal(config.status, 'draft');
        assert.deepEqual(rowsConfigProblems(config), []);
    });

    it('names each problem with a config it refuses', () => {
        const [first, ...rest] = config.uses;
        assert.deepEqual(rowsConfigProblems({ ...config, uses: rest }), first.sizes.map(size => `no "common uses" line for ${size}`));
        assert.deepEqual(rowsConfigProblems({ ...config, uses: [...config.uses, { sizes: ['14'], text: 'Again' }] }), ['14 has two "common uses" lines']);
        assert.deepEqual(rowsConfigProblems({ ...config, uses: [...config.uses, { sizes: ['26'], text: 'Tiny' }] }), ['26 isn\'t a chart size']);
        assert.deepEqual(rowsConfigProblems({ ...config, flyTypes: [...config.flyTypes, { name: 'Nymphs' }] }), ['the Fly Type "Nymphs" is listed twice']);
        assert.deepEqual(rowsConfigProblems({ ...config, text: { ...config.text, none: '' } }), ['text.none must be a non-empty string']);
        assert.deepEqual(rowsConfigProblems({ ...config, status: 'final' }), ['status must be draft or approved, not "final"']);
    });
});

describe('catalogueProducts', () => {
    const byId = Object.fromEntries(products.map(product => [product.id, product]));

    it('counts a product as Live on ReelFlies_CA only when it is visible and assigned to 1895766', () => {
        assert.equal(byId[1].live, true);
        assert.equal(byId[7].live, false, 'not visible');
        assert.equal(byId[8].live, false, 'assigned to channel 1 only');
    });

    it('reads the Fly Sizes option only, in hook-size spelling, and keeps aughts still spelled with a hyphen', () => {
        assert.deepEqual(byId[1].sizes, ['12', '14', '16', '18']);
        assert.deepEqual(byId[5].sizes, ['6/0', '4/0', '2/0']);
        assert.equal(byId[5].hyphenAughts, 3);
        assert.deepEqual(byId[10].sizes, [], 'a "Size" option isn\'t the Fly Sizes facet');
        assert.deepEqual(byId[11].sizes, ['26', '14']);
        assert.deepEqual(byId[12].sizes, []);
    });

    it('refuses reads in the wrong shape', () => {
        assert.throws(() => catalogueProducts({ products: [] }, read('assignments.json')), /the products read must be \{ "data": \[…\] \} or an array/);
        assert.throws(() => catalogueProducts({ data: [{ id: 1, is_visible: true, categories: [] }] }, []), /product 1 has no variants: read the products with include=variants/);
    });
});

describe('flyTypesFromTree', () => {
    it('finds the six Fly Types at tree 4\'s top level, with their URLs and every category below each', () => {
        assert.deepEqual(flyTypes.map(({ name, url }) => [name, url]), [
            ['Dry Flies', '/dry-flies/'], ['Nymphs', '/nymphs/'], ['Streamers', '/streamers/'],
            ['Eggs & Worms', '/eggs-worms/'], ['Warmwater Flies', '/warmwater-flies/'], ['Saltwater Flies', '/saltwater-flies/'],
        ]);
        assert.deepEqual(flyTypes[0].categories.map(({ id }) => id), [101, 111, 112, 113]);
    });

    it('matches by id when the config gives one, and reads `id` as well as `category_id`', () => {
        const tree = { data: read('tree.json').data.map(({ category_id: id, ...rest }) => ({ id, ...rest })) };
        const [dry] = flyTypesFromTree(tree, [{ name: 'Dry flies (renamed)', id: 101 }]);
        assert.equal(dry.name, 'Dry Flies');
        assert.equal(dry.url, '/dry-flies/');
    });

    it('refuses a Fly Type the tree\'s top level doesn\'t have, naming what it has', () => {
        assert.throws(
            () => flyTypesFromTree(read('tree.json'), [{ name: 'Wet Flies' }]),
            /no top-level category "Wet Flies" in tree 4 \(it has Dry Flies, Nymphs, Streamers, Eggs & Worms, Warmwater Flies, Saltwater Flies, Flies by Species\)/,
        );
    });

    it('refuses a read that mixes trees, so a tree-1 category can never be linked from 1895766', () => {
        const tree = read('tree.json');
        tree.data.push({
            category_id: 23, parent_id: 0, tree_id: 1, name: 'Dry Flies', url: { path: '/flies/dry-flies/' },
        });
        assert.throws(() => flyTypesFromTree(tree, config.flyTypes), /the tree read holds trees 1 and 4: read one tree/);
    });

    it('refuses two top-level categories with the Fly Type\'s name, and a URL that isn\'t a plain path', () => {
        const twice = read('tree.json');
        twice.data.push({
            category_id: 107, parent_id: 0, tree_id: 4, name: 'Nymphs', url: { path: '/nymphs-2/' },
        });
        assert.throws(() => flyTypesFromTree(twice, config.flyTypes), /two top-level categories are named "Nymphs" \(102, 107\): give its id in rows\.json/);
        const odd = read('tree.json');
        odd.data[0].url.path = '/dry-flies/?sort=newest';
        assert.throws(() => flyTypesFromTree(odd, config.flyTypes), /category 101's URL "\/dry-flies\/\?sort=newest" isn't a plain path/);
    });
});

describe('buildTable', () => {
    it('gives one row per chart size, in hook order, each with its anchor', () => {
        assert.deepEqual(table.rows.map(({ size }) => size), CHART_SIZES);
        assert.deepEqual(table.rows.map(({ anchor }) => anchor), CHART_SIZES.map(anchorId));
    });

    it('links each size to the Fly Types whose Live products come in it, rolled up from their sub-types, in Fly Type order', () => {
        assert.deepEqual(names(table.rows), [
            ['6/0', ['Warmwater Flies']], ['5/0', []], ['4/0', ['Warmwater Flies']], ['3/0', []], ['2/0', ['Warmwater Flies']],
            ['1/0', ['Streamers', 'Saltwater Flies']], ['1', []], ['2', ['Streamers', 'Saltwater Flies']], ['4', ['Streamers', 'Saltwater Flies']],
            ['6', ['Streamers']], ['8', ['Streamers']], ['10', ['Streamers']], ['12', ['Dry Flies']], ['14', ['Dry Flies', 'Nymphs']],
            ['16', ['Dry Flies', 'Nymphs']], ['18', ['Dry Flies', 'Nymphs']], ['20', ['Nymphs']], ['22', []], ['24', []],
        ]);
        const fourteen = table.rows.find(({ size }) => size === '14');
        assert.deepEqual(fourteen.links, [
            { name: 'Dry Flies', url: '/dry-flies/', count: 3 },
            { name: 'Nymphs', url: '/nymphs/', count: 1 },
        ]);
    });

    it('reports what it left out, so nothing disappears unseen', () => {
        assert.deepEqual(table.report, {
            counted: 7, notLive: 2, noFlyType: 1, noSizes: 2, offChart: { 26: 1 }, hyphenAughts: 3,
        });
    });

    it('leaves out a Fly Type with fewer Live products in a size than --min', () => {
        const strict = buildTable(products, flyTypes, { min: 2 });
        assert.deepEqual(names(strict.rows).filter(([, links]) => links.length), [
            ['2', ['Streamers']], ['4', ['Streamers']], ['12', ['Dry Flies']], ['14', ['Dry Flies']], ['16', ['Dry Flies']],
        ]);
    });

    it('without roll-up (probe 8), links the categories that hold the products themselves, so every link opens a page with products', () => {
        const direct = buildTable(products, flyTypes, { rollup: false });
        assert.deepEqual(names(direct.rows).filter(([size]) => ['12', '14', '1/0'].includes(size)), [
            ['1/0', ['Streamers', 'Saltwater Flies']],
            ['12', ['Parachute Dry Flies', 'Elk Hair Caddis']],
            ['14', ['Dry Flies', 'Parachute Dry Flies', 'Elk Hair Caddis', 'Bead Head Nymphs']],
        ]);
        assert.equal(direct.rows.find(({ size }) => size === '14').links[2].url, '/dry-flies/caddis-dry-flies/elk-hair-caddis/');
    });
});

describe('renderRows', () => {
    const block = renderRows(table, config);

    it('sits between the two fixed markers', () => {
        assert.ok(block.startsWith(`${MARKERS.start}\n`));
        assert.ok(block.endsWith(`\n${MARKERS.end}`));
        assert.deepEqual(unbalancedTags(block), []);
    });

    it('has one anchored row per size from 6/0 to 24, the size as its row header (story 16)', () => {
        const rows = findTags(block, 'tr').filter(({ attrs }) => attrs.id);
        assert.deepEqual(rows.map(({ attrs }) => attrs.id), CHART_SIZES.map(anchorId));
        const headers = [...block.matchAll(/<th scope="row">([^<]*)<\/th>/g)].map(([, text]) => text);
        assert.deepEqual(headers, CHART_SIZES);
    });

    it('links every row in BigCommerce\'s facet form, with _bc_fsnf=1 and rel="nofollow" (SEO-6)', () => {
        const links = findTags(block, 'a');
        assert.equal(links.length, table.rows.reduce((sum, { links: rowLinks }) => sum + rowLinks.length, 0));
        for (const { attrs } of links) {
            assert.match(decode(attrs.href), /^\/[a-z0-9/-]+\/\?_bc_fsnf=1&Fly\+Sizes=[0-9]+(%2F0)?$/, attrs.href);
            assert.equal(attrs.rel, 'nofollow', attrs.href);
        }
        assert.match(block, /<a href="\/dry-flies\/\?_bc_fsnf=1&amp;Fly\+Sizes=14" rel="nofollow">Dry Flies<\/a>, <a href="\/nymphs\/\?_bc_fsnf=1&amp;Fly\+Sizes=14" rel="nofollow">Nymphs<\/a>/);
        assert.match(block, /<tr id="size-2-0">[\s\S]*?href="\/warmwater-flies\/\?_bc_fsnf=1&amp;Fly\+Sizes=2%2F0"/);
    });

    it('says so in a row whose size no Live product comes in, and gives each row its common uses', () => {
        assert.match(block, new RegExp(`<tr id="size-5-0"><th scope="row">5/0</th><td>[^<]+</td><td>${config.text.none}</td></tr>`));
        for (const { sizes, text } of config.uses) {
            for (const size of sizes) assert.ok(block.includes(`<th scope="row">${size}</th><td>${text}</td>`), size);
        }
    });

    it('escapes names and copy', () => {
        const odd = {
            rows: CHART_SIZES.map(size => ({ size, anchor: anchorId(size), links: size === '10' ? [{ name: 'Eggs & Worms', url: '/eggs-worms/', count: 1 }] : [] })),
        };
        const html = renderRows(odd, { ...config, text: { ...config.text, shop: 'Shop <this> size' } });
        assert.match(html, />Eggs &amp; Worms<\/a>/);
        assert.match(html, /Shop &lt;this&gt; size/);
    });

    it('as text only (channel 1 until the Flip, ticket 53), names the Fly Types without links', () => {
        const text = renderRows(table, config, { links: false });
        assert.equal(findTags(text, 'a').length, 0);
        assert.match(text, /<tr id="size-14"><th scope="row">14<\/th><td>[^<]+<\/td><td>Dry Flies, Nymphs<\/td><\/tr>/);
    });
});

describe('spliceRows', () => {
    const body = read('pages.json').data[1].body;
    const block = renderRows(table, config);

    it('rewrites only the block between the markers, so the copy around it is never touched', () => {
        const next = spliceRows(body, block);
        const [before] = body.split(MARKERS.start);
        const [, after] = body.split(MARKERS.end);
        assert.ok(next.startsWith(before));
        assert.ok(next.endsWith(after));
        assert.equal(next, `${before}${block}${after}`);
        assert.equal(spliceRows(next, block), next, 'a second run changes nothing');
    });

    it('refuses a body without both markers once each, in order', () => {
        assert.throws(() => spliceRows('<p>No rows yet.</p>', block), /the page has no rows start marker/);
        assert.throws(() => spliceRows(`${MARKERS.start}<p>x</p>`, block), /the page has no rows end marker/);
        assert.throws(() => spliceRows(`${MARKERS.start}${MARKERS.start}x${MARKERS.end}`, block), /the page has 2 rows start markers/);
        assert.throws(() => spliceRows(`${MARKERS.end}x${MARKERS.start}`, block), /the rows end marker comes before the start marker/);
    });
});

describe('chartPageRequest', () => {
    const pages = read('pages.json');
    const block = renderRows(table, config);

    it('updates the chart\'s Web Page on 1895766 in a request the store-write helper accepts', () => {
        const { page, request } = chartPageRequest(pages, block);
        assert.equal(page.id, 7);
        assert.equal(request.method, 'PUT');
        assert.equal(request.path, '/v3/content/pages/7');
        assert.deepEqual(Object.keys(request.body), ['channel_id', 'name', 'type', 'body']);
        assert.equal(request.body.channel_id, 1895766);
        assert.equal(request.body.name, 'Fly Hook Size Chart');
        assert.equal(request.body.type, 'page');
        assert.equal(request.body.body, spliceRows(page.body, block));
        const what = classify(request);
        assert.equal(what.object, 'pages');
        assert.equal(what.action, 'update');
        assert.deepEqual(requestChannelProblems(request, what), []);
    });

    it('sends nothing when the rows are already the page\'s', () => {
        const done = structuredClone(pages);
        done.data[1].body = spliceRows(done.data[1].body, block);
        assert.equal(chartPageRequest(done, block).request, null);
    });

    it('refuses when the chart page is missing, doubled, on another channel or read without its body', () => {
        assert.throws(() => chartPageRequest({ data: [pages.data[0]] }, block), new RegExp(`no Web Page at ${CHART_URL} in the read: create it first`));
        assert.throws(() => chartPageRequest({ data: [pages.data[1], { ...pages.data[1], id: 8 }] }, block), /2 Web Pages at \/fly-hook-size-chart\/ \(7, 8\)/);
        assert.throws(() => chartPageRequest({ data: [{ ...pages.data[1], channel_id: 1 }] }, block), /page 7 is on channel 1, not 1895766/);
        const { body, ...bodyless } = pages.data[1];
        assert.equal(typeof body, 'string');
        assert.throws(() => chartPageRequest({ data: [bodyless] }, block), /page 7 has no body: read the pages with include=body/);
    });
});

describe('rows.mjs, run as a command', () => {
    const SCRIPT = path.join(HERE, 'rows.mjs');
    const fixture = name => path.join(FIXTURES, name);
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    const inputs = ['--products', fixture('products.json'), '--assignments', fixture('assignments.json'), '--tree', fixture('tree.json')];

    it('prints the table and what it left out, and writes nothing without an output', () => {
        const { status, stdout, stderr } = run(...inputs);
        assert.equal(status, 0, stderr);
        assert.match(stdout, /^14 +Dry Flies \(3\), Nymphs \(1\)$/m);
        assert.match(stdout, /^5\/0 +-$/m);
        assert.match(stdout, /7 Live products counted/);
        assert.match(stderr, /WARN +sizes off the chart, not shown: 26 \(1 product\)/);
        assert.match(stderr, /WARN +3 aught values are still spelled with a hyphen/);
    });

    it('writes the rows block and the changes file for plan.mjs', () => {
        const dir = scratch();
        const [rowsOut, changes] = [path.join(dir, 'rows.html'), path.join(dir, 'changes.json')];
        const { status, stdout, stderr } = run(...inputs, '--rows-out', rowsOut, '--existing', fixture('pages.json'), '--changes', changes);
        assert.equal(status, 0, stderr);
        assert.equal(fs.readFileSync(rowsOut, 'utf8'), `${renderRows(table, config)}\n`);
        const requests = JSON.parse(fs.readFileSync(changes, 'utf8'));
        assert.deepEqual(requests, [chartPageRequest(read('pages.json'), renderRows(table, config)).request]);
        assert.match(stdout, /wrote +.*changes\.json: PUT \/v3\/content\/pages\/7/);
        assert.match(stdout, /next +node ~\/reelflies\/theme\/cornerstone\/scripts\/store\/plan\.mjs --ticket 35 --changes /);
    });

    it('writes no changes file when the page already has these rows', () => {
        const dir = scratch();
        const pages = read('pages.json');
        pages.data[1].body = spliceRows(pages.data[1].body, renderRows(table, config));
        fs.writeFileSync(path.join(dir, 'pages.json'), JSON.stringify(pages));
        const { status, stdout } = run(...inputs, '--existing', path.join(dir, 'pages.json'), '--changes', path.join(dir, 'changes.json'));
        assert.equal(status, 0);
        assert.match(stdout, /unchanged: the page already has these rows; no changes file written/);
        assert.equal(fs.existsSync(path.join(dir, 'changes.json')), false);
    });

    it('refuses text-only rows in a changes file, and a run with missing reads', () => {
        const dir = scratch();
        const textOnly = run(...inputs, '--text-only', '--existing', fixture('pages.json'), '--changes', path.join(dir, 'changes.json'));
        assert.equal(textOnly.status, 2);
        assert.match(textOnly.stderr, /--text-only rows are for channel 1 \(ticket 53\), which the store-write helper never writes: use --rows-out/);
        const missing = run('--products', fixture('products.json'));
        assert.equal(missing.status, 2);
        assert.match(missing.stderr, /--assignments and --tree are needed/);
        assert.equal(run('--changes', path.join(dir, 'c.json'), ...inputs).status, 2, '--changes needs --existing');
        assert.equal(run(...inputs, '--min', '0').status, 2);
        assert.match(run(...inputs, '--flip').stderr, /unknown argument --flip/);
    });
});
