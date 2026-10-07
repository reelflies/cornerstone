// The email link inventory (ticket 23): every link in the store's email templates, sorted by
// whether it still works after the Flip.
//
//   import { inventory } from './email-links.mjs';
//   const rows = inventory([{ scope, type, subject, body }]);   // body: the template's HTML
//
// At the Flip, ReelFlies_CA (1895766) takes the reelflies.ca domain and the tree-4 URLs
// (refactor plan; ticket 57). So a link is fine when the store fills it in from a template
// variable ({{store.url}} and the like), which follows the channel's site URL, also when a file
// on the store's image or CDN folder or one of BigCommerce's own pages (account.php, login.php,
// cart.php…) follows it, and when it is a mail or phone link, an anchor, or an image on
// BigCommerce's CDN. It needs a look when it is:
//
// - the prelaunch host (*.mybigcommerce.com), which stops being the storefront at the Flip
// - a hard-coded reelflies.ca path, or a variable base with a hard-coded path, which must match
//   the URLs after the Flip (ticket 19's path map and the Flip's redirects)
// - reelflies.com, the other storefront
// - relative, which a mail client can't follow
//
// It reads templates only, never a sent email, so it sees no customer's data.

const LINK = /\b(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const VARIABLE = /^\{\{\{?\s*([\w.@]+)(?:\s+[^}]*)?\s*\}?\}\}/;
// Variables for the store's image and CDN folders: what follows them is a file, not a page.
const ASSET_BASES = ['store.img_path', 'store.cdn_path'];
// BigCommerce's own pages, at the same path on every domain, before and after the Flip.
const PLATFORM_PAGE = /^\/(account|login|cart|wishlist|orderstatus|giftcertificates|compare|search)\.php(?:[?#]|$)/;

export function extractLinks(html) {
    if (typeof html !== 'string') return [];
    return [...html.matchAll(LINK)].map(match => ({ attr: match[1].toLowerCase(), value: match[2] ?? match[3] }));
}

const urlOf = value => {
    try {
        return new URL(value);
    } catch {
        return null;
    }
};

const onHost = (hostname, host) => hostname === host || hostname.endsWith(`.${host}`);
const pass = kind => ({ kind, ok: true, note: '' });

export function classifyLink(raw) {
    const value = String(raw ?? '').trim();
    if (!value) return { kind: 'empty', ok: true, note: 'an empty link' };
    if (value.startsWith('#')) return pass('anchor');
    if (/^mailto:/i.test(value)) return pass('mail');
    if (/^tel:/i.test(value)) return pass('phone');

    const variable = value.match(VARIABLE);
    if (variable) {
        const rest = value.slice(variable[0].length);
        if (!rest || rest === '/' || /^[?#]/.test(rest)) return pass('variable');
        if (ASSET_BASES.includes(variable[1])) return pass('variable-asset');
        if (PLATFORM_PAGE.test(rest)) return pass('variable-platform');
        return { kind: 'variable-path', ok: false, note: `a hard-coded path after a variable base: check "${rest}" against the URLs after the Flip (ticket 19's path map)` };
    }
    if (value.startsWith('{{')) return pass('variable');

    const url = urlOf(value);
    if (!url) return { kind: 'relative', ok: false, note: 'a relative link, which a mail client can\'t follow: use a template variable for the store\'s URL' };
    const host = url.hostname.toLowerCase();
    if (onHost(host, 'mybigcommerce.com')) {
        return { kind: 'prelaunch', ok: false, note: 'the prelaunch host, which stops being the storefront at the Flip: use {{store.url}} or the like' };
    }
    if (onHost(host, 'reelflies.ca')) {
        if (url.protocol === 'https:' && (url.pathname === '/' || url.pathname === '')) return pass('reelflies.ca');
        return { kind: 'reelflies.ca', ok: false, note: url.protocol === 'https:' ? `a hard-coded path: check ${url.pathname} against the URLs after the Flip (ticket 19's path map)` : 'not https' };
    }
    if (onHost(host, 'reelflies.com')) return { kind: 'reelflies.com', ok: false, note: 'the other storefront: intended?' };
    if (/^cdn\d*\.bigcommerce\.com$/.test(host)) return pass('bigcommerce-cdn');
    return { kind: 'external', ok: true, note: host };
}

// One row per template: its links counted by kind, and the ones that need a look.
export function inventory(templates) {
    return templates.map(({
        scope, type, subject, body,
    }) => {
        const links = extractLinks(body).map(link => ({ ...link, ...classifyLink(link.value) }));
        const counts = {};
        links.forEach(({ kind }) => {
            counts[kind] = (counts[kind] || 0) + 1;
        });
        return {
            scope,
            type,
            subject,
            total: links.length,
            counts,
            flagged: links.filter(link => !link.ok).map(({
                attr, value, kind, note,
            }) => ({
                attr, value, kind, note,
            })),
        };
    });
}
