// Search suggestions (ticket 30; DESIGN.md "Inputs / Fields", Search) under the header's search
// field (components/reelflies/header.html, [data-rf-search]), started on every page from
// reelflies/global.js: start(context).
//
// - From 2 characters, PAUSE_MS after the last key, one Storefront API search (storefront.js
//   searchFlies, the search page's own: the same count, in the same order) for the words, and for
//   a size when the shopper names one ("caddis size 16", "caddis #16", "sz 16") as the Fly Sizes
//   filter, so the field's "caddis, size 16" works.
// - The panel: the count ("123 results for “caddis”", "… in size 16"); up to 3 categories from the
//   header's own menu whose names hold every word at the start of a word ([data-rf-cat]); up to 6
//   flies (8 from 1040px), each with its photograph, its name with the words lit, its price; and
//   "See all 123 results".
// - The simple model (ticket 30): a plain search field, the results after it in tab order,
//   ArrowDown into them, Up and Down among them, Escape back to the field. The count is said once
//   in the polite live region. Search (or Enter) goes to the results page, with a named size as
//   its Fly Sizes filter; an empty search goes nowhere. A click or focus outside closes the panel.
// - A late answer, or one for words the field no longer holds, opens nothing; a failed one closes
//   the panel and the next key asks again. Answers are kept for the page, so editing back to the
//   same words reopens them at once.

import { escapeHtml, money } from './card-html';
import { announce } from './live-region';
import { searchFlies } from './storefront';
import { word } from './words';

export const MIN = 2;
export const PAUSE_MS = 250;
const SIZE = /(?:\bsize|\bsz|#)\s*(\d{1,2}(?:\s*[/-]\s*0)?)(?!\d)/i;

const fold = text => String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// The shopper's words, and a size they named.
export function parseQuery(text) {
    const found = SIZE.exec(text);
    const size = found ? found[1].replace(/\s+/g, '').replace('-', '/') : '';
    const words = (found ? text.replace(found[0], ' ') : text).replace(/[,\s]+/g, ' ').trim();
    return { words, size };
}

export function searchUrl(base, { words, size }) {
    const params = new URLSearchParams();
    params.set('search_query', words);
    if (size) params.append('Fly Sizes', size);
    return `${base}?${params.toString()}`;
}

// The menu's categories whose names hold every word at the start of one of theirs; a name that
// starts with the first word comes first.
export function matchCategories(categories, words, limit = 3) {
    const wanted = fold(words).split(/\s+/).filter(Boolean);
    if (!wanted.length) return [];
    const starts = name => fold(name).split(/[^a-z0-9/]+/).filter(Boolean);
    return categories
        .filter(cat => wanted.every(part => starts(cat.name).some(begin => begin.startsWith(part))))
        .sort((a, b) => Number(!fold(a.name).startsWith(wanted[0])) - Number(!fold(b.name).startsWith(wanted[0])))
        .slice(0, limit);
}

// The name, escaped, with the shopper's words lit where they start a word.
export function lit(name, words) {
    const safe = escapeHtml(name);
    const parts = fold(words).split(/\s+/).filter(Boolean).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (!parts.length) return safe;
    return safe.replace(new RegExp(`(^|[^\\p{L}\\p{N}])(${parts.join('|')})`, 'giu'), '$1<mark>$2</mark>');
}

function menuCategories(doc) {
    const seen = new Set();
    return Array.from(doc.querySelectorAll('[data-rf-cat]')).map(link => ({
        name: link.dataset.rfCat,
        url: link.getAttribute('href'),
        count: (link.querySelector('.rf-num') || {}).textContent || '',
    })).filter(cat => cat.name && !seen.has(cat.url) && seen.add(cat.url));
}

const icon = name => `<svg class="rf-icon" aria-hidden="true" focusable="false"><use href="#rf-i-${name}"></use></svg>`;

function countWords(total, query) {
    const q = query.words;
    let text = total === 1 ? word('search_one', { q }) : word('search_many', { n: total.toLocaleString('en-CA'), q });
    if (query.size) text = `${text.replace(/\.$/, '')} ${word('search_in_size', { size: query.size })}`;
    return text;
}

export function panelHtml({
    query, total, products, categories, base, token = '$', wide = false,
}) {
    const all = searchUrl(base, query);
    const flies = products.slice(0, wide ? 8 : 6);
    const cats = categories.length ? `<p class="rf-suggest__title">${escapeHtml(word('search_cats'))}</p><ul class="rf-suggest__list">${categories.map(cat => `<li><a class="rf-suggest__cat" href="${escapeHtml(cat.url)}"><span class="rf-suggest__name">${lit(cat.name, query.words)}</span>${cat.count ? `<span class="rf-num rf-suggest__n">${escapeHtml(cat.count)}</span>` : ''}${icon('arrow')}</a></li>`).join('')}</ul>` : '';
    if (!total) {
        return `<p class="rf-suggest__count">${escapeHtml(word('search_none', { q: query.words }))}</p><p class="rf-suggest__hint">${escapeHtml(word('search_none_hint'))}</p>${cats}`;
    }
    const rows = flies.map(fly => `<li><a class="rf-suggest__fly" href="${escapeHtml(fly.url)}">${fly.img ? `<img src="${escapeHtml(fly.img)}" width="48" height="32" alt="" loading="lazy" decoding="async">` : '<span class="rf-suggest__noimg"></span>'}<span class="rf-suggest__name">${lit(fly.name, query.words)}</span>${fly.price !== null ? `<span class="rf-num rf-suggest__price">${money(fly.price, token)}</span>` : ''}</a></li>`).join('');
    const seeAll = total === 1 ? word('search_all_one') : word('search_all', { n: total.toLocaleString('en-CA') });
    return `<p class="rf-suggest__count">${escapeHtml(countWords(total, query))}</p>${cats}<p class="rf-suggest__title">${escapeHtml(word('search_flies'))}</p><ul class="rf-suggest__list">${rows}</ul><a class="rf-more rf-suggest__all" href="${escapeHtml(all)}">${escapeHtml(seeAll)}${icon('arrow')}</a>`;
}

function bind(form, context, doc) {
    const field = form.querySelector('input[name="search_query"]');
    const panel = form.querySelector('[data-rf-suggest]');
    if (!field || !panel) return;
    const base = form.getAttribute('action') || '/search.php';
    const answers = new Map(); // "words|size" -> { total, products }
    let timer = null;
    let seq = 0;
    let shown = '';

    const close = () => {
        panel.hidden = true;
        form.classList.remove('is-suggesting');
    };
    const links = () => Array.from(panel.querySelectorAll('a[href]'));

    const show = (query, answer) => {
        const key = `${query.words}|${query.size}`;
        panel.innerHTML = panelHtml({
            query,
            total: answer.total,
            products: answer.products,
            categories: matchCategories(menuCategories(doc), query.words),
            base,
            token: context.rfMoney || '$',
            wide: doc.defaultView.matchMedia('(min-width: 1040px)').matches,
        });
        panel.hidden = false;
        form.classList.add('is-suggesting');
        if (shown !== key) {
            shown = key;
            const count = panel.querySelector('.rf-suggest__count');
            if (count) announce(count.textContent, doc);
        }
    };

    const ask = () => {
        const query = parseQuery(field.value);
        if (query.words.length < MIN) {
            close();
            return;
        }
        const key = `${query.words}|${query.size}`;
        if (answers.has(key)) {
            show(query, answers.get(key));
            return;
        }
        seq += 1;
        const mine = seq;
        searchFlies(query.words, { size: query.size, first: 8 }).then(answer => {
            answers.set(key, answer);
            const now = parseQuery(field.value);
            if (mine !== seq || `${now.words}|${now.size}` !== key || !form.contains(doc.activeElement)) return;
            show(query, answer);
        }, () => {
            if (mine === seq) close();
        });
    };

    field.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(ask, PAUSE_MS);
    });
    field.addEventListener('focus', () => {
        const query = parseQuery(field.value);
        const key = `${query.words}|${query.size}`;
        if (answers.has(key) && query.words.length >= MIN) show(query, answers.get(key));
    });
    form.addEventListener('keydown', event => {
        const items = links();
        const at = items.indexOf(doc.activeElement);
        if (event.key === 'Escape' && !panel.hidden) {
            event.preventDefault();
            if (doc.activeElement !== field) field.focus(); // reopens what it holds, so close after
            close();
        } else if (event.key === 'ArrowDown' && !panel.hidden && items.length) {
            event.preventDefault();
            items[Math.min(items.length - 1, at + 1)].focus();
        } else if (event.key === 'ArrowUp' && at >= 0) {
            event.preventDefault();
            if (at === 0) field.focus();
            else items[at - 1].focus();
        }
    });
    form.addEventListener('focusout', event => {
        if (!event.relatedTarget || !form.contains(event.relatedTarget)) close();
    });
    doc.addEventListener('click', event => {
        if (!form.contains(event.target)) close();
    });
    form.addEventListener('submit', event => {
        const query = parseQuery(field.value);
        if (!query.words) {
            event.preventDefault();
            field.focus();
            return;
        }
        if (query.size) {
            event.preventDefault();
            doc.defaultView.location.assign(searchUrl(base, query));
        }
    });
}

export function start(context = {}, doc = document) {
    doc.querySelectorAll('[data-rf-search]').forEach(form => bind(form, context, doc));
}
