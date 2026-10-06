// The analytics and marketing tags the storefront gates block (W0-6): one list, used by every
// Playwright gate (network-guard.mjs, through fixtures.mjs) and by ticket 17's Lighthouse
// runner (lighthouseBlockedUrlPatterns).
//
// Why: the prelaunch host and the live stores load GA4 G-BQ4RFFK3KW (which reports into live
// reelflies.ca), Universal Analytics UA-1225874-8, the Meta Pixel 2233770690192958 and
// Omnisend. A gate's page view, add to cart or test order would count as a visit there. A
// local stencil start serves none of these tags today (803 gate requests checked, 2026-10-06),
// but a store setting can add one at any time, so every run blocks them.
//
// - An entry's `host` matches that host and its subdomains, never a look-alike
//   (notgoogletagmanager.com) or a host that only starts with it. A `path` limits it to that
//   path and the paths below it, whatever the query.
// - Blocking the loaders (gtag.js, fbevents.js, Omnisend's launcher) stops every beacon they
//   would send. The beacon hosts are listed too, for the <noscript> pixels and for tags added
//   inline.
// - Blocking is on by default. QA_ANALYTICS=allow opts out, and only on the prelaunch host
//   before the Flip (analyticsMode); a GA4 hostname filter can then keep the run out of the
//   reports, which it can't for live reelflies.ca or reelflies.com.
// - The Flip date comes from W0-13's release calendar (scripts/lib/release-calendar.mjs), and
//   is reached at midnight in Toronto. network-guard.mjs reads it too: from the Flip,
//   ReelFlies_CA is live reelflies.ca, so every write is refused there as well.

import { readCalendar, todayInToronto } from '../lib/release-calendar.mjs';

// The prelaunch host: ReelFlies_CA (1895766), behind the control panel's preview cookie.
export const PRELAUNCH_URL = 'https://reelflies_ca-1895766.mybigcommerce.com';

export const ANALYTICS_HOSTS = [
    { host: 'googletagmanager.com', what: "Google's tag loader: gtag.js, which loads GA4 G-BQ4RFFK3KW and UA-1225874-8, and gtm.js" },
    { host: 'google-analytics.com', what: 'GA4 and the legacy Universal Analytics endpoints: analytics.js, ga.js and the /collect, /j/collect, /r/collect and /g/collect beacons on www., ssl. and region1.' },
    { host: 'analytics.google.com', what: "GA4's beacon host (region1.analytics.google.com/g/collect)" },
    { host: 'doubleclick.net', what: "Google's ad and remarketing beacons, stats.g.doubleclick.net/r/collect (UA) and /g/collect (GA4) among them" },
    { host: 'connect.facebook.net', what: "the Meta Pixel's script, fbevents.js, and its config (pixel 2233770690192958)" },
    { host: 'facebook.com', path: '/tr', what: "the Meta Pixel's beacon, the <noscript> image included" },
    { host: 'omnisnippet1.com', what: "Omnisend's launcher, inshop/bigcommerce-launcher.js" },
    { host: 'omnisrc.com', what: "Omnisend's older launcher and its signup forms (forms.omnisrc.com)" },
    { host: 'soundestlink.com', what: "Omnisend's event beacons (events.soundestlink.com, pn.soundestlink.com)" },
    { host: 'omnisendlink.com', what: "Omnisend's web tracking (wt.omnisendlink.com)" },
    { host: 'omnisend.com', what: "Omnisend's API and form hosts (api.omnisend.com, app.omnisend.com)" },
    { host: 'bes.gcp.data.bigcommerce.com', what: "BigCommerce's visitor beacon (POST /nobot), which counts a visit in the store's own analytics" },
    { host: 'microapps.bigcommerce.com', path: '/bodl-events', what: "BigCommerce's data layer events, which feed GA4 and the store's analytics" },
];

const urlOf = value => {
    try {
        return new URL(value);
    } catch {
        return null;
    }
};

const onHost = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);
const onPath = (pathname, path) => !path || pathname === path || pathname.startsWith(`${path}/`);

// The list entry a URL belongs to, or null.
export function analyticsEntry(value) {
    const url = urlOf(value);
    if (!url || !/^(https?|wss?):$/.test(url.protocol)) return null;
    return ANALYTICS_HOSTS.find(entry => onHost(url.hostname, entry.host) && onPath(url.pathname, entry.path)) || null;
}

export const isAnalyticsUrl = value => Boolean(analyticsEntry(value));

// A URL on the entry's host (a subdomain of it, as the tags use) that carries no real
// measurement id, for the browser self-test (harness-selftest.spec.mjs).
export function sampleUrl(entry) {
    const host = entry.host.split('.').length > 2 ? entry.host : `www.${entry.host}`;
    return `https://${host}${entry.path || ''}/rf-qa-selftest`;
}

// The same list as Lighthouse's blockedUrlPatterns (ticket 17). Chrome's Network.setBlockedURLs
// finds each '*'-separated part of a pattern in the URL in order, so `*://host/*` and
// `*://*.host/*` block the host and its subdomains but no look-alike. A path pattern can also
// match a longer path that starts the same way (facebook.com/trending), which no storefront
// requests.
export function lighthouseBlockedUrlPatterns() {
    return ANALYTICS_HOSTS.flatMap(({ host, path }) => (path
        ? [`*://${host}${path}*`, `*://*.${host}${path}*`]
        : [`*://${host}/*`, `*://*.${host}/*`]));
}

export function isPrelaunchHost(value) {
    const url = value ? urlOf(value) : null;
    return Boolean(url) && url.origin === new URL(PRELAUNCH_URL).origin;
}

// The Flip date in the release calendar (scripts/release-calendar.json, W0-13), or null while it
// has none. A missing or malformed calendar throws, and so stops the run: a typo must never
// read as "no Flip", which would refuse nothing.
export const readFlip = file => readCalendar(file).flip;

// Whether `today` is on or after the Flip, by the date in Toronto, where the store is, as W0-13
// starts its phases. `flip` is read from the calendar when it isn't given.
export function isAfterFlip({ today = new Date(), flip = readFlip() } = {}) {
    return Boolean(flip) && todayInToronto(today) >= flip;
}

// Whether a run blocks the tags: { blocked }. Throws when QA_ANALYTICS asks for something the
// run may not do. `flip` is read from the calendar when it isn't given.
export function analyticsMode({ env = process.env, today = new Date(), flip } = {}) {
    const value = env.QA_ANALYTICS || 'block';
    if (value === 'block') return { blocked: true };
    if (value !== 'allow') throw new Error(`QA_ANALYTICS must be "allow", or "block" (the default), not "${value}"`);

    const base = env.QA_BASE_URL;
    if (!isPrelaunchHost(base)) {
        const where = base ? (urlOf(base)?.origin || `"${base}"`) : 'a local stencil start';
        throw new Error(`QA_ANALYTICS=allow is refused on ${where}: the tags may load only on the prelaunch host (${PRELAUNCH_URL}), where a GA4 hostname filter can keep the run out of the reports. Unset QA_ANALYTICS to block them.`);
    }
    const flipDate = flip === undefined ? readFlip() : flip;
    if (isAfterFlip({ today, flip: flipDate })) {
        throw new Error(`QA_ANALYTICS=allow is refused from the Flip (${flipDate}) on: the prelaunch host is then live reelflies.ca, and no filter can tell a run from a real visit. Unset QA_ANALYTICS to block the tags.`);
    }
    return { blocked: false };
}

// What every result records.
export const analyticsRecord = ({ blocked }) => `analytics blocked: ${blocked ? 'yes' : 'no'}`;
