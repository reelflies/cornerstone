// Which ReelFlies overlays are open, as one attribute on <html> (build pipeline, section 6.9):
//
//   <html data-rf-open="drawer search quick-add">
//
// Each module adds and removes only its own token: the phone drawer (28) writes `drawer`, quick
// search (30) `search`, the quick-add panel (43) `quick-add`. The outside-Canada prompt (52)
// stays hidden while any overlay is open. With nothing open the attribute is removed, so CSS can
// read `[data-rf-open]` as "something is open".
//
//   import { markOpen, markClosed, isOpen } from './open-state';
//   markOpen('drawer');      // the drawer opened
//   markClosed('drawer');    // and closed
//   isOpen();                // is anything open?

export const ATTRIBUTE = 'data-rf-open';
const TOKEN = /^[a-z0-9][a-z0-9-]*$/;

function checkToken(token) {
    if (!TOKEN.test(String(token))) {
        throw new TypeError(`open-state: "${token}" isn't a token (one word of lower-case letters, digits and -)`);
    }
}

export function openOverlays(root = document.documentElement) {
    return (root.getAttribute(ATTRIBUTE) || '').split(/\s+/).filter(Boolean);
}

function write(tokens, root) {
    if (tokens.length) {
        root.setAttribute(ATTRIBUTE, tokens.join(' '));
    } else {
        root.removeAttribute(ATTRIBUTE);
    }
}

export function markOpen(token, root = document.documentElement) {
    checkToken(token);
    const tokens = openOverlays(root);
    write(tokens.includes(token) ? tokens : [...tokens, token], root);
}

export function markClosed(token, root = document.documentElement) {
    checkToken(token);
    write(openOverlays(root).filter(open => open !== token), root);
}

// With a token: is that overlay open? Without one: is any?
export function isOpen(token, root = document.documentElement) {
    const tokens = openOverlays(root);
    return token === undefined ? tokens.length > 0 : tokens.includes(token);
}
