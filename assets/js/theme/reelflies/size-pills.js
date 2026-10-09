// The size pills' states (ticket 37; spec module 16; O15, UX-10; stories 38 and 39), loaded on
// the product templates through page-modules.js, and for pills that Quick view or the cart's
// Change dialog renders in #modal (pills-in-modal.js, from the global modules).
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
// - The chosen value after the group's label, "Fly Sizes: 14", or the template's "choose one"; a
//   group of one value always names it.
// - A change to the line that follows the shopper's own choice (a colour that leaves other sizes
//   sold out) is said in ticket 25's live region; the line on load isn't.
//
// It watches the labels' class, so it needs no hook in stock's scripts and catches every change,
// whichever runs first. It never checks, unchecks or reorders a radio. Stock marks values this
// way under the store's "label" out-of-stock behaviour (label_option, a store-wide setting,
// pinned on 1895766); under "hide" stock removes them, and there's nothing to mark.

import { announce } from './live-region';

export const FIELD = '[data-rf-pills]';
const WATCHED = 'data-rf-pills-watched';
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

// Returns the sold-out line's text when it changed, else null.
export function updatePills(field) {
    let lineChanged = null;
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
        if (line.textContent !== text) {
            line.textContent = text;
            lineChanged = text;
        }
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
    return lineChanged;
}

// Keeps one group of pills up to date: now, on each choice anywhere in its form and on each
// change to stock's marks. Returns a function that stops it, which also runs by itself once the
// group has left the page (Quick view and the Change dialog replace theirs). A group already
// watched is left alone. Ticket 43's panel calls it for the pills it renders.
export function watchPills(field) {
    if (field.hasAttribute(WATCHED)) return () => {};
    field.setAttribute(WATCHED, '');
    const doc = field.ownerDocument;
    // The options' own changes are choices; the stepper's, in the same form, aren't.
    const scope = field.closest('[data-product-option-change]') || field.closest('form') || field;
    // The shopper's choices still waiting for stock's answer: a change to the line that comes while
    // any is pending answers one, and is said. Counted, so quick choices (arrowing through
    // swatches) each get their answer said, the last one last.
    let pending = 0;
    let observer = null;
    const update = () => {
        if (!field.isConnected) {
            unwatch(); // eslint-disable-line no-use-before-define
            return;
        }
        const line = updatePills(field);
        if (line && pending) announce(line, doc);
    };
    const onChoice = () => {
        pending += 1;
        update();
    };
    // Stock's own event after each option change it has applied (product-details.js).
    const onApplied = () => {
        update();
        pending = Math.max(0, pending - 1);
    };
    function unwatch() {
        scope.removeEventListener('change', onChoice);
        doc.removeEventListener('onProductOptionsChanged', onApplied);
        if (observer) observer.disconnect();
        field.removeAttribute(WATCHED);
    }
    updatePills(field);
    scope.addEventListener('change', onChoice);
    doc.addEventListener('onProductOptionsChanged', onApplied);
    observer = new doc.defaultView.MutationObserver(update);
    observer.observe(field, { subtree: true, attributes: true, attributeFilter: ['class'] });
    return unwatch;
}

export default {
    load(_context, doc = document) {
        doc.querySelectorAll(FIELD).forEach(watchPills);
    },
};
