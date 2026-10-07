// Ticket 17's Lighthouse rules, with no I/O, for scripts/qa/lighthouse.mjs and the host batch
// (prelaunch.mjs): the metrics read from one Lighthouse result, the median of three runs, the
// five budgets, the drop rule, the URL lists (lighthouse-urls.json) and the history the drop
// rule compares with (lighthouse-history.json). scripts/qa/README.md, "Lighthouse", has the
// rules in prose; lighthouse-rules.test.mjs proves them on real results.
//
// - Budgets, on each URL's median of three runs: performance 90 or more, LCP 2.5 s or less, CLS
//   0.05 or less, TBT 200 ms or less, accessibility 100 (spec, Testing Decisions seam 3; map.md).
// - The drop rule: a performance median more than 5 points below the URL's last accepted run
//   fails. Only runs on a host with the analytics tags blocked are compared, so like is compared
//   with like (W0-6; ticket 11's baseline is measured the same way).
// - A page with `budget: "self"` (home, until tickets 46–49 populate it, SEO-8) is held to no
//   budget, only to the drop rule.
// - On a local stencil start only accessibility and CLS are judged: it serves the webpack dev
//   build, unminified and with inline source maps, so performance, LCP and TBT there say little
//   about the build that is pushed. They are still measured and reported.

import { isAnalyticsUrl } from './analytics-hosts.mjs';

export const RUNS_PER_URL = 3;
export const DROP_LIMIT = 5;
// The six page kinds (spec seam 3; ticket 11's pages). A list's keys are a kind, or kind@name
// for a second page of the same kind, as in pages.mjs.
export const LIGHTHOUSE_KINDS = ['home', 'species', 'fly-type', 'product', 'cart', 'search'];
export const BUDGETS = [
    { metric: 'performance', min: 90 },
    { metric: 'lcpMs', max: 2500 },
    { metric: 'cls', max: 0.05 },
    { metric: 'tbtMs', max: 200 },
    { metric: 'accessibility', min: 100 },
];
// The budgets a local stencil start judges (above).
export const LOCAL_JUDGED = ['cls', 'accessibility'];

const NAMES = {
    performance: 'performance', lcpMs: 'LCP', cls: 'CLS', tbtMs: 'TBT', accessibility: 'accessibility',
};
const FORMATS = {
    performance: value => String(value),
    accessibility: value => String(value),
    lcpMs: value => `${(value / 1000).toFixed(2)} s`,
    cls: value => value.toFixed(3),
    tbtMs: value => `${Math.round(value)} ms`,
};
export const formatMetric = (metric, value) => `${NAMES[metric]} ${FORMATS[metric](value)}`;
const bytes = value => `${value.toLocaleString('en-US')} B`;
const utc = iso => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
const list = items => (items.length > 1 ? `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}` : items.join(''));

export const formatMetrics = medians => `${BUDGETS.map(({ metric }) => formatMetric(metric, medians[metric])).join(', ')}; JS ${bytes(medians.jsBytes)}, CSS ${bytes(medians.cssBytes)}`;

// --- One run --------------------------------------------------------------------------------

// The metrics of one Lighthouse result (its lhr): the two scores out of 100, LCP and TBT in whole
// ms, CLS to three places as Lighthouse shows it, the script and stylesheet bytes transferred (as
// ticket 11 records them), and the accessibility audits that cost points. Throws when Lighthouse
// couldn't finish the run, naming its error.
export function metricsOf(lhr) {
    if (lhr.runtimeError) throw new Error(`${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
    const score = id => {
        const value = lhr.categories?.[id]?.score;
        if (typeof value !== 'number') throw new Error(`the result has no ${id} score`);
        return Math.round(value * 100);
    };
    const numeric = id => {
        const value = lhr.audits?.[id]?.numericValue;
        if (typeof value !== 'number') throw new Error(`the result has no ${id} value`);
        return value;
    };
    const resources = lhr.audits?.['resource-summary']?.details?.items || [];
    const transferred = type => resources.find(item => item.resourceType === type)?.transferSize ?? 0;
    const refs = lhr.categories?.accessibility?.auditRefs || [];
    return {
        performance: score('performance'),
        accessibility: score('accessibility'),
        lcpMs: Math.round(numeric('largest-contentful-paint')),
        cls: Math.round(numeric('cumulative-layout-shift') * 1000) / 1000,
        tbtMs: Math.round(numeric('total-blocking-time')),
        jsBytes: transferred('script'),
        cssBytes: transferred('stylesheet'),
        accessibilityFailures: refs
            .filter(ref => ref.weight > 0 && typeof lhr.audits?.[ref.id]?.score === 'number' && lhr.audits[ref.id].score < 1)
            .map(ref => ref.id),
    };
}

// The requests to the analytics hosts (analytics-hosts.mjs) in a run: how many the blocked
// patterns stopped, and the URLs of any that completed anyway.
export function analyticsRequests(lhr) {
    const items = lhr.audits?.['network-requests']?.details?.items || [];
    const analytics = items.filter(item => isAnalyticsUrl(item.url));
    return {
        blocked: analytics.filter(item => !(item.statusCode > 0)).length,
        completed: analytics.filter(item => item.statusCode > 0).map(item => item.url),
    };
}

// --- The median -----------------------------------------------------------------------------

export function median(values) {
    if (!values.length) throw new Error('no runs to take a median of');
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Each metric's own median across the runs. The accessibility audits that cost points are those
// of any run.
export function medianMetrics(runs) {
    return Object.fromEntries(Object.keys(runs[0]).map(key => (Array.isArray(runs[0][key])
        ? [key, [...new Set(runs.flatMap(run => run[key]))].sort()]
        : [key, median(runs.map(run => run[key]))])));
}

// --- The budgets and the drop rule ------------------------------------------------------------

// Each budget against the medians: { metric, value, limit, ok, text }.
export function budgetResults(medians) {
    return BUDGETS.map(({ metric, min, max }) => {
        const value = medians[metric];
        const limit = min ?? max;
        const ok = min !== undefined ? value >= min : value <= max;
        const failures = metric === 'accessibility' && medians.accessibilityFailures?.length ? ` (${medians.accessibilityFailures.join(', ')})` : '';
        return {
            metric, value, limit, ok, text: `${formatMetric(metric, value)}, ${min !== undefined ? 'below' : 'over'} the budget of ${FORMATS[metric](limit)}${failures}`,
        };
    });
}

const describePoint = point => `${point.source} of ${utc(point.at)}${point.theme ? ` on theme ${point.theme.slice(0, 8)}` : ''}`;

// One URL's verdict: { problems, notes }. Problems fail the run; notes are reported.
//   entry       { key, path, budget: 'full' | 'self' }
//   medians     medianMetrics of its runs
//   target      'host' (QA_BASE_URL) or 'local' (a stencil start)
//   comparison  its last accepted run (comparisonPoint), or null
//   compare     whether the drop rule applies: a host run with the tags blocked
export function judgeUrl({
    entry, medians, target, comparison = null, compare = false,
}) {
    const where = `${entry.key} \`${entry.path}\``;
    const problems = [];
    const notes = [];
    const results = budgetResults(medians);
    let judged = BUDGETS.map(({ metric }) => metric);
    if (entry.budget === 'self') {
        judged = [];
        notes.push(`${where}: compared only with itself, so no budget is judged (budget "self" in lighthouse-urls.json)`);
    } else if (target === 'local') {
        judged = LOCAL_JUDGED;
        const unjudged = BUDGETS.filter(({ metric }) => !LOCAL_JUDGED.includes(metric)).map(({ metric }) => formatMetric(metric, medians[metric]));
        notes.push(`${where}: ${list(unjudged)} aren't judged on a local stencil start: its dev build isn't what ships, so only accessibility and CLS are`);
    }
    results.filter(result => !result.ok && judged.includes(result.metric)).forEach(result => problems.push(`${where}: ${result.text}`));

    if (compare && !comparison) {
        notes.push(`${where}: no accepted run to compare with yet, so the drop rule starts from this one once it is accepted`);
    } else if (compare) {
        const last = comparison.medians.performance;
        const drop = last - medians.performance;
        const text = drop > 0
            ? `performance ${medians.performance}, ${drop} points below the last accepted run (${last}, ${describePoint(comparison)})`
            : `performance ${medians.performance}, against ${last} at the last accepted run (${describePoint(comparison)})`;
        (drop > DROP_LIMIT ? problems : notes).push(`${where}: ${text}`);
    } else if (comparison) {
        const why = target === 'local' ? 'a local stencil start\'s dev build isn\'t what the host runs' : 'the analytics tags loaded in this run, and the accepted runs block them';
        notes.push(`${where}: not compared with the last accepted run: ${why}`);
    }
    return { problems, notes };
}

// --- The history (lighthouse-history.json) ---------------------------------------------------

export const HISTORY_ABOUT = 'Ticket 17\'s drop rule: each URL\'s accepted runs, per channel, newest last. A run is accepted when a run on a host with the analytics tags blocked passes every budget and the drop rule; `npm run qa:lighthouse -- --baseline "ticket 11"` records ticket 11\'s baseline whatever the budgets say. Written by scripts/qa/lighthouse.mjs only; commit it through the next release-log PR (build pipeline, section 6.5).';
export const emptyHistory = () => ({ version: 1, about: HISTORY_ABOUT, channels: {} });

const MEDIAN_KEYS = {
    performance: [0, 100], accessibility: [0, 100], lcpMs: [0, Infinity], cls: [0, Infinity], tbtMs: [0, Infinity], jsBytes: [0, Infinity], cssBytes: [0, Infinity],
};
const unknownKeys = (object, allowed, where) => Object.keys(object).filter(key => !allowed.includes(key)).map(key => `${where}unknown key "${key}"`);
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function pointProblems(point, where) {
    if (!isObject(point)) return [`${where} must be an object`];
    const problems = unknownKeys(point, ['at', 'source', 'theme', 'commit', 'medians'], `${where}: `);
    if (typeof point.at !== 'string' || Number.isNaN(Date.parse(point.at)) || !point.at.endsWith('Z')) problems.push(`${where}: at must be an ISO time in UTC`);
    if (typeof point.source !== 'string' || !point.source) problems.push(`${where}: source must name the run or the ticket it came from`);
    if (point.theme !== undefined && point.theme !== null && !/^[0-9a-f-]{36}$/.test(point.theme)) problems.push(`${where}: theme must be a theme uuid or null`);
    if (point.commit !== undefined && point.commit !== null && !/^[0-9a-f]{7,40}$/.test(point.commit)) problems.push(`${where}: commit must be a sha or null`);
    const medians = isObject(point.medians) ? point.medians : {};
    problems.push(...unknownKeys(medians, Object.keys(MEDIAN_KEYS), `${where}: medians: `));
    for (const [key, [low, high]] of Object.entries(MEDIAN_KEYS)) {
        const value = medians[key];
        if (typeof value !== 'number' || value < low || value > high) problems.push(`${where}: medians.${key} must be a number${high === Infinity ? ` of ${low} or more` : ` from ${low} to ${high}`}`);
    }
    return problems;
}

// Why the history can't be used, or an empty list. The runner stops on any problem, so a typo
// never reads as "nothing to compare with", which would switch the drop rule off.
export function historyProblems(history) {
    if (!isObject(history)) return ['the history must be a JSON object'];
    const problems = unknownKeys(history, ['version', 'about', 'channels'], '');
    if (history.version !== 1) problems.push('version must be 1');
    if (!isObject(history.channels)) return [...problems, 'channels must be an object'];
    for (const [channel, urls] of Object.entries(history.channels)) {
        if (!/^\d+$/.test(channel)) problems.push(`channel "${channel}" isn't a channel id`);
        if (!isObject(urls)) {
            problems.push(`${channel} must map each URL key to its accepted runs`);
            continue; // eslint-disable-line no-continue
        }
        for (const [key, points] of Object.entries(urls)) {
            if (!Array.isArray(points)) problems.push(`${channel} ${key} must be a list of accepted runs`);
            else points.forEach((point, index) => problems.push(...pointProblems(point, `${channel} ${key} #${index + 1}`)));
        }
    }
    return problems;
}

// The URL's newest accepted run on the channel, by its time (of two at the same time, the later
// one in the list), or null.
export function comparisonPoint(history, channel, key) {
    const points = history.channels?.[channel]?.[key] || [];
    return points.reduce((newest, point) => (!newest || point.at >= newest.at ? point : newest), null);
}

// A copy of the history with each { key, at, source, theme, commit, medians } added to its URL's
// accepted runs on the channel.
export function addToHistory(history, channel, entries) {
    const next = JSON.parse(JSON.stringify(history));
    next.channels[channel] = next.channels[channel] || {};
    for (const { key, ...point } of entries) {
        const { accessibilityFailures, ...medians } = point.medians; // eslint-disable-line no-unused-vars
        next.channels[channel][key] = [...(next.channels[channel][key] || []), { ...point, medians }];
    }
    return next;
}

// --- The URL lists (lighthouse-urls.json) ----------------------------------------------------

export const kindOf = key => key.split('@')[0];

// Why the list can't be used, or an empty list.
export function urlListProblems(urlList) {
    if (!isObject(urlList)) return ['the list must be a JSON object'];
    const problems = unknownKeys(urlList, ['version', 'about', 'channels'], '');
    if (urlList.version !== 1) problems.push('version must be 1');
    if (!isObject(urlList.channels)) return [...problems, 'channels must be an object'];
    const kinds = LIGHTHOUSE_KINDS.join(', ');
    for (const [channel, entry] of Object.entries(urlList.channels)) {
        const at = `channel ${channel}: `;
        if (!/^\d+$/.test(channel)) problems.push(`channel "${channel}" isn't a channel id`);
        if (!isObject(entry) || !isObject(entry.urls)) {
            problems.push(`${at}urls must map each page key to its { path }`);
            continue; // eslint-disable-line no-continue
        }
        problems.push(...unknownKeys(entry, ['urls', 'notPinnedYet', 'note'], at));
        for (const [key, url] of Object.entries(entry.urls)) {
            if (!LIGHTHOUSE_KINDS.includes(kindOf(key)) || !/^[a-z-]+(@[a-z0-9-]+)?$/.test(key)) problems.push(`${at}"${key}" isn't one of the six kinds (${kinds}), or kind@name`);
            if (!isObject(url)) {
                problems.push(`${at}${key} must be { path }`);
                continue; // eslint-disable-line no-continue
            }
            problems.push(...unknownKeys(url, ['path', 'budget', 'note'], `${at}${key}: `));
            if (typeof url.path !== 'string' || !/^\/(?!\/)/.test(url.path)) problems.push(`${at}${key}: path must start with "/" (a path on the storefront, not a URL)`);
            if (url.budget !== undefined && !['full', 'self'].includes(url.budget)) problems.push(`${at}${key}: budget must be "full" or "self"`);
        }
        for (const [kind, reason] of Object.entries(entry.notPinnedYet || {})) {
            if (!LIGHTHOUSE_KINDS.includes(kind)) problems.push(`${at}notPinnedYet: "${kind}" isn't one of the six kinds (${kinds})`);
            if (typeof reason !== 'string' || !reason.trim()) problems.push(`${at}notPinnedYet.${kind} needs its reason`);
        }
    }
    return problems;
}

// The channel's URLs ({ key, kind, path, budget, note }), the kinds it can't pin yet with their
// reasons (waiting), the kinds it neither pins nor explains (missing, which fail the run), and the
// reasons left over for kinds now pinned (stale). Throws when the list has no entry for the channel.
export function channelUrls(urlList, channel) {
    const entry = urlList.channels?.[channel];
    if (!entry) throw new Error(`no Lighthouse URLs for channel ${channel} in scripts/qa/lighthouse-urls.json (ticket 53 adds channel 1's)`);
    const urls = Object.entries(entry.urls).map(([key, url]) => ({
        key, kind: kindOf(key), path: url.path, budget: url.budget || 'full', note: url.note || null,
    }));
    const pinned = kind => urls.some(url => url.kind === kind);
    const reasons = entry.notPinnedYet || {};
    return {
        urls,
        waiting: LIGHTHOUSE_KINDS.filter(kind => !pinned(kind) && reasons[kind]).map(kind => ({ kind, reason: reasons[kind] })),
        missing: LIGHTHOUSE_KINDS.filter(kind => !pinned(kind) && !reasons[kind]),
        stale: Object.keys(reasons).filter(pinned),
    };
}

// --- RELEASES.md ------------------------------------------------------------------------------

// The lines under a release entry's "- Lighthouse: …" line: each URL's medians, the kinds not
// measured yet, and every problem. The host batch adds them when it fills in "pending host batch".
export function lighthouseReleaseLines(summary) {
    const lines = summary.urls.map(url => {
        const where = `  - ${url.key} \`${url.path}\``;
        if (!url.medians) return `${where}: not measured`;
        const self = url.budget === 'self' ? '; compared only with itself (SEO-8)' : '';
        const last = url.comparison ? `; last accepted ${url.comparison.medians.performance}` : '';
        return `${where}: ${formatMetrics(url.medians)}${self}${last}`;
    });
    if (summary.waiting?.length) lines.push(`  - not measured yet: ${summary.waiting.map(({ kind, reason }) => `${kind} (${reason})`).join(', ')}`);
    const problems = [...summary.urls.flatMap(url => url.problems), ...(summary.problems || [])];
    return [...lines, ...problems.map(problem => `  - failed: ${problem}`)];
}
