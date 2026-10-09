// A cart change that failed, told once and in place (ticket 41; story 68).
//
// Stock cart.js read `response.data` before the error and showed a modal; its hooks now call
// cartFailed(err, response, options) first in each callback (CUSTOMIZATIONS.md). When the call
// failed (guarded-api.js decides), it:
// - runs `undo`, which clears the loading overlay and puts the line's last good quantity back
// - shows the store's words, or `fallback`, as an inline error on the line the control belongs to,
//   after a coupon or gift certificate form, or else above the lines, replacing any earlier one
// - announces them once in the shared live region (ticket 25)
// and returns true, so the stock callback stops there. Focus stays on the control that was used.

import { guardedCallback } from './guarded-api';
import { announce } from './live-region';

export const ERROR_SELECTOR = '[data-rf-cart-error]';

export function showCartError(message, anchor = null, doc = document) {
    doc.querySelectorAll(ERROR_SELECTOR).forEach(element => element.remove());
    const error = doc.createElement('p');
    error.className = 'rf-cart-error';
    error.setAttribute('data-rf-cart-error', '');
    error.textContent = message;
    const line = anchor && anchor.closest ? anchor.closest('[data-rf-cart-line]') : null;
    const row = line ? line.querySelector('.rf-cart-row') || line : null;
    if (row) {
        row.appendChild(error);
    } else if (anchor && anchor.isConnected) {
        (anchor.closest('form') || anchor).after(error);
    } else {
        const lines = doc.querySelector('[data-rf-cart-lines]');
        if (lines) lines.before(error);
        else doc.body.prepend(error);
    }
    announce(message, doc);
    return error;
}

export function cartFailed(err, response, { undo = () => {}, anchor = null, fallback = '' } = {}, doc = document) {
    let failed = false;
    guardedCallback(() => {}, message => {
        failed = true;
        undo();
        showCartError(message, anchor, doc);
    }, fallback)(err, response);
    return failed;
}
