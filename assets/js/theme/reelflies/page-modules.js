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

const product = [
    // 37 size pills

    // 38 add flow

    // 42 cart state: the product page half
];

// Fly Type and Species pages, the ReelFlies brand listing and search results all list cards.
const listing = [
    // 31 product card and grid

    () => import(/* webpackChunkName: "rf-category-chips" */ './category-chips'), // 32 chips

    // 33 Fly size filter: hook order, facet order, empty state

    // 42 cart state: the card half

    // 43 quick add
];

const cart = [
    // 41 cart
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
