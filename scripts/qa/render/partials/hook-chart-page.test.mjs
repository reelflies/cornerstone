// The hook size chart page (ticket 35; spec module 22; R9, SEO-6, SEO-7, SEO-15; stories 15, 16
// and 71): templates/pages/custom/page/hook-size-chart.html, the Web Page's custom template. The
// page's content is Shaun's copy with the size rows that scripts/hook-chart/rows.mjs writes
// between its two markers (hook-chart/rows.html is a run on that script's fixtures); the template
// puts the gauge (components/reelflies/hook-gauge.html) between the copy and the rows.
//
//   node --test scripts/qa/render/partials/hook-chart-page.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import {
    MARKERS, buildTable, catalogueProducts, flyTypesFromTree, joinPages, readRowsConfig, renderRows,
} from '../../../hook-chart/rows.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROWS = fs.readFileSync(path.join(HERE, 'hook-chart/rows.html'), 'utf8');
const SCRIPT_FIXTURES = path.join(HERE, '../../../hook-chart/fixtures');
const PAGE_FIXTURE = path.join(HERE, '../pages/hook-chart-page/fixtures/chart.json');
const TEMPLATE_FILE = path.join(HERE, '../../../../templates/pages/custom/page/hook-size-chart.html');
const INTRO = '<p>Fly hooks are sized by number. From 1 to 24, the bigger the number, the smaller the hook.</p>';
const OUTRO = '<p>The smallest hook made for sale is a <a href="/blog/the-mustad-277-gold-plated-in-size-32-arguably-the-smallest-hook-ever-made-for-sale-today/">Mustad 277 in size 32</a>.</p>';
const TEMPLATE = 'pages/custom/page/hook-size-chart';

const render = (content = `${INTRO}${ROWS}${OUTRO}`) => renderPartial(TEMPLATE, {
    template: TEMPLATE,
    page_type: 'page',
    breadcrumbs: [{ url: 'https://reelflies.ca/', name: 'Home' }, { url: 'https://reelflies.ca/fly-hook-size-chart/', name: 'Fly Hook Size Chart' }],
    page: { title: 'Fly Hook Size Chart', content },
    settings: {},
    theme_settings: {},
});
const gauge = html => outerHtml(html, 'div', attrs => /(^|\s)rf-hook-gauge(\s|$)/.test(attrs.class || ''));

describe('the hook size chart page (pages/custom/page/hook-size-chart.html)', () => {
    it('has one <main> and one <h1>, the page\'s title', async () => {
        const html = await render();
        assert.equal(findTags(html, 'main').length, 1);
        const h1s = findTags(html, 'h1');
        assert.equal(h1s.length, 1);
        assert.equal(textOf(outerHtml(html, 'h1')), 'Fly Hook Size Chart');
    });

    it('puts the chart\'s gauge between the copy and the size rows, as a labelled group', async () => {
        const html = await render();
        const at = html.indexOf('rf-hook-gauge--chart');
        assert.ok(at > html.indexOf('Fly hooks are sized by number'), 'after the copy');
        assert.ok(at < html.indexOf('<table class="rf-chart-rows">'), 'before the rows');
        assert.ok(html.indexOf('Mustad 277 in size 32') > html.indexOf('</table>'), 'the copy after the rows stays after them');
        const [group] = findTags(gauge(html), 'div');
        assert.equal(group.attrs.role, 'group');
        assert.ok(group.attrs['aria-label'], 'a short text alternative');
    });

    it('links every gauge size to its row on the page, 6/0 to 24', async () => {
        const html = await render();
        const targets = findTags(gauge(html), 'a').map(link => decodeHtml(link.attrs.href));
        assert.equal(targets[0], '#size-6-0');
        assert.equal(targets[targets.length - 1], '#size-24');
        const rows = new Set(findTags(html, 'tr').map(row => row.attrs.id).filter(Boolean));
        for (const target of targets) assert.ok(rows.has(target.slice(1)), `${target} has its row`);
    });

    it('keeps the rows\' facet links as the script writes them: _bc_fsnf=1 and rel="nofollow" (SEO-6)', async () => {
        const table = outerHtml(await render(), 'table', attrs => attrs.class === 'rf-chart-rows');
        const links = findTags(table, 'a');
        assert.ok(links.length > 0);
        for (const link of links) {
            assert.match(decodeHtml(link.attrs.href), /[?&]_bc_fsnf=1(&|$)/);
            assert.equal(link.attrs.rel, 'nofollow');
        }
    });

    it('never prints the start marker, and balances the page', async () => {
        const html = await render();
        assert.equal(html.includes(MARKERS.start), false);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('with no rows block yet, shows the copy alone: the gauge\'s links would lead nowhere', async () => {
        const html = await render(`${INTRO}${OUTRO}`);
        assert.match(html, /Mustad 277 in size 32/);
        assert.equal(html.includes('rf-hook-gauge'), false);
        assert.equal(findTags(html, 'table').length, 0);
    });
});

describe('the rows the page is tested with are the script\'s', () => {
    const read = file => JSON.parse(fs.readFileSync(path.join(SCRIPT_FIXTURES, file), 'utf8'));
    const pages = (file, what) => joinPages([{ file, read: read(file) }], what);

    it('hook-chart/rows.html is what rows.mjs writes from its own fixtures', () => {
        const config = readRowsConfig();
        const products = catalogueProducts(pages('products.json', 'products'), pages('assignments.json', 'channel assignments'));
        const table = buildTable(products, flyTypesFromTree(pages('tree.json', 'tree'), config.flyTypes));
        assert.equal(`${renderRows(table, config)}\n`, ROWS);
    });

    it('the fixture page\'s content holds those rows, and the template splits at rows.mjs\'s own start marker', () => {
        const fixture = JSON.parse(fs.readFileSync(PAGE_FIXTURE, 'utf8'));
        assert.ok(fixture.page_context.page.content.includes(ROWS.trim()), 'chart.json holds rows.html');
        const template = fs.readFileSync(TEMPLATE_FILE, 'utf8');
        const literals = [...template.matchAll(/'(<!-- rf:hook-chart-rows [^']*-->)'/g)].map(match => match[1]);
        assert.deepEqual(literals, [MARKERS.start, MARKERS.start]);
    });
});
