// The read-only integration reads (ticket 23): what they ask for, what they keep, and what they
// never keep or print (a provider's API secret, an abandoned-cart coupon code).
//
//   node --test scripts/integrations/read.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { READS, readIntegrations, summarize } from './read.mjs';
import { queryString } from '../store/client.mjs';

const READ = path.join(path.dirname(fileURLToPath(import.meta.url)), 'read.mjs');
const SECRET = 'not-a-real-ga4-api-secret-0001';
const COUPON = 'NOTAREALCOUPON10';

// channel_id 0 is how BigCommerce marks a channel's value as the global one it inherits.
const ga4 = (channel, enabled = true) => ({
    id: 8, channel_id: channel, name: 'Google Analytics 4', code: 'G-TEST12345', enabled, data_tag_enabled: true, version: 0, api_secret: SECRET, is_oauth_connected: true,
});
// The legacy provider's code is a whole snippet; on this store it also carries Omnisend's script.
const LEGACY = '<!-- gtag --><script async src="https://www.googletagmanager.com/gtag/js?id=UA-0000000-1"></script>\n<script>gtag(\'config\', \'UA-0000000-1\');</script>\n<script type="text/javascript">// SOUNDEST-V6-1\nwindow.SOUNDEST = {};</script>';
const legacy = channel => ({
    id: 1, channel_id: channel, name: 'Google Analytics', code: LEGACY, enabled: true, data_tag_enabled: false, version: 1,
});
const segment = channel => ({
    id: 4, channel_id: channel, name: 'Segment.com', code: '', enabled: false, data_tag_enabled: true, version: 1,
});

const ROUTES = {
    '/v3/settings/analytics': { data: [legacy(0), ga4(0), segment(0)] },
    '/v3/settings/analytics?channel_id=1': { data: [legacy(0), ga4(0), segment(1)] },
    '/v3/settings/analytics?channel_id=1855224': { data: [legacy(0), ga4(1855224, false), segment(1855224)] },
    '/v3/settings/analytics?channel_id=1895766': { data: [legacy(0), ga4(1895766), segment(1895766)] },
    '/v3/channels/1/site': {
        data: {
            id: 1, channel_id: 1, url: 'https://reelflies.ca', ssl_status: 'dedicated',
        },
    },
    '/v3/channels/1855224/site': { data: { id: 2, channel_id: 1855224, url: 'https://reelflies.com' } },
    '/v3/channels/1895766/site': { data: { id: 3, channel_id: 1895766, url: 'https://reelflies_ca-1895766.mybigcommerce.com' } },
    '/v3/marketing/email-templates': {
        data: [{
            type_id: 'combined_order_status_email', subject: 'Order {{order.id}}', body: '<a href="{{store.url}}">Shop</a>', translations: [{ locale: 'en' }],
        }],
    },
    '/v3/marketing/email-templates?channel_id=1': { data: [] },
    '/v3/marketing/email-templates?channel_id=1895766': { data: [{ type_id: 'createaccount_email', subject: 'Welcome', body: '<a href="https://reelflies_ca-1895766.mybigcommerce.com/login.php">Log in</a>' }] },
    '/v3/marketing/abandoned-cart-emails': { data: [] },
    '/v3/marketing/abandoned-cart-emails?channel_id=1': { data: [] },
    '/v3/marketing/abandoned-cart-emails?channel_id=1895766': {
        data: [{
            id: 7, notify_at_minutes: '60', coupon_code: COUPON, is_active: true, sent_num: 12, template: { subject: 'You left something', body: '<a href="{{cart.url}}">Back to your cart</a>' },
        }],
    },
    '/v3/marketing/abandoned-cart-emails/settings?channel_id=1': { data: { use_global: true } },
    '/v3/marketing/abandoned-cart-emails/settings?channel_id=1895766': { data: { use_global: false } },
    '/v3/content/scripts?channel_id:in=1895766': {
        data: [{
            uuid: 'abc', name: 'Old tag', kind: 'src', src: 'https://example.com/tag.js?key=abc', html: '<script>secret()</script>', location: 'head', load_method: 'async', visibility: 'storefront', consent_category: 'analytics', enabled: true, channel_id: 1895766,
        }],
    },
};

function fakeClient(routes = ROUTES) {
    const calls = [];
    const request = async ({ method, path: route, query }) => {
        calls.push({ method, route: `${route}${queryString(query)}` });
        const body = routes[`${route}${queryString(query)}`];
        if (!body) {
            return {
                status: 403, ok: false, body: { title: 'You don\'t have a required scope to access the endpoint' }, text: '',
            };
        }
        return {
            status: 200, ok: true, body, text: JSON.stringify(body),
        };
    };
    return { calls, client: { request, get: (route, query) => request({ method: 'GET', path: route, query }) } };
}

describe('readIntegrations', () => {
    it('sends GETs only, exactly the listed reads', async () => {
        const { calls, client } = fakeClient();
        await readIntegrations(client, { now: new Date('2026-10-06T12:00:00Z') });
        assert.ok(calls.every(call => call.method === 'GET'));
        assert.deepEqual(calls.map(call => call.route), READS.map(read => `${read.path}${queryString(read.query)}`));
        READS.forEach(read => assert.doesNotMatch(read.path, /customers|orders|catalog|carts|checkouts|payments|coupons|promotions/));
    });

    it('keeps no API secret, coupon code, send count, script body or script URL query', async () => {
        const { client } = fakeClient();
        const result = await readIntegrations(client, { now: new Date('2026-10-06T12:00:00Z') });
        const text = JSON.stringify(result);
        assert.ok(!text.includes(SECRET), 'api_secret');
        assert.ok(!text.includes(COUPON), 'coupon_code');
        assert.ok(!text.includes('sent_num'));
        assert.ok(!text.includes('secret()'), 'a script\'s html');
        assert.ok(!text.includes('key=abc'), 'a script src\'s query');
        assert.ok(!text.includes('window.SOUNDEST'), 'a provider\'s snippet');
        const lines = summarize(result).join('\n');
        assert.ok(!lines.includes(SECRET) && !lines.includes(COUPON));
    });

    it('keeps what the checklist needs', async () => {
        const { client } = fakeClient();
        const result = await readIntegrations(client, { now: new Date('2026-10-06T12:00:00Z') });
        assert.deepEqual(result.analytics['channel 1895766'].data[1], {
            id: 8, channel_id: 1895766, name: 'Google Analytics 4', enabled: true, data_tag_enabled: true, version: 0, code: { length: 11, id: 'G-TEST12345' }, api_secret_set: true,
        });
        assert.deepEqual(result.analytics['channel 1895766'].data[0].code, {
            length: LEGACY.length, ids: ['UA-0000000-1'], script_hosts: ['www.googletagmanager.com'], inline_scripts: 2, marks: ['Omnisend order attribution (SOUNDEST)'],
        });
        assert.deepEqual(result.analytics['channel 1895766'].data[2].code, { length: 0 });
        assert.deepEqual(result.sites['channel 1895766'].data, { channel_id: 1895766, url: 'https://reelflies_ca-1895766.mybigcommerce.com' });
        assert.deepEqual(result.abandonedCart['channel 1895766'].data, [{
            id: 7, notify_at_minutes: '60', is_active: true, coupon_set: true, subject: 'You left something', body: '<a href="{{cart.url}}">Back to your cart</a>',
        }]);
        assert.deepEqual(result.abandonedCartSettings['channel 1895766'].data, { use_global: false });
        assert.deepEqual(result.scripts['channel 1895766'].data, [{
            uuid: 'abc', name: 'Old tag', kind: 'src', src_host: 'example.com', location: 'head', load_method: 'async', visibility: 'storefront', consent_category: 'analytics', enabled: true, channel_id: 1895766,
        }]);
        assert.equal(result.read_at, '2026-10-06T12:00:00.000Z');
    });

    it('records a read the token can\'t make, and carries on', async () => {
        const routes = { ...ROUTES };
        delete routes['/v3/marketing/email-templates'];
        const { client } = fakeClient(routes);
        const result = await readIntegrations(client);
        assert.deepEqual(result.emailTemplates.global, { status: 403, error: '403: You don\'t have a required scope to access the endpoint' });
        assert.ok(result.emailTemplates['channel 1895766'].data);
        assert.match(summarize(result).join('\n'), /global: not read \(403/);
    });
});

describe('summarize', () => {
    it('reports GA4 per scope, each site\'s URL, the abandoned-cart state and every link to look at', async () => {
        const { client } = fakeClient();
        const lines = summarize(await readIntegrations(client));
        const text = lines.join('\n');
        assert.match(text, /- channel 1895766: on: Google Analytics \(UA-0000000-1; script from www\.googletagmanager\.com; Omnisend order attribution \(SOUNDEST\)\): data tag off, inherited from global; Google Analytics 4 \(G-TEST12345\): data tag on, this channel's own\. off: Segment\.com$/m);
        assert.match(text, /- channel 1855224: on: Google Analytics \([^)]*\)\): data tag off, inherited from global\. off: Google Analytics 4, Segment\.com$/m);
        assert.match(text, /- global: on: Google Analytics \([^)]*\)\): data tag off; Google Analytics 4 \(G-TEST12345\): data tag on\. off: Segment\.com$/m);
        assert.match(text, /channel 1895766: https:\/\/reelflies_ca-1895766\.mybigcommerce\.com/);
        assert.match(text, /channel 1895766: 1 template, 1 active \(after 60 min, coupon attached\); use_global false/);
        assert.match(text, /\| channel 1895766 \| createaccount_email \| Welcome \| 1 \| prelaunch 1 \| `https:\/\/reelflies_ca-1895766\.mybigcommerce\.com\/login\.php`: the prelaunch host/);
        assert.match(text, /\| global \| combined_order_status_email \| Order \{\{order\.id\}\} \| 1 \| variable 1 \| none \|/);
        assert.match(text, /Scripts the read-only account can list on 1895766: 1/);
        assert.match(text, /^- channel 1: 0 templates of its own \(it uses the global ones\)$/m);
        assert.match(text, /^- global: 1 template$/m);
    });
});

describe('the command', () => {
    it('refuses any argument', () => {
        const result = spawnSync(process.execPath, [READ, '--write'], { encoding: 'utf8' });
        assert.equal(result.status, 2);
        assert.match(result.stderr, /usage: node scripts\/integrations\/read\.mjs/);
    });
});
