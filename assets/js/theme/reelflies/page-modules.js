// Which ReelFlies modules load on which page template (ADR 0001). app.js spreads the default
// export into its customClasses, which it keys by context.template ('pages/home' ...) and whose
// importer's default it calls load(context) on. Each loader is a dynamic import, its own chunk,
// never part of main.js. A template with no loader runs exactly as stock.
//
// - pages/home: quick add (+ Add and the size strip on every card) and the home page's ways in,
//   moss lay and month (home.js).
// - pages/product: the size strip, or "Add 1", through the box (product-strip.js), and the
//   related patterns' size lines (listing.js). Should the strip's chunk fail to load, stock's own
//   form takes its place, so the product can still be bought.
// - the listings (category, the noindex category, brand, search): the Fly size filter
//   (size-filter.js), the cards' size lines and the chips (listing.js), and quick add while
//   rf_quick_add is on.

const load = importers => () => Promise.resolve({
    default: {
        load: context => importers.forEach(importer => importer()
            .then(module => module.start(context))
            // eslint-disable-next-line no-console
            .catch(error => console.error('ReelFlies page module failed', error))),
    },
});

const quickAdd = () => import(/* webpackChunkName: "rf-quick-add" */ './quick-add');

const listing = () => Promise.resolve({
    default: {
        load: context => [
            () => import(/* webpackChunkName: "rf-size-filter" */ './size-filter'),
            () => import(/* webpackChunkName: "rf-listing" */ './listing'),
            context.rfQuickAdd ? quickAdd : null,
        ].filter(Boolean).forEach(importer => importer()
            .then(module => module.start(context))
            // eslint-disable-next-line no-console
            .catch(error => console.error('ReelFlies page module failed', error))),
    },
});

// The product page's own form, shown in place of the strip or "Add 1" when their script can't run.
function showStockForm() {
    const form = document.querySelector('[data-rf-pdp-form]');
    const strip = document.querySelector('[data-rf-strip]');
    if (form) form.hidden = false;
    if (strip) strip.hidden = true;
}

const product = () => Promise.resolve({
    default: {
        load: context => {
            import(/* webpackChunkName: "rf-product" */ './product-strip')
                .then(module => module.start(context))
                .catch(error => {
                    showStockForm();
                    // eslint-disable-next-line no-console
                    console.error('ReelFlies page module failed', error);
                });
            import(/* webpackChunkName: "rf-listing" */ './listing')
                .then(module => module.start(context))
                // eslint-disable-next-line no-console
                .catch(error => console.error('ReelFlies page module failed', error));
        },
    },
});

export default {
    'pages/product': product,
    'pages/home': load([
        quickAdd,
        () => import(/* webpackChunkName: "rf-home" */ './home'),
    ]),
    'pages/category': listing,
    'pages/custom/category/rf-noindex': listing,
    'pages/custom/category/species-hub': listing,
    'pages/brand': listing,
    'pages/search': listing,
};
