import {
    CART_URL, mapCart, readCart, sizeCounts,
} from '../../../theme/reelflies/cart-state';
import {
    ASSORTMENT, EMPTY, FAT_ALBERT, MIXED, TWO_SIZES,
} from './cart-fixtures';

// The cart reader (ticket 42; build pipeline 6.9; spec seam 4, "the cart-state mapping from Cart
// API line items to option values"; story 40). Ticket 44 builds against this interface:
//   readCart() -> { cartId, products: Map<productId, { total, lines: [{ lineItemId, variantId,
//   optionValueIds, quantity }] }> }

const answer = (body, { ok = true, status = 200 } = {}) => jest.fn(() => Promise.resolve({
    ok, status, json: () => Promise.resolve(body),
}));

describe('mapCart: Cart API line items to products and option value ids (story 40)', () => {
    it('maps two sizes of one pattern to one product, its total and a line per size with its option value id', () => {
        const { cartId, products } = mapCart(TWO_SIZES);
        expect(cartId).toBe('c0ffee00-0000-4000-8000-000000000042');
        expect(Array.from(products.keys())).toEqual([4877]);
        expect(products.get(4877)).toEqual({
            total: 6,
            lines: [
                {
                    lineItemId: 'line-14', variantId: 31002, optionValueIds: [302], quantity: 3,
                },
                {
                    lineItemId: 'line-16', variantId: 31003, optionValueIds: [303], quantity: 3,
                },
            ],
        });
    });

    it('maps product 5663, with a Colour and Fly Sizes, to every option value id of each line, and totals across colours', () => {
        const { products } = mapCart(FAT_ALBERT);
        const fatAlbert = products.get(5663);
        expect(fatAlbert.total).toBe(7);
        expect(fatAlbert.lines.map(line => [line.lineItemId, line.optionValueIds, line.quantity])).toEqual([
            ['line-olive-8', [501, 601], 2],
            ['line-tan-8', [502, 601], 1],
            ['line-olive-10', [501, 602], 4],
        ]);
        expect(sizeCounts(fatAlbert)).toEqual(new Map([[501, 6], [601, 3], [502, 1], [602, 4]]));
    });

    it('maps an Assortment with no options to its total, with no option value ids', () => {
        const { products } = mapCart(ASSORTMENT);
        expect(products.get(6001)).toEqual({
            total: 1,
            lines: [{
                lineItemId: 'line-box', variantId: 51001, optionValueIds: [], quantity: 1,
            }],
        });
        expect(sizeCounts(products.get(6001)).size).toBe(0);
    });

    it('maps an empty cart to no cart id and no products', () => {
        const state = mapCart(EMPTY);
        expect(state.cartId).toBeNull();
        expect(state.products).toBeInstanceOf(Map);
        expect(state.products.size).toBe(0);
    });

    it('counts digital lines, and leaves out gift certificates, custom items and an item another product\'s pick list added', () => {
        const { products } = mapCart(MIXED);
        expect(Array.from(products.keys())).toEqual([4877, 7101]);
        expect(products.get(4877).total).toBe(2);
        expect(products.get(7101).total).toBe(1);
    });

    it('keys products by number and keeps only numeric option value ids, whatever the answer holds', () => {
        const { products } = mapCart([{
            id: 'x',
            lineItems: {
                physicalItems: [{
                    id: 'l', productId: '4877', variantId: '31002', quantity: '2', options: [{ nameId: 1, valueId: '302' }, { nameId: 2, value: 'Tie it tight', valueId: null }],
                }],
            },
        }]);
        expect(products.get(4877)).toEqual({
            total: 2,
            lines: [{
                lineItemId: 'l', variantId: 31002, optionValueIds: [302], quantity: 2,
            }],
        });
    });

    it('treats anything but a list of carts as an empty cart', () => {
        [null, undefined, {}, 'nope', [null], [{}]].forEach(body => {
            const state = mapCart(body);
            expect(state.products.size).toBe(0);
        });
    });
});

describe('readCart: one GET of the Storefront Cart API, never a write', () => {
    it('reads /api/storefront/carts with the line items\' options, as the session\'s own (same-origin) request', async () => {
        const doFetch = answer(TWO_SIZES);
        const state = await readCart(doFetch);
        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(doFetch.mock.calls[0][0]).toBe('/api/storefront/carts?include=lineItems.physicalItems.options');
        expect(CART_URL).toBe(doFetch.mock.calls[0][0]);
        expect(doFetch.mock.calls[0][1]).toEqual(expect.objectContaining({ credentials: 'same-origin' }));
        expect(doFetch.mock.calls[0][1].method || 'GET').toBe('GET');
        expect(state.products.get(4877).total).toBe(6);
    });

    it('reads an empty cart as no products', async () => {
        const state = await readCart(answer(EMPTY));
        expect(state).toEqual({ cartId: null, products: new Map() });
    });

    it('resolves null, and never rejects, when the read fails: an error answer, a network failure, an unreadable body', async () => {
        await expect(readCart(answer({ title: 'Not found' }, { ok: false, status: 404 }))).resolves.toBeNull();
        await expect(readCart(jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))))).resolves.toBeNull();
        await expect(readCart(jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token <')) })))).resolves.toBeNull();
        await expect(readCart(jest.fn(() => { throw new Error('no fetch'); }))).resolves.toBeNull();
    });

    it('reads again on every call, so a read after a change is never an answer from before it', async () => {
        const doFetch = answer(TWO_SIZES);
        await Promise.all([readCart(doFetch), readCart(doFetch)]);
        expect(doFetch).toHaveBeenCalledTimes(2);
    });
});
