// UI states (W0-8): what the screenshots, and axe, open on a pinned page before they look at it,
// so a drawer, a panel or a sheet is checked open as well as closed. screens.spec.mjs and
// axe.spec.mjs import this registry; it lives here rather than in a spec so `node --test` can
// read it (pages.test.mjs), which it can't do with a spec file.
//
// Each state:
//   description  what is open
//   ticket       the ticket that owns the UI it opens, and changes `open` when it rebuilds it
//   projects     the Playwright projects it is shot at (playwright.config.mjs)
//   pages        the page keys it is shot on (pages.mjs), on every channel that pins them. A key
//                means that pin only: 'category' isn't 'category@alpha'.
//   fullPage     optional: a full-page shot. By default a state is shot as the viewport shows
//                it, because a fixed drawer or sheet covers the viewport, not the page.
//   open(page)   opens it on a page storefrontPage has loaded and dismissCookieBanner has
//                cleared, and resolves once it is open. It doesn't move the pointer over the
//                page afterwards: a hover state would show in the shot.
//
// A state's baseline is <key>~<state>-<project>-<platform>.png in the run's set
// (baselineName in pages.mjs), so a PR that changes it declares its page kind on the
// "Baselines:" line, as for the closed page.
//
// The drawer and panel states open ticket 28's grouped menu where its ids are set (channel 1's
// variation), and the stock menu where they are empty (ReelFlies CA until tree 4, and the
// overlay menu-ids-empty), from ticket 27's header: its Menu button (the stock toggle) and its
// "Shop flies" button. panel-open shows the first Fly Type's pane, with its banner (ticket 29);
// a Species pane state waits for a pinned page with a Species group (wave R1). A ticket adds a
// state in its own slot below.

/* eslint-env browser */ // the waitForFunction callbacks run in the page

export const STATE_NAME = /^[a-z0-9][a-z0-9-]*$/;

// Resolves once the page has fetched the ReelFlies chunk `name` (theme-bundle.chunk.<name>.js),
// so a state opens UI whose script has loaded. The specs that drive the header and the menu
// (header.spec.mjs, menu.spec.mjs, rail.spec.mjs) wait with it too.
export const chunkLoaded = (page, name) => page.waitForFunction(chunk => performance.getEntriesByType('resource')
    .some(entry => new URL(entry.name).pathname.endsWith(`/theme-bundle.chunk.${chunk}.js`)), name);

export const UI_STATES = {
    'drawer-open': {
        description: 'the phone menu, open; the grouped drawer with its first row open in place',
        ticket: '28',
        projects: ['phone-375'],
        pages: ['home', 'category'],
        // The header's Menu toggle opens #menu (stock mobile-menu-toggle.js), and header.js adds
        // "drawer" to <html data-rf-open>. In the grouped drawer the first row's chevron then
        // opens its children in place (menu.js), so the shot shows one row open (ticket 28).
        async open(page) {
            const grouped = await page.locator('[data-rf-menu]').count();
            await chunkLoaded(page, 'rf-header');
            if (grouped) await chunkLoaded(page, 'rf-menu');
            // A tap draws Chromium's tap highlight over the button, fading as the shot is taken,
            // so the Close button's tint changed from take to take (#67's round 2).
            await page.addStyleTag({ content: '* { -webkit-tap-highlight-color: transparent !important; }' });
            await page.locator('[data-mobile-menu-toggle="menu"]').tap();
            await page.locator('#menu.is-open').waitFor({ state: 'visible' });
            await page.locator('[data-mobile-menu-toggle="menu"][aria-expanded="true"]').waitFor();
            await page.waitForFunction(() => (document.documentElement.getAttribute('data-rf-open') || '').split(/\s+/).includes('drawer'));
            if (!grouped) return;
            const toggle = page.locator('#menu [data-rf-menu-toggle]').first();
            await toggle.tap();
            await page.locator('#menu [data-rf-menu-toggle][aria-expanded="true"]').first().waitFor();
            await page.locator('#menu [data-rf-menu-pane]:not([hidden])').first().waitFor({ state: 'visible' });
        },
    },

    'panel-open': {
        description: 'the desktop menu panel, open: the grouped panel on its first Fly Type\'s pane, or the stock menu\'s first sub-menu',
        ticket: '28',
        projects: ['desktop-1280'],
        pages: ['category'],
        // Ticket 27's "Shop flies" opens #menu as a panel (header.js), from the keyboard, so the
        // pointer stays off the menu. The grouped panel then shows its first Fly Type's pane and
        // moves focus to that rail item (menu.js). The stock menu, with both ids empty, opens the
        // first category's sub-menu (menu.js and collapsible.js), from the keyboard too.
        async open(page) {
            const shop = page.locator('[data-rf-shop]');
            const grouped = await page.locator('[data-rf-menu]').count();
            if (await shop.count()) {
                await chunkLoaded(page, 'rf-header');
                if (grouped) await chunkLoaded(page, 'rf-menu');
                await shop.press('Enter');
                await page.locator('#menu').waitFor({ state: 'visible' });
            }
            if (grouped) {
                await page.locator('#menu [data-rf-menu-pane]:not([hidden])').first().waitFor({ state: 'visible' });
                await page.locator('#menu [data-rf-menu-toggle][aria-expanded="true"]:focus').waitFor();
                // The shown pane's banner (ticket 29) is lazy: it loads once the pane shows.
                await page.waitForFunction(() => [...document.querySelectorAll('#menu [data-rf-menu-pane]:not([hidden]) [data-rf-menu-banner]')]
                    .every(image => image.complete));
                return;
            }
            const action = page.locator('.navPages-list > .navPages-item > .navPages-action.has-subMenu').first();
            await action.press('Enter');
            await page.locator('.navPages-list > .navPages-item > .navPage-subMenu.is-open').first().waitFor({ state: 'visible' });
        },
    },

    // sheet-open: the quick-add sheet on a phone and its popover on desktop, on the cards of a
    // stable listing pin (ticket 43, which adds "quick-add" to <html data-rf-open>).
};

// The states a pinned page is shot in, as [name, state] pairs, by its whole key.
export const statesFor = (key, states = UI_STATES) => Object.entries(states).filter(([, state]) => state.pages.includes(key));

// Opens the state `name` on `page` (see `open` above).
export async function openState(page, name, states = UI_STATES) {
    const state = states[name];
    if (!state) throw new Error(`"${name}" isn't a UI state in scripts/qa/states.mjs (${Object.keys(states).join(', ')})`);
    await state.open(page);
}
