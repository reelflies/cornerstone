// Quick search (ticket 30; spec module 5, module 4's phone row; O18, UX-4; stories 2, 3 and 68): the
// suggestions under each ReelFlies search form (components/reelflies/search-form.html), the
// header's form and the phone search row alike. reelflies/global.js starts it on every page, as
// its own chunk (rf-quick-search), so main.js only carries the import.
//
// - Each form stays a real GET to the search page, so Enter works with no script. This only adds
//   the dropdown, and stops a submit with nothing typed.
// - 400 ms after the last keystroke, with at least 3 characters (stock's minimum,
//   quick-search.js:70-73), it asks the search page for components/reelflies/quick-results.html.
//   That template renders the count heading, the product rows and "See all N results"; this
//   puts up to 2 matching categories under the heading, matched here against the names in the
//   server-rendered nav (data-rf-category on ticket 28's grouped menu, build pipeline 6.9; the
//   stock .navPages-action links in its fallback, while both menu ids are empty).
// - One accessible model, the simple one (critique, the header search finding): a plain search
//   input with no combobox attributes, the results after it in tab order inside its form, and the
//   heading's words announced once per search through the shared live region (live-region.js),
//   in place of stock's count of rendered cards (quick-search.js:56-58).
// - While a dropdown is open, <html data-rf-open> holds "search" (open-state.js), which ticket
//   52's outside-Canada prompt waits on (GEO-3). One dropdown is open at a time.
// - Escape, a click or focus outside the form, or fewer than 3 characters close it, and drop a
//   search still waiting, so a late answer opens nothing; focusing the field again shows the last
//   results again, without a new request or announcement. A failed search closes it and is asked
//   again at the next keystroke, even for the same words.
// - On phones, the header's search icon becomes a toggle (data-rf-search-toggle) that opens the
//   header's form as the bar's second row, as the reference's does. Without script it stays the
//   link to the search page (data-rf-search-link).
//
// Stock quick-search.js still binds the stock navigation's form (navigation-menu.html:2-4),
// which renders only in ticket 28's fallback, while both menu ids are empty: on ReelFlies_CA
// until wave R1 sets tree 4's ids. The two never share a form.

import utils from '@bigcommerce/stencil-utils';
import { announce as announceInRegion } from './live-region';
import { markClosed, markOpen } from './open-state';

export const DEBOUNCE_MS = 400;
export const MIN_LENGTH = 3;
export const MAX_CATEGORIES = 2;
export const OPEN_TOKEN = 'search';
export const RESULTS_TEMPLATE = 'reelflies/quick-results';
export const FORM_SELECTOR = '[data-rf-search-form]';
export const CATEGORY_SELECTOR = '[data-rf-category]';
// The stock nav's category links, without its account list (currency, gift certificates, sign in)
// and without Web Page links; each "All <name>" link shares its category's URL, so it is dropped.
export const FALLBACK_SELECTOR = '.navPages-list:not(.navPages-list--user) .navPages-action';
export const SEARCH_OPEN_CLASS = 'rf-is-search-open';

// A name or a query as words: lower case, accents folded, split on anything but letters and digits.
export function words(text) {
    return String(text ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
}

// The categories in the nav, in nav order, once per URL: [{ name, url }].
// Array.from, never [...nodeList]: the theme's Babel is loose (babel.config.js), which spreads a
// NodeList into an array holding the NodeList itself.
export function navCategories(doc = document) {
    let links = Array.from(doc.querySelectorAll(CATEGORY_SELECTOR));
    if (!links.length) {
        links = Array.from(doc.querySelectorAll(FALLBACK_SELECTOR)).filter(link => !link.closest('.navPages-item-page'));
    }
    const seen = new Set();
    const categories = [];
    links.forEach(link => {
        const url = link.getAttribute('href') || '';
        const name = (link.textContent || '').replace(/\s+/g, ' ').trim();
        if (!url || url === '#' || !name || seen.has(url)) return;
        seen.add(url);
        categories.push({ name, url });
    });
    return categories;
}

// Up to `max` categories whose names hold every word of the query, each as the start of one of
// the name's words, in any order and any case. A name the query covers whole comes first; the
// rest keep nav order.
export function matchCategories(query, categories, max = MAX_CATEGORIES) {
    const wanted = words(query);
    if (!wanted.length) return [];
    const startsOne = (have, word) => have.some(part => part.startsWith(word));
    return categories
        .map((category, index) => ({ category, index, have: words(category.name) }))
        .filter(({ have }) => wanted.every(word => startsOne(have, word)))
        .map(match => ({ ...match, whole: match.have.every(part => wanted.some(word => part.startsWith(word))) }))
        .sort((a, b) => (Number(b.whole) - Number(a.whole)) || (a.index - b.index))
        .slice(0, max)
        .map(({ category }) => category);
}

// The search page for a query, from the form's own action.
export function searchUrl(action, query) {
    const base = String(action || '');
    return `${base}${base.includes('?') ? '&' : '?'}search_query=${encodeURIComponent(query)}`;
}

// The search page rendered with components/reelflies/quick-results.html, as a promise of its HTML.
// stencil-utils aborts its previous search when a new one starts; that one rejects.
export function searchRequest(query) {
    return new Promise((resolve, reject) => {
        utils.api.search.search(query, { template: RESULTS_TEMPLATE }, (error, response) => {
            if (error) reject(error);
            else resolve(response);
        });
    });
}

// One category row, as the reference's: a copy of the results' arrow tile (`tile`, the
// data-rf-qs-category-tile template's content, when there is one) in the thumbnail column, then
// the name and the muted word on one line. Its name reads "<name>, category".
function categoryItem(doc, category, label, tile) {
    const item = doc.createElement('li');
    item.className = 'rf-qs-item rf-qs-item--category';
    const link = doc.createElement('a');
    link.className = 'rf-qs-link rf-qs-category';
    link.setAttribute('href', category.url);
    const text = doc.createElement('span');
    text.className = 'rf-qs-category-text';
    const name = doc.createElement('span');
    name.className = 'rf-qs-category-name';
    name.textContent = category.name;
    const kind = doc.createElement('span');
    kind.className = 'rf-qs-kind';
    const comma = doc.createElement('span');
    comma.className = 'is-srOnly';
    comma.textContent = ', ';
    kind.append(comma, label);
    text.append(name, kind);
    if (tile) link.append(doc.importNode(tile, true));
    link.append(text);
    item.append(link);
    return item;
}

// One form's dropdown. `request(query)` resolves to the results' HTML, `categories()` lists the
// nav's categories, `announce(text)` speaks, and `onOpen(controller)` runs before it opens.
export function bindQuickSearch(form, {
    request = searchRequest,
    categories = () => navCategories(),
    announce = announceInRegion,
    onOpen = () => {},
    doc = document,
} = {}) {
    const input = form.querySelector('input[name="search_query"]');
    const box = doc.createElement('div');
    box.className = 'rf-qs';
    box.hidden = true;
    box.setAttribute('data-rf-qs', '');
    form.append(box);

    let timer = null;
    let sequence = 0;
    let wanted = null; // the query asked for, or waiting to be
    let shown = null; // the query whose results the dropdown holds
    const cleanup = [];
    const listen = (target, type, handler) => {
        target.addEventListener(type, handler);
        cleanup.push(() => target.removeEventListener(type, handler));
    };

    const controller = {
        form,
        isOpen: () => !box.hidden,
        close() {
            if (box.hidden) return;
            box.hidden = true;
            markClosed(OPEN_TOKEN, doc.documentElement);
        },
        stop() {
            cleanup.splice(0).forEach(undo => undo());
            clearTimeout(timer);
            sequence += 1;
            controller.close();
            box.remove();
        },
    };

    // Drops the search still waiting for its 400 ms or for its answer, so nothing opens or speaks
    // after the shopper has left: Escape, or a click or focus outside the form (which includes
    // the phone header's toggle closing the row). The words on show stay the ones asked for.
    const cancel = () => {
        clearTimeout(timer);
        timer = null;
        sequence += 1;
        wanted = shown;
    };

    const open = () => {
        if (!box.hidden) return;
        onOpen(controller);
        box.hidden = false;
        markOpen(OPEN_TOKEN, doc.documentElement);
    };

    const render = (query, html) => {
        box.innerHTML = html;
        const results = box.querySelector('[data-rf-qs-results]');
        if (!results) {
            controller.close();
            return;
        }
        const list = box.querySelector('[data-rf-qs-categories]');
        if (list) {
            const label = results.getAttribute('data-rf-qs-category-label') || '';
            const template = box.querySelector('template[data-rf-qs-category-tile]');
            const tile = template && template.content.firstElementChild;
            const matched = matchCategories(query, categories());
            list.replaceChildren(...matched.map(category => categoryItem(doc, category, label, tile)));
            list.hidden = matched.length === 0;
        }
        const all = box.querySelector('[data-rf-qs-all]');
        if (all) all.setAttribute('href', searchUrl(form.getAttribute('action'), query));
        shown = query;
        open();
        const heading = box.querySelector('[data-rf-qs-heading]');
        if (heading) announce(heading.textContent.replace(/\s+/g, ' ').trim());
    };

    const run = query => {
        sequence += 1;
        const id = sequence;
        let answer;
        try {
            answer = Promise.resolve(request(query));
        } catch (error) {
            answer = Promise.reject(error);
        }
        answer.then(html => {
            if (id === sequence) render(query, html);
        }, () => {
            if (id !== sequence) return;
            wanted = null; // so the next keystroke asks again, even for the same words
            controller.close();
        });
    };

    listen(input, 'input', () => {
        const query = input.value.trim();
        if (query.length < MIN_LENGTH) {
            clearTimeout(timer);
            sequence += 1;
            wanted = null;
            shown = null;
            controller.close();
            return;
        }
        if (query === wanted) return; // nothing new to ask, such as a trailing space
        wanted = query;
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            run(query);
        }, DEBOUNCE_MS);
    });

    // Focus coming back to the field shows the last results again, unless this moved it there.
    let quiet = false;
    const focusField = () => {
        quiet = true;
        input.focus();
        quiet = false;
    };

    listen(input, 'focus', () => {
        if (!quiet && shown && box.hidden && input.value.trim() === shown) open();
    });

    listen(form, 'keydown', event => {
        if (event.key !== 'Escape') return;
        cancel();
        if (box.hidden) return; // nothing on show: the header's toggle may close its row
        event.preventDefault(); // keeps the field's text, and tells the header's toggle it was used
        controller.close();
        focusField();
    });

    listen(form, 'submit', event => {
        clearTimeout(timer);
        if (input.value.trim()) return; // a real GET to the search page
        event.preventDefault();
        focusField();
    });

    const outside = event => {
        if (form.contains(event.target)) return;
        cancel();
        controller.close();
    };
    listen(doc, 'click', outside);
    listen(doc, 'focusin', outside);

    return controller;
}

// The phone header's search icon: a toggle that opens the header's form as the bar's second row.
function bindToggle(doc) {
    const header = doc.querySelector('[data-rf-header]');
    const toggle = doc.querySelector('[data-rf-search-toggle]');
    const form = toggle && doc.getElementById(toggle.getAttribute('aria-controls'));
    if (!header || !toggle || !form) return () => {};
    const link = doc.querySelector('[data-rf-search-link]');
    const input = form.querySelector('input[name="search_query"]');
    if (link) link.hidden = true;
    toggle.hidden = false;

    const set = isOpen => {
        header.classList.toggle(SEARCH_OPEN_CLASS, isOpen);
        toggle.setAttribute('aria-expanded', String(isOpen));
    };
    const click = () => {
        const isOpen = toggle.getAttribute('aria-expanded') !== 'true';
        set(isOpen);
        if (isOpen && input) input.focus();
    };
    const escape = event => {
        // A dropdown open in the form takes the first Escape (bindQuickSearch prevents it).
        if (event.key !== 'Escape' || event.defaultPrevented || toggle.getAttribute('aria-expanded') !== 'true') return;
        set(false);
        toggle.focus();
    };
    toggle.addEventListener('click', click);
    form.addEventListener('keydown', escape);
    return () => {
        toggle.removeEventListener('click', click);
        form.removeEventListener('keydown', escape);
        set(false);
        toggle.hidden = true;
        if (link) link.hidden = false;
    };
}

export default function startQuickSearch(context, { doc = document, request = searchRequest, announce = announceInRegion } = {}) {
    let nav = null;
    const categories = () => {
        if (!nav) nav = navCategories(doc);
        return nav;
    };
    const controllers = [];
    const onOpen = opening => controllers.forEach(other => {
        if (other !== opening) other.close();
    });
    doc.querySelectorAll(FORM_SELECTOR).forEach(form => {
        if (form.querySelector('input[name="search_query"]')) {
            controllers.push(bindQuickSearch(form, {
                request, categories, announce, onOpen, doc,
            }));
        }
    });
    const stopToggle = bindToggle(doc);
    return {
        forms: controllers,
        stop() {
            controllers.forEach(controller => controller.stop());
            stopToggle();
        },
    };
}
