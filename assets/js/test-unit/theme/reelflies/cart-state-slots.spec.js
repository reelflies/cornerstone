import { TEMPLATES } from '../../../theme/reelflies/page-modules';

// Ticket 42's two slots in page-modules.js (build pipeline 6.1): the product page half and the card
// half load one chunk, rf-cart-state (cart-marks.js), and only with rf_cart_state on
// (context.rfCartState, from js-settings.html), so with it off nothing of it loads and the Cart API
// isn't read (story 73). Its own file, beside page-modules.spec.js, so tickets 42 and 43 never edit
// the same lines.

jest.mock('../../../theme/reelflies/cart-marks', () => ({ __esModule: true, default: { load: jest.fn() } }));

const slot = template => TEMPLATES[template].find(load => String(load).includes('cart-marks'));

describe('the cart state slots (ticket 42)', () => {
    let cartMarks;

    beforeEach(async () => {
        cartMarks = await import('../../../theme/reelflies/cart-marks');
    });

    it('fills both of 42\'s slots with one loader: the product page\'s and every listing\'s', () => {
        expect(slot('pages/product')).toBeDefined();
        expect(slot('pages/category')).toBe(slot('pages/product'));
        ['pages/search', 'pages/brand', 'pages/custom/category/rf-noindex', 'pages/custom/category/species-hub']
            .forEach(template => expect(TEMPLATES[template]).toContain(slot('pages/product')));
        ['pages/cart', 'pages/page'].forEach(template => expect(TEMPLATES[template]).not.toContain(slot('pages/product')));
    });

    it('starts nothing with rf_cart_state off, so its chunk never loads', async () => {
        const module = await Promise.resolve().then(slot('pages/product'));
        await module.default.load({ rfCartState: false });
        await module.default.load({});
        expect(cartMarks.default.load).not.toHaveBeenCalled();
    });

    it('starts the marks with rf_cart_state on, with the page context', async () => {
        const context = { rfCartState: true, template: 'pages/category' };
        const module = await Promise.resolve().then(slot('pages/category'));
        await module.default.load(context);
        expect(cartMarks.default.load).toHaveBeenCalledWith(context);
    });

    it('reports the marks failing to load or to start, and leaves the page as it is', async () => {
        const report = jest.spyOn(console, 'error').mockImplementation(() => {});
        const error = new Error('cart marks broke');
        cartMarks.default.load.mockImplementationOnce(() => { throw error; });
        const module = await Promise.resolve().then(slot('pages/product'));
        await expect(module.default.load({ rfCartState: true })).resolves.toBeUndefined();
        expect(report).toHaveBeenCalledWith('ReelFlies page module failed', error);
        report.mockRestore();
    });
});
