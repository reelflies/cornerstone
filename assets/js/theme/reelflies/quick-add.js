// Quick add (DESIGN.md "Size Strip", the signature interaction): "+ Add" on a specimen card
// (components/reelflies/fly.html, card-html.js) picks the card up into the raking light and
// opens its size strip under it, biggest hook first. Each size chosen adds one fly of that size
// to the box (box.js); its count rides on the cell, "−1" takes one back, Done or Escape puts the
// card down. A card whose product has one size says "Add 1" and adds it straight away.
//
// - Sizes come from storefront.js: the server's seed for the home page's best sellers, else one
//   GraphQL read, made as the pointer reaches "+ Add" or it takes focus, so the strip is usually
//   ready on click. A product the strip can't offer (more than one option) or a failed read opens
//   the strip on a link to the fly's page instead.
// - Sold-out sizes are drawn struck through, can't be chosen, and are named under the strip.
// - Every card on the page keeps its reserved line in step with the box: the size range, or once
//   flies are in the box, which sizes (the longest form that fits), with the copper-lit ring.
//   rf_cart_state off leaves the line and ring out.
// - Every add and removal is said in the polite live region, with the box's new count, and a
//   refusal is said with the store's words.
//
// Started with the page's context: start(context).

import * as box from './box';
import { boxWords as wordsFor } from './box-words';
import { flyBrandList } from './cart-count';
import { CARDS_EVENT, escapeHtml } from './card-html';
import { bump, fly } from './flight';
import { compareHookSizes } from './hook-order';
import { announce } from './live-region';
import { productById, seed } from './storefront';
import { word } from './words';

const HOOK_ORDER = ['6/0', '5/0', '4/0', '3/0', '2/0', '1/0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20', '22', '24'];
const stepFor = label => {
    const i = HOOK_ORDER.indexOf(label);
    return i < 0 ? 0.5 : (1 - (i / (HOOK_ORDER.length - 1)) * 0.82).toFixed(2);
};

let settings = { cartState: true, flyBrands: [] };

// Every cell keeps the "−1" row, empty until its size is in the box, so the strip never changes
// shape as flies go in (the Reserved Line rule, inside the strip).
const RESERVED = '<span class="rf-sz__minus rf-sz__minus--none" aria-hidden="true"></span>';

const cardOf = el => el.closest('.rf-fly[data-rf-product]');
const linesFor = productId => box.lines().filter(line => line.productId === String(productId));

function stripHtml(product) {
    const counts = new Map(linesFor(product.id).map(line => [String(line.variantId), line.quantity]));
    const cells = product.sizes.map(size => {
        const n = counts.get(String(size.variantId)) || 0;
        const step = `<span class="rf-sz__step" style="--rf-k:${stepFor(size.label)}"></span>`;
        if (!size.inStock) {
            return `<li class="rf-sz"><button class="rf-sz__btn" type="button" disabled aria-label="${escapeHtml(word('size_sold', { size: size.label }))}">${step}<span>${escapeHtml(size.label)}</span></button>${RESERVED}</li>`;
        }
        const label = n ? word('size_label_in', { size: size.label, n }) : word('size_label', { size: size.label });
        return `<li class="rf-sz"><button class="rf-sz__btn${n ? ' has-count' : ''}" type="button" data-rf-size="${escapeHtml(size.label)}" data-rf-variant="${size.variantId}" aria-label="${escapeHtml(label)}">${step}<span>${escapeHtml(size.label)}</span>${n ? `<span class="rf-sz__count">${n}</span>` : ''}</button>${n ? `<button class="rf-sz__minus" type="button" data-rf-minus="${escapeHtml(size.label)}" data-rf-variant="${size.variantId}" aria-label="${escapeHtml(word('minus_label', { size: size.label }))}">${word('minus')}</button>` : RESERVED}</li>`;
    }).join('');
    const sold = product.sizes.filter(size => !size.inStock).map(size => size.label);
    let foot = word('largest_first');
    if (sold.length === 1) foot = word('sold_one', { size: sold[0] });
    else if (sold.length) foot = word('sold_many', { sizes: sold.join(', ') });
    return `<p class="rf-sizes__hint" id="rf-hint-${product.id}">${word('hint')}</p>
<ol class="rf-sizes__strip" aria-describedby="rf-hint-${product.id}">${cells}</ol>
<div class="rf-sizes__foot"><span>${escapeHtml(foot)}</span><button class="rf-sizes__done" type="button" data-rf-done>${word('done')}</button></div>`;
}

function elsewhereHtml(product, url) {
    return `<p class="rf-sizes__hint">${word(product ? 'choose_on_page' : 'load_failed')}</p>
<div class="rf-sizes__foot"><a class="rf-more" href="${escapeHtml(url)}">${word('page_link')}</a><button class="rf-sizes__done" type="button" data-rf-done>${word('done')}</button></div>`;
}

function syncCard(card) {
    const productId = card.dataset.rfProduct;
    const lines = linesFor(productId).sort((a, b) => compareHookSizes(a.size, b.size));
    const n = lines.reduce((sum, line) => sum + line.quantity, 0);
    const tag = card.querySelector('[data-rf-inbox]');
    const lineEl = card.querySelector('.rf-fly__line');
    const show = settings.cartState && n > 0;
    card.classList.toggle('is-in', show);
    if (tag && lineEl) {
        if (show) {
            const sized = lines.filter(line => line.size);
            const full = sized.map(line => `${line.quantity} × ${line.size}`).join(', ');
            const forms = sized.length
                ? [word('in_box_full', { list: full }), word('in_box_short', { list: sized.map(line => (line.quantity > 1 ? `${line.size} ×${line.quantity}` : line.size)).join(', ') }), word('in_box_count', { n })]
                : [word('in_box_count', { n })];
            tag.hidden = false;
            forms.some(text => {
                tag.textContent = text;
                return lineEl.scrollWidth <= lineEl.clientWidth + 1;
            });
            tag.title = sized.length ? word('in_box_full', { list: full }) : '';
        } else {
            tag.hidden = true;
            tag.textContent = '';
            tag.removeAttribute('title');
        }
    }
    const panel = card.querySelector('[data-rf-sizes]');
    if (panel && !panel.hidden && panel.dataset.rfReady) {
        productById(productId).then(product => {
            if (panel.hidden || product.complex) return;
            const active = document.activeElement && card.contains(document.activeElement) ? document.activeElement : null;
            const focusSize = active && (active.dataset.rfSize || active.dataset.rfMinus);
            const wasMinus = active && active.dataset.rfMinus;
            panel.innerHTML = stripHtml(product);
            if (focusSize) {
                const esc = window.CSS && CSS.escape ? CSS.escape(focusSize) : focusSize;
                const target = (wasMinus && panel.querySelector(`[data-rf-minus="${esc}"]`)) || panel.querySelector(`[data-rf-size="${esc}"]`);
                if (target) target.focus();
            }
        }, () => {});
    }
}

export function syncCards(root = document) {
    root.querySelectorAll('.rf-fly[data-rf-product]').forEach(syncCard);
}

function closeStrip(card, refocus) {
    const panel = card.querySelector('[data-rf-sizes]');
    const button = card.querySelector('[data-rf-add]');
    if (panel) {
        panel.hidden = true;
        delete panel.dataset.rfReady;
    }
    card.classList.remove('is-open');
    if (button) {
        button.setAttribute('aria-expanded', 'false');
        if (refocus) button.focus();
    }
}

async function openStrip(card) {
    const panel = card.querySelector('[data-rf-sizes]');
    const button = card.querySelector('[data-rf-add]');
    const url = card.querySelector('.rf-fly__name a').getAttribute('href');
    document.querySelectorAll('.rf-fly.is-open').forEach(other => { if (other !== card) closeStrip(other, false); });
    card.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-busy', 'true');
    let product = null;
    try {
        product = await productById(card.dataset.rfProduct);
    } catch (error) {
        product = null;
    }
    button.removeAttribute('aria-busy');
    if (!card.classList.contains('is-open')) return;
    panel.innerHTML = product && !product.complex ? stripHtml(product) : elsewhereHtml(product, url);
    panel.dataset.rfReady = '1';
    panel.hidden = false;
    panel.classList.remove('is-flip');
    if (panel.getBoundingClientRect().right > document.documentElement.clientWidth - 8) panel.classList.add('is-flip');
    const first = panel.querySelector('.rf-sz__btn:not(:disabled)') || panel.querySelector('a, button');
    if (first) first.focus({ preventScroll: true });
    // the whole strip in view, clear of the order line (the page's scroll-padding, _order-line.scss)
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
}

function what(product, size) {
    return size ? word('what_size', { size, name: product.name }) : product.name;
}

function add(card, product, size, delta) {
    const meta = {
        name: product.name, size: size ? size.label : '', imageUrl: product.img.small || product.img.card, price: product.price, brand: product.brand, url: product.url,
    };
    let variantId = null;
    if (size) variantId = size.variantId;
    else if (product.single) variantId = product.single.variantId;
    const result = box.change({
        productId: product.id, variantId, delta, meta,
    });
    if (delta > 0) {
        bump();
        fly(card, product.id);
    }
    result.then(() => {
        announce(word(delta > 0 ? 'added' : 'removed', { what: what(product, size && size.label), count: wordsFor(settings.flyBrands) }));
    }, error => {
        announce(`${word(delta > 0 ? 'add_failed' : 'change_failed', { what: what(product, size && size.label) })} ${error.storeWords ? error.message : word('try_again')}`);
    });
}

async function onClick(event) {
    const addButton = event.target.closest('[data-rf-add]');
    const card = addButton ? cardOf(addButton) : cardOf(event.target);
    if (!card) {
        document.querySelectorAll('.rf-fly.is-open').forEach(open => closeStrip(open, false));
        return;
    }
    if (addButton) {
        if (card.classList.contains('is-open')) {
            closeStrip(card, true);
            return;
        }
        if (addButton.dataset.rfAdd !== 'one') {
            openStrip(card);
            return;
        }
        let product = null;
        try {
            product = await productById(card.dataset.rfProduct);
        } catch (error) {
            product = null;
        }
        if (product && product.single && !product.complex && product.sizes.length <= 1) {
            if (!product.single.inStock) {
                announce(word('sold_out', { name: product.name }));
                return;
            }
            add(card, product, product.sizes[0] || null, 1);
            return;
        }
        openStrip(card);
        return;
    }
    const sizeButton = event.target.closest('[data-rf-size]');
    const minus = event.target.closest('[data-rf-minus]');
    if (sizeButton || minus) {
        const product = await productById(card.dataset.rfProduct);
        const variantId = (sizeButton || minus).dataset.rfVariant;
        const size = product.sizes.find(item => String(item.variantId) === String(variantId));
        if (size) add(card, product, size, sizeButton ? 1 : -1);
        return;
    }
    if (event.target.closest('[data-rf-done]')) closeStrip(card, true);
}

function prefetch(event) {
    const button = event.target.closest && event.target.closest('[data-rf-add]');
    const card = button && cardOf(button);
    if (card) productById(card.dataset.rfProduct).catch(() => {});
}

export function start(context = {}) {
    settings = { cartState: context.rfCartState !== false, flyBrands: flyBrandList(context.rfFlyBrands) };
    const seedEl = document.querySelector('[data-rf-sizes-seed]');
    if (seedEl) {
        try {
            const best = JSON.parse(seedEl.textContent);
            seed(best && best.edges);
        } catch (error) {
            // no seed: the strip reads its sizes when it opens
        }
    }
    document.addEventListener('click', onClick);
    document.addEventListener('pointerover', event => { if (event.pointerType === 'mouse') prefetch(event); });
    document.addEventListener('focusin', prefetch);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const card = event.target.closest && event.target.closest('.rf-fly.is-open');
        if (card) closeStrip(card, true);
    });
    box.subscribe(() => syncCards());
    document.addEventListener(CARDS_EVENT, event => syncCards(event.target));
    syncCards();
}
