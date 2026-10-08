import startMenu, { DESKTOP_QUERY, HOVER_DELAY, aimingAt } from '../../../theme/reelflies/menu';
import startHeader from '../../../theme/reelflies/header';

// The grouped menu's toggles (ticket 28; spec module 3, stories 4, 9 and 72): JavaScript only
// toggles hidden and aria-expanded, and never builds a link. On phones each row's button opens
// its pane in place, several at once; from 801px the button is the rail item and shows its pane
// alone. "Shop flies" (ticket 27's header.js) opens the panel; this shows a pane when it opens,
// the first Fly Type's to begin with, and moves focus to its rail item.
//
// The rail's behaviour from 801px (ticket 29; UX-2, O08, story 8): a click switches the pane at
// once; hover switches it only once the pointer has rested on an item for 300 ms, and never
// while it moves toward the open pane (menu-aim); the arrow keys, Home and End move along the
// rail; focus leaving the panel closes it.

const flush = () => new Promise(resolve => {
    setTimeout(resolve, 0);
});

const row = (id, name, kids) => `
    <li class="rf-menu-item">
        <div class="rf-menu-row">
            <a class="rf-menu-name" href="/${id}/" data-rf-category="${id}">${name}</a>
            <button class="rf-menu-toggle" type="button" aria-expanded="false" aria-controls="rf-menu-pane-${id}" data-rf-menu-toggle>Show ${name}</button>
        </div>
        <div class="rf-menu-pane" id="rf-menu-pane-${id}" data-rf-menu-pane hidden>
            <h2 class="rf-menu-heading"><a href="/${id}/" data-rf-category="${id}">${name}</a></h2>
            <ul class="rf-menu-kids">${kids.map(kid => `<li><a href="/${id}/${kid}/" data-rf-category="${kid}">${kid}</a></li>`).join('')}</ul>
        </div>
    </li>`;

function page() {
    document.body.innerHTML = `
        <header class="header rf-header" data-rf-header>
            <button class="rf-header-shop" type="button" aria-controls="menu" aria-expanded="false" data-rf-shop>Shop flies</button>
            <a class="rf-header-cart" href="/cart.php">Cart</a>
            <div class="navPages-container rf-header-drawer rf-header-drawer--grouped" id="menu">
                <nav class="rf-menu" aria-label="Shop flies" data-rf-menu>
                    <ul class="rf-menu-list">${row('501', 'Dry Flies', ['601', '602'])}${row('502', 'Nymphs', ['603'])}</ul>
                    <ul class="rf-menu-list">${row('520', 'Flies by Species', ['604'])}</ul>
                    <ul class="rf-menu-list"><li class="rf-menu-item"><a class="rf-menu-name rf-menu-name--plain" href="/clearance/" data-rf-category="560">Clearance</a></li></ul>
                    <div class="rf-menu-foot" data-rf-menu-foot><a class="rf-menu-foot-link" href="/fly-hook-size-chart/">Hook size chart</a></div>
                </nav>
            </div>
        </header>
        <main><a href="/after/">After the header</a></main>`;
    const toggle = id => document.querySelector(`[aria-controls="rf-menu-pane-${id}"]`);
    const pane = id => document.getElementById(`rf-menu-pane-${id}`);
    return {
        nav: document.querySelector('[data-rf-menu]'),
        shop: document.querySelector('[data-rf-shop]'),
        cart: document.querySelector('.rf-header-cart'),
        plain: document.querySelector('.rf-menu-name--plain'),
        toggle,
        pane,
    };
}

// A window whose (min-width: 801px) query matches or not, and can change. menu.js reads `matches`
// when an event comes; header.js, started beside it in the focus tests, listens for the change.
// Its timers are the page's, so Jest's fake timers drive the hover delay.
function windowAt(desktop) {
    const listeners = [];
    const query = {
        matches: desktop,
        media: DESKTOP_QUERY,
        addEventListener: (type, listener) => listeners.push(listener),
        removeEventListener: (type, listener) => listeners.splice(listeners.indexOf(listener), 1),
    };
    return {
        MutationObserver: window.MutationObserver,
        matchMedia: media => (media === DESKTOP_QUERY ? query : { matches: false, addEventListener() {}, removeEventListener() {} }),
        setTimeout: (...args) => setTimeout(...args),
        clearTimeout: id => clearTimeout(id),
        resize(matches) {
            query.matches = matches;
            listeners.forEach(listener => listener({ matches }));
        },
    };
}

// The rail laid out as at 1280: each rail item 42px tall from y=40, x 10 to 290, and the panes
// beside it from x=301 (jsdom lays nothing out).
const RAIL_TOP = 40;
const ITEM = 42;
function layOut({ toggle, pane }, ids = ['501', '502', '520']) {
    ids.forEach((id, index) => {
        const top = RAIL_TOP + (index * ITEM);
        const button = toggle(id);
        const box = pane(id);
        button.getBoundingClientRect = () => ({
            left: 10, right: 290, top, bottom: top + ITEM, width: 280, height: ITEM,
        });
        box.getBoundingClientRect = () => (box.hidden ? {
            left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0,
        } : {
            left: 301, right: 1176, top: 0, bottom: 420, width: 875, height: 420,
        });
    });
}

// The pointer moving to (x, y) over `target`, as the browser reports it.
const move = (target, x, y) => target.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
const key = (target, name) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
};

const expanded = ids => ids.map(id => document.querySelector(`[aria-controls="rf-menu-pane-${id}"]`).getAttribute('aria-expanded'));
const shown = ids => ids.map(id => !document.getElementById(`rf-menu-pane-${id}`).hidden);

describe('the grouped menu', () => {
    let stop;
    afterEach(() => {
        if (stop) stop();
        stop = null;
    });

    it('starts nothing on a page without the grouped menu (the stock fallback)', () => {
        document.body.innerHTML = '<div id="menu" data-menu><nav class="navPages"></nav></div>';
        expect(startMenu({ win: windowAt(false) })).toBe(null);
    });

    describe('on phones', () => {
        it('opens a row\'s pane in place from its button, and closes it again', () => {
            const { toggle } = page();
            stop = startMenu({ win: windowAt(false) }).stop;
            toggle('501').click();
            expect(expanded(['501', '502', '520'])).toEqual(['true', 'false', 'false']);
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
            toggle('501').click();
            expect(expanded(['501'])).toEqual(['false']);
            expect(shown(['501'])).toEqual([false]);
        });

        it('lets several rows be open at once', () => {
            const { toggle } = page();
            stop = startMenu({ win: windowAt(false) }).stop;
            toggle('501').click();
            toggle('520').click();
            expect(shown(['501', '502', '520'])).toEqual([true, false, true]);
        });

        it('leaves the name link alone: it is a link to the category', () => {
            const { nav } = page();
            stop = startMenu({ win: windowAt(false) }).stop;
            const link = nav.querySelector('.rf-menu-name');
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            link.dispatchEvent(click);
            expect(click.defaultPrevented).toBe(false);
            expect(expanded(['501'])).toEqual(['false']);
        });
    });

    describe('from 801px', () => {
        it('shows the first Fly Type\'s pane when "Shop flies" opens the panel, and moves focus to its rail item', async () => {
            const { shop, toggle } = page();
            stop = startMenu({ win: windowAt(true) }).stop;
            shop.setAttribute('aria-expanded', 'true'); // header.js opens the panel
            await flush();
            expect(expanded(['501', '502', '520'])).toEqual(['true', 'false', 'false']);
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
            expect(document.activeElement).toBe(toggle('501'));
        });

        it('catches up when the panel opened before this started (the chunk loads after the stock globals)', () => {
            const { shop, toggle } = page();
            shop.setAttribute('aria-expanded', 'true');
            stop = startMenu({ win: windowAt(true) }).stop;
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
            expect(document.activeElement).toBe(toggle('501'));
        });

        it('shows one pane at a time: a rail item\'s button shows its own and hides the rest', () => {
            const { toggle } = page();
            stop = startMenu({ win: windowAt(true) }).stop;
            toggle('501').click();
            toggle('520').click();
            expect(expanded(['501', '502', '520'])).toEqual(['false', 'false', 'true']);
            expect(shown(['501', '502', '520'])).toEqual([false, false, true]);
            toggle('520').click();
            expect(shown(['520'])).toEqual([true]);
        });

        it('opens again on the pane last shown', async () => {
            const { shop, toggle } = page();
            stop = startMenu({ win: windowAt(true) }).stop;
            shop.setAttribute('aria-expanded', 'true');
            await flush();
            toggle('502').click();
            shop.setAttribute('aria-expanded', 'false');
            await flush();
            shop.setAttribute('aria-expanded', 'true');
            await flush();
            expect(shown(['501', '502', '520'])).toEqual([false, true, false]);
            expect(document.activeElement).toBe(toggle('502'));
        });

        it('keeps one pane when the panel opens after rows were opened at phone width', async () => {
            const { shop, toggle } = page();
            const win = windowAt(false);
            stop = startMenu({ win }).stop;
            toggle('502').click();
            toggle('520').click();
            win.resize(true);
            shop.setAttribute('aria-expanded', 'true');
            await flush();
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
        });
    });

    describe('aimingAt: is the pointer heading for the open pane? (menu-aim)', () => {
        const pane = { left: 301, top: 0, bottom: 420 };

        it('is true while the pointer moves toward the pane, down, across or up', () => {
            expect(aimingAt({ x: 150, y: 61 }, { x: 163, y: 68 }, pane)).toBe(true);
            expect(aimingAt({ x: 150, y: 61 }, { x: 160, y: 61 }, pane)).toBe(true);
            expect(aimingAt({ x: 150, y: 300 }, { x: 160, y: 290 }, pane)).toBe(true);
        });

        it('is false moving along the rail, away from the pane, past its corners, or not moving', () => {
            expect(aimingAt({ x: 150, y: 61 }, { x: 150, y: 80 }, pane)).toBe(false); // down the rail
            expect(aimingAt({ x: 150, y: 80 }, { x: 150, y: 61 }, pane)).toBe(false); // up the rail
            expect(aimingAt({ x: 150, y: 61 }, { x: 140, y: 61 }, pane)).toBe(false); // away from the pane
            expect(aimingAt({ x: 150, y: 61 }, { x: 160, y: 20 }, pane)).toBe(false); // above the pane's top corner
            expect(aimingAt({ x: 150, y: 400 }, { x: 155, y: 440 }, pane)).toBe(false); // below its bottom corner
            expect(aimingAt({ x: 150, y: 61 }, { x: 150, y: 61 }, pane)).toBe(false); // still
        });

        it('is false with no earlier position or no open pane', () => {
            expect(aimingAt(null, { x: 150, y: 61 }, pane)).toBe(false);
            expect(aimingAt({ x: 150, y: 61 }, { x: 160, y: 61 }, null)).toBe(false);
        });
    });

    describe('the rail from 801px, with the panel open (ticket 29)', () => {
        // header.js has opened the panel; menu.js catches up, shows Dry Flies' pane and focuses it.
        function openPanel(win = windowAt(true)) {
            const parts = page();
            layOut(parts);
            parts.shop.setAttribute('aria-expanded', 'true');
            stop = startMenu({ win }).stop;
            return { ...parts, win };
        }

        beforeEach(() => jest.useFakeTimers());
        afterEach(() => jest.useRealTimers());

        it('waits 300 ms', () => {
            expect(HOVER_DELAY).toBe(300);
        });

        it('switches the pane on hover only once the pointer has rested on a rail item for 300 ms', () => {
            const { toggle } = openPanel();
            move(toggle('501'), 150, 61);
            move(toggle('502'), 150, 100); // down the rail, away from the pane
            jest.advanceTimersByTime(HOVER_DELAY - 1);
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
            jest.advanceTimersByTime(1);
            expect(shown(['501', '502', '520'])).toEqual([false, true, false]);
            expect(expanded(['501', '502', '520'])).toEqual(['false', 'true', 'false']);
        });

        it('counts the wait from the item the pointer came onto, whatever it does there but head for the pane', () => {
            const { toggle } = openPanel();
            move(toggle('501'), 150, 61);
            move(toggle('502'), 150, 90);
            jest.advanceTimersByTime(150);
            move(toggle('502'), 140, 110); // still on Nymphs, moving down and away from the pane
            jest.advanceTimersByTime(HOVER_DELAY - 150);
            expect(shown(['501', '502'])).toEqual([false, true]);
        });

        // UX-2: a straight line from Dry Flies to its first child crosses Nymphs and Flies by
        // Species. The earlier mockup switched to the last item crossed at every speed.
        it.each([125, 250, 500, 1000])('keeps Dry Flies\' pane open while the pointer moves diagonally to its first child in %i ms', duration => {
            const { nav, toggle, pane } = openPanel();
            const from = { x: 150, y: 61 };
            const to = { x: 420, y: 200 };
            const steps = 20;
            const crossed = new Set();
            for (let step = 1; step <= steps; step += 1) {
                const x = from.x + (((to.x - from.x) * step) / steps);
                const y = from.y + (((to.y - from.y) * step) / steps);
                const index = Math.floor((y - RAIL_TOP) / ITEM);
                let target = nav;
                if (x <= 290) target = toggle(['501', '502', '520'][index]);
                else if (x >= 301) target = pane('501').querySelector('.rf-menu-kids a');
                if (x <= 290) crossed.add(['501', '502', '520'][index]);
                move(target, x, y);
                jest.advanceTimersByTime(duration / steps);
            }
            jest.advanceTimersByTime(1000);
            expect([...crossed]).toEqual(['501', '502', '520']);
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
        });

        it('switches after a 300 ms rest, even where the pointer had been heading for the pane', () => {
            const { toggle } = openPanel();
            move(toggle('501'), 150, 61);
            move(toggle('502'), 170, 90); // toward the pane
            jest.advanceTimersByTime(HOVER_DELAY - 1);
            expect(shown(['501', '502'])).toEqual([true, false]);
            jest.advanceTimersByTime(1);
            expect(shown(['501', '502'])).toEqual([false, true]);
        });

        it('forgets the wait when the pointer goes on into the pane or leaves the panel', () => {
            const { nav, toggle, pane } = openPanel();
            move(toggle('502'), 150, 100);
            move(pane('501'), 400, 120);
            jest.advanceTimersByTime(1000);
            expect(shown(['501', '502'])).toEqual([true, false]);
            move(toggle('520'), 150, 140);
            nav.dispatchEvent(new MouseEvent('mouseleave'));
            jest.advanceTimersByTime(1000);
            expect(shown(['501', '520'])).toEqual([true, false]);
        });

        it('switches at once on a click, and a click on the item hover has just opened leaves its pane open', () => {
            const { toggle } = openPanel();
            move(toggle('502'), 150, 100);
            jest.advanceTimersByTime(HOVER_DELAY);
            expect(shown(['501', '502'])).toEqual([false, true]);
            toggle('502').click(); // hover then click: the critique's desktop menu finding
            expect(shown(['501', '502', '520'])).toEqual([false, true, false]);
            expect(expanded(['502'])).toEqual(['true']);
            toggle('520').click();
            expect(shown(['501', '502', '520'])).toEqual([false, false, true]);
        });

        it('lets a click win over a wait still running', () => {
            const { toggle } = openPanel();
            move(toggle('502'), 150, 100);
            jest.advanceTimersByTime(100);
            toggle('520').click();
            jest.advanceTimersByTime(1000);
            expect(shown(['501', '502', '520'])).toEqual([false, false, true]);
        });

        it('does nothing on hover while the panel is closed, or below 801px', () => {
            const { toggle, shop } = openPanel();
            shop.setAttribute('aria-expanded', 'false');
            move(toggle('502'), 150, 100);
            jest.advanceTimersByTime(1000);
            expect(shown(['501', '502'])).toEqual([true, false]);
            stop();
            const phone = page();
            layOut(phone);
            stop = startMenu({ win: windowAt(false) }).stop;
            move(phone.toggle('502'), 150, 100);
            jest.advanceTimersByTime(1000);
            expect(shown(['501', '502', '520'])).toEqual([false, false, false]);
        });

        it('stops a wait when the window narrows to the phone layout', () => {
            const { toggle, win } = openPanel();
            move(toggle('502'), 150, 100);
            win.resize(false);
            jest.advanceTimersByTime(1000);
            expect(shown(['501', '502'])).toEqual([true, false]);
        });

        it('moves focus along the rail with the arrow keys, Home and End, and leaves the pane as it was (story 8)', () => {
            const { toggle, plain } = openPanel();
            expect(document.activeElement).toBe(toggle('501'));
            const down = key(document.activeElement, 'ArrowDown');
            expect(down.defaultPrevented).toBe(true); // the page doesn't scroll
            expect(document.activeElement).toBe(toggle('502'));
            key(document.activeElement, 'ArrowDown');
            expect(document.activeElement).toBe(toggle('520'));
            key(document.activeElement, 'ArrowDown');
            expect(document.activeElement).toBe(plain); // a plain link in the rail is a rail item too
            key(document.activeElement, 'ArrowDown');
            expect(document.activeElement).toBe(toggle('501')); // round to the top
            key(document.activeElement, 'ArrowUp');
            expect(document.activeElement).toBe(plain); // round to the bottom
            key(document.activeElement, 'Home');
            expect(document.activeElement).toBe(toggle('501'));
            key(document.activeElement, 'End');
            expect(document.activeElement).toBe(plain);
            expect(shown(['501', '502', '520'])).toEqual([true, false, false]);
        });

        it('leaves the keys alone in a pane and below 801px', () => {
            const { pane } = openPanel();
            const link = pane('501').querySelector('.rf-menu-kids a');
            link.focus();
            expect(key(link, 'ArrowDown').defaultPrevented).toBe(false);
            expect(document.activeElement).toBe(link);
            stop();
            const phone = page();
            stop = startMenu({ win: windowAt(false) }).stop;
            phone.toggle('501').focus();
            expect(key(phone.toggle('501'), 'ArrowDown').defaultPrevented).toBe(false);
            expect(document.activeElement).toBe(phone.toggle('501'));
        });
    });

    describe('focus leaving the open panel (ticket 29; accessibility item 6)', () => {
        let stopHeader;
        afterEach(() => {
            if (stopHeader) stopHeader();
            stopHeader = null;
        });

        // The real header.js opens and closes the panel, as on the page.
        function openWithHeader(win = windowAt(true)) {
            const parts = page();
            stopHeader = startHeader({ win }).stop;
            parts.shop.click();
            stop = startMenu({ win }).stop;
            return parts;
        }
        const panelOpen = shop => shop.getAttribute('aria-expanded') === 'true' && document.getElementById('menu').classList.contains('rf-is-panel-open');

        it('keeps the panel open while focus moves inside it, or onto "Shop flies"', () => {
            const { shop, toggle, pane } = openWithHeader();
            expect(document.activeElement).toBe(toggle('501'));
            toggle('502').focus();
            pane('501').querySelector('h2 a').focus();
            expect(panelOpen(shop)).toBe(true);
            shop.focus();
            expect(panelOpen(shop)).toBe(true);
        });

        it('closes the panel when focus moves out of it to the header row (shift-tab from the rail), leaving focus there', () => {
            const { shop, cart } = openWithHeader();
            cart.focus();
            expect(panelOpen(shop)).toBe(false);
            expect(document.activeElement).toBe(cart);
        });

        it('closes the panel when focus moves on past the header (tab from the rail\'s foot)', () => {
            const { shop, nav } = openWithHeader();
            nav.querySelector('.rf-menu-foot-link').focus();
            expect(panelOpen(shop)).toBe(true);
            document.querySelector('main a').focus();
            expect(panelOpen(shop)).toBe(false);
        });
    });

    it('only toggles hidden and aria-expanded: it never adds an element or sets an href (story 72)', async () => {
        const { nav, shop, toggle } = page();
        const linksBefore = [...nav.querySelectorAll('a')].map(link => link.outerHTML);
        const changes = [];
        const observer = new MutationObserver(records => changes.push(...records));
        observer.observe(nav, {
            subtree: true, childList: true, attributes: true, characterData: true,
        });
        const win = windowAt(true);
        stop = startMenu({ win }).stop;
        shop.setAttribute('aria-expanded', 'true');
        await flush();
        toggle('502').click();
        win.resize(false);
        toggle('520').click();
        await flush();
        observer.disconnect();
        expect(changes.length).toBeGreaterThan(0);
        expect(changes.filter(change => change.type !== 'attributes')).toEqual([]);
        expect([...new Set(changes.map(change => change.attributeName))].sort()).toEqual(['aria-expanded', 'hidden']);
        expect([...nav.querySelectorAll('a')].map(link => link.outerHTML)).toEqual(linksBefore);
    });

    it('still only toggles hidden and aria-expanded in the menu with hover, the rail keys and focus leaving the panel (ticket 29; story 72)', () => {
        jest.useFakeTimers();
        try {
            const parts = page();
            layOut(parts);
            const { nav, toggle } = parts;
            const linksBefore = [...nav.querySelectorAll('a')].map(link => link.outerHTML);
            const win = windowAt(true);
            const stopHeader = startHeader({ win }).stop;
            parts.shop.click();
            stop = startMenu({ win }).stop;
            const changes = [];
            const observer = new MutationObserver(records => changes.push(...records));
            observer.observe(nav, {
                subtree: true, childList: true, attributes: true, characterData: true,
            });
            move(toggle('502'), 150, 100);
            jest.advanceTimersByTime(HOVER_DELAY);
            key(document.activeElement, 'ArrowDown');
            toggle('520').click();
            parts.cart.focus();
            changes.push(...observer.takeRecords());
            observer.disconnect();
            stopHeader();
            expect(changes.length).toBeGreaterThan(0);
            expect(changes.filter(change => change.type !== 'attributes')).toEqual([]);
            expect([...new Set(changes.map(change => change.attributeName))].sort()).toEqual(['aria-expanded', 'hidden']);
            expect([...nav.querySelectorAll('a')].map(link => link.outerHTML)).toEqual(linksBefore);
        } finally {
            jest.useRealTimers();
        }
    });

    it('stops listening when stopped', async () => {
        const { shop, toggle } = page();
        startMenu({ win: windowAt(true) }).stop();
        toggle('502').click();
        shop.setAttribute('aria-expanded', 'true');
        await flush();
        expect(shown(['501', '502', '520'])).toEqual([false, false, false]);
    });
});
