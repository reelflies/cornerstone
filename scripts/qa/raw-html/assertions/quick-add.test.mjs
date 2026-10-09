// Tests the quick-add assertion (ticket 43; UX-8, SCOPE-3; stories 29, 35 and 68) on listing cards
// the templates render from channel 1's search results for "streamer", and on hand-made
// breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/quick-add.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import quickAdd from './quick-add.mjs';

const { products } = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/partials/card/products.json'), 'utf8'));
const CALLER = 'rf-test/quick-add-grid';
const grid = (on = true, before = '') => renderPartial(CALLER, {
    products, settings: {}, theme_settings: { rf_quick_add: on, show_product_quick_view: true },
}, { overrides: { [CALLER]: `${before}{{> components/products/grid products=products theme_settings=theme_settings event="list"}}` } });
const page = (html, kind = 'search') => ({
    kind, key: kind, path: '/', status: 200, html,
});
const problems = (html, kind) => quickAdd.check(page(html, kind)).join('\n');

test('applies to every page, ticket 43', () => {
    assert.equal(quickAdd.id, 'quick-add');
    assert.equal(quickAdd.ticket, 43);
    assert.equal(quickAdd.pages, undefined);
});

test('passes a listing with quick add on, and the stock cards with it off', async () => {
    assert.deepEqual(quickAdd.check(page(await grid(true))), []);
    assert.deepEqual(quickAdd.check(page(await grid(false))), []);
    assert.deepEqual(quickAdd.check(page(await grid(true, "{{assignVar 'rf_product_page' 1}}"), 'product')), []);
});

test('fails "+ Add" beside the stock actions, without its link, or without the pattern\'s name', async () => {
    const good = await grid(true);
    assert.match(problems(good.replace('<div class="rf-qa-wrap"', '<div class="card-figcaption rf-card-actions"></div><div class="rf-qa-wrap"')), /card 4831 has "\+ Add" and the stock actions row too/);
    assert.match(problems(good.replace(`href="${products[0].url}" data-rf-quick-add`, 'href="#" data-rf-quick-add')), /"\+ Add" for product 4831 isn't a link to its page/);
    assert.match(problems(good.replace('<span class="is-srOnly"> Royal Coachman Streamer</span>', '')), /card 4831's "\+ Add" reads "Add", not "Add" and the pattern's name/);
    assert.match(problems(good.replace('data-rf-quick-add="4831"', 'data-rf-quick-add="4804"')), /card 4831's "\+ Add" names another product/);
});

test('fails a card Quick view beside "+ Add", "+ Add" on a sold-out card or a product page, and a panel in the server HTML', async () => {
    const good = await grid(true);
    assert.match(problems(`${good}<button type="button" class="button quickview">Quick view</button>`), /1 card Quick view buttons beside "\+ Add"/);
    assert.match(problems(good.replace('<figure class="card-figure">', '<figure class="card-figure"><div class="sold-out-flag-side">Sold out</div>')), /card 4831 is sold out in every size and has "\+ Add"/);
    assert.match(problems(good, 'product'), /2 "\+ Add" on a product page/);
    assert.match(problems(`${good}<dialog data-rf-qa-panel></dialog>`), /panel is in the server HTML/);
    assert.match(problems(`${good}<a href="/x/" data-rf-quick-add="1">Add</a>`), /1 "\+ Add" outside a card/);
});

test('fails stock\'s Add to Cart on a card beside "+ Add": a card with no options links to its page while quick add is on (criterion 4)', async () => {
    const good = await grid(true);
    const add = '<a href="https://reelflies.ca/cart.php?action=add&amp;product_id=5879" data-event-type="product-click" data-button-type="add-cart" class="button button--small card-figcaption-button">Add to Cart</a>';
    const row = good.match(/<a href="https:\/\/reelflies\.ca\/42-ch-bow-river-streamers\/"[^>]*class="button button--small card-figcaption-button"[^>]*>[\s\S]*?<\/a>/);
    assert.ok(row, 'the card with no options links to its page');
    assert.match(problems(good.replace(row[0], add)), /card 5879 has stock's Add to Cart beside "\+ Add"/);
    assert.deepEqual(quickAdd.check(page(await grid(false))), [], 'with quick add off it is stock\'s');
});
