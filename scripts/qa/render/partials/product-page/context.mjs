// The product page's fixture context (redesign step 3; tickets 37-40), for the render tests
// (product-page, product-picker, product-reviews) and the raw-HTML assertions' tests
// (raw-html/assertions/product-page, product-picker, product-reviews): the fixture page's product,
// the reference's Adams Parachute with its seven sizes, three sample reviews and four related
// patterns (render/pages/product-page/fixtures/adams.json), with the store's currency token, and
// the GraphQL front matter pages/product.html asks for, built from the product's options the way
// the Storefront API answers it: each choice's variant and stock.

import path from 'path';
import { THEME_DIR, readFixture, renderPartial } from '../../render.mjs';

const FIXTURE = readFixture(path.join(THEME_DIR, 'scripts/qa/render/pages/product-page/fixtures/adams.json'));
export const CONTEXT = {
    ...FIXTURE.page_context,
    settings: { ...FIXTURE.page_context.settings, money: { currency_token: '$' } },
};

// A variant's id from its choice's position: the fixture's value ids are 30000 and up.
export const variantId = index => 50000 + index;

// pages/product.html's RfProductSizes answer for `product`: its options as productOptions and one
// variant per choice of the first option (a product with no options has the one base variant).
// `soldOut` names the choices whose variant is out of stock, `unpurchasable` those whose variant
// can't be bought, and `missing` those with no variant at all.
export function gqlFor(product, { soldOut = [], unpurchasable = [], missing = [] } = {}) {
    const options = product.options || [];
    const value = ({ id, label }) => ({ node: { entityId: id, label } });
    const productOptions = options.map(option => ({
        node: { entityId: option.id, displayName: option.display_name, values: { edges: option.values.map(value) } },
    }));
    const [first] = options;
    const variants = first
        ? first.values.filter(choice => !missing.includes(choice.label)).map((choice, index) => ({
            node: {
                entityId: variantId(index),
                isPurchasable: !unpurchasable.includes(choice.label),
                inventory: { isInStock: !soldOut.includes(choice.label) },
                options: { edges: [{ node: { entityId: first.id, values: { edges: [value(choice)] } } }] },
            },
        }))
        : [{
            node: {
                entityId: variantId(0), isPurchasable: !unpurchasable.length, inventory: { isInStock: !soldOut.length }, options: { edges: [] },
            },
        }];
    return { data: { site: { product: { entityId: product.id, productOptions: { edges: productOptions }, variants: { edges: variants } } } } };
}

// The product page, with `product` laid over the fixture's product, `theme`, `settings` and
// `context` over the rest, and the GraphQL answer for the product as laid (`gql` replaces it;
// `stock` shapes it).
export const productPage = ({
    product = {}, theme = {}, settings = {}, context = {}, gql, stock = {},
} = {}) => {
    const laid = { ...CONTEXT.product, ...product };
    return renderPartial('pages/product', {
        ...CONTEXT,
        ...context,
        product: laid,
        settings: { ...CONTEXT.settings, ...settings },
        theme_settings: { ...CONTEXT.theme_settings, ...theme },
        gql: gql === undefined ? gqlFor(laid, stock) : gql,
    });
};

// Quick view renders stock's product view, without the page's front matter.
export const quickView = ({ product = {} } = {}) => renderPartial('components/products/quick-view', {
    ...CONTEXT,
    product: { ...CONTEXT.product, ...product },
});

// A product with two options (Fat Albert's Colour and Fly Sizes), which buys through stock's form.
export const TWO_OPTIONS = [
    {
        id: 29101,
        display_name: 'Colour',
        type: 'Configurable_PickList_Set',
        partial: 'set-rectangle',
        required: true,
        values: [{
            id: 30101, label: 'Olive', selected: false, data: 'Olive',
        }, {
            id: 30102, label: 'Black', selected: false, data: 'Black',
        }],
    },
    {
        id: 29102,
        display_name: 'Fly Sizes',
        type: 'Configurable_PickList_Set',
        partial: 'set-rectangle',
        required: true,
        values: [{
            id: 30103, label: '8', selected: false, data: '8',
        }, {
            id: 30104, label: '10', selected: false, data: '10',
        }],
    },
];

// A product whose one option isn't a hook size (a leader's weight).
export const WEIGHTS = [{
    id: 29201,
    display_name: 'Weight',
    type: 'Configurable_PickList_Set',
    partial: 'set-rectangle',
    required: true,
    values: [{
        id: 30201, label: '4X', selected: false, data: '4X',
    }, {
        id: 30202, label: '5X', selected: false, data: '5X',
    }],
}];
