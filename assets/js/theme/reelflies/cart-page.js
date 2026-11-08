// The cart page, "Your box" (redesign step 3; ticket 41; components/reelflies/cart-page.html),
// loaded on pages/cart through page-modules.js: start(context). Stock cart.js does the changing
// and redraws the box after each one; this works round it.
//
// - Each pattern's sizes in hook order (the rows' data-rf-size, hook-order.js), on load and after
//   every redraw; a pattern in more than one size shows its rows once they are in order (CSS
//   keeps their place meanwhile), and focus stays where stock put it.
// - − and +: the number steps at once on every tap, and once the taps stop (PAUSE_MS) stock's own
//   update sends the total, through the field's change event, which stock listens for. So quick
//   taps add up, where stock's buttons would send one step. 0 takes the line out.
// - After every redraw, the box's new count is said in the polite live region, and the phone
//   bar's count and total follow the store's.
// - The free-shipping line and meter, as the order line shows them (box-words.js), from the box.

import $ from 'jquery';
import * as box from './box';
import { meterHtml, shippingHtml } from './box-words';
import { flyBrandList } from './cart-count';
import { sortByHookOrder } from './hook-order';
import { announce } from './live-region';
import { word } from './words';

export const PAUSE_MS = 600;
const ROWS = '[data-rf-cart-rows]';
const ROW = '[data-item-row]';
const FIELD = '.cart-item-qty-input';

const pending = new WeakMap(); // field -> timer while taps come

// Puts every pattern's rows in hook order; rows with no size keep their place after the sizes.
export function sortRows(root = document) {
    const doc = root.ownerDocument || root;
    const focused = doc.activeElement;
    root.querySelectorAll(ROWS).forEach(list => {
        const rows = Array.from(list.children).filter(child => child.matches(ROW));
        const sorted = sortByHookOrder(rows, row => row.dataset.rfSize);
        if (sorted.some((row, index) => row !== rows[index])) sorted.forEach(row => list.appendChild(row));
        list.setAttribute('data-rf-cart-sorted', '');
    });
    if (focused && focused !== doc.activeElement && focused.isConnected) focused.focus();
}

export function stepField(field, by) {
    const max = Number(field.dataset.quantityMax) || 999;
    const value = Math.max(0, Math.min(max, (parseInt(field.value, 10) || 0) + by));
    const input = field;
    input.value = String(value);
    return value;
}

function onStep(event) {
    const button = event.target.closest('[data-rf-cart-step]');
    if (!button) return;
    event.preventDefault();
    const row = button.closest(ROW);
    const field = row && row.querySelector(FIELD);
    if (!field || field.disabled) return;
    const timer = pending.get(field);
    if (timer) clearTimeout(timer);
    // stock's change handler compares with the value the field had on focus
    else $(field).triggerHandler('focus');
    stepField(field, Number(button.dataset.rfCartStep));
    pending.set(field, setTimeout(() => {
        pending.delete(field);
        $(field).trigger('change');
    }, PAUSE_MS));
}

function syncBar(doc) {
    const count = doc.querySelector('[data-rf-cart-count]');
    const barCount = doc.querySelector('[data-rf-cartbar-count]');
    if (barCount) barCount.textContent = count ? count.textContent.replace(/\s+/g, ' ').trim() : '';
    const total = doc.querySelector('[data-cart-totals] .cart-total-grandTotal .cart-total-amount, [data-cart-totals] .cart-total-grandTotal span');
    const barTotal = doc.querySelector('[data-rf-cartbar-total]');
    if (total && barTotal) barTotal.textContent = total.textContent.trim();
}

function syncShipping(doc, flyBrands) {
    const ship = doc.querySelector('[data-rf-cart-ship]');
    if (!ship) return;
    const free = Number(ship.dataset.rfFree);
    const totals = box.totals(flyBrands);
    ship.innerHTML = `<p class="rf-box__ship">${shippingHtml(free, ship.dataset.rfMoney || '$', totals)} ${word('ship_note')}</p>${meterHtml(free, totals)}`;
}

export function start(context = {}, doc = document) {
    const content = doc.querySelector('[data-cart-content]');
    if (!content) return;
    const flyBrands = flyBrandList(context.rfFlyBrands);
    sortRows(doc);
    syncBar(doc);
    content.addEventListener('click', onStep);
    // stock redraws the lines, then the totals and the heading, in one task
    new doc.defaultView.MutationObserver(() => {
        sortRows(doc);
        syncBar(doc);
        const count = doc.querySelector('[data-rf-cart-count]');
        if (count) announce(word('cart_now', { count: count.textContent.replace(/\s+/g, ' ').trim() }), doc);
    }).observe(content, { childList: true });
    box.subscribe(() => syncShipping(doc, flyBrands));
    syncShipping(doc, flyBrands);
}
