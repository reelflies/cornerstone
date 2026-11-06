#!/usr/bin/env node
// Checks WCAG 2 contrast for the key Theme Styles colour pairs in a theme config.
//
//   node scripts/check-contrast.mjs [config.json ...]
//
// Each variation is checked as the storefront sees it: base settings with the
// variation's settings on top. This works on the repo's config.json, on a
// config pulled with `stencil pull -s`, which writes live values into the
// matching variation, and on release.sh's capture of a channel
// (config.<slug>.live.json). Text needs 4.5:1 and UI parts 3:1.
//
// Exits 1 when a pair fails and isn't listed in KNOWN_FAILURES, and 2 when a
// colour can't be read. scripts/release.mjs imports checkContrast to report on
// the live capture after step 1, where a failure warns and doesn't stop.

import fs from 'fs';
import { isMain } from './lib/is-main.mjs';

const TEXT = 4.5;
const UI = 3;

// The Streamside Stone colours Theme Styles has no keys for, from assets/scss/reelflies/_settings.scss
// (DESIGN.md); check-contrast.test.mjs keeps these in step with it. The focus ring is ink on the
// light grounds and mist on shale and moss (_foundation.scss's --rf-ring), over the stock #0f7fff
// ring (assets/scss/tools/_theme_focus.scss:7).
export const FOCUS_RING = '#1c1916'; // $rf-ink
export const FOCUS_RING_DARK = '#ebe4d8'; // $rf-mist
// The dark grounds: shale-900, the lighter of the two shales the stone bands stand on (the footer's
// is footer-backgroundColor, shale-950), and moss for the species band.
export const SHALE = '#29241f'; // $rf-shale-900
export const MOSS = '#3b4628'; // $rf-moss-700
// Text on shale: mist for text and links, shale-400 for headings and fine print.
export const SHALE_TEXT = '#ebe4d8'; // $rf-mist
export const SHALE_MUTED = '#958a7d'; // $rf-shale-400

// [id, foreground, background, minimum]. A value starting with # is a literal
// colour; anything else is a config.json settings key.
export const PAIRS = [
    ['body-text', 'color-textBase', 'body-bg', TEXT],
    ['heading', 'color-textHeading', 'body-bg', TEXT],
    ['link', 'color-textLink', 'body-bg', TEXT],
    ['secondary-text', 'color-textSecondary', 'body-bg', TEXT],
    ['error-text', 'color-error', 'body-bg', TEXT],
    ['success-text', 'color-success', 'body-bg', TEXT],
    ['header-nav', 'navPages-color', 'header-backgroundColor', TEXT],
    ['header-user-nav', 'navUser-color', 'header-backgroundColor', TEXT],
    ['submenu-text', 'navPages-color', 'navPages-subMenu-backgroundColor', TEXT],
    ['submenu-hover', 'navPages-color-hover', 'navPages-subMenu-backgroundColor', TEXT],
    ['quick-search-text', 'color-textBase', 'dropdown--quickSearch-backgroundColor', TEXT],
    ['quick-search-secondary', 'color-textSecondary', 'dropdown--quickSearch-backgroundColor', TEXT],
    ['button-primary', 'button--primary-color', 'button--primary-backgroundColor', TEXT],
    ['button-primary-hover', 'button--primary-colorHover', 'button--primary-backgroundColorHover', TEXT],
    ['button-default', 'button--default-color', 'body-bg', TEXT],
    ['card-title', 'card-title-color', 'body-bg', TEXT],
    ['form-label', 'form-label-font-color', 'body-bg', TEXT],
    ['input-text', 'input-font-color', 'input-bg-color', TEXT],
    ['sale-badge', 'color_text_product_sale_badges', 'color_badge_product_sale_badges', TEXT],
    ['sold-out-badge', 'color_text_product_sold_out_badges', 'color_badge_product_sold_out_badges', TEXT],
    ['order-status-label', 'label-color', 'label-backgroundColor', TEXT],
    ['play-pause-text', 'carousel-play-pause-button-textColor', 'carousel-play-pause-button-bgColor', TEXT],
    ['blockquote-cite', 'blockquote-cite-font-color', 'body-bg', TEXT],
    ['featured-promotion', 'color_text_featured_promotions', 'color_bg_featured_promotions', TEXT],
    ['checkout-text', 'optimizedCheckout-contentPrimary-color', 'optimizedCheckout-body-backgroundColor', TEXT],
    ['checkout-secondary', 'optimizedCheckout-contentSecondary-color', 'optimizedCheckout-body-backgroundColor', TEXT],
    ['checkout-button', 'optimizedCheckout-buttonPrimary-color', 'optimizedCheckout-buttonPrimary-backgroundColor', TEXT],
    ['checkout-input', 'optimizedCheckout-formField-textColor', 'optimizedCheckout-formField-backgroundColor', TEXT],
    ['checkout-placeholder', 'optimizedCheckout-formField-placeholderColor', 'optimizedCheckout-formField-backgroundColor', TEXT],
    ['checkout-error', 'optimizedCheckout-formField-errorColor', 'optimizedCheckout-body-backgroundColor', TEXT],
    ['checkout-link', 'optimizedCheckout-link-color', 'optimizedCheckout-body-backgroundColor', TEXT],
    // Ticket 24: the rest of the checkout's text, each on the ground optimized-checkout.scss draws it on.
    ['checkout-heading', 'optimizedCheckout-headingPrimary-color', 'optimizedCheckout-body-backgroundColor', TEXT],
    ['checkout-heading-secondary', 'optimizedCheckout-headingSecondary-color', 'optimizedCheckout-body-backgroundColor', TEXT],
    ['checkout-header-text', 'optimizedCheckout-header-textColor', 'optimizedCheckout-header-backgroundColor', TEXT],
    ['checkout-button-hover', 'optimizedCheckout-buttonPrimary-colorHover', 'optimizedCheckout-buttonPrimary-backgroundColorHover', TEXT],
    ['checkout-button-active', 'optimizedCheckout-buttonPrimary-colorActive', 'optimizedCheckout-buttonPrimary-backgroundColorActive', TEXT],
    ['checkout-button-secondary', 'optimizedCheckout-buttonSecondary-color', 'optimizedCheckout-buttonSecondary-backgroundColor', TEXT],
    ['checkout-button-secondary-hover', 'optimizedCheckout-buttonSecondary-colorHover', 'optimizedCheckout-buttonSecondary-backgroundColorHover', TEXT],
    ['checkout-label', 'optimizedCheckout-form-textColor', 'optimizedCheckout-body-backgroundColor', TEXT],
    ['checkout-checklist', 'optimizedCheckout-formChecklist-color', 'optimizedCheckout-formChecklist-backgroundColor', TEXT],
    ['checkout-checklist-selected', 'optimizedCheckout-formChecklist-color', 'optimizedCheckout-formChecklist-backgroundColorSelected', TEXT],
    ['checkout-step', 'optimizedCheckout-step-textColor', 'optimizedCheckout-step-backgroundColor', TEXT],
    ['checkout-discount', 'optimizedCheckout-discountBanner-textColor', 'optimizedCheckout-discountBanner-backgroundColor', TEXT],
    ['checkout-toaster', 'optimizedCheckout-loadingToaster-textColor', 'optimizedCheckout-loadingToaster-backgroundColor', TEXT],
    ['checkout-link-hover', 'optimizedCheckout-link-hoverColor', 'optimizedCheckout-body-backgroundColor', TEXT],
    // The dark grounds (_foundation.scss): the footer on shale-950, the stone bands on shale-900,
    // the species band on moss. The Subscribe button is mist with a shale-950 label, paper on hover.
    ['footer-text', SHALE_TEXT, 'footer-backgroundColor', TEXT],
    ['footer-heading', SHALE_MUTED, 'footer-backgroundColor', TEXT],
    ['footer-subscribe', 'footer-backgroundColor', SHALE_TEXT, TEXT],
    ['footer-subscribe-hover', 'footer-backgroundColor', 'container-fill-base', TEXT],
    ['shale-text', SHALE_TEXT, SHALE, TEXT],
    ['shale-muted', SHALE_MUTED, SHALE, TEXT],
    ['moss-text', SHALE_TEXT, MOSS, TEXT],
    ['focus-ring', FOCUS_RING, 'body-bg', UI],
    ['focus-ring-on-paper', FOCUS_RING, 'container-fill-base', UI],
    ['focus-ring-on-shale', FOCUS_RING_DARK, SHALE, UI],
    ['focus-ring-on-moss', FOCUS_RING_DARK, MOSS, UI],
    ['focus-ring-on-footer', FOCUS_RING_DARK, 'footer-backgroundColor', UI],
    ['footer-input-border', 'input-border-color', 'footer-backgroundColor', UI],
    ['checkout-focus', 'optimizedCheckout-colorFocus', 'optimizedCheckout-body-backgroundColor', UI],
    ['checkout-input-border', 'optimizedCheckout-formField-borderColor', 'optimizedCheckout-formField-backgroundColor', UI],
    ['checkout-control', 'optimizedCheckout-formField-inputControlColor', 'optimizedCheckout-formField-backgroundColor', UI],
    ['input-border', 'input-border-color', 'input-bg-color', UI],
    ['carousel-arrow', 'carousel-arrow-color', 'carousel-arrow-bgColor', UI],
];

// Failures allowed for now, by variation name. They are reported but don't fail the check.
// Remove an entry once the skin fixes it; a variation not listed here gets no allowances, so
// every failure in it counts. The Streamside Stone palette clears every pair, so no
// ReelFlies variation has any.
export const KNOWN_FAILURES = {};

function parseHex(value) {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(String(value).trim());
    if (!match) return null;
    let hex = match[1];
    if (hex.length === 3) hex = hex.replace(/./g, c => c + c);
    if (hex.length === 8) {
        if (hex.slice(6).toLowerCase() !== 'ff') return null; // can't judge a translucent colour without its backdrop
        hex = hex.slice(0, 6);
    }
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}

function luminance(rgb) {
    const [r, g, b] = rgb.map(c => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(fg, bg) {
    const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
    return (hi + 0.05) / (lo + 0.05);
}

function resolve(ref, settings) {
    const value = ref.startsWith('#') ? ref : settings[ref];
    if (value === undefined) return { error: `missing setting ${ref}` };
    if (value === 'transparent') return { skip: `${ref} is transparent` };
    const rgb = parseHex(value);
    return rgb ? { value, rgb } : { error: `can't read ${ref}: ${value}` };
}

// Returns the pair's status and, unless it simply passes, a line to report.
function checkPair([id, fgRef, bgRef, min], settings, known) {
    const fg = resolve(fgRef, settings);
    const bg = resolve(bgRef, settings);
    if (fg.error || bg.error) return { status: 'unreadable', line: `ERROR    ${id}: ${fg.error || bg.error}` };
    if (fg.skip || bg.skip) return { status: 'skipped', line: `skipped  ${id}: ${fg.skip || bg.skip}` };

    const ratio = contrast(fg.rgb, bg.rgb);
    const isKnown = known.includes(id);
    if (ratio >= min) {
        return { status: 'pass', line: isKnown ? `FIXED    ${id}: ${ratio.toFixed(2)}:1, remove it from KNOWN_FAILURES` : null };
    }
    const detail = `${id}: ${fg.value} on ${bg.value} is ${ratio.toFixed(2)}:1, needs ${min}:1 (${fgRef} on ${bgRef})`;
    return isKnown ? { status: 'known', line: `known    ${detail}` } : { status: 'fail', line: `FAIL     ${detail}` };
}

// Prints each variation's result. Returns { unexpected, unreadable }: the counts of failing pairs
// that KNOWN_FAILURES doesn't list, and of pairs whose colours can't be read.
export function checkContrast(path) {
    const config = JSON.parse(fs.readFileSync(path, 'utf8'));
    const variations = config.variations?.length ? config.variations : [{ name: 'base', settings: {} }];
    let unexpected = 0;
    let unreadable = 0;

    for (const variation of variations) {
        const settings = { ...config.settings, ...variation.settings };
        const known = KNOWN_FAILURES[variation.name] || [];
        const results = PAIRS.map(pair => checkPair(pair, settings, known));
        const count = status => results.filter(result => result.status === status).length;

        unexpected += count('fail');
        unreadable += count('unreadable');
        console.log(`${path} · ${variation.name}: ${count('pass')}/${PAIRS.length} pass`);
        results.filter(result => result.line).forEach(result => console.log(`  ${result.line}`));
    }
    return { unexpected, unreadable };
}

if (isMain(import.meta.url)) {
    const paths = process.argv.slice(2);
    let unexpected = 0;
    let unreadable = 0;
    for (const path of paths.length ? paths : ['config.json']) {
        const result = checkContrast(path);
        unexpected += result.unexpected;
        unreadable += result.unreadable;
    }
    if (unreadable) {
        console.error(`\n${unreadable} colour pair(s) couldn't be read.`);
        process.exit(2);
    }
    if (unexpected) {
        console.error(`\n${unexpected} pair(s) below WCAG contrast. Fix the colours, or add them to KNOWN_FAILURES with a reason.`);
        process.exit(1);
    }
}
