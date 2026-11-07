// The box (box.js): the cart over the Storefront Cart API, changed one call at a time, with each
// change shown before the store answers. fetch is a small in-memory cart.

const json = body => ({ ok: true, status: 200, text: () => Promise.resolve(body === null ? '' : JSON.stringify(body)) });
const refused = (status, title) => ({ ok: false, status, text: () => Promise.resolve(JSON.stringify({ status, title })) });

function fakeStore() {
    let cart = null;
    let next = 1;
    const calls = [];
    const view = () => cart && { id: 'c1', lineItems: { physicalItems: cart.map(item => ({ ...item })), digitalItems: [] } };
    const item = (line) => ({
        id: `i${next++}`, productId: line.productId, variantId: line.variantId, quantity: line.quantity, name: `Fly ${line.productId}`, salePrice: 1, brand: 'ReelFlies', options: [{ name: 'Fly Sizes', value: String(line.variantId) }],
    });
    const fetch = jest.fn((url, init = {}) => {
        const method = init.method || 'GET';
        const path = url.split('?')[0].replace('/api/storefront/carts', '');
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push(`${method} ${path || '/'}`);
        if (store.refuseNext) {
            const answer = store.refuseNext;
            store.refuseNext = null;
            return Promise.resolve(answer);
        }
        if (method === 'GET') return Promise.resolve(json(cart ? [view()] : []));
        if (method === 'POST' && !path) {
            cart = body.lineItems.map(item);
            return Promise.resolve(json(view()));
        }
        if (method === 'POST') {
            body.lineItems.forEach(line => cart.push(item(line)));
            return Promise.resolve(json(view()));
        }
        const id = path.split('/').pop();
        const found = cart.find(line => line.id === id);
        if (method === 'PUT') found.quantity = body.lineItem.quantity;
        if (method === 'DELETE') {
            cart = cart.filter(line => line !== found);
            if (!cart.length) {
                cart = null;
                return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') });
            }
        }
        return Promise.resolve(json(view()));
    });
    const store = { fetch, calls, refuseNext: null };
    return store;
}

describe('the box', () => {
    let box;
    let store;

    beforeEach(() => {
        jest.resetModules();
        // eslint-disable-next-line global-require
        box = require('../../../theme/reelflies/box');
        store = fakeStore();
        global.fetch = store.fetch;
    });

    afterEach(() => {
        delete global.fetch;
    });

    it('reads nothing when the page has no cart', async () => {
        await box.load('');
        expect(store.calls).toEqual([]);
        expect(box.lines()).toEqual([]);
        expect(box.isLoaded()).toBe(true);
    });

    it('shows an add before the store answers, then the store\'s line', async () => {
        await box.load('');
        const done = box.change({
            productId: 10, variantId: 14, delta: 1, meta: { name: 'Adams', size: '14', price: 0.95, brand: 'ReelFlies' },
        });
        expect(box.lines()).toMatchObject([{ productId: '10', variantId: 14, quantity: 1, name: 'Adams', itemId: null }]);
        await done;
        expect(store.calls).toEqual(['POST /']);
        expect(box.lines()).toMatchObject([{ productId: '10', variantId: 14, quantity: 1, itemId: 'i1' }]);
    });

    it('runs quick taps one call at a time, each from the cart the last returned, so they add up', async () => {
        await box.load('');
        const taps = [1, 2, 3].map(() => box.change({ productId: 10, variantId: 14, delta: 1 }));
        expect(box.lines()[0].quantity).toBe(3);
        await Promise.all(taps);
        expect(store.calls).toEqual(['POST /', 'PUT /c1/items/i1', 'PUT /c1/items/i1']);
        expect(box.lines()[0].quantity).toBe(3);
    });

    it('adds a new size of a pattern as its own line', async () => {
        await box.load('');
        await box.change({ productId: 10, variantId: 14, delta: 1 });
        await box.change({ productId: 10, variantId: 16, delta: 1 });
        expect(store.calls).toEqual(['POST /', 'POST /c1/items']);
        expect(box.lines().map(line => line.variantId)).toEqual([14, 16]);
        expect(box.totals(['ReelFlies'])).toMatchObject({ units: 2, patterns: 1, flies: true });
    });

    it('removes the line at 0, and forgets the cart when the store deletes it', async () => {
        await box.load('');
        await box.change({ productId: 10, variantId: 14, delta: 1 });
        await box.change({ productId: 10, variantId: 14, delta: -1 });
        expect(store.calls).toEqual(['POST /', 'DELETE /c1/items/i1']);
        expect(box.lines()).toEqual([]);
        await box.change({ productId: 11, variantId: 8, delta: 1 });
        expect(store.calls[2]).toBe('POST /');
    });

    it('drops a refused change, keeps the store\'s cart, and rejects with the store\'s words', async () => {
        await box.load('');
        await box.change({ productId: 10, variantId: 14, delta: 1 });
        store.refuseNext = refused(422, 'Only 1 left in stock.');
        await expect(box.change({ productId: 10, variantId: 14, delta: 1 })).rejects.toMatchObject({ message: 'Only 1 left in stock.', storeWords: true });
        expect(box.lines()[0].quantity).toBe(1);
        await box.change({ productId: 10, variantId: 14, delta: 1 });
        expect(box.lines()[0].quantity).toBe(2);
    });

    it('counts in items when a line isn\'t a fly brand\'s', async () => {
        await box.load('');
        await box.change({ productId: 10, variantId: 14, delta: 2 });
        expect(box.totals(['ReelFlies']).flies).toBe(true);
        expect(box.totals(['Other']).flies).toBe(false);
        expect(box.totals([]).flies).toBe(false);
    });

    it('tells its listeners after every change', async () => {
        await box.load('');
        const heard = jest.fn();
        box.subscribe(heard);
        await box.change({ productId: 10, variantId: 14, delta: 1 });
        expect(heard).toHaveBeenCalledTimes(2); // shown, then answered
    });
});
