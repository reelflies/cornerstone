// Tests scripts/catalogue/csv.mjs (ticket 18): BigCommerce's product export, read into the jobs' model.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { modelFromExport, parseCsv, parseOptions } from './csv.mjs';

const FIXTURE = fileURLToPath(new URL('./dry-run-fixtures/export.csv', import.meta.url));

test('parseCsv reads quoted fields with commas, doubled quotes, line breaks and a byte-order mark', () => {
    assert.deepEqual(parseCsv('﻿a,"b, c","say ""hi""","two\nlines"\r\n1,,3,4\n'), [
        ['a', 'b, c', 'say "hi"', 'two\nlines'],
        ['1', '', '3', '4'],
    ]);
    assert.deepEqual(parseCsv('x,y'), [['x', 'y']]);
    assert.throws(() => parseCsv('a,"open'), /unclosed quote/);
});

test('an Options cell holds one or more Type|Name|Value groups, swatch colours dropped from the label', () => {
    assert.deepEqual(parseOptions('Type=Rectangle|Name=Fly Sizes|Value=4'), [{ type: 'rectangles', name: 'Fly Sizes', label: '4' }]);
    assert.deepEqual(parseOptions('Type=Swatch|Name=Colour|Value=Tan[#DDD4BA;#846F36]Type=Rectangle|Name=Fly Sizes|Value=2-0'), [
        { type: 'swatch', name: 'Colour', label: 'Tan' },
        { type: 'rectangles', name: 'Fly Sizes', label: '2-0' },
    ]);
    assert.deepEqual(parseOptions('Type=Radio|Name=Fly Sizes|Value=2-0'), [{ type: 'radio_buttons', name: 'Fly Sizes', label: '2-0' }]);
    assert.deepEqual(parseOptions(''), []);
    assert.throws(() => parseOptions('Name=Fly Sizes'), /isn't an export option/);
});

test('the export becomes products with their options, values in variant order, and images', () => {
    const model = modelFromExport(fs.readFileSync(FIXTURE, 'utf8'), { file: 'export.csv' });
    assert.equal(model.source, 'csv');
    assert.equal(model.products.length, 9);
    const adams = model.products.find(product => product.id === 101);
    assert.deepEqual(adams, {
        id: 101,
        name: 'Adams Dry Fly',
        sku: 'RF-101',
        isVisible: true,
        channels: [1, 1855224],
        categories: [10, 20],
        brandId: 411,
        sortOrder: 0,
        options: [{
            id: null,
            displayName: 'Fly Sizes',
            type: 'rectangles',
            values: ['16', '12', '14', '10'].map((label, index) => ({
                id: null, label, sortOrder: index, isDefault: null,
            })),
        }],
        images: [
            {
                id: 1001, isThumbnail: true, description: '', sortOrder: 0, url: 'https://cdn.example/s-x/products/101/images/1001/adams-2__1.1.386.513.jpg?c=2', urlTiny: null,
            },
            {
                id: 1002, isThumbnail: false, description: 'Adams Dry Fly on white', sortOrder: 1, url: 'https://cdn.example/s-x/products/101/images/1002/adams__2.1.386.513.jpg?c=2', urlTiny: null,
            },
        ],
    });
    const muddler = model.products.find(product => product.id === 105);
    assert.deepEqual(muddler.categories, []);
    assert.deepEqual(muddler.options.map(option => [option.displayName, option.values.map(value => value.label)]), [['Color', ['Olive', 'Tan']], ['Size', ['6', '8']]]);
    const clouser = model.products.find(product => product.id === 102);
    assert.equal(clouser.brandId, 0);
    assert.equal(model.products.find(product => product.id === 107).images[0].description, 'Signature Streamer, "olive"');
});

test('an export without the columns the jobs read is refused, naming them', () => {
    assert.throws(() => modelFromExport('Item,ID,Name\nProduct,1,x\n'), /missing the columns .*Options/);
    assert.throws(() => modelFromExport(fs.readFileSync(FIXTURE, 'utf8').replace('Product,101', 'Widget,101')), /row 2: unknown Item "Widget"/);
    assert.throws(() => modelFromExport('Item,ID,Name,Type,SKU,Options,"Brand ID",Channels,Categories,"Is Visible","Sort Order","Internal Image URL (Export)","Image Description","Image is Thumbnail","Image Sort Order"\nVariant,1,,,,,,,,,,,,,\n'), /before any Product row/);
});
