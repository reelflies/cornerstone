import { applyCartGroups, groupCartLines } from '../../../theme/reelflies/cart-groups';

// A cart line as the cart's markup describes it: its product, its Fly Size and its unit price.
const line = (productId, size, unitPrice = '1.25') => ({ productId, size, unitPrice });

describe('groupCartLines', () => {
    it('puts one pattern\'s sizes in one group, in hook order, whatever order they were added in (story 50)', () => {
        const groups = groupCartLines([line('5663', '14'), line('5663', '12'), line('5663', '16')]);
        expect(groups).toEqual([{ productId: '5663', lines: [1, 0, 2], pricesVary: false }]);
    });

    it('keeps the patterns in the order each was first added', () => {
        const groups = groupCartLines([
            line('4831', '10'), line('5906', '6'), line('4831', '8'), line('4398', ''), line('5906', '4'),
        ]);
        expect(groups.map(group => group.productId)).toEqual(['4831', '5906', '4398']);
        expect(groups.map(group => group.lines)).toEqual([[2, 0], [4, 1], [3]]);
    });

    it('puts aught sizes first: 2/0, then 1/0, then 2, reading the catalogue\'s 1-0 too', () => {
        const groups = groupCartLines([line('7', '2'), line('7', '1-0'), line('7', '2/0')]);
        expect(groups[0].lines).toEqual([2, 1, 0]);
    });

    it('keeps a line with no size, or a size that isn\'t a hook size, after the hook sizes, in the order added', () => {
        const groups = groupCartLines([line('8', ''), line('8', '12'), line('8', 'Assorted'), line('8', '10')]);
        expect(groups[0].lines).toEqual([3, 1, 0, 2]);
    });

    it('marks a group whose sizes are priced differently, so each size row shows its own unit price', () => {
        const groups = groupCartLines([line('9', '8', '2.95'), line('9', '10', '2.95'), line('10', '6', '2.95'), line('10', '4', '3.25')]);
        expect(groups.map(group => group.pricesVary)).toEqual([false, true]);
    });

    it('returns no groups for an empty cart', () => {
        expect(groupCartLines([])).toEqual([]);
    });
});

describe('applyCartGroups', () => {
    const render = items => {
        document.body.innerHTML = `<div data-cart-content><ul data-rf-cart-lines>${items.map(([id, productId, size, price]) => `<li data-rf-cart-line data-cart-itemid="${id}" data-rf-product-id="${productId}" data-rf-size="${size}" data-rf-unit-price="${price}"></li>`).join('')}</ul></div>`;
        return document.querySelector('[data-rf-cart-lines]');
    };
    const order = list => [...list.children].map(element => element.dataset.cartItemid);
    const marked = (list, attribute) => [...list.children].filter(element => element.hasAttribute(attribute)).map(element => element.dataset.cartItemid);

    it('reorders the rendered lines into groups and marks each group\'s first and last line', () => {
        const list = render([['a', '1', '14', '1.25'], ['b', '2', '8', '0.95'], ['c', '1', '12', '1.25'], ['d', '1', '16', '1.25']]);
        applyCartGroups(document);
        expect(order(list)).toEqual(['c', 'a', 'd', 'b']);
        expect(marked(list, 'data-rf-group-first')).toEqual(['c', 'b']);
        expect(marked(list, 'data-rf-group-last')).toEqual(['d', 'b']);
        expect(list.hasAttribute('data-rf-grouped')).toBe(true);
    });

    it('marks every line of a group whose sizes are priced differently', () => {
        const list = render([['a', '1', '6', '2.95'], ['b', '1', '4', '3.25'], ['c', '2', '8', '0.95']]);
        applyCartGroups(document);
        expect(marked(list, 'data-rf-prices-vary')).toEqual(['b', 'a']);
    });

    it('runs again cleanly on a re-rendered list, and does nothing on a page without one', () => {
        const list = render([['a', '1', '14', '1.25'], ['b', '1', '12', '1.25']]);
        applyCartGroups(document);
        applyCartGroups(document);
        expect(order(list)).toEqual(['b', 'a']);
        expect(marked(list, 'data-rf-group-first')).toEqual(['b']);
        document.body.innerHTML = '<p>Your cart is empty</p>';
        expect(() => applyCartGroups(document)).not.toThrow();
    });
});
