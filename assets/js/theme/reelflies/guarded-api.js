// Guards for the storefront API's callbacks (ticket 41; map.md's buying-path guards; story 68),
// shared with tickets 38, 43 and 44 (build pipeline 6.2).
//
// Stock calls read `response.data` before looking at the error, so a dropped connection throws a
// TypeError and leaves the loading overlay up (cornerstone-reassessment, the error-guard item).
// stencil-utils never checks the HTTP status either: a 4xx or 5xx answer, or a rate limit, comes
// back with no error, its body an HTML page or JSON with no data. So a guard hands a response on
// only when it is one of the two shapes a call that worked answers with:
//
// - JSON whose data.status is the call's own word for success: `status`, the cart calls' 'succeed'
//   or the coupon and gift certificate calls' 'success'. A call given its word fails when the
//   status is missing; with none given, either word passes. Any other status is a refused change,
//   and its errors are the store's words.
// - For a call given no word, with no status: data the call returned (option changes) or the
//   HTML it rendered (content).
//
// Anything else, an error, a missing or non-object response, or one with neither, fails with
// `fallback`, such as for a network failure.
//
// - guardedCallback(onSuccess, onFailure, { fallback, status }): a (err, response) callback for
//   utils.api.*. onFailure gets the store's own words (its errors, one per line) or `fallback`.
// - guardedApi(call, args, { fallback, status }): the same as a promise, for
//   `call(...args, callback)`.

const SUCCEEDED = ['succeed', 'success'];

const isObject = value => value !== null && typeof value === 'object';

export function guardedCallback(onSuccess, onFailure, { fallback = '', status } = {}) {
    return (err, response) => {
        if (err || !isObject(response)) return onFailure(fallback);
        const data = isObject(response.data) ? response.data : null;
        if (data && data.status !== undefined) {
            if (status ? data.status === status : SUCCEEDED.includes(data.status)) return onSuccess(response);
            const errors = Array.isArray(data.errors) ? data.errors.filter(Boolean) : [];
            return onFailure(errors.length ? errors.join('\n') : fallback);
        }
        if (!status && (data || typeof response.content === 'string')) return onSuccess(response);
        return onFailure(fallback);
    };
}

export function guardedApi(call, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        call(...args, guardedCallback(resolve, message => reject(new Error(message)), options));
    });
}
