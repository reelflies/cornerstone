// Tests scripts/widgets/typed-values.mjs (ticket 48; HOME-4): the lint that finds a price, a
// count or a product name typed into a widget's settings, where the storefront query should give
// it. Each rule is broken once on a small widget of its own, and the real product bands pass.
//
//   node --test scripts/widgets/typed-values.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PRODUCT_BANDS, productNames, typedValues, typedValuesIn,
} from './typed-values.mjs';

const schema = [{
    type: 'hidden',
    settings: [{ type: 'graphQl', id: 'graphQueries', typeMeta: { mappings: { pick1: { reads: 'pick1', type: 'Int!' } } } }],
}, {
    type: 'tab',
    label: 'Content',
    sections: [{
        label: 'Band',
        settings: [
            {
                type: 'input', label: 'Heading', id: 'heading', default: 'Best sellers',
            },
            {
                type: 'input', label: 'Button', id: 'button_label', default: 'Shop signature flies',
            },
            {
                type: 'productId', label: 'Product 1', id: 'pick1', default: '',
            },
        ],
    }],
}];
const NAMES = ['Adams Parachute Dry Fly', 'Reel Egg Nuke'];
const check = configuration => typedValues({
    schema, configuration, names: NAMES, where: 'channels/1895766.json',
});

test('a band whose words are copy and whose products are ids passes', () => {
    assert.deepEqual(check({ heading: 'Best sellers', button_label: 'Shop signature flies', pick1: '4877' }), []);
    assert.deepEqual(check({ heading: 'Best sellers', button_label: 'Shop signature flies', pick1: 4877 }), [], 'an id may be a number');
});

test('a typed price fails, with or without its currency', () => {
    assert.deepEqual(check({ heading: 'Best sellers from $0.95', button_label: 'Shop', pick1: '4877' }), [
        'channels/1895766.json: heading "Best sellers from $0.95" holds a price: prices come from the storefront query (HOME-4)',
    ]);
    assert.match(check({ heading: 'Flies at 1.95 each', button_label: 'Shop', pick1: '4877' })[0], /heading .* holds a price/);
});

test('a number in any setting but a product id fails as a typed count (HOME-4: "Shop signature flies", never "Shop 355")', () => {
    assert.deepEqual(check({ heading: 'Best sellers', button_label: 'Shop 355 signature patterns', pick1: '4877' }), [
        'channels/1895766.json: button_label "Shop 355 signature patterns" holds a number: counts come from the storefront query, and a label carries none (HOME-4)',
    ]);
});

test('a product\'s name typed into a setting fails, whatever its case', () => {
    assert.deepEqual(check({ heading: 'Try the reel egg nuke', button_label: 'Shop', pick1: '4877' }), [
        'channels/1895766.json: heading "Try the reel egg nuke" holds the product name "Reel Egg Nuke": names come from the storefront query (HOME-4)',
    ]);
});

test('a product setting holds an id, never a name', () => {
    assert.deepEqual(check({ heading: 'Best sellers', button_label: 'Shop', pick1: 'Adams Parachute Dry Fly' }), [
        'channels/1895766.json: pick1 "Adams Parachute Dry Fly" isn\'t a product id: a product setting holds the id alone, and the query reads its name and price',
    ]);
});

test('the product names are every product in the widgets\' query fixtures, longest first', () => {
    const names = productNames();
    for (const name of ['Adams Parachute Dry Fly', 'Reel Egg Nuke', 'ReelFlies - Psycho Caddis']) assert.ok(names.includes(name), name);
    assert.deepEqual(names, [...names].sort((a, b) => b.length - a.length || a.localeCompare(b)));
    assert.equal(new Set(names).size, names.length);
});

test('the product bands carry no typed price, count or product name: their channel files, schema defaults and fixtures', () => {
    assert.deepEqual(PRODUCT_BANDS, ['best-sellers', 'signature-band']);
    for (const widget of PRODUCT_BANDS) assert.deepEqual(typedValuesIn(widget), [], widget);
});
