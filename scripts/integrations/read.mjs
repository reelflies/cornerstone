// Read-only reads for ticket 23's analytics, email and integrations checklist: which analytics
// providers each channel has on, each channel's site URL (what the email templates' links
// follow), the transactional and abandoned-cart email templates with their links, and the
// scripts the API can list. GET only, with the read-only token.
//
//   node scripts/integrations/read.mjs
//
// - It reads through a read-only client (scripts/store/client.mjs), which refuses any method but
//   GET before it sends anything, with the token from scripts/lib/store-token.mjs.
// - It keeps only the fields the checklist needs. A provider's api_secret (GA4's Measurement
//   Protocol secret) becomes `api_secret_set`, an abandoned-cart coupon code `coupon_set`, and a
//   script's URL its host: none of them is ever written or printed. Send counts aren't kept.
// - It reads templates, never a sent email or an order, so it sees no customer's data. The
//   Customers, Orders and catalogue endpoints are never asked for.
// - The reads, with the templates' bodies, go outside git, to
//   ~/reelflies/store-snapshots/store-wide/integrations/<time>-read-23.json. It prints a
//   Markdown summary for research/23-analytics-and-integrations.md, every line through
//   release-redact.mjs.
// - The Scripts API lists only the scripts the calling API account created, so the count it
//   prints says nothing about what was added in the control panel.

import fs from 'fs';
import path from 'path';
import { createClient, describeFailure } from '../store/client.mjs';
import { commandStoreHash } from '../store/plan.mjs';
import { storeRoot, timeStamp } from '../store/snapshot.mjs';
import { readStoreToken } from '../lib/store-token.mjs';
import { redact } from '../release-redact.mjs';
import { isMain } from '../lib/is-main.mjs';
import { inventory } from './email-links.mjs';

const CA = 1895766;
const LIVE = [1, 1855224];
const scopeName = channel => (channel === undefined ? 'global' : `channel ${channel}`);
const byChannel = channel => (channel === undefined ? {} : { channel_id: channel });

// Picks the named fields that are present, so a missing field stays missing.
const pick = (object, keys) => Object.fromEntries(keys.filter(key => object && object[key] !== undefined).map(key => [key, object[key]]));
const list = (body, one) => (Array.isArray(body && body.data) ? body.data.map(one) : []);

const hostOf = value => {
    try {
        return new URL(value).hostname;
    } catch {
        return 'not a URL';
    }
};

// A provider's `code` is what the store prints in every page: a bare id (GA4's measurement id,
// the Meta Pixel's id) or a whole snippet (the legacy Google Analytics provider holds the UA tag
// and, on this store, Omnisend's order-attribution script). Only what identifies it is kept:
// the ids, the hosts its scripts load from, and what else it carries. A bare id is kept as is.
export function codeSummary(code) {
    const text = typeof code === 'string' ? code.trim() : '';
    if (!text) return { length: 0 };
    if (!/[<\s]/.test(text) && text.length <= 64) return { length: text.length, id: text };
    const marks = [];
    if (/SOUNDEST/.test(text)) marks.push('Omnisend order attribution (SOUNDEST)');
    if (/fbq\(/.test(text)) marks.push('Meta Pixel');
    if (/<meta\b/i.test(text)) marks.push(`${(text.match(/<meta\b/gi) || []).length} meta tag(s)`);
    return {
        length: text.length,
        ids: [...new Set(text.match(/\b(?:G|UA|AW|GTM)-[A-Z0-9]+(?:-\d+)?\b/g) || [])],
        script_hosts: [...new Set([...text.matchAll(/<script\b[^>]*\ssrc\s*=\s*["']([^"']+)["']/gi)].map(match => hostOf(match[1])))],
        inline_scripts: [...text.matchAll(/<script\b(?![^>]*\ssrc\s*=)[^>]*>/gi)].length,
        marks,
    };
}

const SANITIZE = {
    provider: body => list(body, provider => ({
        ...pick(provider, ['id', 'channel_id', 'name', 'enabled', 'data_tag_enabled', 'version']),
        code: codeSummary(provider.code),
        api_secret_set: Boolean(provider.api_secret),
    })),
    site: body => pick(body && body.data, ['channel_id', 'url']),
    emailTemplate: body => list(body, template => pick(template, ['type_id', 'subject', 'body'])),
    abandonedCart: body => list(body, template => ({
        ...pick(template, ['id', 'notify_at_minutes', 'is_active']),
        coupon_set: Boolean(template.coupon_code),
        ...pick(template.template, ['subject', 'body']),
    })),
    abandonedCartSettings: body => pick(body && body.data, ['use_global']),
    script: body => list(body, script => ({
        ...pick(script, ['uuid', 'name', 'kind']),
        ...(script.src ? { src_host: hostOf(script.src) } : {}),
        ...pick(script, ['location', 'load_method', 'visibility', 'consent_category', 'enabled', 'channel_id']),
    })),
};

// Every read, in order. `group` and `scope` place it in the result.
export const READS = [
    ...[undefined, ...LIVE, CA].map(channel => ({
        group: 'analytics', scope: scopeName(channel), path: '/v3/settings/analytics', query: byChannel(channel), sanitize: SANITIZE.provider,
    })),
    ...[...LIVE, CA].map(channel => ({
        group: 'sites', scope: scopeName(channel), path: `/v3/channels/${channel}/site`, query: {}, sanitize: SANITIZE.site,
    })),
    ...[undefined, 1, CA].map(channel => ({
        group: 'emailTemplates', scope: scopeName(channel), path: '/v3/marketing/email-templates', query: byChannel(channel), sanitize: SANITIZE.emailTemplate,
    })),
    ...[undefined, 1, CA].map(channel => ({
        group: 'abandonedCart', scope: scopeName(channel), path: '/v3/marketing/abandoned-cart-emails', query: byChannel(channel), sanitize: SANITIZE.abandonedCart,
    })),
    ...[1, CA].map(channel => ({
        group: 'abandonedCartSettings', scope: scopeName(channel), path: '/v3/marketing/abandoned-cart-emails/settings', query: byChannel(channel), sanitize: SANITIZE.abandonedCartSettings,
    })),
    {
        group: 'scripts', scope: scopeName(CA), path: '/v3/content/scripts', query: { 'channel_id:in': CA }, sanitize: SANITIZE.script,
    },
];

export async function readIntegrations(client, { now = new Date() } = {}) {
    const result = {
        read_at: now.toISOString(),
        how: 'GET only, with the read-only token (scripts/integrations/read.mjs, ticket 23)',
    };
    for (const read of READS) {
        const response = await client.get(read.path, read.query); // eslint-disable-line no-await-in-loop
        result[read.group] = result[read.group] || {};
        result[read.group][read.scope] = response.ok
            ? { data: read.sanitize(response.body) }
            : { status: response.status, error: describeFailure(response) };
    }
    return result;
}

const cell = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const notRead = (scope, entry) => `- ${scope}: not read (${entry.error})`;

// "channel 1895766" -> 1895766; "global" -> 0, the channel_id BigCommerce gives a global value.
const channelOf = scope => (scope === 'global' ? 0 : Number(scope.replace('channel ', '')));

function providerLine(provider, scope) {
    const { code = {} } = provider;
    const what = [code.id, ...(code.ids || []), ...(code.script_hosts || []).map(host => `script from ${host}`), ...(code.marks || [])].filter(Boolean);
    const scopeChannel = channelOf(scope);
    let source = '';
    if (scopeChannel && provider.channel_id === 0) source = ', inherited from global';
    else if (scopeChannel && provider.channel_id === scopeChannel) source = ', this channel\'s own';
    return `${provider.name}${what.length ? ` (${what.join('; ')})` : ''}: data tag ${provider.data_tag_enabled ? 'on' : 'off'}${source}`;
}

function providersLine(scope, providers) {
    const on = providers.filter(provider => provider.enabled);
    const off = providers.filter(provider => !provider.enabled).map(provider => provider.name);
    const parts = [on.length ? `on: ${on.map(provider => providerLine(provider, scope)).join('; ')}` : 'none on'];
    if (off.length) parts.push(`off: ${off.join(', ')}`);
    return `- ${scope}: ${parts.join('. ')}`;
}

export function summarize(result) {
    const lines = [`Read ${result.read_at}, ${result.how}.`, '', '### Analytics providers (GET /v3/settings/analytics)', ''];
    Object.entries(result.analytics || {}).forEach(([scope, entry]) => {
        if (!entry.data) lines.push(notRead(scope, entry));
        else lines.push(providersLine(scope, entry.data));
    });

    lines.push('', '### Site URLs, which the email templates\' variables follow (GET /v3/channels/<id>/site)', '');
    Object.entries(result.sites || {}).forEach(([scope, entry]) => lines.push(entry.data ? `- ${scope}: ${entry.data.url || 'no URL'}` : notRead(scope, entry)));

    lines.push('', '### Abandoned-cart emails (GET /v3/marketing/abandoned-cart-emails and its settings)', '');
    Object.entries(result.abandonedCart || {}).forEach(([scope, entry]) => {
        if (!entry.data) {
            lines.push(notRead(scope, entry));
            return;
        }
        const active = entry.data.filter(template => template.is_active);
        const details = active.map(template => `after ${template.notify_at_minutes} min${template.coupon_set ? ', coupon attached' : ''}`).join('; ');
        const settings = result.abandonedCartSettings && result.abandonedCartSettings[scope];
        const inherit = settings ? `; use_global ${settings.data ? settings.data.use_global : `not read (${settings.error})`}` : '';
        lines.push(`- ${scope}: ${plural(entry.data.length, 'template')}, ${active.length} active${details ? ` (${details})` : ''}${inherit}`);
    });

    lines.push('', '### Email templates and their links', '');
    const templates = [];
    const scopes = [];
    Object.entries(result.emailTemplates || {}).forEach(([scope, entry]) => {
        if (!entry.data) scopes.push(notRead(scope, entry));
        else {
            scopes.push(`- ${scope}: ${plural(entry.data.length, 'template')}${scope !== 'global' && !entry.data.length ? ' of its own (it uses the global ones)' : ''}`);
            entry.data.forEach(template => templates.push({
                scope, type: template.type_id, subject: template.subject, body: template.body,
            }));
        }
    });
    Object.entries(result.abandonedCart || {}).forEach(([scope, entry]) => (entry.data || []).forEach(template => templates.push({
        scope, type: `abandoned cart #${template.id}${template.is_active ? '' : ' (inactive)'}`, subject: template.subject, body: template.body,
    })));
    lines.push(...scopes, '');
    lines.push('| Scope | Template | Subject | Links | By kind | To look at |', '|---|---|---|---|---|---|');
    inventory(templates).forEach(row => {
        const kinds = Object.entries(row.counts).map(([kind, count]) => `${kind} ${count}`).join(', ') || 'none';
        const look = row.flagged.map(link => `\`${cell(link.value)}\`: ${cell(link.note)}`).join('; ') || 'none';
        lines.push(`| ${cell(row.scope)} | ${cell(row.type)} | ${cell(row.subject)} | ${row.total} | ${kinds} | ${look} |`);
    });

    lines.push('', '### Script Manager (GET /v3/content/scripts)', '');
    Object.entries(result.scripts || {}).forEach(([, entry]) => {
        if (!entry.data) lines.push(`- Scripts on 1895766: not read (${entry.error})`);
        else {
            lines.push(`- Scripts the read-only account can list on 1895766: ${entry.data.length}. The API lists only the scripts the calling account created; anything added in the control panel is listed only there.`);
            entry.data.forEach(script => lines.push(`  - ${script.name}: ${script.kind}${script.src_host ? ` from ${script.src_host}` : ''}, ${script.location}, ${script.load_method}, ${script.consent_category}, ${script.enabled ? 'enabled' : 'disabled'}`));
        }
    });
    return lines;
}

async function main(argv) {
    if (argv.length) {
        console.error('usage: node scripts/integrations/read.mjs (no arguments: GET only, with the read-only token)');
        return 2;
    }
    const secrets = [];
    const say = line => console.log(redact(line, secrets));
    try {
        const { token, source } = readStoreToken('read');
        secrets.push(token);
        say(`Reading with ${source} (GET only)…`);
        const client = createClient({ storeHash: await commandStoreHash(), token, readOnly: true });
        const now = new Date();
        const result = await readIntegrations(client, { now });
        const dir = path.join(storeRoot(), 'store-wide', 'integrations');
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${timeStamp(now)}-read-23.json`);
        fs.writeFileSync(file, redact(`${JSON.stringify(result, null, 2)}\n`, secrets));
        say('');
        summarize(result).forEach(say);
        say('');
        say(`reads    ${file}`);
        return 0;
    } catch (error) {
        String(error.message).split('\n').forEach(line => console.error(redact(`STOP     ${line}`, secrets)));
        return 1;
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2)).then(code => { process.exitCode = code; });
