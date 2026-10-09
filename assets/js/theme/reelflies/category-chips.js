// A category's chips, at most two rows (ticket 32; UX-5, CD-10; stories 22 and 71), loaded on the
// listing templates through page-modules.js.
//
// components/reelflies/category-chips.html prints every subcategory as a chip, then a hidden
// "more" chip. Until this runs, CSS clips the list to two rows (_category.scss), so laying it out
// moves nothing below it.
//
// - layoutChips: shows every chip; if they take more than two rows, it hides chips from the end
//   until the "more" chip fits at the end of the second row, and fills in its wide label, "+N
//   more", from the template's data-rf-more-label. Its narrow label, "Show all N", is the
//   template's. Then it marks the list laid out, which lifts the CSS clip.
// - Again whenever the list's width changes (a rotation, a resize) or the fonts arrive, until
//   the list is opened.
// - The "more" chip shows every chip, goes away, and moves focus to the first chip it showed.
// - Nothing is built: the links are the server's, hidden and shown with the hidden attribute.

export const LIST = '[data-rf-chips]';
const MORE = '[data-rf-chips-more]';
const WIDE_LABEL = '[data-rf-chips-more-wide]';
export const READY = 'data-rf-chips-ready';
export const OPEN = 'data-rf-chips-open';

const chipsOf = list => Array.from(list.children).filter(item => !item.matches(MORE));
const setHidden = (item, hidden) => item.toggleAttribute('hidden', hidden);

export function layoutChips(list) {
    if (list.hasAttribute(OPEN)) return;
    const more = list.querySelector(MORE);
    const chips = chipsOf(list);
    chips.forEach(chip => setHidden(chip, false));
    if (more) setHidden(more, true);
    const tops = Array.from(new Set(chips.map(chip => chip.offsetTop))).sort((a, b) => a - b);
    if (more && tops.length > 2) {
        const second = tops[1];
        chips.filter(chip => chip.offsetTop > second).forEach(chip => setHidden(chip, true));
        setHidden(more, false);
        const shown = chips.filter(chip => !chip.hidden);
        while (more.offsetTop > second && shown.length > 1) setHidden(shown.pop(), true);
        const button = more.querySelector('button');
        const wide = more.querySelector(WIDE_LABEL);
        const count = chips.filter(chip => chip.hidden).length;
        if (button && wide) wide.textContent = (button.getAttribute('data-rf-more-label') || '+# more').replace('#', count);
    }
    list.setAttribute(READY, '');
}

export function openChips(list) {
    const more = list.querySelector(MORE);
    const hidden = chipsOf(list).filter(chip => chip.hidden);
    hidden.forEach(chip => setHidden(chip, false));
    if (more) setHidden(more, true);
    list.setAttribute(OPEN, '');
    const first = hidden.length ? hidden[0].querySelector('a') : null;
    if (first) first.focus();
}

function watch(list, doc) {
    list.addEventListener('click', event => {
        if (event.target.closest(MORE)) openChips(list);
    });
    const view = doc.defaultView;
    if (view && view.ResizeObserver) {
        let width = list.clientWidth;
        new view.ResizeObserver(() => {
            if (list.clientWidth === width) return;
            width = list.clientWidth;
            layoutChips(list);
        }).observe(list);
    }
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(() => layoutChips(list));
}

export default {
    load(_context, doc = document) {
        doc.querySelectorAll(LIST).forEach(list => {
            layoutChips(list);
            watch(list, doc);
        });
    },
};
