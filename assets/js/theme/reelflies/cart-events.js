// The cart page's two events (ticket 41), in their own module so stock cart.js can send one
// without loading the cart page's ReelFlies module, which is its own chunk (page-modules.js).
//
// - RENDERED_EVENT: cart.js has rendered the cart's content again after a change (its hook at
//   the end of refreshContent). cart-page.js sorts the new rows and puts focus back.
// - FAILED_EVENT: a cart call failed and was told in place (cart-feedback.js). cart-page.js
//   forgets the control it was waiting to refocus, since nothing re-renders.

export const RENDERED_EVENT = 'rf:cart-rendered';
export const FAILED_EVENT = 'rf:cart-failed';
