import $ from 'jquery';
import startRise, {
    RING_SELECTOR, RISING_CLASS, riseRule, toCount,
} from '../../../theme/reelflies/rise';

// The rise ring's trigger rules (ticket 27; spec module 19, story 57; spec seam 4): one ring when
// the cart count goes up, none for the count the page loads with, none on a decrease, none under
// reduced motion.

describe('the rise ring\'s trigger rules', () => {
    it('reads a count from the event or the count pill, and nothing else', () => {
        expect(toCount(3)).toBe(3);
        expect(toCount('12')).toBe(12);
        expect(toCount(' 4 ')).toBe(4);
        expect(toCount(0)).toBe(0);
        expect(toCount('')).toBe(null);
        expect(toCount(null)).toBe(null);
        expect(toCount(undefined)).toBe(null);
        expect(toCount('three')).toBe(null);
        expect(toCount(-1)).toBe(null);
        expect(toCount(2.5)).toBe(null);
    });

    it('rings when the count goes up', () => {
        const next = riseRule({ startCount: 2 });
        expect(next(3)).toBe(true);
        expect(next(5)).toBe(true);
    });

    it('rings on the first add to an empty cart: the page loaded with a count of 0', () => {
        const next = riseRule({ startCount: '0' });
        expect(next(1)).toBe(true);
    });

    it('doesn\'t ring for the count the page loads with: the Cart API\'s refresh on every page load', () => {
        // cart-preview.js:72-103: with a cart, the count from localStorage (:77), then the Cart
        // API's (:97-99); with none, 0 (:101-103).
        const next = riseRule({ startCount: 3, refreshPending: true });
        expect(next(5, { source: 'stock' })).toBe(false);
        expect(next(6, { source: 'stock' })).toBe(true);
    });

    it('stops waiting for the refresh once settled: the shopper\'s first tap or key press comes before any add', () => {
        const next = riseRule({ startCount: 3, refreshPending: true });
        next.settle();
        expect(next(4, { source: 'stock' })).toBe(true);
    });

    it('doesn\'t ring when the page loaded with no count yet: the first one only sets it', () => {
        const next = riseRule({ startCount: '' });
        expect(next(4, { source: 'stock' })).toBe(false);
        expect(next(5, { source: 'stock' })).toBe(true);
    });

    it('doesn\'t ring on a decrease, and rings again on the next increase from there', () => {
        const next = riseRule({ startCount: 5 });
        expect(next(3)).toBe(false);
        expect(next(4)).toBe(true);
    });

    it('doesn\'t ring when the count stays the same, as when rf:cart-changed follows the stock event', () => {
        const next = riseRule({ startCount: 1 });
        expect(next(2, { source: 'stock' })).toBe(true);
        expect(next(2, { source: 'changed' })).toBe(false);
    });

    it('doesn\'t ring under reduced motion, but keeps the count', () => {
        const next = riseRule({ startCount: 1 });
        expect(next(2, { reducedMotion: true })).toBe(false);
        expect(next(2)).toBe(false);
        expect(next(3)).toBe(true);
    });

    it('ignores what isn\'t a count', () => {
        const next = riseRule({ startCount: 1 });
        expect(next('')).toBe(false);
        expect(next(undefined)).toBe(false);
        expect(next(2)).toBe(true);
    });
});

describe('the rise ring on the page', () => {
    let reduced;
    const win = { matchMedia: () => ({ matches: reduced }) };

    function header({ count = '', ring = true } = {}) {
        document.body.innerHTML = `
            <a class="rf-header-cart" href="/cart.php">Cart
                <span class="rf-header-count">
                    <span class="countPill cart-quantity">${count}</span>
                    ${ring ? '<span class="rf-rise" data-rf-rise aria-hidden="true"></span>' : ''}
                </span>
            </a>`;
        return document.querySelector(RING_SELECTOR);
    }

    // What cart-preview.js does on cart-quantity-update: the pill shows the new count.
    function stockUpdate(quantity) {
        $('.cart-quantity').text(quantity).toggleClass('countPill--positive', quantity > 0);
        $('body').trigger('cart-quantity-update', quantity);
    }

    beforeEach(() => {
        reduced = false;
        $('body').off('cart-quantity-update');
    });

    it('starts nothing when the server rendered no ring: rf_rise is off', () => {
        header({ ring: false });
        expect(startRise({}, { doc: document, win, jquery: $ })).toBe(null);
    });

    it('plays the ring when an add raises the count', () => {
        const ring = header({ count: '0' });
        startRise({}, { doc: document, win, jquery: $ });
        stockUpdate(2);
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('removes the ring\'s class once it has played, so the next add plays it again', () => {
        const ring = header({ count: '1' });
        startRise({}, { doc: document, win, jquery: $ });
        stockUpdate(2);
        ring.dispatchEvent(new Event('animationend'));
        expect(ring.classList.contains(RISING_CLASS)).toBe(false);
        stockUpdate(3);
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('skips the Cart API\'s refresh when the page has a cart, and plays on the add after it', () => {
        const ring = header({ count: '3' });
        startRise({ cartId: 'c0ffee' }, { doc: document, win, jquery: $ });
        stockUpdate(4);
        expect(ring.classList.contains(RISING_CLASS)).toBe(false);
        stockUpdate(5);
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('plays on the first add when the Cart API\'s refresh landed before the ring started', () => {
        // global.js:21 sends the request before :31 asks for the rf-rise chunk, so on a cold
        // cache the pill can already show the API's count, and no refresh event is still to come.
        const ring = header({ count: '3' });
        startRise({ cartId: 'c0ffee' }, { doc: document, win, jquery: $ });
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        stockUpdate(4);
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('plays on the first add when the refresh failed and never came, an add made from the keyboard', () => {
        // cart-preview.js:89 rejects on an error other than Not Found, and sends no event.
        const ring = header({ count: '3' });
        startRise({ cartId: 'c0ffee' }, { doc: document, win, jquery: $ });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        stockUpdate(4);
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('still skips the refresh when it lands before the shopper\'s first tap or key press', () => {
        const ring = header({ count: '3' });
        startRise({ cartId: 'c0ffee' }, { doc: document, win, jquery: $ });
        stockUpdate(5);
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(ring.classList.contains(RISING_CLASS)).toBe(false);
        stockUpdate(6);
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('doesn\'t play on a decrease, such as a line removed on the cart page', () => {
        const ring = header({ count: '4' });
        startRise({}, { doc: document, win, jquery: $ });
        stockUpdate(1);
        expect(ring.classList.contains(RISING_CLASS)).toBe(false);
    });

    it('plays on rf:cart-changed when the count pill went up (build pipeline 6.9)', () => {
        const ring = header({ count: '1' });
        startRise({}, { doc: document, win, jquery: $ });
        document.querySelector('.cart-quantity').textContent = '2';
        document.dispatchEvent(new CustomEvent('rf:cart-changed', { detail: { source: 'test', productId: 1 } }));
        expect(ring.classList.contains(RISING_CLASS)).toBe(true);
    });

    it('plays once when the stock event and rf:cart-changed both follow one add', () => {
        const ring = header({ count: '1' });
        startRise({}, { doc: document, win, jquery: $ });
        stockUpdate(2);
        ring.dispatchEvent(new Event('animationend'));
        document.dispatchEvent(new CustomEvent('rf:cart-changed', { detail: { source: 'test', productId: 1 } }));
        expect(ring.classList.contains(RISING_CLASS)).toBe(false);
    });

    it('doesn\'t play under prefers-reduced-motion: reduce', () => {
        reduced = true;
        const ring = header({ count: '0' });
        startRise({}, { doc: document, win, jquery: $ });
        stockUpdate(1);
        expect(ring.classList.contains(RISING_CLASS)).toBe(false);
    });
});
