// Cart state's marks and lines (ticket 42; spec module 17; R4, O13, O15, UX-10, UX-18; stories 33,
// 40, 68 and 70), loaded through page-modules.js as the rf-cart-state chunk on the product page and
// the listings, only with rf_cart_state on (context.rfCartState). The templates render each place
// it fills, empty and with its space kept, so nothing moves when the cart's read comes back:
//
// - The size pills on the product page (size-pills.html): a corner check on each size in the cart
//   (its data-rf-cart-dot shown), "(3 in cart)" in the size's name (its data-rf-cart-tag, after
//   "(sold out)"), and the "In your cart" line under the sold-out line (data-rf-cart-line, which
//   names the product): "In your cart: 3 × size 14 and 3 × size 16.", the sizes in the pills'
//   order, each size's count adding up every Colour. Never a number on a pill: one can read as
//   stock left (UX-10). The words ride on the line's data attributes (# for a count, % for a size).
// - Each card (card-cart-state.html): "6 in cart", the pattern's total across its sizes, as a link
//   to its product page (data-rf-cart-card names the product; data-rf-words holds the words).
//   Ticket 44 makes it open quick add.
//
// When it reads the cart (cart-state.js's readCart, the reader ticket 44 shares):
// - once as the page loads, if the page has anything to mark, for all of it together;
// - after each change to the cart that build pipeline 6.9's rf:cart-changed reports (tickets 38,
//   43 and 44), and after a change during a read, once more when that read is done;
// - when the page comes back from the back-forward cache, whose marks may be from before a change.
// A failed read shows nothing: every mark and line is cleared rather than left stale. Cards that a
// facet change brings (#product-listing-container's children, which stock replaces) get the last
// read's lines with no other read.
//
// It marks with data attributes, `hidden` and text only, never a class, so ticket 37's size-pills.js,
// which watches the labels' class for stock's sold-out marks, never sees it, and the corner check,
// the chosen check and the sold-out strike can all show together. It announces nothing: the add's
// own confirmation (ticket 38) says what changed.

import { CHANGED_EVENT } from './cart-events';
import { readCart, sizeCounts } from './cart-state';

export const LINE = '[data-rf-cart-line]';
export const CARD = '[data-rf-cart-card]';
export const LISTING = '#product-listing-container';
const PILL = '[data-product-attribute-value]';
const MARKED = 'data-rf-in-cart';

const fill = (words, count, size = '') => String(words || '').replace('#', () => count).replace('%', () => size);
// Each writes only a change, so an unchanged read mutates nothing.
const setText = (element, text) => {
    if (element && element.textContent !== text) Object.assign(element, { textContent: text });
};
const setHidden = (element, hidden) => {
    if (element && element.hidden !== hidden) element.toggleAttribute('hidden', hidden);
};

// "In your cart: 3 × size 14 and 3 × size 16.": `sizes` is [{ count, size }], in the pills' order;
// `line` holds a # where the list goes, `size` a # for the count and a % for the size. (Objects,
// not [count, size] pairs: the theme's loose Babel turns array destructuring into a 1 KB helper.)
export function inCartLine(sizes, { line = '', size = '', and = 'and' } = {}) {
    if (!sizes.length) return '';
    const parts = sizes.map(entry => fill(size, entry.count, entry.size));
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} ${and} ${parts[parts.length - 1]}`;
    return String(line).replace('#', () => list);
}

// One size group's marks and its line, from the product's entry in the read (none: nothing marked).
function markPills(line, product) {
    const field = line.closest('[data-rf-pills]') || line.parentNode;
    const counts = sizeCounts(product);
    const named = [];
    // Array.from, never [...nodeList]: the theme's Babel is loose (babel.config.js).
    Array.from(field.querySelectorAll(PILL)).forEach(label => {
        const count = counts.get(Number(label.getAttribute('data-product-attribute-value'))) || 0;
        if (count && label.getAttribute(MARKED) !== String(count)) label.setAttribute(MARKED, String(count));
        if (!count && label.hasAttribute(MARKED)) label.removeAttribute(MARKED);
        const tag = label.querySelector('[data-rf-cart-tag]');
        setText(tag, count ? ` ${fill(line.getAttribute('data-rf-pill'), count)}` : '');
        setHidden(tag, !count);
        setHidden(label.querySelector('[data-rf-cart-dot]'), !count);
        if (count) named.push({ count, size: (label.querySelector('.form-option-variant') || label).textContent.trim() });
    });
    setText(line, inCartLine(named, {
        line: line.getAttribute('data-rf-line'), size: line.getAttribute('data-rf-size'), and: line.getAttribute('data-rf-and') || 'and',
    }));
}

// One card's line: the pattern's total across its sizes, or nothing.
function markCard(slot, product) {
    const total = product ? product.total : 0;
    setText(slot.querySelector('[data-rf-cart-count]'), total ? fill(slot.getAttribute('data-rf-words'), total) : '');
    setHidden(slot.querySelector('a'), !total);
}

// Every mark and line under `root`, from the read's products (null: the read failed or hasn't come).
export function applyCartMarks(root, products) {
    const productOf = element => (products ? products.get(Number(element.getAttribute(element.matches(LINE) ? 'data-rf-cart-line' : 'data-rf-cart-card'))) : null);
    Array.from(root.querySelectorAll(LINE)).forEach(line => markPills(line, productOf(line)));
    Array.from(root.querySelectorAll(CARD)).forEach(slot => markCard(slot, productOf(slot)));
}

// Starts the marks on `doc`. Returns { ready, idle(), refresh(), stop() }: `ready` settles once the
// first read is applied (at once on a page with nothing to mark), idle() once no read is under way.
// doFetch is for tests (cart-state.js's readCart).
export function startCartMarks(doc = document, { doFetch = null } = {}) {
    const view = doc.defaultView;
    let products = null;
    let reading = null;
    let again = false;
    let everRead = false;
    let stopped = false;
    const hasMarks = root => Boolean(root.querySelector(`${LINE}, ${CARD}`));

    const read = () => {
        if (stopped) return Promise.resolve();
        if (reading) {
            again = true;
            return reading;
        }
        everRead = true;
        reading = readCart(doFetch).then(cart => {
            reading = null;
            if (stopped) return undefined;
            products = cart ? cart.products : null;
            applyCartMarks(doc, products);
            if (!again) return undefined;
            again = false;
            return read();
        });
        return reading;
    };
    const refresh = () => (hasMarks(doc) ? read() : Promise.resolve());
    const onChanged = () => {
        refresh();
    };
    const onShow = event => {
        if (event.persisted) refresh();
    };

    let observer = null;
    const listing = doc.querySelector(LISTING);
    if (listing && view && view.MutationObserver) {
        observer = new view.MutationObserver(records => {
            const added = records.some(record => Array.from(record.addedNodes)
                .some(node => node.nodeType === 1 && (node.matches(CARD) || hasMarks(node))));
            if (!added) return;
            if (!everRead) read();
            else if (!reading) applyCartMarks(listing, products);
        });
        observer.observe(listing, { childList: true });
    }
    doc.addEventListener(CHANGED_EVENT, onChanged);
    if (view) view.addEventListener('pageshow', onShow);

    return {
        ready: refresh(),
        idle: () => reading || Promise.resolve(),
        refresh,
        stop() {
            stopped = true;
            doc.removeEventListener(CHANGED_EVENT, onChanged);
            if (view) view.removeEventListener('pageshow', onShow);
            if (observer) observer.disconnect();
        },
    };
}

export default {
    load() {
        return startCartMarks(document);
    },
};
