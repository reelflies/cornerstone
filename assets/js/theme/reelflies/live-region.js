// The one polite live region that every ReelFlies status message goes through (ticket 25; O24):
// search totals (30), filter counts (33), add confirmations and errors (38, 41, 43, 44).
//
//   import { announce } from './live-region';
//   announce('Added 2 flies to your cart.');
//
// - The region is rendered empty by the server on every page
//   (templates/components/reelflies/body-start.html), so screen readers already watch it when
//   the first message lands. A page without it gets one made here.
// - A message is written a moment after the region is cleared, so the same message sent twice is
//   announced twice: screen readers stay quiet when a region's text doesn't change.
// - A newer message replaces one still waiting, and an empty message just clears the region.
// - Messages are text. Markup in one is shown as text, never parsed.

export const REGION_SELECTOR = '[data-rf-live-region]';
export const ANNOUNCE_DELAY_MS = 100;

let waiting = null;

export function liveRegion(doc = document) {
    let region = doc.querySelector(REGION_SELECTOR);
    if (!region) {
        region = doc.createElement('div');
        region.className = 'is-srOnly';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
        region.setAttribute('data-rf-live-region', '');
        doc.body.appendChild(region);
    }
    return region;
}

export function announce(message, doc = document) {
    const region = liveRegion(doc);
    const text = String(message ?? '').trim();

    clearTimeout(waiting);
    waiting = null;
    region.textContent = '';
    if (!text) return;

    waiting = setTimeout(() => {
        waiting = null;
        region.textContent = text;
    }, ANNOUNCE_DELAY_MS);
}
