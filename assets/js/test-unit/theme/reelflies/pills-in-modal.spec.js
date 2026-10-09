import watchModalPills from '../../../theme/reelflies/pills-in-modal';

// Quick view and the cart's Change dialog fill #modal; the watcher loads size-pills.js the first
// time pills appear there, and watches each new group.
const settle = () => new Promise(resolve => { setTimeout(resolve, 0); });

describe('pills in #modal (ticket 37)', () => {
    it('loads the pills\' module only once pills appear in the modal, and watches each group', async () => {
        document.body.innerHTML = '<div id="modal"><div class="modal-content"></div></div>';
        const watchPills = jest.fn(field => field.setAttribute('data-rf-pills-watched', ''));
        const load = jest.fn(async () => ({ watchPills }));
        watchModalPills(document, load);
        document.querySelector('.modal-content').innerHTML = '<p>Loading</p>';
        await settle();
        expect(load).not.toHaveBeenCalled();
        document.querySelector('.modal-content').innerHTML = '<div data-rf-pills="size"></div><div data-rf-pills=""></div>';
        await settle();
        expect(load).toHaveBeenCalled();
        expect(watchPills).toHaveBeenCalledTimes(2);
    });

    it('does nothing on a page with no modal', () => {
        document.body.innerHTML = '<p>No modal</p>';
        const load = jest.fn();
        expect(() => watchModalPills(document, load)).not.toThrow();
        expect(load).not.toHaveBeenCalled();
    });
});
