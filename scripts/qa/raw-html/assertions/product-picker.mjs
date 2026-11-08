// The product page's size picker in the server HTML (redesign step 3; the owner's choice of
// 2026-11-07, in place of ticket 37's pills; DESIGN.md "Size Picker"; tickets 37 and 38's rule:
// nothing is ever chosen for the shopper), on every product pin:
//
// - At most one picker (div[data-rf-pick-page], components/reelflies/product-picker.html), in
//   mode "sizes" (a row per choice) or "one" (a product with no options: one row, "How many").
// - Every quantity field in it (input[data-rf-qty]) reads 0 and every "−" is disabled: each
//   number is what the box holds, read in the browser, so the server never puts a fly in the box
//   and a cached page never shows another shopper's. Nothing in it is checked or pressed.
// - Each row (li[data-rf-row]) names its variant (data-rf-variant) and its stock (data-rf-stock 1
//   or 0); a sold-out row (data-rf-stock="0") says so and has no field or button.
// - With the picker, stock's form (.rf-pdp__form) is hidden behind it (data-rf-pdp-form); without
//   it (two options, a pre-order, a minimum quantity, prices hidden), the form is shown.
// - In the options the shopper sees (the shown form, data-product-option-change), no radio of a
//   group with more than one value is checked: the catalogue's default size is never chosen for
//   the shopper. (A hidden form's checked default is stock's; the picker buys instead.)
//
// Channel 1's product@sizes pin (Fat Albert, two options) is where the form rules bite; the
// product and product@reviews pins have the picker.

import {
    decodeHtml, elementsHtml, findTags, markupOnly, outerHtml, textOf,
} from '../html.mjs';

const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
const has = name => attrs => name in attrs;

function pickerProblems(picker) {
    const problems = [];
    const [root] = findTags(picker, 'div');
    const mode = root.attrs['data-rf-mode'];
    if (!['sizes', 'one'].includes(mode)) problems.push(`the picker's mode is "${mode}", not sizes or one`);
    const rows = elementsHtml(picker, 'li', has('data-rf-row'));
    if (!rows.length) problems.push('a picker with no row');
    if (mode === 'one' && rows.length !== 1) problems.push(`${rows.length} rows in a picker for a product with no options, not one`);
    for (const row of rows) {
        const [tag] = findTags(row, 'li');
        const label = decodeHtml(tag.attrs['data-rf-label'] || '') || 'the one row';
        if (!/^\d+$/.test(tag.attrs['data-rf-variant'] || '')) problems.push(`row ${label} names no variant (data-rf-variant)`);
        const stock = tag.attrs['data-rf-stock'];
        if (!['0', '1'].includes(stock)) problems.push(`row ${label}'s stock is "${stock}", not 0 or 1`);
        const fields = findTags(row, 'input');
        if (stock === '0') {
            if (fields.length || findTags(row, 'button').length) problems.push(`row ${label} is sold out and has a stepper`);
            if (!textOf(outerHtml(row, 'span', classed('rf-pick__sold')) || '')) problems.push(`row ${label} is sold out and doesn't say so`);
        } else if (fields.length !== 1 || !('data-rf-qty' in fields[0].attrs)) {
            problems.push(`row ${label} has ${fields.length} quantity fields, not one`);
        }
    }
    for (const field of findTags(picker, 'input').filter(tag => 'data-rf-qty' in tag.attrs)) {
        if (field.attrs.value !== '0') problems.push(`a quantity field reads "${field.attrs.value}", not 0: the server chose for the shopper, or cached a box`);
    }
    for (const button of findTags(picker, 'button').filter(tag => tag.attrs['data-rf-qty-step'] === '-1')) {
        if (!('disabled' in button.attrs)) problems.push('a "−" is enabled at 0');
    }
    if (findTags(picker).some(tag => 'checked' in tag.attrs || tag.attrs['aria-pressed'] === 'true' || tag.attrs['aria-checked'] === 'true')) problems.push('something in the picker is checked or pressed before the shopper chose');
    return problems;
}

function formProblems(markup, pickers) {
    const forms = findTags(markup, 'div').filter(tag => classed('rf-pdp__form')(tag.attrs));
    if (forms.length !== 1) return [`${forms.length} form wrappers (.rf-pdp__form), not one`];
    const [form] = forms;
    const hidden = 'hidden' in form.attrs;
    const problems = [];
    if (pickers.length && !hidden) problems.push('stock\'s form is shown beside the picker: it hides behind it (data-rf-pdp-form)');
    if (!pickers.length && hidden) problems.push('stock\'s form is hidden with no picker to buy with');
    if (hidden) return problems;
    const shown = outerHtml(markup, 'div', classed('rf-pdp__form')) || '';
    for (const options of elementsHtml(shown, 'div', has('data-product-option-change'))) {
        const groups = new Map();
        for (const radio of findTags(options, 'input').filter(tag => tag.attrs.type === 'radio' && tag.attrs.value)) {
            const group = groups.get(radio.attrs.name) || { values: 0, checked: [] };
            group.values += 1;
            if ('checked' in radio.attrs) group.checked.push(radio.attrs.value);
            groups.set(radio.attrs.name, group);
        }
        for (const [name, group] of groups) {
            if (group.values > 1 && group.checked.length) problems.push(`the option ${name} has ${group.values} values and one checked (${group.checked.join(', ')}) before the shopper chose: nothing is chosen for the shopper`);
        }
    }
    return problems;
}

export function productPickerProblems(html) {
    const markup = markupOnly(html);
    // The harness's own fixture pages (raw-html/fixtures/) are product pages with no product view.
    if (!findTags(markup, 'div').some(tag => classed('productView')(tag.attrs))) return [];
    const pickers = elementsHtml(markup, 'div', has('data-rf-pick-page'));
    if (pickers.length > 1) return [`${pickers.length} size pickers (data-rf-pick-page), not one`];
    return [...pickers.flatMap(pickerProblems), ...formProblems(markup, pickers)];
}

export default {
    id: 'product-picker',
    ticket: 37,
    description: 'the product page\'s size picker chooses nothing for the shopper: every quantity 0 and "−" disabled, each row with its variant and stock, a sold-out row with no stepper; stock\'s form hidden behind the picker, or shown with no option pre-checked',
    pages: ['product'],
    check(page) {
        return productPickerProblems(page.html);
    },
};
