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
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags } from '../qa/raw-html/html.mjs';
import { unbalancedTags } from '../qa/render/html-checks.mjs';
import { classify } from '../store/allowlist.mjs';
import { requestChannelProblems } from '../store/channel.mjs';
import { CHART_SIZES, CHART_URL as SHARED_CHART_URL, anchorId } from '../hook-gauge/sizes.mjs';
import {
    CHART_URL, MARKERS, buildTable, catalogueProducts, chartPageRequest, flyTypesFromTree, joinPages, readRowsConfig, renderRows, rowsConfigProblems, spliceRows,
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
const scratches = [];
const scratch = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-hook-chart-'));
    scratches.push(dir);
    return dir;
};
after(() => scratches.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

// A read split into pages of `perPage`, each as the API answers it, with its meta.pagination.
const paged = (whole, perPage) => {
    const items = whole.data;
    const totalPages = Math.max(Math.ceil(items.length / perPage), 1);
    return Array.from({ length: totalPages }, (_, index) => {
        const data = items.slice(index * perPage, (index + 1) * perPage);
        return {
            data,
            meta: {
                pagination: {
                    total: items.length, count: data.length, per_page: perPage, current_page: index + 1, total_pages: totalPages,
                },
            },
        };
    });
};
const named = (pages, prefix) => pages.map((page, index) => ({ file: `${prefix}-p${index + 1}.json`, read: page }));

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

describe('joinPages: a paged read, from one saved file per page', () => {
    const tree = read('tree.json');
    const pages = paged(tree, 5);

    it('joins every page, in page order whatever order the files come in', () => {
        assert.equal(pages.length, 3);
        const joined = joinPages(named(pages, 'tree').reverse(), 'tree');
        assert.deepEqual(joined.data, tree.data);
        assert.deepEqual(joinPages([{ file: 'tree.json', read: tree }], 'tree').data, tree.data);
    });

    it('takes an empty read as its one page', () => {
        const pagination = {
            total: 0, count: 0, per_page: 50, current_page: 1, total_pages: 0,
        };
        const empty = { data: [], meta: { pagination } };
        assert.deepEqual(joinPages([{ file: 'none.json', read: empty }], 'channel assignments').data, []);
    });

    it('refuses a page given twice, and a page left out, naming the files', () => {
        const [first, second, third] = named(pages, 'tree');
        assert.throws(() => joinPages([first, { ...first, file: 'again.json' }, second, third], 'tree'), /^Error: the tree read gives page 1 twice \(tree-p1\.json, again\.json\): give each page once$/);
        assert.throws(() => joinPages([first, third], 'tree'), /^Error: the tree read has no page 2 of 3: give every page from 1 to 3, each once$/);
        assert.throws(() => joinPages([second, third], 'tree'), /no page 1 of 3/);
    });

    it('refuses a file that isn\'t a page as the API answers it', () => {
        assert.throws(() => joinPages([{ file: 'bare.json', read: tree.data }], 'tree'), /^Error: the tree read bare\.json isn't a page as the API answers it: save each page with its "data" and "meta\.pagination"$/);
        assert.throws(() => joinPages([{ file: 'no-meta.json', read: { data: tree.data } }], 'tree'), /no-meta\.json isn't a page as the API answers it/);
        assert.throws(() => joinPages([], 'tree'), /no tree read/);
    });

    it('refuses pages of different reads, a page past the last, and pages that don\'t add up to the read\'s total', () => {
        const [first, second, third] = named(pages, 'tree');
        const other = structuredClone(second);
        other.read.meta.pagination.total_pages = 4;
        assert.throws(() => joinPages([first, other, third], 'tree'), /^Error: the tree read's pages come from different reads: tree-p1\.json says 3 pages and 13 items, tree-p2\.json says 4 pages and 13 items$/);
        const past = structuredClone(third);
        past.read.meta.pagination.current_page = 4;
        assert.throws(() => joinPages([first, second, third, { ...past, file: 'p4.json' }], 'tree'), /p4\.json is page 4, but the tree read has 3 pages/);
        const short = structuredClone(second);
        short.read.data.pop();
        assert.throws(() => joinPages([first, short, third], 'tree'), /^Error: page 2 of the tree read \(tree-p2\.json\) holds 4 items but says it holds 5$/);
        short.read.meta.pagination.count = 4;
        assert.throws(() => joinPages([first, short, third], 'tree'), /^Error: the tree read's pages hold 12 items, but the read says 13: the store changed while it was read, so read every page again$/);
    });
});

describe('catalogueProducts', () => {
    const byId = Object.fromEntries(products.map(product => [product.id, product]));

    it('counts a product only when it is visible and assigned to ReelFlies_CA (1895766)', () => {
        assert.equal(byId[1].listed, true);
        assert.equal(byId[7].listed, false, 'not visible');
        assert.equal(byId[8].listed, false, 'assigned to channel 1 only');
    });

    it('reads the Fly Sizes option only, in hook-size spelling, and keeps aughts still spelled with a hyphen', () => {
        assert.deepEqual(byId[1].sizes, ['12', '14', '16', '18']);
        assert.deepEqual(byId[5].sizes, ['6/0', '4/0', '2/0']);
        assert.equal(byId[5].hyphenAughts, 3);
        assert.deepEqual(byId[10].sizes, [], 'a "Size" option isn\'t the Fly Sizes facet');
        assert.deepEqual(byId[11].sizes, ['26', '14']);
        assert.deepEqual(byId[12].sizes, []);
    });

    it('counts a hyphen-spelled aught only when sizes.mjs reads it as a hook size', () => {
        const odd = read('products.json');
        odd.data[0].variants = ['0-0', '100-0', '14', '3-0'].map((label, index) => ({
            id: 9000 + index, inventory_level: 1, purchasing_disabled: false, option_values: [{ label, option_display_name: 'Fly Sizes' }],
        }));
        const [first] = catalogueProducts(odd, read('assignments.json'));
        assert.deepEqual(first.sizes, ['14', '3/0']);
        assert.equal(first.hyphenAughts, 1, '0-0 and 100-0 aren\'t hook sizes');
    });

    // The store hides out-of-stock options from filtering (probe 10), so the rows count only the
    // sizes a shopper can buy now.
    describe('stock: the sizes a shopper can buy now (inStock)', () => {
        it('tracked by variant, a size is in stock while any of its variants is above zero and for sale', () => {
            assert.deepEqual(byId[1].inStock, byId[1].sizes);
            assert.deepEqual(byId[15].sizes, ['16', '18']);
            assert.deepEqual(byId[15].inStock, ['16'], 'one colour of 16 is in stock; both colours of 18 are at zero');
        });

        it('a variant in stock but not for sale (purchasing_disabled) doesn\'t count', () => {
            assert.deepEqual(byId[13].sizes, ['20', '22', '24']);
            assert.deepEqual(byId[13].inStock, [], '20 and 22 are at zero, and 24 is disabled');
        });

        it('tracked by product, every size follows the product\'s level, whatever its variants say', () => {
            assert.deepEqual(byId[4].inStock, ['10', '8', '6', '4', '2'], 'the product is above zero, its variants at zero');
            assert.deepEqual(byId[14].sizes, ['2/0', '1/0']);
            assert.deepEqual(byId[14].inStock, [], 'the product is at zero, its variants above');
        });

        it('not tracked, every size is in stock, even at zero', () => {
            assert.deepEqual(byId[6].inStock, ['1/0', '2', '4']);
        });

        it('refuses a read without the stock fields, rather than guess', () => {
            // The first product changed by `edit`, and its variant `at` by `editVariant`.
            const reading = (edit, at, editVariant) => {
                const changed = read('products.json');
                const [first] = changed.data;
                changed.data[0] = edit({ ...first, variants: first.variants.map((variant, index) => (index === at ? editVariant(variant) : variant)) });
                return () => catalogueProducts(changed, read('assignments.json'));
            };
            const same = value => value;
            assert.throws(reading(product => ({ ...product, inventory_tracking: undefined })), /^Error: product 1's inventory_tracking is undefined, not none, product or variant: read the products as the API answers them$/);
            assert.throws(reading(product => ({ ...product, inventory_tracking: 'sku' })), /product 1's inventory_tracking is "sku"/);
            assert.throws(reading(product => ({ ...product, inventory_tracking: 'product', inventory_level: undefined })), /^Error: product 1 tracks stock by product but has no inventory_level$/);
            assert.throws(reading(same, 1, variant => ({ ...variant, inventory_level: undefined })), /^Error: variant 1002 of product 1 has no inventory_level, and the product tracks stock by variant$/);
            assert.throws(reading(same, 2, variant => ({ ...variant, purchasing_disabled: undefined })), /^Error: variant 1003 of product 1 has no purchasing_disabled: read the products with include=variants, every field$/);
        });
    });

    it('refuses reads in the wrong shape', () => {
        assert.throws(() => catalogueProducts({ products: [] }, read('assignments.json')), /the products read must be \{ "data": \[…\] \} or an array/);
        assert.throws(() => catalogueProducts({ data: [{ id: 1, is_visible: true, categories: [] }] }, []), /product 1 has no variants: read the products with include=variants/);
    });

    it('refuses a product or a channel assignment read twice, as when the catalogue changes between pages', () => {
        const twice = read('products.json');
        twice.data.push(twice.data[2]);
        assert.throws(() => catalogueProducts(twice, read('assignments.json')), /^Error: product 3 is in the products read twice: the store changed while it was read, or a page was given twice, so read every page again$/);
        const assignments = read('assignments.json');
        assignments.data.push(assignments.data[0]);
        assert.throws(() => catalogueProducts(read('products.json'), assignments), /product 1's assignment to channel 1895766 is in the channel assignments read twice/);
    });
});

describe('flyTypesFromTree', () => {
    it('finds the six Fly Types at tree 4\'s top level, with their URLs and every category below each', () => {
        assert.deepEqual(flyTypes.map(({ name, url }) => [name, url]), [
            ['Dry Flies', '/dry-flies/'], ['Nymphs', '/nymphs/'], ['Streamers', '/streamers/'],
            ['Eggs & Worms', '/eggs-worms/'], ['Warmwater Flies', '/warmwater-flies/'], ['Saltwater Flies', '/saltwater-flies/'],
        ]);
        assert.deepEqual(flyTypes[0].categories.map(({ id }) => id), [101, 111, 112, 113]);
        assert.deepEqual(flyTypes[1].categories.map(({ id }) => id), [102, 121, 122]);
    });

    it('gives each category its depth below the Fly Type, for the roll-up report', () => {
        assert.deepEqual(flyTypes[0].categories.map(({ id, depth }) => [id, depth]), [[101, 0], [111, 1], [112, 1], [113, 2]]);
    });

    it('marks a hidden category, and every category below one, as hidden', () => {
        assert.deepEqual(flyTypes[1].categories.map(({ id, hidden }) => [id, hidden]), [[102, false], [121, false], [122, true]]);
        const tree = read('tree.json');
        tree.data.find(({ category_id: id }) => id === 112).is_visible = false;
        const [dry] = flyTypesFromTree(tree, config.flyTypes);
        assert.deepEqual(dry.categories.map(({ id, hidden }) => [id, hidden]), [[101, false], [111, false], [112, true], [113, true]], 'Elk Hair Caddis is visible, but under a hidden category');
    });

    it('refuses a hidden Fly Type, which the rows would otherwise link', () => {
        const tree = read('tree.json');
        tree.data.find(({ category_id: id }) => id === 102).is_visible = false;
        assert.throws(() => flyTypesFromTree(tree, config.flyTypes), /^Error: the Fly Type "Nymphs" \(102\) is hidden in tree 4: the rows never link a hidden category, so make it visible or take it out of rows\.json$/);
    });

    it('refuses a category read without is_visible', () => {
        const tree = read('tree.json');
        delete tree.data[3].is_visible;
        assert.throws(() => flyTypesFromTree(tree, config.flyTypes), /^Error: category 113 has no is_visible: read the tree as the API answers it$/);
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
            category_id: 23, parent_id: 0, tree_id: 1, name: 'Dry Flies', url: { path: '/flies/dry-flies/' }, is_visible: true,
        });
        assert.throws(() => flyTypesFromTree(tree, config.flyTypes), /the tree read holds trees 1 and 4: read one tree/);
    });

    it('refuses two top-level categories with the Fly Type\'s name, and a URL that isn\'t a plain path', () => {
        const twice = read('tree.json');
        twice.data.push({
            category_id: 107, parent_id: 0, tree_id: 4, name: 'Nymphs', url: { path: '/nymphs-2/' }, is_visible: true,
        });
        assert.throws(() => flyTypesFromTree(twice, config.flyTypes), /two top-level categories are named "Nymphs" \(102, 107\): give its id in rows\.json/);
        const odd = read('tree.json');
        odd.data[0].url.path = '/dry-flies/?sort=newest';
        assert.throws(() => flyTypesFromTree(odd, config.flyTypes), /category 101's URL "\/dry-flies\/\?sort=newest" isn't a plain path/);
    });

    it('refuses a category read twice', () => {
        const twice = read('tree.json');
        twice.data.push(twice.data[1]);
        assert.throws(() => flyTypesFromTree(twice, config.flyTypes), /^Error: category 111 is in the tree read twice: the store changed while it was read, or a page was given twice, so read every page again$/);
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
            counted: 8,
            notListed: 2,
            noFlyType: 1,
            hiddenOnly: 1,
            noSizes: 2,
            outOfStock: 2,
            offChart: { 26: 1 },
            hyphenAughts: 3,
            stock: [{ size: '1/0', name: 'Warmwater Flies' }, { size: '22', name: 'Nymphs' }, { size: '24', name: 'Nymphs' }],
            deep: [],
            deepOnly: 1,
        });
    });

    it('leaves out a Fly Type with fewer Live products in a size than --min', () => {
        const strict = buildTable(products, flyTypes, { min: 2 });
        assert.deepEqual(names(strict.rows).filter(([, links]) => links.length), [
            ['2', ['Streamers']], ['4', ['Streamers']], ['12', ['Dry Flies']], ['14', ['Dry Flies']], ['16', ['Dry Flies', 'Nymphs']],
        ]);
    });

    // Probe 10: the store hides out-of-stock options from filtering, so a link whose size is out
    // of stock in every product would open an empty listing.
    describe('stock', () => {
        const linkOf = (result, size, name) => result.rows.find(row => row.size === size).links.find(link => link.name === name);

        it('never links a size that is out of stock in every product, and lists each link it leaves out', () => {
            assert.equal(linkOf(table, '1/0', 'Warmwater Flies'), undefined, 'the Deer Hair Mouse is at zero, tracked by product');
            assert.equal(linkOf(table, '22', 'Nymphs'), undefined, 'the Zebra Midge\'s 22 is at zero');
            assert.equal(linkOf(table, '24', 'Nymphs'), undefined, 'the Zebra Midge\'s 24 is in stock but not for sale');
            assert.deepEqual(table.report.stock.map(({ size, name }) => `${size} ${name}`), ['1/0 Warmwater Flies', '22 Nymphs', '24 Nymphs']);
        });

        it('counts only the products in stock in a size, so a link at --min can drop for stock', () => {
            assert.equal(linkOf(table, '18', 'Nymphs').count, 1, 'the Copper John is out of stock in 18');
            assert.equal(linkOf(table, '16', 'Nymphs').count, 2, 'and in stock in 16');
            assert.equal(linkOf(table, '20', 'Nymphs').count, 1, 'the Zebra Midge is out of stock in 20');
            const strict = buildTable(products, flyTypes, { min: 2 });
            assert.deepEqual(strict.report.stock.map(({ size, name }) => `${size} ${name}`), ['2/0 Warmwater Flies', '18 Nymphs', '20 Nymphs']);
        });

        it('with stockOuts (--count-stock-outs), counts every size whatever its stock, and still lists the links that rely on it', () => {
            const all = buildTable(products, flyTypes, { stockOuts: true });
            assert.equal(linkOf(all, '1/0', 'Warmwater Flies').count, 1);
            assert.equal(linkOf(all, '18', 'Nymphs').count, 2);
            assert.deepEqual(names(all.rows).filter(([size]) => ['22', '24'].includes(size)), [['22', ['Nymphs']], ['24', ['Nymphs']]]);
            assert.deepEqual(all.report.stock, table.report.stock);
            assert.equal(all.report.counted, 10);
            assert.equal(all.report.outOfStock, 2);
        });

        it('without roll-up, checks the stock of each category it links', () => {
            const direct = buildTable(products, flyTypes, { rollup: false });
            assert.deepEqual(direct.report.stock.map(({ size, name }) => `${size} ${name}`), ['1/0 Warmwater Flies', '18 Nymphs', '22 Bead Head Nymphs', '24 Bead Head Nymphs']);
            assert.deepEqual(names(direct.rows).find(([size]) => size === '18'), ['18', ['Parachute Dry Flies', 'Bead Head Nymphs']]);
        });
    });

    describe('hidden categories', () => {
        it('counts no product through a hidden category, and reports the products placed only there', () => {
            assert.equal(table.report.hiddenOnly, 1, 'the Perdigon sits only in Euro Nymphs, which is hidden');
            assert.equal(table.rows.find(({ size }) => size === '14').links.find(({ name }) => name === 'Nymphs').count, 1);
        });

        it('never links a hidden category, or one below it, without roll-up', () => {
            const tree = read('tree.json');
            tree.data.find(({ category_id: id }) => id === 112).is_visible = false;
            const hidden = flyTypesFromTree(tree, config.flyTypes);
            const direct = buildTable(products, hidden, { rollup: false });
            const linked = direct.rows.flatMap(({ links }) => links.map(({ name }) => name));
            assert.equal(linked.includes('Caddis Dry Flies'), false);
            assert.equal(linked.includes('Elk Hair Caddis'), false);
            assert.equal(linked.includes('Euro Nymphs'), false);
            assert.equal(direct.report.hiddenOnly, 2, 'the Elk Hair Caddis and the Perdigon');
            assert.equal(buildTable(products, hidden).rows.find(({ size }) => size === '12').links[0].count, 1, 'rolled up, the Elk Hair Caddis no longer counts');
        });
    });

    describe('roll-up depth (probe 8 proved one level)', () => {
        it('counts the products placed only two or more levels below their Fly Type', () => {
            assert.equal(table.report.deepOnly, 1, 'the Elk Hair Caddis, in Dry Flies > Caddis Dry Flies > Elk Hair Caddis');
            assert.deepEqual(table.report.deep, [], 'every link also has a product within one level');
        });

        it('lists the links that rely on deeper roll-up, for the R1 rerun and the spot check', () => {
            const withoutAdams = products.filter(({ id }) => id !== 1);
            assert.deepEqual(buildTable(withoutAdams, flyTypes).report.deep, [{ size: '12', name: 'Dry Flies' }, { size: '16', name: 'Dry Flies' }]);
            assert.deepEqual(buildTable(products, flyTypes, { min: 2 }).report.deep, [{ size: '12', name: 'Dry Flies' }, { size: '16', name: 'Dry Flies' }]);
            assert.deepEqual(buildTable(withoutAdams, flyTypes, { rollup: false }).report.deep, [], 'without roll-up, every link is the category itself');
        });
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
        const [, rest] = body.split(MARKERS.end);
        assert.ok(next.startsWith(before));
        assert.ok(next.endsWith(rest));
        assert.equal(next, `${before}${block}${rest}`);
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

    it('finds the chart page at the one chart URL the gauge links to', () => {
        assert.equal(CHART_URL, SHARED_CHART_URL);
    });

    it('updates the chart\'s Web Page on 1895766 in a request the store-write helper accepts', () => {
        const { page, request } = chartPageRequest(pages, block);
        assert.equal(page.id, 7);
        assert.equal(request.method, 'PUT');
        assert.equal(request.path, '/v3/content/pages/7');
        assert.equal(request.body.channel_id, 1895766);
        assert.equal(request.body.name, 'Fly Hook Size Chart');
        assert.equal(request.body.type, 'page');
        assert.equal(request.body.body, spliceRows(page.body, block));
        const what = classify(request);
        assert.equal(what.object, 'pages');
        assert.equal(what.action, 'update');
        assert.deepEqual(requestChannelProblems(request, what), []);
    });

    // BigCommerce's page update documents defaults for fields it isn't sent (is_visible true,
    // meta_description "" …), and plan.mjs diffs only the fields sent, so a field left out could
    // change unseen (spec review, round 2).
    it('sends every field the read gave back but the id, as read, so only the body changes', () => {
        const { page, request } = chartPageRequest(pages, block);
        const { id, ...fields } = page;
        assert.equal(id, 7);
        assert.equal('id' in request.body, false);
        assert.deepEqual({ ...request.body, body: page.body }, fields);
        assert.deepEqual(Object.keys(request.body).filter(key => request.body[key] !== page[key]), ['body']);
        assert.equal(request.body.is_visible, false, 'a hidden page stays hidden');
        assert.equal(request.body.meta_description, 'Fly hook sizes from 6/0 to 24.');
        assert.equal(request.body.search_keywords, 'hook sizes,size chart');
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
    const THEME = path.join(HERE, '..', '..');
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', cwd: THEME });
    const inputs = ['--products', fixture('products.json'), '--assignments', fixture('assignments.json'), '--tree', fixture('tree.json')];
    // Each read saved one file per page, as the API answers it, and given as one option per page.
    const pageFiles = (dir, name, perPage) => paged(read(name), perPage).map((page, index) => {
        const file = path.join(dir, `${path.basename(name, '.json')}-p${index + 1}.json`);
        fs.writeFileSync(file, JSON.stringify(page));
        return file;
    });
    const repeat = (flag, files) => files.flatMap(file => [flag, file]);

    it('prints the table and what it left out, and writes nothing without an output', () => {
        const { status, stdout, stderr } = run(...inputs);
        assert.equal(status, 0, stderr);
        assert.match(stdout, /^14 +Dry Flies \(3\), Nymphs \(1\)$/m);
        assert.match(stdout, /^5\/0 +-$/m);
        assert.match(stdout, /^counted +8 products visible and assigned to ReelFlies_CA \(1895766\), rolled up to the 6 Fly Types; left out: 2 not visible and assigned to 1895766, 1 with no Fly Type Placement, 1 placed only in hidden categories, 2 with no Fly Sizes, 2 out of stock in every size$/m);
        assert.match(stdout, /^stock +3 links left out because every variant of the size is out of stock or not for sale, which the store hides from filtering \(probe 10\): 1\/0 Warmwater Flies, 22 Nymphs, 24 Nymphs$/m);
        assert.match(stdout, /^deep +0 links need roll-up deeper than the one level probe 8 proved; 1 product counted only through a category two or more levels down$/m);
        assert.match(stderr, /WARN +sizes off the chart, not shown: 26 \(1 product\)/);
        assert.match(stderr, /WARN +3 aught values are still spelled with a hyphen/);
        assert.match(stderr, /^WARN +the rows' copy in scripts\/hook-chart\/rows\.json is draft, not approved by Shaun yet$/m);
    });

    it('reads each read from one file per page, in any order, as it reads the whole read from one file', () => {
        const dir = scratch();
        const whole = run(...inputs);
        const productPages = pageFiles(dir, 'products.json', 5);
        const assignmentPages = pageFiles(dir, 'assignments.json', 4);
        const treePages = pageFiles(dir, 'tree.json', 7);
        assert.deepEqual([productPages.length, assignmentPages.length, treePages.length], [4, 5, 2]);
        const split = run(...repeat('--products', productPages), ...repeat('--assignments', assignmentPages.reverse()), ...repeat('--tree', treePages.reverse()));
        assert.equal(split.status, 0, split.stderr);
        assert.equal(split.stdout, whole.stdout);
        assert.match(split.stdout, /^12 +Dry Flies \(2\)$/m);
        assert.match(split.stdout, /^14 +Dry Flies \(3\), Nymphs \(1\)$/m);
    });

    it('refuses a page given twice or left out, and a read saved without its pagination, before it prints a table', () => {
        const dir = scratch();
        const productPages = pageFiles(dir, 'products.json', 5);
        const treePages = pageFiles(dir, 'tree.json', 7);
        const others = ['--assignments', fixture('assignments.json'), '--tree', fixture('tree.json')];
        const twice = run(...repeat('--products', [productPages[0], ...productPages]), ...others);
        assert.equal(twice.status, 1);
        assert.equal(twice.stdout, '');
        assert.match(twice.stderr, /^rows\.mjs: the products read gives page 1 twice \(.*products-p1\.json, .*products-p1\.json\): give each page once$/m);
        const missing = run('--products', fixture('products.json'), '--assignments', fixture('assignments.json'), '--tree', treePages[1]);
        assert.equal(missing.status, 1);
        assert.match(missing.stderr, /^rows\.mjs: the tree read has no page 1 of 2: give every page from 1 to 2, each once$/m);
        const bare = path.join(dir, 'bare.json');
        fs.writeFileSync(bare, JSON.stringify(read('tree.json').data));
        const unpaged = run('--products', fixture('products.json'), '--assignments', fixture('assignments.json'), '--tree', bare);
        assert.equal(unpaged.status, 1);
        assert.match(unpaged.stderr, /rows\.mjs: the tree read .*bare\.json isn't a page as the API answers it/);
    });

    it('--no-rollup links the categories that hold each size\'s products, and --min leaves out a link with fewer', () => {
        const direct = run(...inputs, '--no-rollup');
        assert.equal(direct.status, 0, direct.stderr);
        assert.match(direct.stdout, /^14 +Dry Flies \(1\), Parachute Dry Flies \(1\), Elk Hair Caddis \(1\), Bead Head Nymphs \(1\)$/m);
        assert.match(direct.stdout, /^counted +8 products .*, linked to the categories that hold them; left out/m);
        assert.doesNotMatch(direct.stdout, /^deep/m, 'without roll-up, depth doesn\'t matter');
        const strict = run(...inputs, '--min', '2');
        assert.equal(strict.status, 0, strict.stderr);
        assert.match(strict.stdout, /^14 +Dry Flies \(3\)$/m);
        assert.match(strict.stdout, /^20 +-$/m);
        assert.match(strict.stdout, /rolled up to the 6 Fly Types, at least 2 a link; left out/);
        assert.match(strict.stdout, /^deep +2 links need roll-up deeper than the one level probe 8 proved: 12 Dry Flies, 16 Dry Flies; 1 product/m);
    });

    it('--count-stock-outs counts every size whatever its stock, and lists the links that rely on it', () => {
        const all = run(...inputs, '--count-stock-outs');
        assert.equal(all.status, 0, all.stderr);
        assert.match(all.stdout, /^1\/0 +Streamers \(1\), Warmwater Flies \(1\), Saltwater Flies \(1\)$/m);
        assert.match(all.stdout, /^22 +Nymphs \(1\)$/m);
        assert.match(all.stdout, /^counted +10 products .*, out-of-stock sizes included; left out: .*, 2 with no Fly Sizes$/m);
        assert.match(all.stdout, /^stock +3 links kept although every variant of the size is out of stock or not for sale \(--count-stock-outs\): 1\/0 Warmwater Flies, 22 Nymphs, 24 Nymphs$/m);
    });

    it('--config takes another copy and Fly Type list, and warns only while that copy is a draft', () => {
        const dir = scratch();
        const approved = path.join(dir, 'rows.json');
        fs.writeFileSync(approved, JSON.stringify({ ...config, status: 'approved', text: { ...config.text, none: 'None in stock' } }));
        const rowsOut = path.join(dir, 'rows.html');
        const { status, stderr } = run(...inputs, '--config', approved, '--rows-out', rowsOut);
        assert.equal(status, 0, stderr);
        assert.doesNotMatch(stderr, /copy in/);
        assert.match(fs.readFileSync(rowsOut, 'utf8'), /<tr id="size-5-0"><th scope="row">5\/0<\/th><td>[^<]+<\/td><td>None in stock<\/td><\/tr>/);
        const broken = path.join(dir, 'broken.json');
        fs.writeFileSync(broken, JSON.stringify({ ...config, status: 'final' }));
        const refused = run(...inputs, '--config', broken);
        assert.equal(refused.status, 1);
        assert.match(refused.stderr, /^rows\.mjs: .*broken\.json can't be used:\n- status must be draft or approved, not "final"$/m);
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
