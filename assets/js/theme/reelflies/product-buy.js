// The product page's buying (the owner's choice, 2026-11-07: each size with a quantity beside it),
// loaded on the product page through page-modules.js: start(context).
//
// The server drew the picker (components/reelflies/product-picker.html): a row per choice of the
// product's one option, with its variant and stock, or one row, "How many", for a product with no
// options. This redraws the rows with size-picker.js's markup, in hook order where they are hook
// sizes and with their step bars, then hands the quantities to quantity.js: each one shows what
// the box holds of its choice, and changing it changes the box at once (the Cart API, box.js).
// Under the rows the reserved line says what of this product is in the box ("In your box: 3 × 12,
// 1 × 14", or "In your box: 2"). No choice is ever made for the shopper.

import * as box from './box';
import { flyBrandList } from './cart-count';
import { bindQuantities, followBox, syncQuantities } from './quantity';
import { footWords, rowsHtml } from './size-picker';
import { word } from './words';

export function readProduct(root) {
    const data = root.dataset;
    const one = data.rfMode === 'one';
    return {
        id: data.rfProduct,
        one: one ? { variantId: Number(data.rfVariant), inStock: data.rfStock === '1' } : null,
        sizes: one ? [] : Array.from(root.querySelectorAll('[data-rf-row]')).map(row => ({
            label: row.dataset.rfLabel, variantId: Number(row.dataset.rfVariant), inStock: row.dataset.rfStock === '1',
        })),
    };
}

export function inBoxWords(product, lines) {
    const mine = lines.filter(line => line.productId === String(product.id));
    if (product.one) {
        const n = mine.reduce((sum, line) => sum + line.quantity, 0);
        return n ? word('in_box_n', { n }) : '';
    }
    const counts = new Map(mine.map(line => [Number(line.variantId), line.quantity]));
    const list = product.sizes
        .filter(size => counts.get(size.variantId))
        .map(size => `${counts.get(size.variantId)} × ${size.label}`);
    return list.length ? word('in_box_full', { list: list.join(', ') }) : '';
}

export function start(context = {}, doc = document) {
    const root = doc.querySelector('[data-rf-pick-page]');
    if (!root) return;
    const product = readProduct(root);
    const list = root.querySelector('[data-rf-rows]');
    if (list) list.innerHTML = rowsHtml(product);
    if (!product.one) {
        // the rows now run in hook order; the line reads them in that order too
        product.sizes = Array.from(root.querySelectorAll('[data-rf-row]')).map(row => product.sizes.find(size => size.label === row.dataset.rfLabel)).filter(Boolean);
        const foot = root.querySelector('[data-rf-pick-foot]');
        if (foot) foot.textContent = footWords(product.sizes);
    }
    bindQuantities(root, { flyBrands: flyBrandList(context.rfFlyBrands) });
    followBox(doc);
    syncQuantities(root);
    const line = root.querySelector('[data-rf-pick-inbox]');
    const sync = () => {
        if (line) line.textContent = inBoxWords(product, box.lines());
    };
    box.subscribe(sync);
    sync();
    root.setAttribute('data-rf-ready', '');
}
