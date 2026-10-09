// The cart page's ReelFlies module (ticket 41; spec module 18; stories 50 and 67), loaded with
// stock cart.js through page-modules.js.
//
// - Groups the lines by pattern on load (cart-groups.js) and again each time stock cart.js
//   renders the cart's content after a change, which it announces with the rf:cart-rendered
//   event (its hook in refreshContent).
// - Puts focus back on the control that was used: the re-render replaces the lines, so the
//   stepper or quantity field that had focus is gone (stock refocuses a stepper, and regrouping
//   would take that away). It finds the same line's same control, and failing that (the line was
//   removed) the cart's heading. cart.js sends the event last, after its own focus call.

import { applyCartGroups } from './cart-groups';

export const RENDERED_EVENT = 'rf:cart-rendered';

// The control a shopper last used in the lines, as a selector that finds it again.
export function controlSelector(target) {
    const control = target && target.closest ? target.closest('[data-cart-itemid]') : null;
    if (!control || !control.closest('[data-rf-cart-lines]')) return null;
    const id = control.getAttribute('data-cart-itemid');
    if (control.classList.contains('cart-remove')) return `[data-cart-itemid="${id}"].cart-remove`;
    const action = control.getAttribute('data-action');
    return action ? `[data-cart-itemid="${id}"][data-action="${action}"]` : `[data-cart-itemid="${id}"]`;
}

export function restoreFocus(selector, doc = document) {
    const target = (selector && doc.querySelector(selector)) || doc.querySelector('[data-cart-page-title] h1');
    if (!target) return;
    if (!target.matches('a, button, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
    target.focus();
}

export default {
    load(_context, doc = document) {
        applyCartGroups(doc);
        let used = null;
        const remember = event => {
            const selector = controlSelector(event.target);
            if (selector) used = selector;
        };
        doc.addEventListener('click', remember, true);
        doc.addEventListener('change', remember, true);
        doc.addEventListener(RENDERED_EVENT, () => {
            // Regrouping moves the lines, which takes focus off the one stock cart.js just focused.
            const active = doc.activeElement;
            applyCartGroups(doc);
            if (used) restoreFocus(used, doc);
            else if (active && active !== doc.body && active.isConnected) active.focus();
            used = null;
        });
    },
};
