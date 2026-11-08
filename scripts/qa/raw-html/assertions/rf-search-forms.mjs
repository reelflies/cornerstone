// The ReelFlies search form in the server HTML (ticket 30; redesign step 3; spec modules 4 and 5;
// stories 1 and 3), on every page: each form (components/reelflies/search-form.html,
// form[data-rf-search]) works with no script, and quick-search.js has what it binds.
//
// - Every page has at least one: the header's. The 404 page has a second (not-found.html).
// - Each is a <form role="search"> that GETs a real action (stock's had only data-url and
//   submitted through script), holding one field named search_query, type search, with an id
//   its <label> names, and one submit button, so Enter lands on the search page with
//   JavaScript off.
// - Each holds its suggestions panel (data-rf-suggest), hidden and empty: quick-search.js fills
//   it from the Storefront API after two characters.
// - None carries stock quick-search.js's hooks (data-quick-search-form, data-search-quick), and
//   the field carries no combobox attributes: the simple model (critique, aria-allowed-attr).
// - Each field's id is used once on the page, so the labels hold.
//
// Retired with the redesign: the phone search row (the header's form is full width on phones).

import {
    decodeHtml, findTags, elementsHtml, textOf,
} from '../html.mjs';

const STOCK_HOOKS = ['data-quick-search-form', 'data-search-quick'];
const COMBOBOX = ['aria-expanded', 'aria-controls', 'aria-activedescendant', 'aria-autocomplete', 'aria-owns'];

function formProblems(html, form, index) {
    const [tag] = findTags(form, 'form');
    const label = `search form ${index + 1}`;
    const problems = [];
    if (tag.attrs.role !== 'search') problems.push(`${label} isn't role="search"`);
    const action = decodeHtml(tag.attrs.action || '').trim();
    if (!action || action === '#') problems.push(`${label} has no action, so it can't submit without script`);
    if ((tag.attrs.method || 'get').toLowerCase() !== 'get') problems.push(`${label} submits with ${tag.attrs.method}, not GET`);
    const fields = findTags(form, 'input').filter(input => input.attrs.name === 'search_query');
    if (fields.length !== 1) problems.push(`${label} holds ${fields.length} fields named search_query, not 1`);
    for (const field of fields) {
        if (field.attrs.type !== 'search') problems.push(`${label}'s field is type="${field.attrs.type}", not search`);
        if (!field.attrs.id) problems.push(`${label}'s field has no id for its label`);
        else {
            const labels = elementsHtml(form, 'label', attrs => attrs.for === field.attrs.id);
            if (labels.length !== 1 || !textOf(labels[0])) problems.push(`${label}'s field has no label naming it (label[for="${field.attrs.id}"])`);
            if (findTags(html).filter(each => each.attrs.id === field.attrs.id).length !== 1) problems.push(`${label}'s field id "${field.attrs.id}" is on the page more than once`);
        }
        if (field.attrs.role === 'combobox') problems.push(`${label}'s field is a combobox: quick search uses a plain search field`);
        for (const attr of COMBOBOX) if (attr in field.attrs) problems.push(`${label}'s field carries ${attr}: quick search uses a plain search field`);
    }
    if (findTags(form, 'button').filter(button => (button.attrs.type || 'submit') === 'submit').length !== 1) problems.push(`${label} has no one submit button`);
    const panels = elementsHtml(form, 'div', attrs => 'data-rf-suggest' in attrs);
    if (panels.length !== 1) problems.push(`${label} has ${panels.length} suggestions panels (data-rf-suggest), not 1`);
    else if (!('hidden' in findTags(panels[0], 'div')[0].attrs) || textOf(panels[0]) || findTags(panels[0]).length > 1) problems.push(`${label}'s suggestions panel isn't empty and hidden: quick-search.js fills it`);
    for (const inner of findTags(form)) {
        for (const hook of STOCK_HOOKS) if (hook in inner.attrs) problems.push(`${label} carries stock quick-search.js's ${hook}`);
    }
    return problems;
}

export function searchFormProblems(html) {
    const forms = elementsHtml(html, 'form', attrs => 'data-rf-search' in attrs);
    if (!forms.length) return ['no ReelFlies search form (form[data-rf-search]) on the page: the header carries one on every page'];
    return forms.flatMap((form, index) => formProblems(html, form, index));
}

export default {
    id: 'rf-search-forms',
    ticket: 30,
    description: 'a ReelFlies search form on every page, each a real GET with role search, one labelled search_query field, one submit, its suggestions panel empty and hidden, and no stock or combobox hooks',
    check(page) {
        return searchFormProblems(page.html);
    },
};
