// Which ReelFlies modules load on which page template (ADR 0001). app.js spreads the default
// export into its customClasses, which it keys by context.template ('pages/home' ...) and whose
// importer's default it calls load(context) on. Each loader is a dynamic import, its own chunk,
// never part of main.js. A template with no loader runs exactly as stock.
//
// - pages/home: quick add (+ Add and the size strip on every card) and the home page's ways in,
//   moss lay and month (home.js).
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

export default {
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
