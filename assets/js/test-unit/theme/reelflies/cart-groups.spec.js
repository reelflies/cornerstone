import { rowOrder, sortCartRows } from '../../../theme/reelflies/cart-groups';

// The server groups the lines by pattern (cart-lines.html; render/partials/cart.test.mjs); this
// sorts each group's rows into hook order.

describe('rowOrder', () => {
    it('puts one pattern\'s sizes in hook order, whatever order they were added in: 14, 12, 16 read 12, 14, 16 (story 50)', () => {
        expect(rowOrder(['14', '12', '16'])).toEqual([1, 0, 2]);
    });

    it('puts aught sizes first: 2/0, then 1/0, then 2, reading the catalogue\'s 1-0 too', () => {
        expect(rowOrder(['2', '1-0', '2/0'])).toEqual([2, 1, 0]);
    });

    it('keeps a row with no size, or a size that isn\'t a hook size, after the hook sizes, in the order added', () => {
        expect(rowOrder(['', '12', 'Assorted', '10'])).toEqual([3, 1, 0, 2]);
    });

    it('leaves one row, or none, where it is', () => {
        expect(rowOrder(['14'])).toEqual([0]);
        expect(rowOrder([])).toEqual([]);
    });
});

describe('sortCartRows', () => {
    // Groups as cart-lines.html renders them: the server's grouping, each group's rows in the
    // order they were added.
    const render = groups => {
        document.body.innerHTML = `<ul data-rf-cart-lines>${groups.map(rows => `<li data-rf-cart-group${rows.length > 1 ? ' data-rf-cart-multi' : ''}>
            <h2>Pattern</h2>
            <ul class="rf-cart-rows">${rows.map(([id, size]) => `<li data-rf-cart-row data-rf-size="${size}" data-id="${id}"><button data-cart-itemid="${id}" data-action="inc">+</button></li>`).join('')}</ul>
        </li>`).join('')}</ul>`;
        return [...document.querySelectorAll('[data-rf-cart-group]')];
    };
    const order = group => [...group.querySelectorAll('[data-rf-cart-row]')].map(row => row.dataset.id);

    it('sorts each group\'s rows into hook order and marks every group sorted, leaving the groups\' order alone', () => {
        const [adams, bugger] = render([[['a', '14'], ['b', '12'], ['c', '16']], [['d', '8']]]);
        sortCartRows(document);
        expect(order(adams)).toEqual(['b', 'a', 'c']);
        expect(order(bugger)).toEqual(['d']);
        expect([adams, bugger].every(group => group.hasAttribute('data-rf-cart-sorted'))).toBe(true);
        expect([...document.querySelectorAll('[data-rf-cart-group]')]).toEqual([adams, bugger]);
    });

    it('still shows a group it can\'t sort, sorts the groups after it, then throws the first error', () => {
        const [broken, adams] = render([[['x', '14'], ['y', '12']], [['a', '14'], ['b', '12']]]);
        broken.querySelector('[data-rf-cart-row]').getAttribute = () => { throw new Error('a broken row'); };
        expect(() => sortCartRows(document)).toThrow('a broken row');
        expect(order(adams)).toEqual(['b', 'a']);
        expect([broken, adams].every(group => group.hasAttribute('data-rf-cart-sorted'))).toBe(true);
    });

    it('keeps focus on a control in a row it moves', () => {
        const [adams] = render([[['a', '14'], ['b', '12']]]);
        const button = adams.querySelector('[data-cart-itemid="a"]');
        button.focus();
        sortCartRows(document);
        expect(order(adams)).toEqual(['b', 'a']);
        expect(document.activeElement).toBe(button);
    });

    it('moves nothing in a group already in hook order, runs again cleanly, and does nothing on a page with no lines', () => {
        const [adams] = render([[['a', '12'], ['b', '14']]]);
        const rows = [...adams.querySelectorAll('[data-rf-cart-row]')];
        const observer = new MutationObserver(() => {});
        observer.observe(adams, { childList: true, subtree: true });
        sortCartRows(document);
        sortCartRows(document);
        expect(observer.takeRecords()).toEqual([]);
        expect([...adams.querySelectorAll('[data-rf-cart-row]')]).toEqual(rows);
        document.body.innerHTML = '<p>Your cart is empty</p>';
        expect(() => sortCartRows(document)).not.toThrow();
    });
});
