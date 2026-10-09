// The home page's store schema, components/reelflies/store-schema.html (ticket 40; spec module 23,
// stories 65 and 75; R10, SEO-9): a WebSite block and an OnlineStore block, JSON-LD, filled from
// the variation's rf_store_* settings, with sameAs from ReelFlies' social set (the footer's row)
// and the Canadian free-shipping rule from rf_ship_free_threshold (ticket 39's). No logo until
// ticket 14's master (decision 17) and no hasMerchantReturnPolicy until Shaun states a policy
// (decision 10). The raw-HTML assertion store-schema holds the same on every pinned home page.
//
//   node --test scripts/qa/render/partials/store-schema.test.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, scriptsOfType } from '../../raw-html/html.mjs';
import storeSchema from '../../raw-html/assertions/store-schema.mjs';
import {
    readFixture, renderPartial, themeConfig, THEME_DIR,
} from '../render.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOME = readFixture(path.join(HERE, 'store-schema', 'home.json'));
const LINKS = HOME.social_media.map(link => link.url);
const VARIATIONS = themeConfig().variations.map(({ name }) => name);

const render = (settings = {}, context = {}, variation = 'ReelFlies CA') => renderPartial('components/reelflies/store-schema', {
    ...HOME,
    ...context,
    theme_settings: settings,
}, { variation });
const blocks = html => scriptsOfType(html, 'application/ld+json').map(block => JSON.parse(block));
const byType = (html, type) => blocks(html).filter(block => block['@type'] === type);
const store = async (...args) => byType(await render(...args), 'OnlineStore')[0];
const homePage = html => ({
    kind: 'home', key: 'home', path: '/', url: 'http://localhost:3801/', status: 200, html,
});
// What stencil-cli 9.1.0 does to every page `stencil start` serves (server/plugins/renderer/
// responses/pencil-response.js:65-72): it removes the channel's base_url and secure_base_url
// wherever they appear. Channel 1's is https://reelflies.ca, rf_store_url's host, and from the
// Flip 1895766's is too.
const escapeRegex = text => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
const stencilServes = (html, host) => [`http://${host}`, `https://${host}`]
    .reduce((served, url) => served.replace(new RegExp(escapeRegex(url), 'g'), ''), html);

const SHIPPING = {
    '@type': 'ShippingService',
    name: 'Free standard shipping in Canada',
    description: 'Free standard shipping in Canada on fly orders over $60. Fly boxes and gear not included.',
    fulfillmentType: 'FulfillmentTypeDelivery',
    shippingConditions: {
        '@type': 'ShippingConditions',
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'CA' },
        orderValue: { '@type': 'MonetaryAmount', minValue: 60, currency: 'CAD' },
        shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'CAD' },
    },
};

describe('the store schema on ReelFlies CA (1895766)', () => {
    it('is one WebSite block and one OnlineStore block, each JSON that parses, and nothing else', async () => {
        const html = await render();
        assert.deepEqual(blocks(html).map(block => block['@type']), ['WebSite', 'OnlineStore']);
        assert.deepEqual(findTags(html).map(tag => tag.name), ['script', 'script']);
        assert.deepEqual(storeSchema.check(homePage(html)), []);
    });

    it('names the site ReelFlies.ca at https://reelflies.ca/, published by the store', async () => {
        assert.deepEqual(byType(await render(), 'WebSite')[0], {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': 'https://reelflies.ca/#website',
            name: 'ReelFlies.ca',
            url: 'https://reelflies.ca/',
            publisher: { '@id': 'https://reelflies.ca/#store' },
        });
    });

    it('gives the store its legal name, address, phone, social profiles and the Canadian free-shipping rule', async () => {
        assert.deepEqual(await store(), {
            '@context': 'https://schema.org',
            '@type': 'OnlineStore',
            '@id': 'https://reelflies.ca/#store',
            name: 'ReelFlies.ca',
            url: 'https://reelflies.ca/',
            legalName: 'Digital Barn Ltd.',
            telephone: '+1-866-250-4071',
            address: {
                '@type': 'PostalAddress',
                streetAddress: '93 Broadway St',
                addressLocality: 'Tillsonburg',
                addressRegion: 'ON',
                postalCode: 'N4G 3P5',
                addressCountry: 'CA',
            },
            sameAs: LINKS,
            hasShippingService: SHIPPING,
        });
    });

    it('keeps every URL when stencil start strips the channel\'s own URL from the page, so a local run reads what the live page says', async () => {
        const cases = [['ReelFlies CA', 'reelflies.ca'], ['ReelFlies CA channel 1', 'reelflies.ca'], ['ReelFlies US', 'reelflies.com']];
        await Promise.all(cases.map(async ([variation, host]) => {
            const html = await render({}, {}, variation);
            const served = stencilServes(html, host);
            assert.deepEqual(blocks(served), blocks(html), variation);
            assert.equal(byType(served, 'WebSite')[0].url, `https://${host}/`, variation);
            assert.deepEqual(storeSchema.check(homePage(served)), [], variation);
        }));
    });

    it('declares the threshold it was given on the store block, for the raw-HTML assertion', async () => {
        const [, storeTag] = findTags(await render(), 'script');
        assert.equal(storeTag.attrs['data-rf-ship-free-threshold'], '60');
        assert.equal(storeTag.attrs['data-rf-store-schema'], 'store');
    });
});

describe('every variation', () => {
    it('has no logo (ticket 14\'s master, decision 17) and no hasMerchantReturnPolicy (decision 10) anywhere', async () => {
        const pages = await Promise.all(VARIATIONS.map(variation => render({}, {}, variation)));
        pages.forEach((html, index) => {
            assert.equal(blocks(html).length, 2, VARIATIONS[index]);
            assert.doesNotMatch(html, /"logo"|hasMerchantReturnPolicy|MerchantReturnPolicy/, VARIATIONS[index]);
        });
    });

    it('carries reelflies.ca\'s values on channel 1 (ticket 53): the base holds them, so the variation inherits them', async () => {
        const html = await render({}, {}, 'ReelFlies CA channel 1');
        const [site] = byType(html, 'WebSite');
        assert.equal(site.name, 'ReelFlies.ca');
        assert.equal(site.url, 'https://reelflies.ca/');
        assert.deepEqual((await store({}, {}, 'ReelFlies CA channel 1')).hasShippingService, SHIPPING);
        const channel1 = themeConfig().variations.find(({ name }) => name === 'ReelFlies CA channel 1');
        assert.deepEqual(Object.keys(channel1.settings).filter(key => key.startsWith('rf_store_')), [], 'values only where they differ (build pipeline 6.4)');
    });

    it('names the .com preview ReelFlies.com, with no free-shipping rule (rf_ship_free_threshold is empty there)', async () => {
        const html = await render({}, {}, 'ReelFlies US');
        const [site] = byType(html, 'WebSite');
        assert.equal(site.name, 'ReelFlies.com');
        assert.equal(site.url, 'https://reelflies.com/');
        const [onlineStore] = byType(html, 'OnlineStore');
        assert.equal(onlineStore['@id'], 'https://reelflies.com/#store');
        assert.equal('hasShippingService' in onlineStore, false);
        assert.deepEqual(storeSchema.check(homePage(html)), []);
    });
});

describe('sameAs, the same set as the footer\'s social row', () => {
    it('lists exactly the links the footer\'s row shows, for each rf_store_same_as', async () => {
        const filters = ['', 'facebook,instagram,youtube', 'x, YouTube', ' , '];
        const pairs = await Promise.all(filters.map(async filter => [
            findTags(await renderPartial('components/reelflies/social-links', { social_media: HOME.social_media, rf_filter: filter }), 'a').map(tag => tag.attrs.href),
            (await store({ rf_store_same_as: filter })).sameAs,
        ]));
        pairs.forEach(([footerLinks, sameAs], index) => assert.deepEqual(sameAs, footerLinks, `rf_store_same_as "${filters[index]}"`));
    });

    it('has no sameAs when the set keeps no link or the store has none, and leaves out a link with no URL', async () => {
        assert.equal('sameAs' in await store({ rf_store_same_as: 'flickr' }), false);
        assert.equal('sameAs' in await store({}, { social_media: [] }), false);
        assert.equal('sameAs' in await store({}, { social_media: undefined }), false);
        const links = [{ url: '', display_name: 'pinterest' }, ...HOME.social_media.slice(0, 1)];
        assert.deepEqual((await store({}, { social_media: links })).sameAs, [LINKS[0]]);
    });
});

describe('optional values', () => {
    const OPTIONAL = {
        rf_store_legal_name: 'legalName',
        rf_store_phone: 'telephone',
        rf_store_same_as: 'sameAs',
        rf_ship_free_threshold: 'hasShippingService',
    };
    const ADDRESS = ['rf_store_street', 'rf_store_locality', 'rf_store_region', 'rf_store_postal_code', 'rf_store_country'];

    it('drops only the property whose setting is empty, and every combination still parses', async () => {
        const keys = [...Object.keys(OPTIONAL), 'address'];
        // Every subset of the keys left blank (rf_store_same_as "blank" by naming no network the
        // store has; "address" blanks all five address lines).
        const subsets = Array.from({ length: 2 ** keys.length }, (_, mask) => keys.filter((key, bit) => Math.floor(mask / 2 ** bit) % 2 === 1));
        const blank = key => (key === 'address'
            ? Object.fromEntries(ADDRESS.map(name => [name, '']))
            : { [key]: key === 'rf_store_same_as' ? 'flickr' : '' });
        const pages = await Promise.all(subsets.map(empty => render(Object.assign({}, ...empty.map(blank)))));
        pages.forEach((html, index) => {
            const empty = subsets[index];
            const onlineStore = byType(html, 'OnlineStore')[0];
            assert.ok(onlineStore, `blank: ${empty.join(', ')}`);
            for (const key of keys) {
                const property = key === 'address' ? 'address' : OPTIONAL[key];
                // The rule ships to rf_store_country, one of the address lines.
                const expected = !empty.includes(key) && !(property === 'hasShippingService' && empty.includes('address'));
                assert.equal(property in onlineStore, expected, `${property} with ${empty.join(', ') || 'nothing'} blank`);
            }
        });
    });

    it('keeps the address\'s other lines when one is empty', async () => {
        const { address } = await store({ rf_store_street: '  ', rf_store_region: '' });
        assert.deepEqual(address, {
            '@type': 'PostalAddress', addressLocality: 'Tillsonburg', postalCode: 'N4G 3P5', addressCountry: 'CA',
        });
    });

    it('renders nothing without a name or a URL, so a variation can leave the markup out', async () => {
        assert.equal((await render({ rf_store_name: ' ' })).trim(), '');
        assert.equal((await render({ rf_store_url: '' })).trim(), '');
    });

    it('drops the shipping rule when the threshold isn\'t a number, or there is no default currency or country, and keeps a decimal one', async () => {
        assert.equal('hasShippingService' in await store({ rf_ship_free_threshold: '$60' }), false);
        assert.equal('hasShippingService' in await store({}, { currency_selector: {} }), false);
        assert.equal('hasShippingService' in await store({}, { currency_selector: { active_currency_code: 'CAD' } }), false, 'the shopper\'s currency isn\'t the rule\'s');
        assert.equal('hasShippingService' in await store({ rf_store_country: '' }), false);
        const rule = (await store({ rf_ship_free_threshold: ' 59.5 ' }, { currency_selector: { active_currency_code: 'CAD', default_currency_code: 'USD' } })).hasShippingService;
        assert.deepEqual(rule.shippingConditions.orderValue, { '@type': 'MonetaryAmount', minValue: 59.5, currency: 'USD' });
        assert.equal(rule.description, 'Free standard shipping in Canada on fly orders over $59.5. Fly boxes and gear not included.');
    });

    it('trims each value, and keeps quotes, backslashes and a closing script tag inside the block', async () => {
        const name = ' Reel "Flies" \\ </script><script>alert(1)</script> ';
        const html = await render({ rf_store_name: name });
        assert.equal(findTags(html, 'script').length, 2);
        assert.equal(byType(html, 'WebSite')[0].name, name.trim());
        assert.doesNotMatch(html, /<\/script><script>alert/);
    });
});

describe('the home.html hook', () => {
    it('puts the store schema on the home page once', async () => {
        const html = await renderPartial('pages/home', HOME, {
            overrides: { 'layout/base': '{{#block "hero"}}{{/block}}{{#block "page"}}{{/block}}' },
        });
        assert.deepEqual(blocks(html).map(block => block['@type']), ['WebSite', 'OnlineStore']);
    });

    it('is included by home.html alone', () => {
        const including = [];
        const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (/\{\{#?>\s*components\/reelflies\/store-schema\b/.test(fs.readFileSync(file, 'utf8'))) including.push(path.relative(THEME_DIR, file));
        });
        walk(path.join(THEME_DIR, 'templates'));
        assert.deepEqual(including, ['templates/pages/home.html']);
    });
});
