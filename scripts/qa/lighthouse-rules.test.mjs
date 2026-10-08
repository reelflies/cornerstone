// Ticket 17's Lighthouse rules (scripts/qa/lighthouse-rules.mjs): the metrics read from a
// Lighthouse result, the median of three runs, the five budgets, the drop rule, the URL lists
// and the history the drop rule compares with.
//
// The fixtures in lighthouse-fixtures/ are real Lighthouse 12.8.1 results (mobile, the repo's
// lighthouse-config.js) of a local stencil start of 1895766, trimmed to the fields the rules read.
//
//   node --test scripts/qa/lighthouse-rules.test.mjs

import fs from 'fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUDGETS, DROP_LIMIT, LIGHTHOUSE_KINDS, RUNS_PER_URL, addToHistory, analyticsRequests, budgetResults, channelUrls, comparisonPoint,
    emptyHistory, historyProblems, judgeUrl, lighthouseReleaseLines, median, medianMetrics, metricsOf, urlListProblems,
} from './lighthouse-rules.mjs';
import { CHANNELS } from './pages.mjs';

const fixture = name => JSON.parse(fs.readFileSync(new URL(`lighthouse-fixtures/${name}.json`, import.meta.url), 'utf8'));
// The home fixture with its performance score set, as Lighthouse reports it (0 to 1).
const withPerformance = (lhr, score) => ({ ...lhr, categories: { ...lhr.categories, performance: { ...lhr.categories.performance, score } } });
const HOME = fixture('home');
const SEARCH = fixture('search');
const UUID = '174ad580-a42a-013f-3c01-06627e5707c7';

const point = (performance, extra = {}) => ({
    at: '2026-10-06T14:30:00.000Z',
    source: 'run',
    theme: UUID,
    commit: 'a30586f5913f2ae391729c9fe0c05885e8712326',
    medians: {
        performance, accessibility: 100, lcpMs: 2000, cls: 0.01, tbtMs: 100, jsBytes: 1, cssBytes: 1,
    },
    ...extra,
});

describe('the metrics of one run', () => {
    it('reads the five budget metrics and the JS and CSS bytes from a real result', () => {
        assert.deepEqual(metricsOf(HOME), {
            performance: 89,
            accessibility: 100,
            lcpMs: 3077,
            cls: 0,
            tbtMs: 88,
            jsBytes: 474688,
            cssBytes: 93760,
            accessibilityFailures: [],
        });
    });

    it('names the accessibility audits that cost points', () => {
        const metrics = metricsOf(SEARCH);
        assert.equal(metrics.accessibility, 99);
        assert.deepEqual(metrics.accessibilityFailures, ['heading-order']);
        assert.equal(metrics.cls, 0.096);
    });

    it('refuses a run Lighthouse couldn\'t finish, naming its error', () => {
        const failed = {
            ...HOME,
            runtimeError: { code: 'ERRORED_DOCUMENT_REQUEST', message: 'Lighthouse was unable to reliably load the page you requested. (Status code: 503)' },
            categories: { ...HOME.categories, performance: { id: 'performance', score: null } },
        };
        assert.throws(() => metricsOf(failed), /ERRORED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page you requested\. \(Status code: 503\)/);
        assert.throws(() => metricsOf(withPerformance(HOME, null)), /no performance score/);
    });
});

describe('the median of three runs (story 78)', () => {
    it('gives 91 for runs of 88, 91 and 93, in any order', () => {
        const runs = [0.88, 0.91, 0.93].map(score => metricsOf(withPerformance(HOME, score)));
        assert.equal(medianMetrics(runs).performance, 91);
        assert.equal(medianMetrics([runs[2], runs[0], runs[1]]).performance, 91);
        assert.equal(RUNS_PER_URL, 3);
    });

    it('takes each metric\'s own median', () => {
        const run = (performance, lcpMs, cls, tbtMs) => ({
            performance, lcpMs, cls, tbtMs,
        });
        const runs = [run(88, 2600, 0.01, 300), run(93, 2100, 0.2, 100), run(91, 2400, 0.03, 150)];
        assert.deepEqual(medianMetrics(runs), {
            performance: 91, lcpMs: 2400, cls: 0.03, tbtMs: 150,
        });
        assert.equal(median([4, 1, 2, 3]), 2.5);
        assert.throws(() => median([]), /no runs/);
    });
});

describe('the budgets (stories 68, 70, 78)', () => {
    const passing = {
        performance: 90, accessibility: 100, lcpMs: 2500, cls: 0.05, tbtMs: 200, jsBytes: 1, cssBytes: 1, accessibilityFailures: [],
    };

    it('are performance 90, LCP 2.5 s, CLS 0.05, TBT 200 ms and accessibility 100, each limit itself passing', () => {
        assert.deepEqual(BUDGETS.map(({ metric, min, max }) => [metric, min ?? max]), [
            ['performance', 90], ['lcpMs', 2500], ['cls', 0.05], ['tbtMs', 200], ['accessibility', 100],
        ]);
        assert.deepEqual(budgetResults(passing).filter(result => !result.ok), []);
    });

    it('fails a median past any one of them, naming the URL and the metric', () => {
        const cases = [
            [{ performance: 89 }, 'search `/search.php?search_query=adams`: performance 89, below the budget of 90'],
            [{ lcpMs: 2501 }, 'search `/search.php?search_query=adams`: LCP 2.50 s, over the budget of 2.50 s'],
            [{ cls: 0.051 }, 'search `/search.php?search_query=adams`: CLS 0.051, over the budget of 0.050'],
            [{ tbtMs: 201 }, 'search `/search.php?search_query=adams`: TBT 201 ms, over the budget of 200 ms'],
            [{ accessibility: 99, accessibilityFailures: ['heading-order'] }, 'search `/search.php?search_query=adams`: accessibility 99, below the budget of 100 (heading-order)'],
        ];
        for (const [change, problem] of cases) {
            const { problems } = judgeUrl({
                entry: { key: 'search', path: '/search.php?search_query=adams', budget: 'full' }, medians: { ...passing, ...change }, target: 'host',
            });
            assert.deepEqual(problems, [problem]);
        }
    });

    it('fails the real search result on accessibility and CLS', () => {
        const { problems } = judgeUrl({ entry: { key: 'search', path: '/search.php?search_query=adams', budget: 'full' }, medians: metricsOf(SEARCH), target: 'host' });
        assert.ok(problems.some(problem => /accessibility 99, below the budget of 100 \(heading-order\)/.test(problem)), problems.join('\n'));
        assert.ok(problems.some(problem => /CLS 0\.096, over the budget of 0\.050/.test(problem)), problems.join('\n'));
    });

    it('judges only accessibility and CLS on a local stencil start, whose dev build isn\'t what ships', () => {
        const medians = {
            ...passing, performance: 70, lcpMs: 6900, tbtMs: 400, cls: 0.06,
        };
        const { problems, notes } = judgeUrl({ entry: { key: 'cart', path: '/cart.php', budget: 'full' }, medians, target: 'local' });
        assert.deepEqual(problems, ['cart `/cart.php`: CLS 0.060, over the budget of 0.050']);
        assert.ok(notes.some(note => /performance 70, LCP 6\.90 s and TBT 400 ms aren't judged on a local stencil start/.test(note)), notes.join('\n'));
    });

    it('holds a "self" page (home until tickets 46–49 land, SEO-8) to no budget, only to its own last accepted run', () => {
        const medians = { ...passing, performance: 60, lcpMs: 4000 };
        const self = { key: 'home', path: '/', budget: 'self' };
        const free = judgeUrl({ entry: self, medians, target: 'host' });
        assert.deepEqual(free.problems, []);
        assert.ok(free.notes.some(note => /compared only with itself/.test(note)));

        const dropped = judgeUrl({
            entry: self, medians, target: 'host', comparison: point(66), compare: true,
        });
        assert.deepEqual(dropped.problems, ['home `/`: performance 60, 6 points below the last accepted run (66, run of 2026-10-06 14:30 UTC on theme 174ad580)']);
    });
});

describe('the drop rule (story 78)', () => {
    const entry = { key: 'cart', path: '/cart.php', budget: 'full' };
    const medians = metricsOf(withPerformance(HOME, 0.91));
    const good = { ...medians, lcpMs: 2000 };

    it('fails a performance median 6 points below the last accepted run, and passes one 5 below', () => {
        assert.equal(DROP_LIMIT, 5);
        const six = judgeUrl({
            entry, medians: good, target: 'host', comparison: point(97), compare: true,
        });
        assert.deepEqual(six.problems, ['cart `/cart.php`: performance 91, 6 points below the last accepted run (97, run of 2026-10-06 14:30 UTC on theme 174ad580)']);
        const five = judgeUrl({
            entry, medians: good, target: 'host', comparison: point(96), compare: true,
        });
        assert.deepEqual(five.problems, []);
        assert.ok(five.notes.some(note => /5 points below the last accepted run \(96/.test(note)), five.notes.join('\n'));
    });

    it('compares the first run with ticket 11\'s recorded baseline', () => {
        const seeded = addToHistory(emptyHistory(), '1895766', [{ key: 'cart', ...point(97, { source: 'ticket 11' }) }]);
        const comparison = comparisonPoint(seeded, '1895766', 'cart');
        assert.equal(comparison.source, 'ticket 11');
        const run = judgeUrl({
            entry, medians: good, target: 'host', comparison, compare: true,
        });
        assert.deepEqual(run.problems, ['cart `/cart.php`: performance 91, 6 points below the last accepted run (97, ticket 11 of 2026-10-06 14:30 UTC on theme 174ad580)']);
    });

    it('starts from the first accepted run when nothing is recorded yet', () => {
        const run = judgeUrl({
            entry, medians: good, target: 'host', comparison: null, compare: true,
        });
        assert.deepEqual(run.problems, []);
        assert.ok(run.notes.some(note => /no accepted run to compare with yet/.test(note)));
    });

    it('compares only like with like: never on a local stencil start or a run with the tags loaded', () => {
        const local = judgeUrl({
            entry, medians: good, target: 'local', comparison: point(99), compare: false,
        });
        assert.deepEqual(local.problems, []);
        const loaded = judgeUrl({
            entry, medians: good, target: 'host', comparison: point(99), compare: false,
        });
        assert.deepEqual(loaded.problems, []);
        assert.ok(loaded.notes.some(note => /not compared with the last accepted run/.test(note)));
    });

    it('compares with the newest accepted run of the same channel and URL', () => {
        let history = emptyHistory();
        history = addToHistory(history, '1895766', [{ key: 'cart', ...point(80, { source: 'ticket 11' }) }, { key: 'home', ...point(70) }]);
        history = addToHistory(history, '1895766', [{ key: 'cart', ...point(92, { at: '2026-10-20T10:00:00.000Z' }) }]);
        history = addToHistory(history, '1', [{ key: 'cart', ...point(50) }]);
        assert.equal(comparisonPoint(history, '1895766', 'cart').medians.performance, 92);
        assert.equal(comparisonPoint(history, '1895766', 'home').medians.performance, 70);
        assert.equal(comparisonPoint(history, '1', 'cart').medians.performance, 50);
        assert.equal(comparisonPoint(history, '1', 'home'), null);
        assert.deepEqual(historyProblems(history), []);
    });
});

describe('the history file (scripts/qa/lighthouse-history.json)', () => {
    it('is valid, and holds no accepted run until ticket 11 or the first host run records one', () => {
        const history = JSON.parse(fs.readFileSync(new URL('lighthouse-history.json', import.meta.url), 'utf8'));
        assert.deepEqual(historyProblems(history), []);
    });

    it('refuses a malformed history, so a typo can\'t switch the drop rule off', () => {
        assert.deepEqual(historyProblems({ version: 1, channels: {} }), []);
        assert.match(historyProblems({ version: 2, channels: {} }).join('\n'), /version must be 1/);
        assert.match(historyProblems({ version: 1, chanels: {} }).join('\n'), /unknown key "chanels"/);
        assert.match(historyProblems({ version: 1, channels: { 1895766: { cart: [{ at: 'x', source: 'run' }] } } }).join('\n'), /1895766 cart #1: medians\.performance must be a number from 0 to 100/);
        assert.match(historyProblems({ version: 1, channels: { 1895766: { cart: {} } } }).join('\n'), /1895766 cart must be a list/);
        assert.match(historyProblems({ version: 1, channels: { ca: {} } }).join('\n'), /channel "ca" isn't a channel id/);
    });
});

describe('the URL lists (scripts/qa/lighthouse-urls.json)', () => {
    const list = JSON.parse(fs.readFileSync(new URL('lighthouse-urls.json', import.meta.url), 'utf8'));

    it('is valid, and names the six page kinds', () => {
        assert.deepEqual(LIGHTHOUSE_KINDS, ['home', 'species', 'fly-type', 'product', 'cart', 'search']);
        assert.deepEqual(urlListProblems(list), []);
    });

    it('covers every kind on ReelFlies_CA, each pinned or waiting with its reason', () => {
        const {
            urls, waiting, missing, stale,
        } = channelUrls(list, '1895766');
        assert.deepEqual(missing, []);
        assert.deepEqual(stale, []);
        assert.deepEqual([...urls.map(url => url.kind), ...waiting.map(item => item.kind)].sort(), [...LIGHTHOUSE_KINDS].sort());
        assert.equal(urls.find(url => url.kind === 'home').budget, 'self', 'home is compared only with itself until tickets 46–49 land (SEO-8)');
        for (const url of urls) assert.match(url.path, /^\/(?!\/)/, `${url.key} is a path on the storefront`);
    });

    // Ticket 53 (Option A): live reelflies.ca on tree 1, which ticket 56 runs after the channel-1 push.
    it('covers every kind on channel 1 with tree-1 pages, and says why tree 1 has no Species page', () => {
        const {
            urls, waiting, missing, stale,
        } = channelUrls(list, '1');
        assert.deepEqual(missing, []);
        assert.deepEqual(stale, []);
        const byKind = Object.fromEntries(urls.map(url => [url.kind, url]));
        assert.deepEqual(Object.keys(byKind).sort(), ['cart', 'fly-type', 'home', 'product', 'search']);
        assert.equal(byKind.home.path, '/');
        assert.equal(byKind['fly-type'].path, '/flies/dry-flies/', 'Dry Flies (298), a Fly Type under Flies on tree 1, in the channel-1 menu ids');
        assert.equal(byKind.product.path, CHANNELS[1].pages.product, 'the gates\' channel-1 product pin, with Fly Sizes, which ticket 11 measured on the old theme');
        assert.equal(byKind.cart.path, '/cart.php', 'the empty cart: no action, so no cart write');
        assert.equal(byKind.search.path, channelUrls(list, '1895766').urls.find(url => url.kind === 'search').path, 'the same search as prelaunch');
        assert.deepEqual(waiting.map(item => item.kind), ['species']);
        assert.match(waiting[0].reason, /tree 1 has no Species pages/i);
        for (const url of urls) {
            assert.equal(url.budget, 'full', `${url.key}: held to the full budget on live reelflies.ca (ticket 56)`);
            assert.doesNotMatch(url.path, /action=|\/remote\/|wishlist|logout/, `${url.key} sends no write as it loads`);
        }
    });

    it('reports a kind no pin covers, and a reason left over for a kind now pinned', () => {
        const partial = {
            version: 1,
            channels: {
                1: {
                    urls: { home: { path: '/' }, 'product@hopper': { path: '/hopper/' } },
                    notPinnedYet: { product: 'old reason', cart: 'no cart yet' },
                },
            },
        };
        assert.deepEqual(urlListProblems(partial), []);
        const {
            urls, waiting, missing, stale,
        } = channelUrls(partial, '1');
        assert.deepEqual(urls.map(url => [url.key, url.kind, url.budget]), [['home', 'home', 'full'], ['product@hopper', 'product', 'full']]);
        assert.deepEqual(waiting, [{ kind: 'cart', reason: 'no cart yet' }]);
        assert.deepEqual(missing, ['species', 'fly-type', 'search']);
        assert.deepEqual(stale, ['product']);
        assert.throws(() => channelUrls(partial, '1855224'), /no Lighthouse URLs for channel 1855224/);
    });

    it('refuses an entry it can\'t use', () => {
        const bad = (urls, extra = {}) => urlListProblems({ version: 1, channels: { 1: { urls, ...extra } } }).join('\n');
        assert.match(bad({ basket: { path: '/cart.php' } }), /"basket" isn't one of the six kinds/);
        assert.match(bad({ cart: { path: 'cart.php' } }), /cart: path must start with "\/"/);
        assert.match(bad({ cart: { path: 'https://reelflies.ca/cart.php' } }), /cart: path must start with "\/"/);
        assert.match(bad({ cart: { path: '/cart.php', budget: 'none' } }), /cart: budget must be "full" or "self"/);
        assert.match(bad({ cart: { path: '/cart.php', pth: '/' } }), /cart: unknown key "pth"/);
        assert.match(bad({}, { notPinnedYet: { cart: '' } }), /notPinnedYet\.cart needs its reason/);
    });
});

describe('analytics in a run (W0-6)', () => {
    it('counts the requests the patterns blocked, and lists any that completed', () => {
        const requests = [
            { url: 'https://www.googletagmanager.com/gtag/js?id=G-BQ4RFFK3KW', statusCode: -1 },
            { url: 'https://connect.facebook.net/en_US/fbevents.js', statusCode: -1 },
            { url: 'https://region1.analytics.google.com/g/collect?v=2', statusCode: 204 },
            { url: 'https://cdn11.bigcommerce.com/shared/js/csrf-protection-header.js', statusCode: 200 },
        ];
        const lhr = { ...HOME, audits: { ...HOME.audits, 'network-requests': { details: { items: requests } } } };
        assert.deepEqual(analyticsRequests(lhr), { blocked: 2, completed: ['https://region1.analytics.google.com/g/collect?v=2'] });
        assert.deepEqual(analyticsRequests(HOME), { blocked: 0, completed: [] });
    });
});

describe('the RELEASES.md lines', () => {
    it('give each URL\'s medians, the pages not measured, and every problem', () => {
        const summary = {
            urls: [
                {
                    key: 'home', path: '/', budget: 'self', medians: metricsOf(HOME), comparison: point(88), problems: [],
                },
                {
                    key: 'search', path: '/search.php?search_query=adams', budget: 'full', medians: metricsOf(SEARCH), comparison: null, problems: ['search `/search.php?search_query=adams`: CLS 0.096, over the budget of 0.050'],
                },
                {
                    key: 'cart', path: '/cart.php', budget: 'full', medians: null, comparison: null, problems: ['cart `/cart.php`: Lighthouse couldn\'t measure it: NO_FCP'],
                },
            ],
            waiting: [{ kind: 'product', reason: 'ReelFlies_CA has no products until refactor 14' }],
            problems: [],
        };
        assert.deepEqual(lighthouseReleaseLines(summary), [
            '  - home `/`: performance 89, LCP 3.08 s, CLS 0.000, TBT 88 ms, accessibility 100; JS 474,688 B, CSS 93,760 B; compared only with itself (SEO-8); last accepted 88',
            '  - search `/search.php?search_query=adams`: performance 70, LCP 6.95 s, CLS 0.096, TBT 74 ms, accessibility 99; JS 757,995 B, CSS 98,205 B',
            '  - cart `/cart.php`: not measured',
            '  - not measured yet: product (ReelFlies_CA has no products until refactor 14)',
            '  - failed: search `/search.php?search_query=adams`: CLS 0.096, over the budget of 0.050',
            '  - failed: cart `/cart.php`: Lighthouse couldn\'t measure it: NO_FCP',
        ]);
    });
});
