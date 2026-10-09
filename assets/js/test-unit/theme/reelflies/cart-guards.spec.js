import { guardedApi, guardedCallback } from '../../../theme/reelflies/guarded-api';

// The stock storefront API's callbacks, as utils.api.cart.* calls them: (err, response), where a
// refused change answers { data: { status: 'failed', errors: [...] } }, and a dropped connection
// gives err and no response at all (stock cart.js read response.data first and threw).
const FALLBACK = 'Something went wrong. Try again.';

describe('guardedCallback', () => {
    it('passes a successful response through', () => {
        const ok = jest.fn();
        const fail = jest.fn();
        const response = { data: { status: 'succeed' } };
        guardedCallback(ok, fail)(null, response);
        expect(ok).toHaveBeenCalledWith(response);
        expect(fail).not.toHaveBeenCalled();
    });

    it('passes the coupon and gift certificate calls\' "success" through as the cart calls\' "succeed"', () => {
        const ok = jest.fn();
        guardedCallback(ok, jest.fn())(null, { data: { status: 'success' } });
        expect(ok).toHaveBeenCalled();
    });

    it('passes a response with no status, such as a rendered template, through', () => {
        const ok = jest.fn();
        guardedCallback(ok, jest.fn())(null, { content: '<p>cart</p>' });
        expect(ok).toHaveBeenCalledWith({ content: '<p>cart</p>' });
    });

    it('turns a refused change into a failure with the store\'s own words', () => {
        const fail = jest.fn();
        guardedCallback(jest.fn(), fail)(null, { data: { status: 'failed', errors: ['Only 4 left of size 12.', 'Try fewer.'] } });
        expect(fail).toHaveBeenCalledWith('Only 4 left of size 12.\nTry fewer.');
    });

    it('turns a network failure, with no response, into a failure with the fallback words, never a TypeError', () => {
        const fail = jest.fn();
        expect(() => guardedCallback(jest.fn(), fail, FALLBACK)(new Error('Network Error'), undefined)).not.toThrow();
        expect(fail).toHaveBeenCalledWith(FALLBACK);
        const empty = jest.fn();
        guardedCallback(jest.fn(), empty, FALLBACK)(null, { data: { status: 'failed' } });
        expect(empty).toHaveBeenCalledWith(FALLBACK);
    });

    it('checks the error before the response: an error with a response is still a failure', () => {
        const ok = jest.fn();
        const fail = jest.fn();
        guardedCallback(ok, fail, FALLBACK)(new Error('500'), { data: { status: 'succeed' } });
        expect(ok).not.toHaveBeenCalled();
        expect(fail).toHaveBeenCalledWith(FALLBACK);
    });
});

describe('guardedApi', () => {
    it('resolves with the response of a call that succeeds', async () => {
        const call = jest.fn((id, qty, done) => done(null, { data: { status: 'succeed' } }));
        await expect(guardedApi(call, ['abc', 3])).resolves.toEqual({ data: { status: 'succeed' } });
        expect(call).toHaveBeenCalledWith('abc', 3, expect.any(Function));
    });

    it('rejects with the message of a call that fails, either way', async () => {
        await expect(guardedApi(done => done(null, { data: { status: 'failed', errors: ['Out of stock'] } }))).rejects.toThrow('Out of stock');
        await expect(guardedApi(done => done(new Error('offline')), [], { fallback: FALLBACK })).rejects.toThrow(FALLBACK);
    });
});

describe('cartFailed (stock cart.js\'s guarded callbacks)', () => {
    let announce;
    let cartFailed;
    beforeEach(async () => {
        jest.resetModules();
        jest.doMock('../../../theme/reelflies/live-region', () => ({ announce: jest.fn() }));
        ({ announce } = await import('../../../theme/reelflies/live-region'));
        ({ cartFailed } = await import('../../../theme/reelflies/cart-feedback'));
        document.body.innerHTML = `<ul data-rf-cart-lines>
            <li data-rf-cart-line><div class="rf-cart-row"><button data-cart-itemid="a1" data-action="inc">+</button></div></li>
            <li data-rf-cart-line><div class="rf-cart-row"><button data-cart-itemid="b1" data-action="inc">+</button></div></li>
        </ul>`;
    });

    it('on a refused change: undoes, shows the store\'s words on that line, announces them once, and stops the callback', () => {
        const undo = jest.fn();
        const anchor = document.querySelector('[data-cart-itemid="b1"]');
        const failed = cartFailed(null, { data: { status: 'failed', errors: ['Only 4 left of size 12.'] } }, { undo, anchor, fallback: FALLBACK });
        expect(failed).toBe(true);
        expect(undo).toHaveBeenCalledTimes(1);
        const errors = document.querySelectorAll('[data-rf-cart-error]');
        expect(errors).toHaveLength(1);
        expect(errors[0].textContent).toBe('Only 4 left of size 12.');
        expect(anchor.closest('[data-rf-cart-line]').contains(errors[0])).toBe(true);
        expect(announce).toHaveBeenCalledTimes(1);
        expect(announce).toHaveBeenCalledWith('Only 4 left of size 12.', document);
    });

    it('on a dropped connection: the fallback words, and no TypeError from the missing response', () => {
        const undo = jest.fn();
        expect(() => cartFailed(new Error('Network Error'), undefined, { undo, fallback: FALLBACK })).not.toThrow();
        expect(undo).toHaveBeenCalled();
        expect(document.querySelector('[data-rf-cart-error]').textContent).toBe(FALLBACK);
        expect(document.querySelector('[data-rf-cart-error]').nextElementSibling.matches('[data-rf-cart-lines]')).toBe(true);
    });

    it('replaces an earlier error rather than stacking them, and passes a success through untouched', () => {
        cartFailed(null, { data: { status: 'failed', errors: ['First'] } }, { fallback: FALLBACK });
        cartFailed(null, { data: { status: 'failed', errors: ['Second'] } }, { fallback: FALLBACK });
        expect([...document.querySelectorAll('[data-rf-cart-error]')].map(element => element.textContent)).toEqual(['Second']);
        const undo = jest.fn();
        expect(cartFailed(null, { data: { status: 'succeed' } }, { undo })).toBe(false);
        expect(undo).not.toHaveBeenCalled();
    });
});
