// Self-tests of fixtures.mjs, which every storefront gate opens its pages with. They serve
// their own pages (page.route and setContent), so they need no store data, and they run
// with qa:axe, qa:screens and qa:quick-view.
//
// - A pinned page that doesn't answer as its template should fails the run, so axe and the
//   screenshots never check, or record as a baseline, an error page instead.
// - Dismissing the cookie banner leaves nothing hovered, so no hover zoom or menu is open
//   in a screenshot.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import {
    dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';

const serve = (page, url, status) => page.route(url, route => route.fulfill({
    status,
    contentType: 'text/html',
    body: `<!doctype html><html lang="en"><title>HTTP ${status}</title><h1>HTTP ${status}</h1></html>`,
}));

test.describe('opening a pinned page', () => {
    test('fails when a template\'s pinned page answers 404', async ({ page }) => {
        await serve(page, '**/rf-selftest/gone/', 404);
        await expect(storefrontPage(page, 'product', '/rf-selftest/gone/'))
            .rejects.toThrow('the product page /rf-selftest/gone/ returned HTTP 404, not 200');
    });

    test('fails when the pinned 404 page answers 200', async ({ page }) => {
        await serve(page, '**/rf-selftest/missing/', 200);
        await expect(storefrontPage(page, '404', '/rf-selftest/missing/'))
            .rejects.toThrow('the 404 page /rf-selftest/missing/ returned HTTP 200, not 404');
    });

    test('opens a pinned page that answers as its template should', async ({ page }) => {
        await serve(page, '**/rf-selftest/product/', 200);
        await serve(page, '**/rf-selftest/missing/', 404);
        expect((await storefrontPage(page, 'product', '/rf-selftest/product/')).status()).toBe(200);
        expect((await storefrontPage(page, '404', '/rf-selftest/missing/')).status()).toBe(404);
    });
});

test.describe('dismissing the cookie banner', () => {
    // On the desktop product page, "Reject all" sits over the main image, whose EasyZoom
    // flyout opens on hover (ticket 16 review).
    test('leaves the element under the banner unhovered', async ({ page }) => {
        await page.setContent(`<!doctype html><html lang="en"><body style="margin:0">
            <div id="photo" style="position:absolute;left:0;top:0;width:600px;height:600px;background:#eee"></div>
            <div id="consent-manager" style="position:fixed;left:100px;top:300px;padding:20px;background:#333">
                <button type="button" onclick="document.getElementById('consent-manager').style.display = 'none'">Reject all</button>
            </div>
            <script>
                window.entered = 0;
                document.getElementById('photo').addEventListener('mouseenter', () => { window.entered += 1; });
            </script>
        </body></html>`);

        await dismissCookieBanner(page);
        await expect(page.locator('#consent-manager')).toBeHidden();
        await page.waitForTimeout(300); // Chrome updates hover on a timer after a layout change

        expect(await page.locator('#photo').evaluate(element => element.matches(':hover')), 'the photo is hovered').toBe(false);
        expect(await page.evaluate(() => window.entered), 'mouseenter on the photo').toBe(0);
    });
});
