// The third-party script budget check (ticket 23): which scripts a storefront page's HTML loads,
// where and how, whether each is consent-tagged, and the third-party total against 150 KB gzip.
//
//   node --test scripts/integrations/script-budget.test.mjs

import crypto from 'crypto';
import zlib from 'zlib';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUDGET_GZIP, measure, parseScripts, report, run, scriptOwner,
} from './script-budget.mjs';

const PAGE = 'https://reelflies.ca/';
const PRELAUNCH = 'https://reelflies_ca-1895766.mybigcommerce.com/';
const COOKIE = 'STORESUITE_CP_TOKEN=rf-secret-cp-token; SHOP_SESSION_TOKEN=rf-secret-session';
const HTML = `<!doctype html><html><head>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST12345"></script>
<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('config', 'G-TEST12345');</script>
<script src="https://cdn11.bigcommerce.com/s-abc/stencil/x/dist/theme-bundle.head_async.js" async></script>
<script type="text/plain" data-bc-cookie-consent="3" src="https://connect.facebook.net/en_US/fbevents.js"></script>
</head><body>
<script>var BCData = {};</script>
<script defer src="/assets/js/theme.js"></script>
<script type="text/javascript" src="https://omnisnippet1.com/inshop/launcher-v2.js" data-consent-category="analytics"></script>
<script src='https://microapps.bigcommerce.com/bodl-events/index.js'></script>
<script>// SOUNDEST-V6-1
window.SOUNDEST = {};</script>
</body></html>`;

describe('scriptOwner', () => {
    it('sorts a script into the store\'s own (the page\'s host, BigCommerce) or a third party', () => {
        assert.equal(scriptOwner('https://reelflies.ca/assets/x.js', PAGE), 'store');
        assert.equal(scriptOwner('https://cdn11.bigcommerce.com/s-abc/x.js', PAGE), 'BigCommerce');
        assert.equal(scriptOwner('https://microapps.bigcommerce.com/bodl-events/index.js', PAGE), 'BigCommerce');
        assert.equal(scriptOwner('https://www.googletagmanager.com/gtag/js?id=G-1', PAGE), 'third party');
        assert.equal(scriptOwner('https://notbigcommerce.com/x.js', PAGE), 'third party');
    });
});

describe('parseScripts', () => {
    const scripts = parseScripts(HTML, PAGE);

    it('lists every script in order, in the head or the body, with its URL resolved', () => {
        assert.deepEqual(scripts.map(script => [script.where, script.src || 'inline', script.owner]), [
            ['head', 'https://www.googletagmanager.com/gtag/js?id=G-TEST12345', 'third party'],
            ['head', 'inline', 'third party'],
            ['head', 'https://cdn11.bigcommerce.com/s-abc/stencil/x/dist/theme-bundle.head_async.js', 'BigCommerce'],
            ['head', 'https://connect.facebook.net/en_US/fbevents.js', 'third party'],
            ['body', 'inline', 'store'],
            ['body', 'https://reelflies.ca/assets/js/theme.js', 'store'],
            ['body', 'https://omnisnippet1.com/inshop/launcher-v2.js', 'third party'],
            ['body', 'https://microapps.bigcommerce.com/bodl-events/index.js', 'BigCommerce'],
            ['body', 'inline', 'third party'],
        ]);
    });

    it('says how each loads, and whether it waits for consent', () => {
        assert.equal(scripts[0].load, 'async');
        assert.equal(scripts[5].load, 'defer');
        assert.equal(scripts[6].load, 'blocking');
        assert.equal(scripts[1].load, 'inline');
        assert.equal(scripts[3].consent, 'type="text/plain" data-bc-cookie-consent="3"');
        assert.equal(scripts[6].consent, 'data-consent-category="analytics"');
        assert.equal(scripts[0].consent, '');
    });

    it('names an inline third-party snippet by what it carries', () => {
        assert.match(scripts[1].what, /gtag/);
        assert.match(scripts[8].what, /Omnisend/);
        assert.equal(scripts[4].what, '');
    });

    it('follows the script files an inline snippet injects (the store\'s GA4, Meta Pixel and Omnisend snippets), with the snippet\'s consent tagging', () => {
        const injected = parseScripts(`<html><head>
<script>function setupGtag() { var script = document.createElement('script'); script.src = 'https://www.googletagmanager.com/gtag/js?id=G-TEST12345'; script.async = true; } gtag('config', 'G-TEST12345');</script>
<script>!function(f,b,e,v){}(window, document,'script', 'https://connect.facebook.net/en_US/fbevents.js'); fbq('init', '1');</script>
</head><body>
<script type="text/plain" data-bc-cookie-consent="2">// SOUNDEST-V6-SM
window.SOUNDEST = {}; SOUNDEST.baseURL = "https://omnisnippet1.com/"; SOUNDEST.jsFile = "bigcommerce-launcher.js";</script>
<script type="text/plain" data-bc-cookie-consent="2">// SOUNDEST-V6-2-S
window.SOUNDEST = {}; SOUNDEST.baseURL = "https://omnisrc.com/"; n.src=e+"inshop/bigcommerce-launcher.js?v="+t;</script>
<script>var notThirdParty = 'https://reelflies.ca/x.js';</script>
</body></html>`, PAGE);
        assert.deepEqual(injected.map(script => [script.src || 'inline', script.load, script.consent, script.what]), [
            ['inline', 'inline', '', 'Google tag (gtag)'],
            ['https://www.googletagmanager.com/gtag/js?id=G-TEST12345', 'injected', '', 'injected by the Google tag (gtag) snippet above'],
            ['inline', 'inline', '', 'Meta Pixel'],
            ['https://connect.facebook.net/en_US/fbevents.js', 'injected', '', 'injected by the Meta Pixel snippet above'],
            ['inline', 'inline', 'type="text/plain" data-bc-cookie-consent="2"', 'Omnisend'],
            ['https://omnisnippet1.com/inshop/bigcommerce-launcher.js', 'injected', 'type="text/plain" data-bc-cookie-consent="2"', 'injected by the Omnisend snippet above'],
            ['inline', 'inline', 'type="text/plain" data-bc-cookie-consent="2"', 'Omnisend'],
            ['https://omnisrc.com/inshop/bigcommerce-launcher.js', 'injected', 'type="text/plain" data-bc-cookie-consent="2"', 'injected by the Omnisend snippet above'],
            ['inline', 'inline', '', ''],
        ]);
        assert.ok(injected.filter(script => script.load === 'injected').every(script => script.owner === 'third party'));
    });
});

describe('measure and report', () => {
    const bodies = {
        'https://www.googletagmanager.com/gtag/js?id=G-TEST12345': `${'a'.repeat(5000)}gtag`,
        'https://connect.facebook.net/en_US/fbevents.js': 'fbq'.repeat(3000),
        'https://omnisnippet1.com/inshop/launcher-v2.js': 'omni'.repeat(1000),
    };
    const fetched = [];
    const fakeFetch = async (url, options = {}) => {
        fetched.push({ url, cookie: options.headers && options.headers.Cookie });
        if (url === PAGE) return { ok: true, status: 200, text: async () => HTML };
        if (bodies[url]) return { ok: true, status: 200, text: async () => bodies[url] };
        return { ok: false, status: 404, text: async () => '' };
    };

    it('fetches the page, then each third-party script once, without the cookie, and totals their gzip sizes', async () => {
        fetched.length = 0;
        const result = await measure(PAGE, { fetch: fakeFetch });
        assert.deepEqual(fetched.map(call => call.url), [PAGE, ...Object.keys(bodies)]);
        assert.ok(fetched.every(call => call.cookie === undefined));
        const gzip = text => zlib.gzipSync(text, { level: 9 }).length;
        const inline = result.scripts.filter(script => script.owner === 'third party' && !script.src).reduce((sum, script) => sum + script.gzip, 0);
        assert.equal(result.thirdPartyGzip, Object.values(bodies).reduce((sum, body) => sum + gzip(body), 0) + inline);
        assert.equal(result.withinBudget, result.thirdPartyGzip <= BUDGET_GZIP);
        const lines = report(result).join('\n');
        assert.match(lines, /\| head \| https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-TEST12345 \| third party \| async \| none \|/);
        assert.match(lines, /Third-party total: [\d,]+ B gzip of the 150 KB budget/);
        assert.match(lines, /only what the HTML names/);
    });

    it('sends the preview cookie to the prelaunch host\'s page only, and refuses it anywhere else', async () => {
        fetched.length = 0;
        const prelaunch = 'https://reelflies_ca-1895766.mybigcommerce.com/';
        const cookieFetch = async (url, options = {}) => {
            fetched.push({ url, cookie: options.headers && options.headers.Cookie });
            return url === prelaunch ? { ok: true, status: 200, text: async () => HTML } : fakeFetch(url, {});
        };
        await measure(prelaunch, { fetch: cookieFetch, cookie: 'SHOP_SESSION_TOKEN=abc' });
        assert.equal(fetched[0].cookie, 'SHOP_SESSION_TOKEN=abc');
        assert.ok(fetched.slice(1).every(call => call.cookie === undefined));
        await assert.rejects(measure(PAGE, { fetch: fakeFetch, cookie: 'SHOP_SESSION_TOKEN=abc' }), /only to the prelaunch host/);
    });

    it('refuses a page that isn\'t https, and says when the page didn\'t answer 200', async () => {
        await assert.rejects(measure('http://reelflies.ca/', { fetch: fakeFetch }), /https/);
        await assert.rejects(measure('https://reelflies.ca/missing', { fetch: fakeFetch }), /answered 404/);
    });

    it('records a script it couldn\'t fetch instead of stopping', async () => {
        const result = await measure(PAGE, { fetch: async url => (url === PAGE ? { ok: true, status: 200, text: async () => HTML } : { ok: false, status: 403, text: async () => '' }) });
        const gtag = result.scripts.find(script => script.src && script.src.includes('gtag'));
        assert.equal(gtag.error, 'answered 403');
        assert.match(report(result).join('\n'), /not measured: answered 403/);
    });
});

describe('the preview cookie never goes through a redirect', () => {
    it('is sent with redirect "manual", so a 302 stops the run after that one request instead of being followed', async () => {
        const calls = [];
        const redirecting = async (url, options = {}) => {
            calls.push({ url, redirect: options.redirect, cookie: options.headers && options.headers.Cookie });
            return { ok: false, status: 302, text: async () => '' };
        };
        await assert.rejects(measure(PRELAUNCH, { fetch: redirecting, cookie: COOKIE }), /answered 302/);
        assert.deepEqual(calls, [{ url: PRELAUNCH, redirect: 'manual', cookie: COOKIE }]);
    });
});

// The command as Shaun runs it, with stand-ins for the network, the shell and the output.
async function command(argv, { env = {}, fetch: fetchImpl } = {}) {
    const out = [];
    const err = [];
    const code = await run(argv, {
        env, fetch: fetchImpl, log: line => out.push(line), error: line => err.push(line),
    });
    return {
        code, out, err, printed: [...out, ...err].join('\n'),
    };
}

describe('script-budget.mjs, the command', () => {
    const answering = (pages, calls = []) => async (url, options = {}) => {
        calls.push({ url, cookie: options.headers && options.headers.Cookie });
        if (pages[url] !== undefined) return { ok: true, status: 200, text: async () => pages[url] };
        return { ok: false, status: 404, text: async () => '' };
    };

    it('never prints the preview cookie, even when the page names its values in a script URL', async () => {
        const calls = [];
        const echoing = '<html><head><script async src="https://cdn.example.net/t.js?a=rf-secret-cp-token&b=rf-secret-session"></script></head><body></body></html>';
        const run1 = await command([PRELAUNCH], { env: { QA_PREVIEW_COOKIE: COOKIE }, fetch: answering({ [PRELAUNCH]: echoing }, calls) });
        assert.equal(calls[0].cookie, COOKIE, 'the cookie went to the prelaunch page');
        assert.ok(calls.slice(1).every(call => call.cookie === undefined), 'and to nothing else');
        assert.match(run1.printed, /cdn\.example\.net\/t\.js\?a=\[redacted\]&b=\[redacted\]/, 'the row is printed, redacted');
        assert.doesNotMatch(run1.printed, /rf-secret/);
    });

    it('never prints it on the STOP path, when the error names the cookie', async () => {
        const throwing = async () => {
            throw new Error(`request failed, headers { Cookie: ${COOKIE} }`);
        };
        const stopped = await command([PRELAUNCH], { env: { QA_PREVIEW_COOKIE: COOKIE }, fetch: throwing });
        assert.equal(stopped.code, 2);
        assert.match(stopped.err.join('\n'), /^STOP {5}request failed/);
        assert.doesNotMatch(stopped.printed, /rf-secret/);
    });

    it('stops with "answered 302" when the prelaunch page redirects, without following it or printing the cookie', async () => {
        const calls = [];
        const redirecting = async (url, options = {}) => {
            calls.push({ url, redirect: options.redirect });
            return { ok: false, status: 302, text: async () => '' };
        };
        const stopped = await command([PRELAUNCH], { env: { QA_PREVIEW_COOKIE: COOKIE }, fetch: redirecting });
        assert.equal(stopped.code, 2);
        assert.match(stopped.err.join('\n'), /^STOP {5}https:\/\/reelflies_ca-1895766\.mybigcommerce\.com\/ answered 302$/);
        assert.deepEqual(calls, [{ url: PRELAUNCH, redirect: 'manual' }]);
        assert.doesNotMatch(stopped.printed, /rf-secret/);
    });

    it('sends the cookie for the prelaunch host only, never for another page, even when QA_PREVIEW_COOKIE is set', async () => {
        const calls = [];
        const done = await command([PAGE], { env: { QA_PREVIEW_COOKIE: COOKIE }, fetch: answering({ [PAGE]: '<html><head></head><body></body></html>' }, calls) });
        assert.equal(done.code, 0);
        assert.deepEqual(calls, [{ url: PAGE, cookie: undefined }]);
    });

    it('exits 0 within the budget, 1 over it, and 2 on a usage error', async () => {
        const page = src => `<html><head><script async src="${src}"></script></head><body></body></html>`;
        const small = await command([PAGE], { fetch: answering({ [PAGE]: page('https://cdn.example.net/small.js'), 'https://cdn.example.net/small.js': 'var a = 1;' }) });
        assert.equal(small.code, 0);
        assert.match(small.out.join('\n'), /: within\./);
        const heavy = crypto.randomBytes(BUDGET_GZIP).toString('base64');
        const over = await command([PAGE], { fetch: answering({ [PAGE]: page('https://cdn.example.net/heavy.js'), 'https://cdn.example.net/heavy.js': heavy }) });
        assert.equal(over.code, 1);
        assert.match(over.out.join('\n'), /: over\./);
        const usage = await command([]);
        assert.equal(usage.code, 2);
        assert.match(usage.err.join('\n'), /^usage: node scripts\/integrations\/script-budget\.mjs/);
    });
});
