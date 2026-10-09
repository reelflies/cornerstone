// The add flow (ticket 38; add-flow.js, through add-bridge.js): "Choose a size" and the sold-out
// guard on the button's click and before stock's submit handler, and the add's success,
// error-response and network-failure paths, as stock product-details.js's hook hands them over;
// the confirmation's words for a swatch; the sticky bar's place. Stock's script isn't loaded:
// the page stands in for what the templates render (size-pills.html, add-to-cart.html,
// sticky-add.html, and a stock swatch).

const WORDS = {
    choose: 'Choose a size',
    'add-label': 'Add # to cart',
    'choose-first': 'Choose a fly size first.',
    'sold-out': 'Size {size} is sold out. Choose another size.',
    added: 'Added {qty} × {choice}.',
    size: 'size {size}',
    'cart-fly': '# fly in your cart.',
    'cart-flies': '# flies in your cart.',
    'cart-item': '# item in your cart.',
    'cart-items': '# items in your cart.',
    'view-cart': 'View cart',
    error: 'That didn\'t go in your cart. Try again.',
    'no-size': 'No size chosen',
    'size-and': 'Size {size}, {flies}',
    'one-fly': '# fly',
    'many-flies': '# flies',
    quantity: 'Quantity #',
};
const attrs = Object.entries(WORDS).map(([name, text]) => `data-rf-${name}="${text}"`).join(' ');
const pills = (soldOut = []) => `<div data-rf-pills="size" role="radiogroup">
    <a class="rf-pills-guide" href="/fly-hook-size-chart/">Hook size guide</a>
    ${['12', '14', '16'].map((size, index) => `<input type="radio" id="s${index}" name="attribute[117]" value="${301 + index}"${soldOut.includes(size) ? ' aria-disabled="true"' : ''}>
    <label for="s${index}" data-product-attribute-value="${301 + index}"><span class="form-option-variant">${size}</span></label>`).join('')}
</div>`;
const PAGE = (soldOut) => `<div class="productView"><form data-cart-item-add>
    ${pills(soldOut)}
    <div id="add-to-cart-wrapper" class="rf-add" data-rf-add ${attrs}>
        <input id="qty[]" name="qty[]" value="1">
        <input id="form-action-addToCart" type="submit" value="Choose a size">
        <p data-rf-add-status hidden></p>
    </div>
</form></div>
<div data-rf-sticky-add hidden><p data-rf-sticky-text></p><button type="button" data-rf-sticky-button></button><a href="/cart.php" data-rf-sticky-view hidden>View cart</a></div>`;

const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });
const status = () => document.querySelector('[data-rf-add-status]');
const button = () => document.getElementById('form-action-addToCart');
const choose = id => {
    document.getElementById(id).checked = true;
    document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true }));
};
const CART = units => [{ lineItems: { physicalItems: [{ productId: 4877, quantity: units, brand: 'ReelFlies' }], digitalItems: [], giftCertificates: [] } }];

let announce;
let addFlow;
let bridge;
let stockSubmit;
let notify;
let doFetch;

beforeEach(async () => {
    jest.resetModules();
    jest.doMock('../../../theme/reelflies/live-region', () => ({ announce: jest.fn() }));
    ({ announce } = await import('../../../theme/reelflies/live-region'));
    addFlow = (await import('../../../theme/reelflies/add-flow')).default;
    bridge = await import('../../../theme/reelflies/add-bridge');
    document.body.innerHTML = PAGE([]);
    stockSubmit = jest.fn(event => event.preventDefault());
    document.querySelector('form').addEventListener('submit', stockSubmit);
    notify = jest.fn();
    doFetch = jest.fn(async () => ({ ok: true, json: async () => CART(15) }));
});

const load = () => {
    addFlow.load({ rfFlyBrands: 'ReelFlies', urls: { cart: '/cart.php' }, productTitle: 'Adams Parachute' }, document, { notify, doFetch });
};
const submit = () => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

describe('before stock\'s submit handler (stories 37 and 39)', () => {
    it('with no size chosen: "Choose a fly size first.", announced, focus on the first in-stock pill, and no add', () => {
        document.body.innerHTML = PAGE(['12']);
        document.querySelector('form').addEventListener('submit', stockSubmit);
        load();
        submit();
        expect(stockSubmit).not.toHaveBeenCalled();
        expect(status().textContent).toBe('Choose a fly size first.');
        expect(status().hidden).toBe(false);
        expect(announce).toHaveBeenCalledWith('Choose a fly size first.', document);
        expect(document.activeElement).toBe(document.getElementById('s1'));
    });

    it('with a sold-out size chosen: "Size 14 is sold out. Choose another size.", and no add', () => {
        document.body.innerHTML = PAGE(['14']);
        document.querySelector('form').addEventListener('submit', stockSubmit);
        load();
        choose('s1');
        submit();
        expect(stockSubmit).not.toHaveBeenCalled();
        expect(status().textContent).toBe('Size 14 is sold out. Choose another size.');
    });

    it('with a size chosen: stock adds, and the button reads "Add 3 to cart" as the stepper says', async () => {
        load();
        choose('s1');
        document.querySelector('[name="qty[]"]').value = '3';
        document.querySelector('[name="qty[]"]').dispatchEvent(new Event('change', { bubbles: true }));
        expect(button().value).toBe('Add 3 to cart');
        submit();
        expect(stockSubmit).toHaveBeenCalledTimes(1);
    });
});

describe('the add\'s answer (stories 34, 42 and 68)', () => {
    it('on success: the button usable, no modal, "Added 3 × size 14. 15 flies in your cart." with View cart, announced once, the header told', async () => {
        load();
        choose('s1');
        document.querySelector('[name="qty[]"]').value = '3';
        // Stock disables the button while it adds, which drops its focus.
        button().focus();
        button().disabled = true;
        button().blur();
        const overlay = { hide: jest.fn() };
        expect(bridge.addFinished(null, { data: { cart_item: { id: 'x' } } }, { label: 'Add 3 to cart', overlay, form: document.querySelector('form') })).toBe(true);
        await settle();
        await settle();
        expect(button().disabled).toBe(false);
        expect(overlay.hide).toHaveBeenCalled();
        expect(status().textContent).toBe('Added 3 × size 14. 15 flies in your cart. View cart');
        expect(status().querySelector('a').getAttribute('href')).toBe('/cart.php');
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith('Added 3 × size 14. 15 flies in your cart.', document);
        expect(notify).toHaveBeenCalledWith(15);
        expect(document.activeElement).toBe(button());
    });

    it('on an error answer: the store\'s words, without their markup, and the button usable', async () => {
        load();
        choose('s1');
        button().disabled = true;
        bridge.addFinished(null, { data: { error: 'Only <strong>2</strong> left.' } }, { label: 'Add 1 to cart', form: document.querySelector('form') });
        await settle();
        expect(status().textContent).toBe('Only 2 left.');
        expect(button().disabled).toBe(false);
        expect(announce).toHaveBeenCalledWith('Only 2 left.', document);
        expect(notify).not.toHaveBeenCalled();
    });

    it('on a network failure or a page that isn\'t the cart\'s answer: the fallback words, never a TypeError', async () => {
        load();
        const { addFinished } = bridge;
        for (const [err, response] of [[new Error('offline'), undefined], [null, '<!DOCTYPE html>'], [null, { data: {} }]]) {
            expect(() => addFinished(err, response, { form: document.querySelector('form') })).not.toThrow();
            await settle(); // eslint-disable-line no-await-in-loop
            expect(status().textContent).toBe('That didn\'t go in your cart. Try again.');
        }
    });

    it('leaves Quick view\'s success to stock\'s modal, and with no flow loaded leaves everything to stock', () => {
        document.body.insertAdjacentHTML('beforeend', '<div class="quickView"><form id="qv"><div data-rf-add><input id="form-action-addToCart"><p data-rf-add-status hidden></p></div></form></div>');
        load();
        expect(bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.getElementById('qv') })).toBe(false);
        bridge.setAddHandlers({});
        expect(bridge.addFinished(null, { data: { cart_item: {} } }, {})).toBe(false);
    });

    it('says when an option change fails, so the pills stay usable', () => {
        load();
        expect(bridge.optionChangeFailed(new Error('offline'), undefined)).toBe(true);
        expect(status().textContent).toBe('That didn\'t go in your cart. Try again.');
        expect(bridge.optionChangeFailed(null, { data: { purchasable: true } })).toBe(false);
    });
});

describe('the button\'s click (story 37)', () => {
    it('stops before the browser checks the required options: "Choose a fly size first.", and no submit', () => {
        document.body.innerHTML = PAGE([]);
        document.querySelector('form').addEventListener('submit', stockSubmit);
        load();
        const clicked = button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(clicked).toBe(false);
        expect(status().textContent).toBe('Choose a fly size first.');
        expect(stockSubmit).not.toHaveBeenCalled();
    });
});

describe('the confirmation\'s words', () => {
    it('names the size and then a swatch, by its title', async () => {
        document.body.innerHTML = PAGE([]).replace('<div id="add-to-cart-wrapper"', `<div data-product-option-change>
            <div class="form-field"><input type="radio" id="c1" name="attribute[200]" value="9" checked>
            <label for="c1" class="form-option"><span class="form-option-variant form-option-variant--color" title="Olive"></span></label></div>
        </div><div id="add-to-cart-wrapper"`);
        load();
        choose('s1');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        expect(status().textContent).toBe('Added 1 × size 14, Olive. 15 flies in your cart. View cart');
    });
});

describe('the sticky bar (story 43)', () => {
    it('shows once the main button is above the screen, and hides again after a jump back, --sticky-h following', () => {
        jest.useFakeTimers();
        window.matchMedia = () => ({ matches: true, addEventListener() {} });
        let bottom = 600;
        button().getBoundingClientRect = () => ({ bottom });
        load();
        const bar = document.querySelector('[data-rf-sticky-add]');
        const stickyH = () => document.documentElement.style.getPropertyValue('--sticky-h');
        expect(bar.hidden).toBe(true);
        expect(stickyH()).toBe('0px');
        bottom = -20;
        window.dispatchEvent(new Event('scroll'));
        jest.advanceTimersByTime(20);
        expect(bar.hidden).toBe(false);
        // A jump from below the button's place to above it, crossing nothing in between.
        bottom = 1400;
        window.dispatchEvent(new Event('scroll'));
        jest.advanceTimersByTime(20);
        expect(bar.hidden).toBe(true);
        expect(stickyH()).toBe('0px');
        delete window.matchMedia;
        jest.useRealTimers();
    });

    it('after an add from the bar: "Added 3 × size 14" and View cart for about 4 seconds, focus kept in the bar', async () => {
        jest.useFakeTimers();
        load();
        choose('s1');
        document.querySelector('[name="qty[]"]').value = '3';
        document.querySelector('form').requestSubmit = jest.fn();
        document.querySelector('[data-rf-sticky-button]').click();
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        const bar = document.querySelector('[data-rf-sticky-add]');
        expect(bar.querySelector('[data-rf-sticky-text]').textContent).toBe('Added 3 × size 14');
        expect(document.activeElement).toBe(bar.querySelector('[data-rf-sticky-view]'));
        jest.advanceTimersByTime(4000);
        expect(bar.querySelector('[data-rf-sticky-view]').hidden).toBe(true);
        expect(document.activeElement).toBe(bar.querySelector('[data-rf-sticky-button]'));
        expect(bar.querySelector('[data-rf-sticky-text]').textContent).toBe('Size 14, 3 flies');
        jest.useRealTimers();
    });
});
