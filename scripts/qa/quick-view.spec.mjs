// Quick view after ticket 16 moved it out of main.js: it still opens from a card on
// desktop, and its code (theme-bundle.chunk.quick-view.js) loads only on the first
// Quick view click, once.
//
//   npm run qa:quick-view                 # needs a pinned category page with products
//   QA_CHANNEL=1 npm run qa:quick-view    # read-only channel-1 fallback

import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';
import { QA_CHANNEL } from './storefront.mjs';

const CHUNK = /\/theme-bundle\.chunk\.quick-view\.js(\?|$)/;

test('Quick view opens from a card, and its chunk loads only on the first click', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-1280', 'cards show Quick view on desktop');
    test.skip(!PAGES.category, `no category page is pinned for channel ${QA_CHANNEL}; try QA_CHANNEL=1`);

    const chunkLoads = [];
    page.on('response', response => {
        if (CHUNK.test(new URL(response.url()).pathname)) chunkLoads.push(response.status());
    });

    await storefrontPage(page, PAGES.category);
    await dismissCookieBanner(page);
    expect(chunkLoads, 'the Quick view chunk loads before any click').toEqual([]);

    const cards = page.locator('.card').filter({ has: page.locator('.quickview') });
    expect(await cards.count(), 'cards with a Quick view button').toBeGreaterThan(1);

    const modal = page.locator('#modal');
    const openQuickView = async card => {
        const name = (await card.locator('.card-title').innerText()).trim();
        await card.hover();
        await card.locator('.quickview').click();
        await expect(modal).toBeVisible();
        await expect(modal.locator('.productView-title')).toHaveText(name);
    };

    await openQuickView(cards.nth(0));
    expect(chunkLoads, 'the chunk loads once, on the first click').toEqual([200]);

    await page.locator('#modal > .modal-close').click(); // Quick view's content has its own nested modal
    await expect(modal).toBeHidden();

    await openQuickView(cards.nth(1));
    expect(chunkLoads, 'a second Quick view loads nothing more').toEqual([200]);
});
