// The size picker and its quantity fields (size-picker.js, quantity.js, product-buy.js,
// order-list.js): rows in hook order with steppers that show, and set, what the box holds.
import * as box from '../../../theme/reelflies/box';
import { inBoxWords, readProduct } from '../../../theme/reelflies/product-buy';
import { rowHtml as sheetRowHtml } from '../../../theme/reelflies/order-list';
import { bindQuantities, setQuantity, syncQuantities } from '../../../theme/reelflies/quantity';
import {
    footWords, rowsHtml, stepFor,
} from '../../../theme/reelflies/size-picker';
import { setWords } from '../../../theme/reelflies/words';

jest.mock('../../../theme/reelflies/box', () => ({
    lines: jest.fn(() => []),
    quantityOf: jest.fn(() => 0),
    setQuantity: jest.fn(() => Promise.resolve()),
    subscribe: jest.fn(),
}));
jest.mock('../../../theme/reelflies/flight', () => ({ bump: jest.fn(), fly: jest.fn() }));

beforeAll(() => setWords({
    translations: {
        'reelflies.js.size_n': 'size {size}',
        'reelflies.js.qty_minus': 'One fewer, {what}',
        'reelflies.js.qty_plus': 'One more, {what}',
        'reelflies.js.qty_label': 'How many, {what}',
        'reelflies.js.qty_label_one': 'How many',
        'reelflies.js.qty_label_of': 'How many of {what}, {name}',
        'reelflies.js.quantity': 'How many',
        'reelflies.js.sold_out_row': 'Sold out',
        'reelflies.js.sold_short': 'Sold out',
        'reelflies.js.in_box_full': 'In your box: {list}',
        'reelflies.js.in_box_n': 'In your box: {n}',
        'reelflies.js.largest_first': 'Largest hook first.',
        'reelflies.js.sold_one': 'Size {size} is sold out.',
        'reelflies.js.sold_all': 'Every size is sold out.',
        'reelflies.js.choices_sold': 'Sold out: {choices}.',
        'reelflies.js.choose_on_page_short': 'Choose on its page',
    },
}));

beforeEach(() => {
    box.lines.mockReturnValue([]);
    box.quantityOf.mockReturnValue(0);
    box.setQuantity.mockClear();
});

const size = (label, variantId, inStock = true) => ({ label, variantId, inStock });
const product = over => ({
    id: '4877', name: 'Adams', url: '/adams/', price: 0.95, brand: 'ReelFlies', img: { small: 's.jpg', card: 'c.jpg' }, sizes: [], single: null, complex: false, ...over,
});

describe('the picker\'s rows', () => {
    it('runs biggest hook first, each size with its stepper, and a sold-out size with none', () => {
        const ul = document.createElement('ul');
        ul.innerHTML = rowsHtml(product({ sizes: [size('14', 3), size('2-0', 5), size('8', 1), size('20', 9, false)] }));
        const rows = Array.from(ul.children);
        expect(rows.map(row => row.dataset.rfLabel)).toEqual(['2-0', '8', '14', '20']);
        const field = rows[1].querySelector('[data-rf-qty]');
        expect(field.getAttribute('aria-label')).toBe('How many, size 8');
        expect(field.dataset).toMatchObject({ rfProduct: '4877', rfVariant: '1', rfLabel: '8' });
        expect(rows[3].querySelector('[data-rf-qty]')).toBeNull();
        expect(rows[3].textContent).toContain('Sold out');
    });

    it('steps the bar down from the largest hook, and draws none for a choice that isn\'t a size', () => {
        expect(stepFor('6/0')).toBe(1);
        expect(stepFor('2-0')).toBeGreaterThan(stepFor('8'));
        expect(stepFor('8')).toBeGreaterThan(stepFor('18'));
        expect(stepFor('Olive')).toBe(0);
    });

    it('gives a product with no options one row, "How many"', () => {
        const ul = document.createElement('ul');
        ul.innerHTML = rowsHtml({ id: '3969', one: { variantId: 44, inStock: true } });
        expect(ul.querySelectorAll('[data-rf-qty]')).toHaveLength(1);
        expect(ul.querySelector('[data-rf-qty]').getAttribute('aria-label')).toBe('How many');
    });

    it('names the sold-out sizes in its foot', () => {
        expect(footWords([size('8', 1), size('20', 2, false)])).toBe('Size 20 is sold out.');
        expect(footWords([size('8', 1, false)])).toBe('Every size is sold out.');
        expect(footWords([size('Olive', 1), size('Tan', 2, false)])).toBe('Sold out: Tan.');
    });
});

describe('the quantity fields', () => {
    function picker() {
        document.body.innerHTML = `<div data-rf-meta data-rf-name="Adams" data-rf-url="/adams/" data-rf-price="0.95" data-rf-brand="ReelFlies"><ul>${rowsHtml(product({ sizes: [size('12', 7)] }))}</ul></div>`;
        bindQuantities(document.body);
        return document.querySelector('[data-rf-qty]');
    }

    it('shows what the box holds of each size', () => {
        const field = picker();
        box.quantityOf.mockReturnValue(3);
        syncQuantities(document);
        expect(field.value).toBe('3');
        expect(field.closest('[data-rf-qty-group]').classList.contains('has-qty')).toBe(true);
        expect(document.querySelector('[data-rf-qty-step="-1"]').disabled).toBe(false);
    });

    it('sets the box to the quantity asked for, with the line\'s description', () => {
        const field = picker();
        setQuantity(field, '4');
        expect(box.setQuantity).toHaveBeenCalledWith({
            productId: '4877', variantId: 7, quantity: 4, meta: expect.objectContaining({ name: 'Adams', size: '12', price: 0.95 }),
        });
    });

    it('steps by one from what the box holds, and never below 0 or above 999', () => {
        const field = picker();
        box.quantityOf.mockReturnValue(2);
        document.querySelector('[data-rf-qty-step="1"]').click();
        expect(box.setQuantity).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: 3 }));
        setQuantity(field, '2500');
        expect(box.setQuantity).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: 999 }));
        setQuantity(field, '-4');
        expect(box.setQuantity).toHaveBeenLastCalledWith(expect.objectContaining({ quantity: 0 }));
    });

    it('asks nothing of the box when the quantity doesn\'t change', () => {
        const field = picker();
        box.quantityOf.mockReturnValue(5);
        setQuantity(field, '5');
        expect(box.setQuantity).not.toHaveBeenCalled();
    });
});

describe('the product page', () => {
    it('reads the server\'s rows and says what of the product is in the box, in its rows\' order', () => {
        document.body.innerHTML = `<div data-rf-pick-page data-rf-mode="sizes" data-rf-product="4877"><ul>
            <li data-rf-row data-rf-label="12" data-rf-variant="2" data-rf-stock="1"></li>
            <li data-rf-row data-rf-label="14" data-rf-variant="3" data-rf-stock="1"></li>
            <li data-rf-row data-rf-label="20" data-rf-variant="9" data-rf-stock="0"></li></ul></div>`;
        const read = readProduct(document.querySelector('[data-rf-pick-page]'));
        expect(read.sizes).toEqual([size('12', 2), size('14', 3), size('20', 9, false)]);
        const lines = [{ productId: '4877', variantId: 3, quantity: 1 }, { productId: '4877', variantId: 2, quantity: 3 }, { productId: '1', variantId: 2, quantity: 9 }];
        expect(inBoxWords(read, lines)).toBe('In your box: 3 × 12, 1 × 14');
        expect(inBoxWords({ id: '3969', one: { variantId: 4 }, sizes: [] }, [{ productId: '3969', variantId: 4, quantity: 2 }])).toBe('In your box: 2');
    });
});

describe('quick order', () => {
    function card() {
        const li = document.createElement('li');
        li.innerHTML = '<a class="rf-fly__photo"><img src="c.jpg"></a><h3 class="rf-fly__name"><a href="/adams/">Adams</a></h3><p class="rf-fly__price"><span class="rf-num">$0.95</span> <span class="rf-fly__unit">/ fly</span></p>';
        return li;
    }

    it('lays a pattern\'s sizes out as blank fields in hook order, a sold-out size as none', () => {
        const row = document.createElement('ul');
        row.innerHTML = sheetRowHtml(card(), product({ sizes: [size('14', 3), size('8', 1), size('20', 9, false)] }));
        const fields = Array.from(row.querySelectorAll('[data-rf-qty]'));
        expect(fields.map(field => field.dataset.rfLabel)).toEqual(['8', '14']);
        expect(fields[0].value).toBe('');
        expect(fields[0].hasAttribute('data-rf-blank')).toBe(true);
        expect(fields[0].getAttribute('aria-label')).toBe('How many of size 8, Adams');
        expect(row.querySelector('.is-sold').textContent).toContain('Sold out');
        expect(row.querySelector('.rf-olist__price').textContent).toBe('$0.95 / fly');
    });

    it('sends a product it can\'t offer to its own page', () => {
        const row = document.createElement('ul');
        row.innerHTML = sheetRowHtml(card(), product({ complex: true }));
        expect(row.querySelector('[data-rf-qty]')).toBeNull();
        expect(row.querySelector('.rf-olist__elsewhere a').getAttribute('href')).toBe('/adams/');
    });
});
