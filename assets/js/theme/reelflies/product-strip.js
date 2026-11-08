// The product page's buying (the owner's choice, 2026-11-07: a tap adds one), loaded on the
// product page through page-modules.js: start(context).
//
// - The strip (components/reelflies/product-strip.html): the server drew a cell per choice of the
//   product's one option, with its variant and stock. This puts the cells in hook order when they
//   are hook sizes (a catalogue may list one out of order), draws each cell as strip-html.js does,
//   with its step bar, and keeps every cell in step with the box: its count, its "−1". A tap on a
//   cell adds one of that choice to the box (box.js, the Cart API), shown at once; "−1" takes one
//   back.
// - One (components/reelflies/product-one.html): a product with no options. "Add 1 to your box"
//   adds one; "−1" beside it, once one is in, takes one back.
// - Both: the reserved line says what of this product is in the box ("In your box: 3 × 12,
//   3 × 14", or "In your box: 2"); each add and removal is said in the polite live region with the
//   box's new count, and a refusal with the store's words; a fly drops from the photograph into
//   the order line and the header count bumps.
// - No choice is ever made for the shopper: a cell adds only its own variant.

import * as box from './box';
import { boxWords as wordsFor } from './box-words';
import { flyBrandList } from './cart-count';
import { bump, fly } from './flight';
import { hookRank, sortByHookOrder } from './hook-order';
import { announce } from './live-region';
import { cellInner, footWords } from './strip-html';
import { word } from './words';

let flyBrands = [];

export function readProduct(root) {
    const data = root.dataset;
    const cells = Array.from(root.querySelectorAll('[data-rf-cell]'));
    return {
        id: data.rfProduct,
        name: data.rfName,
        url: data.rfUrl,
        price: Number(data.rfPrice) || 0,
        brand: data.rfBrand || '',
        img: data.rfImg || '',
        mode: data.rfMode,
        one: data.rfMode === 'one' ? { variantId: Number(data.rfVariant), inStock: data.rfStock === '1' } : null,
        sizes: cells.map(cell => ({
            label: cell.dataset.rfLabel, variantId: Number(cell.dataset.rfVariant), inStock: cell.dataset.rfStock === '1', cell,
        })),
    };
}

// The cells in hook order, moved only when the catalogue's order isn't.
export function orderCells(root, product) {
    const list = root.querySelector('[data-rf-cells]');
    const sorted = sortByHookOrder(product.sizes, size => size.label);
    if (list && sorted.some((size, index) => size !== product.sizes[index])) sorted.forEach(size => list.appendChild(size.cell));
    return { ...product, sizes: sorted };
}

const countsFor = product => new Map(box.lines()
    .filter(line => line.productId === String(product.id))
    .map(line => [Number(line.variantId), line.quantity]));

export function inBoxWords(product, counts) {
    if (product.one) {
        const n = counts.get(product.one.variantId) || [...counts.values()].reduce((a, b) => a + b, 0);
        return n ? word('in_box_n', { n }) : '';
    }
    const list = product.sizes
        .filter(size => counts.get(size.variantId))
        .map(size => `${counts.get(size.variantId)} × ${size.label}`);
    return list.length ? word('in_box_full', { list: list.join(', ') }) : '';
}

export function sync(root, product) {
    const counts = countsFor(product);
    const doc = root.ownerDocument;
    const active = doc.activeElement && root.contains(doc.activeElement) ? doc.activeElement : null;
    const focusVariant = active && active.dataset.rfVariant;
    const wasMinus = active && active.hasAttribute('data-rf-minus');
    product.sizes.forEach(size => {
        const n = counts.get(size.variantId) || 0;
        const { cell } = size;
        if (cell.dataset.rfN === String(n)) return;
        cell.dataset.rfN = String(n);
        cell.innerHTML = cellInner(size, n);
    });
    if (focusVariant && !root.contains(doc.activeElement)) {
        const target = (wasMinus && root.querySelector(`[data-rf-minus][data-rf-variant="${focusVariant}"]`))
            || root.querySelector(`[data-rf-size][data-rf-variant="${focusVariant}"]`);
        if (target) target.focus();
    }
    if (product.one) {
        const minus = root.querySelector('[data-rf-one-minus]');
        const n = counts.get(product.one.variantId) || 0;
        if (minus) {
            if (!n && doc.activeElement === minus) root.querySelector('[data-rf-one]')?.focus();
            minus.disabled = !n;
            minus.setAttribute('aria-hidden', String(!n));
        }
    }
    const line = root.querySelector('[data-rf-strip-inbox]');
    if (line) line.textContent = inBoxWords(product, counts);
}

function what(product, size) {
    if (!size) return product.name;
    return word(hookRank(size.label) === null ? 'what_choice' : 'what_size', { size: size.label, choice: size.label, name: product.name });
}

function change(product, size, delta) {
    const variantId = size ? size.variantId : product.one.variantId;
    const meta = {
        name: product.name, size: size ? size.label : '', imageUrl: product.img, price: product.price, brand: product.brand, url: product.url,
    };
    const done = box.change({
        productId: product.id, variantId, delta, meta,
    });
    if (delta > 0) {
        bump();
        fly(document.querySelector('[data-main-image]'), product.id);
    }
    done.then(() => {
        let key = 'added';
        if (delta < 0) key = box.lines().length ? 'removed' : 'removed_empty';
        announce(word(key, { what: what(product, size), count: wordsFor(flyBrands) }));
    }, error => {
        announce(`${word(delta > 0 ? 'add_failed' : 'change_failed', { what: what(product, size) })} ${error.storeWords ? error.message : word('try_again')}`);
    });
    return done;
}

export function start(context = {}, doc = document) {
    const root = doc.querySelector('[data-rf-strip]');
    if (!root) return;
    flyBrands = flyBrandList(context.rfFlyBrands);
    let product = readProduct(root);
    if (product.mode === 'strip') {
        product = orderCells(root, product);
        const foot = root.querySelector('[data-rf-strip-foot]');
        if (foot) foot.textContent = footWords(product.sizes);
    }
    root.addEventListener('click', event => {
        const sizeButton = event.target.closest('[data-rf-size]');
        const minus = event.target.closest('[data-rf-minus]');
        if (sizeButton || minus) {
            const variantId = Number((sizeButton || minus).dataset.rfVariant);
            const size = product.sizes.find(item => item.variantId === variantId);
            if (size && size.inStock) change(product, size, sizeButton ? 1 : -1).catch(() => {});
            return;
        }
        if (event.target.closest('[data-rf-one]') && product.one && product.one.inStock) change(product, null, 1).catch(() => {});
        if (event.target.closest('[data-rf-one-minus]') && product.one) change(product, null, -1).catch(() => {});
    });
    box.subscribe(() => sync(root, product));
    sync(root, product);
    root.setAttribute('data-rf-ready', '');
}
