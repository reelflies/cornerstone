import $ from 'jquery';
import Cart from '../../../theme/cart';

// "Have a coupon code?" (ticket 41; UX-22; story 54): components/reelflies/cart-summary.html keeps
// stock's toggle and form, hidden with the hidden attribute, and stock cart.js's
// bindPromoCodeEvents opens it. render/partials/cart.test.mjs holds the template to these classes
// and ids; this holds stock's script to the markup.
const SUMMARY = `<div class="rf-cart-summary">
    <a class="button button--primary rf-cart-checkout" href="/checkout">Check out</a>
    <div class="rf-cart-coupon">
        <button type="button" class="coupon-code-add rf-cart-coupon-link" aria-controls="add-coupon" aria-expanded="false">Have a coupon code?</button>
        <button type="button" class="coupon-code-cancel rf-cart-coupon-link" aria-controls="add-coupon" aria-expanded="true" hidden>Cancel</button>
        <div id="add-coupon" class="cart-form coupon-code" aria-hidden="true" hidden>
            <form class="form form--hiddenLabels coupon-form" method="post" action="/cart.php">
                <label class="form-label" for="couponcode">Coupon code</label>
                <input class="form-input" id="couponcode" type="text" name="couponcode" value="">
                <input class="button button--small" type="submit" value="Apply">
            </form>
        </div>
    </div>
</div>`;

const shown = element => $(element).css('display') !== 'none';

describe('the coupon link and stock cart.js', () => {
    beforeEach(() => {
        document.body.innerHTML = SUMMARY;
        const cart = new Cart();
        cart.context = {};
        cart.bindPromoCodeEvents();
    });

    it('keeps the field hidden until the link is used', () => {
        expect(shown(document.getElementById('add-coupon'))).toBe(false);
        expect(document.getElementById('add-coupon').getAttribute('aria-hidden')).toBe('true');
    });

    it('opens the field in place and moves focus into it, and Cancel closes it', () => {
        document.querySelector('.coupon-code-add').click();
        expect(shown(document.getElementById('add-coupon'))).toBe(true);
        expect(document.getElementById('add-coupon').getAttribute('aria-hidden')).toBe('false');
        expect(document.activeElement).toBe(document.getElementById('couponcode'));
        expect(shown(document.querySelector('.coupon-code-add'))).toBe(false);
        expect(shown(document.querySelector('.coupon-code-cancel'))).toBe(true);

        document.querySelector('.coupon-code-cancel').click();
        expect(shown(document.getElementById('add-coupon'))).toBe(false);
        expect(shown(document.querySelector('.coupon-code-add'))).toBe(true);
    });
});
