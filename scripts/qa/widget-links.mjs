#!/usr/bin/env node
// The home widget link check (ticket 54a; ticket 54's raw-HTML test, "every link in the home
// widgets returns 200 with no redirect", which tickets 47 to 49 leave here): fetches the home page
// as a crawler gets it, with no JavaScript, finds every link inside a widget (an element with
// data-widget-id, as Page Builder and the Widgets API render one), and fetches each link once,
// without following redirects. A link passes only when it answers 200.
//
//   export QA_PORT=4300 && npm run qa:links            # ReelFlies_CA through stencil start
//   QA_BASE_URL=https://<prelaunch host> npm run qa:links   # with QA_PREVIEW_COOKIE read first
//
// - Pages: the home page pinned for QA_CHANNEL in pages.mjs. It must answer 200.
// - What is fetched: a link to the storefront, by path, or by the store's own host, which a
//   local run reads from ?debug=context and fetches through its own server. Each URL once.
// - What isn't, and why: another host (a WARNING, so a link to the live site from prelaunch shows),
//   a link that changes the cart or the session on a GET (read-only-posts.mjs, GET_WRITES; a
//   WARNING), a link within the page, and a mailto:, tel: or javascript: link.
// - Only GETs, with the preview cookie only to QA_BASE_URL's host, as raw-html.mjs sends it. A 5xx
//   or a 429 is asked again as retry.mjs says.
// - A home page with no widget yet passes with a WARNING: the widgets are tickets 46 to 49's, and
//   on 1895766 they wait for the store writes.
//
// Exits 1 when a link or the home page failed, and 2 when the storefront can't be reached.

import { isMain } from '../lib/is-main.mjs';
import { findTags, markupOnly, parseAttributes } from './raw-html/html.mjs';
import { fetchPage } from './raw-html.mjs';
import { getWrite } from './read-only-posts.mjs';
import { fetchWithRetries } from './retry.mjs';
import { pinnedChannel } from './pages.mjs';
import {
    HEADERS, IS_LOCAL, PREVIEW_COOKIE, QA_CHANNEL, useStorefront,
} from './storefront.mjs';

const USER_AGENT = 'ReelFliesQA/1.0 (widget links, no JavaScript)';
// HTML's void elements, which never have an end tag.
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TAG = /<(\/?)([a-z][a-z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ENTITIES = {
    '&amp;': '&', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&lt;': '<', '&gt;': '>',
};
const decode = text => text.replace(/&(?:amp|quot|lt|gt|#39|#x27);/gi, entity => ENTITIES[entity.toLowerCase()]);

// Every <a href> inside an element that carries data-widget-id, as { href, widget }, in page
// order, with the innermost widget's id. Comments, scripts and other text-only elements don't
// count (raw-html/html.mjs, markupOnly). Each open widget counts the start and end tags of its own
// element's name, so a <div> widget ends at the </div> that closes it.
export function widgetLinks(html) {
    const links = [];
    const open = [];
    for (const [, closing, rawName, attributes] of markupOnly(html).matchAll(TAG)) {
        const name = rawName.toLowerCase();
        if (closing) {
            open.forEach(widget => {
                if (widget.name === name) widget.depth -= 1; // eslint-disable-line no-param-reassign
            });
            while (open.length && open[open.length - 1].depth <= 0) open.pop();
        } else {
            const attrs = parseAttributes(attributes);
            const hasEnd = !VOID.has(name) && !/\/\s*$/.test(attributes);
            if (hasEnd) {
                open.forEach(widget => {
                    if (widget.name === name) widget.depth += 1; // eslint-disable-line no-param-reassign
                });
                if ('data-widget-id' in attrs) open.push({ name, id: attrs['data-widget-id'], depth: 1 });
            }
            if (name === 'a' && open.length && attrs.href !== undefined) links.push({ href: decode(attrs.href), widget: open[open.length - 1].id });
        }
    }
    return links;
}

// What to do with one link's href, found on `pageUrl`: { kind: 'check', url, path } to fetch it
// through `baseUrl`, { kind: 'skip', why, warn? } not to, or { kind: 'fail', why }. `own` lists
// the origins that are this storefront: the run's, and the store's own host on a local run.
export function classifyLink(href, { pageUrl, baseUrl, own }) {
    const text = href.trim();
    if (!text) return { kind: 'skip', why: 'an empty href' };
    let url;
    try {
        url = new URL(text, pageUrl);
    } catch {
        return { kind: 'fail', why: 'isn\'t a URL' };
    }
    if (!['http:', 'https:'].includes(url.protocol)) return { kind: 'skip', why: `a ${url.protocol} link, not a page` };
    const page = new URL(pageUrl);
    if (url.hash && url.origin === page.origin && url.pathname === page.pathname && url.search === page.search) return { kind: 'skip', why: 'a link within the page' };
    if (!own.includes(url.origin)) return { kind: 'skip', warn: true, why: `another host (${url.host}), not checked` };
    const target = new URL(`${url.pathname}${url.search}`, baseUrl);
    const write = getWrite({ method: 'GET', url: target.href });
    if (write) return { kind: 'skip', warn: true, why: `it changes the cart or the session on a GET (read-only-posts.mjs, ${write.id}), so it is never fetched` };
    return { kind: 'check', url: target.href, path: `${url.pathname}${url.search}` };
}

// One GET of `url`, with no redirect followed: { status, location }. The preview cookie goes only
// to `baseUrl`'s host.
export async function fetchLink(url, { baseUrl, cookie = '', log } = {}) {
    const headers = { ...HEADERS, Accept: 'text/html', 'User-Agent': USER_AGENT };
    if (cookie && new URL(url).origin === new URL(baseUrl).origin) headers.Cookie = cookie;
    const response = await fetchWithRetries(url, { headers, redirect: 'manual' }, { what: `the widget link ${new URL(url).pathname}`, log });
    await response.arrayBuffer();
    return { status: response.status, location: response.headers.get('location') };
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const inWidgets = ids => `in widget ${[...new Set(ids)].join(', ')}`;

// Fetches the home page at `baseUrl` and checks every widget link on it. Resolves to
// { failures, lines }: the lines to print, and how many links (or the page itself) failed.
export async function checkWidgetLinks({
    baseUrl, homePath = '/', own, cookie = '', log = console.log, getPage = fetchPage,
}) {
    const lines = [];
    const page = await getPage(baseUrl, { key: 'home', kind: 'home', path: homePath });
    if (page.status !== 200) {
        lines.push(`FAIL     the home page ${homePath} answered HTTP ${page.status}, not 200`);
        return { failures: 1, lines };
    }
    const links = widgetLinks(page.html);
    const widgets = findTags(page.html).filter(({ attrs }) => 'data-widget-id' in attrs).length;
    const checks = new Map();
    const other = [];
    for (const link of links) {
        const verdict = classifyLink(link.href, { pageUrl: page.url, baseUrl, own });
        if (verdict.kind === 'check') {
            if (!checks.has(verdict.url)) checks.set(verdict.url, { path: verdict.path, widgets: [] });
            checks.get(verdict.url).widgets.push(link.widget);
        } else {
            other.push({ ...link, ...verdict });
        }
    }
    lines.push(`Widget links on the home page (${homePath}) at ${baseUrl}: ${plural(widgets, 'widget')}, ${plural(links.length, 'link')}, ${checks.size} to fetch; no JavaScript runs`);
    if (!widgets) lines.push('WARNING  the home page has no widget (no data-widget-id in its server HTML), so no link was checked. Its widgets are tickets 46 to 49\'s.');

    let failures = 0;
    for (const [url, { path: linkPath, widgets: ids }] of checks) {
        let line;
        try {
            const { status, location } = await fetchLink(url, { baseUrl, cookie, log }); // eslint-disable-line no-await-in-loop
            const times = ids.length > 1 ? `, linked ${ids.length} times` : '';
            if (status === 200) line = `ok       ${linkPath} (200)${times}, ${inWidgets(ids)}`;
            else if (status >= 300 && status < 400) line = `FAIL     ${linkPath} redirects (${status}) to ${location ?? 'nowhere'}, ${inWidgets(ids)}`;
            else line = `FAIL     ${linkPath} answered HTTP ${status}, ${inWidgets(ids)}`;
        } catch (error) {
            line = `FAIL     ${linkPath} couldn't be fetched (${error.message}), ${inWidgets(ids)}`;
        }
        if (line.startsWith('FAIL')) failures += 1;
        lines.push(line);
    }
    for (const {
        href, widget, kind, why, warn,
    } of other) {
        if (kind === 'fail') failures += 1;
        lines.push(`${(kind === 'fail' && 'FAIL     ') || (warn && 'WARNING  ') || 'skipped  '}${href || '(empty)'} in widget ${widget}: ${why}`);
    }
    lines.push('', failures ? `${plural(failures, 'widget link')} failed.` : `Every widget link answered 200 (${checks.size} fetched).`);
    return { failures, lines };
}

// The origins of the store a local stencil start renders, from its ?debug=context: links in a
// widget may name the store's own host instead of a path.
async function storeOrigins(baseUrl) {
    const response = await fetchWithRetries(`${baseUrl}/?debug=context`, { headers: HEADERS }, { what: 'the page context /?debug=context' });
    if (!response.ok) throw new Error(`/?debug=context answered HTTP ${response.status}`);
    const { settings = {} } = await response.json();
    return [settings.base_url, settings.secure_base_url].filter(Boolean).map(url => new URL(url).origin);
}

async function main() {
    let storefront;
    try {
        const homePath = pinnedChannel(QA_CHANNEL).pages.home;
        if (!homePath) throw new Error(`channel ${QA_CHANNEL} pins no home page in scripts/qa/pages.mjs, so there are no home widgets to check`);
        storefront = await useStorefront();
        const own = [new URL(storefront.baseUrl).origin, ...(IS_LOCAL ? await storeOrigins(storefront.baseUrl) : [])];
        const { failures, lines } = await checkWidgetLinks({
            baseUrl: storefront.baseUrl, homePath, own: [...new Set(own)], cookie: IS_LOCAL ? '' : PREVIEW_COOKIE,
        });
        await storefront.stop();
        lines.forEach(line => console.log(line));
        process.exit(failures ? 1 : 0);
    } catch (error) {
        console.error(`STOP     ${error.message}`);
        await storefront?.stop();
        process.exit(2);
    }
}

if (isMain(import.meta.url)) main();
