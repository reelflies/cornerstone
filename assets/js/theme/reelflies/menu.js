// The header's mega menus and the phone drawer (components/reelflies/header.html and
// drawer.html). It only opens and closes what the server rendered; it never builds a link.
//
// Mega menus, from 1040px:
// - Flies and Species are buttons with aria-expanded and aria-controls. A click toggles the
//   panel; a mouse resting on the item opens it (120ms) and leaving closes it (260ms), so the
//   pointer can cross the gap. One panel is open at a time, over a shale scrim.
// - Keys: Enter or Space on the button toggles it; ArrowDown opens it and moves into it; inside,
//   ArrowDown and ArrowUp move through the links of the list in hand; Escape closes it and puts
//   focus back on its button. Focus leaving the item closes it.
// - In the Flies panel, pointing at or focusing a Fly Type in the rail shows its subcategories
//   and plate.
// The drawer, below 1040px: Menu opens a modal dialog; focus moves to its close button and stays
// inside; Escape, the close button, the scrim and its in-page links close it and focus goes back
// to Menu. The page under it doesn't scroll.

const desktop = () => window.matchMedia('(min-width: 1040px)').matches;

function megaMenus(head) {
    const scrim = document.querySelector('[data-rf-mega-scrim]');
    const items = [...head.querySelectorAll('[data-rf-mega]')];
    let open = null;
    let timer = 0;

    const set = (item, show) => {
        const button = item.querySelector('.rf-nav__btn');
        const panel = item.querySelector('[data-rf-mega-panel]');
        if (show) {
            if (open && open !== item) set(open, false);
            panel.hidden = false;
            button.setAttribute('aria-expanded', 'true');
            if (scrim) scrim.hidden = false;
            open = item;
        } else {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
            if (open === item) {
                open = null;
                if (scrim) scrim.hidden = true;
            }
        }
    };

    const links = (panel, from) => {
        const list = from && from.closest('ul');
        return [...(list || panel).querySelectorAll('a[href]')].filter(a => a.offsetParent !== null);
    };

    items.forEach(item => {
        const button = item.querySelector('.rf-nav__btn');
        const panel = item.querySelector('[data-rf-mega-panel]');
        button.addEventListener('click', () => set(item, button.getAttribute('aria-expanded') !== 'true'));
        item.addEventListener('pointerenter', event => {
            if (event.pointerType !== 'mouse' || !desktop()) return;
            clearTimeout(timer);
            timer = setTimeout(() => set(item, true), open ? 0 : 120);
        });
        item.addEventListener('pointerleave', event => {
            if (event.pointerType !== 'mouse') return;
            clearTimeout(timer);
            timer = setTimeout(() => set(item, false), 260);
        });
        item.addEventListener('keydown', event => {
            if (event.key === 'Escape' && open === item) {
                set(item, false);
                button.focus();
                return;
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
            if (event.target === button) {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                set(item, true);
                const first = links(panel)[0];
                if (first) first.focus();
                return;
            }
            if (!panel.contains(event.target)) return;
            event.preventDefault();
            const list = links(panel, event.target);
            const at = list.indexOf(event.target);
            const next = list[(at + (event.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length];
            if (next) next.focus();
        });
        item.addEventListener('focusout', event => {
            if (open === item && !item.contains(event.relatedTarget)) set(item, false);
        });
    });

    if (scrim) scrim.addEventListener('click', () => { if (open) set(open, false); });
    document.querySelectorAll('[data-rf-mega-close]').forEach(link => link.addEventListener('click', () => { if (open) set(open, false); }));
    window.matchMedia('(min-width: 1040px)').addEventListener('change', () => { if (open) set(open, false); });

    head.querySelectorAll('[data-rf-pane-for]').forEach(link => {
        let wait = 0;
        const show = () => {
            const id = link.dataset.rfPaneFor;
            head.querySelectorAll('[data-rf-pane-for]').forEach(other => other.classList.toggle('is-active', other === link));
            head.querySelectorAll('[data-rf-pane]').forEach(pane => pane.toggleAttribute('hidden', pane.dataset.rfPane !== id));
        };
        link.addEventListener('pointerenter', () => {
            clearTimeout(wait);
            wait = setTimeout(show, 70);
        });
        link.addEventListener('pointerleave', () => clearTimeout(wait));
        link.addEventListener('focus', show);
    });
}

function drawer() {
    const root = document.querySelector('[data-rf-drawer]');
    const button = document.querySelector('[data-rf-drawer-open]');
    if (!root || !button) return;
    const set = show => {
        root.hidden = !show;
        button.setAttribute('aria-expanded', String(show));
        document.body.style.overflow = show ? 'hidden' : '';
        if (show) root.querySelector('[data-rf-drawer-close]').focus();
        else button.focus();
    };
    button.addEventListener('click', () => set(true));
    root.querySelectorAll('[data-rf-drawer-close]').forEach(el => el.addEventListener('click', () => set(false)));
    root.addEventListener('click', event => { if (event.target === root) set(false); });
    root.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            set(false);
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...root.querySelectorAll('a[href], button, summary')].filter(el => el.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });
    window.matchMedia('(min-width: 1040px)').addEventListener('change', event => { if (event.matches && !root.hidden) set(false); });
}

export default function start() {
    const head = document.querySelector('[data-rf-head]');
    if (!head) return;
    megaMenus(head);
    drawer();
}
