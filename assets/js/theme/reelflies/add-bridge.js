// Between stock product-details.js and the add flow (ticket 38): the hooks in stock's add and
// option-change callbacks call these, and add-flow.js, its own chunk (page-modules.js), registers
// what they do when it loads. Stock imports only this file, so the add flow never joins stock's
// chunk, and with no flow loaded (Quick view, a failed chunk) stock carries on as it was.
//
// - addFinished(err, response, options): true when the add flow has taken the add's answer, so
//   stock's callback stops there; false lets stock open its modal as before.
// - optionChangeFailed(err, response): true when an option change failed, after the add flow has
//   said so; the pills stay usable, and stock's callback stops before it reads the answer.

const handlers = { add: null, option: null };

export function setAddHandlers({ add = null, option = null } = {}) {
    handlers.add = add;
    handlers.option = option;
}

export function addFinished(err, response, options = {}) {
    return handlers.add ? handlers.add(err, response, options) : false;
}

export function optionChangeFailed(err, response) {
    return handlers.option ? handlers.option(err, response) : false;
}
