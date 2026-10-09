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
    'sold-out-only': 'Size {size} is sold out.',
    'sold-out-all': 'Every size is sold out.',
    'sold-out-choice': 'That choice is sold out.',
    'option-error': 'We couldn\'t check that choice. Try again.',
    'no-size': 'No size chosen',
    'size-and': 'Size {size}, {flies}',
    'one-fly': '# fly',
    'many-flies': '# flies',
    quantity: 'Quantity #',
    product: 'Adams Parachute',
};
const attrs = Object.entries(WORDS).map(([name, text]) => `data-rf-${name}="${text}"`).join(' ');
const pills = (soldOut = []) => `<div data-rf-pills="size" role="radiogroup">
    <a class="rf-pills-guide" href="/fly-hook-size-chart/">Hook size guide</a>
    ${['12', '14', '16'].map((size, index) => `<input type="radio" id="s${index}" name="attribute[117]" value="${301 + index}"${soldOut.includes(size) ? ' aria-disabled="true"' : ''}>
    <label for="s${index}" data-product-attribute-value="${301 + index}"><span class="form-option-variant">${size}</span></label>`).join('')}
</div>`;
const PAGE = (soldOut) => `<div class="productView"><form data-cart-item-add>
    <input type="hidden" name="product_id" value="4877">
    <div data-product-option-change>${pills(soldOut)}</div>
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
let readQuantity;

// Fake timers and a stub matchMedia, which some cases set, never outlive their case.
afterEach(() => {
    jest.useRealTimers();
    delete window.matchMedia;
});

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
    readQuantity = jest.fn(async () => 16);
});

const load = () => {
    addFlow.load({ rfFlyBrands: 'ReelFlies', urls: { cart: '/cart.php' } }, document, { notify, doFetch, readQuantity });
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

    it('leaves a success to stock\'s modal in Quick view, and on a page with no flow loaded', () => {
        document.body.insertAdjacentHTML('beforeend', '<div class="quickView"><form id="qv"><div data-rf-add><input id="form-action-addToCart"><p data-rf-add-status hidden></p></div></form></div>');
        load();
        expect(bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.getElementById('qv') })).toBe(false);
        bridge.setAddHandlers({});
        expect(bridge.addFinished(null, { data: { cart_item: {} } }, {})).toBe(false);
    });

    it('says when an option change fails, in its own words, so the pills stay usable', () => {
        load();
        expect(bridge.optionChangeFailed(new Error('offline'), undefined)).toBe(true);
        expect(status().textContent).toBe('We couldn\'t check that choice. Try again.');
        expect(bridge.optionChangeFailed(null, { data: { purchasable: true } })).toBe(false);
    });
});

describe('stock\'s hold on a choice it can\'t sell', () => {
    it('holds the flow\'s own button with aria-disabled, never another, and its click says why (story 39)', () => {
        load();
        choose('s1');
        expect(bridge.holdAddButton(button(), true)).toBe(true);
        expect(button().getAttribute('aria-disabled')).toBe('true');
        expect(button().disabled).toBe(false);
        const other = document.createElement('input');
        expect(bridge.holdAddButton(other, true)).toBe(false);
        const clicked = button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(clicked).toBe(false);
        expect(status().textContent).toBe('Size 14 is sold out. Choose another size.');
        expect(stockSubmit).not.toHaveBeenCalled();
        bridge.holdAddButton(button(), false);
        expect(button().hasAttribute('aria-disabled')).toBe(false);
    });
});

describe('the status line and the label', () => {
    it('takes away the last message on a new choice', () => {
        load();
        submit();
        expect(status().hidden).toBe(false);
        choose('s1');
        expect(status().hidden).toBe(true);
    });

    it('keeps a pre-order product\'s label', () => {
        document.body.innerHTML = PAGE([]).replace('data-rf-add ', 'data-rf-add data-rf-pre-order ').replace('value="Choose a size"', 'value="Pre-Order Now"');
        load();
        choose('s1');
        expect(button().value).toBe('Pre-Order Now');
    });
});

describe('after an add, the rest of the page is told', () => {
    it('sends rf:cart-changed on document after stock\'s count update, with the source and the product (build pipeline 6.9)', async () => {
        const order = [];
        notify.mockImplementation(() => order.push('count'));
        const changed = jest.fn(() => order.push('changed'));
        document.addEventListener('rf:cart-changed', changed);
        load();
        choose('s1');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        document.removeEventListener('rf:cart-changed', changed);
        expect(notify).toHaveBeenCalledWith(15);
        expect(order).toEqual(['count', 'changed']);
        expect(changed.mock.calls[0][0].detail).toEqual({ source: 'product', productId: 4877 });
        expect(readQuantity).not.toHaveBeenCalled();
    });

    it('when the cart\'s read fails, says the line without the count, tells the header from stock\'s cart summary, then sends rf:cart-changed', async () => {
        doFetch.mockImplementation(async () => { throw new Error('offline'); });
        const order = [];
        notify.mockImplementation(() => order.push('count'));
        const changed = jest.fn(() => order.push('changed'));
        document.addEventListener('rf:cart-changed', changed);
        load();
        choose('s1');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        await settle();
        document.removeEventListener('rf:cart-changed', changed);
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce.mock.calls[0][0]).not.toMatch(/in your cart/);
        expect(readQuantity).toHaveBeenCalledTimes(1);
        expect(notify).toHaveBeenCalledWith(16);
        expect(order).toEqual(['count', 'changed']);
    });

    it('never tells the header 0 from stock\'s cart summary after an add, as an empty or not-yet summary reads', async () => {
        doFetch.mockImplementation(async () => { throw new Error('offline'); });
        readQuantity.mockImplementation(async () => 0);
        load();
        choose('s1');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        await settle();
        expect(notify).not.toHaveBeenCalled();
    });

    it('when stock\'s cart summary fails too, still sends rf:cart-changed, with the header left as it was', async () => {
        doFetch.mockImplementation(async () => { throw new Error('offline'); });
        readQuantity.mockImplementation(async () => null);
        const changed = jest.fn();
        document.addEventListener('rf:cart-changed', changed);
        load();
        choose('s1');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        await settle();
        document.removeEventListener('rf:cart-changed', changed);
        expect(notify).not.toHaveBeenCalled();
        expect(changed).toHaveBeenCalledTimes(1);
    });

    it('names the product, from the buy row, on a product with no options', async () => {
        document.body.innerHTML = PAGE([]).replace(/<div data-rf-pills[\s\S]*?<\/div>/, '');
        load();
        expect(button().value).toBe('Add 1 to cart');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        expect(status().textContent).toBe('Added 1 × Adams Parachute. 15 flies in your cart. View cart');
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
    it('adds nothing on a second tap while an add is in flight', () => {
        load();
        choose('s1');
        // Stock's submit handler disables the main button as the add starts.
        const requestSubmit = jest.fn(() => { button().disabled = true; });
        document.querySelector('form').requestSubmit = requestSubmit;
        document.querySelector('[data-rf-sticky-button]').click();
        document.querySelector('[data-rf-sticky-button]').click();
        expect(requestSubmit).toHaveBeenCalledTimes(1);
    });

    it('forgets a bar tap that the browser\'s check of a required option stopped, so the next add is the main button\'s', async () => {
        load();
        choose('s1');
        document.querySelector('form').requestSubmit = jest.fn(); // nothing starts: the main button stays enabled
        document.querySelector('[data-rf-sticky-button]').click();
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        expect(document.querySelector('[data-rf-sticky-add]').hasAttribute('data-rf-bar')).toBe(false);
        expect(document.activeElement).toBe(button());
    });

    it('names the choice as it was sent, though the pills stay live while the add is in flight', async () => {
        load();
        choose('s1');
        button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        choose('s2');
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await settle();
        expect(status().textContent).toBe('Added 1 × size 14. 15 flies in your cart. View cart');
    });

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
    });

    it('after an add from the bar: "Added 3 × size 14" and View cart for about 4 seconds, focus kept in the bar', async () => {
        jest.useFakeTimers();
        // A phone, with the main button scrolled above the screen: the bar is at rest.
        window.matchMedia = () => ({ matches: true, addEventListener() {} });
        button().getBoundingClientRect = () => ({ bottom: -20 });
        load();
        choose('s1');
        document.querySelector('[name="qty[]"]').value = '3';
        // Stock's submit handler disables the main button as the add starts.
        document.querySelector('form').requestSubmit = jest.fn(() => { button().disabled = true; });
        document.querySelector('[data-rf-sticky-button]').click();
        expect(document.querySelector('[data-rf-sticky-button]').disabled).toBe(true);
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
    });

    it('after an add from the bar that fails: the reason in the bar for about 4 seconds, with focus on its button, never dropped to the page', async () => {
        jest.useFakeTimers();
        window.matchMedia = () => ({ matches: true, addEventListener() {} });
        button().getBoundingClientRect = () => ({ bottom: -20 });
        load();
        choose('s1');
        document.querySelector('form').requestSubmit = jest.fn(() => { button().disabled = true; });
        const barButton = document.querySelector('[data-rf-sticky-button]');
        barButton.click();
        // A disabled button loses focus in a browser (jsdom keeps it): the page has it now.
        barButton.blur();
        bridge.addFinished(new Error('offline'), undefined, { label: 'Add 1 to cart', form: document.querySelector('form') });
        await Promise.resolve();
        const bar = document.querySelector('[data-rf-sticky-add]');
        expect(bar.getAttribute('data-rf-bar')).toBe('error');
        expect(bar.querySelector('[data-rf-sticky-text]').textContent).toBe('That didn\'t go in your cart. Try again.');
        expect(barButton.disabled).toBe(false);
        expect(barButton.hidden).toBe(false);
        expect(document.activeElement).toBe(barButton);
        expect(announce).toHaveBeenCalledWith('That didn\'t go in your cart. Try again.', document);
        jest.advanceTimersByTime(4000);
        expect(bar.hasAttribute('data-rf-bar')).toBe(false);
        expect(bar.querySelector('[data-rf-sticky-text]').textContent).toBe('Size 14, 1 fly');
    });

    it('says in the bar why a tap from it stopped, focus kept on its button, but leaves focus on the size to choose', () => {
        document.body.innerHTML = PAGE(['14']);
        window.matchMedia = () => ({ matches: true, addEventListener() {} });
        button().getBoundingClientRect = () => ({ bottom: -20 });
        load();
        const bar = document.querySelector('[data-rf-sticky-add]');
        const barButton = bar.querySelector('[data-rf-sticky-button]');
        document.querySelector('form').requestSubmit = jest.fn();
        barButton.focus();
        barButton.click();
        expect(document.activeElement).toBe(document.getElementById('s0'));
        expect(bar.hasAttribute('data-rf-bar')).toBe(false);
        choose('s1');
        barButton.focus();
        barButton.click();
        expect(bar.getAttribute('data-rf-bar')).toBe('error');
        expect(bar.querySelector('[data-rf-sticky-text]').textContent).toBe('Size 14 is sold out. Choose another size.');
        expect(document.activeElement).toBe(barButton);
        expect(document.querySelector('form').requestSubmit).not.toHaveBeenCalled();
    });

    it('follows the main button: its label while an add is in flight, and its held look', async () => {
        load();
        choose('s1');
        const barButton = document.querySelector('[data-rf-sticky-button]');
        expect(barButton.textContent).toBe('Add 1 to cart');
        button().value = 'Adding to cart…';
        await Promise.resolve();
        expect(barButton.textContent).toBe('Adding to cart…');
        button().value = 'Add 1 to cart';
        bridge.holdAddButton(button(), true);
        await Promise.resolve();
        expect(barButton.getAttribute('aria-disabled')).toBe('true');
        bridge.holdAddButton(button(), false);
        await Promise.resolve();
        expect(barButton.hasAttribute('aria-disabled')).toBe(false);
    });

    it('says stock\'s quantity limit in the bar and the live region when the main button is disabled for it, and adds nothing', async () => {
        load();
        choose('s1');
        document.getElementById('add-to-cart-wrapper').insertAdjacentHTML('beforeend', '<div class="productAttributes-message" data-qty-limit="true"><p class="alertBox-message">The maximum purchasable quantity is 2</p></div>');
        button().disabled = true; // stock's showQtyLimitMessage
        await Promise.resolve();
        const bar = document.querySelector('[data-rf-sticky-add]');
        const barButton = bar.querySelector('[data-rf-sticky-button]');
        expect(barButton.getAttribute('aria-disabled')).toBe('true');
        document.querySelector('form').requestSubmit = jest.fn();
        barButton.click();
        expect(bar.querySelector('[data-rf-sticky-text]').textContent).toBe('The maximum purchasable quantity is 2');
        expect(announce).toHaveBeenCalledWith('The maximum purchasable quantity is 2', document);
        expect(document.querySelector('form').requestSubmit).not.toHaveBeenCalled();
    });

    it('says stock\'s quantity limit in the live region once when its alert appears, which has no role of its own (spec module 1)', async () => {
        document.getElementById('add-to-cart-wrapper').insertAdjacentHTML('beforeend', '<div class="productAttributes-message" style="display:none"><p class="alertBox-message"></p></div>');
        load();
        const box = document.querySelector('.productAttributes-message');
        // As stock's showQtyLimitMessage does: the words, then the mark.
        const showLimit = () => {
            box.querySelector('.alertBox-message').textContent = 'The maximum purchasable quantity is 2';
            box.setAttribute('data-qty-limit', 'true');
        };
        showLimit();
        await Promise.resolve();
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith('The maximum purchasable quantity is 2', document);
        showLimit(); // another keystroke over the limit: already said
        await Promise.resolve();
        expect(announce).toHaveBeenCalledTimes(1);
        box.removeAttribute('data-qty-limit'); // back under the limit, then over it again
        showLimit();
        await Promise.resolve();
        expect(announce).toHaveBeenCalledTimes(2);
    });

    it('hands focus to the main button when the bar hides with it inside, as after scrolling back up during the added look', async () => {
        jest.useFakeTimers();
        window.matchMedia = () => ({ matches: true, addEventListener() {} });
        let bottom = -20;
        button().getBoundingClientRect = () => ({ bottom });
        load();
        choose('s1');
        document.querySelector('form').requestSubmit = jest.fn(() => { button().disabled = true; });
        document.querySelector('[data-rf-sticky-button]').click();
        bridge.addFinished(null, { data: { cart_item: {} } }, { form: document.querySelector('form') });
        await Promise.resolve();
        await Promise.resolve();
        bottom = 600; // the shopper scrolled back up to the main button
        jest.advanceTimersByTime(4000);
        expect(document.querySelector('[data-rf-sticky-add]').hidden).toBe(true);
        expect(document.activeElement).toBe(button());
    });
});

describe('the wording of the guards and failures', () => {
    it('says a one-size product\'s sold-out size without "Choose another size"', () => {
        document.body.innerHTML = PAGE([]).replace(/(<input type="radio" id="s1"[\s\S]*?<\/label>)[\s\S]*?(<\/div>)/, '$1$2').replace(/<input type="radio" id="s0"[\s\S]*?<\/label>/, '');
        document.querySelector('form').addEventListener('submit', stockSubmit);
        load();
        choose('s1');
        bridge.holdAddButton(button(), true);
        button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(status().textContent).toBe('Size 14 is sold out.');
    });

    it('says every size is sold out, rather than sending the shopper to a size that can\'t be bought', () => {
        document.body.innerHTML = PAGE(['12', '14', '16']);
        document.querySelector('form').addEventListener('submit', stockSubmit);
        load();
        button().focus();
        button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(status().textContent).toBe('Every size is sold out.');
        expect(document.activeElement).toBe(button());
        choose('s1');
        button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(status().textContent).toBe('Every size is sold out.');
        expect(stockSubmit).not.toHaveBeenCalled();
    });

    it('says "That choice is sold out." when every size is out in the Colour chosen, which other Colours may still have', () => {
        document.body.innerHTML = PAGE(['12', '14', '16']).replace('<div id="add-to-cart-wrapper"', `<div data-product-option-change>
            <div class="form-field"><input type="radio" id="c1" name="attribute[200]" value="9" checked>
            <label for="c1" class="form-option"><span class="form-option-variant form-option-variant--color" title="Olive"></span></label></div>
        </div><div id="add-to-cart-wrapper"`);
        document.querySelector('form').addEventListener('submit', stockSubmit);
        load();
        button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(status().textContent).toBe('That choice is sold out.');
        expect(stockSubmit).not.toHaveBeenCalled();
    });

    it('says "That choice is sold out." when stock holds a product with no size', () => {
        document.body.innerHTML = PAGE([]).replace(/<div data-rf-pills[\s\S]*?<\/div>/, '');
        load();
        bridge.holdAddButton(button(), true);
        const clicked = button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(clicked).toBe(false);
        expect(status().textContent).toBe('That choice is sold out.');
    });

    it('leaves a required option still empty to the browser\'s check, rather than calling a held size sold out', () => {
        document.body.innerHTML = PAGE([]).replace('<div data-product-option-change>', '<div data-product-option-change><div class="form-field"><input type="radio" name="attribute[9]" value="1" required></div>');
        load();
        choose('s1');
        bridge.holdAddButton(button(), true);
        const clicked = button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(clicked).toBe(true);
        expect(status().hidden).toBe(true);
    });

    it('writes the message into the template\'s text box, after its icons, the error class picking the alert', () => {
        document.body.innerHTML = PAGE(['12']).replace('<p data-rf-add-status hidden></p>', '<p data-rf-add-status hidden><svg class="rf-add-status-alert"></svg><svg class="rf-add-status-check"></svg><span data-rf-add-status-text></span></p>');
        load();
        button().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(status().querySelectorAll('svg')).toHaveLength(2);
        expect(status().querySelector('[data-rf-add-status-text]').textContent).toBe('Choose a fly size first.');
        expect(status().classList.contains('rf-add-status--error')).toBe(true);
    });

    it('says a failed option change in the form whose option it was, a Quick view over the page', () => {
        document.body.insertAdjacentHTML('beforeend', '<div class="quickView" id="qv"><form><div data-rf-add><p data-rf-add-status hidden></p></div></form></div>');
        load();
        bridge.optionChangeFailed(new Error('offline'), undefined, document.getElementById('qv'));
        expect(document.querySelector('#qv [data-rf-add-status]').textContent).toBe('We couldn\'t check that choice. Try again.');
        expect(status().hidden).toBe(true);
    });
});
