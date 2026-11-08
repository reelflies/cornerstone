// The product page's strip (product-strip.js, strip-html.js): the server's cells read, put in hook
// order, kept in step with the box, and the reserved line's words.
import * as box from '../../../theme/reelflies/box';
import {
    inBoxWords, orderCells, readProduct, sync,
} from '../../../theme/reelflies/product-strip';
import { cellInner, footWords, stepFor } from '../../../theme/reelflies/strip-html';
import { setWords } from '../../../theme/reelflies/words';

jest.mock('../../../theme/reelflies/box', () => ({ lines: jest.fn(() => []), change: jest.fn(), subscribe: jest.fn() }));

const cell = (label, variant, stock = 1) => `<li class="rf-sz" data-rf-cell data-rf-label="${label}" data-rf-variant="${variant}" data-rf-stock="${stock}"><button class="rf-sz__btn" type="button" data-rf-size="${label}" data-rf-variant="${variant}"><span class="rf-sz__step"></span><span>${label}</span></button></li>`;

function strip(cells) {
    document.body.innerHTML = `<div data-rf-strip data-rf-mode="strip" data-rf-product="4877" data-rf-name="Adams" data-rf-url="/adams/" data-rf-price="0.95" data-rf-brand="ReelFlies">
        <ol data-rf-cells>${cells.join('')}</ol><span data-rf-strip-foot></span><p data-rf-strip-inbox></p></div>`;
    return document.querySelector('[data-rf-strip]');
}

beforeAll(() => setWords({
    translations: {
        'reelflies.js.size_label': 'Add one, size {size}',
        'reelflies.js.size_label_in': 'Add one, size {size}, {n} in your box',
        'reelflies.js.size_sold': 'Size {size}, sold out',
        'reelflies.js.minus_label': 'Remove one, size {size}',
        'reelflies.js.choice_label': 'Add one: {choice}',
        'reelflies.js.minus': '−1',
        'reelflies.js.in_box_full': 'In your box: {list}',
        'reelflies.js.in_box_n': 'In your box: {n}',
        'reelflies.js.largest_first': 'Largest hook first.',
        'reelflies.js.sold_one': 'Size {size} is sold out.',
        'reelflies.js.sold_many': 'Sizes {sizes} are sold out.',
        'reelflies.js.sold_all': 'Every size is sold out.',
        'reelflies.js.choices_sold': 'Sold out: {choices}.',
    },
}));

beforeEach(() => box.lines.mockReturnValue([]));

describe('stepFor', () => {
    it('steps the bar down from the largest hook, and draws none for a choice that isn\'t a size', () => {
        expect(stepFor('6/0')).toBe(1);
        expect(stepFor('2-0')).toBeGreaterThan(stepFor('2'));
        expect(stepFor('8')).toBeGreaterThan(stepFor('18'));
        expect(stepFor('Olive')).toBe(0);
    });
});

describe('cellInner', () => {
    it('is a size\'s button, with its count and "−1" once it is in the box', () => {
        const el = document.createElement('li');
        el.innerHTML = cellInner({ label: '14', variantId: 7, inStock: true }, 2);
        expect(el.querySelector('[data-rf-size]').getAttribute('aria-label')).toBe('Add one, size 14, 2 in your box');
        expect(el.querySelector('.rf-sz__count').textContent).toBe('2');
        expect(el.querySelector('[data-rf-minus]').getAttribute('data-rf-variant')).toBe('7');
    });

    it('keeps the "−1" row\'s place, and can\'t be chosen sold out', () => {
        const el = document.createElement('li');
        el.innerHTML = cellInner({ label: '20', variantId: 9, inStock: false }, 0);
        expect(el.querySelector('button').disabled).toBe(true);
        expect(el.querySelector('.rf-sz__minus--none')).not.toBeNull();
        expect(el.querySelector('[data-rf-size]')).toBeNull();
    });

    it('words a choice that isn\'t a hook size as a choice, with no step bar', () => {
        const el = document.createElement('li');
        el.innerHTML = cellInner({ label: 'Olive', variantId: 3, inStock: true }, 0);
        expect(el.querySelector('[data-rf-size]').getAttribute('aria-label')).toBe('Add one: Olive');
        expect(el.querySelector('.rf-sz__step--none')).not.toBeNull();
    });
});

describe('footWords', () => {
    it('names the sold-out sizes, or says every size is', () => {
        const s = (label, inStock = true) => ({ label, inStock });
        expect(footWords([s('8'), s('20', false)])).toBe('Size 20 is sold out.');
        expect(footWords([s('8', false), s('20', false)])).toBe('Every size is sold out.');
        expect(footWords([s('8'), s('20')])).toBe('Largest hook first.');
        expect(footWords([s('Olive'), s('Tan', false)])).toBe('Sold out: Tan.');
    });
});

describe('the strip', () => {
    it('reads the server\'s cells and puts sizes the catalogue listed out of order into hook order', () => {
        const root = strip([cell('14', 3), cell('8', 1), cell('2-0', 5), cell('20', 9, 0)]);
        const product = orderCells(root, readProduct(root));
        expect(product.sizes.map(size => size.label)).toEqual(['2-0', '8', '14', '20']);
        expect(Array.from(root.querySelectorAll('[data-rf-cell]')).map(li => li.dataset.rfLabel)).toEqual(['2-0', '8', '14', '20']);
        expect(product.sizes[3].inStock).toBe(false);
        expect(product).toMatchObject({
            id: '4877', name: 'Adams', price: 0.95, mode: 'strip',
        });
    });

    it('draws each cell\'s count from the box and says what of this product is in it, in hook order', () => {
        const root = strip([cell('12', 2), cell('14', 3)]);
        const product = readProduct(root);
        box.lines.mockReturnValue([
            { productId: '4877', variantId: 3, quantity: 1 },
            { productId: '4877', variantId: 2, quantity: 3 },
            { productId: '99', variantId: 2, quantity: 5 },
        ]);
        sync(root, product);
        expect(Array.from(root.querySelectorAll('.rf-sz__count')).map(b => b.textContent)).toEqual(['3', '1']);
        expect(root.querySelector('[data-rf-strip-inbox]').textContent).toBe('In your box: 3 × 12, 1 × 14');
    });

    it('keeps focus on the size in hand when its cell is redrawn', () => {
        const root = strip([cell('12', 2)]);
        const product = readProduct(root);
        root.querySelector('[data-rf-size]').focus();
        box.lines.mockReturnValue([{ productId: '4877', variantId: 2, quantity: 1 }]);
        sync(root, product);
        expect(document.activeElement.getAttribute('data-rf-variant')).toBe('2');
        expect(document.activeElement.hasAttribute('data-rf-size')).toBe(true);
    });

    it('says how many of a product with no options are in the box', () => {
        expect(inBoxWords({ one: { variantId: 4 }, sizes: [] }, new Map([[4, 2]]))).toBe('In your box: 2');
        expect(inBoxWords({ one: { variantId: 4 }, sizes: [] }, new Map())).toBe('');
    });
});
