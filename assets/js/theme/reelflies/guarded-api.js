// Guards for the storefront API's callbacks (ticket 41; map.md's buying-path guards; story 68),
// shared with tickets 38, 43 and 44 (build pipeline 6.2).
//
// Stock calls read `response.data` before looking at the error, so a dropped connection throws a
// TypeError and leaves the loading overlay up (cornerstone-reassessment, the error-guard item). A
// guard checks the error first, then a refused change (a `data.status` other than the cart calls'
// 'succeed' or the coupon and gift certificate calls' 'success'), and only then hands the
// response on.
//
// - guardedCallback(onSuccess, onFailure, fallback): a (err, response) callback for utils.api.*.
//   onFailure gets the store's own words (its errors, one per line) or `fallback` when there are
//   none, such as a network failure.
// - guardedApi(call, args, { fallback }): the same as a promise, for `call(...args, callback)`.

const SUCCEEDED = ['succeed', 'success'];

export function guardedCallback(onSuccess, onFailure, fallback = '') {
    return (err, response) => {
        if (err || !response) return onFailure(fallback);
        const data = response.data || {};
        if (data.status && !SUCCEEDED.includes(data.status)) {
            const errors = Array.isArray(data.errors) ? data.errors.filter(Boolean) : [];
            return onFailure(errors.length ? errors.join('\n') : fallback);
        }
        return onSuccess(response);
    };
}

export function guardedApi(call, args = [], { fallback = '' } = {}) {
    return new Promise((resolve, reject) => {
        call(...args, guardedCallback(resolve, message => reject(new Error(message)), fallback));
    });
}
