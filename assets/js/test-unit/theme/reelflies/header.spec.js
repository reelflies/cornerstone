import startHeader, { PANEL_OPEN_CLASS } from '../../../theme/reelflies/header';
import { isOpen } from '../../../theme/reelflies/open-state';

// The header's behaviour (ticket 27; spec module 4, story 9): Escape closes the phone drawer and
// gives focus back to the Menu button, the drawer writes its token in <html data-rf-open>, and
// "Shop flies" opens the stock menu as a panel on desktop until ticket 28's grouped panel.
// The Menu/Close label follows aria-expanded in CSS, so it needs no script.

const flush = () => new Promise(resolve => {
    setTimeout(resolve, 0);
});

function header() {
    document.body.innerHTML = `
        <header class="header rf-header" data-rf-header>
            <div class="rf-header-row">
                <button class="rf-header-menu" type="button" data-mobile-menu-toggle="menu" aria-controls="menu" aria-expanded="false">Menu</button>
                <button class="rf-header-shop" type="button" aria-controls="menu" aria-expanded="false" data-rf-shop>Shop flies</button>
                <input id="rf-search-header" name="search_query" type="search">
            </div>
            <div class="navPages-container" id="menu" data-menu><a href="/dry-flies/">Dry Flies</a></div>
        </header>
        <main><a href="/elsewhere/">Elsewhere</a></main>`;
    const menuButton = document.querySelector('[data-mobile-menu-toggle]');
    const menu = document.getElementById('menu');
    // A stand-in for stock mobile-menu-toggle.js: a click toggles is-open and aria-expanded.
    menuButton.addEventListener('click', () => {
        const open = !menu.classList.contains('is-open');
        menu.classList.toggle('is-open', open);
        menuButton.classList.toggle('is-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
    });
    return {
        menuButton, menu, shop: document.querySelector('[data-rf-shop]'), outside: document.querySelector('main a'),
    };
}

const key = (target, name) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

describe('the phone drawer', () => {
    let stop;
    afterEach(() => {
        if (stop) stop();
        stop = null;
        document.documentElement.removeAttribute('data-rf-open');
    });

    it('starts nothing on a page without the ReelFlies header', () => {
        document.body.innerHTML = '<main></main>';
        expect(startHeader()).toBe(null);
    });

    it('closes on Escape and gives focus back to the Menu button', () => {
        const { menuButton, menu } = header();
        stop = startHeader().stop;
        menuButton.click();
        menu.querySelector('a').focus();
        key(document.activeElement, 'Escape');
        expect(menu.classList.contains('is-open')).toBe(false);
        expect(menuButton.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(menuButton);
    });

    it('leaves Escape alone while the drawer is closed', () => {
        const { menuButton, outside } = header();
        stop = startHeader().stop;
        outside.focus();
        key(outside, 'Escape');
        expect(menuButton.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(outside);
    });

    it('writes "drawer" in <html data-rf-open> while it is open (build pipeline 6.9)', async () => {
        const { menuButton } = header();
        stop = startHeader().stop;
        menuButton.click();
        await flush();
        expect(isOpen('drawer')).toBe(true);
        menuButton.click();
        await flush();
        expect(isOpen('drawer')).toBe(false);
        expect(document.documentElement.hasAttribute('data-rf-open')).toBe(false);
    });
});

describe('"Shop flies" until ticket 28', () => {
    let stop;
    afterEach(() => {
        if (stop) stop();
        stop = null;
    });

    it('opens the menu as a panel, and says so with aria-expanded', () => {
        const { shop, menu } = header();
        stop = startHeader().stop;
        shop.click();
        expect(shop.getAttribute('aria-expanded')).toBe('true');
        expect(menu.classList.contains(PANEL_OPEN_CLASS)).toBe(true);
        shop.click();
        expect(shop.getAttribute('aria-expanded')).toBe('false');
        expect(menu.classList.contains(PANEL_OPEN_CLASS)).toBe(false);
    });

    it('closes on Escape and gives focus back to "Shop flies"', () => {
        const { shop, menu } = header();
        stop = startHeader().stop;
        shop.click();
        menu.querySelector('a').focus();
        key(document.activeElement, 'Escape');
        expect(shop.getAttribute('aria-expanded')).toBe('false');
        expect(menu.classList.contains(PANEL_OPEN_CLASS)).toBe(false);
        expect(document.activeElement).toBe(shop);
    });

    it('closes on a click outside the header, and stays open for a click inside the panel', () => {
        const { shop, menu, outside } = header();
        stop = startHeader().stop;
        shop.click();
        menu.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(shop.getAttribute('aria-expanded')).toBe('true');
        outside.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        expect(shop.getAttribute('aria-expanded')).toBe('false');
        expect(menu.classList.contains(PANEL_OPEN_CLASS)).toBe(false);
    });

    it('closes when focus leaves the header', () => {
        const { shop, outside } = header();
        stop = startHeader().stop;
        shop.click();
        outside.focus();
        outside.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
        expect(shop.getAttribute('aria-expanded')).toBe('false');
    });

    it('stops listening when stopped', () => {
        const { shop, menu } = header();
        startHeader().stop();
        shop.click();
        expect(shop.getAttribute('aria-expanded')).toBe('false');
        expect(menu.classList.contains(PANEL_OPEN_CLASS)).toBe(false);
    });
});
