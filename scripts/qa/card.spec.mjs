// The product card on real listings (ticket 31; spec module 13; stories 28 and 35), on the pins
// of QA_CHANNEL, at 375 and 1280. The card's markup is render/partials/card.test.mjs's, its
// photos' loading the card-images raw-HTML assertion's, and its look card-screens.spec.mjs's.
//
// - "/ fly" on the search pin: the card shows the unit exactly when the price-unit rule says so
//   for that product's Placements, read from the store's own ?debug=context, with the channel's
//   rf_price_unit_exclude; the page must hold a fly, and a product under each root the rule
//   leaves out.
// - The stock actions while quick add is off (SCOPE-3): a row under the price at both widths,
//   and Quick view opens from it at 375 as well as 1280.
// - The card's links, on the search pin: the name, the photo and Choose options go to the
//   product's own URL from ?debug=context, and Add to cart adds that product (its URL, not
//   clicked).
//
// It runs only when named, like header.spec.mjs: no npm script's filter matches it.
//
//   QA_CHANNEL=1 npx playwright test --config scripts/qa/playwright.config.mjs card.spec

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { HEADERS, QA_CHANNEL } from './storefront.mjs';
import { withQuery } from './switches.mjs';

// The price-unit rule (components/reelflies/price-unit.html) in JavaScript, for the test's
// expectation: a Placement, and none the roots name, with roots named at all.
function wantsUnit(categories = [], exclude = '') {
    const roots = String(exclude).split(',').map(root => root.trim()).filter(Boolean);
    if (!categories.length || !roots.length) return false;
    return !categories.some(path => roots.some(root => path === root || path.startsWith(`${root}/`)));
}

async function context(request, template) {
    const response = await request.get(withQuery(PAGES[template], 'debug=context'), { headers: HEADERS });
    expect(response.status(), `?debug=context on ${template}`).toBe(200);
    return response.json();
}

test('"/ fly" on the search pin\'s cards follows the price-unit rule for each product (story 28)', async ({ page, request }) => {
    test.skip(!PAGES.search, `no search page is pinned for channel ${QA_CHANNEL}; try QA_CHANNEL=1`);
    const data = await context(request, 'search');
    const exclude = data.theme_settings.rf_price_unit_exclude;
    const products = data.product_results.products || [];
    expect(products.length, 'the search pin lists products').toBeGreaterThan(0);
    const expected = Object.fromEntries(products.map(product => [String(product.id), wantsUnit(product.category, exclude)]));
    expect(Object.values(expected), 'the pin holds a fly with the unit').toContain(true);
    expect(Object.values(expected), 'the pin holds a product the rule leaves out (Gear, a hook pack, an Assortment)').toContain(false);
    for (const root of String(exclude).split(',').map(name => name.trim()).filter(Boolean)) {
        const under = products.some(product => (product.category || []).some(path => path === root || path.startsWith(`${root}/`)));
        expect(under, `the pin holds a product under ${root}`).toBe(true);
    }

    await storefrontPage(page, 'search');
    await dismissCookieBanner(page);
    const cards = page.locator('.productGrid .card');
    await expect(cards).toHaveCount(products.length);
    const shown = await cards.evaluateAll(list => Object.fromEntries(list.map(card => [card.dataset.entityId, Boolean(card.querySelector('.rf-price-unit'))])));
    expect(shown).toEqual(expected);
    await expect(page.locator('.productGrid .rf-price-unit').first()).toHaveText('/ fly');
});

test('the stock actions are a row under the price, and Quick view opens from it at either width (story 35)', async ({ page }) => {
    test.skip(!PAGES.category, `no category page is pinned for channel ${QA_CHANNEL}; try QA_CHANNEL=1`);
    await storefrontPage(page, 'category');
    await dismissCookieBanner(page);
    const card = page.locator('.productGrid .card').filter({ has: page.locator('.quickview') }).first();
    const actions = card.locator('.rf-card-actions');
    await expect(actions).toBeVisible();
    const [photo, price, row] = await Promise.all([card.locator('.card-image'), card.locator('.rf-card-price'), actions].map(locator => locator.boundingBox()));
    expect(row.y, 'the actions sit under the price').toBeGreaterThanOrEqual(price.y + price.height - 1);
    expect(row.y, 'and below the photo, never over it').toBeGreaterThanOrEqual(photo.y + photo.height);

    const name = (await card.locator('.card-title').innerText()).trim();
    const href = await card.locator('.card-title a').getAttribute('href');
    expect(await card.locator('.card-figure__link').getAttribute('href'), 'the photo links to the product too').toBe(href);
    await card.locator('.quickview').click();
    const modal = page.locator('#modal');
    await expect(modal).toBeVisible();
    await expect(modal.locator('.productView-title')).toHaveText(name);
});

test('the card\'s links go to its product: the name, the photo and Choose options, and Add to cart adds it', async ({ page, request }) => {
    test.skip(!PAGES.search, `no search page is pinned for channel ${QA_CHANNEL}; try QA_CHANNEL=1`);
    const products = (await context(request, 'search')).product_results.products || [];
    await storefrontPage(page, 'search');
    const cards = await page.locator('.productGrid .card').evaluateAll(list => list.map(card => ({
        id: card.dataset.entityId,
        title: card.querySelector('.card-title a')?.getAttribute('href') ?? null,
        photo: card.querySelector('.card-figure__link')?.getAttribute('href') ?? null,
        actions: [...card.querySelectorAll('.rf-card-actions a')].map(link => ({ text: link.textContent.trim(), href: link.getAttribute('href') })),
    })));
    expect(cards).toHaveLength(products.length);
    let adds = 0;
    for (const card of cards) {
        const product = products.find(each => String(each.id) === card.id);
        expect(product, `card ${card.id} is a product of the page`).toBeTruthy();
        expect(card.title, `card ${card.id}'s name`).toBe(product.url);
        expect(card.photo, `card ${card.id}'s photo`).toBe(product.url);
        for (const action of card.actions) {
            if (/choose options/i.test(action.text)) expect(action.href, `card ${card.id}'s Choose options`).toBe(product.url);
            if (/add to cart/i.test(action.text)) {
                adds += 1;
                expect(action.href, `card ${card.id}'s Add to cart`).toMatch(new RegExp(`[?&]action=add&(amp;)?product_id=${card.id}$`));
            }
        }
    }
    expect(adds, 'the pin holds a product with no options, which adds from the card').toBeGreaterThan(0);
});
