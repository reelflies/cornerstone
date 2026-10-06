// When the storefront gates ask for a page again (ticket 16; W0-4). One policy for every
// request a gate makes: the pinned pages (fixtures.mjs, raw-html.mjs) and the check of
// what a running stencil start renders (`?debug=context`, storefront.mjs).
//
// - A 5xx is asked once more, after RETRY_DELAY_MS. stencil start proxies each page to the
//   store, and a dropped upstream connection ("AxiosError: stream has been aborted" in
//   stencil-cli's renderer.module.js) makes that one request answer 5xx. A second 5xx is
//   the answer.
// - A 429 is asked again up to three times: after its Retry-After when it sends one, and
//   otherwise after 2, 4 and 8 s (RATE_LIMIT_DELAYS_MS). Parallel agents proxy many pages
//   to the live stores at once, so a store can limit them. A fourth 429 is the answer.
// - A wait that would take the waits for one request past MAX_WAIT_MS isn't waited for:
//   the 429 is the answer, and a WARNING line says why. Only a long Retry-After can get
//   there, since the schedule alone waits 16 s at most. A Playwright test has 90 s in all,
//   and a store that asks for longer is saying to run the gates later.
// - Every other status is the page's real answer and is never asked again: a 4xx, or a 200
//   where a 404 belongs.
//
// Each retry prints a RETRY line first, so a run that passed after one is visible.

import { setTimeout as pause } from 'timers/promises';

export const RETRY_DELAY_MS = 2000;
export const RATE_LIMIT_DELAYS_MS = [2000, 4000, 8000];
export const MAX_WAIT_MS = 30000;

const isServerError = status => status >= 500;
const seconds = ms => `${Number((ms / 1000).toFixed(1))} s`;

// The IMF-fixdate form of an HTTP date, "Tue, 06 Oct 2026 10:00:07 GMT". Date.parse alone
// would take almost any text with a number in it ("Later 5") for a date long gone.
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

// A Retry-After header in ms: delay-seconds, or an HTTP date (the time left until then, 0
// once it has passed). null when it is missing or can't be read.
export function retryAfterMs(value, now = Date.now()) {
    const text = String(value ?? '').trim();
    if (/^\d+$/.test(text)) return Number(text) * 1000;
    const date = HTTP_DATE.test(text) ? Date.parse(text) : NaN;
    return Number.isNaN(date) ? null : Math.max(0, date - now);
}

// What follows an answer with `status`, given the statuses `earlier` answered to the same
// request and the ms already `waited` for it:
//   null              the answer stands
//   { wait, note }    ask again after `wait` ms; `note` ends the RETRY line
//   { giveUp }        the answer stands, and `giveUp` ends the WARNING line that says why
export function nextTry(status, {
    retryAfter = null, earlier = [], waited = 0, now = Date.now(),
} = {}) {
    if (isServerError(status)) {
        if (earlier.some(isServerError)) return null;
        return { wait: RETRY_DELAY_MS, note: `once more in ${seconds(RETRY_DELAY_MS)} (stencil start's request to the store can drop)` };
    }
    if (status !== 429) return null;

    const retry = earlier.filter(earlierStatus => earlierStatus === 429).length + 1;
    if (retry > RATE_LIMIT_DELAYS_MS.length) return null;
    const asked = retryAfterMs(retryAfter, now);
    const wait = asked ?? RATE_LIMIT_DELAYS_MS[retry - 1];
    if (waited + wait > MAX_WAIT_MS) {
        const reason = asked === null ? `the next retry would wait ${seconds(wait)}` : `its Retry-After asks for ${seconds(wait)}`;
        return {
            giveUp: `, and ${reason}, which would take the waits for this request past the gates' limit of ${seconds(MAX_WAIT_MS)}, so it isn't asked again. The store is limiting requests; run the gates later.`,
        };
    }
    const why = `retry ${retry} of ${RATE_LIMIT_DELAYS_MS.length}; the store is limiting requests`;
    return { wait, note: `again in ${seconds(wait)}${asked === null ? '' : ', as its Retry-After asks'} (${why})` };
}

// Asks for something with `ask` until its answer stands (nextTry), and resolves to that
// answer. The caller reads it as it does any answer: a status that still isn't the one it
// wants fails there, naming the status.
//
//   what   names the request in the log, as "product /flies/" or "the cart page /cart.php"
//   verb   how it is asked: 'fetching' (the default) or 'opening'
//   read   answer -> { status, retryAfter }
//   drop   frees an answer that is asked again, such as a fetch body (optional)
//   wait, log   for tests; the defaults wait for real and print to the console
export async function withRetries(ask, {
    what, verb = 'fetching', read, drop = () => {}, wait = pause, log = console.log,
}) {
    const attempt = async (earlier, waited) => {
        const answer = await ask();
        const { status, retryAfter } = read(answer);
        const next = nextTry(status, { retryAfter, earlier, waited });
        if (next?.giveUp) log(`WARNING  ${what} returned HTTP ${status}${next.giveUp}`);
        if (!next || next.giveUp) return answer;

        log(`RETRY    ${what} returned HTTP ${status}; ${verb} it ${next.note}`);
        await drop(answer);
        await wait(next.wait);
        return attempt([...earlier, status], waited + next.wait);
    };
    return attempt([], 0);
}

// withRetries for a fetch() of `url`.
export function fetchWithRetries(url, init, options) {
    return withRetries(() => fetch(url, init), {
        ...options,
        read: response => ({ status: response.status, retryAfter: response.headers.get('retry-after') }),
        drop: response => response.arrayBuffer(),
    });
}
