// The home page's store schema in the server HTML (ticket 40; spec module 23, stories 65 and 75;
// R10, SEO-9), as components/reelflies/store-schema.html renders it:
// - On the home page, exactly one WebSite block and one OnlineStore block, naming the same URL,
//   the WebSite published by the store. On every other page, neither: they're the home page's.
// - The OnlineStore with its telephone and every address line (stories 65 and 75).
// - sameAs exactly the footer's social row, in order, whenever the footer shows one: both come
//   from ReelFlies' social set (social-keep.html and rf_store_same_as; ticket 50's note).
// - The free-shipping rule exactly when the store block declares a threshold
//   (data-rf-ship-free-threshold, from rf_ship_free_threshold): free standard shipping to the
//   store's country on orders from that amount. A threshold that isn't a number fails, so a
//   Theme Styles typo can't drop the rule quietly.
// - No logo until ticket 14's master (decision 17), and no hasMerchantReturnPolicy anywhere, on
//   any page, until Shaun states a policy (decision 10). The PR that adds either changes this.
// Every block that doesn't parse is json-ld-parses's to report; this one reads the rest.

import {
    decodeHtml, elementsHtml, findTags, scriptsOfType,
} from '../html.mjs';

const JSON_LD = 'application/ld+json';
const INCLUDE = 'components/reelflies/store-schema.html, included by pages/home.html';
const ADDRESS = {
    streetAddress: 'rf_store_street',
    addressLocality: 'rf_store_locality',
    addressRegion: 'rf_store_region',
    postalCode: 'rf_store_postal_code',
    addressCountry: 'rf_store_country',
};

// Each JSON-LD block that parses, with its script element's attributes. findTags and
// scriptsOfType both skip comments, so their scripts of the type line up one to one.
function blocks(html) {
    const tags = findTags(html, 'script').filter(tag => (tag.attrs.type || '').trim().toLowerCase() === JSON_LD);
    return scriptsOfType(html, JSON_LD).flatMap((text, index) => {
        try {
            return [{ attrs: tags[index]?.attrs || {}, data: JSON.parse(text) }];
        } catch {
            return [];
        }
    });
}

// A block's top-level nodes: the object itself, an array's items, or its @graph.
const nodesOf = data => {
    if (Array.isArray(data)) return data.flatMap(nodesOf);
    if (data && Array.isArray(data['@graph'])) return data['@graph'];
    return data && typeof data === 'object' ? [data] : [];
};
const isType = (node, type) => [].concat(node['@type'] ?? []).includes(type);
const text = value => (typeof value === 'string' ? value.trim() : '');
const list = value => [].concat(value ?? []);
const count = (n, what) => `${n} ${what} block${n === 1 ? '' : 's'}`;

// Any key named `key`, at any depth.
const hasKey = (value, key) => {
    if (Array.isArray(value)) return value.some(item => hasKey(item, key));
    if (!value || typeof value !== 'object') return false;
    return Object.keys(value).some(name => name === key || hasKey(value[name], key));
};

// The footer's social row: each link's href, in order, or null when the footer shows no row.
function footerSocial(html) {
    const footer = elementsHtml(html, 'footer', attrs => 'data-rf-footer' in attrs)[0];
    const row = footer && elementsHtml(footer, 'ul', attrs => (attrs.class || '').split(/\s+/).includes('socialLinks'))[0];
    if (!row) return null;
    return findTags(row, 'a').map(tag => decodeHtml(tag.attrs.href || '').trim()).filter(Boolean);
}

// A condition of the rule: free (rate 0) to `country`, on orders from `amount`, in one currency.
const freeFrom = (condition, country, amount) => {
    const { orderValue = {}, shippingRate = {} } = condition || {};
    const destinations = list(condition?.shippingDestination).map(region => region?.addressCountry);
    return destinations.includes(country)
        && orderValue.minValue === amount && /^[A-Z]{3}$/.test(orderValue.currency || '')
        && shippingRate.value === 0 && shippingRate.currency === orderValue.currency;
};

function shippingProblems(store, attrs) {
    const threshold = decodeHtml(attrs['data-rf-ship-free-threshold'] || '').trim();
    const service = store.hasShippingService;
    if (!threshold) {
        return service ? ['the OnlineStore block has a shipping rule (hasShippingService), but its threshold (rf_ship_free_threshold) is empty'] : [];
    }
    const amount = Number(threshold);
    if (!Number.isFinite(amount) || amount <= 0) {
        return [`the store block declares the free-shipping threshold "${threshold}", which isn't an amount: set rf_ship_free_threshold to a number, such as 60`];
    }
    const country = store.address?.addressCountry;
    const ruled = list(service).some(entry => isType(entry, 'ShippingService') && list(entry.shippingConditions).some(condition => freeFrom(condition, country, amount)));
    return ruled ? [] : [`the store block declares the free-shipping threshold "${threshold}" but has no rule for it: free standard shipping to ${country} on orders from ${amount}, at a rate of 0 (hasShippingService)`];
}

function storeProblems(store, attrs, html) {
    const problems = [];
    if (!text(store.name)) problems.push('the OnlineStore block has no name (rf_store_name)');
    if (!text(store.telephone)) problems.push('the OnlineStore block has no telephone (rf_store_phone)');
    if (!isType(store.address || {}, 'PostalAddress')) {
        problems.push('the OnlineStore block has no PostalAddress (rf_store_street and the other address lines)');
    } else {
        Object.entries(ADDRESS).forEach(([property, setting]) => {
            if (!text(store.address[property])) problems.push(`the OnlineStore block's address has no ${property} (${setting})`);
        });
    }
    if ('logo' in store) problems.push('the OnlineStore block has a logo: it waits for ticket 14\'s logo master, at least 112x112 (decision 17)');
    const row = footerSocial(html);
    const sameAs = list(store.sameAs);
    if (row && sameAs.join('\n') !== row.join('\n')) {
        problems.push(`sameAs (${sameAs.join(', ') || 'none'}) isn't the footer's social row (${row.join(', ')}): both come from social-keep.html and rf_store_same_as`);
    }
    return [...problems, ...shippingProblems(store, attrs)];
}

export default {
    id: 'store-schema',
    ticket: 40,
    description: 'the home page has one WebSite and one OnlineStore block (address, phone, sameAs as the footer\'s social row, the free-shipping rule), and no page has them but home; no logo or return policy yet',
    check(page) {
        const parsed = blocks(page.html);
        const problems = parsed.some(block => hasKey(block.data, 'hasMerchantReturnPolicy'))
            ? ['a JSON-LD block has hasMerchantReturnPolicy: it waits until Shaun states a return policy (ticket 13, decision 10)']
            : [];
        const nodes = parsed.flatMap(block => nodesOf(block.data).map(node => ({ node, attrs: block.attrs })));
        const sites = nodes.filter(({ node }) => isType(node, 'WebSite'));
        const stores = nodes.filter(({ node }) => isType(node, 'OnlineStore'));
        if (page.kind !== 'home') {
            if (sites.length || stores.length) {
                problems.push(`the store schema (WebSite, OnlineStore) is for the home page alone, but this ${page.kind} page has ${count(sites.length, 'WebSite')} and ${count(stores.length, 'OnlineStore')}`);
            }
            return problems;
        }
        if (sites.length !== 1) problems.push(`the home page has ${count(sites.length, 'WebSite')}: it needs one (${INCLUDE})`);
        if (stores.length !== 1) problems.push(`the home page has ${count(stores.length, 'OnlineStore')}: it needs one (${INCLUDE})`);
        if (sites.length !== 1 || stores.length !== 1) return problems;
        const [{ node: site }] = sites;
        const [{ node: store, attrs }] = stores;
        if (!text(site.name)) problems.push('the WebSite block has no name (rf_store_name)');
        if (!/^https?:\/\/[^/\s]+/.test(text(site.url))) problems.push(`the WebSite block's url "${site.url ?? ''}" isn't an absolute URL (rf_store_url)`);
        if (text(site.url) !== text(store.url)) problems.push(`the WebSite's url ${site.url} isn't the OnlineStore's, ${store.url}`);
        const publisher = site.publisher?.['@id'];
        if (publisher !== undefined && publisher !== store['@id']) problems.push(`the WebSite's publisher ${publisher} isn't the OnlineStore (${store['@id']})`);
        return [...problems, ...storeProblems(store, attrs, page.html)];
    },
};
