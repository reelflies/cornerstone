// Tests the store schema assertion (ticket 40; spec module 23, stories 65 and 75): store-schema,
// on home pages built from the real partials (the store schema and the ReelFlies footer) and on
// pages broken one way at a time, each of which it must fail.
//
//   node --test scripts/qa/raw-html/assertions/store-schema.test.mjs

import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadAssertions } from '../../raw-html.mjs';
import { readFixture, renderPartial } from '../../render/render.mjs';
import storeSchema from './store-schema.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PARTIALS = path.join(HERE, '..', '..', 'render', 'partials');
const HOME = readFixture(path.join(PARTIALS, 'store-schema', 'home.json'));
const FOOTER = readFixture(path.join(PARTIALS, 'footer', 'prelaunch.json'));

const page = (body, kind = 'home', after = '') => ({
    kind,
    key: kind,
    path: '/',
    url: 'http://localhost:3801/',
    status: 200,
    html: `<!DOCTYPE html><html lang="en-CA"><head><title>ReelFlies</title></head><body><main class="body" id="main-content">${body}</main>${after}</body></html>`,
});
const schema = (settings = {}, context = {}) => renderPartial('components/reelflies/store-schema', { ...HOME, ...context, theme_settings: settings });
const footer = (settings = {}) => renderPartial('components/reelflies/footer', { ...FOOTER, theme_settings: { ...FOOTER.theme_settings, ...settings } });
const home = async (settings = {}, footerSettings = settings) => page(await schema(settings), 'home', await footer(footerSettings));
// The schema with each block's JSON replaced by edit(which, data), "website" or "store", in its
// own script element, as a page would carry it.
const edited = async (edit, settings = {}) => (await schema(settings)).replace(
    /(<script[^>]*data-rf-store-schema="(website|store)"[^>]*>)([\s\S]*?)(<\/script>)/g,
    (all, open, which, json, close) => `${open}${JSON.stringify(edit(which, JSON.parse(json)))}${close}`,
);
const onStore = change => (which, data) => (which === 'store' ? change(data) : data);
const without = (object, ...keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const problems = async pageOrPromise => storeSchema.check(await pageOrPromise);

describe('store-schema', () => {
    it('is registered, for ticket 40, on every page kind (the home page must have it, the rest mustn\'t)', async () => {
        const found = (await loadAssertions()).find(assertion => assertion.id === 'store-schema');
        assert.ok(found);
        assert.equal(found.ticket, 40);
        assert.equal(found.pages, undefined);
    });

    it('passes the home page the partials render, and the .com preview\'s with no shipping rule', async () => {
        assert.deepEqual(await problems(home()), []);
        assert.deepEqual(await problems(home({ rf_store_same_as: 'facebook,instagram,youtube' })), []);
        assert.deepEqual(await problems(home({ rf_ship_free_threshold: '', rf_store_name: 'ReelFlies.com', rf_store_url: 'https://reelflies.com/' })), []);
    });

    it('fails a home page without the store schema, or with a block twice', async () => {
        assert.deepEqual(await problems(page('<h1>Flies</h1>')), [
            'the home page has 0 WebSite blocks: it needs one (components/reelflies/store-schema.html, included by pages/home.html)',
            'the home page has 0 OnlineStore blocks: it needs one (components/reelflies/store-schema.html, included by pages/home.html)',
        ]);
        const html = await schema();
        assert.match((await problems(page(html + html))).join('\n'), /2 WebSite blocks[\s\S]*2 OnlineStore blocks/);
    });

    it('fails the store schema on any other page: it is the home page\'s alone', async () => {
        assert.deepEqual(await problems(page(await schema(), 'product')), [
            'the store schema (WebSite, OnlineStore) is for the home page alone, but this product page has 1 WebSite block and 1 OnlineStore block',
        ]);
        assert.deepEqual(await problems(page('<p>A fly</p>', 'product')), []);
    });

    it('fails a logo before ticket 14\'s master, and a return policy before Shaun states one, on any page', async () => {
        const logo = await edited(onStore(data => ({ ...data, logo: 'https://reelflies.ca/logo.png' })));
        assert.match((await problems(page(logo))).join('\n'), /logo.*ticket 14/);
        const policy = await edited(onStore(data => ({ ...data, hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy' } })));
        assert.match((await problems(page(policy))).join('\n'), /hasMerchantReturnPolicy.*decision 10/);
        const productPolicy = '<script type="application/ld+json">{"@type":"Product","offers":{"@type":"Offer","hasMerchantReturnPolicy":{"@type":"MerchantReturnPolicy"}}}</script>';
        assert.match((await problems(page(productPolicy, 'product'))).join('\n'), /hasMerchantReturnPolicy/);
    });

    it('fails a store without its phone or an address line', async () => {
        const html = await edited(onStore(data => ({ ...without(data, 'telephone'), address: without(data.address, 'postalCode') })));
        assert.deepEqual(await problems(page(html)), [
            'the OnlineStore block has no telephone (rf_store_phone)',
            'the OnlineStore block\'s address has no postalCode (rf_store_postal_code)',
        ]);
    });

    it('fails a store telephone that isn\'t the number the footer dials (the store profile\'s), however each is typed', async () => {
        assert.deepEqual(await problems(home({ rf_store_phone: '+1-866-250-4000' })), [
            'the OnlineStore\'s telephone +1-866-250-4000 isn\'t the number the footer dials, tel:+18662504071: rf_store_phone and the store profile\'s phone number must be one number',
        ]);
        assert.deepEqual(await problems(home({ rf_store_phone: '+1 (866) 250.4071' })), []);
        assert.deepEqual(await problems(page(await schema({ rf_store_phone: '+1-866-250-4000' }))), [], 'no footer phone, nothing to compare');
    });

    it('fails a WebSite and an OnlineStore that disagree on the URL, or a publisher that isn\'t the store', async () => {
        const html = await edited((which, data) => (which === 'website'
            ? { ...data, url: 'https://reelflies.com/', publisher: { '@id': 'https://reelflies.com/#store' } }
            : data));
        assert.deepEqual(await problems(page(html)), [
            'the WebSite\'s url https://reelflies.com/ isn\'t the OnlineStore\'s, https://reelflies.ca/',
            'the WebSite\'s publisher https://reelflies.com/#store isn\'t the OnlineStore (https://reelflies.ca/#store)',
        ]);
    });

    it('fails a sameAs that isn\'t the footer\'s social row: one set (ticket 50)', async () => {
        assert.deepEqual(await problems(home({}, { rf_store_same_as: 'facebook,instagram,youtube' })), [
            'sameAs (https://www.facebook.com/reelflies.ca/, https://www.instagram.com/reelflies/, https://www.pinterest.ca/reelflies/, https://twitter.com/reelfliescanada, https://www.youtube.com/user/reelflies01) isn\'t the footer\'s social row (https://www.facebook.com/reelflies.ca/, https://www.instagram.com/reelflies/, https://www.youtube.com/user/reelflies01): both come from social-keep.html and rf_store_same_as',
        ]);
    });

    it('fails a store that loses the shipping rule its threshold asks for, or gets it wrong', async () => {
        const noRule = await edited(onStore(data => without(data, 'hasShippingService')));
        assert.deepEqual(await problems(page(noRule)), [
            'the store block declares the free-shipping threshold "60" but has no rule for it: free standard shipping to CA on orders from 60, at a rate of 0 (hasShippingService)',
        ]);
        const wrong = await edited(onStore(data => {
            const { shippingConditions } = data.hasShippingService;
            const orderValue = { ...shippingConditions.orderValue, minValue: 50 };
            return { ...data, hasShippingService: { ...data.hasShippingService, shippingConditions: { ...shippingConditions, orderValue } } };
        }));
        assert.match((await problems(page(wrong))).join('\n'), /threshold "60" but has no rule for it/);
        const notANumber = await schema({ rf_ship_free_threshold: '$60' });
        assert.deepEqual(await problems(page(notANumber)), [
            'the store block declares the free-shipping threshold "$60", which isn\'t an amount: set rf_ship_free_threshold to a number, such as 60',
        ]);
        const unasked = await edited(onStore(data => ({ ...data, hasShippingService: { '@type': 'ShippingService' } })), { rf_ship_free_threshold: '' });
        assert.deepEqual(await problems(page(unasked)), ['the OnlineStore block has a shipping rule (hasShippingService), but its threshold (rf_ship_free_threshold) is empty']);
    });
});
