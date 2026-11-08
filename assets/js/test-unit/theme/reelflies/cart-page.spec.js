// The cart page (cart-page.js): sizes in hook order within each pattern, and − / + taps that add
// up before stock's own update sends the total once.
import $ from 'jquery';
import { PAUSE_MS, sortRows, start } from '../../../theme/reelflies/cart-page';

jest.mock('../../../theme/reelflies/box', () => ({ subscribe: jest.fn(), totals: jest.fn(() => ({ units: 0, flyAmount: 0 })) }));

const row = (size, qty = 3) => `<li class="rf-cart-row" data-item-row data-rf-size="${size}">
    <button type="button" data-rf-cart-step="-1" data-cart-itemid="l${size}" data-action="dec">−</button>
    <input class="cart-item-qty-input" id="qty-l${size}" value="${qty}" data-quantity-max="0" data-cart-itemid="l${size}">
    <button type="button" data-rf-cart-step="1" data-cart-itemid="l${size}" data-action="inc">+</button></li>`;

function page(sizes) {
    document.body.innerHTML = `<div data-cart-content><ul data-rf-cart-rows data-rf-cart-multi>${sizes.map(size => row(size)).join('')}</ul></div>`;
}

describe('the box\'s rows', () => {
    it('puts a pattern\'s sizes in hook order, a row with no size after them, and marks the group sorted', () => {
        page(['14', '', '2-0', '8']);
        sortRows(document);
        const list = document.querySelector('[data-rf-cart-rows]');
        expect(Array.from(list.children).map(li => li.dataset.rfSize)).toEqual(['2-0', '8', '14', '']);
        expect(list.hasAttribute('data-rf-cart-sorted')).toBe(true);
    });

    it('keeps focus on the control it moved', () => {
        page(['14', '8']);
        const plus = document.querySelector('[data-cart-itemid="l14"][data-action="inc"]');
        plus.focus();
        sortRows(document);
        expect(document.activeElement).toBe(plus);
    });
});

describe('− and +', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('steps the number on every tap and sends the total once the taps stop', () => {
        page(['12']);
        start({}, document);
        const field = document.querySelector('.cart-item-qty-input');
        const changed = jest.fn();
        const focused = jest.fn();
        $(field).on('change', changed).on('focus', focused);
        const plus = document.querySelector('[data-rf-cart-step="1"]');
        plus.click();
        plus.click();
        plus.click();
        expect(field.value).toBe('6');
        expect(changed).not.toHaveBeenCalled();
        expect(focused).toHaveBeenCalledTimes(1); // stock remembers where the taps began
        jest.advanceTimersByTime(PAUSE_MS);
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('never goes below 0', () => {
        page(['12']);
        start({}, document);
        const field = document.querySelector('.cart-item-qty-input');
        field.value = '1';
        const minus = document.querySelector('[data-rf-cart-step="-1"]');
        minus.click();
        minus.click();
        expect(field.value).toBe('0');
    });
});
