// add-bridge.js with no add flow loaded (ticket 38): Quick view on a listing, where stock's add and
// option-change callbacks call the bridge first. A failure is still taken, so stock never reads the
// answer's missing data and the button never stays frozen; a good answer goes on to stock.
import { addFinished, holdAddButton, optionChangeFailed } from '../../../theme/reelflies/add-bridge';
import { showAlertModal } from '../../../theme/global/modal';

jest.mock('../../../theme/global/modal', () => ({ showAlertModal: jest.fn() }));

const FORM = `<form><div data-rf-add data-rf-error="That didn't go in your cart. Try again.">
    <input id="form-action-addToCart" type="submit" value="Adding to cart…" disabled>
</div></form>`;

describe('with no add flow loaded', () => {
    beforeEach(() => {
        document.body.innerHTML = FORM;
        showAlertModal.mockClear();
    });
    const form = () => document.querySelector('form');
    const button = () => document.getElementById('form-action-addToCart');

    it('takes a failed add: the button usable again with its label, the overlay gone, and stock\'s alert in the flow\'s words', () => {
        const overlay = { hide: jest.fn() };
        expect(addFinished(new Error('offline'), undefined, { label: 'Add to Cart', overlay, form: form() })).toBe(true);
        expect(button().disabled).toBe(false);
        expect(button().value).toBe('Add to Cart');
        expect(overlay.hide).toHaveBeenCalled();
        expect(showAlertModal).toHaveBeenCalledWith('That didn\'t go in your cart. Try again.');
        expect(addFinished(null, '<html>Server error</html>', { form: form() })).toBe(true);
    });

    it('leaves a good answer, and the store\'s own error answer, to stock', () => {
        expect(addFinished(null, { data: { cart_item: { id: 'a' } } }, { form: form() })).toBe(false);
        expect(addFinished(null, { data: { error: 'Out of stock' } }, { form: form() })).toBe(false);
        expect(showAlertModal).not.toHaveBeenCalled();
    });

    it('stops stock before it reads a failed option change\'s answer, and leaves a good one to stock', () => {
        expect(optionChangeFailed(new Error('offline'), undefined)).toBe(true);
        expect(optionChangeFailed(null, { data: { purchasable: true } })).toBe(false);
    });

    it('sets the product page\'s "Choose a size" to stock\'s "Add to Cart" once a choice is answered, but not a pre-order label', () => {
        document.body.innerHTML = `<form><div data-rf-add data-rf-stock-label="Add to Cart">
            <input id="form-action-addToCart" type="submit" value="Choose a size">
        </div></form>`;
        expect(optionChangeFailed(null, { data: { purchasable: true } }, form())).toBe(false);
        expect(button().value).toBe('Add to Cart');
        form().querySelector('[data-rf-add]').setAttribute('data-rf-pre-order', '');
        button().value = 'Pre-Order Now';
        optionChangeFailed(null, { data: { purchasable: true } }, form());
        expect(button().value).toBe('Pre-Order Now');
    });

    it('holds no button: stock disables it as before', () => {
        expect(holdAddButton(button(), true)).toBe(false);
    });
});
