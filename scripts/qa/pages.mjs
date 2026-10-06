// The pages every QA gate visits, pinned per channel in one place (ticket 16), so a
// catalogue change can't quietly move a screenshot, an axe run or a raw-HTML check.
//
// Keys are template names from the spec's seam 1 list: home, fly-type, species,
// species-hub, product, cart, hook-chart, 404 and brand, plus category for the stock
// category template until ticket 32 builds the Fly Type and Species pages. A template
// ticket adds its page here when it lands; the screenshot and axe runs then cover it.
//
// Each channel has:
//   pages         template -> path. axe and the screenshots visit every one, and so does
//                 the raw-HTML check, whose assertions pick the kinds they apply to.
//   notPinnedYet  optional, template -> why the channel can't pin it yet. Only for the
//                 RAW_HTML_REQUIRED kinds: the raw-HTML check fails a channel that pins
//                 neither the page nor a reason here.
//   mask          optional, template -> selectors the screenshots also mask on that page:
//                 content these pins can't hold still, such as a live product list

export const CHANNELS = {
    1895766: {
        name: 'ReelFlies_CA prelaunch',
        pages: {
            home: '/',
            cart: '/cart.php',
            brand: '/brands/ReelFlies.html',
            404: '/rf-qa-missing-page/',
        },
        // Pin both, and delete these lines, when refactor tickets 13 and 14 land.
        notPinnedYet: {
            product: 'ReelFlies_CA has no products until refactor ticket 13',
            category: 'ReelFlies_CA has no tree-4 categories until refactor ticket 14',
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
        // The live catalogue decides which products these pages list, so the lists can't
        // be pinned here. Pin a listing that holds still before unmasking one.
        mask: {
            category: ['.productGrid'],
            product: ['#tab-related', '#tab-similar'], // Related Products, Customers Also Viewed
        },
    },
};

// The page kinds the raw-HTML check needs on every channel: spec seam 2 fetches one
// product page and one category page.
export const RAW_HTML_REQUIRED = ['product', 'category'];

// The status each pinned page must return. A gate that got anything else would be
// checking an error page instead of the template, so the run fails.
export const expectedStatus = template => (template === '404' ? 404 : 200);

// Live data the screenshots mask on every page, so they don't fail on price, stock or
// catalogue changes: prices, stock and SKU lines, ratings and review counts, sale and
// sold-out badges, cart counts and totals, page counts, and store content edited outside
// the theme (marketing banners, and Page Builder or Widgets API widgets). Product cards,
// grids and carousels stay visible; a page whose list isn't pinned masks it through its
// channel's `mask`. Tickets 46-49 replace the widget mask with pinned widget content when
// the home page's widgets are synced from widgets/.
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
    '.rating--small',
    '[class*="sale-flag"]',
    '[class*="sold-out-flag"]',
    '.starwrap',
    '.countPill',
    '.cart-quantity',
    '.cart-item-value',
    '.cart-total-value',
];

// Everything the screenshot of one pinned page masks.
export function masksFor(channel, template) {
    return [...LIVE_DATA, ...(CHANNELS[channel]?.mask?.[template] || [])];
}

export function pinnedChannel(channel) {
    const entry = CHANNELS[channel];
    if (!entry) throw new Error(`No pages are pinned for channel ${channel} in scripts/qa/pages.mjs`);
    return entry;
}

export const pinnedPages = channel => pinnedChannel(channel).pages;
