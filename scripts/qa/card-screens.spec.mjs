// The product card grid's look (ticket 31; spec module 13; story 28), at 375 and 1280, on the
// fixture page: the real search page, with the theme's header and footer and the facet sidebar
// the live listings have, rendered round the six products of render/partials/card/products.json
// (search results for "streamer" on channel 1), with their own photos
// (render/pages/card-grid/fixtures/files/). The live grids on the pinned category and search
// pages are masked, because the catalogue decides what they list (pages.mjs), so the card's look
// is checked here.
//
// The shot shows: the photos on white in their 3:2 boxes, with nothing over their bottom-left
// logo corner (IMG-1), the sold-out badge, the names in two lines at most, "/ fly" on the flies
// and not on the hook pack or the selection, and the stock actions as a row under the price. The
// phone header is sticky, so it is set static for the shot, or it would lie over the first row.
//
// Its name ends in "screens", so `npm run qa:screens` (and so qa:prepush and release.sh) runs it.
// Its baselines are widget baselines, scripts/qa/baselines/widgets/<variation>/card-grid-search-
// <project>-<platform>.png, declared on a PR's Baselines line as `widget card-grid`:
//
//   QA_VARIATION="<variation>" npx playwright test --config scripts/qa/playwright.config.mjs card-screens --update-snapshots

/* eslint-env browser */ // the page.evaluate callback runs in the page

import { expect, test } from '@playwright/test';
import { QA_OVERLAY, QA_VARIATION, slug } from './storefront.mjs';
import { widgetCases } from './render/render.mjs';
import { PAGE_FIXTURES, openWidget } from './render/widget-page.mjs';

test.skip(Boolean(QA_OVERLAY), `the card grid renders from its fixture, not under an overlay (QA_OVERLAY=${QA_OVERLAY})`);

const GRID = widgetCases([PAGE_FIXTURES]).find(({ widget, name }) => widget === 'card-grid' && name === 'search');

test('the card grid (ticket 31) matches its baseline', async ({ page }) => {
    const { problems } = await openWidget(page, GRID, { variation: QA_VARIATION });
    expect(problems, 'the fixture page loads nothing but its fixture\'s files, the theme\'s assets and fonts').toEqual([]);
    const grid = page.locator('.productGrid');
    await expect(grid.locator('.card')).toHaveCount(6);
    for (const img of await grid.locator('.card-image').all()) {
        await img.scrollIntoViewIfNeeded(); // eslint-disable-line no-await-in-loop
        await expect.poll(() => img.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true); // eslint-disable-line no-await-in-loop
    }
    await page.addStyleTag({ content: '[data-rf-header] { position: static !important; }' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(grid).toHaveScreenshot(['widgets', slug(QA_VARIATION), 'card-grid-search.png']);
});
