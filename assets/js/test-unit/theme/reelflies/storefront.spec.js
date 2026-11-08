import { normalise } from '../../../theme/reelflies/storefront';
import { sizeRange } from '../../../theme/reelflies/card-html';
import { setWords, word } from '../../../theme/reelflies/words';

const edges = nodes => ({ edges: nodes.map(node => ({ node })) });
const variant = (entityId, label, inStock = true) => ({
    entityId, isPurchasable: true, inventory: { isInStock: inStock }, options: label ? edges([{ values: edges([{ label }]) }]) : edges([]),
});
const product = ({ options = 1, variants }) => ({
    entityId: 4877,
    name: 'Adams Parachute Dry Fly',
    path: '/adams-parachute-dry-fly/',
    brand: { name: 'ReelFlies' },
    prices: { price: { value: 0.95 } },
    defaultImage: { small: 's', card: 'c', large: 'l' },
    productOptions: edges(Array.from({ length: options }, (_, i) => ({ entityId: i + 1 }))),
    variants: edges(variants),
});

beforeAll(() => setWords({
    translations: {
        'reelflies.js.sizes': 'Sizes {from}–{to}', 'reelflies.js.size': 'Size {size}', 'reelflies.js.choices': '{n} choices',
    },
}));

describe('normalise', () => {
    it('lists the sizes biggest hook first, with each one\'s variant and stock', () => {
        const fly = normalise(product({ variants: [variant(1, '10'), variant(2, '8'), variant(3, '20', false), variant(4, '2/0')] }));
        expect(fly.sizes.map(size => size.label)).toEqual(['2/0', '8', '10', '20']);
        expect(fly.sizes.find(size => size.label === '20').inStock).toBe(false);
        expect(fly).toMatchObject({
            id: '4877', price: 0.95, brand: 'ReelFlies', single: null, complex: false,
        });
    });

    it('adds a product with no options as its one variant', () => {
        const set = normalise(product({ options: 0, variants: [variant(9, '')] }));
        expect(set.sizes).toEqual([]);
        expect(set.single).toMatchObject({ variantId: 9 });
    });

    it('adds a fly with one size as that size, never another', () => {
        const fly = normalise(product({ variants: [variant(5, '14')] }));
        expect(fly.single).toMatchObject({ variantId: 5, label: '14' });
    });

    it('sends a product with two options to its own page', () => {
        expect(normalise(product({ options: 2, variants: [variant(1, '10')] })).complex).toBe(true);
    });
});

describe('sizeRange', () => {
    it('says the hook range, or one size', () => {
        expect(sizeRange({ sizes: [{ label: '8' }, { label: '20' }] })).toBe('Sizes 8–20');
        expect(sizeRange({ sizes: [{ label: '14' }] })).toBe('Size 14');
        expect(sizeRange({ sizes: [] })).toBe('');
    });

    it('never calls choices that aren\'t hook sizes a size range', () => {
        expect(sizeRange({ sizes: [{ label: 'Clear' }, { label: 'Olive' }] })).toBe('2 choices');
    });
});

describe('words', () => {
    it('reads langJson\'s translations by their last key, and fills in {names}', () => {
        expect(word('sizes', { from: 2, to: 8 })).toBe('Sizes 2–8');
        expect(word('nothing_here')).toBe('nothing_here');
    });
});
