// Loads Quick view on the first Quick view click instead of with main.js (ticket 16).
//
// Stock Cornerstone imports global/quick-view in global.js, which pulls Quick view,
// ProductDetails and reviews into main.js on every page. This waits for the first
// click on a `.quickview` button, loads that code as its own chunk
// (theme-bundle.chunk.quick-view.js), starts it with the page context and then
// replays the click, so the product the shopper picked opens. From then on stock
// Quick view handles every click itself.
//
// - Clicks that land while the chunk loads open Quick view once, for the last
//   product clicked.
// - If the chunk fails to load, nothing opens and the next click tries again.

const loadQuickView = () => import(/* webpackChunkName: "quick-view" */ '../global/quick-view');
const CLICK = 'click.rfLazyQuickView';

export default function lazyQuickView(context, load = loadQuickView) {
    const $body = $('body');
    let loading = null;
    let lastClicked = null;

    function start(quickView) {
        $body.off(CLICK);
        quickView.default(context);

        const target = lastClicked;
        lastClicked = null;
        if (target && $.contains(document.documentElement, target)) $(target).trigger('click');
    }

    $body.on(CLICK, '.quickview', event => {
        event.preventDefault();
        lastClicked = event.currentTarget;
        if (loading) return;

        loading = load()
            .then(start)
            .catch(() => {
                loading = null; // the next click tries again
            });
    });
}
