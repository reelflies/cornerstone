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

import {
    answerCartAdds, answerCartRead, cartLines, cartOf,
} from './fixtures/cart/routes.mjs';

/* eslint-env browser */ // the waitForFunction callbacks run in the page

export const STATE_NAME = /^[a-z0-9][a-z0-9-]*$/;

// Resolves once the page has fetched the ReelFlies chunk `name` (theme-bundle.chunk.<name>.js),
// so a state opens UI whose script has loaded. The specs that drive the header and the menu
// (header.spec.mjs, menu.spec.mjs, rail.spec.mjs) wait with it too.
export const chunkLoaded = (page, name) => page.waitForFunction(chunk => performance.getEntriesByType('resource')
    .some(entry => new URL(entry.name).pathname.endsWith(`/theme-bundle.chunk.${chunk}.js`)), name);

// Ticket 37's states: the options marked as a state's (data-rf-qa-state on the options container,
// which the pin's mask leaves alone), every live mark cleared, a size's and a colour's alike (stock
// marks the colours a chosen size is out in), then `unavailable` on the sizes at `positions`
// (negative from the end), and size-pills.js's line in step.
async function setSizeMarks(page, positions) {
    await page.evaluate(marks => {
        const options = document.querySelector('[data-product-option-change]');
        options.setAttribute('data-rf-qa-state', '');
        options.querySelectorAll('.form-option.unavailable').forEach(label => label.classList.remove('unavailable'));
        const pills = Array.from(options.querySelectorAll('[data-rf-pills="size"] .rf-pill[data-product-attribute-value]'));
        marks.forEach(position => pills[(position + pills.length) % pills.length].classList.add('unavailable'));
    }, positions);
    await page.waitForFunction(count => document.querySelectorAll('[data-rf-pills="size"] input[aria-disabled="true"]').length === count, positions.length);
}

// Stock's answer to a choice also sets the buy row from the live stock: the add button's and the
// stepper's disabled state, the flow's own button held with aria-disabled instead (add-bridge.js's
// holdAddButton), and the variant's message (product-details-base.js). A state that chooses resets
// them after the answer, so the look, not the day's stock, is shot, and the bar's add goes ahead.
async function settleBuyRow(page) {
    await page.evaluate(() => {
        document.querySelectorAll('.productAttributes-message').forEach(box => box.style.setProperty('display', 'none'));
        document.querySelectorAll('#form-action-addToCart, [data-quantity-change] button').forEach(control => control.removeAttribute('disabled'));
        document.getElementById('form-action-addToCart')?.removeAttribute('aria-disabled');
        const wrapper = document.getElementById('add-to-cart-wrapper');
        if (wrapper) wrapper.style.display = '';
    });
}

// product@sizes's product, Fat Albert (pages.mjs), whose adds the bar's states answer.
const FAT_ALBERT_ID = 5663;

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

    // The size pills' default, chosen and sold-out looks (ticket 37), on Fat Albert
    // (product@sizes), shot as the page lays out. The live stock marks some sizes (and, once a
    // size is chosen, colours) sold out, and stock's option change marks them again after a
    // choice, so each state clears the marks after stock has answered, then sets its own; it marks
    // the options (data-rf-qa-state) so the pin's mask of the live marks (pages.mjs) leaves them
    // alone. size-pills.spec.mjs checks the real marks.
    'size-default': {
        description: 'the product page with no size chosen and no size sold out: "Fly Sizes: choose one"',
        ticket: '37',
        projects: ['phone-375', 'desktop-1280'],
        pages: ['product@sizes'],
        async open(page) {
            await chunkLoaded(page, 'rf-size-pills');
            await setSizeMarks(page, []);
            await page.locator('[data-rf-pills="size"]').scrollIntoViewIfNeeded();
        },
    },
    'size-chosen': {
        description: 'the product page with its first size chosen: the ink outline and the check',
        ticket: '37',
        projects: ['phone-375', 'desktop-1280'],
        pages: ['product@sizes'],
        async open(page) {
            await chunkLoaded(page, 'rf-size-pills');
            const answered = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
            const pill = page.locator('[data-rf-pills="size"] .rf-pill[data-product-attribute-value]').first();
            await pill.scrollIntoViewIfNeeded();
            await pill.click();
            await answered;
            await setSizeMarks(page, []);
            await settleBuyRow(page);
            await page.locator('[data-rf-pills="size"] .form-radio:checked + .rf-pill .rf-pill-check').waitFor({ state: 'visible' });
            await page.mouse.move(0, 0);
        },
    },
    'size-sold-out': {
        description: 'the product page with its last two sizes marked sold out, as stock\'s option scripts mark them: struck, and named in the line',
        ticket: '37',
        projects: ['phone-375', 'desktop-1280'],
        pages: ['product@sizes'],
        // Stock marks a value it can't sell with the class `unavailable` (product-details-base.js);
        // the look, not the live stock, is what is shot.
        async open(page) {
            await chunkLoaded(page, 'rf-size-pills');
            await setSizeMarks(page, [-2, -1]);
            await page.waitForFunction(() => /are sold out/.test(document.querySelector('[data-rf-pills="size"] [data-rf-sold-out-line]')?.textContent || ''));
            await page.locator('[data-rf-pills="size"]').scrollIntoViewIfNeeded();
        },
    },

    // The buy row with stock's alert showing (ticket 38): the stepper and the button keep their
    // row and the alert takes the next, as stock's quantity limit or a variant's message shows it
    // (product-details-base.js). The words are stock's limit, set here, not the day's stock.
    'buy-row-alert': {
        description: 'the buy row with stock\'s alert showing: "The maximum purchasable quantity is 2" under the stepper and the button',
        ticket: '38',
        projects: ['phone-375', 'desktop-1280'],
        pages: ['product@sizes'],
        async open(page) {
            await chunkLoaded(page, 'rf-add-flow');
            await chunkLoaded(page, 'rf-size-pills');
            await setSizeMarks(page, []);
            await page.evaluate(() => {
                const box = document.querySelector('#add-to-cart-wrapper .productAttributes-message');
                box.querySelector('.alertBox-message').textContent = 'The maximum purchasable quantity is 2';
                box.style.display = 'block';
            });
            await page.locator('.rf-add').scrollIntoViewIfNeeded();
            await page.mouse.move(0, 0);
        },
    },

    // The phone's sticky add bar (ticket 38), at rest and after an add from it, on Fat Albert
    // (product@sizes): its first Colour and its first size chosen, each answered by stock, then the
    // live sold-out marks cleared (setSizeMarks, as ticket 37's states). The add is answered here
    // (page.route fulfils it, so nothing reaches the store, as the network guard requires on a
    // live channel), and the bar keeps its added look for about 4 seconds.
    'sticky-bar': {
        description: 'the phone\'s sticky add bar at rest, with a Colour and a size chosen and the main button scrolled past',
        ticket: '38',
        projects: ['phone-375'],
        pages: ['product@sizes'],
        async open(page) {
            await chunkLoaded(page, 'rf-add-flow');
            await chunkLoaded(page, 'rf-size-pills');
            for (const choice of ['[data-product-attribute="swatch"] .form-option', '[data-rf-pills="size"] .rf-pill[data-product-attribute-value]']) {
                const answered = page.waitForResponse(response => /\/remote\/v1\/product-attributes\//.test(response.url()));
                await page.locator(choice).first().click(); // eslint-disable-line no-await-in-loop
                await answered; // eslint-disable-line no-await-in-loop
            }
            await setSizeMarks(page, []);
            await settleBuyRow(page);
            await page.evaluate(() => window.scrollTo(0, document.querySelector('#form-action-addToCart').getBoundingClientRect().bottom + window.scrollY + 200));
            await page.locator('[data-rf-sticky-add]').waitFor({ state: 'visible' });
        },
    },
    'sticky-bar-added': {
        description: 'the phone\'s sticky add bar just after an add from it: "Added 1 × size N, Colour" and View cart',
        ticket: '38',
        projects: ['phone-375'],
        pages: ['product@sizes'],
        async open(page) {
            await answerCartAdds(page, { productId: FAT_ALBERT_ID });
            await answerCartRead(page, cartLines(FAT_ALBERT_ID, 1));
            await UI_STATES['sticky-bar'].open(page);
            // The bar keeps its added look for about 4 s; held for the shot.
            await page.locator('[data-rf-sticky-add]').evaluate(bar => bar.setAttribute('data-rf-bar-ms', '600000'));
            await page.locator('[data-rf-sticky-button]').click();
            await page.locator('[data-rf-sticky-view]').waitFor({ state: 'visible' });
        },
    },

    // Fat Albert with two of its sizes in the cart (ticket 42): the corner check on each and "In your
    // cart: 3 × size N and 2 × size M." under the pills, from a cart the state answers (page.route,
    // so nothing reaches the store) and sends cart-marks.js's re-read for (rf:cart-changed). The
    // live sold-out marks are cleared first, as ticket 37's states do. With rf_cart_state off
    // (QA_OVERLAY=rf_cart_state-off) the page has no line, and the state shows the stock pills.
    'in-cart': {
        description: 'the product page with two sizes in the cart: the corner checks, and "In your cart: 3 × size N and 2 × size M." under the pills',
        ticket: '42',
        projects: ['phone-375', 'desktop-1280'],
        pages: ['product@sizes'],
        async open(page) {
            await chunkLoaded(page, 'rf-size-pills');
            await setSizeMarks(page, []);
            if (await page.locator('[data-rf-cart-line]').count()) {
                await chunkLoaded(page, 'rf-cart-state');
                const sizes = await page.locator('[data-rf-pills="size"] input[type="radio"]').evaluateAll(radios => radios.filter(radio => radio.value)
                    .slice(0, 2).map(radio => ({ nameId: Number(/\[(\d+)\]/.exec(radio.name)[1]), valueId: Number(radio.value) })));
                await answerCartRead(page, cartOf(sizes.map((option, index) => ({ productId: FAT_ALBERT_ID, quantity: 3 - index, options: [option] }))));
                await page.evaluate(() => document.dispatchEvent(new CustomEvent('rf:cart-changed', { detail: { source: 'qa-state', productId: null } })));
                await page.waitForFunction(() => / and /.test(document.querySelector('[data-rf-cart-line]').textContent));
            }
            await page.locator('[data-rf-pills="size"]').scrollIntoViewIfNeeded();
        },
    },

    // Quick add's sheet and popover (ticket 43) have no state here: channel 1's listing pins hold
    // their live grids out of the shots (pages.mjs's `hold`), and channel 1's variation has quick
    // add off. Their looks, keyboard and axe are quick-add-screens.spec.mjs's, on a fixture page.
};

// The states a pinned page is shot in, as [name, state] pairs, by its whole key.
export const statesFor = (key, states = UI_STATES) => Object.entries(states).filter(([, state]) => state.pages.includes(key));

// Opens the state `name` on `page` (see `open` above).
export async function openState(page, name, states = UI_STATES) {
    const state = states[name];
    if (!state) throw new Error(`"${name}" isn't a UI state in scripts/qa/states.mjs (${Object.keys(states).join(', ')})`);
    await state.open(page);
}
