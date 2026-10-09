import { buttonLabel, confirmation, stickyText } from '../../../theme/reelflies/add-words';

// The words as the template puts them on [data-rf-add] (lang/en.json's reelflies.add_flow).
const WORDS = {
    choose: 'Choose a size',
    add: 'Add # to cart',
    added: 'Added {qty} × {choice}.',
    cartFly: '# fly in your cart.',
    cartFlies: '# flies in your cart.',
    cartItem: '# item in your cart.',
    cartItems: '# items in your cart.',
    noSize: 'No size chosen',
    sizeAnd: 'Size {size}, {flies}',
    one: '# fly',
    many: '# flies',
    quantity: 'Quantity #',
};

describe('buttonLabel (stories 37 and 41)', () => {
    it('reads "Choose a size" until a size is chosen, then follows the stepper', () => {
        expect(buttonLabel({ needsSize: true, chosen: '', qty: 1 }, WORDS)).toBe('Choose a size');
        expect(buttonLabel({ needsSize: true, chosen: '14', qty: 3 }, WORDS)).toBe('Add 3 to cart');
    });

    it('starts at "Add 1 to cart" on a product with no size to choose', () => {
        expect(buttonLabel({ needsSize: false, chosen: '', qty: 1 }, WORDS)).toBe('Add 1 to cart');
    });
});

describe('stickyText (story 43)', () => {
    it('says the size and the flies, or that no size is chosen, or the quantity of a product with no sizes', () => {
        expect(stickyText({ needsSize: true, chosen: '14', qty: 3 }, WORDS)).toBe('Size 14, 3 flies');
        expect(stickyText({ needsSize: true, chosen: '14', qty: 1 }, WORDS)).toBe('Size 14, 1 fly');
        expect(stickyText({ needsSize: true, chosen: '', qty: 1 }, WORDS)).toBe('No size chosen');
        expect(stickyText({ needsSize: false, chosen: '', qty: 2 }, WORDS)).toBe('Quantity 2');
    });
});

describe('confirmation (story 42)', () => {
    it('names what was added and what the cart holds, in flies by the brand rule, else items', () => {
        expect(confirmation({ qty: 3, choice: 'size 14', count: { units: 15, flies: true } }, WORDS)).toBe('Added 3 × size 14. 15 flies in your cart.');
        expect(confirmation({ qty: 1, choice: 'size 14, Olive', count: { units: 1, flies: true } }, WORDS)).toBe('Added 1 × size 14, Olive. 1 fly in your cart.');
        expect(confirmation({ qty: 1, choice: 'Mustad R79 hooks', count: { units: 16, flies: false } }, WORDS)).toBe('Added 1 × Mustad R79 hooks. 16 items in your cart.');
    });

    it('says what was added alone when the cart couldn\'t be read', () => {
        expect(confirmation({ qty: 2, choice: 'size 12', count: null }, WORDS)).toBe('Added 2 × size 12.');
    });
});
