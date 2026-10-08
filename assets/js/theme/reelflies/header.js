// The header's behaviour (ticket 27; spec module 4, O05, O24, story 9), on every page.
//
// - The Menu button is stock: mobile-menu-toggle.js opens #menu, sets aria-expanded and traps
//   focus in the header, with Escape switched off (mobile-menu-toggle.js:87-88). Here Escape
//   closes the drawer and gives focus back to the button. The button's visible label, "Menu" or
//   "Close", follows aria-expanded in CSS (_header.scss), so it is right before this loads.
// - While the drawer is open, <html data-rf-open> holds "drawer" (open-state.js; build pipeline
//   6.9), which ticket 52's prompt waits on. Ticket 28 rebuilds the drawer and takes this over.
// - "Shop flies", on desktop, opens the stock menu (#menu, stock navigation-menu.html) as a
//   panel under the header row, until ticket 28's grouped panel replaces it (ticket 26's
//   finding 2: the one-row header took the stock desktop menu out of the page). Escape, a click
//   outside the header and focus leaving the header close it; Escape gives focus back to the
//   button. It closes too when the window narrows to the phone layout, where Menu takes over.

import { markClosed, markOpen } from './open-state';

export const HEADER_SELECTOR = '[data-rf-header]';
export const PANEL_OPEN_CLASS = 'rf-is-panel-open';
export const DRAWER_TOKEN = 'drawer';
// Cornerstone's medium breakpoint, where the desktop row starts (settings/global/_breakpoints).
export const DESKTOP_QUERY = '(min-width: 801px)';

export default function startHeader({ doc = document, win = window } = {}) {
    const header = doc.querySelector(HEADER_SELECTOR);
    if (!header) return null;
    const menuButton = header.querySelector('[data-mobile-menu-toggle]');
    const shop = header.querySelector('[data-rf-shop]');
    const menu = doc.getElementById('menu');
    const cleanup = [];
    const listen = (target, type, handler) => {
        target.addEventListener(type, handler);
        cleanup.push(() => target.removeEventListener(type, handler));
    };

    const drawerOpen = () => Boolean(menu && menu.classList.contains('is-open'));
    const panelOpen = () => Boolean(shop && shop.getAttribute('aria-expanded') === 'true');
    const setPanel = (open, { focus = false } = {}) => {
        if (!shop || !menu) return;
        shop.setAttribute('aria-expanded', String(open));
        menu.classList.toggle(PANEL_OPEN_CLASS, open);
        if (!open && focus) shop.focus();
    };

    if (shop && menu) {
        listen(shop, 'click', () => setPanel(!panelOpen()));
        const outside = event => {
            if (panelOpen() && !header.contains(event.target)) setPanel(false);
        };
        listen(doc, 'click', outside);
        listen(doc, 'focusin', outside);
        const desktop = typeof win.matchMedia === 'function' ? win.matchMedia(DESKTOP_QUERY) : null;
        if (desktop && typeof desktop.addEventListener === 'function') {
            const narrowed = event => {
                if (!event.matches) setPanel(false);
            };
            desktop.addEventListener('change', narrowed);
            cleanup.push(() => desktop.removeEventListener('change', narrowed));
        }
    }

    listen(doc, 'keydown', event => {
        if (event.key !== 'Escape') return;
        if (menuButton && drawerOpen()) {
            menuButton.click();
            menuButton.focus();
        } else if (panelOpen()) {
            setPanel(false, { focus: true });
        }
    });

    if (menuButton && typeof win.MutationObserver === 'function') {
        const syncDrawer = () => {
            if (menuButton.getAttribute('aria-expanded') === 'true') markOpen(DRAWER_TOKEN, doc.documentElement);
            else markClosed(DRAWER_TOKEN, doc.documentElement);
        };
        const observer = new win.MutationObserver(syncDrawer);
        observer.observe(menuButton, { attributes: true, attributeFilter: ['aria-expanded'] });
        cleanup.push(() => observer.disconnect());
        syncDrawer();
    }

    return {
        header,
        stop() {
            cleanup.splice(0).forEach(undo => undo());
        },
    };
}
