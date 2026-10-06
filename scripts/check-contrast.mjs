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

// Hard-coded in assets/scss/tools/_theme_focus.scss:7, not a Theme Styles setting.
// Update it when the skin overrides the focus ring.
const FOCUS_RING = '#0f7fff';

// [id, foreground, background, minimum]. A value starting with # is a literal
// colour; anything else is a config.json settings key.
const PAIRS = [
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
    ['focus-ring', FOCUS_RING, 'body-bg', UI],
    ['checkout-focus', 'optimizedCheckout-colorFocus', 'optimizedCheckout-body-backgroundColor', UI],
    ['input-border', 'input-border-color', 'input-bg-color', UI],
    ['carousel-arrow', 'carousel-arrow-color', 'carousel-arrow-bgColor', UI],
];

// Failures allowed for now, by variation name. They are reported but don't fail
// the check. Remove an entry once the skin fixes it; a variation not listed here
// gets no allowances, so every failure in it counts.
//
// Both ReelFlies variations still inherit Cornerstone Light's palette from the
// base settings, so they carry Light's stock failures until the skin sets the
// ReelFlies colours (after the ticket 12 sign-off). The skin must empty this list.
const LIGHT_PLACEHOLDER_FAILURES = ['submenu-hover', 'quick-search-secondary', 'sale-badge', 'sold-out-badge', 'order-status-label', 'play-pause-text', 'blockquote-cite', 'checkout-placeholder'];
const KNOWN_FAILURES = {
    'ReelFlies CA': LIGHT_PLACEHOLDER_FAILURES,
    'ReelFlies US': LIGHT_PLACEHOLDER_FAILURES,
};

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
