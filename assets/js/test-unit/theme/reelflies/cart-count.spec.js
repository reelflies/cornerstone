import { countCart, flyBrandList } from '../../../theme/reelflies/cart-count';

// Lines as the Storefront Cart API gives them (lineItems.physicalItems), reduced to what the
// count reads.
const item = (productId, quantity, brand = 'ReelFlies') => ({ productId, quantity, brand });

describe('flyBrandList', () => {
    it('reads theme setting rf_fly_brands: comma-separated names, trimmed, empties dropped', () => {
        expect(flyBrandList(' ReelFlies, ,ReelFlies Signature ')).toEqual(['ReelFlies', 'ReelFlies Signature']);
        expect(flyBrandList('')).toEqual([]);
        expect(flyBrandList(undefined)).toEqual([]);
    });
});

describe('countCart (ticket 41\'s brand rule, Shaun on review-02)', () => {
    it('counts flies and patterns when every line is a fly brand (story 51)', () => {
        expect(countCart([item(1, 12), item(1, 6), item(2, 20)], ['ReelFlies'])).toEqual({ units: 38, products: 2, flies: true });
    });

    it('counts items and products when any line isn\'t a fly brand: a fly box, a hook pack', () => {
        expect(countCart([item(1, 12), item(3, 1, 'ReelFlies Gear')], ['ReelFlies'])).toEqual({ units: 13, products: 2, flies: false });
        expect(countCart([item(1, 12), item(4, 1, 'Mustad')], ['ReelFlies', 'ReelFlies Signature'])).toMatchObject({ flies: false });
    });

    it('counts items when a line has no brand, as on a storefront that sends none', () => {
        expect(countCart([item(1, 2, null), item(2, 1, '')], ['ReelFlies'])).toMatchObject({ flies: false, units: 3 });
    });

    it('counts each line with no product id, such as a gift certificate, as a product of its own', () => {
        expect(countCart([item(undefined, 1, null), item(undefined, 1, null), item(1, 2)], ['ReelFlies'])).toEqual({ units: 4, products: 3, flies: false });
    });

    it('counts items when the channel names no fly brands', () => {
        expect(countCart([item(1, 2)], [])).toMatchObject({ flies: false });
    });

    it('takes a second fly brand, as ticket 18\'s option B would add', () => {
        expect(countCart([item(1, 2), item(5, 3, 'ReelFlies Signature')], ['ReelFlies', 'ReelFlies Signature'])).toEqual({ units: 5, products: 2, flies: true });
    });

    it('counts an empty cart as no flies', () => {
        expect(countCart([], ['ReelFlies'])).toEqual({ units: 0, products: 0, flies: false });
    });
});
