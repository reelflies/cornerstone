// Between stock product-details.js and the add flow (ticket 38): the hooks in stock's add and
// option-change callbacks, and in product-details-base.js's sold-out pass, call these, and
// add-flow.js, its own chunk (page-modules.js), registers what they do when it loads. Stock
// imports only this file, so the add flow never joins stock's chunk.
//
// - addFinished(err, response, options): true when the add's answer has been taken, so stock's
//   callback stops there; false lets stock open its modal as before. With no flow loaded (Quick
//   view on a listing, or a chunk that failed) a failed add is still taken: stock would read the
//   answer's missing data first and leave the button frozen, so the button is usable again, the
//   overlay gone, and stock's alert says what the flow would have said.
// - optionChangeFailed(err, response, scope): true when an option change failed, after the flow
//   has said so in that scope's form; the pills stay usable, and stock's callback stops before it
//   reads the answer. With no flow, a failure still stops stock there, silently.
// - holdAddButton(button, held): true when the button is the flow's own (the product page's), whose
//   "can't be sold" state is aria-disabled rather than disabled, so its click reaches the flow,
//   which says why ("Size 14 is sold out."). Stock disables any other button as before.

import { showAlertModal } from '../global/modal';

const answered = (err, response) => !err && response && typeof response === 'object'
    && response.data && typeof response.data === 'object';

// What the hooks do with no flow loaded.
function noFlowAdd(err, response, { label, overlay, form } = {}) {
    if (answered(err, response)) return false;
    const button = form && form.querySelector('#form-action-addToCart');
    if (button) {
        button.disabled = false;
        if (label) button.value = label;
    }
    if (overlay && overlay.hide) overlay.hide();
    const words = form && form.querySelector('[data-rf-add]');
    showAlertModal((words && words.getAttribute('data-rf-error')) || String(err || ''));
    return true;
}

const noFlowOption = (err, response) => !answered(err, response);

const handlers = { add: null, option: null, holds: null };

export function setAddHandlers({ add = null, option = null, holds = null } = {}) {
    handlers.add = add;
    handlers.option = option;
    handlers.holds = holds;
}

export function addFinished(err, response, options = {}) {
    return (handlers.add || noFlowAdd)(err, response, options);
}

export function optionChangeFailed(err, response, scope = null) {
    return (handlers.option || noFlowOption)(err, response, scope);
}

export function holdAddButton(button, held) {
    if (!button || !handlers.holds || !handlers.holds(button)) return false;
    button.removeAttribute('disabled');
    if (held) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
    return true;
}
