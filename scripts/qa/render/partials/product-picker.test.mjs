// The product page's size picker (redesign step 3; the owner's choice of 2026-11-07, in place of
// ticket 37's pills; DESIGN.md "Size Picker"; tickets 37 and 38's rule that nothing is ever chosen
// for the shopper): components/reelflies/product-buy.html decides how the page buys, and
// product-picker.html draws the rows on the server from pages/product.html's GraphQL front matter
// (product-picker-cell.html, product-picker-row.html), before product-buy.js redraws them in hook
// order with size-picker.js's markup. Rendered on the fixture page's product, the reference's
// Adams Parachute (render/pages/product-page/fixtures/adams.json), with the GraphQL answer built
// from its options (product-page/context.mjs).
//
// Retired with the pills: the radiogroup and its label ids, "Hook size guide", the "(sold out)"
// tags size-pills.js filled, and the cart's Change dialog, which is stock's again.
//
//   node --test scripts/qa/render/partials/product-picker.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    decodeHtml, elementsHtml, findTags, outerHtml, textOf,
} from '../../raw-html/html.mjs';
import { unbalancedTags } from '../html-checks.mjs';
import { THEME_DIR } from '../render.mjs';
import {
    CONTEXT, TWO_OPTIONS, WEIGHTS, productPage, variantId,
} from './product-page/context.mjs';

const has = name => attrs => name in attrs;
const classed = name => attrs => new RegExp(`(^|\\s)${name}(\\s|$)`).test(attrs.class || '');
// The same tests on a tag findTags lists.
const tagHas = name => tag => has(name)(tag.attrs);
const tagClassed = name => tag => classed(name)(tag.attrs);
const picker = html => outerHtml(html, 'div', has('data-rf-pick-page'));
const rows = html => elementsHtml(picker(html) || '', 'li', has('data-rf-row'));
const rowTag = row => findTags(row, 'li')[0].attrs;
const form = html => outerHtml(html, 'div', classed('rf-pdp__form'));
const foot = html => textOf(outerHtml(picker(html) || '', 'span', has('data-rf-pick-foot')) || '');
const radios = html => findTags(html, 'input').filter(tag => tag.attrs.type === 'radio');
const SIZES = CONTEXT.product.options[0].values.map(value => value.label);
const GEAR = { category: ['Fly Gear', 'Fly Gear/Leaders'], options: WEIGHTS };

describe('the picker (components/reelflies/product-picker.html, through product-buy.html)', () => {
    it('draws a row for every size in the catalogue\'s order, each with the variant and the stock the GraphQL answer gives it', async () => {
        const html = await productPage({ stock: { soldOut: ['20'] } });
        const root = picker(html);
        assert.ok(root, 'the picker');
        const [tag] = findTags(root, 'div');
        assert.equal(tag.attrs['data-rf-mode'], 'sizes');
        assert.equal(tag.attrs['data-rf-product'], '4877');
        assert.equal(decodeHtml(tag.attrs['data-rf-name']), CONTEXT.product.title);
        assert.equal(tag.attrs['data-rf-url'], CONTEXT.product.url);
        assert.equal(tag.attrs['data-rf-price'], '0.95');
        assert.match(tag.attrs['data-rf-img'], /\/stencil\/160w\/products\/4877\//);
        assert.deepEqual(rows(html).map(row => rowTag(row)['data-rf-label']), SIZES, 'catalogue order: product-buy.js puts them in hook order');
        assert.deepEqual(rows(html).map(row => rowTag(row)['data-rf-variant']), SIZES.map((_, index) => String(variantId(index))));
        assert.deepEqual(rows(html).map(row => rowTag(row)['data-rf-stock']), ['1', '1', '1', '1', '1', '1', '0']);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('chooses nothing for the shopper: every quantity reads 0, "−" is disabled, and nothing is checked, even with a catalogue default', async () => {
        const withDefault = { options: [{ ...CONTEXT.product.options[0], values: CONTEXT.product.options[0].values.map(value => ({ ...value, selected: value.label === '10' })) }] };
        for (const product of [{}, withDefault]) {
            const html = await productPage({ product }); // eslint-disable-line no-await-in-loop
            const fields = findTags(picker(html), 'input').filter(tagHas('data-rf-qty'));
            assert.equal(fields.length, SIZES.length);
            for (const field of fields) assert.equal(field.attrs.value, '0');
            const steps = findTags(picker(html), 'button').filter(tagHas('data-rf-qty-step'));
            assert.deepEqual(steps.map(tag => [tag.attrs['data-rf-qty-step'], 'disabled' in tag.attrs]), SIZES.flatMap(() => [['-1', true], ['1', false]]));
            assert.ok(!findTags(picker(html)).some(tag => 'checked' in tag.attrs || 'data-default' in tag.attrs || 'aria-pressed' in tag.attrs || 'aria-checked' in tag.attrs), 'no size marked');
            assert.ok(!rows(html).some(row => /is-selected|is-current/.test(rowTag(row).class)), 'no row marked');
        }
    });

    it('says a sold-out size is sold out, with no field, and names it in the foot: one size, several, every size, or none', async () => {
        const one = await productPage({ stock: { soldOut: ['20'] } });
        const sold = rows(one).find(row => rowTag(row)['data-rf-stock'] === '0');
        assert.match(rowTag(sold).class, /(^|\s)is-sold(\s|$)/);
        assert.equal(textOf(outerHtml(sold, 'span', classed('rf-pick__sold'))), 'Sold out');
        assert.equal(findTags(sold, 'input').length + findTags(sold, 'button').length, 0, 'no stepper');
        assert.equal(foot(one), 'Size 20 is sold out.');
        assert.equal(foot(await productPage({ stock: { soldOut: ['18', '20'] } })), 'Sizes 18, 20 are sold out.');
        assert.equal(foot(await productPage({ stock: { soldOut: SIZES } })), 'Every size is sold out.');
        assert.equal(foot(await productPage()), '');
        assert.equal(foot(await productPage({ stock: { unpurchasable: ['8'] } })), 'Size 8 is sold out.', 'a variant the store won\'t sell counts as sold out');
    });

    it('draws nothing for a choice with no variant, and leaves it out of the count', async () => {
        const html = await productPage({ stock: { missing: ['12'], soldOut: ['20'] } });
        assert.deepEqual(rows(html).map(row => rowTag(row)['data-rf-label']), SIZES.filter(size => size !== '12'));
        assert.equal(foot(html), 'Size 20 is sold out.');
    });

    it('ends the foot on a fly with the gloss and "What do sizes mean?" to the hook size chart, from the setting or its default path', async () => {
        const html = await productPage();
        const end = outerHtml(picker(html), 'div', classed('rf-pick__foot'));
        assert.match(textOf(end), /Bigger number, smaller hook\. What do sizes mean\?$/);
        const [link] = findTags(end, 'a');
        assert.equal(link.attrs.href, '/fly-hook-size-chart/');
        assert.match(link.attrs.class, /(^|\s)rf-more(\s|$)/);
        assert.equal(findTags(outerHtml(picker(await productPage({ theme: { rf_hook_chart_url: ' /hooks/ ' } })), 'div', classed('rf-pick__foot')), 'a')[0].attrs.href, '/hooks/');
        const hint = outerHtml(picker(html), 'p', classed('rf-pick__hint'));
        assert.equal(textOf(hint), 'Set how many of each size. They go straight into your box.');
        const [list] = findTags(picker(html), 'ul');
        assert.equal(list.attrs['aria-describedby'], findTags(hint, 'p')[0].attrs.id);
        assert.equal(list.attrs['aria-label'], 'Fly Sizes');
    });

    it('words a choice that isn\'t a hook size as itself, with no gloss and no chart link', async () => {
        const html = await productPage({ product: GEAR, theme: { rf_price_unit_exclude: 'Fly Gear' } });
        assert.deepEqual(rows(html).map(row => textOf(outerHtml(row, 'span', classed('rf-pick__label')))), ['4X', '5X']);
        assert.equal(textOf(outerHtml(picker(html), 'p', classed('rf-pick__hint'))), 'Set how many of each. They go straight into your box.');
        const end = outerHtml(picker(html), 'div', classed('rf-pick__foot'));
        assert.equal(textOf(end), '');
        assert.equal(findTags(end, 'a').length, 0);
        // The server names every choice "size …"; product-buy.js's redraw words a choice that isn't a
        // hook size as itself (size-picker.js's whatOf, in its Jest spec) before the shopper can use it.
        assert.deepEqual(findTags(picker(html), 'button').map(tag => tag.attrs['aria-label']).slice(0, 2), ['One fewer, size 4X', 'One more, size 4X']);
    });

    it('labels each stepper for its size, the field numeric and three digits at most, and tags it for quantity.js', async () => {
        const [first] = rows(await productPage());
        assert.deepEqual(findTags(first, 'button').map(tag => [tag.attrs.type, tag.attrs['aria-label']]), [['button', 'One fewer, size 8'], ['button', 'One more, size 8']]);
        const [field] = findTags(first, 'input');
        assert.equal(field.attrs['aria-label'], 'How many, size 8');
        assert.equal(field.attrs.type, 'text');
        assert.equal(field.attrs.inputmode, 'numeric');
        assert.equal(field.attrs.pattern, '[0-9]*');
        assert.equal(field.attrs.maxlength, '3');
        assert.equal(field.attrs.autocomplete, 'off');
        assert.deepEqual([field.attrs['data-rf-variant'], field.attrs['data-rf-label'], field.attrs['data-rf-what']], [String(variantId(0)), '8', 'size 8']);
        assert.ok(findTags(first, 'span').some(tagClassed('rf-sz__step')), 'the step bar, which product-buy.js sizes');
    });

    // quantity.js reads each field's data-rf-product (productIdOf), but product-picker-row.html
    // writes {{product.id}} inside the values loop, where the page's product is out of scope, so the
    // server's fields carry data-rf-product="": product-buy.js's redraw masks it. A theme finding;
    // this case fails until the row reads the id the picker's root carries.
    it('carries the product\'s id on every quantity field, as quantity.js reads it', async () => {
        const html = await productPage();
        const fields = findTags(picker(html), 'input').filter(tagHas('data-rf-qty'));
        assert.equal(fields.length, SIZES.length);
        assert.deepEqual(fields.map(field => field.attrs['data-rf-product']), SIZES.map(() => '4877'));
    });

    it('gives a product with no options one row, "How many", and carries the base variant\'s stock on the picker', async () => {
        const html = await productPage({ product: { options: [], category: ['Fly Selections & Fly Boxes/Bulk Fly Selections'] }, theme: { rf_price_unit_exclude: 'Fly Selections & Fly Boxes' } });
        const [root] = findTags(picker(html), 'div');
        assert.equal(root.attrs['data-rf-mode'], 'one');
        assert.equal(root.attrs['data-rf-variant'], String(variantId(0)));
        assert.equal(root.attrs['data-rf-stock'], '1');
        const list = rows(html);
        assert.equal(list.length, 1);
        assert.match(rowTag(list[0]).class, /(^|\s)rf-pick__row--one(\s|$)/);
        assert.equal(textOf(outerHtml(list[0], 'span', classed('rf-pick__label'))), 'How many');
        assert.deepEqual(findTags(list[0], 'button').map(tag => tag.attrs['aria-label']), ['One fewer', 'One more']);
        assert.equal(findTags(list[0], 'input')[0].attrs['aria-label'], 'How many');
        assert.equal(findTags(list[0], 'input')[0].attrs.value, '0');
        assert.equal(findTags(picker(html), 'p').filter(tagClassed('rf-pick__hint')).length, 0, 'no hint');
        assert.equal(outerHtml(picker(html), 'div', classed('rf-pick__foot')), null, 'no foot');
        const sold = await productPage({ product: { options: [] }, stock: { soldOut: ['any'] } });
        assert.equal(findTags(picker(sold), 'div')[0].attrs['data-rf-stock'], '0');
        assert.equal(textOf(outerHtml(rows(sold)[0], 'span', classed('rf-pick__sold'))), 'Sold out');
    });

    it('reserves the "In your box" line under the rows, empty on the server: a cached page never shows another shopper\'s box', async () => {
        const line = outerHtml(picker(await productPage()), 'p', has('data-rf-pick-inbox'));
        assert.ok(line, 'the line');
        assert.equal(textOf(line), '');
        assert.match(findTags(line, 'p')[0].attrs.class, /(^|\s)rf-pick__inbox(\s|$)/);
    });

    it('keeps stock\'s form on the page, hidden, with the hooks stock product-details.js reads, so the page still buys if the script fails', async () => {
        const html = await productPage();
        const box = form(html);
        const [wrapper] = findTags(box, 'div');
        assert.ok('hidden' in wrapper.attrs);
        assert.ok('data-rf-pdp-form' in wrapper.attrs);
        assert.ok(findTags(box, 'form').some(tagHas('data-cart-item-add')));
        assert.ok(findTags(box, 'input').some(tag => tag.attrs.name === 'product_id' && tag.attrs.value === '4877'));
        assert.ok(findTags(box, 'div').some(tagHas('data-product-option-change')));
        assert.ok(findTags(box, 'input').some(tag => tag.attrs.id === 'form-action-addToCart'));
        assert.equal(radios(box).length, SIZES.length);
        assert.equal(radios(box).filter(tag => 'checked' in tag.attrs).length, 0);
        assert.ok(html.indexOf('data-rf-pick-page') < html.indexOf('data-rf-pdp-form'), 'the picker first, the form after it');
    });

    it('measures the stepper\'s buttons and field at the 44px tap minimum (step 4\'s critique)', () => {
        const scss = fs.readFileSync(path.join(THEME_DIR, 'assets/scss/reelflies/_fly.scss'), 'utf8');
        assert.match(scss, /\.rf-qty__btn \{[^}]*width: var\(--rf-tap-min\);[^}]*height: var\(--rf-tap-min\);/s);
        assert.match(scss, /\.rf-qty__input \{[^}]*height: var\(--rf-tap-min\);/s);
        assert.match(fs.readFileSync(path.join(THEME_DIR, 'assets/scss/reelflies/_settings.scss'), 'utf8'), /\$rf-tap-min:\s*44px;/);
    });
});

describe('when the page buys through stock\'s form instead (product-buy.html\'s rule)', () => {
    const formShown = html => {
        const [wrapper] = findTags(form(html), 'div');
        return !('hidden' in wrapper.attrs) && !('data-rf-pdp-form' in wrapper.attrs);
    };

    it('two options (Fat Albert\'s Colour and Fly Sizes): no picker, the form shown with stock\'s rectangles for both', async () => {
        const html = await productPage({ product: { options: TWO_OPTIONS } });
        assert.equal(picker(html), null);
        assert.ok(formShown(html));
        assert.equal(findTags(form(html), 'div').filter(tag => tag.attrs['data-product-attribute'] === 'set-rectangle').length, 2);
        assert.equal(radios(form(html)).length, 4);
        assert.deepEqual(unbalancedTags(html), []);
    });

    it('a pre-order, a minimum quantity over 1, prices hidden from guests, or the picker switched off (rf_size_strip)', async () => {
        for (const [why, options] of [
            ['a pre-order', { product: { pre_order: true } }],
            ['a minimum of 3', { product: { min_purchase_quantity: 3 } }],
            ['prices hidden from guests', { settings: { hide_price_from_guests: true } }],
            ['the picker off', { theme: { rf_size_strip: false } }],
        ]) {
            const html = await productPage(options); // eslint-disable-line no-await-in-loop
            assert.equal(picker(html), null, why);
            assert.ok(formShown(html), why);
        }
        assert.ok(picker(await productPage({ settings: { hide_price_from_guests: true }, context: { customer: { id: 1 } } })), 'a signed-in customer gets the picker');
    });

    // The owner's rule holds here too, but stock set-rectangle.html checks the catalogue's default
    // value (`selected`), and the redesign hasn't brought ticket 37's no-preselection partial back
    // (CUSTOMIZATIONS.md, step 3). This case fails until it does: a theme finding, not a test's.
    it('checks no size for the shopper in stock\'s form either, when the catalogue has a default size', async () => {
        const withDefault = TWO_OPTIONS.map(option => (option.display_name === 'Fly Sizes' ? { ...option, values: option.values.map(value => ({ ...value, selected: value.label === '10' })) } : option));
        const html = await productPage({ product: { options: withDefault } });
        const sizes = radios(form(html)).filter(tag => tag.attrs.name === `attribute[${withDefault[1].id}]`);
        assert.equal(sizes.length, 2);
        assert.deepEqual(sizes.filter(radio => 'checked' in radio.attrs).map(radio => radio.attrs.value), [], 'the catalogue\'s default size comes pre-checked');
    });
});
