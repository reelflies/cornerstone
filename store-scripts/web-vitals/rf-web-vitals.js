// ReelFlies field data (ticket 23): Core Web Vitals from real visitors, sent to GA4 as events.
//
// It runs from Script Manager on ReelFlies_CA (1895766), not from the theme, so it needs no
// theme push. scripts/store-scripts/build.mjs wraps it, with the vendored web-vitals library, in
// the one inline <script> the Scripts API takes: store-scripts/1895766/web-vitals.json, created
// disabled. Whole-line comments are dropped from the build, so they cost visitors nothing.
//
// - One GA4 event per report, named LCP, INP or CLS, with the parameters the web-vitals README
//   gives for GA4: value is the delta, so one page view's reports sum to its final value;
//   metric_id groups them. metric_rating and metric_navigation_type are added, so reports can
//   split good from poor and leave out back/forward cache restores.
// - It sends through the store's own GA4 tag (G-BQ4RFFK3KW) and carries no measurement id. A
//   global window.gtag is used when there is one. BigCommerce's GA4 snippet keeps its gtag
//   inside its own function and leaves only window.dataLayer (read from reelflies.ca,
//   2026-10-07); today's global gtag comes from the legacy UA snippet, which ticket 08 removes.
//   So without one, the command goes onto window.dataLayer exactly as gtag() puts it there: as
//   an arguments object, the only kind gtag.js reads. Both are looked up at report time.
// - The library reports LCP once the visitor first clicks or types, or the page is hidden, and
//   INP and CLS when the page is hidden, again after a back/forward cache restore.
// - Field data is best effort: a failure here never reaches the page.
// eslint-disable-next-line no-unused-vars -- build.mjs calls it, after the library
function rfWebVitals(webVitals, win) {
    function viaDataLayer() {
        // eslint-disable-next-line prefer-rest-params -- gtag.js reads arguments objects only
        win.dataLayer.push(arguments);
    }
    function send(metric) {
        try {
            const params = {
                value: metric.delta,
                metric_id: metric.id,
                metric_value: metric.value,
                metric_delta: metric.delta,
                metric_rating: metric.rating,
                metric_navigation_type: metric.navigationType,
            };
            if (typeof win.gtag === 'function') win.gtag('event', metric.name, params);
            else if (Array.isArray(win.dataLayer)) viaDataLayer('event', metric.name, params);
        } catch (error) {
            // Nothing to do: the page carries on.
        }
    }
    webVitals.onLCP(send);
    webVitals.onINP(send);
    webVitals.onCLS(send);
}
