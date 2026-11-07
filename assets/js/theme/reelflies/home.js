// The home page's behaviour over its server-rendered bands (components/reelflies/home.html).
//
// - Ways in: pointing at a Fly Type or Species pill (140ms, a fine pointer only) or focusing it
//   lays that category's six best sellers on the stone in place of the best sellers, under its
//   name, with "All n" to the category and a pill back to the best sellers. A click still goes
//   to the category. The cards fade back and the new ones arrive in a short stagger; with
//   reduced motion they are simply there. A read that fails leaves the stone as it was.
// - The moss lay (from 1040px, with a fine pointer): pointing at or focusing a species lays three
//   of its flies beside the list. It is read once the band comes near the screen.
// - This month: the server lit the month it rendered in. A page served from cache in another
//   month is moved to this one: the light, the "Now", the sentence and which hatches are open.
//
// The cards' + Add is quick-add.js's; this module tells it when new cards arrive (CARDS_EVENT),
// so neither chunk loads the other.

import { CARDS_EVENT, cardHtml } from './card-html';
import { announce } from './live-region';
import { bestOf } from './storefront';
import { word } from './words';

// "All 1,446": the same count the pill or list shows beside the name (data-rf-count, present
// while rf_counts is on), so one category never shows two figures; "See all" without it.
const allWords = link => (link.dataset.rfCount ? word('all_n', { n: Number(link.dataset.rfCount).toLocaleString('en-CA') }) : word('see_all'));

const motion = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

const fragment = html => {
    const template = document.createElement('template');
    template.innerHTML = html;
    return template.content;
};

function lay(list, products, options) {
    const swap = () => {
        list.replaceChildren(fragment(products.map(product => cardHtml(product, { ...options, extra: motion() ? 'is-arriving' : '' })).join('')));
        list.dispatchEvent(new CustomEvent(CARDS_EVENT, { bubbles: true }));
    };
    if (motion() && list.children.length) {
        [...list.children].forEach(card => card.classList.add('is-shade'));
        setTimeout(swap, 160);
    } else {
        swap();
    }
}

function ways(options) {
    const list = document.querySelector('[data-rf-lay]');
    const title = document.querySelector('[data-rf-lay-title]');
    const all = document.querySelector('[data-rf-lay-all]');
    if (!list || !title) return;
    const best = list.innerHTML;
    const bestTitle = title.textContent;
    let current = 'best';
    let pending = 0;

    const show = async link => {
        const id = link ? link.dataset.rfWay : 'best';
        if (id === current) return;
        current = id;
        document.querySelectorAll('.rf-way.is-lit').forEach(way => way.classList.remove('is-lit'));
        if (!link) {
            list.replaceChildren(fragment(best));
            title.textContent = bestTitle;
            all.hidden = true;
            list.dispatchEvent(new CustomEvent(CARDS_EVENT, { bubbles: true }));
            return;
        }
        link.classList.add('is-lit');
        let found;
        try {
            found = await bestOf(id, 6);
        } catch (error) {
            return;
        }
        if (current !== id || !found.products.length) return;
        lay(list, found.products, options);
        title.innerHTML = '';
        title.append(document.createTextNode(`${link.dataset.rfWayName} `));
        const back = document.createElement('button');
        back.className = 'rf-lay__back';
        back.type = 'button';
        back.dataset.rfLayBack = '';
        back.textContent = bestTitle;
        title.append(back);
        all.querySelector('span').textContent = allWords(link);
        all.setAttribute('href', link.getAttribute('href'));
        all.hidden = false;
    };

    document.querySelectorAll('[data-rf-way]').forEach(link => {
        link.addEventListener('pointerenter', () => {
            if (!fine.matches) return;
            clearTimeout(pending);
            pending = setTimeout(() => show(link), 140);
        });
        link.addEventListener('pointerleave', () => clearTimeout(pending));
        link.addEventListener('focus', () => {
            clearTimeout(pending);
            show(link);
        });
    });
    title.addEventListener('click', event => {
        if (!event.target.closest('[data-rf-lay-back]')) return;
        show(null);
        announce(word('showing_best'));
        title.tabIndex = -1;
        title.focus();
    });
}

function moss(options) {
    const band = document.querySelector('[data-rf-species]');
    const region = band && band.querySelector('[data-rf-sp-region]');
    const species = band ? [...band.querySelectorAll('[data-rf-sp]')] : [];
    if (!region || !species.length) return;
    const list = region.querySelector('[data-rf-sp-lay]');
    const title = region.querySelector('[data-rf-sp-title]');
    const all = region.querySelector('[data-rf-sp-all]');
    let current = null;
    let pending = 0;

    const show = async link => {
        const id = link.dataset.rfSp;
        if (id === current) return;
        current = id;
        let found;
        try {
            found = await bestOf(id, 3);
        } catch (error) {
            return;
        }
        if (current !== id || !found.products.length) return;
        species.forEach(other => other.classList.toggle('is-lit', other === link));
        lay(list, found.products, options);
        title.textContent = link.dataset.rfSpName;
        all.querySelector('span').textContent = allWords(link);
        all.setAttribute('href', link.getAttribute('href'));
        region.hidden = false;
    };

    const wide = window.matchMedia('(min-width: 1040px)');
    const begin = () => {
        if (!wide.matches || !fine.matches || current) return;
        show(species[0]);
    };
    new IntersectionObserver((entries, observer) => {
        if (entries.some(entry => entry.isIntersecting)) {
            observer.disconnect();
            begin();
            wide.addEventListener('change', begin);
        }
    }, { rootMargin: '600px 0px' }).observe(band);

    species.forEach(link => {
        link.addEventListener('pointerenter', () => {
            if (!fine.matches || !wide.matches) return;
            clearTimeout(pending);
            pending = setTimeout(() => show(link), 140);
        });
        link.addEventListener('pointerleave', () => clearTimeout(pending));
        link.addEventListener('focus', () => { if (wide.matches) show(link); });
    });
}

const inRuns = (runs, month) => runs.split(',').some(run => {
    const [from, to] = run.split('-').map(Number);
    return month >= from && month <= to;
});

function thisMonth() {
    const chart = document.querySelector('[data-rf-hatch-chart]');
    if (!chart) return;
    const month = new Date().getMonth();
    const lit = chart.querySelector('.rf-months__m.is-now');
    if (lit && Number(lit.dataset.rfM) === month) return;
    chart.style.setProperty('--rf-now', month);
    chart.querySelectorAll('.rf-months__m').forEach(m => m.classList.toggle('is-now', Number(m.dataset.rfM) === month));
    const names = [];
    chart.querySelectorAll('.rf-hatch__row').forEach(row => {
        const on = inRuns(row.dataset.rfRuns || '', month);
        row.classList.toggle('is-now', on);
        row.querySelectorAll('.rf-track__m').forEach(cell => cell.classList.toggle('is-now', Number(cell.dataset.rfM) === month));
        const details = row.querySelector('details');
        if (details) details.toggleAttribute('open', on);
        if (on) names.push(row.querySelector('.rf-hatch__title').textContent.trim());
    });
    const monthName = new Date(2000, month, 1).toLocaleString('en-CA', { month: 'long' });
    document.querySelectorAll('[data-rf-now-month]').forEach(el => el.replaceChildren(monthName));
    const said = names.map((name, i) => (i === 0 ? name : name.toLowerCase()));
    let sentence = word('quiet');
    if (said.length > 1) sentence = `${said.slice(0, -1).join(', ')} ${word('and')} ${said[said.length - 1]}.`;
    else if (said.length) sentence = `${said[0]}.`;
    document.querySelectorAll('[data-rf-now-list]').forEach(el => el.replaceChildren(sentence));
}

export function start(context = {}) {
    const options = { quickAdd: context.rfQuickAdd !== false, money: context.rfMoney || '$' };
    ways(options);
    moss(options);
    thisMonth();
}
