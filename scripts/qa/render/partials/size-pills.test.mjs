// The size pills (ticket 37; spec modules 15 and 16; O14, O15, R9, UX-10, UX-21; stories 15, 37,
// 38, 39, 68 and 70): stock products/options/set-rectangle.html's hook
// (components/reelflies/size-pills.html), and product-view.html's, on option contexts shaped as
// BigCommerce's (product.options, each with its values); in the cart's Change dialog
// (cart/modals/configure-product.html), where the line's own value stays checked; and against
// stock's own block, kept unrendered below the hook.
//
//   node --test scripts/qa/render/partials/size-pills.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findTags, outerHtml, textOf } from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR, renderPartial } from '../render.mjs';

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

describe('which option is the size', () => {
    it('is the one named as the Fly size facet (size-facet-name.html), in any case, and is marked data-rf-pills="size"', async () => {
        const marker = html => findTags(html, 'div').find(tag => tag.attrs.role === 'radiogroup').attrs['data-rf-pills'];
        assert.equal(marker(await option(SIZES)), 'size');
        assert.equal(marker(await option({ ...SIZES, display_name: 'fly sizes' })), 'size');
        assert.equal(marker(await option(COLOUR)), '');
        const box = await option({ ...SIZES, display_name: 'Box Size' });
        assert.equal(marker(box), '');
        assert.equal(findTags(box, 'a').filter(tag => tag.attrs.href === '/fly-hook-size-chart/').length, 0);
        assert.deepEqual(radios(box).map(tag => 'checked' in tag.attrs), [false, true, false], 'not a size: stock\'s choice kept');
    });

    it('keeps stock\'s "(Required)" for screen readers and setProductVariant, which reads it, where "choose one" says it on screen', async () => {
        const label = outerHtml(await option(SIZES), 'span', attrs => /rf-pills-label/.test(attrs.class || ''));
        assert.match(outerHtml(label, 'span', attrs => attrs.class === 'is-srOnly'), /\(Required\)/);
    });
});

describe('the cart\'s Change dialog (cart/modals/configure-product.html)', () => {
    it('keeps the line\'s own size checked and named, with a label id from the option alone', async () => {
        const html = await renderPartial('components/cart/modals/configure-product', {
            product_name: 'Fat Albert', quote_item_id: 'line-1', options: [SIZES, COLOUR],
        });
        const sizes = radios(html).filter(tag => tag.attrs.name === 'attribute[117]');
        assert.deepEqual(sizes.map(tag => 'checked' in tag.attrs), [false, true, false]);
        assert.ok('data-default' in sizes[1].attrs, 'CartItemDetails reads [data-default]');
        const group = findTags(html, 'div').find(tag => tag.attrs.role === 'radiogroup' && tag.attrs['data-rf-pills'] === 'size');
        assert.equal(group.attrs['aria-labelledby'], 'rf-option-117-label');
        assert.equal(textOf(outerHtml(html, 'span', attrs => 'data-option-value' in attrs)), '14');
        assert.doesNotMatch(html, /undefined/);
    });
});

describe('against stock\'s own block (kept below the hook, unrendered)', () => {
    it('gives each radio and label the attributes stock\'s block gives them, with the same values', () => {
        const source = fs.readFileSync(path.join(THEME_DIR, 'templates/components/products/options/set-rectangle.html'), 'utf8');
        const stock = source.slice(source.indexOf('{{#if false}}'));
        const ours = fs.readFileSync(path.join(THEME_DIR, 'templates/components/reelflies/size-pills.html'), 'utf8');
        // The value radios' and labels' static attributes, as written: name="value" pairs.
        const pairs = (html, tag, marker) => {
            const element = html.match(new RegExp(`<${tag}\\s[^>]*${marker}[^>]*>`, 's'))[0];
            return Object.fromEntries([...element.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, text]) => [name, text]));
        };
        const stockRadio = pairs(stock, 'input', 'value="{{id}}"');
        const ourRadio = pairs(ours, 'input', 'value="{{id}}"');
        for (const [name, text] of Object.entries(stockRadio)) assert.equal(ourRadio[name], text, `the radio's ${name}`);
        const stockLabel = pairs(stock, 'label', 'data-product-attribute-value');
        const ourLabel = pairs(ours, 'label', 'data-product-attribute-value');
        for (const [name, text] of Object.entries(stockLabel)) {
            if (name === 'class') assert.ok(text.split(/\s+/).every(part => ourLabel.class.split(/\s+/).includes(part)), `the label's classes ${text}`);
            else assert.equal(ourLabel[name], text, `the label's ${name}`);
        }
    });
});
