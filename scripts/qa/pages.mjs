// The pages every QA gate visits, pinned per channel in one place (ticket 16), so a
// catalogue change can't quietly move a screenshot, an axe run or a raw-HTML check.
//
// Keys are template names from the spec's seam 1 list: home, fly-type, species,
// species-hub, product, cart, hook-chart, 404 and brand, plus category for the stock
// category template until ticket 32 builds the Fly Type and Species pages. A template
// ticket adds its page here when it lands; the screenshot and axe runs then cover it.

export const CHANNELS = {
    1895766: {
        name: 'ReelFlies_CA prelaunch',
        // No products and no tree-4 categories yet (refactor tickets 13 and 14), so
        // there is no product or category page to pin. Pin them when those land.
        pages: {
            home: '/',
            cart: '/cart.php',
            brand: '/brands/ReelFlies.html',
            404: '/rf-qa-missing-page/',
        },
    },
    1: {
        // Read-only: `stencil start -c 1` renders this repo's templates with live
        // reelflies.ca data, the fallback for the product, category and Quick view runs
        // until ReelFlies_CA has products. Nothing here ever writes to channel 1.
        name: 'reelflies.ca (live, read-only)',
        pages: {
            product: '/realistic-flying-hot-butt-hopper-brown/', // the reference page's hero product (6178)
            category: '/flies/realistic-trout-flies/', // tree 1; 12 cards with Quick view, and facets
        },
    },
};

// The page kinds the raw-HTML harness fetches, when the channel has them pinned.
export const RAW_HTML_PAGES = ['home', 'product', 'category'];

// Live data the screenshots mask, so they don't fail on catalogue or price changes:
// prices, stock and SKU lines, ratings and review counts, cart counts and totals, the
// product lists and page counts that change with the catalogue, and store content
// edited outside the theme: marketing banners and Page Builder or Widgets API widgets.
// Tickets 46-49 replace the widget mask with pinned widget content when the home
// page's widgets are synced from widgets/.
export const LIVE_DATA = [
    '.banners',
    '[data-widget-id]',
    '.pagination',
    '.price-section',
    '.price',
    '[data-product-price-with-tax]',
    '[data-product-price-without-tax]',
    '[data-product-stock]',
    '.productView-info',
    '.productView-rating',
    '.productView-reviewLink',
    '.countPill',
    '.cart-quantity',
    '.cart-item-value',
    '.cart-total-value',
    '.productGrid',
    '.productCarousel',
    '.productView-thumbnails',
    '[data-similar-product-id]',
    '.tabs-contents [data-product-related]',
];

export function pinnedPages(channel) {
    const entry = CHANNELS[channel];
    if (!entry) throw new Error(`No pages are pinned for channel ${channel} in scripts/qa/pages.mjs`);
    return entry.pages;
}
