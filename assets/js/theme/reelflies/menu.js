// The grouped menu's toggles (ticket 28; spec module 3, O08, SEO-3, stories 4, 9 and 72), on
// every page that has the grouped menu (components/reelflies/menu.html), as the chunk rf-menu,
// and the desktop rail's behaviour (ticket 29; UX-2, story 8). Every link is in the server HTML:
// this only toggles hidden and aria-expanded, and moves focus. It never adds an element or sets
// an href, and it sets no style: the viewport cap and the banner strip are CSS (_rail.scss).
//
// - Phones: each row's button (data-rf-menu-toggle) opens its pane in place under the row, and
//   closes it again; several rows can be open at once.
// - From 801px the same button is the rail item, and shows its pane beside the rail, one at a
//   time:
//   - at once on a click, or Enter or Space (the button's own click). A click on the item whose
//     pane is shown leaves it shown, so hover then click never closes what hover opened.
//   - on hover, once the pointer has rested on the item for 300 ms (NN/g's 0.3 to 0.5 s), and
//     never while it moves toward the shown pane (menu-aim, below). The mockup switched after
//     90 ms with no direction check, so a diagonal from Dry Flies to its first child landed on
//     the last item it crossed (UX-2).
//   - The arrow keys move focus up and down the rail (its buttons and plain links, round from
//     the end to the start), Home and End to its ends; Enter then opens the pane.
//   - Focus moving out of the panel closes it, by "Shop flies"' own click (header.js), unless it
//     moves to "Shop flies" itself. header.js already closes it when focus leaves the header;
//     this covers the header row too (shift-tab from the rail), as the reference does.
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
// The rail's items from 801px: the buttons, and the plain links of categories with no pane.
export const RAIL_SELECTOR = `${TOGGLE_SELECTOR}, .rf-menu-name--plain`;
// Cornerstone's medium breakpoint, where the header's desktop row starts (header.js).
export const DESKTOP_QUERY = '(min-width: 801px)';
// How long the pointer rests on a rail item before its pane shows (UX-2: 300 to 500 ms).
export const HOVER_DELAY = 300;

// Menu-aim (Ben Kamens' jQuery-menu-aim; NN/g's "diagonal problem"): is the pointer, moving
// from `from` to `to`, heading for the pane whose box is `pane`, beside the rail on its right?
// It is when `to` lies inside the triangle between `from` and the pane's top-left and
// bottom-left corners: the slope to the top corner falls and the slope to the bottom one rises.
export function aimingAt(from, to, pane) {
    if (!from || !to || !pane || to.x >= pane.left) return false;
    const slope = (point, y) => (y - point.y) / (pane.left - point.x);
    return slope(to, pane.top) < slope(from, pane.top) && slope(to, pane.bottom) > slope(from, pane.bottom);
}

export default function startMenu({ doc = document, win = window } = {}) {
    const nav = doc.querySelector(MENU_SELECTOR);
    if (!nav) return null;
    // Not [...nodeList]: the theme's Babel runs in loose mode, which builds that as
    // [].concat(nodeList), an array holding the NodeList itself.
    const toggles = Array.prototype.slice.call(nav.querySelectorAll(TOGGLE_SELECTOR));
    const rail = Array.prototype.slice.call(nav.querySelectorAll(RAIL_SELECTOR));
    const shop = doc.querySelector(SHOP_SELECTOR);
    const desktop = typeof win.matchMedia === 'function' ? win.matchMedia(DESKTOP_QUERY) : null;
    const isDesktop = () => Boolean(desktop && desktop.matches);
    const panelOpen = () => Boolean(shop && shop.getAttribute('aria-expanded') === 'true' && isDesktop());
    const cleanup = [];
    const listen = (target, type, handler) => {
        target.addEventListener(type, handler);
        cleanup.push(() => target.removeEventListener(type, handler));
    };

    const isOpen = toggle => toggle.getAttribute('aria-expanded') === 'true';
    const paneOf = toggle => doc.getElementById(toggle.getAttribute('aria-controls'));
    const setOpen = (toggle, open) => {
        const pane = paneOf(toggle);
        if (isOpen(toggle) !== open) toggle.setAttribute('aria-expanded', String(open));
        if (pane && pane.hidden === open) pane.hidden = !open;
    };
    const showOnly = shown => toggles.forEach(toggle => setOpen(toggle, toggle === shown));

    // Hover intent: one wait at a time, for the rail item the pointer is on.
    let wait = null;
    let pointer = null; // the pointer's last position over the nav
    const cancel = () => {
        if (wait) win.clearTimeout(wait.timer);
        wait = null;
    };
    const waitFor = toggle => {
        cancel();
        wait = {
            toggle,
            timer: win.setTimeout(() => {
                wait = null;
                if (panelOpen()) showOnly(toggle);
            }, HOVER_DELAY),
        };
    };
    listen(nav, 'mousemove', event => {
        const from = pointer;
        pointer = { x: event.clientX, y: event.clientY };
        const toggle = event.target.closest(TOGGLE_SELECTOR);
        if (!panelOpen() || !toggle || !nav.contains(toggle) || isOpen(toggle)) {
            cancel();
            return;
        }
        const shown = toggles.filter(isOpen)[0];
        const aiming = Boolean(shown) && aimingAt(from, pointer, paneOf(shown).getBoundingClientRect());
        // A new item starts the wait; heading for the shown pane starts it again, so only a rest
        // (or 300 ms of moving any other way) switches.
        if (!wait || wait.toggle !== toggle || aiming) waitFor(toggle);
    });
    listen(nav, 'mouseleave', () => {
        cancel();
        pointer = null;
    });

    listen(nav, 'click', event => {
        const toggle = event.target.closest(TOGGLE_SELECTOR);
        if (!toggle || !nav.contains(toggle)) return;
        cancel();
        if (isDesktop()) showOnly(toggle);
        else setOpen(toggle, !isOpen(toggle));
    });

    // The rail's keys (story 8): up and down the rail, round at its ends; Home and End.
    listen(nav, 'keydown', event => {
        const index = rail.indexOf(event.target);
        if (!isDesktop() || index < 0) return;
        const end = rail.length - 1;
        const next = {
            ArrowDown: index === end ? 0 : index + 1,
            ArrowUp: index === 0 ? end : index - 1,
            Home: 0,
            End: end,
        }[event.key];
        if (next === undefined) return;
        event.preventDefault();
        rail[next].focus();
    });

    if (shop) {
        // Focus out of the panel, but not onto "Shop flies", closes it (accessibility item 6).
        listen(doc, 'focusin', event => {
            if (panelOpen() && !nav.contains(event.target) && event.target !== shop) shop.click();
        });
    }

    // The panel opened: keep the one pane shown, or show the first, and focus its rail item.
    if (shop && toggles.length && typeof win.MutationObserver === 'function') {
        const onShop = () => {
            if (!panelOpen()) {
                cancel();
                return;
            }
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
            cancel();
            cleanup.splice(0).forEach(undo => undo());
        },
    };
}
