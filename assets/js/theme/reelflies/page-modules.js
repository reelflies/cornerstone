// Which ReelFlies modules load on which page template (ADR 0001). app.js spreads the default
// export into its customClasses, which it keys by context.template ('pages/home' ...) and whose
// importer's default it calls load(context) on. Each loader is a dynamic import, its own chunk,
// never part of main.js. A template with no loader runs exactly as stock.
//
// - pages/home: quick add (+ Add and the size strip on every card) and the home page's ways in,
//   moss lay and month (home.js).

const load = importers => () => Promise.resolve({
    default: {
        load: context => importers.forEach(importer => importer()
            .then(module => module.start(context))
            // eslint-disable-next-line no-console
            .catch(error => console.error('ReelFlies page module failed', error))),
    },
});

export default {
    'pages/home': load([
        () => import(/* webpackChunkName: "rf-quick-add" */ './quick-add'),
        () => import(/* webpackChunkName: "rf-home" */ './home'),
    ]),
};
