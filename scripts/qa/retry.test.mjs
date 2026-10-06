// When the gates ask the storefront again (scripts/qa/retry.mjs; W0-4):
//
// - A 5xx is asked once more after RETRY_DELAY_MS: stencil start's request to the store can
//   drop. A second 5xx is the answer.
// - A 429 is asked again up to three times: after its Retry-After when it sends one,
//   otherwise after 2, 4 and 8 s. A fourth 429 is the answer.
// - Any other status is the page's real answer and is never asked again.
// - A Retry-After that would take one request's waits past MAX_WAIT_MS isn't waited for.
//
//   node --test scripts/qa/retry.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_WAIT_MS, RATE_LIMIT_DELAYS_MS, RETRY_DELAY_MS, nextTry, retryAfterMs, withRetries,
} from './retry.mjs';

describe('the waits', () => {
    it('are 2 s after a 5xx, and 2, 4 and 8 s after a 429 without Retry-After', () => {
        assert.equal(RETRY_DELAY_MS, 2000);
        assert.deepEqual(RATE_LIMIT_DELAYS_MS, [2000, 4000, 8000]);
    });

    it('stay under the most the gates wait for one request, whatever mix of 5xx and 429 comes', () => {
        assert.ok(RETRY_DELAY_MS + RATE_LIMIT_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) <= MAX_WAIT_MS);
    });
});

describe('reading Retry-After', () => {
    const now = Date.parse('Tue, 06 Oct 2026 10:00:00 GMT');

    it('reads a number of seconds', () => {
        assert.equal(retryAfterMs('5', now), 5000);
        assert.equal(retryAfterMs(' 0 ', now), 0);
    });

    it('reads an HTTP date as the time left until then, and a date gone by as no wait', () => {
        assert.equal(retryAfterMs('Tue, 06 Oct 2026 10:00:07 GMT', now), 7000);
        assert.equal(retryAfterMs('Tue, 06 Oct 2026 09:59:00 GMT', now), 0);
    });

    it('ignores a missing or unreadable value', () => {
        [undefined, null, '', 'soon', '-5', '1.5'].forEach(value => assert.equal(retryAfterMs(value, now), null, String(value)));
    });
});

describe('after an answer', () => {
    it('asks a 5xx once more, after RETRY_DELAY_MS', () => {
        [500, 502, 503].forEach(status => {
            const next = nextTry(status);
            assert.equal(next.wait, RETRY_DELAY_MS, String(status));
            assert.equal(next.note, 'once more in 2 s (stencil start\'s request to the store can drop)');
        });
    });

    it('takes a second 5xx as the answer, even after a 429 between them', () => {
        assert.equal(nextTry(502, { earlier: [500] }), null);
        assert.equal(nextTry(500, { earlier: [500, 429] }), null);
    });

    it('asks a 5xx once more on its own schedule, whatever its Retry-After says', () => {
        assert.equal(nextTry(503, { retryAfter: '20' }).wait, RETRY_DELAY_MS);
    });

    it('asks a 429 with no Retry-After again after 2, 4 and 8 s, then takes the fourth as the answer', () => {
        const waits = [[], [429], [429, 429]].map(earlier => nextTry(429, { earlier }));
        assert.deepEqual(waits.map(({ wait }) => wait), [2000, 4000, 8000]);
        assert.deepEqual(waits.map(({ note }) => note), [
            'again in 2 s (retry 1 of 3; the store is limiting requests)',
            'again in 4 s (retry 2 of 3; the store is limiting requests)',
            'again in 8 s (retry 3 of 3; the store is limiting requests)',
        ]);
        assert.equal(nextTry(429, { earlier: [429, 429, 429] }), null);
    });

    it('waits for a 429\'s Retry-After when it sends one', () => {
        const next = nextTry(429, { retryAfter: '5', earlier: [429] });
        assert.equal(next.wait, 5000);
        assert.equal(next.note, 'again in 5 s, as its Retry-After asks (retry 2 of 3; the store is limiting requests)');
    });

    it('doesn\'t count a 5xx as one of a 429\'s three retries', () => {
        assert.equal(nextTry(429, { earlier: [500, 429, 429] }).wait, 8000);
    });

    it('doesn\'t wait for a Retry-After that would take the waits for one request past MAX_WAIT_MS, and says so', () => {
        const next = nextTry(429, { retryAfter: '120' });
        assert.equal(next.wait, undefined);
        assert.equal(next.giveUp, ', and its Retry-After asks for 120 s, which would take the waits for this request past the gates\' limit of 30 s, so it isn\'t asked again. The store is limiting requests; run the gates later.');
        assert.match(nextTry(429, { retryAfter: '10', waited: 25000 }).giveUp, /^, and its Retry-After asks for 10 s, which/);
        assert.equal(nextTry(429, { retryAfter: '5', waited: 25000 }).wait, 5000, 'exactly 30 s in all is still waited for');
    });

    it('says when the next step of the schedule, not a Retry-After, would pass MAX_WAIT_MS', () => {
        const next = nextTry(429, { earlier: [429, 429], waited: 25000 });
        assert.equal(next.wait, undefined);
        assert.match(next.giveUp, /^, and the next retry would wait 8 s, which would take the waits for this request past the gates' limit of 30 s/);
    });

    it('takes every other status as the answer', () => {
        [200, 301, 304, 400, 403, 404, 410, undefined].forEach(status => assert.equal(nextTry(status), null, String(status)));
    });
});

describe('asking with retries', () => {
    // A request whose answers are `statuses` in turn (each with `retryAfter`, if given), and
    // records what the loop does with them.
    function script(...answers) {
        const seen = {
            asked: 0, dropped: [], waits: [], lines: [],
        };
        const queue = answers.map(answer => (typeof answer === 'number' ? { status: answer } : answer));
        const options = {
            what: 'product /flies/',
            read: answer => answer,
            drop: answer => { seen.dropped.push(answer.status); },
            wait: async ms => { seen.waits.push(ms); },
            log: line => { seen.lines.push(line); },
        };
        const ask = async () => {
            seen.asked += 1;
            return queue.shift();
        };
        return { seen, ask, options };
    }

    it('resolves to the first answer that stands, without waiting or logging', async () => {
        const { seen, ask, options } = script(200);
        assert.equal((await withRetries(ask, options)).status, 200);
        assert.deepEqual(seen, {
            asked: 1, dropped: [], waits: [], lines: [],
        });
    });

    it('asks a 5xx once more, with a RETRY line, and frees the answer it drops', async () => {
        const { seen, ask, options } = script(500, 200);
        assert.equal((await withRetries(ask, options)).status, 200);
        assert.equal(seen.asked, 2);
        assert.deepEqual(seen.dropped, [500]);
        assert.deepEqual(seen.waits, [2000]);
        assert.deepEqual(seen.lines, ['RETRY    product /flies/ returned HTTP 500; fetching it once more in 2 s (stencil start\'s request to the store can drop)']);
    });

    it('resolves to the second 5xx', async () => {
        const { seen, ask, options } = script(500, 502, 200);
        assert.equal((await withRetries(ask, options)).status, 502);
        assert.equal(seen.asked, 2);
    });

    it('backs off a 429 at 2, 4 and 8 s, then resolves to the fourth 429', async () => {
        const { seen, ask, options } = script(429, 429, 429, 429, 200);
        assert.equal((await withRetries(ask, options)).status, 429);
        assert.equal(seen.asked, 4);
        assert.deepEqual(seen.waits, [2000, 4000, 8000]);
        assert.deepEqual(seen.dropped, [429, 429, 429]);
        assert.equal(seen.lines.length, 3);
        assert.match(seen.lines[2], /^RETRY {4}product \/flies\/ returned HTTP 429; fetching it again in 8 s \(retry 3 of 3; the store is limiting requests\)$/);
    });

    it('waits for a 429\'s Retry-After, then resolves to the 200', async () => {
        const { seen, ask, options } = script({ status: 429, retryAfter: '3' }, 200);
        assert.equal((await withRetries(ask, { ...options, verb: 'opening' })).status, 200);
        assert.deepEqual(seen.waits, [3000]);
        assert.deepEqual(seen.lines, ['RETRY    product /flies/ returned HTTP 429; opening it again in 3 s, as its Retry-After asks (retry 1 of 3; the store is limiting requests)']);
    });

    it('counts every wait toward MAX_WAIT_MS, and resolves to the 429 whose Retry-After would pass it, with a WARNING line', async () => {
        const { seen, ask, options } = script({ status: 429, retryAfter: '20' }, { status: 429, retryAfter: '20' }, 200);
        assert.equal((await withRetries(ask, options)).status, 429);
        assert.equal(seen.asked, 2);
        assert.deepEqual(seen.waits, [20000]);
        assert.deepEqual(seen.dropped, [429], 'the answer it resolves to is left for the caller to read');
        assert.match(seen.lines[1], /^WARNING {2}product \/flies\/ returned HTTP 429, and its Retry-After asks for 20 s, which would take the waits for this request past the gates' limit of 30 s/);
    });

    it('asks once more after a 5xx and up to three times after a 429, in any order', async () => {
        const { seen, ask, options } = script(429, 500, 429, 429, 200);
        assert.equal((await withRetries(ask, options)).status, 200);
        assert.deepEqual(seen.waits, [2000, 2000, 4000, 8000]);
    });
});
