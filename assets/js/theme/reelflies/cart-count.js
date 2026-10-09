// What a cart holds, in flies or in items (ticket 41; story 51), for ticket 38's "15 flies in your
// cart." and tickets 43 and 44 (build pipeline 6.2). The cart page's own heading counts the same
// way in its template (components/reelflies/cart-title.html).
//
// The brand rule (Shaun, review-02): the count is in flies and patterns only when every line's
// brand is one of the channel's fly brands (theme setting rf_fly_brands, comma-separated; today
// "ReelFlies"). Any other line, or a line with no brand, makes it items and products. No line
// carries its Placements, so the brand is the only signal the cart has (ticket 13, decision 13).
// A storefront that sends no brand (show_product_brand off) always counts items.

export function flyBrandList(setting) {
    return String(setting ?? '').split(',').map(name => name.trim()).filter(Boolean);
}

// items: [{ productId, quantity, brand }]. Returns { units, products, flies }.
export function countCart(items, flyBrands) {
    const units = items.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const products = new Set(items.map(line => line.productId)).size;
    const flies = items.length > 0 && flyBrands.length > 0 && items.every(line => flyBrands.includes(String(line.brand ?? '').trim()));
    return { units, products, flies };
}
