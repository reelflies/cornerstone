// What a Playwright gate's browser may send (W0-6). fixtures.mjs installs this guard on every
// test's context, through context.route, before the test opens a page:
//
// - A request to an analytics host (analytics-hosts.mjs) is aborted, on every channel, unless
//   QA_ANALYTICS=allow lets the tags load on the prelaunch host.
// - On a live channel, 1 (reelflies.ca) or 1855224 (reelflies.com), and on any host but the
//   prelaunch host and a local stencil start, every request that isn't a GET, HEAD or OPTIONS
//   is refused: aborted, so it never reaches the store, and recorded, so the test fails at
//   teardown naming each one. stencil start passes every request to the live store, and
//   mocking cart endpoints one by one fails open: one missed endpoint makes a real guest cart.
//   The exceptions are the read-only POSTs and the gates' own answers in read-only-posts.mjs.
// - A request a test mocks itself (page.route, or a context.route added after the guard) is
//   answered by its mock and never reaches the guard. A mock that calls route.fallback()
//   hands the request back to the guard.
// - While the tags are blocked, a request to an analytics host that completes anyway (only a
//   route ahead of the guard can let one through) also fails the test at teardown, so a
//   blocked run can't quietly send one.

import { isAnalyticsUrl, isPrelaunchHost } from './analytics-hosts.mjs';
import { localAnswer, readOnlyPost } from './read-only-posts.mjs';

export const LIVE_CHANNELS = ['1', '1855224'];
const READS = ['GET', 'HEAD', 'OPTIONS'];

// Whether a run refuses writes: on a live channel, or on a host (QA_BASE_URL) that is neither
// the prelaunch host nor a local stencil start, whatever QA_CHANNEL says.
export function refusesWrites({ channel, storefront, local }) {
    return LIVE_CHANNELS.includes(String(channel)) || (!local && !isPrelaunchHost(storefront));
}

// What the guard does with one request: { action: 'block' } (an analytics request), 'refuse' (a
// write on a live channel), 'answer' with the LOCAL_ANSWERS entry, or 'pass' (on to the next
// route, and then the network).
export function requestAction(request, { blockAnalytics, refuseWrites, storefront }) {
    if (blockAnalytics && isAnalyticsUrl(request.url)) return { action: 'block' };
    if (!refuseWrites || READS.includes(request.method)) return { action: 'pass' };
    const answer = localAnswer(request, { storefront });
    if (answer) return { action: 'answer', answer };
    if (readOnlyPost(request, { storefront })) return { action: 'pass' };
    return { action: 'refuse' };
}

// Where a run refuses writes, and why: { name, why }.
function liveTarget({ channel, storefront }) {
    if (LIVE_CHANNELS.includes(String(channel))) return { name: `channel ${channel}`, why: 'is live' };
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
    blockAnalytics, refuseWrites, channel, storefront,
}) {
    const lines = [blockAnalytics
        ? 'ANALYTICS blocked: yes (scripts/qa/analytics-hosts.mjs; QA_ANALYTICS=allow lets them load on the prelaunch host only)'
        : 'ANALYTICS blocked: no (QA_ANALYTICS=allow, on the prelaunch host)'];
    if (refuseWrites) {
        const { name, why } = liveTarget({ channel, storefront });
        lines.push(`WRITES    refused: ${name} ${why}, so every request but a GET, HEAD or OPTIONS fails the test, apart from the read-only POSTs in scripts/qa/read-only-posts.mjs`);
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

// Routes every request of `context` through the guard. Resolves to the guard: what it
// blocked, answered and refused, and the analytics requests that completed while blocked, each
// as "METHOD URL"; assertNoRefusedWrites() and assertNoAnalyticsCompleted() throw naming each
// one (fixtures.mjs calls both at teardown).
//   channel         the channel the run renders (QA_CHANNEL)
//   storefront      the storefront under test, its base URL
//   local           whether that is a local stencil start
//   blockAnalytics  false only with QA_ANALYTICS=allow
export async function installNetworkGuard(context, {
    channel, storefront, local, blockAnalytics,
}) {
    const options = {
        blockAnalytics, refuseWrites: refusesWrites({ channel, storefront, local }), storefront,
    };
    const guard = {
        channel: String(channel),
        analyticsBlocked: blockAnalytics,
        refusesWrites: options.refuseWrites,
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
            const { name, why } = liveTarget({ channel, storefront });
            throw new Error(`The gates refused ${count} write${count > 1 ? 's' : ''} on ${name}, which ${why}, so none reached the store: ${guard.refused.join('; ')}. `
                + 'A gate never writes to a live store: mock it in the test (page.route), or, if it only reads, add it to scripts/qa/read-only-posts.mjs with the reason.');
        },
    };

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
