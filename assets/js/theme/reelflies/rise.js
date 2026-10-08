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
//   before this module starts, and then, when the page has a cart, sends the Cart API's count
//   once more (cart-preview.js:63-87): that first stock event is skipped, whatever it says.
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
// ring plays for this count. `source` is 'stock' for cart-quantity-update.
export function riseRule({ startCount = null, refreshPending = false } = {}) {
    let last = toCount(startCount);
    let pending = Boolean(refreshPending);
    return function next(count, { source = 'changed', reducedMotion = false } = {}) {
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
    };
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

    ring.addEventListener('animationend', () => ring.classList.remove(RISING_CLASS));
    jquery(doc.body).on('cart-quantity-update', (event, quantity) => handle(quantity, 'stock'));
    doc.addEventListener('rf:cart-changed', () => handle(readCount(), 'changed'));
    return { ring, handle };
}
