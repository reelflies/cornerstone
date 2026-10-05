#!/usr/bin/env node
// The raw-HTML check (spec Testing Decisions, seam 2; ticket 16): fetches pages the
// way a crawler gets them, with no JavaScript, and runs every registered assertion
// on the server HTML.
//
//   npm run qa:raw-html
//   QA_CHANNEL=1 npm run qa:raw-html                     # read-only channel-1 fallback
//   QA_BASE_URL=https://<prelaunch host> QA_PREVIEW_COOKIE='<name>=<value>' npm run qa:raw-html
//
// - Pages: the RAW_HTML_PAGES kinds (home, product, category) pinned for QA_CHANNEL
//   in scripts/qa/pages.mjs. A kind the channel has no page for yet is reported and
//   skipped, not failed.
// - Host: QA_BASE_URL, or else a local `stencil start` (scripts/qa/storefront.mjs),
//   reused when one is running and started and stopped here when not.
// - Assertions: every module in scripts/qa/raw-html/assertions/, loaded by file name,
//   so a ticket adds one by adding a file (scripts/qa/README.md).
//
// Exits 1 when an assertion fails or a page doesn't render, and 2 when the
// storefront can't be reached.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { RAW_HTML_PAGES, pinnedPages } from './pages.mjs';
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
    if (page.status !== 200) {
        return [
            result({ id: 'page-renders', ticket: 16, description: 'the page renders' }, 'fail', [`${page.path} returned HTTP ${page.status}`]),
            ...assertions.map(assertion => result(assertion, 'skip')),
        ];
    }
    return assertions.map(assertion => {
        if (!appliesTo(assertion, page.kind)) return result(assertion, 'skip');
        const problems = assertion.check(page);
        return result(assertion, problems.length ? 'fail' : 'pass', problems);
    });
}

export function pagesToFetch(pinned, kinds = RAW_HTML_PAGES) {
    return {
        fetch: kinds.filter(kind => pinned[kind]).map(kind => ({ kind, path: pinned[kind] })),
        missing: kinds.filter(kind => !pinned[kind]),
    };
}

// Follows up to five redirects by hand, so the preview cookie only ever goes to the
// QA_BASE_URL host it belongs to, never to a host a redirect points at.
export async function fetchPage(baseUrl, { kind, path: pagePath }, redirects = 5) {
    const url = new URL(pagePath, baseUrl);
    const headers = { ...HEADERS, Accept: 'text/html', 'User-Agent': USER_AGENT };
    if (PREVIEW_COOKIE && !IS_LOCAL && url.origin === new URL(BASE_URL).origin) headers.Cookie = PREVIEW_COOKIE;
    const response = await fetch(url, { headers, redirect: 'manual' });
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

const inActions = Boolean(process.env.GITHUB_ACTIONS);
const warn = message => console.log(inActions ? `::warning::${message}` : `WARNING  ${message}`);
const fail = message => console.error(inActions ? `::error::${message}` : `FAIL     ${message}`);

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
        const { fetch: pages, missing } = pagesToFetch(pinnedPages(QA_CHANNEL));
        console.log(`Raw HTML on channel ${QA_CHANNEL} at ${storefront.baseUrl}: ${assertions.length} assertions`);
        missing.forEach(kind => warn(`no ${kind} page is pinned for channel ${QA_CHANNEL} in scripts/qa/pages.mjs, so it isn't checked`));

        for (const entry of pages) {
            const page = await fetchPage(storefront.baseUrl, entry); // eslint-disable-line no-await-in-loop
            const results = checkPage(page, assertions);
            report(page, results);
            failures += results.filter(({ status }) => status === 'fail').length;
        }
    } catch (error) {
        console.error(`Couldn't fetch from ${storefront.baseUrl}: ${error.message}`);
        storefront.stop();
        process.exit(2);
    }
    storefront.stop();

    console.log(failures ? `\n${failures} raw-HTML check(s) failed.` : '\nEvery raw-HTML check passed.');
    process.exit(failures ? 1 : 0);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (isMain) main();
