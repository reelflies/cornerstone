// The size pills (ticket 37; spec modules 15 and 16; O14, O15, R9, UX-10, UX-21; stories 15, 37,
// 38, 39, 68 and 70): stock products/options/set-rectangle.html's hook
// (components/reelflies/size-pills.html), and product-view.html's, on option contexts shaped as
// BigCommerce's (product.options, each with its values).
//
//   node --test scripts/qa/render/partials/size-pills.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, outerHtml, textOf } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { renderPartial } from '../render.mjs';

const value = (id, label, selected = false) => ({
    id, label, selected, data: label,
});
const SIZES = {
    id: 117, display_name: 'Fly Sizes', partial: 'set-rectangle', required: true, defaultValue: '', values: [value(301, '12'), value(302, '14', true), value(303, '16')],
};
const COLOUR = {
    id: 118, display_name: 'Colour', partial: 'set-rectangle', required: true, defaultValue: '', values: [value(401, 'Olive'), value(402, 'Black', true)],
};

// One option rendered as the product page renders it: after product-view.html's hook has set the
// product's id for the group's label, through stock set-rectangle.html's hook.
const PAGE = 'rf-test/option';
const option = (opt, productId = 4877) => renderPartial(PAGE, { option: opt, product_id: productId }, {
    overrides: { [PAGE]: "{{assignVar 'rf_product_id' product_id}}{{> components/products/options/set-rectangle option}}" },
});
const radios = html => findTags(html, 'input').filter(tag => tag.attrs.type === 'radio');

describe('the pills (components/reelflies/size-pills.html)', () => {
    it('keeps stock\'s radios and labels in a labelled radiogroup, the values the option value ids (ticket 42)', async () => {
        const html = await option(SIZES);
        const [group] = findTags(html, 'div').filter(tag => tag.attrs.role === 'radiogroup');
        assert.equal(group.attrs['data-product-attribute'], 'set-rectangle');
        const label = group.attrs['aria-labelledby'];
        assert.equal(findTags(html).filter(tag => tag.attrs.id === label).length, 1);
        assert.deepEqual(radios(html).map(tag => [tag.attrs.name, tag.attrs.value]), [['attribute[117]', '301'], ['attribute[117]', '302'], ['attribute[117]', '303']]);
        const labels = findTags(html, 'label').filter(tag => 'data-product-attribute-value' in tag.attrs);
        assert.deepEqual(labels.map(tag => [tag.attrs.for, tag.attrs['data-product-attribute-value']]), radios(html).map(tag => [tag.attrs.id, tag.attrs.value]));
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('names the group from the product and the option, never stock\'s fixed id, so two products\' pills differ (story 68)', async () => {
        const [first, second] = await Promise.all([option(SIZES, 4877), option(SIZES, 5663)]);
        const id = html => findTags(html, 'div').find(tag => tag.attrs.role === 'radiogroup').attrs['aria-labelledby'];
        assert.equal(id(first), 'rf-option-4877-117-label');
        assert.equal(id(second), 'rf-option-5663-117-label');
        assert.doesNotMatch(first, /rectangle-group-label/);
    });

    it('checks no size on a product with several, even the catalogue\'s "default size" (story 37)', async () => {
        const html = await option(SIZES);
        assert.equal(radios(html).filter(tag => 'checked' in tag.attrs).length, 0);
        assert.equal(textOf(outerHtml(html, 'span', attrs => 'data-option-value' in attrs)), 'choose one');
    });

    it('checks the only size of a single-size product, and shows it after the label', async () => {
        const html = await option({ ...SIZES, values: [value(301, '12')] });
        assert.deepEqual(radios(html).map(tag => 'checked' in tag.attrs), [true]);
        assert.equal(textOf(outerHtml(html, 'span', attrs => 'data-option-value' in attrs)), '12');
    });

    it('keeps another option\'s chosen value, as stock did', async () => {
        const html = await option(COLOUR);
        assert.deepEqual(radios(html).map(tag => 'checked' in tag.attrs), [false, true]);
    });

    it('links "Hook size guide" to the chart for a size option only (R9, SEO-7; story 15)', async () => {
        const guide = html => findTags(html, 'a').filter(tag => tag.attrs.href === '/fly-hook-size-chart/');
        assert.equal(guide(await option(SIZES)).length, 1);
        assert.equal(textOf(outerHtml(await option(SIZES), 'a', attrs => attrs.href === '/fly-hook-size-chart/')), 'Hook size guide');
        assert.equal(guide(await option(COLOUR)).length, 0);
    });

    it('carries a hidden "(sold out)" in each pill and the line\'s words for size-pills.js, with no hook drawing (story 39)', async () => {
        const html = await option(SIZES);
        const tags = findTags(html, 'span').filter(tag => 'data-rf-sold-out-tag' in tag.attrs);
        assert.equal(tags.length, 3);
        assert.ok(tags.every(tag => 'hidden' in tag.attrs));
        const [line] = findTags(html, 'p').filter(tag => 'data-rf-sold-out-line' in tag.attrs);
        assert.equal(line.attrs['data-rf-one'], 'Size # is sold out.');
        assert.equal(line.attrs['data-rf-many'], 'Sizes # are sold out.');
        assert.equal(findTags(html, 'svg').filter(tag => !/rf-pill-check/.test(tag.attrs.class || '')).length, 0);
    });
});
