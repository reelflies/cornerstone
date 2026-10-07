import quickAddRoute, { SIZE_OPTION_NAMES } from '../../../theme/reelflies/quick-add-route';

// The tap decision for "+ Add" (ticket 43). Options are in the shape of the
// product context's `product.options`, the keys the stock option partials read
// (`templates/components/products/options/set-rectangle.html`). Stock is the
// `data` of the stock option-change response (`product-details-base.js`).

const sizes = (optionId, labels, firstValueId) => ({
    id: optionId,
    display_name: 'Fly Sizes',
    required: true,
    partial: 'set-rectangle',
    values: labels.map((label, i) => ({ id: firstValueId + i, label, selected: false })),
});

// A multi-size dry fly, in catalogue order. Ticket 18's job puts the values in
// hook order; until it is applied the panel keeps whatever order the catalogue has.
const multiSize = () => [sizes(101, ['18', '12', '14', '16'], 1001)];

const singleSize = () => [sizes(201, ['14'], 2001)];

// Product 5663 has two options: Colour and Fly Sizes.
const colourAndSizes = () => [
    {
        id: 301,
        display_name: 'Colour',
        required: true,
        partial: 'swatch',
        values: [{ id: 3001, label: 'Olive' }, { id: 3002, label: 'Black' }],
    },
    sizes(302, ['10', '12'], 3101),
];

describe('quickAddRoute', () => {
    describe('Fly Sizes is the only option, with several sizes', () => {
        it('opens the panel with every size, in catalogue order', () => {
            expect(quickAddRoute(multiSize())).toEqual({
                route: 'panel',
                optionId: 101,
                sizes: [
                    { id: 1001, label: '18', soldOut: false },
                    { id: 1002, label: '12', soldOut: false },
                    { id: 1003, label: '14', soldOut: false },
                    { id: 1004, label: '16', soldOut: false },
                ],
            });
        });

        it('marks the sizes the option-change data leaves out of stock as sold out', () => {
            const stock = { in_stock_attributes: [1001, 1003], out_of_stock_behavior: 'label_option' };

            expect(quickAddRoute(multiSize(), stock).sizes).toEqual([
                { id: 1001, label: '18', soldOut: false },
                { id: 1002, label: '12', soldOut: true },
                { id: 1003, label: '14', soldOut: false },
                { id: 1004, label: '16', soldOut: true },
            ]);
        });

        it('still opens the panel when every size is sold out, so each row says so', () => {
            const result = quickAddRoute(multiSize(), { in_stock_attributes: [] });

            expect(result.route).toBe('panel');
            expect(result.sizes.every(size => size.soldOut)).toBe(true);
        });

        it('leaves out the sizes a product rule hides, as the product page does', () => {
            const stock = {
                in_stock_attributes: [1001, 1002, 1003, 1004],
                disabled_option_values: [{ value_id: 1002 }, { value_id: '1004' }],
            };

            expect(quickAddRoute(multiSize(), stock).sizes.map(size => size.id)).toEqual([1001, 1003]);
        });
    });

    describe('Fly Sizes is the only option, with one size', () => {
        it('adds that size straight away', () => {
            expect(quickAddRoute(singleSize())).toEqual({
                route: 'add',
                optionId: 201,
                size: { id: 2001, label: '14' },
            });
        });

        it('adds it when the option-change data has it in stock', () => {
            expect(quickAddRoute(singleSize(), { in_stock_attributes: [2001] }).route).toBe('add');
        });

        it('opens the panel instead when that size is sold out, rather than an add that would fail', () => {
            expect(quickAddRoute(singleSize(), { in_stock_attributes: [] })).toEqual({
                route: 'panel',
                optionId: 201,
                sizes: [{ id: 2001, label: '14', soldOut: true }],
            });
        });

        it('adds the one size a product rule leaves', () => {
            const stock = { disabled_option_values: [{ value_id: 1001 }, { value_id: 1002 }, { value_id: 1003 }] };

            expect(quickAddRoute(multiSize(), stock)).toEqual({
                route: 'add',
                optionId: 101,
                size: { id: 1004, label: '16' },
            });
        });
    });

    describe('any other shape goes to the product page', () => {
        it('two options, such as product 5663 (Colour and Fly Sizes)', () => {
            expect(quickAddRoute(colourAndSizes())).toEqual({ route: 'product-page', reason: 'several-options' });
        });

        it('two options in either order', () => {
            expect(quickAddRoute(colourAndSizes().reverse())).toEqual({ route: 'product-page', reason: 'several-options' });
        });

        it('no options at all, such as an Assortment with no size option', () => {
            expect(quickAddRoute([])).toEqual({ route: 'product-page', reason: 'no-options' });
        });

        it('one option that is not Fly Sizes', () => {
            const packs = [{ id: 401, display_name: 'Pack', values: [{ id: 4001, label: '6 flies' }, { id: 4002, label: '12 flies' }] }];

            expect(quickAddRoute(packs)).toEqual({ route: 'product-page', reason: 'no-size-option' });
        });

        it('a size option under another name, until ticket 18 merges the split names', () => {
            const choose = [{ ...sizes(501, ['12', '14'], 5001), display_name: 'Choose Size' }];

            expect(quickAddRoute(choose)).toEqual({ route: 'product-page', reason: 'no-size-option' });
        });

        it('Fly Sizes with no values', () => {
            expect(quickAddRoute([sizes(601, [], 6001)])).toEqual({ route: 'product-page', reason: 'no-sizes' });
        });

        it('Fly Sizes whose every size a product rule hides', () => {
            const stock = { disabled_option_values: [{ value_id: 2001 }] };

            expect(quickAddRoute(singleSize(), stock)).toEqual({ route: 'product-page', reason: 'no-sizes' });
        });

        it('options it cannot read, so the button is never a dead control', () => {
            expect(quickAddRoute(undefined)).toEqual({ route: 'product-page', reason: 'no-options' });
            expect(quickAddRoute(null)).toEqual({ route: 'product-page', reason: 'no-options' });
            expect(quickAddRoute({})).toEqual({ route: 'product-page', reason: 'no-options' });
            expect(quickAddRoute([null])).toEqual({ route: 'product-page', reason: 'no-size-option' });
            expect(quickAddRoute([{ ...sizes(701, ['14'], 7001), id: 'x' }])).toEqual({ route: 'product-page', reason: 'no-sizes' });
            expect(quickAddRoute([{ ...sizes(702, ['14'], 7001), values: 'x' }])).toEqual({ route: 'product-page', reason: 'no-sizes' });
        });
    });

    describe('reading the options', () => {
        it('matches the option name whatever its case or spacing', () => {
            const spaced = [{ ...sizes(801, ['12', '14'], 8001), display_name: '  fly   SIZES ' }];

            expect(quickAddRoute(spaced).route).toBe('panel');
        });

        it('recognises only Fly Sizes for now (revisitable after ticket 18)', () => {
            expect(SIZE_OPTION_NAMES).toEqual(['Fly Sizes']);
        });

        it('reads ids written as strings, as the rendered form holds them', () => {
            const fromForm = [{
                id: '901',
                display_name: 'Fly Sizes',
                values: [{ id: '9001', label: ' 12 ' }, { id: '9002', label: '14' }],
            }];

            expect(quickAddRoute(fromForm, { in_stock_attributes: [9002] })).toEqual({
                route: 'panel',
                optionId: 901,
                sizes: [
                    { id: 9001, label: '12', soldOut: true },
                    { id: 9002, label: '14', soldOut: false },
                ],
            });
        });

        it('leaves out a size it cannot add: no id, or no label', () => {
            const option = sizes(1101, ['12', '14', '16'], 11001);
            option.values[0].id = undefined;
            option.values[2].label = '   ';

            expect(quickAddRoute([option])).toEqual({
                route: 'add',
                optionId: 1101,
                size: { id: 11002, label: '14' },
            });
        });

        it('treats stock it cannot read as unknown, never as sold out', () => {
            expect(quickAddRoute(multiSize(), { in_stock_attributes: 'x' }).sizes.some(size => size.soldOut)).toBe(false);
            expect(quickAddRoute(multiSize(), null).sizes.some(size => size.soldOut)).toBe(false);
            expect(quickAddRoute(singleSize(), {}).route).toBe('add');
        });

        it('leaves its inputs unchanged', () => {
            const options = multiSize();
            const stock = { in_stock_attributes: [1001], disabled_option_values: [{ value_id: 1002 }] };
            const before = JSON.stringify([options, stock]);

            quickAddRoute(options, stock);

            expect(JSON.stringify([options, stock])).toBe(before);
        });
    });
});
