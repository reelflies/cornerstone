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
// The states open stock Cornerstone's UI today, from ticket 27's header: its Menu button (the
// stock toggle) and its "Shop flies" panel round the stock desktop menu. Tickets 28 and 29
// rebuild the phone drawer and the desktop panel; each points its state at its own UI when it
// lands, and may wait for its token in <html data-rf-open> (build pipeline, section 6.9). A
// ticket adds a state in its own slot below.

export const STATE_NAME = /^[a-z0-9][a-z0-9-]*$/;

export const UI_STATES = {
    'drawer-open': {
        description: 'the phone menu, open',
        ticket: '28',
        projects: ['phone-375'],
        pages: ['home'],
        // Stock: the header's Menu toggle opens #menu (mobile-menu-toggle.js). Ticket 28 points
        // this at the grouped drawer, which adds "drawer" to <html data-rf-open>.
        async open(page) {
            await page.locator('[data-mobile-menu-toggle="menu"]').tap();
            await page.locator('#menu.is-open').waitFor({ state: 'visible' });
            await page.locator('[data-mobile-menu-toggle="menu"][aria-expanded="true"]').waitFor();
        },
    },

    'panel-open': {
        description: 'the desktop menu panel, open on the first top-level category',
        ticket: '28',
        projects: ['desktop-1280'],
        pages: ['category'],
        // Ticket 27's one-row header holds the stock menu in the panel "Shop flies" opens
        // (header.js), so that opens first, from the keyboard. Then, stock: the first category
        // with children opens its sub-menu (menu.js and collapsible.js), from the keyboard, so
        // the pointer stays off the menu. Ticket 28 points this at its grouped panel, and ticket
        // 29 adds a state per pane if it needs one.
        async open(page) {
            const shop = page.locator('[data-rf-shop]');
            if (await shop.count()) {
                await page.waitForFunction(() => performance.getEntriesByType('resource')
                    .some(entry => new URL(entry.name).pathname.endsWith('/theme-bundle.chunk.rf-header.js')));
                await shop.press('Enter');
                await page.locator('#menu').waitFor({ state: 'visible' });
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
