// The pages every QA gate visits, pinned per channel in one place (ticket 16), so a
// catalogue change can't quietly move a screenshot, an axe run or a raw-HTML check.
//
// Keys are page keys: a page kind, which is a template name from the spec's seam 1 list
// (home, fly-type, species, species-hub, product, cart, hook-chart, 404 and brand, plus
// category for the category template, ticket 32's page, while the fly-type and species keys
// wait for tree 4's pages (refactor 13), page for a Web Page, login and create-account for the
// sign-in forms, and search for the search results, ticket 31), or kind@name for one more pin
// of the same kind (W0-8), such as product@5663 or product@sold-out. A template ticket adds its page here when it lands; the
// screenshot and axe runs then cover it.
// - The kind decides what the page must answer (expectedStatus), which raw-HTML assertions
//   apply (an assertion's `pages` and `notOn` name kinds, or one kind@name pin), which pin
//   satisfies RAW_HTML_REQUIRED, and the reference screen it is shown beside.
// - The whole key names its screenshot baseline (baselineName), and is what `mask`, `hold`
//   and a UI state's `pages` (states.mjs) name: `mask: { category: [...] }` masks the plain
//   category pin only, so a stable category@alpha pin beside it keeps its cards.
//
// Each channel has:
//   variation     optional: the config.json variation its runs render when QA_VARIATION is
//                 unset (defaultVariation below). Without one, a run renders ReelFlies CA.
//   pages         page key -> path. axe and the screenshots visit every one, and so does
//                 the raw-HTML check, whose assertions pick the kinds they apply to.
//   notPinnedYet  optional, template -> why the channel can't pin it yet. Only for the
//                 RAW_HTML_REQUIRED kinds: the raw-HTML check fails a channel that pins
//                 neither the page nor a reason here.
//   mask          optional, page key -> selectors the screenshots also mask on that page:
//                 content these pins can't hold still but whose size holds, such as a
//                 listing's count
//   hold          optional, page key -> { selector: height in px }: live content whose
//                 height these pins can't hold still. The screenshot takes everything
//                 inside each box out and holds the box at that height, so the page keeps
//                 its size, and masks the box (screenshotStyle and masksFor below). A key
//                 may be a selector list, which holds each box it names at that height.

export const CHANNELS = {
    1895766: {
        name: 'ReelFlies_CA prelaunch',
        pages: {
            home: '/',
            cart: '/cart.php',
            brand: '/brands/ReelFlies.html',
            404: '/rf-qa-missing-page/',
            // Ticket 25: the sign-in and create-account forms, whose stock templates had no <main>
            // and whose fields carry the autocomplete tokens (raw-HTML assertion autocomplete).
            login: '/login.php',
            'create-account': '/login.php?action=create_account',
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
        // Ticket 53: channel 1's own variation, with tree 1's menu ids (decision 10's interim
        // name). Its baselines are scripts/qa/baselines/1-reelflies-ca-channel-1/.
        variation: 'ReelFlies CA channel 1',
        pages: {
            // The reference page's hero product (6178). Its description was the same on
            // 2026-10-06 as in the 2026-09-07 product export. Its five related products
            // look automatic (all hoppers named like it), so a new hopper could change
            // them: `hold` below keeps that from moving the page.
            product: '/realistic-flying-hot-butt-hopper-brown/',
            // Ticket 37: Fat Albert (5663), with several sizes and a required Colour (stock
            // swatches), so the size pills' default (no size chosen) and their UI states are shot,
            // and the size-pills assertion's multi-size rule bites. The product pin has one size.
            'product@sizes': '/fat-albert/',
            category: '/flies/realistic-trout-flies/', // tree 1; 12 cards with Quick view, and facets
            // Ticket 32: a More from ReelFlies category (a top-level category outside the menu
            // ids), whose four subcategories have images, so its plain header and thumbnail
            // chips are checked live.
            'category@more': '/fly-gear/',
            // Ticket 32: a Fly Type sub-type rendered with the noindex template, which
            // custom-layouts.json maps to it: its plain header and its one robots meta.
            'category@noindex': '/flies/realistic-trout-flies/realistic-nymphs/',
            // A Web Page (pages/page), for ticket 25's focus ring and landmark checks: ReelFlies_CA
            // has none yet (ticket 22's sources sync later). One paragraph of terms that read the
            // same on 2026-10-07 as the coupon wording on reelflies.ca has for years.
            page: '/coupon-codes/',
            // Ticket 31: search results for "streamer", whose first 12 hold flies with and without
            // sizes, three Mustad hook packs (Fly Gear) and a bulk selection, so the cards' "/ fly"
            // rule and the listing's eager and lazy photos are checked on a real search page
            // (2026-10-09).
            search: '/search.php?search_query=streamer&section=product',
            // Ticket 34: the Species hub's stand-in until wave R2 pins /species/ on 1895766 (once
            // refactor 14 has placed the products): tree 1's Saltwater, Warmwater & Salmon (272),
            // which custom-layouts.json renders with the hub template. Its nine subcategories are
            // the tiles, each with its image and count; tree 1 puts their children past Menu
            // Display Depth 3, so no tile has Fly Type links.
            'species-hub': '/flies/saltwater-warmwater-salmon/',
            // Ticket 36: the ReelFlies brand listing, which the store answers as brand 411 (its own
            // URL is /reelflies-2/): the brand's image as the banner, 24 of its 2,167 products a page
            // and the numbered pager (2026-10-09).
            brand: '/brands/ReelFlies.html',
        },
        // The live catalogue decides which products the category, search and brand pins list,
        // so their grids are held (below), not masked. Pin a listing that holds still before
        // letting its cards into a shot. The search pin's result counts (its heading and both
        // tabs) change with the catalogue too. The tabs by role: stock search.js swaps the
        // active tab's navBar-action class. The listing's count (ticket 33's row) changes with
        // the catalogue too. The brand pin's row names the page ("Page 1": a brand's context has
        // no total, ticket 36), which holds still, so it stays in the shot.
        mask: {
            category: ['[data-rf-list-count]'],
            'category@more': ['[data-rf-list-count]'],
            'category@noindex': ['[data-rf-list-count]'],
            search: ['.page-heading', '[data-search-page-tabs] [role="tab"]'],
            // The tiles' counts and the grid's (ticket 34) follow the catalogue.
            'species-hub': ['[data-rf-hub-count]'],
            // Fat Albert's option rows, whose sold-out marks follow the live stock (its sizes, and
            // its colours once a size is chosen), whole, so a mark that moves to another value
            // doesn't move the mask; and the line naming the sizes. A UI state marks the options
            // (data-rf-qa-state) and sets its own marks, so they aren't masked (states.mjs).
            'product@sizes': [
                '[data-product-option-change]:not([data-rf-qa-state]) .rf-pills',
                '[data-product-option-change]:not([data-rf-qa-state]) [data-product-attribute="swatch"] .form-option-wrapper',
                '[data-product-option-change]:not([data-rf-qa-state]) [data-rf-sold-out-line]',
            ],
        },
        // The product pins' related patterns (ticket 39's grid of cards, product-related.html):
        // the store picks them (6178's look automatic, all hoppers named like it), and their
        // titles wrap to one line or two, so the live list sets the page's height. Held at 400px
        // at both widths, a height neither layout of four cards has (one row at 1280, two at
        // 375), so a hold that stops applying fails the shot. The heading and the section stay
        // in the shot; the grid's look is shot from fixed data on the fixture page
        // (product-page-screens.spec.mjs).
        // The search pin's "Did you mean" panel lists the categories the store finds for the
        // query, so the catalogue sets its height (#68's rf/spec).
        // The category, search and brand pins' grids (the listing's own, in
        // #product-listing-container, not quick search's or the cart preview's): the live
        // catalogue's cards, whose titles wrap to one line or two, so the rows' heights follow
        // the list. A mask kept the grid's size: on 2026-10-09 the search pin at 375 grew 21px,
        // one title line, with no theme change. Held at 1200px at both widths, a height no layout
        // of these grids has, so a hold that stops applying changes the shot's height and fails
        // it. What the hold can't stop: a pin whose product count crosses a page (24 on the
        // category and brand pins, 12 on the search pin) gains or loses its pager row, which is
        // only masked. That is a catalogue change, so a re-baseline epoch (build pipeline 6.6).
        hold: {
            category: { '#product-listing-container .productGrid': 1200 },
            'category@more': { '#product-listing-container .productGrid': 1200 },
            'category@noindex': { '#product-listing-container .productGrid': 1200 },
            brand: { '#product-listing-container .productGrid': 1200 },
            product: { '[data-rf-related] .rf-related-grid': 400 },
            'product@sizes': { '[data-rf-related] .rf-related-grid': 400 },
            search: {
                '.page-content > .panel': 360,
                '#product-listing-container .productGrid': 1200,
            },
            // The hub's grid (ticket 34), not in #product-listing-container: the root lists its
            // Species pages' products, which the live catalogue decides, as the category pins'.
            'species-hub': { '[data-rf-hub-products] .productGrid': 1200 },
        },
    },
    1855224: {
        // Read-only, and for the review pages only (W0-10): `stencil start -c 1855224 -v
        // 'ReelFlies US'` renders this repo's templates with live reelflies.com data, and
        // review-live.spec.mjs shoots every page here for a checkpoint's .com section. .com
        // has no baselines, so no gate runs on it. Run it once W0-6 refuses writes on live
        // channels. Nothing here ever writes to .com.
        name: 'reelflies.com (live, read-only)',
        pages: {
            home: '/',
        },
        notPinnedYet: {
            product: 'pin a reelflies.com product page for the review renders, once W0-6 has landed',
            category: 'pin a reelflies.com category page for the review renders, once W0-6 has landed',
        },
    },
};

// The variation a run renders when QA_VARIATION doesn't name one: the channel's own (channel 1's
// is "ReelFlies CA channel 1", ticket 53), or ReelFlies CA. An explicit QA_VARIATION always wins.
export const DEFAULT_VARIATION = 'ReelFlies CA';
export const defaultVariation = channel => CHANNELS[channel]?.variation || DEFAULT_VARIATION;

// The page kinds the raw-HTML check needs on every channel: spec seam 2 fetches one
// product page and one category page. A kind@name pin of the kind counts.
export const RAW_HTML_REQUIRED = ['product', 'category'];

// A page key: a kind, or kind@name (W0-8). The same shapes the baseline-scope check reads in a
// baseline's name (scripts/check-baseline-scope.mjs).
export const PAGE_KEY = /^([a-z0-9][a-z0-9-]*)(?:@([A-Za-z0-9_-]+))?$/;

export function pageKind(key) {
    const match = PAGE_KEY.exec(String(key));
    if (!match) throw new Error(`"${key}" isn't a page key: a kind such as product, or kind@name such as product@sold-out (scripts/qa/pages.mjs)`);
    return match[1];
}

// The status each pinned page must return, by its kind. A gate that got anything else would
// be checking an error page instead of the template, so the run fails.
export const expectedStatus = key => (pageKind(key) === '404' ? 404 : 200);

const STATE_PART = /^[a-z0-9][a-z0-9-]*$/;
const OVERLAY_PART = /^[A-Za-z0-9_-]+$/;

// The name a screenshot baseline is stored under in its set's folder:
// <key>[~<state>][+<overlay>].png, which Playwright ends with -<project>-<platform>
// (snapshotPathTemplate in playwright.config.mjs). A plain pin keeps its old name. The
// baseline-scope check reads these parts back (W0-13), so each must keep its shape.
export function baselineName({ key, state = null, overlay = null }) {
    pageKind(key);
    if (state !== null && !STATE_PART.test(state)) throw new Error(`"${state}" isn't a UI state name (lower-case letters, digits and -; states.mjs)`);
    if (overlay !== null && !OVERLAY_PART.test(overlay)) throw new Error(`"${overlay}" isn't an overlay name (letters, digits, _ and -; overlays.mjs)`);
    return `${key}${state ? `~${state}` : ''}${overlay ? `+${overlay}` : ''}.png`;
}

// Live data the screenshots mask on every page, so they don't fail on price, stock or
// catalogue changes: prices, stock and SKU lines, ratings and review counts, sale and
// sold-out badges, cart counts and totals, page counts, and marketing banners. Product
// cards, grids and carousels stay visible; a page whose list isn't pinned holds it through
// its channel's `hold`. A mask keeps the layout, so it suits
// content whose size holds still while its pixels change. Content that can change a
// page's height is hidden instead (HIDDEN and `hold`).
export const LIVE_DATA = [
    '.banners',
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

// What the screenshots take out of the layout on every page and channel (W0-5): content
// that isn't the theme's and can change a page's height, which a mask can't stop.
// - Page Builder and Widgets API widgets: one applied on 1895766 (a hero, the shipping
//   strip, a home section) would change every page's height at once. Each widget is
//   checked from its own source instead (W0-9).
// - The store's cookie banner, and the 48 px bar it leaves at the end of the page about a
//   second after "Reject all". A shot taken before the bar appeared made the channel-1
//   product page at 375 fail once (375x4101 against a 375x4149 baseline).
export const HIDDEN = [
    '[data-widget-id]',
    '#consent-manager',
    '#consent-manager-update-banner',
];

// What the page shots take out of the layout from the first one, before the page lays itself
// out (hideWidgetsFromLoad in fixtures.mjs), as well as at the screenshot: the widgets. A page
// laid out with a widget in it and then hidden can keep a sub-pixel offset further down; that
// moved eight of 1895766's footer lines by 1px when its home widgets went active (#63, W0-5).
// The cookie banner stays out of this list: dismissCookieBanner clicks it first.
export const HIDDEN_FROM_LOAD = ['[data-widget-id]'];

// The boxes one pinned page holds at a fixed height, as [selector, height] pairs.
const heldBoxes = (channel, template, channels = CHANNELS) => Object.entries(channels[channel]?.hold?.[template] || {});

// Everything the screenshot of one pinned page masks: LIVE_DATA, its channel's masks, and
// the boxes it holds, so a reviewer sees a held box as a mask rather than an empty space.
// `template` is the page key; `channels` is CHANNELS, or a stand-in in the tests.
export function masksFor(channel, template, channels = CHANNELS) {
    return [
        ...LIVE_DATA,
        ...(channels[channel]?.mask?.[template] || []),
        ...heldBoxes(channel, template, channels).map(([selector]) => selector),
    ];
}

// The stylesheet the screenshot of one page applies (toHaveScreenshot's stylePath, written
// by screenshotStylePath in fixtures.mjs): HIDDEN on every page, and the page's held boxes.
// `channels` is CHANNELS, or a stand-in in the tests.
export function screenshotStyle(channel, template, channels = CHANNELS) {
    const held = heldBoxes(channel, template, channels).map(([selector, height]) => [
        // :is() keeps a key that lists several boxes whole: `#a, #b > *` would hide all of #a
        // and only #b's cards.
        `/* held at ${height}px: what is inside never changes the page's size */`,
        `:is(${selector}) { height: ${height}px !important; min-height: ${height}px !important; max-height: ${height}px !important; overflow: hidden !important; }`,
        `:is(${selector}) > * { display: none !important; }`,
    ].join('\n'));
    const css = [
        `/* scripts/qa/pages.mjs: channel ${channel}, ${template} */`,
        '/* out of the layout on every page */',
        `${HIDDEN.join(',\n')} { display: none !important; }`,
        ...held,
    ].join('\n');
    return `${css}\n`;
}

export function pinnedChannel(channel) {
    const entry = CHANNELS[channel];
    if (!entry) throw new Error(`No pages are pinned for channel ${channel} in scripts/qa/pages.mjs`);
    return entry;
}

export const pinnedPages = channel => pinnedChannel(channel).pages;
