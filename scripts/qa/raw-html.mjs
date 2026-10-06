#!/usr/bin/env node
// The raw-HTML check (spec Testing Decisions, seam 2; ticket 16): fetches pages the
// way a crawler gets them, with no JavaScript, and runs every registered assertion
// on the server HTML.
//
//   npm run qa:raw-html
//   QA_CHANNEL=1 npm run qa:raw-html                     # read-only channel-1 fallback
//   QA_BASE_URL=https://<prelaunch host> QA_PREVIEW_COOKIE='<name>=<value>' npm run qa:raw-html
//
// - Pages: every page pinned for QA_CHANNEL in scripts/qa/pages.mjs. Each must answer
//   200, or 404 for the 404 page. A page that answers 5xx is fetched once more after 2 s,
//   and one that answers 429 up to three times with backoff (retry.mjs). A channel must
//   pin a product and a category page (RAW_HTML_REQUIRED), or give the reason it can't yet
//   in notPinnedYet, which is reported as a warning.
// - Host: QA_BASE_URL, or else a local `stencil start` (scripts/qa/storefront.mjs),
//   reused when one is running (it must render QA_CHANNEL and QA_VARIATION), and started
//   and stopped here when not. With QA_FRESH_SERVER=1 it is always started here.
// - Assertions: every module in scripts/qa/raw-html/assertions/, loaded by file name,
//   so a ticket adds one by adding a file (scripts/qa/README.md).
//
// Exits 1 when an assertion fails or a page doesn't render, and 2 when the
// storefront can't be reached or, with QA_FRESH_SERVER=1, when something already answers
// on QA_PORT or QA_PORT + 1 (3300 and 3301 by default).

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { isMain } from '../lib/is-main.mjs';
import { RAW_HTML_REQUIRED, expectedStatus, pinnedChannel } from './pages.mjs';
import { fetchWithRetries } from './retry.mjs';
import {
    BASE_URL, HEADERS, IS_LOCAL, PREVIEW_COOKIE, QA_CHANNEL, useStorefront,
} from './storefront.mjs';

const ASSERTIONS_DIR = fileURLToPath(new URL('raw-html/assertions/', import.meta.url));
const USER_AGENT = 'ReelFliesQA/1.0 (raw HTML, no JavaScript)';

export async function loadAssertions(dir = ASSERTIONS_DIR) {
    const files = fs.readdirSync(dir).filter(file => file.endsWith('.mjs') && !file.endsWith('.test.mjs')).sort();
    return Promise.all(files.map(async file => {
        const { default: assertion } = await import(pathToFileURL(path.join(dir, file)).href);
        if (!assertion?.id || !assertion.description || typeof assertion.check !== 'function') {
            throw new Error(`${file} must export default { id, description, check }`);
        }
        return assertion;
    }));
}

const appliesTo = (assertion, kind) => (!assertion.pages || assertion.pages.includes(kind)) && !(assertion.notOn || []).includes(kind);

// Runs each assertion that applies to the page's kind. A page that didn't render
// fails as page-renders, and its assertions are skipped.
export function checkPage(page, assertions) {
    const result = ({ id, ticket, description }, status, problems = []) => ({
        id,
        ticket,
        description,
        status,
        problems,
    });
    if (page.status !== expectedStatus(page.kind)) {
        return [
            result({ id: 'page-renders', ticket: 16, description: 'the page renders as its template' }, 'fail', [`${page.path} returned HTTP ${page.status}, not ${expectedStatus(page.kind)}`]),
            ...assertions.map(assertion => result(assertion, 'skip')),
        ];
    }
    return assertions.map(assertion => {
        if (!appliesTo(assertion, page.kind)) return result(assertion, 'skip');
        const problems = assertion.check(page);
        return result(assertion, problems.length ? 'fail' : 'pass', problems);
    });
}

// Every pinned page; the required kinds that are missing (a failure) or that the channel
// says it can't pin yet (a warning); and reasons left over for kinds now pinned.
export function pagesToFetch({ pages, notPinnedYet = {} }) {
    const unpinned = RAW_HTML_REQUIRED.filter(kind => !pages[kind]);
    return {
        fetch: Object.entries(pages).map(([kind, pagePath]) => ({ kind, path: pagePath })),
        missing: unpinned.filter(kind => !notPinnedYet[kind]),
        waiting: unpinned.filter(kind => notPinnedYet[kind]).map(kind => ({ kind, reason: notPinnedYet[kind] })),
        stale: Object.keys(notPinnedYet).filter(kind => pages[kind]),
    };
}

// Follows up to five redirects by hand, so the preview cookie only ever goes to the
// QA_BASE_URL host it belongs to, never to a host a redirect points at. A request that
// answers 5xx or 429 is made again as retry.mjs says.
export async function fetchPage(baseUrl, { kind, path: pagePath }, redirects = 5) {
    const url = new URL(pagePath, baseUrl);
    const headers = { ...HEADERS, Accept: 'text/html', 'User-Agent': USER_AGENT };
    if (PREVIEW_COOKIE && !IS_LOCAL && url.origin === new URL(BASE_URL).origin) headers.Cookie = PREVIEW_COOKIE;
    const response = await fetchWithRetries(url, { headers, redirect: 'manual' }, { what: `${kind} ${pagePath}` });
    const location = response.headers.get('location');
    if (location && response.status >= 300 && response.status < 400 && redirects > 0) {
        return fetchPage(url, { kind, path: new URL(location, url).href }, redirects - 1);
    }
    return {
        kind,
        path: pagePath,
        url: url.href,
        status: response.status,
        html: await response.text(),
    };
}

const warn = message => console.log(`WARNING  ${message}`);
const fail = message => console.error(`FAIL     ${message}`);

function report(page, results) {
    console.log(`\n${page.kind} ${page.path} (HTTP ${page.status})`);
    for (const result of results) {
        if (result.status === 'fail') {
            result.problems.forEach(problem => fail(`${page.kind} ${page.path} · ${result.id} (ticket ${result.ticket}): ${problem}`));
        } else {
            console.log(`  ${result.status === 'pass' ? 'ok     ' : 'skipped'}  ${result.id}: ${result.description}`);
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
        console.log(`Raw HTML on channel ${QA_CHANNEL} at ${storefront.baseUrl}: ${pages.length} pages, ${assertions.length} assertions; no JavaScript runs, so no analytics tag loads`);
        waiting.forEach(({ kind, reason }) => warn(`no ${kind} page is checked on channel ${QA_CHANNEL}: ${reason} (notPinnedYet in scripts/qa/pages.mjs)`));
        stale.forEach(kind => warn(`channel ${QA_CHANNEL} pins a ${kind} page now: delete its notPinnedYet entry in scripts/qa/pages.mjs`));
        missing.forEach(kind => fail(`no ${kind} page is pinned for channel ${QA_CHANNEL}: pin one in scripts/qa/pages.mjs, or say why not yet in its notPinnedYet`));
        failures += missing.length;

        for (const entry of pages) {
            const page = await fetchPage(storefront.baseUrl, entry); // eslint-disable-line no-await-in-loop
            const results = checkPage(page, assertions);
            report(page, results);
            failures += results.filter(({ status }) => status === 'fail').length;
        }
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
