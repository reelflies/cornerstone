// Ticket 24's theme part of the checkout. BigCommerce's Optimized One-Page Checkout is branded
// through Theme Styles settings only (spec, Out of Scope), so these tests hold config.json's
// checkout keys: the base settings, which both variations share, as each variation resolves them.
//
// - The buy colour on the checkout button, with a white label (ticket 13, decision 6; eval O01).
// - The storefront's ink, dun, edge and tile on everything else, so the checkout keeps none of
//   stock Cornerstone's greys and blues (spec, "Look").
// - Onest only (decision 7; eval O02). Ticket 25 owns the font keys and set them; this checks the
//   checkout keeps them.
// - The logo: the current 133x95 PNG until ticket 14's master (decision 17), through the store
//   logo the checkout falls back to.
// - The keys that wait for Shaun's answers (ticket 24's HITL): the payment icons, the quick
//   payment buttons, the wallet buttons and the checkout background. They keep their stock values
//   until he answers, and no variation sets them.
//
// Ticket 25 owns the font keys and optimizedCheckout-formField-placeholderColor (build pipeline,
// section 6.3); ticket 24 owns every other optimizedCheckout-* key. scripts/check-contrast.mjs
// checks the colour pairs.
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
const BUY = '#5d705c';
const WHITE = '#ffffff';
const TRANSPARENT = 'transparent';

const hex = value => [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16));
const lower = value => String(value).toLowerCase();
const forEachVariation = check => VARIATIONS.forEach(name => check(effectiveSettings(config, name), name));

// Each checkout colour key and the storefront key (or literal) it follows. The checkout reads only
// optimized-checkout.css, so it can't share the storefront's keys; these keep it on the palette.
const FOLLOWS = {
    // The checkout button: the buy colour (decision 6), as button--primary on the storefront.
    'optimizedCheckout-buttonPrimary-backgroundColor': 'button--primary-backgroundColor',
    'optimizedCheckout-buttonPrimary-backgroundColorHover': 'button--primary-backgroundColorHover',
    'optimizedCheckout-buttonPrimary-backgroundColorActive': 'button--primary-backgroundColorActive',
    'optimizedCheckout-buttonPrimary-borderColor': 'button--primary-backgroundColor',
    'optimizedCheckout-buttonPrimary-color': 'button--primary-color',
    'optimizedCheckout-buttonPrimary-colorHover': 'button--primary-colorHover',
    'optimizedCheckout-buttonPrimary-colorActive': 'button--primary-colorActive',
    'optimizedCheckout-buttonPrimary-colorDisabled': WHITE,
    'optimizedCheckout-buttonPrimary-backgroundColorDisabled': 'color-greyLighter',
    // A transparent border shows the button's own fill, as stock.
    'optimizedCheckout-buttonPrimary-borderColorHover': TRANSPARENT,
    'optimizedCheckout-buttonPrimary-borderColorActive': TRANSPARENT,
    'optimizedCheckout-buttonPrimary-borderColorDisabled': TRANSPARENT,
    // Ink text, dun secondary text (spec, "Look").
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
    'optimizedCheckout-loadingToaster-backgroundColor': 'color-textBase',
    'optimizedCheckout-loadingToaster-textColor': WHITE,
    'optimizedCheckout-step-backgroundColor': 'color-textSecondary',
    'optimizedCheckout-step-textColor': WHITE,
    // Links as the storefront's: ink, dun on hover. The cart's coupon, gift certificate and
    // shipping estimate links read optimizedCheckout-link-color too (_cart.scss).
    'optimizedCheckout-link-color': 'color-textLink',
    'optimizedCheckout-link-hoverColor': 'color-textLink--hover',
    // The secondary (Edit) button, as button--default: ink on white, edge border, tile on hover.
    'optimizedCheckout-buttonSecondary-color': 'button--default-color',
    'optimizedCheckout-buttonSecondary-colorHover': 'button--default-colorHover',
    'optimizedCheckout-buttonSecondary-colorActive': 'button--default-colorActive',
    'optimizedCheckout-buttonSecondary-backgroundColor': WHITE,
    'optimizedCheckout-buttonSecondary-backgroundColorHover': 'container-fill-dark',
    'optimizedCheckout-buttonSecondary-backgroundColorActive': 'container-border-global-color-base',
    'optimizedCheckout-buttonSecondary-borderColor': 'button--default-borderColor',
    'optimizedCheckout-buttonSecondary-borderColorHover': 'button--default-borderColorHover',
    'optimizedCheckout-buttonSecondary-borderColorActive': 'button--default-borderColorActive',
    // Fields and controls: the edge border (3:1), ink when chosen (spec: "selected states").
    'optimizedCheckout-formField-backgroundColor': 'input-bg-color',
    'optimizedCheckout-formField-shadowColor': TRANSPARENT, // no inset shadow, as stock
    'optimizedCheckout-formField-borderColor': 'input-border-color',
    'optimizedCheckout-formField-inputControlColor': 'color-textBase',
    'optimizedCheckout-formField-errorColor': 'color-error',
    'optimizedCheckout-colorFocus': FOCUS_RING,
    // Lists, boxes and dividers: white, tile when chosen, tile-2 lines.
    'optimizedCheckout-formChecklist-backgroundColor': WHITE,
    'optimizedCheckout-formChecklist-backgroundColorSelected': 'container-fill-dark',
    'optimizedCheckout-formChecklist-borderColor': 'container-border-global-color-base',
    'optimizedCheckout-discountBanner-backgroundColor': 'container-fill-dark',
    'optimizedCheckout-orderSummary-backgroundColor': WHITE,
    'optimizedCheckout-orderSummary-borderColor': 'container-border-global-color-base',
    'optimizedCheckout-step-borderColor': 'container-border-global-color-base',
    'optimizedCheckout-header-borderColor': 'container-border-global-color-base',
};

// Stock Cornerstone's checkout colours: its greys, and the blues the palette has no place for.
const STOCK_CHECKOUT_COLOURS = [
    '#333333', '#666666', '#757575', '#999999', '#cccccc', '#dddddd', '#e5e5e5', '#000000',
    '#476bef', '#4496f6', '#002fe1', '#d14343',
];

// The keys that wait for Shaun's answers (ticket 24's HITL), with the stock values they keep.
const WAITING_BACKGROUND = {
    'optimizedCheckout-show-backgroundImage': false,
    'optimizedCheckout-backgroundImage': '',
    'optimizedCheckout-backgroundImage-size': '1000x400',
    'optimizedCheckout-header-backgroundColor': '#f5f5f5',
    'optimizedCheckout-body-backgroundColor': WHITE,
};
const ICON_KEYS = Object.keys(config.settings).filter(key => key.startsWith('show_accept_'));
const isWaitingKey = key => key in WAITING_BACKGROUND
    || key.startsWith('show_accept_')
    || key === 'show_quick_payment_buttons'
    || key.startsWith('paymentbuttons-')
    || key.startsWith('checkout-paymentbuttons-');

const resolve = (settings, ref) => lower(ref.startsWith('#') || ref === TRANSPARENT ? ref : settings[ref]);

describe('the checkout button is the buy colour with a white label (decision 6)', () => {
    it('is sage #5D705C, with a white label, on both variations', () => {
        forEachVariation((settings, name) => {
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-backgroundColor']), BUY, name);
            assert.equal(lower(settings['optimizedCheckout-buttonPrimary-borderColor']), BUY, name);
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

    it('never puts the brand sage #7B8E7A behind white text (3.5:1)', () => {
        forEachVariation((settings, name) => {
            for (const state of ['', 'Hover', 'Active']) {
                assert.notEqual(lower(settings[`optimizedCheckout-buttonPrimary-backgroundColor${state}`]), '#7b8e7a', name);
            }
        });
    });
});

describe('every other checkout colour follows the storefront palette', () => {
    it('sets each checkout colour key to the storefront colour it follows', () => {
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
            && key !== 'optimizedCheckout-formField-placeholderColor' // ticket 25's
            && !(key in WAITING_BACKGROUND));
        assert.deepEqual(owned.filter(key => !(key in FOLLOWS)), [], 'each one is in FOLLOWS');
    });

    it('keeps none of stock Cornerstone\'s checkout greys and blues', () => {
        forEachVariation((settings, name) => {
            const stock = Object.entries(settings)
                .filter(([key, value]) => key.startsWith('optimizedCheckout-') && !(key in WAITING_BACKGROUND)
                    && STOCK_CHECKOUT_COLOURS.includes(lower(value)))
                .map(([key, value]) => `${key}: ${value}`);
            assert.deepEqual(stock, [], name);
        });
    });

    it('rings focus with the storefront\'s focus ring, not the stock blue', () => {
        forEachVariation((settings, name) => assert.equal(lower(settings['optimizedCheckout-colorFocus']), FOCUS_RING, name));
    });

    it('sets the checkout colours once, in the base settings, so both variations share them', () => {
        for (const variation of config.variations.filter(item => VARIATIONS.includes(item.name))) {
            const set = Object.keys(variation.settings).filter(key => key.startsWith('optimizedCheckout-'));
            assert.deepEqual(set, [], `${variation.name} sets no checkout key`);
        }
    });
});

describe('Onest only (decision 7)', () => {
    const fontKeys = Object.keys(config.settings).filter(key => /^optimizedCheckout-.*-font$/.test(key));

    it('sets every checkout font key to the self-hosted Onest, on both variations', () => {
        assert.equal(fontKeys.length, 7, 'the seven checkout font keys');
        forEachVariation((settings, name) => {
            for (const key of fontKeys) assert.match(settings[key], /^Onest_(400|500|600)$/, `${name}: ${key}`);
        });
    });

    it('asks Google Fonts for nothing on the checkout, so no Karla or Montserrat', () => {
        forEachVariation((settings, name) => {
            for (const key of fontKeys) assert.doesNotMatch(settings[key], /^Google_|Karla|Montserrat/, `${name}: ${key}`);
        });
    });

    it('loads Onest\'s @font-face in the one stylesheet the checkout reads', () => {
        assert.match(read('templates/pages/checkout.html'), /stylesheet '\/assets\/css\/optimized-checkout\.css'/);
        assert.match(read('assets/scss/optimized-checkout.scss'), /^@import "reelflies\/fonts";/m);
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
        assert.equal(ICON_KEYS.length, 8, 'config.json:98-105');
        forEachVariation((settings, name) => {
            for (const key of ICON_KEYS) assert.equal(settings[key], false, `${name}: ${key}`);
        });
    });

    it('leaves the quick payment buttons as they are live on ReelFlies_CA (on)', () => {
        forEachVariation((settings, name) => assert.equal(settings.show_quick_payment_buttons, true, name));
    });

    it('keeps the checkout background stock: a #F5F5F5 header, a white page and no image', () => {
        forEachVariation((settings, name) => {
            for (const [key, value] of Object.entries(WAITING_BACKGROUND)) assert.equal(settings[key], value, `${name}: ${key}`);
        });
    });

    it('sets none of them in either variation yet', () => {
        for (const variation of config.variations.filter(item => VARIATIONS.includes(item.name))) {
            assert.deepEqual(Object.keys(variation.settings).filter(isWaitingKey), [], variation.name);
        }
    });
});
