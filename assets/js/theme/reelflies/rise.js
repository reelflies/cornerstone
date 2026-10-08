// The rise ring (ticket 27; spec module 19, R3, story 57): one ring spreads from the cart count
// when the count goes up, over 300ms, like a trout rising. It loads only with rf_rise on
// (reelflies/global.js reads context.rfRise, from js-settings.html), and the header renders the
// ring's markup only then (components/reelflies/header.html), so with the switch off the cart
// count is stock and no rise script loads.
//
// When it plays:
// - The stock cart-quantity-update event carries the new count (cart-preview.js, after an add or
//   a cart change). The count is also read from the pill on rf:cart-changed (build pipeline 6.9),
//   which ticket 38's add sends after the stock event, and which ticket 54's motion check sends.
// - Never for the count the page loads with. cart-preview.js sets the pill from localStorage
//   before this module starts (cart-preview.js:77), and then, when the page has a cart, sends
//   the Cart API's count once more (:97-99): that first stock event is skipped, whatever it
//   says. With no cart it sends 0 at once (:101-103), before this module starts.
// - The wait for that refresh also ends at the shopper's first tap or key press, because any add
//   comes after one. The request goes out (global.js:21) before this module's chunk is asked
//   for (:31), so on a cold cache the refresh can land first, and when the request fails
//   (cart-preview.js:89) no event comes at all; either way, the wait would swallow the first add.
// - Never on a decrease, or when the count stays the same.
// - Never under prefers-reduced-motion: reduce. The CSS hides the ring then too (_header.scss).

import $ from 'jquery';
import { REDUCED_MOTION_QUERY } from './reduced-motion';

export const RING_SELECTOR = '[data-rf-rise]';
export const COUNT_SELECTOR = '.cart-quantity';
export const RISING_CLASS = 'is-rising';

// A cart count from an event or the pill's text: a whole number, 0 or more, or null.
export function toCount(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    if (!/^\d+$/.test(text)) return null;
    return Number(text);
}

// The trigger rules, without the page. next(count, { source, reducedMotion }) says whether the
// ring plays for this count. `source` is 'stock' for cart-quantity-update. next.settle() stops
// waiting for the Cart API's refresh.
export function riseRule({ startCount = null, refreshPending = false } = {}) {
    let last = toCount(startCount);
    let pending = Boolean(refreshPending);
    function next(count, { source = 'changed', reducedMotion = false } = {}) {
        const value = toCount(count);
        if (value === null) return false;
        if (pending && source === 'stock') {
            pending = false;
            last = value;
            return false;
        }
        if (last === null) {
            last = value;
            return false;
        }
        const up = value > last;
        last = value;
        return up && !reducedMotion;
    }
    next.settle = () => {
        pending = false;
    };
    return next;
}

export default function startRise(context = {}, { doc = document, win = window, jquery = $ } = {}) {
    const ring = doc.querySelector(RING_SELECTOR);
    if (!ring) return null;
    const pill = ring.parentElement && ring.parentElement.querySelector(COUNT_SELECTOR);
    const readCount = () => (pill ? pill.textContent : null);
    const motion = typeof win.matchMedia === 'function' ? win.matchMedia(REDUCED_MOTION_QUERY) : null;
    const next = riseRule({ startCount: readCount(), refreshPending: Boolean(context.cartId) });

    const play = () => {
        ring.classList.remove(RISING_CLASS);
        void ring.offsetWidth; // eslint-disable-line no-void
        ring.classList.add(RISING_CLASS);
    };
    const handle = (count, source) => {
        if (next(count, { source, reducedMotion: Boolean(motion && motion.matches) })) play();
    };

    // The shopper's first tap or key press: no add can come before it.
    const settle = () => {
        next.settle();
        doc.removeEventListener('pointerdown', settle, true);
        doc.removeEventListener('keydown', settle, true);
    };
    doc.addEventListener('pointerdown', settle, true);
    doc.addEventListener('keydown', settle, true);

    ring.addEventListener('animationend', () => ring.classList.remove(RISING_CLASS));
    jquery(doc.body).on('cart-quantity-update', (event, quantity) => handle(quantity, 'stock'));
    doc.addEventListener('rf:cart-changed', () => handle(readCount(), 'changed'));
    return { ring, handle };
}
