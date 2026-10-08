import startMenu, { DESKTOP_QUERY } from '../../../theme/reelflies/menu';

// The grouped menu's toggles (ticket 28; spec module 3, stories 4, 9 and 72): JavaScript only
// toggles hidden and aria-expanded, and never builds a link. On phones each row's button opens
// its pane in place, several at once; from 801px the button is the rail item and shows its pane
// alone. "Shop flies" (ticket 27's header.js) opens the panel; this shows a pane when it opens,
// the first Fly Type's to begin with, and moves focus to its rail item.

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
            <div class="navPages-container rf-header-drawer rf-header-drawer--grouped" id="menu">
                <nav class="rf-menu" aria-label="Shop flies" data-rf-menu>
                    <ul class="rf-menu-list">${row('501', 'Dry Flies', ['601', '602'])}${row('502', 'Nymphs', ['603'])}</ul>
                    <ul class="rf-menu-list">${row('520', 'Flies by Species', ['604'])}</ul>
                    <ul class="rf-menu-list"><li class="rf-menu-item"><a class="rf-menu-name rf-menu-name--plain" href="/clearance/" data-rf-category="560">Clearance</a></li></ul>
                </nav>
            </div>
        </header>`;
    const toggle = id => document.querySelector(`[aria-controls="rf-menu-pane-${id}"]`);
    const pane = id => document.getElementById(`rf-menu-pane-${id}`);
    return {
        nav: document.querySelector('[data-rf-menu]'), shop: document.querySelector('[data-rf-shop]'), toggle, pane,
    };
}

// A window whose (min-width: 801px) query matches or not, and can change.
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
        resize(matches) {
            query.matches = matches;
            listeners.forEach(listener => listener({ matches }));
        },
    };
}

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

    it('stops listening when stopped', async () => {
        const { shop, toggle } = page();
        startMenu({ win: windowAt(true) }).stop();
        toggle('502').click();
        shop.setAttribute('aria-expanded', 'true');
        await flush();
        expect(shown(['501', '502', '520'])).toEqual([false, false, false]);
    });
});
