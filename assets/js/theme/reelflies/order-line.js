// The order line, the box sheet and the header's Box count (DESIGN.md "Order Line";
// components/reelflies/order-line.html), drawn from the box (box.js) on every page.
//
// - The header count: the box's flies (or items, by the brand rule in cart-count.js), copper
//   once there are any. With the order line on the page, Box opens the sheet instead of going
//   to the cart.
// - The bar: the last four patterns as thumbnails, the count in flies and patterns, the distance
//   to free standard shipping on the fly lines (the order line's data-rf-free, in dollars) with
//   its figure in lit copper, and Check out with the total.
// - The sheet: each pattern with a stepper per size in hook order (box.change), the total, the
//   shipping meter and Check out. It opens above the bar with focus on its heading; Escape and
//   the close button shut it and focus goes back to what opened it. Redrawn after each change,
//   it keeps focus on the stepper button in hand (or its heading, once the line is gone).
// - The page's HTML has an empty box, so a cached page never shows another shopper's; the cart
//   is read once the page has loaded, and only when it has one (context.cartId), and again
//   after any stock add (cart-quantity-update).

import $ from 'jquery';
import * as box from './box';
import { meterHtml, shippingHtml, boxWords as wordsFor } from './box-words';
import { flyBrandList } from './cart-count';
import { escapeHtml, money } from './card-html';
import { compareHookSizes } from './hook-order';
import { announce } from './live-region';
import { word } from './words';

let brands = [];
let opener = null;
const boxWords = () => wordsFor(brands);

function patterns() {
    const groups = new Map();
    box.lines().forEach(line => {
        if (!groups.has(line.productId)) groups.set(line.productId, []);
        groups.get(line.productId).push(line);
    });
    return [...groups.values()].map(lines => lines.sort((a, b) => compareHookSizes(a.size, b.size)));
}

function shipping(root, totals) {
    return shippingHtml(Number(root.dataset.rfFree), root.dataset.rfMoney || '$', totals);
}

function renderSheet(root) {
    const body = root.querySelector('[data-rf-box-body]');
    const totals = box.totals(brands);
    const token = root.dataset.rfMoney || '$';
    if (!totals.units) {
        body.innerHTML = `<p class="rf-box__empty">${escapeHtml(word('box_empty_long'))}</p>`;
        return;
    }
    const groups = patterns().map(lines => {
        const first = lines[0];
        const rows = lines.map(line => {
            const label = line.size ? word('size', { size: line.size }) : word('one_size');
            return `<div class="rf-box__line"><span class="rf-box__size">${escapeHtml(label)}</span>
<span class="rf-stepper" role="group" aria-label="${escapeHtml(`${first.name}, ${label}`)}"><button type="button" data-rf-step="-1" data-rf-key="${escapeHtml(line.key)}" aria-label="${escapeHtml(word('remove_one'))}">−</button><output aria-live="off">${line.quantity}</output><button type="button" data-rf-step="1" data-rf-key="${escapeHtml(line.key)}" aria-label="${escapeHtml(word('add_one_more'))}">+</button></span>
<span class="rf-box__lt rf-num">${money(line.quantity * (line.price || 0), token)}</span></div>`;
        }).join('');
        const image = first.imageUrl ? `<img src="${escapeHtml(first.imageUrl)}" width="64" height="43" alt="" loading="lazy">` : '<span class="rf-box__noimg"></span>';
        return `<div class="rf-box__pattern">${image}<div><p class="rf-box__pname">${first.url ? `<a href="${escapeHtml(first.url)}">${escapeHtml(first.name)}</a>` : escapeHtml(first.name)}</p><div class="rf-box__lines">${rows}</div></div></div>`;
    }).join('');
    const free = Number(root.dataset.rfFree);
    const meter = meterHtml(free, totals);
    const checkout = root.querySelector('[data-rf-checkout]').dataset.rfCheckoutUrl;
    const active = document.activeElement;
    const keep = active && body.contains(active) && active.dataset.rfStep ? active : null;
    body.innerHTML = `${groups}
<p class="rf-box__total"><span>${escapeHtml(boxWords())}</span><span class="rf-num">${money(totals.amount, token)}</span></p>
${meter}
${free ? `<p class="rf-box__ship">${shipping(root, totals)} ${escapeHtml(word('ship_note'))}</p>` : ''}
<a class="rf-buy rf-box__go" href="${escapeHtml(checkout)}">${escapeHtml(word('checkout'))}</a>`;
    if (keep) {
        const esc = window.CSS && CSS.escape ? CSS.escape(keep.dataset.rfKey) : keep.dataset.rfKey;
        const again = body.querySelector(`[data-rf-step="${keep.dataset.rfStep}"][data-rf-key="${esc}"]`);
        if (again) again.focus();
        else root.querySelector('[data-rf-box-title]').focus();
    }
}

function render(root) {
    const totals = box.totals(brands);
    const count = document.querySelector('[data-rf-count]');
    const countLabel = document.querySelector('[data-rf-count-label]');
    const button = document.querySelector('[data-rf-box-btn]');
    if (count) count.textContent = totals.units;
    let label = 'count_items';
    if (totals.flies || !totals.units) label = totals.units === 1 ? 'count_fly' : 'count_flies';
    if (countLabel) countLabel.textContent = word(label);
    if (button) button.classList.toggle('has-flies', totals.units > 0);
    if (!root) return;
    const token = root.dataset.rfMoney || '$';
    const thumbs = root.querySelector('[data-rf-thumbs]');
    const recent = patterns().slice(-4);
    const shown = new Set([...thumbs.querySelectorAll('[data-rf-thumb]')].map(el => el.dataset.rfThumb));
    thumbs.innerHTML = recent.map(lines => {
        const line = lines[0];
        const image = line.imageUrl ? `<img src="${escapeHtml(line.imageUrl)}" alt="">` : '';
        return `<span class="rf-orderline__thumb${shown.has(line.productId) ? '' : ' is-new'}" data-rf-thumb="${escapeHtml(line.productId)}">${image}</span>`;
    }).join('');
    const sum = root.querySelector('[data-rf-sum]');
    const ship = root.querySelector('[data-rf-ship]');
    const total = root.querySelector('[data-rf-total]');
    const checkout = root.querySelector('[data-rf-checkout]');
    sum.textContent = boxWords();
    ship.innerHTML = shipping(root, totals);
    total.textContent = totals.units ? money(totals.amount, token) : '';
    checkout.setAttribute('aria-disabled', totals.units ? 'false' : 'true');
    checkout.setAttribute('href', totals.units ? checkout.dataset.rfCheckoutUrl : checkout.dataset.rfCartUrl);
    if (!root.querySelector('[data-rf-box]').hidden) renderSheet(root);
}

function setSheet(root, open, from) {
    const sheet = root.querySelector('[data-rf-box]');
    sheet.hidden = !open;
    document.querySelectorAll('[data-rf-box-toggle], [data-rf-box-btn]').forEach(el => el.setAttribute('aria-expanded', String(open)));
    if (open) {
        opener = from || null;
        renderSheet(root);
        root.querySelector('[data-rf-box-title]').focus();
    } else if (opener) {
        opener.focus();
        opener = null;
    }
}

function step(target) {
    const line = box.lines().find(item => item.key === target.dataset.rfKey);
    if (!line) return;
    const delta = Number(target.dataset.rfStep);
    const label = line.size ? word('what_size', { size: line.size, name: line.name }) : line.name;
    box.change({
        productId: line.productId, variantId: line.variantId, delta, meta: line,
    }).then(() => {
        let key = 'added';
        if (delta < 0) key = box.lines().length ? 'removed' : 'removed_empty';
        announce(word(key, { what: label, count: boxWords() }));
    }, error => {
        announce(`${word('change_failed', { what: label })} ${error.storeWords ? error.message : word('try_again')}`);
    });
}

export function start(context = {}) {
    brands = flyBrandList(context.rfFlyBrands);
    box.setChannel(context.rfChannelId); // for the data layer (box.js)
    const root = document.querySelector('[data-rf-orderline]');
    const button = document.querySelector('[data-rf-box-btn]');
    box.subscribe(() => render(root));
    if (root) {
        if (button) {
            button.setAttribute('role', 'button');
            button.setAttribute('aria-controls', 'rf-box');
            button.setAttribute('aria-expanded', 'false');
            button.addEventListener('click', event => {
                event.preventDefault();
                setSheet(root, root.querySelector('[data-rf-box]').hidden, button);
            });
            button.addEventListener('keydown', event => {
                if (event.key === ' ') {
                    event.preventDefault();
                    button.click();
                }
            });
        }
        const toggle = root.querySelector('[data-rf-box-toggle]');
        toggle.addEventListener('click', () => setSheet(root, root.querySelector('[data-rf-box]').hidden, toggle));
        root.querySelector('[data-rf-box-close]').addEventListener('click', () => setSheet(root, false));
        root.querySelector('[data-rf-box]').addEventListener('keydown', event => {
            if (event.key === 'Escape') setSheet(root, false);
        });
        root.querySelector('[data-rf-box-body]').addEventListener('click', event => {
            const target = event.target.closest('[data-rf-step]');
            if (target) step(target); // renderSheet keeps focus on the same stepper button
        });
        root.querySelector('[data-rf-checkout]').addEventListener('click', event => {
            if (event.currentTarget.getAttribute('aria-disabled') === 'true') event.preventDefault();
        });
    }
    render(root);
    box.load(context.cartId);
    // stock's own adds (the product page, Quick view) say so on body; read the cart again then
    $('body').on('cart-quantity-update', () => box.load(true));
}
