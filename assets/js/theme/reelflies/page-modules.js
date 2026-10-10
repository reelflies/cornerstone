// Which ReelFlies modules load on which page template (build pipeline, section 6.1; ADR 0001).
//
// app.js spreads the default export into its customClasses, which it keys by context.template
// ('pages/product', 'pages/category' ...) and calls one importer per key. Several modules need
// the same template, so each template gets one composite importer: it loads the template's
// modules and returns one `default` whose load(context) starts each of them in order.
//
// How a ticket adds its module: replace its own slot line below with one loader, a function that
// returns a dynamic import, so the module is its own chunk and never part of main.js:
//
//     () => import(/* webpackChunkName: "rf-size-pills" */ './size-pills'),
//
// - The module's default export has load(context), as the stock page classes do.
// - Change only your own slot line. The blank lines between slots keep parallel tickets' edits
//   apart, so git never sees two of them touch the same lines.
// - A template with no loader registers nothing, so its page runs exactly as stock.
// - One module failing to load or to start is reported in the console; the others still start.
// - Custom templates load their base kind's modules, because context.template names the custom
//   file. A new custom template adds its line to TEMPLATES.

// 42 cart state (ticket 42): its chunk on the product page and the listings while rf_cart_state is
// on (context.rfCartState, js-settings.html), never with it off, so the page then makes no read of
// the Cart API. It is imported once load(context) has the switch.
const cartState = () => ({
    default: {
        load: context => (context.rfCartState
            ? import(/* webpackChunkName: "rf-cart-state" */ './cart-marks')
                .then(module => module.default.load(context))
                .catch(reportError) // eslint-disable-line no-use-before-define
            : null),
    },
});

const product = [
    () => import(/* webpackChunkName: "rf-size-pills" */ './size-pills'), // 37 size pills

    () => import(/* webpackChunkName: "rf-add-flow" */ './add-flow') // 38 add flow
        // A chunk that fails to load: stock's "Add to Cart" on the flow's buttons.
        .catch(error => import(/* webpackChunkName: "rf-add-flow-failed" */ './add-flow-failed')
            .then(failed => failed.default(error), () => { throw error; })),

    // 42 cart state: the product page half (the size pills' marks and the "In your cart" line,
    // and the related cards' lines): cartState, above
    cartState,
];

// Fly Type and Species pages, the ReelFlies brand listing and search results all list cards.
const listing = [
    // 31 product card and grid

    () => import(/* webpackChunkName: "rf-category-chips" */ './category-chips'), // 32 chips

    () => import(/* webpackChunkName: "rf-size-filter" */ './size-filter'), // 33 Fly size filter

    // 42 cart state: the card half, the same loader and chunk as the product page's
    cartState,

    // 43 quick add: its chunk on every listing while rf_quick_add is on (context.rfQuickAdd),
    // even with no "+ Add" in the first render, for the cards a facet change or the pager
    // brings; never with it off. It is imported once load(context) has the switch.
    () => ({
        default: {
            load: context => (context.rfQuickAdd
                ? import(/* webpackChunkName: "rf-quick-add" */ './quick-add')
                    .then(module => module.default.load(context))
                    .catch(reportError) // eslint-disable-line no-use-before-define
                : null),
        },
    }),
];

const cart = [
    () => import(/* webpackChunkName: "rf-cart" */ './cart-page'), // 41 cart
];

const page = [
    // 35 hook size chart
];

export const TEMPLATES = {
    'pages/product': product,
    'pages/category': listing,
    'pages/custom/category/rf-noindex': listing, // 32
    'pages/custom/category/species-hub': listing, // 34
    'pages/brand': listing,
    'pages/search': listing,
    'pages/cart': cart,
    'pages/page': page,
    'pages/custom/page/hook-size-chart': page, // 35
};

function reportError(error) {
    // eslint-disable-next-line no-console
    console.error('ReelFlies page module failed', error);
}

// One importer for a template's loaders, in the shape app.js expects of a customClasses entry.
export function composite(loaders, onError = reportError) {
    const loadOne = load => Promise.resolve()
        .then(load)
        .catch(error => {
            onError(error);
            return null;
        });

    return () => Promise.all(loaders.map(loadOne)).then(modules => ({
        default: {
            load(context) {
                modules.filter(Boolean).forEach(module => {
                    try {
                        module.default.load(context);
                    } catch (error) {
                        onError(error);
                    }
                });
            },
        },
    }));
}

export function customClassesFor(templates, onError = reportError) {
    return Object.keys(templates)
        .filter(template => templates[template].length)
        .reduce((classes, template) => ({ ...classes, [template]: composite(templates[template], onError) }), {});
}

export default customClassesFor(TEMPLATES);
