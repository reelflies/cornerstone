// Tests the quick-add assertion (ticket 43; redesign step 3; UX-8, SCOPE-3; stories 29, 35 and
// 68) on the specimen cards the templates render from channel 1's search results for "streamer"
// (render/partials/card/products.json), as a listing's grid with and without the Quick order
// switch, on the product page's related patterns, and on hand-made breakages of them.
//
//   node --test scripts/qa/raw-html/assertions/quick-add.test.mjs

import fs from 'fs';
import path from 'path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR, renderPartial } from '../../render/render.mjs';
import { productPage } from '../../render/partials/product-page/context.mjs';
import quickAdd from './quick-add.mjs';

const { products } = JSON.parse(fs.readFileSync(path.join(THEME_DIR, 'scripts/qa/render/partials/card/products.json'), 'utf8'));
const THEME = { rf_price_unit_exclude: 'Fly Gear,Fly Selections & Fly Boxes', product_list_display_mode: 'grid' };
// The grid alone, as a facet refresh renders it, with the switch as `on` says.
const CALLER = 'rf-test/quick-add-grid';
const grid = (on = true) => renderPartial(CALLER, {
    products, settings: {}, theme_settings: { ...THEME, rf_quick_add: on },
}, { overrides: { [CALLER]: '{{> components/products/grid products=products theme_settings=theme_settings event="list"}}' } });
// A category's whole listing: the row above the grid, with the Photos / Quick order switch while
// quick add is on, then the grid.
const listing = (on = true) => renderPartial('components/category/product-listing', {
    category: { name: 'Streamers', products, faceted_search_enabled: false },
    pagination: { category: { sort: 'featured' } },
    settings: {},
    theme_settings: { ...THEME, rf_quick_add: on },
});
const page = (html, kind = 'search') => ({
    kind, key: kind, path: '/', status: 200, html,
});
const problems = (html, kind) => quickAdd.check(page(html, kind)).join('\n');
const SOLD = '<li class="rf-fly rf-fly--md product is-sold" data-rf-product="5234">';
const BUTTON = /<button class="rf-add" type="button" data-rf-add="sizes" aria-expanded="false">\+ Add<span class="is-srOnly">: Royal Coachman Streamer<\/span><\/button>/;

test('applies to every page, ticket 43', () => {
    assert.equal(quickAdd.id, 'quick-add');
    assert.equal(quickAdd.ticket, 43);
    assert.equal(quickAdd.pages, undefined);
});

test('passes a listing with quick add on, with and without its switch, and the linking cards with it off', async () => {
    const on = await grid(true);
    assert.equal((on.match(/data-rf-add="sizes"/g) || []).length, 2, 'the two cards with options open the picker');
    assert.equal((on.match(/data-rf-add="one"/g) || []).length, 3, 'the three with no options add one');
    assert.ok(on.includes(SOLD), 'the card at stock level 0 is sold out');
    assert.deepEqual(quickAdd.check(page(on)), []);
    const switched = await listing(true);
    assert.match(switched, /data-rf-view/, 'the Photos / Quick order switch');
    assert.deepEqual(quickAdd.check(page(switched, 'category')), []);
    assert.deepEqual(quickAdd.check(page(await grid(false))), []);
    assert.deepEqual(quickAdd.check(page(await listing(false), 'category')), []);
});

test('passes the product page, whose related cards link to their page, and a page with no cards', async () => {
    const html = await productPage();
    assert.match(html, /rf-add rf-add--link/);
    assert.deepEqual(quickAdd.check(page(html, 'product')), []);
    assert.deepEqual(quickAdd.check(page('<html><body><main><h1>Your box</h1></main></body></html>', 'cart')), []);
});

test('fails a "+ Add" that isn\'t a button, without aria-expanded, in an unknown mode, or without its word and the pattern\'s name', async () => {
    const good = await grid(true);
    assert.match(good, BUTTON);
    assert.match(problems(good.replace(BUTTON, '<a class="rf-add" href="#" data-rf-add="sizes" aria-expanded="false">+ Add<span class="is-srOnly">: Royal Coachman Streamer</span></a>')), /card 4831's "\+ Add" isn't a <button type="button">/);
    assert.match(problems(good.replace('data-rf-add="sizes" aria-expanded="false">+ Add<span class="is-srOnly">: Royal Coachman', 'data-rf-add="sizes">+ Add<span class="is-srOnly">: Royal Coachman')), /no aria-expanded="false"/);
    assert.match(problems(good.replace('data-rf-add="sizes" aria-expanded="false">+ Add<span class="is-srOnly">: Royal Coachman', 'data-rf-add="strip" aria-expanded="false">+ Add<span class="is-srOnly">: Royal Coachman')), /is "strip", not sizes or one/);
    assert.match(problems(good.replace('+ Add<span class="is-srOnly">: Royal Coachman Streamer</span>', '+ Add')), /card 4831's "\+ Add" reads "\+ Add", not "\+ Add" and the pattern's name/);
    assert.match(problems(good.replace('data-rf-add="one" aria-expanded="false">Add 1<span', 'data-rf-add="one" aria-expanded="false">+ Add<span')), /reads "\+ Add: Streamer John", not "Add 1" and the pattern's name/);
});

test('fails a card whose size panel or "In your box" line isn\'t empty and hidden, or is missing', async () => {
    const good = await grid(true);
    const panel = '<div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>';
    assert.match(good, new RegExp(panel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(problems(good.replace(panel, '<div class="rf-fly__sizes-panel" data-rf-sizes><div class="rf-pick rf-pick--panel"></div></div>')), /size panel isn't empty and hidden[\s\S]*a size picker \(\.rf-pick--panel\) is in the server HTML/);
    assert.match(problems(good.replace(panel, '')), /card 4831 has 0 size panels/);
    assert.match(problems(good.replace('<span class="rf-fly__inbox" data-rf-inbox hidden></span>', '<span class="rf-fly__inbox" data-rf-inbox>In your box: 2 × 12</span>')), /card 4831's "In your box" line isn't empty and hidden: a cached page never shows another shopper's box/);
    assert.match(problems(good.replace('<span class="rf-fly__inbox" data-rf-inbox hidden></span>', '')), /card 4831 has 0 reserved "In your box" lines/);
});

test('fails a sold-out card with "+ Add" or without "Sold out" on its line, and a buy link with no URL, another URL or other words', async () => {
    const good = await grid(true);
    const view = /<a class="rf-add rf-add--link" href="https:\/\/reelflies\.ca\/monster-streamer-shad-pike-fly\/">View<span class="is-srOnly">: Monster Streamer Shad Pike Fly<\/span><\/a>/;
    assert.match(good, view);
    assert.match(problems(good.replace(view, '<button class="rf-add" type="button" data-rf-add="sizes" aria-expanded="false">+ Add<span class="is-srOnly">: Monster Streamer Shad Pike Fly</span></button><div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>')), /card 5234 is sold out and has "\+ Add"/);
    assert.match(problems(good.replace('<span class="rf-fly__sizes">Sold out</span>', '<span class="rf-fly__sizes"></span>')), /card 5234 is sold out but its line doesn't say "Sold out"/);
    assert.match(problems(good.replace(view, '<a class="rf-add rf-add--link" href="#">View<span class="is-srOnly">: Monster Streamer Shad Pike Fly</span></a>')), /card 5234's buy link has no URL/);
    assert.match(problems(good.replace(view, '<a class="rf-add rf-add--link" href="/cart.php">View<span class="is-srOnly">: Monster Streamer Shad Pike Fly</span></a>')), /card 5234's buy link goes to \/cart\.php, not its page/);
    assert.match(problems(good.replace(view, '<a class="rf-add rf-add--link" href="https://reelflies.ca/monster-streamer-shad-pike-fly/">Buy now<span class="is-srOnly">: Monster Streamer Shad Pike Fly</span></a>')), /card 5234's buy link reads "Buy now: Monster Streamer Shad Pike Fly", not "View" or "Choose a size"/);
});

test('fails a card with two controls or none, and a control outside a card', async () => {
    const good = await grid(true);
    const [button] = good.match(BUTTON);
    assert.match(problems(good.replace(BUTTON, `${button}${button}`)), /card 4831 has 2 buy controls/);
    assert.match(problems(good.replace(BUTTON, '')), /card 4831 has 0 buy controls/);
    assert.match(problems(`${good}<a class="rf-add rf-add--link" href="/x/">View</a>`), /1 buy controls \(\.rf-add\) outside a specimen card/);
});

test('fails a listing with the Quick order switch whose card links instead of adding: both follow rf_quick_add', async () => {
    const switched = await listing(true);
    const linking = switched.replace(BUTTON, '<a class="rf-add rf-add--link" href="https://reelflies.ca/royal-coachman-streamer/">Choose a size<span class="is-srOnly">: Royal Coachman Streamer</span></a>');
    assert.match(problems(linking, 'category'), /card 4831 has no "\+ Add" though the listing has the Photos \/ Quick order switch/);
    assert.match(problems((await grid(false)).replace('</ul>', '</ul><div data-rf-view></div><div data-rf-view></div>')), /2 Photos \/ Quick order switches/);
});

test('fails "+ Add" on a product page, and stock card leftovers beside specimen cards: Quick view, Add to Cart', async () => {
    const good = await grid(true);
    assert.match(problems(good, 'product'), /card 4831 has "\+ Add" on a product page/);
    assert.match(problems(`${good}<button type="button" class="button quickview">Quick view</button>`), /1 card Quick view buttons/);
    assert.match(problems(`${good}<a href="https://reelflies.ca/cart.php?action=add&amp;product_id=5879" data-button-type="add-cart">Add to Cart</a>`), /1 stock Add to Cart links/);
    assert.deepEqual(quickAdd.check(page('<a href="/cart.php?action=add&amp;product_id=1">Add</a>', 'page')), [], 'with no specimen card on the page, a stock link is not this check\'s');
});
