// Quick search's forms in the server HTML (ticket 30; spec modules 4 and 5; stories 1 and 3), on
// every page: each ReelFlies search form (components/reelflies/search-form.html, data-rf-search-form)
// works with no script, and the phone search row is where it belongs.
//
// - Each form is a GET with a real action (stock's had only data-url and submitted through
//   script, quick-search.html:2), holding one field named search_query, so Enter lands on the
//   search page with JavaScript off.
// - None carries stock quick-search.js's hooks (data-quick-search-form, data-search-quick), and
//   its field carries no combobox attributes: the simple model (critique, aria-allowed-attr).
// - Each form's name is used once on the page, so its ids are unique.
// - The phone row (data-rf-search-form="phone", inside data-rf-phone-search) comes after the
//   header, at most once. On home, category and search pages that carry the header's search form
//   it is there; on product, cart, 404, brand, Web Page, sign-in and chart pages it isn't.

import { findTags, markupOnly, outerHtml } from '../html.mjs';

export const PHONE_ROW_ON = ['home', 'category', 'search'];
export const PHONE_ROW_NEVER = ['product', 'cart', '404', 'brand', 'page', 'login', 'create-account', 'hook-chart'];
const STOCK_HOOKS = ['data-quick-search-form', 'data-search-quick'];
const COMBOBOX = ['aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete', 'aria-owns'];

function formProblems(html, tag) {
    const name = tag.attrs['data-rf-search-form'];
    const label = `the search form "${name}"`;
    if (tag.name !== 'form') return [`${label} is a <${tag.name}>, not a <form>`];
    const problems = [];
    const action = (tag.attrs.action || '').trim();
    if (!action || action === '#') problems.push(`${label} has no action, so it can't submit without script`);
    if ((tag.attrs.method || 'get').toLowerCase() !== 'get') problems.push(`${label} submits with ${tag.attrs.method}, not GET`);
    const source = outerHtml(html, 'form', attrs => attrs['data-rf-search-form'] === name) || '';
    const fields = findTags(source, 'input').filter(input => input.attrs.name === 'search_query');
    if (fields.length !== 1) problems.push(`${label} holds ${fields.length} fields named search_query, not 1`);
    for (const inner of [tag, ...findTags(source)]) {
        for (const hook of STOCK_HOOKS) if (hook in inner.attrs) problems.push(`${label} carries stock quick-search.js's ${hook}`);
    }
    for (const field of fields) {
        if (field.attrs.role === 'combobox') problems.push(`${label}'s field is a combobox: quick search uses a plain search field`);
        for (const attr of COMBOBOX) if (attr in field.attrs) problems.push(`${label}'s field carries ${attr}: quick search uses a plain search field`);
    }
    return problems;
}

export function searchFormProblems(html, kind) {
    const forms = findTags(html).filter(tag => 'data-rf-search-form' in tag.attrs);
    const problems = forms.flatMap(tag => formProblems(html, tag));
    const names = forms.map(tag => tag.attrs['data-rf-search-form']);
    [...new Set(names.filter((name, index) => names.indexOf(name) !== index))]
        .forEach(name => problems.push(`the search form "${name}" is on the page more than once, so its ids repeat`));

    const phone = forms.filter(tag => tag.attrs['data-rf-search-form'] === 'phone');
    const rows = findTags(html).filter(tag => 'data-rf-phone-search' in tag.attrs);
    if (phone.length && PHONE_ROW_NEVER.includes(kind)) problems.push(`the phone search row is on the ${kind} page: it belongs on home, category and search pages only`);
    if (rows.length > 1) problems.push(`${rows.length} phone search rows (data-rf-phone-search), not 1`);
    if (rows.length === 1) {
        const row = outerHtml(html, 'div', attrs => 'data-rf-phone-search' in attrs) || '';
        if (!row.includes('data-rf-search-form="phone"')) problems.push('the phone search row holds no search form named phone');
        const header = outerHtml(html, 'header', attrs => 'data-rf-header' in attrs);
        const markup = markupOnly(html);
        if (header && header.includes('data-rf-phone-search')) problems.push('the phone search row is inside the <header>: it belongs after it, in normal flow, so it scrolls away');
        else if (header && markup.indexOf('data-rf-phone-search') < markup.indexOf(header)) problems.push('the phone search row comes before the <header>: it belongs after it');
    }
    const headerForm = forms.some(tag => tag.attrs['data-rf-search-form'] === 'header');
    if (headerForm && PHONE_ROW_ON.includes(kind) && !phone.length) problems.push(`no phone search row on the ${kind} page (components/reelflies/phone-search-row.html)`);
    return problems;
}

export default {
    id: 'rf-search-forms',
    ticket: 30,
    description: 'every ReelFlies search form a real GET with one search_query field and no stock or combobox hooks; the phone search row after the header on home, category and search pages only',
    check(page) {
        return searchFormProblems(page.html, page.kind);
    },
};
