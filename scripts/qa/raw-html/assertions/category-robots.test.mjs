// Tests the category-robots assertion (ticket 32; R13, SEO-10; story 76) on a category page the
// stock template and the noindex template render (render/partials/category/pages.json), and on
// hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/category-robots.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import categoryRobots, { NOINDEX_PIN } from './category-robots.mjs';

const PARTIALS = path.join(THEME_DIR, 'scripts/qa/render/partials');
const read = file => JSON.parse(fs.readFileSync(path.join(PARTIALS, file), 'utf8'));
const tree4 = read('menu/tree-4.json');
const { pages } = read('category/pages.json');

const page = async (template, key) => ({
    kind: 'category',
    key,
    path: '/',
    status: 200,
    html: await renderPartial(template, {
        page_type: 'category',
        breadcrumbs: pages['sub-type'].breadcrumbs,
        category: pages['sub-type'].category,
        categories: tree4.categories,
        settings: {},
        theme_settings: tree4.theme_settings,
    }),
});
const META = '<meta name="robots" content="noindex, follow">';

test('applies to category pins, ticket 32, and names the noindex pin', () => {
    assert.deepEqual(categoryRobots.pages, ['category']);
    assert.equal(categoryRobots.ticket, 32);
    assert.equal(NOINDEX_PIN, 'category@noindex');
});

test('passes the noindex template\'s page on its pin, and the stock template\'s on the others', async () => {
    assert.deepEqual(categoryRobots.check(await page('pages/custom/category/rf-noindex', NOINDEX_PIN)), []);
    assert.deepEqual(categoryRobots.check(await page('pages/category', 'category')), []);
});

test('fails the noindex pin with no robots meta, two, or another value', async () => {
    const good = await page('pages/custom/category/rf-noindex', NOINDEX_PIN);
    const check = html => categoryRobots.check({ ...good, html }).join('\n');
    assert.match(check(good.html.replace(META, '')), /has no robots meta, not exactly one "noindex, follow"/);
    assert.match(check(good.html.replace(META, `${META}${META}`)), /robots "noindex, follow", robots "noindex, follow"/);
    assert.match(check(good.html.replace(META, '<meta name="robots" content="noindex, nofollow">')), /robots "noindex, nofollow"/);
});

test('fails a stock-template page that says noindex, as from the store\'s head meta tags', async () => {
    const good = await page('pages/category', 'category');
    const html = good.html.replace('<title>', '<meta name="ROBOTS" content="NOINDEX"><title>');
    assert.match(categoryRobots.check({ ...good, html }).join('\n'), /a stock-template category page has robots "NOINDEX"/);
});
