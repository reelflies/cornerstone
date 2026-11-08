// Quantity fields that show, and set, how many of one variant the box holds (DESIGN.md "Size
// picker", "Quick order"; the owner's goal, 2026-11-07: buying many sizes of many patterns fast).
// The size pickers (size-picker.js: the product page, a card's "+ Add") and the listings' quick
// order (order-list.js) use them, so a number beside a size always means the same thing: that many
// are in the box.
//
//   <… data-rf-meta data-rf-name="Adams" data-rf-url="/adams/" data-rf-price="0.95" data-rf-brand="ReelFlies" data-rf-img="…">
//     <span data-rf-qty-group>
//       <button data-rf-qty-step="-1">  <input data-rf-qty data-rf-product="4877" data-rf-variant="26677" data-rf-label="12" data-rf-what="size 12">  <button data-rf-qty-step="1">
//
// - Typing sets the quantity: once the shopper pauses, on Enter, or on leaving the field. − and +
//   (and ArrowUp / ArrowDown in the field) step it by one. 0 to 999; 0 takes the size out.
// - The box changes at once (box.setQuantity), shown before the store answers and sent one call
//   at a time. Each change is said in the polite live region; a refusal is said with the store's
//   words, shown at the foot of its picker or quick-order row (aria-hidden: the live region has
//   said it) until the next change there goes through, and the field goes back to what the box
//   holds.
// - Every field follows the box, except one the shopper is typing in. A field holding flies marks
//   its group (has-qty), and "−" is off at 0.
// - Nothing is ever added that the shopper didn't ask for: every field starts at what the box
//   already holds.

import * as box from './box';
import { boxWords } from './box-words';
import { bump, fly } from './flight';
import { announce } from './live-region';
import { word } from './words';

export const MAX = 999; // a trade order can run past 99 of a size
const PAUSE_MS = 700;

const typing = new WeakMap(); // field -> pause timer, while the shopper types
const settings = { flyBrands: [] };
const bound = new WeakSet();

const clamp = n => Math.max(0, Math.min(MAX, Math.round(Number(n) || 0)));

function metaOf(field) {
    const holder = field.closest('[data-rf-meta]');
    const data = holder ? holder.dataset : {};
    return {
        name: data.rfName || '',
        url: data.rfUrl || '',
        price: Number(data.rfPrice) || 0,
        brand: data.rfBrand || '',
        imageUrl: data.rfImg || '',
        size: field.dataset.rfLabel || '',
    };
}

const productIdOf = field => field.dataset.rfProduct;
const variantIdOf = field => Number(field.dataset.rfVariant) || null;

// What the field shows: the box's quantity of its variant. A field marked data-rf-blank (the
// quick order's) shows none as empty, so the sizes in the box stand out.
function show(field, n) {
    const value = n === 0 && field.hasAttribute('data-rf-blank') ? '' : String(n);
    if (field.value !== value) field.setAttribute('value', value);
    const input = field;
    if (input.value !== value) input.value = value;
    const group = field.closest('[data-rf-qty-group]');
    if (!group) return;
    group.classList.toggle('has-qty', n > 0);
    const minus = group.querySelector('[data-rf-qty-step="-1"]');
    if (minus) minus.disabled = n <= 0;
}

export function syncQuantities(root = document) {
    root.querySelectorAll('[data-rf-qty]').forEach(field => {
        if (typing.has(field)) return;
        show(field, box.quantityOf(productIdOf(field), variantIdOf(field)));
    });
}

// The refusal's words at the foot of the field's picker or quick-order row, or none.
function note(field, text) {
    const scope = field.closest('[data-rf-meta]');
    if (!scope) return;
    let el = Array.from(scope.children).find(child => child.hasAttribute('data-rf-qty-note'));
    if (!text) {
        if (el) el.remove();
        return;
    }
    if (!el) {
        el = document.createElement('p');
        el.className = 'rf-qty-note';
        el.setAttribute('data-rf-qty-note', '');
        el.setAttribute('aria-hidden', 'true');
        scope.appendChild(el);
    }
    el.textContent = text;
}

function say(field, n, before, error) {
    const meta = metaOf(field);
    const what = [meta.name, field.dataset.rfWhat].filter(Boolean).join(', ');
    if (error) {
        const text = `${word('change_failed', { what })} ${error.storeWords ? error.message : word('try_again')}`;
        announce(text);
        note(field, text);
        return;
    }
    note(field, '');
    if (n === before) return;
    if (n > 0) announce(word('qty_set', { what, n, count: boxWords(settings.flyBrands) }));
    else announce(word(box.lines().length ? 'qty_out' : 'qty_out_empty', { what, count: boxWords(settings.flyBrands) }));
}

// The fly's drop into the order line starts from the photograph beside the field: its card's, its
// quick-order row's, or the product page's.
function dropFrom(field) {
    const productId = productIdOf(field);
    const card = field.closest('.rf-fly');
    if (card) {
        fly(card, productId);
        return;
    }
    const row = field.closest('[data-rf-meta]');
    const image = (row && row.querySelector('img')) || document.querySelector('[data-main-image]');
    if (image) fly(image, productId);
}

export function setQuantity(field, value) {
    const timer = typing.get(field);
    if (timer) clearTimeout(timer);
    typing.delete(field);
    const productId = productIdOf(field);
    const variantId = variantIdOf(field);
    const before = box.quantityOf(productId, variantId);
    const n = clamp(value);
    show(field, n);
    if (n === before) return Promise.resolve();
    if (n > before) {
        bump();
        dropFrom(field);
    }
    return box.setQuantity({
        productId, variantId, quantity: n, meta: metaOf(field),
    }).then(() => say(field, n, before), error => {
        say(field, n, before, error);
        show(field, box.quantityOf(productId, variantId));
    });
}

function step(field, by) {
    const current = typing.has(field) ? clamp(field.value) : box.quantityOf(productIdOf(field), variantIdOf(field));
    return setQuantity(field, current + by);
}

function onClick(event) {
    const button = event.target.closest('[data-rf-qty-step]');
    if (!button || button.disabled) return;
    const group = button.closest('[data-rf-qty-group]');
    const field = group && group.querySelector('[data-rf-qty]');
    if (field) step(field, Number(button.dataset.rfQtyStep)).catch(() => {});
}

function onInput(event) {
    const field = event.target.closest && event.target.closest('[data-rf-qty]');
    if (!field) return;
    const digits = field.value.replace(/\D/g, '').slice(0, 3);
    if (digits !== field.value) field.value = digits;
    const timer = typing.get(field);
    if (timer) clearTimeout(timer);
    typing.set(field, setTimeout(() => {
        if (field.value !== '') setQuantity(field, field.value).catch(() => {});
    }, PAUSE_MS));
}

function onCommit(event) {
    const field = event.target.closest && event.target.closest('[data-rf-qty]');
    if (!field || !typing.has(field)) return;
    setQuantity(field, field.value === '' ? 0 : field.value).catch(() => {});
}

function onKey(event) {
    const field = event.target.closest && event.target.closest('[data-rf-qty]');
    if (!field) return;
    if (event.key === 'Enter') {
        event.preventDefault();
        onCommit(event);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        step(field, event.key === 'ArrowUp' ? 1 : -1).catch(() => {});
    }
}

// Starts the fields under `root` (once per root).
export function bindQuantities(root, { flyBrands = [] } = {}) {
    if (flyBrands.length) settings.flyBrands = flyBrands;
    if (bound.has(root)) return;
    bound.add(root);
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onCommit);
    root.addEventListener('focusout', onCommit);
    root.addEventListener('keydown', onKey);
}

let following = false;

// Keeps every field on the page in step with the box.
export function followBox(doc = document) {
    if (following) return;
    following = true;
    box.subscribe(() => syncQuantities(doc));
}
