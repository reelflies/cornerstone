// The email link inventory (ticket 23): which links in the store's email templates still work
// after the Flip, and which are hard-coded to the prelaunch host, another site or a path.
//
//   node --test scripts/integrations/email-links.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyLink, extractLinks, inventory } from './email-links.mjs';

describe('extractLinks', () => {
    it('finds every href and src, in either quote, with Handlebars inside', () => {
        const html = `<a href="{{store.url}}">Shop</a><img src='https://cdn11.bigcommerce.com/s-abc/logo.png'>
            <a class="x" HREF = "{{ order.details_url }}">Order</a><a href="mailto:{{store.email}}">Mail</a>
            <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Onest">`;
        assert.deepEqual(extractLinks(html), [
            { attr: 'href', value: '{{store.url}}' },
            { attr: 'src', value: 'https://cdn11.bigcommerce.com/s-abc/logo.png' },
            { attr: 'href', value: '{{ order.details_url }}' },
            { attr: 'href', value: 'mailto:{{store.email}}' },
            { attr: 'href', value: 'https://fonts.googleapis.com/css?family=Onest' },
        ]);
    });

    it('finds nothing in a body with no links, or no body', () => {
        assert.deepEqual(extractLinks('<p>Thanks for your order.</p>'), []);
        assert.deepEqual(extractLinks(undefined), []);
    });
});

describe('classifyLink', () => {
    const kind = value => classifyLink(value).kind;

    it('passes a link built from a template variable: it follows the channel\'s site URL, so it moves with the Flip', () => {
        assert.equal(kind('{{store.url}}'), 'variable');
        assert.equal(kind('{{{ order.url }}}'), 'variable');
        assert.equal(classifyLink('{{store.url}}').ok, true);
    });

    it('flags a variable base with a hard-coded path, to check against the Flip\'s redirects', () => {
        const link = classifyLink('{{store.url}}/fly-types/dry-flies/');
        assert.equal(link.kind, 'variable-path');
        assert.equal(link.ok, false);
        assert.match(link.note, /path/);
        assert.equal(kind('{{store.url}}/'), 'variable');
        assert.equal(kind('{{store.url}}?utm_source=email'), 'variable');
        assert.equal(kind('{{ store.path }}/pages/shipping.html'), 'variable-path');
    });

    it('passes an image on a store asset base, and BigCommerce\'s own account, cart and login pages, which the Flip doesn\'t move', () => {
        assert.deepEqual(classifyLink('{{ store.img_path }}/IcoError.gif'), { kind: 'variable-asset', ok: true, note: '' });
        assert.equal(kind('{{store.cdn_path}}/images/stencil/300x150/{{store.logo.name}}'), 'variable-asset');
        assert.deepEqual(classifyLink('{{ store.path }}/account.php?view=returns'), { kind: 'variable-platform', ok: true, note: '' });
        assert.equal(kind('{{store.path}}/account.php?action=view_returns'), 'variable-platform');
        assert.equal(kind('{{ store.path_normal }}/login.php'), 'variable-platform');
        assert.equal(kind('{{ store.path }}/cart.php'), 'variable-platform');
        assert.equal(kind('{{ store.path }}/accounts.php'), 'variable-path', 'only the exact page names');
    });

    it('flags the prelaunch host, which ends at the Flip, as a fix', () => {
        const link = classifyLink('https://reelflies_ca-1895766.mybigcommerce.com/cart.php');
        assert.equal(link.kind, 'prelaunch');
        assert.equal(link.ok, false);
        assert.equal(kind('https://store-abc123.mybigcommerce.com/'), 'prelaunch');
    });

    it('passes reelflies.ca\'s home page, and flags any other hard-coded reelflies.ca path for the Flip\'s path map', () => {
        assert.equal(classifyLink('https://reelflies.ca/').ok, true);
        assert.equal(classifyLink('https://www.reelflies.ca').ok, true);
        const deep = classifyLink('https://www.reelflies.ca/flies/dry-flies/');
        assert.equal(deep.kind, 'reelflies.ca');
        assert.equal(deep.ok, false);
        assert.match(deep.note, /ticket 19/);
        assert.equal(classifyLink('http://reelflies.ca/').ok, false, 'not https');
    });

    it('flags reelflies.com, the other storefront', () => {
        assert.equal(kind('https://www.reelflies.com/'), 'reelflies.com');
        assert.equal(classifyLink('https://reelflies.com/').ok, false);
    });

    it('passes BigCommerce\'s image CDN, mail and phone links, and in-page anchors', () => {
        assert.deepEqual(classifyLink('https://cdn11.bigcommerce.com/s-abc/images/stencil/logo.png'), { kind: 'bigcommerce-cdn', ok: true, note: '' });
        assert.equal(classifyLink('mailto:{{store.email}}').ok, true);
        assert.equal(kind('tel:+18005551234'), 'phone');
        assert.equal(classifyLink('#top').ok, true);
        assert.equal(classifyLink('').kind, 'empty');
    });

    it('flags a relative link, which no mail client can follow', () => {
        const link = classifyLink('/account.php');
        assert.equal(link.kind, 'relative');
        assert.equal(link.ok, false);
    });

    it('lists any other site as external, for a look', () => {
        assert.deepEqual(classifyLink('https://www.facebook.com/reelflies'), { kind: 'external', ok: true, note: 'www.facebook.com' });
    });
});

describe('inventory', () => {
    it('lists each template\'s links, counts them by kind and keeps only the ones to look at', () => {
        const rows = inventory([
            {
                scope: 'channel 1895766', type: 'combined_order_status_email', subject: 'Your order', body: '<a href="{{store.url}}">a</a><a href="{{order.url}}">b</a><a href="https://reelflies_ca-1895766.mybigcommerce.com/x">c</a>',
            },
            {
                scope: 'global', type: 'createaccount_email', subject: 'Welcome', body: '<p>Hi</p>',
            },
        ]);
        assert.deepEqual(rows, [
            {
                scope: 'channel 1895766',
                type: 'combined_order_status_email',
                subject: 'Your order',
                total: 3,
                counts: { variable: 2, prelaunch: 1 },
                flagged: [{
                    attr: 'href', value: 'https://reelflies_ca-1895766.mybigcommerce.com/x', kind: 'prelaunch', note: classifyLink('https://reelflies_ca-1895766.mybigcommerce.com/x').note,
                }],
            },
            {
                scope: 'global', type: 'createaccount_email', subject: 'Welcome', total: 0, counts: {}, flagged: [],
            },
        ]);
    });
});
