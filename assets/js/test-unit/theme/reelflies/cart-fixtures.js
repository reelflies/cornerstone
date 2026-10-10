// Storefront Cart API answers (GET /api/storefront/carts?include=lineItems.physicalItems.options),
// shaped as BigCommerce sends them, for the cart-state specs (ticket 42; build pipeline 6.9). Each
// physical line carries its options as { name, nameId, value, valueId }. The ids are made up, but
// shaped as the store's: product 5663 is Fat Albert, with a Colour and Fly Sizes.

const physical = ({
    id, productId, variantId, quantity, options = [], brand = 'ReelFlies', parentId = null,
}) => ({
    id,
    parentId,
    variantId,
    productId,
    sku: `RF-${productId}-${variantId}`,
    name: `Product ${productId}`,
    url: `https://reelflies.ca/product-${productId}/`,
    quantity,
    brand,
    isTaxable: true,
    imageUrl: `https://cdn11.bigcommerce.com/s-fixture/products/${productId}/images/1/a.jpg`,
    discounts: [],
    discountAmount: 0,
    couponAmount: 0,
    listPrice: 0.85,
    salePrice: 0.85,
    extendedListPrice: 0.85 * quantity,
    extendedSalePrice: 0.85 * quantity,
    isShippingRequired: true,
    isMutable: true,
    options,
});

const size = (valueId, value, nameId = 117) => ({
    name: 'Fly Sizes', nameId, value, valueId,
});
const colour = (valueId, value) => ({
    name: 'Colour', nameId: 118, value, valueId,
});

export const cart = (lineItems, id = 'c0ffee00-0000-4000-8000-000000000042') => [{
    id,
    customerId: 0,
    email: '',
    currency: {
        name: 'Canadian Dollars', code: 'CAD', symbol: '$', decimalPlaces: 2,
    },
    isTaxIncluded: false,
    baseAmount: 10,
    discountAmount: 0,
    cartAmount: 10,
    coupons: [],
    discounts: [],
    lineItems: {
        physicalItems: [], digitalItems: [], giftCertificates: [], customItems: [], ...lineItems,
    },
    createdTime: '2026-10-09T20:00:00+00:00',
    updatedTime: '2026-10-09T20:05:00+00:00',
    locale: 'en',
}];

// Two sizes of one pattern: 3 × size 14 and 3 × size 16 of the Adams Parachute (4877).
export const TWO_SIZES = cart({
    physicalItems: [
        physical({
            id: 'line-14', productId: 4877, variantId: 31002, quantity: 3, options: [size(302, '14')],
        }),
        physical({
            id: 'line-16', productId: 4877, variantId: 31003, quantity: 3, options: [size(303, '16')],
        }),
    ],
});

// Fat Albert (5663) with a Colour and Fly Sizes: size 8 in two colours, and size 10 in one.
export const FAT_ALBERT = cart({
    physicalItems: [
        physical({
            id: 'line-olive-8', productId: 5663, variantId: 41001, quantity: 2, options: [colour(501, 'Olive'), size(601, '8', 119)],
        }),
        physical({
            id: 'line-tan-8', productId: 5663, variantId: 41002, quantity: 1, options: [colour(502, 'Tan'), size(601, '8', 119)],
        }),
        physical({
            id: 'line-olive-10', productId: 5663, variantId: 41003, quantity: 4, options: [colour(501, 'Olive'), size(602, '10', 119)],
        }),
    ],
});

// An Assortment, sold whole: a line with no options.
export const ASSORTMENT = cart({
    physicalItems: [
        physical({
            id: 'line-box', productId: 6001, variantId: 51001, quantity: 1, brand: 'ReelFlies',
        }),
    ],
});

// No cart yet: the Cart API answers an empty list.
export const EMPTY = [];

// Everything else a cart can hold beside its flies: a digital line, a gift certificate, a custom
// item, and an item another product's pick list added (its parentId is that product's line).
export const MIXED = cart({
    physicalItems: [
        physical({
            id: 'line-14', productId: 4877, variantId: 31002, quantity: 2, options: [size(302, '14')],
        }),
        physical({
            id: 'line-hooks', productId: 7001, variantId: 61001, quantity: 1, parentId: 'line-14',
        }),
    ],
    digitalItems: [{
        id: 'line-guide', parentId: null, variantId: 71001, productId: 7101, quantity: 1, options: [],
    }],
    giftCertificates: [{
        id: 'gift-1', name: 'Gift certificate', amount: 25, isTaxable: false, sender: {}, recipient: {}, message: '', theme: 'General',
    }],
    customItems: [{
        id: 'custom-1', sku: 'CUSTOM', name: 'Tying service', quantity: 1, listPrice: 5,
    }],
});
