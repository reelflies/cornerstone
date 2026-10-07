// Reduced motion for jQuery's animations (ticket 25; story 69). The CSS reset in
// assets/scss/reelflies/_foundation.scss stops transitions and animations, but jQuery animates in
// JavaScript: the listings' scroll to the top after a page of results (category.js, brand.js,
// search.js) and the cart's slideToggle among them. With prefers-reduced-motion: reduce, $.fx.off
// makes each one jump straight to its end, and the setting is followed if it changes while the
// page is open. reelflies/global.js starts it on every page.

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export default function followReducedMotion(win, jquery) {
    if (typeof win.matchMedia !== 'function') return;
    const query = win.matchMedia(REDUCED_MOTION_QUERY);
    const apply = matches => { jquery.fx.off = Boolean(matches); }; // eslint-disable-line no-param-reassign
    apply(query.matches);
    if (typeof query.addEventListener === 'function') query.addEventListener('change', event => apply(event.matches));
}
