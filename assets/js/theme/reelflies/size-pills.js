// The size pills' states (ticket 37; spec module 16; O15, UX-10; stories 38 and 39), loaded on
// the product templates through page-modules.js.
//
// Stock's product scripts drive the options (components/reelflies/size-pills.html keeps their
// radios and labels): a chosen pill checks its radio, and each option-change answer marks every
// value stock can't sell for the current choices with the class `unavailable`, on load from
// BCData and after each change (product-details-base.js, updateProductAttributes). So on a
// product with a colour and sizes, only the sizes out in the chosen colour are marked. This
// follows those marks:
//
// - A sold-out pill: aria-disabled on its radio, and "(sold out)" in its name (its hidden span
//   shown). The strike is _size-pills.scss's, on stock's class.
// - The line under the pills names them: "Size 8 is sold out.", "Sizes 14 and 16 are sold
//   out.", from the words on the line's data attributes; empty when none is.
// - The chosen value after the group's label, "Fly size: 14", or the template's "choose one"; a
//   group of one value always names it.
//
// It watches the labels' class, so it needs no hook in stock's scripts and catches every change,
// whichever runs first. It never checks, unchecks or reorders a radio.

export const FIELD = '[data-rf-pills]';
const PILL = '[data-product-attribute-value]';
const UNAVAILABLE = 'unavailable';

const valueOf = label => (label.querySelector('.form-option-variant') || label).textContent.trim();

// "Size 8 is sold out." or "Sizes 6, 14 and 16 are sold out.": `one` and `many` hold a # where
// the sizes go.
export function soldOutLine(sizes, { one = '', many = '', and = 'and' } = {}) {
    if (!sizes.length) return '';
    const list = sizes.length === 1 ? sizes[0] : `${sizes.slice(0, -1).join(', ')} ${and} ${sizes[sizes.length - 1]}`;
    return (sizes.length === 1 ? one : many).replace('#', list);
}

export function updatePills(field) {
    const soldOut = [];
    field.querySelectorAll(PILL).forEach(label => {
        const out = label.classList.contains(UNAVAILABLE);
        const radio = label.control;
        if (radio && out) radio.setAttribute('aria-disabled', 'true');
        else if (radio) radio.removeAttribute('aria-disabled');
        const tag = label.querySelector('[data-rf-sold-out-tag]');
        if (tag) tag.hidden = !out;
        if (out) soldOut.push(valueOf(label));
    });

    const line = field.querySelector('[data-rf-sold-out-line]');
    if (line) {
        const text = soldOutLine(soldOut, {
            one: line.getAttribute('data-rf-one'), many: line.getAttribute('data-rf-many'), and: line.getAttribute('data-rf-and'),
        });
        if (line.textContent !== text) line.textContent = text;
    }

    const value = field.querySelector('[data-option-value]');
    if (value) {
        // A group of one value always names it (the server checks it); stock's scripts can leave
        // it unchecked for a moment while they settle a sold-out default.
        // Array.from, never [...nodeList]: the theme's Babel is loose (babel.config.js).
        const radios = Array.from(field.querySelectorAll('input[type="radio"]')).filter(radio => radio.value);
        const checked = radios.length === 1 ? radios[0] : radios.find(radio => radio.checked);
        const label = checked && checked.labels && checked.labels[0];
        const text = label ? valueOf(label) : (value.getAttribute('data-rf-pills-placeholder') || '');
        if (value.textContent !== text) value.textContent = text;
    }
}

// Keeps one group of pills up to date: now, on each choice and on each change to stock's marks.
// Ticket 43's panel calls it for the pills it renders.
export function watchPills(field) {
    const doc = field.ownerDocument;
    updatePills(field);
    field.addEventListener('change', () => updatePills(field));
    // Stock's own event after each option change it has applied (product-details.js).
    doc.addEventListener('onProductOptionsChanged', () => updatePills(field));
    new doc.defaultView.MutationObserver(() => updatePills(field))
        .observe(field, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

export default {
    load(_context, doc = document) {
        doc.querySelectorAll(FIELD).forEach(watchPills);
    },
};
