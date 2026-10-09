// The cart page's ReelFlies module (ticket 41; spec module 18; stories 50 and 67), loaded with
// stock cart.js through page-modules.js.
//
// - Sorts each pattern's sizes into hook order on load (cart-groups.js) and again each time stock
//   cart.js renders the cart's content after a change, which it announces with RENDERED_EVENT
//   (cart-events.js; its hook at the end of refreshContent).
// - Puts focus back after a re-render, which replaces the lines and the summary:
//   - on the same line's same control (a stepper, the quantity field, Remove) when one was used;
//   - else on the cart's heading: the line went, or a coupon, gift certificate or options change
//     re-rendered the cart. Stock's own focus call goes to the last line control it saw used,
//     however long ago, so where it leaves focus doesn't count.
//   A failed call re-renders nothing and announces FAILED_EVENT, so the control is forgotten.

import { sortCartRows } from './cart-groups';
import { FAILED_EVENT, RENDERED_EVENT } from './cart-events';

const CONTROL = 'button[data-cart-itemid], input[data-cart-itemid]';
const HEADING = '[data-cart-page-title] h1';

// The line control a shopper used, as a selector that finds it again, or null for anything else.
export function controlSelector(target) {
    const control = target && target.closest ? target.closest(CONTROL) : null;
    if (!control || !control.closest('[data-rf-cart-lines]')) return null;
    const id = control.getAttribute('data-cart-itemid');
    if (control.classList.contains('cart-remove')) return `[data-cart-itemid="${id}"].cart-remove`;
    const action = control.getAttribute('data-action');
    return action ? `[data-cart-itemid="${id}"][data-action="${action}"]` : `[data-cart-itemid="${id}"]`;
}

export function restoreFocus(selector, doc = document) {
    const target = (selector && doc.querySelector(selector)) || doc.querySelector(HEADING);
    if (!target) return;
    if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus();
}

export default {
    load(_context, doc = document) {
        let used = null;
        // Any click or change sets it, so a later coupon or options change doesn't send focus
        // back to a stepper used before.
        const remember = event => {
            used = controlSelector(event.target);
        };
        doc.addEventListener('click', remember, true);
        doc.addEventListener('change', remember, true);
        doc.addEventListener(FAILED_EVENT, () => {
            used = null;
        });
        doc.addEventListener(RENDERED_EVENT, () => {
            try {
                sortCartRows(doc);
            } finally {
                restoreFocus(used, doc);
                used = null;
            }
        });
        // Last, so a group that throws can't stop the listeners above from being added.
        sortCartRows(doc);
    },
};
