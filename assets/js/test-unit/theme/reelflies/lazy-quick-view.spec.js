import $ from 'jquery';
import lazyQuickView from '../../../theme/reelflies/lazy-quick-view';

// Stands in for global/quick-view: it binds the same delegated click handler
// and records which product it opened, instead of fetching and showing a modal.
function fakeQuickView(opened) {
    return jest.fn(() => {
        $('body').on('click', '.quickview', event => {
            event.preventDefault();
            opened.push($(event.currentTarget).data('productId'));
        });
    });
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const settle = () => new Promise(resolve => {
    setTimeout(resolve, 0);
});

describe('lazyQuickView', () => {
    const context = { themeSettings: {} };
    let $cards;
    let opened;
    let init;

    const card = productId => $cards.find(`.quickview[data-product-id="${productId}"]`);

    beforeEach(() => {
        $cards = $(`
            <ul>
                <li class="card"><button type="button" class="quickview" data-product-id="11">Quick view</button></li>
                <li class="card"><button type="button" class="quickview" data-product-id="12">Quick view</button></li>
            </ul>
        `).appendTo(document.body);
        opened = [];
        init = fakeQuickView(opened);
    });

    afterEach(() => {
        $('body').off('click');
        $cards.remove();
    });

    it('does not load Quick view until a Quick view button is clicked', () => {
        const load = jest.fn(() => Promise.resolve({ default: init }));
        lazyQuickView(context, load);

        expect(load).not.toHaveBeenCalled();
    });

    it('opens Quick view for the product clicked first, with the page context', async () => {
        const load = jest.fn(() => Promise.resolve({ default: init }));
        lazyQuickView(context, load);

        card(12).trigger('click');
        await settle();

        expect(opened).toEqual([12]);
        expect(init).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledWith(context);
    });

    it('opens once per click after the first, without loading or binding again', async () => {
        const load = jest.fn(() => Promise.resolve({ default: init }));
        lazyQuickView(context, load);

        card(11).trigger('click');
        await settle();
        card(12).trigger('click');
        card(11).trigger('click');
        await settle();

        expect(opened).toEqual([11, 12, 11]);
        expect(load).toHaveBeenCalledTimes(1);
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('opens only once, for the last product clicked, when clicks land while it loads', async () => {
        const loading = deferred();
        const load = jest.fn(() => loading.promise);
        lazyQuickView(context, load);

        card(11).trigger('click');
        card(11).trigger('click');
        card(12).trigger('click');
        loading.resolve({ default: init });
        await settle();

        expect(opened).toEqual([12]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('stops the button from acting on its own while Quick view loads', () => {
        const load = jest.fn(() => deferred().promise);
        lazyQuickView(context, load);

        const event = $.Event('click');
        card(11).trigger(event);

        expect(event.isDefaultPrevented()).toBe(true);
    });

    it('leaves the page usable when Quick view fails to load, and tries again on the next click', async () => {
        const load = jest.fn()
            .mockImplementationOnce(() => Promise.reject(new Error('ChunkLoadError')))
            .mockImplementation(() => Promise.resolve({ default: init }));
        lazyQuickView(context, load);

        card(11).trigger('click');
        await settle();

        expect(opened).toEqual([]);
        expect(init).not.toHaveBeenCalled();

        card(12).trigger('click');
        await settle();

        expect(opened).toEqual([12]);
        expect(load).toHaveBeenCalledTimes(2);
        expect(init).toHaveBeenCalledTimes(1);
    });

    it('does not open Quick view for a card removed from the page while it loaded', async () => {
        const loading = deferred();
        const load = jest.fn(() => loading.promise);
        lazyQuickView(context, load);

        card(11).trigger('click');
        card(11).closest('.card').remove();
        loading.resolve({ default: init });
        await settle();

        expect(opened).toEqual([]);
        expect(init).toHaveBeenCalledTimes(1);
    });
});
