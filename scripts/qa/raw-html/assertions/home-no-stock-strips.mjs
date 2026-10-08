// No stock product strip on the home page (ticket 47; R5, HOME-3): nothing renders between the
// Fly Type cards and the tiles, and the stock new-product strip doesn't land after every home
// section. config.json sets homepage_featured_products_count, homepage_top_products_count and
// homepage_new_products_count to 0 ("Disable") in the base settings, which every variation
// inherits, so the store sends home.html no products for them. Best sellers come from ticket 48's
// widget instead. This checks the page itself, so a variation or a Theme Styles edit that turns
// a strip back on fails the run.

import { findTags } from '../html.mjs';

// What each stock strip renders (templates/components/products/featured.html, top.html, and
// new.html's carousel).
const STRIPS = [
    { name: 'featured products', match: attrs => attrs['data-product-type'] === 'featured' },
    { name: 'most popular products', match: attrs => attrs['data-product-type'] === 'top_sellers' },
    { name: 'new products', match: attrs => attrs['data-list-name'] === 'New Products' },
];

export function stockStrips(html) {
    return findTags(html).flatMap(tag => STRIPS.filter(({ match }) => match(tag.attrs))
        .map(({ name }) => `the home page renders the stock ${name} strip: ${tag.raw.slice(0, 90)}`));
}

export default {
    id: 'home-no-stock-strips',
    ticket: 47,
    description: 'no stock featured, most popular or new products strip on the home page',
    pages: ['home'],
    check(page) {
        return stockStrips(page.html);
    },
};
