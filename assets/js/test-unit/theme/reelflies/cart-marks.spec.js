import cartMarks, { inCartLine, startCartMarks } from '../../../theme/reelflies/cart-marks';
import { CHANGED_EVENT } from '../../../theme/reelflies/cart-events';
import {
    EMPTY, FAT_ALBERT, TWO_SIZES, cart,
} from './cart-fixtures';

// The marks and lines the cart's read drives (ticket 42; spec module 17; O15, UX-10, UX-18;
// stories 33, 40 and 68), on markup shaped as the templates render it with rf_cart_state on:
// components/reelflies/size-pills.html's size group on the product page, and
// components/reelflies/card-cart-state.html in each card.

// A size group: stock's radios and labels (ticket 37), each label with its hidden "(sold out)",
// the hidden cart tag and the corner dot, then the sold-out line and the "In your cart" line.
const PILLS = (productId, sizes, { nameId = 117 } = {}) => `<div class="form-field rf-pills-field" data-product-attribute="set-rectangle" data-rf-pills="size" role="radiogroup" aria-labelledby="rf-option-${productId}-${nameId}-label">
    <p class="rf-pills-head"><span id="rf-option-${productId}-${nameId}-label">Fly Sizes: <span data-option-value>choose one</span></span></p>
    <div class="rf-pills">${sizes.map(([id, size]) => `<div class="form-option-wrapper">
        <input class="form-radio" type="radio" id="attribute_rectangle__${nameId}_${id}" name="attribute[${nameId}]" value="${id}" required>
        <label class="form-option rf-pill" for="attribute_rectangle__${nameId}_${id}" data-product-attribute-value="${id}">
            <svg class="rf-icon rf-pill-check"></svg><span class="form-option-variant">${size}</span><span class="is-srOnly" data-rf-sold-out-tag hidden> (sold out)</span><span class="is-srOnly" data-rf-cart-tag hidden></span><span class="rf-pill-cart" data-rf-cart-dot aria-hidden="true" hidden><svg class="rf-icon"></svg></span>
        </label></div>`).join('')}</div>
    <p class="rf-pills-note" data-rf-sold-out-line></p>
    <p class="rf-pills-note rf-pills-incart" data-rf-cart-line="${productId}" data-rf-pill="(# in cart)" data-rf-line="In your cart: #." data-rf-size="# × size %" data-rf-and="and"></p>
</div>`;
// A card's slot: the reserved line, its link hidden until the cart holds the product.
const CARD = (productId, name = `Product ${productId}`) => `<article class="card rf-card" data-entity-id="${productId}"><div class="card-body">
    <h3 class="card-title"><a href="/product-${productId}/">${name}</a></h3>
    <p class="rf-card-cart" data-rf-cart-card="${productId}" data-rf-words="# in cart"><a class="rf-card-cart-link" href="/product-${productId}/" hidden><svg class="rf-icon"></svg><span data-rf-cart-count></span><span class="is-srOnly"> of ${name}</span></a></p>
</div></article>`;
const ADAMS = [['301', '12'], ['302', '14'], ['303', '16'], ['304', '18']];

const answer = body => jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) }));
const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const label = id => document.querySelector(`[data-product-attribute-value="${id}"]`);
const dot = id => label(id).querySelector('[data-rf-cart-dot]');
const tag = id => label(id).querySelector('[data-rf-cart-tag]');
const line = () => document.querySelector('[data-rf-cart-line]').textContent;
// A pill's name as a screen reader gets it: its text, less what is hidden or aria-hidden.
const spoken = element => Array.from(element.childNodes)
    .filter(node => node.nodeType === 3 || !(node.hidden || node.getAttribute('aria-hidden') === 'true' || node.tagName.toLowerCase() === 'svg'))
    .map(node => node.textContent).join('').replace(/\s+/g, ' ').trim();
const cardLink = id => document.querySelector(`[data-rf-cart-card="${id}"] a`);
const changed = (detail = { source: 'product', productId: 4877 }) => document.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail }));

let marks;

afterEach(() => {
    if (marks) marks.stop();
    marks = null;
    document.body.innerHTML = '';
});

describe('inCartLine: "In your cart: 3 × size 14 and 3 × size 16." (story 40)', () => {
    const WORDS = { line: 'In your cart: #.', size: '# × size %', and: 'and' };

    it('names one size, two with "and", and more with commas and "and" before the last, in the order given', () => {
        expect(inCartLine([{ count: 3, size: '14' }], WORDS)).toBe('In your cart: 3 × size 14.');
        expect(inCartLine([{ count: 3, size: '14' }, { count: 3, size: '16' }], WORDS)).toBe('In your cart: 3 × size 14 and 3 × size 16.');
        expect(inCartLine([{ count: 3, size: '12' }, { count: 2, size: '14' }, { count: 1, size: '16' }], WORDS)).toBe('In your cart: 3 × size 12, 2 × size 14 and 1 × size 16.');
    });

    it('says nothing for no sizes', () => {
        expect(inCartLine([], WORDS)).toBe('');
    });
});

describe('the size pills and the "In your cart" line (stories 40 and 68)', () => {
    beforeEach(() => {
        document.body.innerHTML = PILLS(4877, ADAMS);
    });

    it('marks each size in the cart with the corner check and "(3 in cart)" in its name, and names them under the pills', async () => {
        marks = startCartMarks(document, { doFetch: answer(TWO_SIZES) });
        await marks.ready;
        expect(dot('302').hidden).toBe(false);
        expect(dot('303').hidden).toBe(false);
        expect(dot('301').hidden).toBe(true);
        expect(dot('304').hidden).toBe(true);
        expect(tag('302').hidden).toBe(false);
        expect(tag('302').textContent).toBe(' (3 in cart)');
        expect(tag('301').hidden).toBe(true);
        expect(tag('301').textContent).toBe('');
        expect(spoken(label('302'))).toBe('14 (3 in cart)');
        // Sold out and in the cart: "(3 in cart)" after "(sold out)".
        label('302').querySelector('[data-rf-sold-out-tag]').hidden = false;
        expect(spoken(label('302'))).toBe('14 (sold out) (3 in cart)');
        expect(line()).toBe('In your cart: 3 × size 14 and 3 × size 16.');
    });

    it('never touches a class or the sold-out marks, so ticket 37\'s watcher and stock\'s marks stay apart from it', async () => {
        label('302').classList.add('unavailable');
        const classes = ADAMS.map(([id]) => label(id).className);
        marks = startCartMarks(document, { doFetch: answer(TWO_SIZES) });
        await marks.ready;
        expect(ADAMS.map(([id]) => label(id).className)).toEqual(classes);
        expect(label('302').querySelector('[data-rf-sold-out-tag]').hidden).toBe(true);
        expect(document.querySelector('[data-rf-sold-out-line]').textContent).toBe('');
        expect(label('302').getAttribute('data-rf-in-cart')).toBe('3');
        expect(label('301').hasAttribute('data-rf-in-cart')).toBe(false);
    });

    it('adds up a size\'s every Colour: Fat Albert\'s size 8 in olive and tan (5663)', async () => {
        document.body.innerHTML = PILLS(5663, [['601', '8'], ['602', '10'], ['603', '12']], { nameId: 119 });
        marks = startCartMarks(document, { doFetch: answer(FAT_ALBERT) });
        await marks.ready;
        expect(tag('601').textContent).toBe(' (3 in cart)');
        expect(tag('602').textContent).toBe(' (4 in cart)');
        expect(dot('603').hidden).toBe(true);
        expect(line()).toBe('In your cart: 3 × size 8 and 4 × size 10.');
    });

    it('marks nothing for another product\'s lines, or a line whose options name no size on the page', async () => {
        marks = startCartMarks(document, {
            doFetch: answer(cart({
                physicalItems: [{
                    id: 'a', productId: 4877, variantId: 1, quantity: 15,
                }, {
                    id: 'b', productId: 9999, variantId: 2, quantity: 2, options: [{ nameId: 117, valueId: 302 }],
                }],
            })),
        });
        await marks.ready;
        expect(ADAMS.every(([id]) => dot(id).hidden)).toBe(true);
        expect(line()).toBe('');
    });

    it('updates without a reload after each change to the cart: 3 × size 14, then 5 (rf:cart-changed, build pipeline 6.9)', async () => {
        const reads = [cart({
            physicalItems: [{
                id: 'a', productId: 4877, variantId: 1, quantity: 3, options: [{ nameId: 117, valueId: 302 }],
            }],
        }),
        cart({
            physicalItems: [{
                id: 'a', productId: 4877, variantId: 1, quantity: 5, options: [{ nameId: 117, valueId: 302 }],
            }],
        })];
        const doFetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(reads.shift()) }));
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        expect(line()).toBe('In your cart: 3 × size 14.');
        changed();
        await marks.idle();
        expect(doFetch).toHaveBeenCalledTimes(2);
        expect(line()).toBe('In your cart: 5 × size 14.');
        expect(tag('302').textContent).toBe(' (5 in cart)');
    });

    it('clears a size that left the cart', async () => {
        const reads = [TWO_SIZES, EMPTY];
        marks = startCartMarks(document, { doFetch: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(reads.shift()) })) });
        await marks.ready;
        changed();
        await marks.idle();
        expect(ADAMS.every(([id]) => dot(id).hidden && tag(id).hidden && !label(id).hasAttribute('data-rf-in-cart'))).toBe(true);
        expect(line()).toBe('');
    });
});

describe('the card line: "6 in cart" (story 33)', () => {
    beforeEach(() => {
        document.body.innerHTML = `<div id="product-listing-container"><ul class="productGrid">${[4877, 5663, 6001].map(id => `<li class="product">${CARD(id)}</li>`).join('')}</ul></div>`;
    });

    it('shows each pattern\'s total across its sizes on its card, as a link to its product page, and nothing on the others', async () => {
        marks = startCartMarks(document, { doFetch: answer(TWO_SIZES) });
        await marks.ready;
        expect(cardLink(4877).hidden).toBe(false);
        expect(cardLink(4877).getAttribute('href')).toBe('/product-4877/');
        expect(cardLink(4877).querySelector('[data-rf-cart-count]').textContent).toBe('6 in cart');
        expect(cardLink(4877).textContent).toBe('6 in cart of Product 4877');
        expect(cardLink(5663).hidden).toBe(true);
        expect(cardLink(6001).hidden).toBe(true);
    });

    it('gives the cards a facet change brings the last read\'s lines, with no other read', async () => {
        const doFetch = answer(FAT_ALBERT);
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        expect(cardLink(5663).hidden).toBe(false);
        const listing = document.getElementById('product-listing-container');
        listing.innerHTML = `<ul class="productGrid"><li class="product">${CARD(5663)}</li><li class="product">${CARD(4877)}</li></ul>`;
        await settle();
        expect(cardLink(5663).hidden).toBe(false);
        expect(cardLink(5663).querySelector('[data-rf-cart-count]').textContent).toBe('7 in cart');
        expect(cardLink(4877).hidden).toBe(true);
        expect(doFetch).toHaveBeenCalledTimes(1);
    });

    it('reads the cart once a facet change brings the first cards to a listing that had none', async () => {
        document.body.innerHTML = '<div id="product-listing-container"><p>No products found.</p></div>';
        const doFetch = answer(TWO_SIZES);
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        expect(doFetch).not.toHaveBeenCalled();
        document.getElementById('product-listing-container').innerHTML = `<ul class="productGrid"><li class="product">${CARD(4877)}</li></ul>`;
        await settle();
        await marks.idle();
        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(cardLink(4877).hidden).toBe(false);
    });
});

describe('one read serves the page', () => {
    it('reads once on load for the pills, the line and every card together', async () => {
        document.body.innerHTML = `${PILLS(4877, ADAMS)}<section data-rf-related>${CARD(4877)}${CARD(5663)}</section>`;
        const doFetch = answer(TWO_SIZES);
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        expect(doFetch).toHaveBeenCalledTimes(1);
        expect(line()).toBe('In your cart: 3 × size 14 and 3 × size 16.');
        expect(cardLink(4877).hidden).toBe(false);
    });

    it('reads nothing on a page with nothing to mark', async () => {
        document.body.innerHTML = '<main><p>Nothing here.</p></main>';
        const doFetch = answer(TWO_SIZES);
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        changed();
        await marks.idle();
        expect(doFetch).not.toHaveBeenCalled();
    });

    it('reads once more after a change that comes during a read, and only once more, however many come', async () => {
        document.body.innerHTML = PILLS(4877, ADAMS);
        let release;
        const first = new Promise(resolve => { release = resolve; });
        const doFetch = jest.fn()
            .mockImplementationOnce(() => first)
            .mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve(TWO_SIZES) }));
        marks = startCartMarks(document, { doFetch });
        changed();
        changed();
        changed();
        release({ ok: true, json: () => Promise.resolve(EMPTY) });
        await marks.ready;
        await marks.idle();
        expect(doFetch).toHaveBeenCalledTimes(2);
        expect(line()).toBe('In your cart: 3 × size 14 and 3 × size 16.');
    });

    it('shows nothing when a read fails, and never throws: a failed read after a good one clears the marks', async () => {
        document.body.innerHTML = `${PILLS(4877, ADAMS)}${CARD(4877)}`;
        const doFetch = jest.fn()
            .mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve(TWO_SIZES) }))
            .mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        expect(line()).not.toBe('');
        changed();
        await marks.idle();
        expect(line()).toBe('');
        expect(dot('302').hidden).toBe(true);
        expect(cardLink(4877).hidden).toBe(true);
    });

    it('reads again when the page comes back from the back-forward cache, not on a fresh show', async () => {
        document.body.innerHTML = PILLS(4877, ADAMS);
        const doFetch = answer(TWO_SIZES);
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
        await marks.idle();
        expect(doFetch).toHaveBeenCalledTimes(1);
        window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
        await marks.idle();
        expect(doFetch).toHaveBeenCalledTimes(2);
    });

    it('stops listening when stopped', async () => {
        document.body.innerHTML = PILLS(4877, ADAMS);
        const doFetch = answer(TWO_SIZES);
        marks = startCartMarks(document, { doFetch });
        await marks.ready;
        marks.stop();
        changed();
        await settle();
        expect(doFetch).toHaveBeenCalledTimes(1);
    });

    it('is the module page-modules.js loads: its default export\'s load(context) starts it on the page', async () => {
        document.body.innerHTML = PILLS(4877, ADAMS);
        const original = window.fetch;
        window.fetch = answer(TWO_SIZES);
        try {
            marks = cartMarks.load({ template: 'pages/product', rfCartState: true });
            await marks.ready;
            expect(window.fetch).toHaveBeenCalledTimes(1);
            expect(line()).toBe('In your cart: 3 × size 14 and 3 × size 16.');
        } finally {
            window.fetch = original;
        }
    });
});
