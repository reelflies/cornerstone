import cartPage, { RENDERED_EVENT, controlSelector, restoreFocus } from '../../../theme/reelflies/cart-page';

const LINES = `<div data-cart-page-title><h1>Your cart</h1></div>
<ul data-rf-cart-lines>
    <li data-rf-cart-line data-cart-itemid="a1" data-rf-product-id="1" data-rf-size="14" data-rf-unit-price="1.25">
        <button data-cart-update data-cart-itemid="a1" data-action="inc">+</button>
        <input id="qty-a1" data-cart-itemid="a1" data-action="manualQtyChange">
        <button class="cart-remove" data-cart-itemid="a1">x</button>
    </li>
    <li data-rf-cart-line data-cart-itemid="a2" data-rf-product-id="1" data-rf-size="12" data-rf-unit-price="1.25">
        <button data-cart-update data-cart-itemid="a2" data-action="inc">+</button>
    </li>
</ul>`;

describe('controlSelector', () => {
    beforeEach(() => { document.body.innerHTML = LINES; });

    it('finds the same line\'s same control again: a stepper, the quantity field or Remove', () => {
        expect(controlSelector(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'))).toBe('[data-cart-itemid="a1"][data-action="inc"]');
        expect(controlSelector(document.getElementById('qty-a1'))).toBe('[data-cart-itemid="a1"][data-action="manualQtyChange"]');
        expect(controlSelector(document.querySelector('.cart-remove'))).toBe('[data-cart-itemid="a1"].cart-remove');
        expect(controlSelector(document.querySelector('h1'))).toBeNull();
    });
});

describe('the cart page module', () => {
    beforeEach(() => { document.body.innerHTML = LINES; });

    it('groups the lines on load: size 12 before size 14', () => {
        cartPage.load({}, document);
        expect([...document.querySelectorAll('[data-rf-cart-line]')].map(line => line.dataset.cartItemid)).toEqual(['a2', 'a1']);
    });

    it('after cart.js re-renders the lines, groups them again and puts focus back on the control used (story 67)', () => {
        cartPage.load({}, document);
        document.querySelector('[data-cart-itemid="a1"][data-action="inc"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
        document.querySelector('[data-rf-cart-lines]').outerHTML = LINES.replace(/^[^\n]*\n/, ''); // cart.js swaps the content
        document.dispatchEvent(new CustomEvent(RENDERED_EVENT));
        expect(document.activeElement).toBe(document.querySelector('[data-cart-itemid="a1"][data-action="inc"]'));
        expect(document.querySelector('[data-rf-cart-lines]').hasAttribute('data-rf-grouped')).toBe(true);
    });

    it('puts focus on the heading when the line that was used is gone', () => {
        document.querySelector('[data-cart-itemid="a1"]').remove();
        restoreFocus('[data-cart-itemid="a1"].cart-remove', document);
        expect(document.activeElement).toBe(document.querySelector('h1'));
        expect(document.querySelector('h1').getAttribute('tabindex')).toBe('-1');
    });
});
