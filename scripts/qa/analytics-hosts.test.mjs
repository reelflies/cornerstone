// The analytics and marketing tags the storefront gates block (scripts/qa/analytics-hosts.mjs,
// W0-6):
//
// - One list: Google's tag loader and GA4, the legacy Universal Analytics endpoints, the Meta
//   Pixel, Omnisend's script and beacon hosts, and BigCommerce's own visitor beacons. The
//   URLs below are the ones live reelflies.ca and the prelaunch host load (2026-10-06).
// - It matches a host and its subdomains, never a look-alike, and a path only where one is
//   listed, so the store's own pages, its CDN and its fonts load.
// - Ticket 17's Lighthouse runner passes the same list as blockedUrlPatterns.
// - Blocking is on by default. QA_ANALYTICS=allow opts out, only on the prelaunch host and
//   only before the Flip; anything else is refused.
//
//   node --test scripts/qa/analytics-hosts.test.mjs

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    ANALYTICS_HOSTS, PRELAUNCH_URL, analyticsMode, analyticsRecord, isAnalyticsUrl, isPrelaunchHost, lighthouseBlockedUrlPatterns,
    readFlipDate, sampleUrl,
} from './analytics-hosts.mjs';

// Requests the tags on live reelflies.ca and the prelaunch host make, or would make once a
// shopper accepts them (the page source and Omnisend's launcher, 2026-10-06).
const TAGS = [
    'https://www.googletagmanager.com/gtag/js?id=G-BQ4RFFK3KW',
    'https://www.googletagmanager.com/gtag/js?id=UA-1225874-8',
    'https://www.googletagmanager.com/gtm.js?id=GTM-RFQA',
    'https://region1.google-analytics.com/g/collect?v=2&tid=G-BQ4RFFK3KW',
    'https://www.google-analytics.com/analytics.js',
    'https://www.google-analytics.com/collect?v=1&tid=UA-1225874-8',
    'https://www.google-analytics.com/j/collect?v=1&tid=UA-1225874-8',
    'https://ssl.google-analytics.com/ga.js',
    'https://stats.g.doubleclick.net/r/collect?v=1&tid=UA-1225874-8',
    'https://stats.g.doubleclick.net/g/collect?v=2&tid=G-BQ4RFFK3KW',
    'https://region1.analytics.google.com/g/collect?v=2&tid=G-BQ4RFFK3KW',
    'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/1/',
    'https://connect.facebook.net/en_US/fbevents.js',
    'https://connect.facebook.net/signals/config/2233770690192958',
    'https://www.facebook.com/tr?id=2233770690192958&ev=PageView&noscript=1',
    'https://www.facebook.com/tr/?id=2233770690192958&ev=PageView',
    'https://omnisnippet1.com/inshop/bigcommerce-launcher.js?v=2026-10-06T14',
    'https://omnisrc.com/inshop/bigcommerce-launcher.js?v=2026-10-06T14',
    'https://forms.omnisrc.com/forms/rf',
    'https://events.soundestlink.com/events/saveNewsletterOrder/?shopID=8pfqkn26ea',
    'https://pn.soundestlink.com/rf',
    'https://wt.omnisendlink.com/rf',
    'https://api.omnisend.com/rf',
    'https://app.omnisend.com/REST/forms/rf',
    'https://bes.gcp.data.bigcommerce.com/nobot',
    'https://microapps.bigcommerce.com/bodl-events/1.9.4/index.js',
];

// Requests the gates need: the storefront, its CDN and fonts, and look-alikes of listed hosts.
const NOT_TAGS = [
    'http://localhost:3301/',
    'http://localhost:3301/stencil/00000000-0000-0000-0000-000000000001/dist/theme-bundle.main.js',
    'http://localhost:3301/remote/v1/product-attributes/6178',
    'https://reelflies.ca/realistic-flying-hot-butt-hopper-brown/',
    `${PRELAUNCH_URL}/cart.php`,
    'https://cdn11.bigcommerce.com/s-3abcd/images/stencil/500x659/products/6178/1/fly.jpg',
    'https://cdn11.bigcommerce.com/shared/js/storefront/consent-manager-08633fe1.js',
    'https://cdn11.bigcommerce.com/shared/js/bodl-consent-32a446f5.js',
    'https://checkout-sdk.bigcommerce.com/v1/loader.js',
    'https://microapps.bigcommerce.com/other-app/index.js',
    'https://fonts.googleapis.com/css?family=Karla:400',
    'https://fonts.gstatic.com/s/karla/v1/karla.woff2',
    'https://www.google.com/recaptcha/api.js',
    'https://www.facebook.com/reelflies',
    'https://www.facebook.com/translations/rf',
    'https://notgoogletagmanager.com/gtag/js',
    'https://google-analytics.com.rf-qa-selftest.test/collect',
    'https://omnisend.com.rf-qa-selftest.test/',
    'https://www.youtube.com/embed/rf',
];

describe('the list', () => {
    it('names every tag the live and prelaunch hosts load, and the legacy UA endpoints', () => {
        const missed = TAGS.filter(url => !isAnalyticsUrl(url));
        assert.deepEqual(missed, []);
    });

    it('leaves the storefront, its CDN, its fonts and look-alike hosts alone', () => {
        const caught = NOT_TAGS.filter(url => isAnalyticsUrl(url));
        assert.deepEqual(caught, []);
    });

    it('says what each entry is for', () => {
        for (const entry of ANALYTICS_HOSTS) {
            assert.match(entry.host, /^[a-z0-9.-]+\.[a-z]+$/, JSON.stringify(entry));
            assert.ok(entry.what && entry.what.length > 10, `${entry.host} says what it blocks`);
            if (entry.path) assert.match(entry.path, /^\/[a-z0-9/-]+$/, entry.host);
        }
    });

    it('covers each entry with the sample URL the browser self-test requests', () => {
        for (const entry of ANALYTICS_HOSTS) {
            const url = sampleUrl(entry);
            assert.ok(isAnalyticsUrl(url), url);
            assert.match(new URL(url).pathname, /rf-qa-selftest/, `${url} carries no real measurement id`);
        }
    });

    it('reads anything that isn\'t a URL as no tag', () => {
        assert.equal(isAnalyticsUrl('data:image/png;base64,AAAA'), false);
        assert.equal(isAnalyticsUrl('not a url'), false);
    });
});

// Chrome's Network.setBlockedURLs (which Lighthouse's blockedUrlPatterns uses) splits a pattern
// on '*' and finds each part in the URL, in order (Blink's inspector_network_agent.cc).
const blinkMatches = (url, pattern) => {
    let at = 0;
    return pattern.split('*').every(part => {
        const found = url.indexOf(part, at);
        if (found === -1) return false;
        at = found + part.length;
        return true;
    });
};
const blockedByLighthouse = url => lighthouseBlockedUrlPatterns().some(pattern => blinkMatches(url, pattern));

describe('Lighthouse\'s blockedUrlPatterns (ticket 17)', () => {
    it('blocks every tag the gates block', () => {
        assert.deepEqual(TAGS.filter(url => !blockedByLighthouse(url)), []);
        assert.deepEqual(ANALYTICS_HOSTS.map(sampleUrl).filter(url => !blockedByLighthouse(url)), []);
    });

    it('lets the storefront, its CDN, its fonts and look-alike hosts load', () => {
        // Chrome can't anchor a pattern's end, so facebook.com/tr also matches longer paths
        // that start the same way, such as /translations. A storefront never requests them.
        const loose = ['https://www.facebook.com/translations/rf'];
        assert.deepEqual(NOT_TAGS.filter(url => !loose.includes(url) && blockedByLighthouse(url)), []);
    });

    it('uses no wildcard but *', () => {
        for (const pattern of lighthouseBlockedUrlPatterns()) assert.doesNotMatch(pattern, /[?[\]]/, pattern);
    });
});

describe('QA_ANALYTICS', () => {
    const today = new Date(2026, 9, 6, 12);
    const mode = (env, flip = null) => analyticsMode({ env, today, flip });

    it('blocks the tags by default, and records it', () => {
        assert.deepEqual(mode({}), { blocked: true });
        assert.deepEqual(mode({ QA_ANALYTICS: '' }), { blocked: true });
        assert.deepEqual(mode({ QA_ANALYTICS: 'block' }), { blocked: true });
        assert.equal(analyticsRecord(mode({})), 'analytics blocked: yes');
    });

    it('lets them load on the prelaunch host when asked, and records that', () => {
        assert.deepEqual(mode({ QA_ANALYTICS: 'allow', QA_BASE_URL: PRELAUNCH_URL }), { blocked: false });
        assert.deepEqual(mode({ QA_ANALYTICS: 'allow', QA_BASE_URL: `${PRELAUNCH_URL}/` }), { blocked: false });
        assert.equal(analyticsRecord({ blocked: false }), 'analytics blocked: no');
    });

    it('refuses to let them load on a local stencil start', () => {
        assert.throws(() => mode({ QA_ANALYTICS: 'allow' }), /QA_ANALYTICS=allow is refused on a local stencil start: .*only on the prelaunch host/);
    });

    it('refuses to let them load on live reelflies.ca, reelflies.com or any other host', () => {
        for (const host of ['https://reelflies.ca', 'https://www.reelflies.com', 'http://reelflies_ca-1895766.mybigcommerce.com', 'https://reelflies_ca-1895766.mybigcommerce.com.rf-qa-selftest.test']) {
            assert.throws(() => mode({ QA_ANALYTICS: 'allow', QA_BASE_URL: host }), /QA_ANALYTICS=allow is refused on .*: .*only on the prelaunch host/, host);
        }
    });

    it('refuses to let them load from the Flip on, when the prelaunch host is live reelflies.ca', () => {
        assert.deepEqual(mode({ QA_ANALYTICS: 'allow', QA_BASE_URL: PRELAUNCH_URL }, '2026-10-07'), { blocked: false });
        assert.throws(() => mode({ QA_ANALYTICS: 'allow', QA_BASE_URL: PRELAUNCH_URL }, '2026-10-06'), /the Flip \(2026-10-06\)/);
        assert.throws(() => mode({ QA_ANALYTICS: 'allow', QA_BASE_URL: PRELAUNCH_URL }, '2026-09-30'), /the Flip \(2026-09-30\)/);
    });

    it('refuses any other value', () => {
        assert.throws(() => mode({ QA_ANALYTICS: 'yes' }), /QA_ANALYTICS must be "allow", or "block" \(the default\), not "yes"/);
        assert.throws(() => mode({ QA_ANALYTICS: 'ALLOW' }), /not "ALLOW"/);
    });

    it('knows the prelaunch host by its origin only', () => {
        assert.equal(isPrelaunchHost(PRELAUNCH_URL), true);
        assert.equal(isPrelaunchHost(`${PRELAUNCH_URL}/cart.php`), true);
        assert.equal(isPrelaunchHost(undefined), false);
        assert.equal(isPrelaunchHost('not a url'), false);
        assert.equal(isPrelaunchHost('https://reelflies.ca'), false);
    });
});

describe('the Flip date, from the release calendar (W0-13)', () => {
    const dirs = [];
    after(() => dirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));
    const calendar = text => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rf-calendar-'));
        dirs.push(dir);
        const file = path.join(dir, 'release-calendar.json');
        if (text !== undefined) fs.writeFileSync(file, text);
        return file;
    };

    it('is none while the calendar is missing or has no date', () => {
        assert.equal(readFlipDate(calendar()), null);
        assert.equal(readFlipDate(calendar('{"flip": null, "status": "provisional", "source": "ticket 10"}')), null);
    });

    it('is the calendar\'s date', () => {
        assert.equal(readFlipDate(calendar('{"flip": "2027-02-15", "status": "set", "source": "ticket 10"}')), '2027-02-15');
    });

    it('can\'t be read from a calendar that isn\'t one', () => {
        assert.throws(() => readFlipDate(calendar('{ flip: soon')), /can't read the Flip date from .*release-calendar\.json/);
        assert.throws(() => readFlipDate(calendar('{"flip": "15 Feb"}')), /"flip" must be a date \(YYYY-MM-DD\) or null/);
    });
});

describe('the gates, as they load (checkEnv in storefront.mjs)', () => {
    const CONFIG = pathToFileURL(path.resolve('scripts/qa/playwright.config.mjs')).href;
    // Loads the Playwright config in a process of its own, with only `env` among the QA_ variables.
    const load = env => {
        const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('QA_') && !name.startsWith('RF_QA_')));
        return spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(CONFIG)});`], {
            encoding: 'utf8', env: { ...clean, RF_QA_PORTS_CHECKED: '1', ...env },
        });
    };

    it('refuse QA_ANALYTICS=allow on a local stencil start, before any server starts', () => {
        const { status, stderr } = load({ QA_ANALYTICS: 'allow' });
        assert.notEqual(status, 0);
        assert.match(stderr, /QA_ANALYTICS=allow is refused on a local stencil start/);
    });

    it('refuse QA_ANALYTICS=allow on a live host', () => {
        const { status, stderr } = load({ QA_ANALYTICS: 'allow', QA_BASE_URL: 'https://reelflies.ca' });
        assert.notEqual(status, 0);
        assert.match(stderr, /QA_ANALYTICS=allow is refused on https:\/\/reelflies\.ca/);
    });

    it('load with QA_ANALYTICS=allow on the prelaunch host', () => {
        const { status, stderr } = load({ QA_ANALYTICS: 'allow', QA_BASE_URL: PRELAUNCH_URL });
        assert.equal(status, 0, stderr);
    });
});
