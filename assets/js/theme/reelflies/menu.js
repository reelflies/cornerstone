// The grouped menu's toggles (ticket 28; spec module 3, O08, SEO-3, stories 4, 9 and 72), on
// every page that has the grouped menu (components/reelflies/menu.html), as the chunk rf-menu.
// Every link is in the server HTML: this only toggles hidden and aria-expanded, and never adds
// an element or sets an href.
//
// - Phones: each row's button (data-rf-menu-toggle) opens its pane in place under the row, and
//   closes it again; several rows can be open at once.
// - From 801px the same button is the rail item, and shows its pane beside the rail, one at a
//   time, on a click. Hover intent, the arrow keys and the viewport cap are ticket 29's.
// - "Shop flies" opens and closes the panel (ticket 27's header.js, which also closes it on
//   Escape, a click outside or focus leaving the header, with focus back on the button). When
//   it opens, this shows a pane, the first Fly Type's until another was shown, and moves focus
//   to that rail item (the reference, reference.src.html:1930).
// - The Menu button opens the drawer (stock mobile-menu-toggle.js); header.js closes it on
//   Escape and writes "drawer" in <html data-rf-open> while it is open (build pipeline 6.9).
// - Stock menu.js binds to [data-menu], which the grouped menu's container doesn't carry, so
//   it never stops these clicks or collapses these panes.

export const MENU_SELECTOR = '[data-rf-menu]';
export const TOGGLE_SELECTOR = '[data-rf-menu-toggle]';
export const SHOP_SELECTOR = '[data-rf-shop]';
// Cornerstone's medium breakpoint, where the header's desktop row starts (header.js).
export const DESKTOP_QUERY = '(min-width: 801px)';

export default function startMenu({ doc = document, win = window } = {}) {
    const nav = doc.querySelector(MENU_SELECTOR);
    if (!nav) return null;
    // Not [...nodeList]: the theme's Babel runs in loose mode, which builds that as
    // [].concat(nodeList), an array holding the NodeList itself.
    const toggles = Array.prototype.slice.call(nav.querySelectorAll(TOGGLE_SELECTOR));
    const desktop = typeof win.matchMedia === 'function' ? win.matchMedia(DESKTOP_QUERY) : null;
    const isDesktop = () => Boolean(desktop && desktop.matches);
    const cleanup = [];

    const isOpen = toggle => toggle.getAttribute('aria-expanded') === 'true';
    const setOpen = (toggle, open) => {
        const pane = doc.getElementById(toggle.getAttribute('aria-controls'));
        if (isOpen(toggle) !== open) toggle.setAttribute('aria-expanded', String(open));
        if (pane && pane.hidden === open) pane.hidden = !open;
    };
    const showOnly = shown => toggles.forEach(toggle => setOpen(toggle, toggle === shown));

    const onClick = event => {
        const toggle = event.target.closest(TOGGLE_SELECTOR);
        if (!toggle || !nav.contains(toggle)) return;
        if (isDesktop()) showOnly(toggle);
        else setOpen(toggle, !isOpen(toggle));
    };
    nav.addEventListener('click', onClick);
    cleanup.push(() => nav.removeEventListener('click', onClick));

    // The panel opened: keep the one pane shown, or show the first, and focus its rail item.
    const shop = doc.querySelector(SHOP_SELECTOR);
    if (shop && toggles.length && typeof win.MutationObserver === 'function') {
        const onShop = () => {
            if (shop.getAttribute('aria-expanded') !== 'true' || !isDesktop()) return;
            const open = toggles.filter(isOpen);
            const current = open.length === 1 ? open[0] : toggles[0];
            showOnly(current);
            current.focus();
        };
        const observer = new win.MutationObserver(onShop);
        observer.observe(shop, { attributes: true, attributeFilter: ['aria-expanded'] });
        cleanup.push(() => observer.disconnect());
        onShop(); // the panel may have opened before this chunk loaded
    }

    return {
        nav,
        stop() {
            cleanup.splice(0).forEach(undo => undo());
        },
    };
}
