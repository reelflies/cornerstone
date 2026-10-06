// What a Playwright gate's browser may send (W0-6). fixtures.mjs installs this guard on every
// test's context, through context.route, before the test opens a page:
//
// - A request to an analytics host (analytics-hosts.mjs) is aborted, on every channel, unless
//   QA_ANALYTICS=allow lets the tags load on the prelaunch host.
// - On a live channel, 1 (reelflies.ca) or 1855224 (reelflies.com), on any host but the
//   prelaunch host and a local stencil start, and on every channel from the Flip (when
//   ReelFlies_CA becomes live reelflies.ca), every write is refused: aborted, so it never
//   reaches the store, and recorded, so the test fails at teardown naming each one. A write is
//   any request but a GET, HEAD or OPTIONS, and the GETs that change the cart, a wish list or a
//   sign-in (GET_WRITES in read-only-posts.mjs: the stock card's "Add to cart" is a link).
//   stencil start passes every request to the live store, and mocking cart endpoints one by one
//   fails open: one missed endpoint makes a real guest cart. The exceptions are the read-only
//   POSTs and the gates' own answers in read-only-posts.mjs.
// - Playwright's request API never passes through context.route: the `request` fixture,
//   context.request, page.request (the same object) and route.fetch(). So the guard also checks
//   each of their calls before it is sent (guardRequestContext): a write it would refuse, or an
//   analytics URL it would block, throws instead, naming it, and a refused write also fails the
//   test at teardown.
// - A request a test mocks itself (page.route, or a context.route added after the guard) is
//   answered by its mock and never reaches the guard. A mock may only fulfill, abort or call
//   route.fallback(), which hands the request back to the guard. route.continue() sends it
//   straight to the network, past the guard, so a gate's own route never calls it.
// - While the tags are blocked, a request to an analytics host that completes anyway (only a
//   route ahead of the guard can let one through) also fails the test at teardown, so a
//   blocked run can't quietly send one.

import { isAfterFlip, isAnalyticsUrl, isPrelaunchHost } from './analytics-hosts.mjs';
import { getWrite, localAnswer, readOnlyPost } from './read-only-posts.mjs';

export const LIVE_CHANNELS = ['1', '1855224'];
const READS = ['GET', 'HEAD', 'OPTIONS'];

const isLive = channel => LIVE_CHANNELS.includes(String(channel));

// The channel a test is guarded as. A test's qaChannel option (test.use) can only make the
// guard stricter: on a run whose QA_CHANNEL is live, every test stays live, whatever its option
// says; on another run, a self-test may act as a live channel.
export function guardChannel(runChannel, testChannel = runChannel) {
    return String(isLive(runChannel) ? runChannel : testChannel ?? runChannel);
}

// Whether a run refuses writes: on a live channel, on a host (QA_BASE_URL) that is neither the
// prelaunch host nor a local stencil start whatever QA_CHANNEL says, and on every channel from
// the Flip. `flipped` is read from the release calendar when it isn't given.
export function refusesWrites({
    channel, storefront, local, flipped = isAfterFlip(),
}) {
    return Boolean(flipped) || isLive(channel) || (!local && !isPrelaunchHost(storefront));
}

// What the guard does with one request: { action: 'block' } (an analytics request), 'refuse' (a
// write on a live channel), 'answer' with the LOCAL_ANSWERS entry, or 'pass' (on to the next
// route, and then the network).
export function requestAction(request, { blockAnalytics, refuseWrites, storefront }) {
    if (blockAnalytics && isAnalyticsUrl(request.url)) return { action: 'block' };
    if (!refuseWrites) return { action: 'pass' };
    if (getWrite(request)) return { action: 'refuse' };
    if (READS.includes(request.method)) return { action: 'pass' };
    const answer = localAnswer(request, { storefront });
    if (answer) return { action: 'answer', answer };
    if (readOnlyPost(request, { storefront })) return { action: 'pass' };
    return { action: 'refuse' };
}

// Where a run refuses writes, and why: { name, why }.
function liveTarget({ channel, storefront, flipped }) {
    if (isLive(channel)) return { name: `channel ${channel}`, why: 'is live' };
    if (flipped) return { name: `channel ${channel}`, why: 'is live reelflies.ca from the Flip on' };
    let name = storefront;
    try {
        name = new URL(storefront).origin;
    } catch {
        // not a URL: name it as given
    }
    return { name, why: "isn't the prelaunch host" };
}

// The lines a run prints before its first test (global-setup.mjs).
export function guardNotice({
    blockAnalytics, refuseWrites, channel, storefront, flipped = false,
}) {
    const lines = [blockAnalytics
        ? 'ANALYTICS blocked: yes (scripts/qa/analytics-hosts.mjs; QA_ANALYTICS=allow lets them load on the prelaunch host only)'
        : 'ANALYTICS blocked: no (QA_ANALYTICS=allow, on the prelaunch host)'];
    if (refuseWrites) {
        const { name, why } = liveTarget({ channel, storefront, flipped });
        lines.push(`WRITES    refused: ${name} ${why}, so every write fails the test: every request but a GET, HEAD or OPTIONS, the GETs that change the cart, a wish list or a sign-in (GET_WRITES), and Playwright request API writes. The exceptions are the read-only POSTs (scripts/qa/read-only-posts.mjs).`);
    }
    return lines;
}

// A request the page has closed on can't be answered any more; the guard has nothing to do then.
const settle = async answer => {
    try {
        await answer();
    } catch {
        // the page, context or browser has closed
    }
};

// The request an APIRequestContext call would send, as { method, url, postData }, from the
// options its _innerFetch gets: { url } or { request } (route.fetch), with method, params and
// data. `params` joins the URL's query, so a GET write in params is seen too.
function apiRequest(options, baseURL) {
    const method = String(options.method || options.request?.method() || 'GET').toUpperCase();
    const target = options.url !== undefined ? options.url : options.request?.url();
    let url;
    try {
        url = new URL(target, baseURL || undefined);
    } catch {
        return { method, url: String(target), postData: null };
    }
    const { params } = options;
    if (params) {
        const extra = typeof params === 'string' || params instanceof URLSearchParams
            ? new URLSearchParams(params)
            : new URLSearchParams(Object.entries(params).map(([name, value]) => [name, String(value)]));
        extra.forEach((value, name) => url.searchParams.append(name, value));
    }
    let postData = null;
    if (typeof options.data === 'string') {
        postData = options.data;
    } else if (Buffer.isBuffer(options.data)) {
        postData = options.data.toString('utf8');
    } else if (options.data !== undefined) {
        postData = JSON.stringify(options.data);
    } else if (!options.form && !options.multipart) {
        try {
            postData = options.request?.postData() ?? null;
        } catch {
            // a body that isn't text: no read-only POST has one
        }
    }
    return { method, url: url.href, postData };
}

const GUARDED = Symbol('rf network guard');

// Guards a Playwright APIRequestContext with `guard`: the `request` fixture, or context.request,
// which is also page.request and what route.fetch() sends through. Every call (get, post,
// fetch and the rest) goes through its _innerFetch in Playwright 1.59, which package.json pins;
// harness-selftest.spec.mjs proves the hook on that version, and a version without it stops the
// run here rather than leave the request API unguarded. A request the guard would refuse,
// answer itself or block throws instead of being sent; a refused one also fails the test at
// teardown. Guards each object once.
export function guardRequestContext(api, guard, { baseURL } = {}) {
    if (typeof api?._innerFetch !== 'function') {
        throw new Error("The network guard can't check Playwright's request API: its APIRequestContext has no _innerFetch in this Playwright version, so a write through it would reach the store unchecked. Update guardRequestContext in scripts/qa/network-guard.mjs.");
    }
    if (api[GUARDED]) return api;
    const innerFetch = api._innerFetch.bind(api);
    api._innerFetch = async (options = {}) => { // eslint-disable-line no-param-reassign
        const request = apiRequest(options, baseURL);
        const { action } = requestAction(request, guard.options);
        if (action === 'pass') return innerFetch(options);
        const line = `${request.method} ${request.url}`;
        if (action === 'block') {
            guard.blocked.push(line);
            throw new Error(`the network guard blocked ${line}: it is an analytics host (scripts/qa/analytics-hosts.mjs), and this run blocks the tags`);
        }
        // The gates' own answers are for the page; through the request API they are refused.
        guard.refused.push(line);
        const { name, why } = liveTarget(guard.options);
        throw new Error(`the network guard refused ${line}, because ${name} ${why}: Playwright's request API never sends a write to a live store. Mock the page's request with page.route instead.`);
    };
    api[GUARDED] = true; // eslint-disable-line no-param-reassign
    return api;
}

// Routes every request of `context` through the guard, and guards its request API
// (context.request, page.request, route.fetch). Resolves to the guard: what it blocked,
// answered and refused, and the analytics requests that completed while blocked, each as
// "METHOD URL"; assertNoRefusedWrites() and assertNoAnalyticsCompleted() throw naming each one
// (fixtures.mjs calls both at teardown).
//   channel         the channel the test is guarded as (guardChannel)
//   storefront      the storefront under test, its base URL
//   local           whether that is a local stencil start
//   blockAnalytics  false only with QA_ANALYTICS=allow
//   flipped         whether the Flip has passed; read from the release calendar when not given
export async function installNetworkGuard(context, {
    channel, storefront, local, blockAnalytics, flipped = isAfterFlip(),
}) {
    const options = {
        blockAnalytics,
        refuseWrites: refusesWrites({
            channel, storefront, local, flipped,
        }),
        storefront,
        channel: String(channel),
        flipped: Boolean(flipped),
    };
    const guard = {
        channel: String(channel),
        analyticsBlocked: blockAnalytics,
        refusesWrites: options.refuseWrites,
        options,
        blocked: [],
        answered: [],
        refused: [],
        completed: [],
        assertNoAnalyticsCompleted() {
            if (!guard.completed.length) return;
            const count = guard.completed.length;
            throw new Error(`${count} request${count > 1 ? 's' : ''} to an analytics host completed although this run blocks them: ${guard.completed.join('; ')}. `
                + 'A route ahead of the network guard let it through, such as a mock in the test: remove it, or answer analytics requests with route.fallback().');
        },
        assertNoRefusedWrites() {
            if (!guard.refused.length) return;
            const count = guard.refused.length;
            const { name, why } = liveTarget(options);
            throw new Error(`The gates refused ${count} write${count > 1 ? 's' : ''} on ${name}, which ${why}, so none reached the store: ${guard.refused.join('; ')}. `
                + 'A gate never writes to a live store: mock it in the test (page.route), or, if it only reads, add it to scripts/qa/read-only-posts.mjs with the reason.');
        },
    };
    guardRequestContext(context.request, guard, { baseURL: storefront });

    // Any answer counts, even one the browser then fails to read (an opaque 204, say): the
    // request reached whatever answered it.
    context.on('response', response => {
        if (blockAnalytics && isAnalyticsUrl(response.url())) guard.completed.push(`${response.request().method()} ${response.url()}`);
    });
    await context.route('**/*', async route => {
        const request = route.request();
        const method = request.method();
        const url = request.url();
        let postData = null;
        try {
            postData = request.postData();
        } catch {
            // a body that isn't text: no read-only POST has one
        }
        const { action, answer } = requestAction({ method, url, postData }, options);
        const line = `${method} ${url}`;
        if (action === 'block') {
            guard.blocked.push(line);
            return settle(() => route.abort('blockedbyclient'));
        }
        if (action === 'answer') {
            guard.answered.push(line);
            return settle(() => route.fulfill(answer.response));
        }
        if (action === 'refuse') {
            guard.refused.push(line);
            return settle(() => route.abort('accessdenied'));
        }
        return settle(() => route.fallback());
    });
    return guard;
}
