// Pills in #modal (ticket 37): Quick view and the cart's Change dialog render a product's options
// through stock set-rectangle.html, so through size-pills.html, in the modal, where the product
// page's module isn't loaded. This watches the modal and, the first time pills appear there,
// loads size-pills.js's chunk to watch them as the product page does. It is small, because it
// starts on every page; watchPills leaves a group it already watches alone, and stops by itself
// once its group has left the page.

export const PILLS = '[data-rf-pills]:not([data-rf-pills-watched])';

export default function watchModalPills(doc = document, load = () => import(/* webpackChunkName: "rf-size-pills" */ './size-pills')) {
    const modal = doc.getElementById('modal');
    if (!modal) return;
    new doc.defaultView.MutationObserver(() => {
        if (!modal.querySelector(PILLS)) return;
        load().then(({ watchPills }) => modal.querySelectorAll(PILLS).forEach(watchPills));
    }).observe(modal, { childList: true, subtree: true });
}
