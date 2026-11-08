// A specimen card's markup, for cards the scripts lay out (the stone's ways in, the moss lay):
// the same markup as components/reelflies/fly.html, from a product storefront.js normalised.
// Change the two together.

import { hookRank } from './hook-order';
import { word } from './words';

// Sent on a list (bubbling) after the scripts lay new cards in it, so quick-add.js brings them
// in step with the box.
export const CARDS_EVENT = 'rf:cards-laid';
// Sent on the grid (bubbling) when order-list.js shows Photos again after Quick order, with
// { view } in detail: a card line measured while the grid was hidden had no width to fit.
export const VIEW_EVENT = 'rf:view-set';

export const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

export function money(value, token = '$') {
    return `${token}${Number(value || 0).toFixed(2)}`;
}

// The reserved line's size range: hook sizes only. An option of colours or lengths says how many
// choices it has instead, so it never reads as a hook range.
export function sizeRange(product) {
    const { sizes } = product;
    if (!sizes.length) return '';
    if (!sizes.every(size => hookRank(size.label) !== null)) return word('choices', { n: sizes.length });
    if (sizes.length > 1) return word('sizes', { from: sizes[0].label, to: sizes[sizes.length - 1].label });
    return word('size', { size: sizes[0].label });
}

export function cardHtml(product, {
    size = 'sm', unit = 'fly', quickAdd = true, money: token = '$', extra = '',
} = {}) {
    const name = escapeHtml(product.name);
    const url = escapeHtml(product.url);
    const multi = !product.single;
    const photo = product.img.card
        ? `<img src="${escapeHtml(product.img.card)}" srcset="${escapeHtml(product.img.card)} 360w, ${escapeHtml(product.img.large)} 720w" sizes="(min-width: 1040px) 240px, (min-width: 640px) 30vw, 46vw" width="720" height="480" alt="" decoding="async">`
        : '';
    const buy = quickAdd
        ? `<button class="rf-add" type="button" data-rf-add="${multi ? 'sizes' : 'one'}" aria-expanded="false">${word(multi ? 'add' : 'add_one')}<span class="is-srOnly">: ${name}</span></button>`
        : `<a class="rf-add rf-add--link" href="${url}">${word(multi ? 'choose' : 'view')}<span class="is-srOnly">: ${name}</span></a>`;
    return `<li class="rf-fly rf-fly--${size}${extra ? ` ${extra}` : ''}" data-rf-product="${escapeHtml(product.id)}">
    <article class="rf-fly__card">
        <a class="rf-fly__photo" href="${url}" tabindex="-1" aria-hidden="true">${photo}</a>
        <div class="rf-fly__body">
            <h3 class="rf-fly__name"><a href="${url}">${name}</a></h3>
            <div class="rf-fly__buy">
                <div class="rf-fly__meta">
                    <p class="rf-fly__price"><span class="rf-num">${money(product.price, token)}</span>${unit ? ` <span class="rf-fly__unit">${word(`per_${unit}`)}</span>` : ''}</p>
                    <p class="rf-fly__line"><span class="rf-fly__sizes">${escapeHtml(sizeRange(product))}</span><span class="rf-fly__inbox" data-rf-inbox hidden></span></p>
                </div>
                ${buy}
            </div>
        </div>
        ${quickAdd ? '<div class="rf-fly__sizes-panel" data-rf-sizes hidden></div>' : ''}
    </article>
</li>`;
}
