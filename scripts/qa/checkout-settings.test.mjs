// Ticket 24's theme part of the checkout, as the redesign (Streamside Stone, DESIGN.md "Colors"
// and "Typography") sets it. BigCommerce's Optimized One-Page Checkout is branded through Theme
// Styles settings only (spec, Out of Scope), so these tests hold config.json's checkout keys: the
// base settings, which both variations share, as each variation resolves them.
//
// - The buy colour on the checkout button: beadhead copper, with a white label, deep copper on
//   hover and press (DESIGN.md "The Copper Is For Buying Rule"; the sage of decision 6 is gone).
// - Ink, ink muted, limestone and edge on everything else, so the checkout keeps none of stock
//   Cornerstone's greys and blues, and the page itself is limestone, the storefront's ground.
// - Archivo only (the Onest of decision 7 is gone): Archivo Expanded for the headings, Archivo for
//   the text, Archivo's medium cut for the buttons and links.
// - The logo: the current 133x95 PNG until ticket 14's master (decision 17), through the store
//   logo the checkout falls back to.
// - The keys that wait for Shaun's answers (ticket 24's HITL): the payment icons, the quick
//   payment buttons and the wallet buttons. They keep their stock values until he answers, and no
//   variation sets them. The checkout background was decided with the redesign: limestone, no image.
//
// scripts/check-contrast.mjs checks the colour pairs. The values here are the redesign's as of
// 2026-11-08, for the owner to confirm.
//
//   node --test scripts/qa/checkout-settings.test.mjs

import fs from 'fs';
import path from 'path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_DIR } from './render/render.mjs';
import { effectiveSettings } from '../release-diff.mjs';
import { FOCUS_RING, contrast } from '../check-contrast.mjs';

const read = file => fs.readFileSync(path.join(THEME_DIR, file), 'utf8');
const config = JSON.parse(read('config.json'));
const VARIATIONS = ['ReelFlies CA', 'ReelFlies US'];
// DESIGN.md's tokens the checkout keys hold as hex.
const COPPER = '#9c4a22'; // beadhead copper, the buy colour
const COPPER_DEEP = '#833d1b'; // hover and press on copper
const MIST = '#ebe4d8'; // text on shale
const WHITE = '#ffffff'; // specimen paper
const TRANSPARENT = 'transparent';

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
const lower = value => String(value).toLowerCase();
const forEachVariation = check => VARIATIONS.forEach(name => check(effectiveSettings(config, name), name));

// Each checkout colour key and the storefront key (or token) it follows. The checkout reads only
// optimized-checkout.css, so it can't share the storefront's keys; these keep it on the palette.
const FOLLOWS = {
    // The checkout button: copper, the buy colour, which the storefront's button--primary (ink,
    // for Search and the like) is not.
    'optimizedCheckout-buttonPrimary-backgroundColor': COPPER,
    'optimizedCheckout-buttonPrimary-backgroundColorHover': COPPER_DEEP,
    'optimizedCheckout-buttonPrimary-backgroundColorActive': COPPER_DEEP,
    'optimizedCheckout-buttonPrimary-borderColor': COPPER,
    'optimizedCheckout-buttonPrimary-color': WHITE,
    'optimizedCheckout-buttonPrimary-colorHover': WHITE,
    'optimizedCheckout-buttonPrimary-colorActive': WHITE,
    // Disabled: limestone rule under ink muted, as the storefront's disabled controls.
    'optimizedCheckout-buttonPrimary-colorDisabled': 'color-textSecondary',
    'optimizedCheckout-buttonPrimary-backgroundColorDisabled': 'color-greyLighter',
    // A transparent border shows the button's own fill, as stock.
    'optimizedCheckout-buttonPrimary-borderColorHover': TRANSPARENT,
    'optimizedCheckout-buttonPrimary-borderColorActive': TRANSPARENT,
    'optimizedCheckout-buttonPrimary-borderColorDisabled': TRANSPARENT,
    // Ink text, ink muted secondary text.
    'optimizedCheckout-headingPrimary-color': 'color-textHeading',
    'optimizedCheckout-headingSecondary-color': 'color-textHeading',
    'optimizedCheckout-contentPrimary-color': 'color-textBase',
    'optimizedCheckout-contentSecondary-color': 'color-textSecondary',
    'optimizedCheckout-header-textColor': 'color-textBase',
    'optimizedCheckout-form-textColor': 'form-label-font-color',
    'optimizedCheckout-formField-textColor': 'input-font-color',
    'optimizedCheckout-formChecklist-color': 'color-textBase',
    'optimizedCheckout-discountBanner-textColor': 'color-textBase',
    'optimizedCheckout-discountBanner-iconColor': 'color-textBase',
    // The toaster and the step numbers: ink with mist or white on it, as text on shale.
    'optimizedCheckout-loadingToaster-backgroundColor': 'color-textBase',
    'optimizedCheckout-loadingToaster-textColor': MIST,
    'optimizedCheckout-step-backgroundColor': 'color-textBase',
    'optimizedCheckout-step-textColor': WHITE,
    // Links as the storefront's: ink, ink muted on hover. The cart's coupon, gift certificate and
    // shipping estimate links read optimizedCheckout-link-color too (_cart.scss).
    'optimizedCheckout-link-color': 'color-textLink',
    'optimizedCheckout-link-hoverColor': 'color-textLink--hover',
    // The secondary (Edit) button, as button--default: ink on paper, the edge border, limestone
    // on hover and dry limestone on press.
    'optimizedCheckout-buttonSecondary-color': 'button--default-color',
    'optimizedCheckout-buttonSecondary-colorHover': 'button--default-colorHover',
    'optimizedCheckout-buttonSecondary-colorActive': 'button--default-colorActive',
    'optimizedCheckout-buttonSecondary-backgroundColor': WHITE,
    'optimizedCheckout-buttonSecondary-backgroundColorHover': 'body-bg',
    'optimizedCheckout-buttonSecondary-backgroundColorActive': 'container-fill-dark',
    'optimizedCheckout-buttonSecondary-borderColor': 'button--default-borderColor',
    'optimizedCheckout-buttonSecondary-borderColorHover': 'button--default-borderColorHover',
    'optimizedCheckout-buttonSecondary-borderColorActive': 'button--default-borderColorActive',
    // Fields and controls: paper with the edge border, ink when chosen, hook rust for errors.
    'optimizedCheckout-formField-backgroundColor': 'input-bg-color',
    'optimizedCheckout-formField-shadowColor': TRANSPARENT, // no inset shadow, as stock
    'optimizedCheckout-formField-borderColor': 'input-border-color',
    'optimizedCheckout-formField-inputControlColor': 'color-textBase',
    'optimizedCheckout-formField-errorColor': 'color-error',
    'optimizedCheckout-colorFocus': FOCUS_RING,
    // Lists, boxes and dividers: paper, limestone when chosen, limestone-rule lines, dry
    // limestone behind a discount.
    'optimizedCheckout-formChecklist-backgroundColor': WHITE,
    'optimizedCheckout-formChecklist-backgroundColorSelected': 'body-bg',
    'optimizedCheckout-formChecklist-borderColor': 'container-border-global-color-base',
    'optimizedCheckout-discountBanner-backgroundColor': 'container-fill-dark',
    'optimizedCheckout-orderSummary-backgroundColor': WHITE,
    'optimizedCheckout-orderSummary-borderColor': 'container-border-global-color-base',
    'optimizedCheckout-step-borderColor': 'container-border-global-color-base',
    'optimizedCheckout-header-borderColor': 'container-border-global-color-base',
    // The page and its header: limestone, the storefront's ground.
    'optimizedCheckout-header-backgroundColor': 'body-bg',
    'optimizedCheckout-body-backgroundColor': 'body-bg',
};

// Stock Cornerstone's checkout colours: its greys, and the blues the palette has no place for.
const STOCK_CHECKOUT_COLOURS = [
    '#333333', '#666666', '#757575', '#999999', '#cccccc', '#dddddd', '#e5e5e5', '#000000', '#f5f5f5',
    '#476bef', '#4496f6', '#002fe1', '#d14343',
];

// The background image: none, as stock.
const NO_BACKGROUND_IMAGE = {
    'optimizedCheckout-show-backgroundImage': false,
    'optimizedCheckout-backgroundImage': '',
    'optimizedCheckout-backgroundImage-size': '1000x400',
};
// The keys that wait for Shaun's answers (ticket 24's HITL), with the stock values they keep.
const ICON_KEYS = Object.keys(config.settings).filter(key => key.startsWith('show_accept_'));
const isWaitingKey = key => key.startsWith('show_accept_')
    || key === 'show_quick_payment_buttons'
    || key.startsWith('paymentbuttons-')
    || key.startsWith('checkout-paymentbuttons-');

const resolve = (settings, ref) => lower(ref.startsWith('#') || ref === TRANSPARENT ? ref : settings[ref]);

describe('the checkout button is the buy colour with a white label (DESIGN.md, the copper rule)', () => {
    it('is beadhead copper #9C4A22, deep copper #833D1B on hover and press, with a white label, on both variations', () => {
        forEachVariation((settings, name) => {
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-backgroundColor']), COPPER, name);
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-borderColor']), COPPER, name);
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-backgroundColorHover']), COPPER_DEEP, name);
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-backgroundColorActive']), COPPER_DEEP, name);
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-color']), WHITE, name);
        });
    });

    it('keeps its white label at AA in every state', () => {
        forEachVariation((settings, name) => {
            for (const state of ['', 'Hover', 'Active']) {
                const fg = settings[`optimizedCheckout-buttonPrimary-color${state}`];
                const bg = settings[`optimizedCheckout-buttonPrimary-backgroundColor${state}`];
                const ratio = contrast(hex(fg), hex(bg));
                assert.ok(ratio >= 4.5, `${name}: the ${state || 'resting'} button is ${fg} on ${bg}, ${ratio.toFixed(2)}:1`);
            }
        });
    });

    it('is never the storefront\'s ink primary button, nor master\'s sage: copper marks buying and nothing else', () => {
        forEachVariation((settings, name) => {
            for (const state of ['', 'Hover', 'Active']) {
                const bg = lower(settings[`optimizedCheckout-buttonPrimary-backgroundColor${state}`]);
                assert.notEqual(bg, lower(settings[`button--primary-backgroundColor${state}`]), `${name}: the checkout button isn't the storefront's ink button`);
                assert.ok(!['#5d705c', '#4f5f4e', '#435242', '#7b8e7a'].includes(bg), `${name}: no sage`);
            }
        });
    });
});

describe('every other checkout colour follows the storefront palette', () => {
    it('sets each checkout colour key to the storefront colour or token it follows', () => {
        forEachVariation((settings, name) => {
            for (const [key, ref] of Object.entries(FOLLOWS)) {
                assert.ok(key in settings, `${key} is a setting`);
                assert.equal(lower(settings[key]), resolve(settings, ref), `${name}: ${key} follows ${ref}`);
            }
        });
    });

    it('covers every checkout colour key ticket 24 owns', () => {
        const owned = Object.keys(config.settings).filter(key => key.startsWith('optimizedCheckout-')
            && /color/i.test(key)
            && key !== 'optimizedCheckout-formField-placeholderColor'); // ticket 25's
        assert.deepEqual(owned.filter(key => !(key in FOLLOWS)), [], 'each one is in FOLLOWS');
        assert.deepEqual(Object.keys(FOLLOWS).filter(key => !owned.includes(key)), [], 'and FOLLOWS names no key config.json lacks');
    });

    it('keeps none of stock Cornerstone\'s checkout greys and blues', () => {
        forEachVariation((settings, name) => {
            const stock = Object.entries(settings)
                .filter(([key, value]) => key.startsWith('optimizedCheckout-') && STOCK_CHECKOUT_COLOURS.includes(lower(value)))
                .map(([key, value]) => `${key}: ${value}`);
            assert.deepEqual(stock, [], name);
        });
    });

    it('rings focus with the storefront\'s focus ring, ink, not the stock blue', () => {
        forEachVariation((settings, name) => assert.equal(lower(settings['optimizedCheckout-colorFocus']), FOCUS_RING, name));
    });

    it('lays the checkout on limestone, the storefront\'s ground, with no background image', () => {
        forEachVariation((settings, name) => {
            assert.equal(lower(settings['optimizedCheckout-body-backgroundColor']), '#e9e4db', name);
            assert.equal(lower(settings['optimizedCheckout-header-backgroundColor']), '#e9e4db', name);
            assert.equal(lower(settings['body-bg']), '#e9e4db', `${name}: the storefront's ground`);
            for (const [key, value] of Object.entries(NO_BACKGROUND_IMAGE)) assert.equal(settings[key], value, `${name}: ${key}`);
        });
    });

    it('sets the checkout colours once, in the base settings, so both variations share them', () => {
        for (const variation of config.variations.filter(item => VARIATIONS.includes(item.name))) {
            const set = Object.keys(variation.settings).filter(key => key.startsWith('optimizedCheckout-'));
            assert.deepEqual(set, [], `${variation.name} sets no checkout key`);
        }
    });
});

describe('Archivo only (DESIGN.md "Typography")', () => {
    const fontKeys = Object.keys(config.settings).filter(key => /^optimizedCheckout-.*-font$/.test(key));

    it('sets every checkout font key to the self-hosted Archivo, in its three cuts, on both variations', () => {
        assert.equal(fontKeys.length, 7, 'the seven checkout font keys');
        forEachVariation((settings, name) => {
            for (const key of fontKeys) assert.match(settings[key], /^Archivo(\+Expanded)?_\d{3}$/, `${name}: ${key}`);
            for (const key of ['optimizedCheckout-headingPrimary-font', 'optimizedCheckout-headingSecondary-font']) assert.equal(settings[key], 'Archivo+Expanded_780', `${name}: ${key}`);
            for (const key of ['optimizedCheckout-contentPrimary-font', 'optimizedCheckout-contentSecondary-font']) assert.equal(settings[key], 'Archivo_400', `${name}: ${key}`);
            for (const key of ['optimizedCheckout-buttonPrimary-font', 'optimizedCheckout-buttonSecondary-font', 'optimizedCheckout-link-font']) assert.equal(settings[key], 'Archivo_650', `${name}: ${key}`);
        });
    });

    it('asks Google Fonts for nothing on the checkout, so no Karla, Montserrat or Onest', () => {
        forEachVariation((settings, name) => {
            for (const key of fontKeys) assert.doesNotMatch(settings[key], /^Google_|Karla|Montserrat|Onest/, `${name}: ${key}`);
        });
    });

    it('loads Archivo\'s @font-face in the one stylesheet the checkout reads', () => {
        assert.match(read('templates/pages/checkout.html'), /stylesheet '\/assets\/css\/optimized-checkout\.css'/);
        assert.match(read('assets/scss/optimized-checkout.scss'), /^@import "reelflies\/fonts";/m);
        assert.match(read('assets/scss/reelflies/_fonts.scss'), /font-family:\s*["']?Archivo/);
    });
});

describe('the checkout logo: the current 133x95 PNG until ticket 14\'s master (decision 17)', () => {
    it('uploads no checkout-only logo, so the checkout shows the channel\'s store logo', () => {
        // With no custom checkout logo, checkout.header_image is the store's logo (Storefront >
        // Logo), which on ReelFlies_CA is the 133x95 PNG. Swap the store logo, or set "custom" here
        // with the uploaded master, when ticket 14 delivers it.
        forEachVariation((settings, name) => {
            assert.equal(settings['optimizedCheckout-show-logo'], 'none', name);
            assert.equal(settings['optimizedCheckout-logo'], '', name);
        });
    });

    it('fits the 133x95 PNG in the logo box without scaling it up', () => {
        forEachVariation((settings, name) => {
            const [width, height] = settings['optimizedCheckout-logo-size'].split('x').map(Number);
            assert.ok(width >= 133 && height >= 95, `${name}: ${settings['optimizedCheckout-logo-size']}`);
        });
    });

    it('relies on the stock checkout template, which shows header_image or else the store name', () => {
        const template = read('templates/pages/checkout.html');
        assert.match(template, /\{\{#if checkout\.header_image\}\}/);
        assert.match(template, /src="\{\{ checkout\.header_image \}\}"/);
        assert.match(template, /alt="\{\{settings\.store_logo\.title\}\}"/);
    });
});

describe('the keys that wait for Shaun\'s answers keep their stock values', () => {
    it('shows no payment icon until he says what each channel accepts', () => {
        assert.equal(ICON_KEYS.length, 8, 'the eight show_accept_* keys');
        forEachVariation((settings, name) => {
            for (const key of ICON_KEYS) assert.equal(settings[key], false, `${name}: ${key}`);
        });
    });

    it('leaves the quick payment buttons as they are live on ReelFlies_CA (on)', () => {
        forEachVariation((settings, name) => assert.equal(settings.show_quick_payment_buttons, true, name));
    });

    it('sets none of them in either variation yet', () => {
        for (const variation of config.variations.filter(item => VARIATIONS.includes(item.name))) {
            assert.deepEqual(Object.keys(variation.settings).filter(isWaitingKey), [], variation.name);
        }
    });
});
