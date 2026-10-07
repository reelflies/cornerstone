// The third-party script budget check for ticket 23: which scripts a storefront page's HTML
// loads, in the head or the body, async, deferred or blocking, and whether each waits for
// consent; then the gzip size of every third-party one, against the 150 KB budget
// (research.json, performance budget: footer, async, consent-tagged, 150 KB gzip in total).
//
//   node scripts/integrations/script-budget.mjs https://reelflies.ca/
//   read -rs QA_PREVIEW_COOKIE && export QA_PREVIEW_COOKIE      # Shaun, for the prelaunch host
//   node scripts/integrations/script-budget.mjs https://reelflies_ca-1895766.mybigcommerce.com/
//
// - It reads the page's HTML and runs none of it, so no tag fires and no visit is counted. Then
//   it GETs each third-party script file once, as a browser would before running it, and
//   measures it gzipped at level 9, so sizes compare across hosts whatever each one serves.
// - The preview cookie (QA_PREVIEW_COOKIE, as the gates take it) goes to the prelaunch host's
//   page only, never to a script's host, never through a redirect, and is never printed.
// - It follows the script files the store's own inline snippets inject (gtag.js for GA4,
//   fbevents.js for the Meta Pixel, Omnisend's launchers). Scripts those load in turn
//   (fbevents.js loads the pixel's config, Omnisend's launcher its forms) are seen only in a
//   browser, which the gates block.

import zlib from 'zlib';
import { isPrelaunchHost } from '../qa/analytics-hosts.mjs';
import { redact } from '../release-redact.mjs';
import { isMain } from '../lib/is-main.mjs';

export const BUDGET_GZIP = 150000;
const TIMEOUT_MS = 30000;

const SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const ATTRIBUTE = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function attributesOf(text) {
    const attributes = {};
    for (const match of text.matchAll(ATTRIBUTE)) attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    return attributes;
}

const hostOf = value => {
    try {
        return new URL(value).hostname.toLowerCase();
    } catch {
        return '';
    }
};

const onHost = (host, base) => host === base || host.endsWith(`.${base}`);

export function scriptOwner(src, pageUrl) {
    const host = hostOf(src);
    if (host === hostOf(pageUrl)) return 'store';
    if (onHost(host, 'bigcommerce.com')) return 'BigCommerce';
    return 'third party';
}

const INLINE_MARKS = [
    [/gtag\(|googletagmanager|google-analytics/, 'Google tag (gtag)'],
    [/fbq\(|fbevents/, 'Meta Pixel'],
    [/SOUNDEST|omnisend/i, 'Omnisend'],
];

const inlineWhat = text => INLINE_MARKS.filter(([pattern]) => pattern.test(text)).map(([, name]) => name).join(', ');

function loadOf(attributes, inline) {
    if (inline) return 'inline';
    if ('async' in attributes) return 'async';
    if ('defer' in attributes) return 'defer';
    if ((attributes.type || '').toLowerCase() === 'module') return 'module (deferred)';
    return 'blocking';
}

function consentOf(attributes) {
    const parts = [];
    if ((attributes.type || '').toLowerCase() === 'text/plain') parts.push('type="text/plain"');
    Object.entries(attributes).filter(([name]) => name.includes('consent')).forEach(([name, value]) => parts.push(`${name}="${value}"`));
    return parts.join(' ');
}

// The script files a third-party inline snippet adds to the page itself: a literal script URL
// (gtag.js for GA4, fbevents.js for the Meta Pixel), or Omnisend's launcher, which its snippets
// build from SOUNDEST.baseURL and the documented inshop/bigcommerce-launcher.js.
function injectedBy(text, pageUrl) {
    const urls = (text.match(/https:\/\/[^"'\s]+?(?:\.js\b|\/gtag\/js\?id=[\w-]+)/g) || []);
    const omnisend = text.match(/SOUNDEST\.baseURL\s*=\s*["'](https:\/\/[^"']+)["']/);
    if (omnisend) urls.push(new URL('inshop/bigcommerce-launcher.js', omnisend[1]).href);
    return [...new Set(urls)].filter(url => scriptOwner(url, pageUrl) === 'third party');
}

export function parseScripts(html, pageUrl) {
    const headEnd = html.search(/<\/head\s*>/i);
    return [...html.matchAll(SCRIPT)].flatMap(match => {
        const attributes = attributesOf(match[1]);
        const inline = !attributes.src;
        const src = inline ? null : new URL(attributes.src, pageUrl).href;
        const what = inline ? inlineWhat(match[2]) : '';
        let owner = what ? 'third party' : 'store';
        if (!inline) owner = scriptOwner(src, pageUrl);
        const script = {
            where: headEnd >= 0 && match.index < headEnd ? 'head' : 'body',
            src,
            owner,
            load: loadOf(attributes, inline),
            consent: consentOf(attributes),
            what,
            text: inline ? match[2] : undefined,
        };
        const injected = inline && what ? injectedBy(match[2], pageUrl).map(url => ({
            where: script.where, src: url, owner: 'third party', load: 'injected', consent: script.consent, what: `injected by the ${what} snippet above`,
        })) : [];
        return [script, ...injected];
    });
}

const gzipSize = text => zlib.gzipSync(text, { level: 9 }).length;

export async function measure(pageUrl, { fetch: fetchImpl = fetch, cookie, now = new Date() } = {}) {
    let url;
    try {
        url = new URL(pageUrl);
    } catch {
        throw new Error(`${pageUrl} isn't a URL`);
    }
    if (url.protocol !== 'https:') throw new Error(`${pageUrl} isn't https`);
    if (cookie && !isPrelaunchHost(url.href)) throw new Error('the preview cookie goes only to the prelaunch host (reelflies_ca-1895766.mybigcommerce.com), and this page is on another');
    const page = await fetchImpl(url.href, {
        headers: { Accept: 'text/html', ...(cookie ? { Cookie: cookie } : {}) },
        redirect: cookie ? 'manual' : 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!page.ok || page.status !== 200) throw new Error(`${url.href} answered ${page.status}${page.status === 503 ? ' (the prelaunch host without the preview cookie answers 503)' : ''}`);
    const scripts = parseScripts(await page.text(), url.href);

    const sizes = new Map();
    for (const script of scripts.filter(one => one.owner === 'third party')) {
        if (!script.src) {
            script.raw = Buffer.byteLength(script.text);
            script.gzip = gzipSize(script.text);
        } else if (!sizes.has(script.src)) {
            try {
                const response = await fetchImpl(script.src, { signal: AbortSignal.timeout(TIMEOUT_MS) }); // eslint-disable-line no-await-in-loop
                if (!response.ok) sizes.set(script.src, { error: `answered ${response.status}` });
                else {
                    const text = await response.text(); // eslint-disable-line no-await-in-loop
                    sizes.set(script.src, { raw: Buffer.byteLength(text), gzip: gzipSize(text) });
                }
            } catch (error) {
                sizes.set(script.src, { error: error.name === 'TimeoutError' ? 'no answer in 30 s' : error.message });
            }
            Object.assign(script, sizes.get(script.src));
        } else Object.assign(script, sizes.get(script.src), { repeat: true });
    }
    const counted = scripts.filter(script => script.owner === 'third party' && !script.repeat && Number.isInteger(script.gzip));
    const thirdPartyGzip = counted.reduce((sum, script) => sum + script.gzip, 0);
    return {
        page: url.href,
        read_at: now.toISOString(),
        scripts: scripts.map(({ text, ...script }) => script),
        thirdPartyGzip,
        withinBudget: thirdPartyGzip <= BUDGET_GZIP,
        unmeasured: scripts.filter(script => script.error).length,
    };
}

const bytes = value => `${value.toLocaleString('en-CA')} B`;
const cell = value => String(value ?? '').replace(/\|/g, '\\|');

export function report(result) {
    const lines = [
        `Page: ${result.page} (read ${result.read_at}), ${result.scripts.length} scripts in the HTML.`,
        '',
        '| Where | Script | Owner | Load | Consent | Raw | gzip |',
        '|---|---|---|---|---|---|---|',
    ];
    result.scripts.forEach(script => {
        const name = script.src || `inline${script.what ? `: ${script.what}` : ''}`;
        let raw = '-';
        let gzip = '-';
        if (script.error) {
            raw = `not measured: ${script.error}`;
            gzip = '';
        } else if (Number.isInteger(script.gzip)) {
            raw = bytes(script.raw);
            gzip = script.repeat ? 'counted above' : bytes(script.gzip);
        }
        lines.push(`| ${script.where} | ${cell(name)} | ${script.owner} | ${script.load} | ${cell(script.consent) || 'none'} | ${raw} | ${gzip} |`);
    });
    lines.push(
        '',
        `Third-party total: ${bytes(result.thirdPartyGzip)} gzip of the 150 KB budget (${bytes(BUDGET_GZIP)}): ${result.withinBudget ? 'within' : 'over'}${result.unmeasured ? `, with ${result.unmeasured} script(s) not measured` : ''}.`,
        'This is only what the HTML names and what its inline snippets inject: scripts those load in turn (fbevents.js loads the pixel\'s config, Omnisend\'s launcher its forms) show only in a browser.',
    );
    return lines;
}

// The command, with what it touches passed in (the tests give stand-ins). Every line it prints
// goes through redact, with the cookie and each of its values, the STOP line included.
// Resolves to the exit code: 0 within the budget, 1 over it, 2 stopped.
export async function run(argv, {
    env = process.env, fetch: fetchImpl = fetch, log = console.log, error = console.error,
} = {}) {
    if (argv.length !== 1) {
        error('usage: node scripts/integrations/script-budget.mjs <https page URL> (QA_PREVIEW_COOKIE is sent to the prelaunch host only)');
        return 2;
    }
    const cookie = isPrelaunchHost(argv[0]) ? env.QA_PREVIEW_COOKIE : undefined;
    const secrets = cookie ? [cookie, ...cookie.split(';').map(part => part.split('=').slice(1).join('=').trim())] : [];
    try {
        const result = await measure(argv[0], { fetch: fetchImpl, cookie });
        report(result).forEach(line => log(redact(line, secrets)));
        return result.withinBudget ? 0 : 1;
    } catch (problem) {
        error(redact(`STOP     ${problem.message}`, secrets));
        return 2;
    }
}

if (isMain(import.meta.url)) run(process.argv.slice(2)).then(code => { process.exitCode = code; });
