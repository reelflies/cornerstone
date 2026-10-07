import { compareHookSizes, hookRank, sortByHookOrder } from '../../../theme/reelflies/hook-order';

// Hook order: the biggest hook first. Aught sizes run 6/0 down to 1/0, then plain hook
// numbers run 1, 2, 4 and up (content-manifest size_option.hook_order; tickets 18, 33, 41).
const HOOK_ORDER = ['6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '1', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'];

describe('hookRank', () => {
    it('ranks aught sizes before every plain hook number, the bigger aught first', () => {
        expect(hookRank('6/0')).toBeLessThan(hookRank('1/0'));
        expect(hookRank('1/0')).toBeLessThan(hookRank('1'));
        expect(hookRank('1')).toBeLessThan(hookRank('24'));
    });

    it('reads the catalogue\'s spelling of aught sizes, 1-0, the same as 1/0 (both until ticket 18\'s rename)', () => {
        expect(hookRank('2-0')).toBe(hookRank('2/0'));
        expect(hookRank(' 3 / 0 ')).toBe(hookRank('3/0'));
    });

    it('ranks plain hook numbers by number, not as text', () => {
        expect(hookRank('8')).toBeLessThan(hookRank('10'));
        expect(hookRank('2')).toBeLessThan(hookRank('12'));
    });

    it('returns null for anything that isn\'t a hook size', () => {
        ['', '  ', 'Small', '#14', '14.5', '0', '0/0', '1/2', '10-12', 'Size 14', null, undefined].forEach(label => {
            expect(hookRank(label)).toBeNull();
        });
    });
});

describe('compareHookSizes', () => {
    it('puts a known size before an unknown value, and leaves two unknown values as they are', () => {
        expect(compareHookSizes('24', 'Assorted')).toBeLessThan(0);
        expect(compareHookSizes('Assorted', '6/0')).toBeGreaterThan(0);
        expect(compareHookSizes('Assorted', 'Mixed')).toBe(0);
    });

    it('sorts the aught sizes of ticket 41\'s cart case as 2/0, then 1/0, then 2', () => {
        expect(['2', '1/0', '2/0'].sort(compareHookSizes)).toEqual(['2/0', '1/0', '2']);
    });
});

describe('sortByHookOrder', () => {
    it('sorts a shuffled list of sizes into hook order', () => {
        const shuffled = ['14', '1', '2/0', '24', '6', '4/0', '10', '1/0', '20', '2', '6/0', '16', '8', '3/0', '22', '12', '5/0', '4', '18'];
        expect(sortByHookOrder(shuffled)).toEqual(HOOK_ORDER);
    });

    it('sorts the catalogue\'s out-of-order trout sizes (10, 12 … 20, 8) into 8, 10 … 20', () => {
        expect(sortByHookOrder(['10', '12', '14', '16', '18', '20', '8'])).toEqual(['8', '10', '12', '14', '16', '18', '20']);
    });

    it('keeps unknown values after the known sizes, in the order they came', () => {
        expect(sortByHookOrder(['Mixed', '14', 'Assorted', '2/0', 'Small'])).toEqual(['2/0', '14', 'Mixed', 'Assorted', 'Small']);
    });

    it('keeps two spellings of one size in the order they came', () => {
        expect(sortByHookOrder(['2', '1/0', '1-0'])).toEqual(['1/0', '1-0', '2']);
        expect(sortByHookOrder(['1-0', '1/0'])).toEqual(['1-0', '1/0']);
    });

    it('sorts any items by the label it reads from each, and returns them unchanged', () => {
        const items = [{ size: '12' }, { size: 'Assorted' }, { size: '3-0' }];
        const sorted = sortByHookOrder(items, item => item.size);
        expect(sorted.map(item => item.size)).toEqual(['3-0', '12', 'Assorted']);
        expect(sorted[0]).toBe(items[2]);
    });

    it('returns a new array and leaves the one it was given as it was', () => {
        const sizes = ['16', '12', '14'];
        expect(sortByHookOrder(sizes)).not.toBe(sizes);
        expect(sizes).toEqual(['16', '12', '14']);
    });

    it('returns an empty list for an empty list', () => {
        expect(sortByHookOrder([])).toEqual([]);
    });
});
