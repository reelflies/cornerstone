// The cart's events, in their own module so stock cart.js can send one without loading the cart
// page's ReelFlies module, which is its own chunk (page-modules.js).
//
// - RENDERED_EVENT: cart.js has rendered the cart's content again after a change (its hook at
//   the end of refreshContent). cart-page.js sorts the new rows and puts focus back.
// - FAILED_EVENT: a cart call failed and was told in place (cart-feedback.js). cart-page.js
//   forgets the control it was waiting to refocus, since nothing re-renders.
// - CHANGED_EVENT (build pipeline 6.9): sent on document after an add, just after stock's
//   cart-quantity-update when a count above 0 is known (the Cart API's read, or stock's cart
//   summary), and alone when none is:
//   - by ticket 38's add flow, with { source: 'product', productId };
//   - by ticket 43's quick add, after a single size's add from a card, with { source:
//     'quick-add', productId } (quick-add-panel.js).
//   Ticket 27's rise ring listens for it, and tickets 42 and 44 will.

export const RENDERED_EVENT = 'rf:cart-rendered';
export const FAILED_EVENT = 'rf:cart-failed';
export const CHANGED_EVENT = 'rf:cart-changed';
