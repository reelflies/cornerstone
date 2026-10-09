// Pills in #modal (ticket 37): Quick view and the cart's Change dialog render a product's options
// through stock set-rectangle.html, so through size-pills.html, in the modal, where the product
// page's module isn't loaded. This watches the modal and, the first time pills appear there,
// loads size-pills.js's chunk to watch them as the product page does. It is small, because it
// starts on every page. It keeps each group's stop, and stops a group once it has left the page,
// at the modal's next change: on the cart page stock's option event, which would stop it too,
// never fires. A chunk that fails to load is reported (`onError`, by default a console error as
// global.js reports a module), and the next pills to appear try again.

export const PILLS = '[data-rf-pills]:not([data-rf-pills-watched])';

export default function watchModalPills(doc = document, {
    load = () => import(/* webpackChunkName: "rf-size-pills" */ './size-pills'),
    onError = error => console.error('ReelFlies size pills in #modal failed', error), // eslint-disable-line no-console
} = {}) {
    const modal = doc.getElementById('modal');
    if (!modal) return;
    const stops = new Map();
    new doc.defaultView.MutationObserver(() => {
        stops.forEach((stop, field) => {
            if (field.isConnected) return;
            stop();
            stops.delete(field);
        });
        if (!modal.querySelector(PILLS)) return;
        load().then(({ watchPills }) => modal.querySelectorAll(PILLS).forEach(field => stops.set(field, watchPills(field)))).catch(onError);
    }).observe(modal, { childList: true, subtree: true });
}
