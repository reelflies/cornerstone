import cartPage, { controlSelector, restoreFocus } from '../../../theme/reelflies/cart-page';
import { FAILED_EVENT, RENDERED_EVENT } from '../../../theme/reelflies/cart-events';

// One group as cart-lines.html renders it: its rows in the order added, 14 before 12.
const LINES = `<div data-cart-page-title><h1>Your cart</h1></div>
<ul data-rf-cart-lines>
    <li data-rf-cart-group data-rf-cart-multi>
        <h2>Parachute Adams</h2>
        <ul class="rf-cart-rows">
            <li data-item-row data-rf-cart-row data-rf-size="14" data-id="a1">
                <p class="rf-cart-size">Size 14</p>
                <button data-cart-update data-cart-itemid="a1" data-action="inc">+</button>
                <input id="qty-a1" data-cart-itemid="a1" data-action="manualQtyChange">
                <button class="cart-remove" data-cart-itemid="a1">x</button>
            </li>
            <li data-item-row data-rf-cart-row data-rf-size="12" data-id="a2">
                <button data-cart-update data-cart-itemid="a2" data-action="inc">+</button>
            </li>
        </ul>
    </li>
</ul>
<form class="coupon-form"><input id="couponcode"><button type="submit">Apply</button></form>`;

const swapContent = () => {
    // cart.js replaces the lines and the summary with what the server renders.
    document.querySelector('[data-rf-cart-lines]').outerHTML = LINES.split('\n').slice(1, -1).join('\n');
    document.querySelector('.coupon-form').outerHTML = LINES.split('\n').slice(-1)[0];
};
const click = element => element.dispatchEvent(new MouseEvent('click', { bubbles: true }));

describe('controlSelector', () => {
    beforeEach(() => { document.body.innerHTML = LINES; });

    it('finds the same line\'s same control again: a stepper, the quantity field or Remove', () => {
        expect(controlSelector(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'))).toBe('[data-cart-itemid="a1"][data-action="inc"]');
        expect(controlSelector(document.getElementById('qty-a1'))).toBe('[data-cart-itemid="a1"][data-action="manualQtyChange"]');
        expect(controlSelector(document.querySelector('.cart-remove'))).toBe('[data-cart-itemid="a1"].cart-remove');
    });

    it('ignores anything that isn\'t a line\'s control: the heading, a row\'s text, the coupon form', () => {
        expect(controlSelector(document.querySelector('h1'))).toBeNull();
        expect(controlSelector(document.querySelector('.rf-cart-size'))).toBeNull();
        expect(controlSelector(document.getElementById('couponcode'))).toBeNull();
    });
});

describe('the cart page module', () => {
    // load() listens on the document for good, so it loads once, on the first test's page; each
    // test then sets up its own page and its own last-used control.
    beforeAll(() => {
        document.body.innerHTML = LINES;
        cartPage.load({}, document);
    });

    const rows = () => [...document.querySelectorAll('[data-rf-cart-row]')].map(row => row.dataset.id);

    it('sorts the rows on load: size 12 before size 14', () => {
        expect(rows()).toEqual(['a2', 'a1']);
        expect(document.querySelector('[data-rf-cart-group]').hasAttribute('data-rf-cart-sorted')).toBe(true);
    });

    it('after cart.js re-renders the lines, sorts them again and puts focus back on the control used (story 67)', () => {
        document.body.innerHTML = LINES;
        click(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'));
        swapContent();
        document.dispatchEvent(new CustomEvent(RENDERED_EVENT));
        expect(document.activeElement).toBe(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'));
        expect(rows()).toEqual(['a2', 'a1']);
    });

    it('puts focus on the heading when a coupon change re-renders the cart, even after a failed stepper change', () => {
        document.body.innerHTML = LINES;
        click(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'));
        document.dispatchEvent(new CustomEvent(FAILED_EVENT)); // the change failed: nothing re-rendered
        swapContent();
        document.dispatchEvent(new CustomEvent(RENDERED_EVENT));
        expect(document.activeElement).toBe(document.querySelector('h1'));
    });

    it('forgets a stepper once anything else is used, such as the coupon form', () => {
        document.body.innerHTML = LINES;
        click(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'));
        click(document.querySelector('.coupon-form button'));
        swapContent();
        document.dispatchEvent(new CustomEvent(RENDERED_EVENT));
        expect(document.activeElement).toBe(document.querySelector('h1'));
    });

    it('puts focus on the heading when the line that was used is gone', () => {
        document.body.innerHTML = LINES;
        document.querySelector('[data-id="a1"]').remove();
        restoreFocus('[data-cart-itemid="a1"].cart-remove', document);
        expect(document.activeElement).toBe(document.querySelector('h1'));
        expect(document.querySelector('h1').getAttribute('tabindex')).toBe('-1');
    });
});
