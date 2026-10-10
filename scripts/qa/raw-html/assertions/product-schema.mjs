// The product's structured data as a crawler gets it (ticket 40; spec module 23; R10, SEO-9; story
// 75), on every product pin (stock products/schema.html):
//
// - Exactly one Product block in the page's JSON-LD.
// - Exactly one Offer (`offers` one object of @type Offer, or a list of one): never none, a list
//   of several, or an AggregateOffer. The ProductGroup of sizes is out of scope (spec, Out of
//   Scope), so a size never adds an Offer. The Offer names its priceCurrency and a price (or stock's
//   minPrice and maxPrice for a price range).
// - The brand marked up exactly when the product view names one (stock's data-product-brand on
//   .productView), as a Brand of the same name: ticket 18's job gives in-house flies the ReelFlies
//   brand, and stock's template then marks it up (criterion 7). A page with no product view (the
//   harness's own fixture pages) isn't held to the view's brand.
// - On product@in-house, the in-house fly a channel pins once ticket 18's brand job is applied,
//   brand "ReelFlies" itself (criterion 7): the view rule alone passes a fly the job left
//   unbranded, since the view and the JSON-LD both read product.brand. No channel pins it yet.
//
// A block that doesn't parse is json-ld-parses' to report: this judges only a page whose blocks all
// parse. What the reviews add is product-reviews'.

import { decodeHtml, findTags } from '../html.mjs';
import { productBlocks } from './product-reviews.mjs';

export const IN_HOUSE_PIN = 'product@in-house'; // pages.mjs, after ticket 18's brand apply
export const IN_HOUSE_BRAND = 'ReelFlies'; // ticket 18's brand on in-house flies
const typed = (value, type) => [].concat(value?.['@type']).includes(type);
const filled = value => value !== undefined && value !== null && String(value).trim() !== '';

function offerProblems(data) {
    if (data.offers === undefined) return ['the Product has no offers'];
    const offers = [].concat(data.offers);
    if (offers.length !== 1) return [`${offers.length} offers, not one Offer`];
    const [offer] = offers;
    if (typed(offer, 'AggregateOffer')) return ['an AggregateOffer, not one Offer'];
    if (!typed(offer, 'Offer')) return [`the offer is a ${[].concat(offer?.['@type']).join(', ') || 'thing with no @type'}, not an Offer`];
    const problems = [];
    if (!filled(offer.priceCurrency)) problems.push('the Offer has no priceCurrency');
    if (!filled(offer.price) && !(filled(offer.minPrice) && filled(offer.maxPrice))) problems.push('the Offer has no price');
    return problems;
}

function brandProblems(data, html) {
    const view = findTags(html, 'div').find(tag => /(^|\s)productView(\s|$)/.test(tag.attrs.class || ''));
    const marked = data.brand;
    if (marked !== undefined && (!typed(marked, 'Brand') || !filled(marked.name))) return ['the brand isn\'t a Brand with a name'];
    if (!view) return [];
    const shown = decodeHtml(view.attrs['data-product-brand'] || '').trim();
    if (!shown && marked) return [`a brand ("${marked.name}") in the JSON-LD, but the product view names none`];
    if (shown && !marked) return [`the product view names the brand "${shown}", but the JSON-LD has none`];
    if (shown && marked.name !== shown) return [`the JSON-LD's brand is "${marked.name}", the product view's "${shown}"`];
    return [];
}

function inHouseProblems(data, key) {
    if (key !== IN_HOUSE_PIN) return [];
    const where = `${IN_HOUSE_PIN}, the in-house fly`;
    if (!data.brand) return [`no brand in the JSON-LD on ${where}, which ticket 18's job brands "${IN_HOUSE_BRAND}"`];
    return data.brand.name === IN_HOUSE_BRAND ? [] : [`the JSON-LD's brand is "${data.brand.name}" on ${where}, not "${IN_HOUSE_BRAND}"`];
}

export default {
    id: 'product-schema',
    ticket: 40,
    description: 'one Product in the JSON-LD with exactly one Offer, and the brand marked up exactly when the product view names one; brand "ReelFlies" on product@in-house',
    pages: ['product'],
    check(page) {
        const blocks = productBlocks(page.html);
        if (blocks === null) return [];
        if (blocks.length !== 1) return [`${blocks.length} Product blocks in the JSON-LD, not one`];
        const [data] = blocks;
        return [...offerProblems(data), ...brandProblems(data, page.html), ...inHouseProblems(data, page.key)];
    },
};
