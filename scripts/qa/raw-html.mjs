#!/usr/bin/env node
// The raw-HTML check (spec Testing Decisions, seam 2; ticket 16): fetches pages the
// way a crawler gets them, with no JavaScript, and runs every registered assertion
// on the server HTML.
//
//   npm run qa:raw-html
//   QA_CHANNEL=1 npm run qa:raw-html                     # read-only channel-1 fallback
//   QA_BASE_URL=https://<prelaunch host> QA_PREVIEW_COOKIE='<name>=<value>' npm run qa:raw-html
//
// - Pages: every page pinned for QA_CHANNEL in scripts/qa/pages.mjs, kind@name pins included
//   (W0-8). Each must answer 200, or 404 for a page of the 404 kind. A page that answers 5xx
//   is fetched once more after 2 s, and one that answers 429 up to three times with backoff
//   (retry.mjs). A channel must pin a product and a category page (RAW_HTML_REQUIRED; a
//   kind@name pin counts), or give the reason it can't yet in notPinnedYet, which is reported
//   as a warning.
// - With QA_OVERLAY, the pages render with that overlay (W0-8; overlays.mjs).
// - Host: QA_BASE_URL, or else a local `stencil start` (scripts/qa/storefront.mjs),
//   reused when one is running (it must render QA_CHANNEL and QA_VARIATION), and started
//   and stopped here when not. With QA_FRESH_SERVER=1 it is always started here.
// - Assertions: every module in scripts/qa/raw-html/assertions/, loaded by file name,
//   so a ticket adds one by adding a file (scripts/qa/README.md). An assertion's `pages` and
//   `notOn` name page kinds, which cover every pin of the kind, or one kind@name pin. Its
//   `check(page)` runs on each page; its `checkAll(pages)`, if it has one, runs once after the
//   last page, on all the pages it applies to that rendered (ticket 27's strip-every-page).
//
// Exits 1 when an assertion fails or a page doesn't render, and 2 when the
// storefront can't be reached or, with QA_FRESH_SERVER=1, when something already answers
// on QA_PORT or QA_PORT + 1 (3300 and 3301 by default).

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { isMain } from '../lib/is-main.mjs';
import {
    RAW_HTML_REQUIRED, expectedStatus, pageKind, pinnedChannel,
} from './pages.mjs';
import { fetchWithRetries } from './retry.mjs';
import {
    BASE_URL, HEADERS, IS_LOCAL, PREVIEW_COOKIE, QA_CHANNEL, QA_OVERLAY, useStorefront,
} from './storefront.mjs';

const ASSERTIONS_DIR = fileURLToPath(new URL('raw-html/assertions/', import.meta.url));
const USER_AGENT = 'ReelFliesQA/1.0 (raw HTML, no JavaScript)';

export async function loadAssertions(dir = ASSERTIONS_DIR) {
    const files = fs.readdirSync(dir).filter(file => file.endsWith('.mjs') && !file.endsWith('.test.mjs')).sort();
    return Promise.all(files.map(async file => {
        const { default: assertion } = await import(pathToFileURL(path.join(dir, file)).href);
        if (!assertion?.id || !assertion.description || ![assertion.check, assertion.checkAll].some(fn => typeof fn === 'function')) {
            throw new Error(`${file} must export default { id, description, check } (or checkAll, or both)`);
        }
        return assertion;
    }));
}

// Whether a list of page kinds and kind@name pins names the page `key` of kind `kind`.
const names = (list, key, kind) => list.includes(kind) || list.includes(key);
const appliesTo = (assertion, key, kind) => (!assertion.pages || names(assertion.pages, key, kind)) && !names(assertion.notOn || [], key, kind);

// One assertion's result, as report() prints it.
const result = ({ id, ticket, description }, status, problems = []) => ({
    id,
    ticket,
    description,
    status,
    problems,
});

// Runs each assertion's check on the page, when the assertion applies to the page's kind, or to
// its kind@name pin, and has a check (one with only checkAll is skipped here). A page that didn't
// render fails as page-renders, and its assertions are skipped. `page.key` is the pin's key, and
// its kind when it has none.
export function checkPage(page, assertions) {
    const key = page.key ?? page.kind;
    if (page.status !== expectedStatus(key)) {
        return [
            result({ id: 'page-renders', ticket: 16, description: 'the page renders as its template' }, 'fail', [`${page.path} returned HTTP ${page.status}, not ${expectedStatus(key)}`]),
            ...assertions.map(assertion => result(assertion, 'skip')),
        ];
    }
    return assertions.map(assertion => {
        if (typeof assertion.check !== 'function' || !appliesTo(assertion, key, page.kind)) return result(assertion, 'skip');
        const problems = assertion.check(page);
        return result(assertion, problems.length ? 'fail' : 'pass', problems);
    });
}

// Runs, once, each assertion's checkAll on every fetched page it applies to that rendered as its
// template (a page that didn't is page-renders' failure), for what only the pages together show,
// such as the shipping strip on every page or none (strip-every-page). checkAll gets the pages as
// fetchPage returns them ({ key, kind, path, url, status, html }) and returns its problems, as a
// check does. Skipped with no such page.
export function checkPages(pages, assertions) {
    return assertions.filter(assertion => typeof assertion.checkAll === 'function').map(assertion => {
        const rendered = pages.filter(page => {
            const key = page.key ?? page.kind;
            return page.status === expectedStatus(key) && appliesTo(assertion, key, page.kind);
        });
        if (!rendered.length) return result(assertion, 'skip');
        const problems = assertion.checkAll(rendered);
        return result(assertion, problems.length ? 'fail' : 'pass', problems);
    });
}

// Every pinned page, with its key and kind; the required kinds no pin covers that are missing
// (a failure) or that the channel says it can't pin yet (a warning); and reasons left over for
// kinds now pinned.
export function pagesToFetch({ pages, notPinnedYet = {} }) {
    const fetch = Object.entries(pages).map(([key, pagePath]) => ({ key, kind: pageKind(key), path: pagePath }));
    const pinned = kind => fetch.some(page => page.kind === kind);
    const unpinned = RAW_HTML_REQUIRED.filter(kind => !pinned(kind));
    return {
        fetch,
        missing: unpinned.filter(kind => !notPinnedYet[kind]),
        waiting: unpinned.filter(kind => notPinnedYet[kind]).map(kind => ({ kind, reason: notPinnedYet[kind] })),
        stale: Object.keys(notPinnedYet).filter(pinned),
    };
}

// Follows up to five redirects by hand, so the preview cookie only ever goes to the
// QA_BASE_URL host it belongs to, never to a host a redirect points at. A request that
// answers 5xx or 429 is made again as retry.mjs says.
export async function fetchPage(baseUrl, { key, kind, path: pagePath }, redirects = 5) {
    const url = new URL(pagePath, baseUrl);
    const headers = { ...HEADERS, Accept: 'text/html', 'User-Agent': USER_AGENT };
    if (PREVIEW_COOKIE && !IS_LOCAL && url.origin === new URL(BASE_URL).origin) headers.Cookie = PREVIEW_COOKIE;
    const response = await fetchWithRetries(url, { headers, redirect: 'manual' }, { what: `${key ?? kind} ${pagePath}` });
    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400 && redirects > 0) {
        return fetchPage(url, { key, kind, path: new URL(location, url).href }, redirects - 1);
    }
    return {
        key: key ?? kind,
        kind,
        path: pagePath,
        url: url.href,
        status: response.status,
        html: await response.text(),
    };
}

const warn = message => console.log(`WARNING  ${message}`);
const fail = message => console.error(`FAIL     ${message}`);

// Prints one page's results under its heading (its key, path and status, unless one is given).
function report(page, results, heading = `${page.key} ${page.path} (HTTP ${page.status})`) {
    console.log(`\n${heading}`);
    for (const {
        id, ticket, description, status, problems,
    } of results) {
        if (status === 'fail') {
            problems.forEach(problem => fail(`${page.key} ${page.path} · ${id} (ticket ${ticket}): ${problem}`));
        } else {
            console.log(`  ${status === 'pass' ? 'ok     ' : 'skipped'}  ${id}: ${description}`);
        }
    }
}

async function main() {
    let storefront;
    try {
        storefront = await useStorefront();
    } catch (error) {
        console.error(error.message);
        process.exit(2);
    }

    let failures = 0;
    try {
        const assertions = await loadAssertions();
        const {
            fetch: pages, missing, waiting, stale,
        } = pagesToFetch(pinnedChannel(QA_CHANNEL));
        console.log(`Raw HTML on channel ${QA_CHANNEL}${QA_OVERLAY ? ` with the overlay ${QA_OVERLAY}` : ''} at ${storefront.baseUrl}: ${pages.length} pages, ${assertions.length} assertions; no JavaScript runs, so no analytics tag loads`);
        waiting.forEach(({ kind, reason }) => warn(`no ${kind} page is checked on channel ${QA_CHANNEL}: ${reason} (notPinnedYet in scripts/qa/pages.mjs)`));
        stale.forEach(kind => warn(`channel ${QA_CHANNEL} pins a ${kind} page now: delete its notPinnedYet entry in scripts/qa/pages.mjs`));
        missing.forEach(kind => fail(`no ${kind} page is pinned for channel ${QA_CHANNEL}: pin one in scripts/qa/pages.mjs, or say why not yet in its notPinnedYet`));
        failures += missing.length;

        const fetched = [];
        for (const entry of pages) {
            const page = await fetchPage(storefront.baseUrl, entry); // eslint-disable-line no-await-in-loop
            const results = checkPage(page, assertions);
            report(page, results);
            failures += results.filter(({ status }) => status === 'fail').length;
            fetched.push(page);
        }
        const together = checkPages(fetched, assertions);
        if (together.length) report({ key: 'every page', path: '(together)' }, together, `Every page together (${fetched.length} pages)`);
        failures += together.filter(({ status }) => status === 'fail').length;
    } catch (error) {
        console.error(`Couldn't fetch from ${storefront.baseUrl}: ${error.message}`);
        await storefront.stop();
        process.exit(2);
    }
    await storefront.stop();

    console.log(failures ? `\n${failures} raw-HTML check(s) failed.` : '\nEvery raw-HTML check passed.');
    process.exit(failures ? 1 : 0);
}

if (isMain(import.meta.url)) main();
