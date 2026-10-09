import chipsModule, {
    LIST, OPEN, READY, layoutChips, openChips,
} from '../../../theme/reelflies/category-chips';

// jsdom lays nothing out, so offsetTop comes from a stand-in flow layout: each visible <li> of a
// chip list is data-w pixels wide, in a row of the list's data-width with 8px gaps, wrapping as
// flex-wrap does. A row is 40px tall.
const GAP = 8;
const ROW = 40;
function fakeTop(item) {
    const list = item.parentElement;
    if (!list || !list.matches(LIST)) return 0;
    const width = Number(list.dataset.width);
    let x = 0;
    let row = 0;
    for (const child of Array.from(list.children)) {
        if (!child.hidden) {
            const w = Number(child.dataset.w);
            if (x > 0 && x + w > width) {
                row += 1;
                x = 0;
            }
            if (child === item) return row * ROW;
            x += w + GAP;
        }
    }
    return 0;
}

let original;
beforeAll(() => {
    original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop');
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', { configurable: true, get() { return fakeTop(this); } });
});
afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', original);
});

// A chip list as category-chips.html prints it: chips of the given widths, then the "more" chip.
function chipList(widths, { width = 600, more = 100 } = {}) {
    document.body.innerHTML = `
        <ul class="rf-chips" data-rf-chips data-width="${width}">
            ${widths.map((w, i) => `<li class="rf-chips-item" data-w="${w}"><a class="rf-chip" href="/c${i}/">Chip ${i}</a></li>`).join('')}
            <li class="rf-chips-item rf-chips-more" data-rf-chips-more data-w="${more}" hidden>
                <button type="button" data-rf-more-label="+# more"><span data-rf-chips-more-wide></span><span>Show all ${widths.length}</span></button>
            </li>
        </ul>`;
    return document.querySelector(LIST);
}
const chips = list => Array.from(list.querySelectorAll('li:not([data-rf-chips-more])'));
const moreItem = list => list.querySelector('[data-rf-chips-more]');
const rows = list => new Set(Array.from(list.children).filter(item => !item.hidden).map(item => item.offsetTop)).size;

describe('layoutChips', () => {
    it('leaves chips that fit in two rows alone, with no "more" chip', () => {
        const list = chipList([200, 200, 180, 200, 200]); // 2 rows at 600px
        layoutChips(list);
        expect(chips(list).every(chip => !chip.hidden)).toBe(true);
        expect(moreItem(list).hidden).toBe(true);
        expect(list.hasAttribute(READY)).toBe(true);
    });

    it('hides the chips past the second row, and ends the second row with "+N more"', () => {
        const list = chipList([150, 150, 150, 150, 150, 150, 150, 150, 150, 150], { more: 100 }); // 3 a row
        layoutChips(list);
        expect(rows(list)).toBe(2);
        // Row 2 holds chips 3-5 and the 100px "more" chip: 3 x 158 + 100 = 574 ≤ 600.
        expect(chips(list).map(chip => chip.hidden)).toEqual([false, false, false, false, false, false, true, true, true, true]);
        expect(moreItem(list).hidden).toBe(false);
        expect(moreItem(list).offsetTop).toBe(ROW);
        expect(moreItem(list).querySelector('[data-rf-chips-more-wide]').textContent).toBe('+4 more');
    });

    it('hides one more chip when the "more" chip doesn\'t fit beside the last', () => {
        const list = chipList([150, 150, 150, 150, 150, 150, 150, 150, 150, 150], { more: 140 }); // 3 x 158 + 140 > 600
        layoutChips(list);
        expect(chips(list).filter(chip => chip.hidden)).toHaveLength(5);
        expect(moreItem(list).offsetTop).toBe(ROW);
        expect(moreItem(list).textContent).toContain('+5 more');
    });

    it('keeps every link in the list, hidden or not', () => {
        const list = chipList(Array(12).fill(250));
        layoutChips(list);
        expect(list.querySelectorAll('a')).toHaveLength(12);
    });

    it('lays out again for a new width, showing what fits', () => {
        const list = chipList(Array(10).fill(150));
        layoutChips(list);
        list.dataset.width = '2000';
        layoutChips(list);
        expect(chips(list).every(chip => !chip.hidden)).toBe(true);
        expect(moreItem(list).hidden).toBe(true);
    });
});

describe('openChips', () => {
    it('shows every chip, drops the "more" chip and puts focus on the first chip it showed', () => {
        const list = chipList(Array(10).fill(150));
        layoutChips(list);
        const firstHidden = chips(list).find(chip => chip.hidden);
        openChips(list);
        expect(chips(list).every(chip => !chip.hidden)).toBe(true);
        expect(moreItem(list).hidden).toBe(true);
        expect(document.activeElement).toBe(firstHidden.querySelector('a'));
        expect(list.hasAttribute(OPEN)).toBe(true);
    });

    it('stays open: a later layout hides nothing', () => {
        const list = chipList(Array(10).fill(150));
        layoutChips(list);
        openChips(list);
        layoutChips(list);
        expect(chips(list).every(chip => !chip.hidden)).toBe(true);
    });
});

describe('the page module', () => {
    it('lays out every chip list, and the "more" chip opens its list', () => {
        const list = chipList(Array(10).fill(150));
        chipsModule.load({}, document);
        expect(list.hasAttribute(READY)).toBe(true);
        moreItem(list).querySelector('button').click();
        expect(list.hasAttribute(OPEN)).toBe(true);
    });
});
