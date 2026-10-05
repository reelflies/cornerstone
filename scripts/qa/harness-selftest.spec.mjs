// Self-tests of fixtures.mjs, which every storefront gate opens its pages with. They run
// with qa:axe, qa:screens and qa:quick-view, and serve their own pages (page.route and
// setContent), so they need no store data; only the 5xx retry gets a pinned page's real
// response from the storefront under test.
//
// - A pinned page that doesn't answer as its template should fails the run, so axe and the
//   screenshots never check, or record as a baseline, an error page instead.
// - A page that answers 5xx is opened once more, about 2 s later: stencil start's request
//   to the store can drop. A second 5xx fails, and a 4xx is never asked again.
// - Dismissing the cookie banner leaves nothing hovered, so no hover zoom or menu is open
//   in a screenshot.

/* eslint-env browser */ // the page.evaluate callbacks run in the page

import { expectedStatus } from './pages.mjs';
import {
    PAGES, dismissCookieBanner, expect, storefrontPage, test,
} from './fixtures.mjs';

const html = status => `<!doctype html><html lang="en"><title>HTTP ${status}</title><h1>HTTP ${status}</h1></html>`;
// Answers `url` with `status`, and returns a counter of the requests it answered.
async function serve(page, url, status) {
    const requests = { count: 0 };
    await page.route(url, route => {
        requests.count += 1;
        return route.fulfill({ status, contentType: 'text/html', body: html(status) });
    });
    return requests;
}

test.describe('opening a pinned page', () => {
    test('fails when a template\'s pinned page answers 404, without asking again', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/gone/', 404);
        await expect(storefrontPage(page, 'product', '/rf-selftest/gone/'))
            .rejects.toThrow('the product page /rf-selftest/gone/ returned HTTP 404, not 200');
        expect(requests.count).toBe(1);
    });

    test('fails when the pinned 404 page answers 200, without asking again', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/missing/', 200);
        await expect(storefrontPage(page, '404', '/rf-selftest/missing/'))
            .rejects.toThrow('the 404 page /rf-selftest/missing/ returned HTTP 200, not 404');
        expect(requests.count).toBe(1);
    });

    test('opens a pinned page that answers 5xx once, from the storefront\'s real response', async ({ page, baseURL }) => {
        // The 404 page is the one that answered 500 once in a release dry run.
        const [template, pagePath] = PAGES['404'] ? ['404', PAGES['404']] : Object.entries(PAGES)[0];
        const target = new URL(pagePath, baseURL).href;
        const answers = [];
        await page.route(url => url.href === target, route => {
            answers.push(answers.length ? 'storefront' : 500);
            return answers.length === 1
                ? route.fulfill({ status: 500, contentType: 'text/html', body: html(500) })
                : route.fallback();
        });
        const logged = [];
        const log = console.log;
        console.log = (...args) => logged.push(args.join(' '));
        try {
            expect((await storefrontPage(page, template, pagePath)).status()).toBe(expectedStatus(template));
        } finally {
            console.log = log;
        }
        expect(answers).toEqual([500, 'storefront']);
        expect(logged).toEqual([`RETRY    the ${template} page ${pagePath} returned HTTP 500; opening it once more in 2 s (stencil start's request to the store can drop)`]);
    });

    test('fails when a pinned page answers 5xx twice', async ({ page }) => {
        const requests = await serve(page, '**/rf-selftest/down/', 502);
        await expect(storefrontPage(page, 'product', '/rf-selftest/down/'))
            .rejects.toThrow('the product page /rf-selftest/down/ returned HTTP 502, not 200');
        expect(requests.count).toBe(2);
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
